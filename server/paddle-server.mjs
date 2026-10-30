// ═══════════════════════════════════════════════════════════════
//  PADDLE WEBHOOK + MANAGEMENT SERVER
//  Day of the Undead — access provisioning after payments,
//  cancellations, pauses and refunds.
//
//  Run:  node server/paddle-server.mjs        (port 8787)
//  Point Paddle → Developer tools → Notifications at:
//        https://YOUR-HOST/api/paddle/webhook
// ═══════════════════════════════════════════════════════════════

import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { PADDLE, API_BASE, SERVER_PORT, DATA_FILE, LOG_FILE } from "./paddleConfig.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Paddle-Signature",
  "Access-Control-Max-Age": "86400",
};

// ── Tiny JSON persistence (swap for Postgres/Redis in production) ──
async function ensureStore() {
  for (const file of [DATA_FILE, LOG_FILE]) {
    try { await mkdir(dirname(file), { recursive: true }); } catch { /* ignore */ }
    try { await readFile(file, "utf8"); } catch { await writeFile(file, "[]", "utf8"); }
  }
}

async function readStore(file) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return []; }
}

async function writeStore(file, data) {
  try { await writeFile(file, JSON.stringify(data.slice(-500), null, 2), "utf8"); } catch { /* ignore */ }
}

// ── SSE: push entitlement changes to every open browser tab ──
const sseClients = new Set();

function broadcast(type, payload) {
  const frame = `data: ${JSON.stringify({ type, payload, ts: Date.now() })}\n\n`;
  for (const res of sseClients) {
    try { res.write(frame); } catch { sseClients.delete(res); }
  }
}

// ── Webhook signature verification (Paddle-Signature) ──
function verifySignature(rawBody, header) {
  if (!header) return { ok: false, reason: "missing Paddle-Signature header" };
  const parts = Object.fromEntries(
    header.split(";").map((p) => p.split("=")).filter(([, v]) => v !== undefined),
  );
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return { ok: false, reason: "malformed signature header" };

  // Reject replayed events older than 5 minutes
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (age > 300) return { ok: false, reason: `signature too old (${Math.round(age)}s)` };

  const signed = `${ts}:${rawBody}`;
  const expected = createHmac("sha256", PADDLE.webhookSecret).update(signed).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(h1, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature mismatch" };
  }
  return { ok: true };
}

// ── Entitlement state machine (server mirror of the client store) ──
function planKeyFromEvent(data) {
  const items = data?.items ?? data?.transaction?.items ?? data?.subscription?.items ?? [];
  return items.map((i) => i?.price?.id ?? i?.price_id).filter(Boolean);
}

function entitlementKey(data) {
  const subId = data?.id?.startsWith?.("sub_") ? data.id : data?.subscription_id ?? data?.subscription?.id;
  const txId = data?.id?.startsWith?.("txn_") ? data.id : data?.transaction_id ?? data?.transaction?.id;
  return subId ?? txId ?? null;
}

async function applyEvent(event) {
  const store = await readStore(DATA_FILE);
  const data = event.data ?? {};
  const key = entitlementKey(data);
  const type = event.event_type;
  let summary = null;

  const idx = key ? store.findIndex((e) => e.key === key) : -1;
  const existing = idx >= 0 ? store[idx] : null;

  const base = existing ?? {
    key,
    priceIds: planKeyFromEvent(data),
    customerId: data?.customer_id ?? data?.customer?.id,
    customerEmail: data?.customer?.email,
    currency: data?.currency_code ?? "BRL",
    startsAt: Date.now(),
  };

  switch (type) {
    case "transaction.completed":
    case "transaction.paid": {
      const total = parseInt(data?.details?.totals?.grand_total ?? "0", 10);
      Object.assign(base, {
        status: "active",
        transactionId: data?.id ?? data?.transaction?.id,
        subscriptionId: data?.subscription_id ?? data?.subscription?.id ?? base.subscriptionId,
        amountMinor: total || base.amountMinor || 0,
        paidAt: Date.now(),
        currentPeriodEnd: parseIso(data?.billing_period?.ends_at) ?? base.currentPeriodEnd,
      });
      summary = `Pagamento aprovado (${(total / 100).toFixed(2)} BRL)`;
      break;
    }

    case "transaction.payment_failed": {
      if (!existing) return { store, summary: null };
      Object.assign(base, { status: "past_due", updatedAt: Date.now() });
      summary = "Pagamento recusado — acesso suspenso";
      break;
    }

    case "subscription.activated":
    case "subscription.started": {
      Object.assign(base, {
        status: data?.status === "trialing" ? "trialing" : "active",
        subscriptionId: data?.id,
        currentPeriodEnd: parseIso(data?.current_billing_period?.ends_at),
        scheduledEndAt: null,
      });
      summary = "Assinatura ativada — acesso concedido";
      break;
    }

    case "subscription.trialing": {
      Object.assign(base, { status: "trialing", currentPeriodEnd: parseIso(data?.current_billing_period?.ends_at) });
      summary = "Trial iniciado";
      break;
    }

    case "subscription.updated": {
      Object.assign(base, {
        currentPeriodEnd: parseIso(data?.current_billing_period?.ends_at) ?? base.currentPeriodEnd,
        updatedAt: Date.now(),
      });
      const change = data?.scheduled_change;
      if (change?.type === "cancel") {
        base.scheduledEndAt = parseIso(change.effective_from) ?? base.currentPeriodEnd;
        base.status = "expiring";
        summary = "Cancelamento agendado para o fim do período";
      } else {
        summary = "Assinatura atualizada";
      }
      break;
    }

    case "subscription.paused": {
      Object.assign(base, { status: "paused", pausedAt: Date.now() });
      summary = "Assinatura pausada — benefícios suspensos";
      break;
    }

    case "subscription.resumed": {
      Object.assign(base, { status: "active", pausedAt: null, currentPeriodEnd: parseIso(data?.current_billing_period?.ends_at) });
      summary = "Assinatura retomada — acesso restaurado";
      break;
    }

    case "subscription.past_due": {
      Object.assign(base, { status: "past_due", updatedAt: Date.now() });
      summary = "Cobrança em atraso (dunning)";
      break;
    }

    case "subscription.canceled": {
      const effectiveFrom = data?.scheduled_change?.effective_from ?? data?.effective_from ?? "immediately";
      if (effectiveFrom === "end_of_term") {
        Object.assign(base, {
          status: "expiring",
          canceledAt: Date.now(),
          scheduledEndAt: base.currentPeriodEnd ?? Date.now(),
          cancelReason: data?.scheduled_change?.reason ?? "customer",
        });
        summary = "Cancelamento agendado — acesso mantém-se até o fim do período";
      } else {
        Object.assign(base, { status: "canceled", canceledAt: Date.now(), scheduledEndAt: Date.now() });
        summary = "Assinatura cancelada — acesso revogado imediatamente";
      }
      break;
    }

    case "subscription.expired": {
      Object.assign(base, { status: "expired", updatedAt: Date.now() });
      summary = "Assinatura expirada";
      break;
    }

    case "adjustment.created":
    case "adjustment.updated": {
      if ((data?.action ?? "refund") !== "refund") return { store, summary: null };
      const amount = parseInt(data?.items?.[0]?.amount ?? data?.amount ?? "0", 10);
      const target = store.find((e) => e.transactionId === data?.transaction_id) ?? existing;
      if (!target) return { store, summary: null };
      target.status = "refunded";
      target.refundedAmount = (target.refundedAmount ?? 0) + (amount || target.amountMinor || 0);
      target.refundedAt = Date.now();
      target.refundReason = data?.reason ?? "refund";
      summary = amount >= (target.amountMinor || 0)
        ? "Reembolso total — acesso revogado"
        : `Reembolso parcial de ${(amount / 100).toFixed(2)} BRL`;
      break;
    }

    default:
      return { store, summary: null };
  }

  base.updatedAt = Date.now();
  base.lastEvent = type;
  if (idx >= 0) store[idx] = base;
  else if (key) store.unshift(base);
  return { store, summary };
}

function parseIso(value) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

// ── Paddle REST proxy (uses the SECRET key — never exposed to browser) ──
async function paddleApi(method, path, body) {
  if (!PADDLE.apiKey) {
    // Sem credencial configurada: não tentar chamar a API do Paddle.
    return {
      status: 503,
      ok: false,
      json: { error: "paddle_not_configured", message: "PADDLE_API_KEY não configurado." },
    };
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PADDLE.apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

async function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => resolve({ raw, json: (() => { try { return JSON.parse(raw); } catch { return {}; } })() }));
  });
}

function send(res, status, body, extraHeaders = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": typeof body === "string" ? "text/plain" : "application/json", ...CORS, ...extraHeaders });
  res.end(payload);
}

// ── HTTP server ──
await ensureStore();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") return send(res, 204, "");

  // ── WEBHOOK ─────────────────────────────────────────────────
  if (path === "/api/paddle/webhook" && req.method === "POST") {
    const { raw } = await readJson(req);
    const check = verifySignature(raw, req.headers["paddle-signature"]);

    const log = await readStore(LOG_FILE);
    let event = null;
    try { event = JSON.parse(raw); } catch { /* ignore */ }

    log.unshift({
      ts: Date.now(),
      type: event?.event_type ?? "unparseable",
      signatureOk: check.ok,
      reason: check.reason,
    });
    await writeStore(LOG_FILE, log);

    if (!check.ok) {
      console.warn(`[paddle] rejected webhook: ${check.reason}`);
      return send(res, 400, { error: "invalid signature", reason: check.reason });
    }
    if (!event) return send(res, 400, { error: "invalid json" });

    const { store, summary } = await applyEvent(event);
    await writeStore(DATA_FILE, store);

    // Push the change to every connected browser instantly
    broadcast("entitlement", {
      eventType: event.event_type,
      key: entitlementKey(event.data ?? {}),
      summary,
      data: event.data,
    });

    console.log(`[paddle] ${event.event_type} → ${summary ?? "ignored"}`);
    return send(res, 200, { ok: true, summary });
  }

  // ── SSE STREAM ──────────────────────────────────────────────
  if (path === "/api/paddle/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      ...CORS,
    });
    res.write(`data: ${JSON.stringify({ type: "ready", ts: Date.now() })}\n\n`);
    sseClients.add(res);
    const heartbeat = setInterval(() => { try { res.write(": ping\n\n"); } catch { /* ignore */ } }, 25000);
    req.on("close", () => { clearInterval(heartbeat); sseClients.delete(res); });
    return;
  }

  // ── SUBSCRIPTION MANAGEMENT (cancel / pause / resume / change) ──
  const subMatch = path.match(/^\/api\/paddle\/subscriptions\/([^/]+)\/(cancel|pause|resume|change)$/);
  if (subMatch && req.method === "POST") {
    const [, subscriptionId, action] = subMatch;
    const { json } = await readJson(req);
    let result;

    if (action === "cancel") {
      // Paddle cancels are scheduled changes; effective_from controls timing.
      result = await paddleApi("POST", `/subscriptions/${subscriptionId}/cancel`, {
        effective_from: json.effectiveFrom ?? "end_of_term",
      });
    } else if (action === "pause") {
      result = await paddleApi("POST", `/subscriptions/${subscriptionId}/pause`, {
        effective_from: json.effectiveFrom ?? "next_billing_period",
        resume_at: json.resumeAt,
      });
    } else if (action === "resume") {
      result = await paddleApi("POST", `/subscriptions/${subscriptionId}/resume`, {
        effective_from: json.effectiveFrom ?? "immediately",
      });
    } else {
      result = await paddleApi("PATCH", `/subscriptions/${subscriptionId}`, {
        proration_billing_mode: json.proration ?? "prorated_immediately",
        items: json.items,
      });
    }

    if (result.ok) {
      broadcast("subscription", { subscriptionId, action, result: result.json });
    }
    return send(res, result.ok ? 200 : result.status, result.json ?? { error: "upstream error" });
  }

  // ── READ-ONLY LOOKUPS (proxied so the browser never holds the key) ──
  if (path.startsWith("/api/paddle/subscriptions/") && req.method === "GET") {
    const id = path.split("/")[5];
    const result = await paddleApi("GET", `/subscriptions/${id}`);
    return send(res, result.status, result.json);
  }

  if (path === "/api/paddle/customers" && req.method === "GET") {
    const email = url.searchParams.get("email");
    const result = await paddleApi("GET", `/customers${email ? `?email=${encodeURIComponent(email)}` : ""}`);
    return send(res, result.status, result.json);
  }

  if (path === "/api/paddle/transactions" && req.method === "GET") {
    const result = await paddleApi("GET", "/transactions?per_page=50&order_by=id[DESC]");
    return send(res, result.status, result.json);
  }

  if (path === "/api/paddle/discounts" && req.method === "GET") {
    const result = await paddleApi("GET", "/discounts?status=active");
    return send(res, result.status, result.json);
  }

  // ── CLIENT RECONCILIATION (browser confirms a checkout completed) ──
  if (path === "/api/paddle/client-event" && req.method === "POST") {
    const { json } = await readJson(req);
    const log = await readStore(LOG_FILE);
    log.unshift({ ts: Date.now(), type: `client:${json.event}`, ...json });
    await writeStore(LOG_FILE, log);
    return send(res, 200, { ok: true, note: "webhook remains the source of truth" });
  }

  // ── LOCAL STATE (what the webhook has recorded) ──
  if (path === "/api/paddle/state") {
    const [store, log] = await Promise.all([readStore(DATA_FILE), readStore(LOG_FILE)]);
    return send(res, 200, { entitlements: store, recentEvents: log.slice(0, 30) });
  }

  // ── HEALTH ──────────────────────────────────────────────────
  if (path === "/health" || path === "/") {
    const store = await readStore(DATA_FILE);
    return send(res, 200, {
      service: "Day of the Undead — Paddle billing",
      environment: PADDLE.environment,
      clientTokenConfigured: Boolean(PADDLE.clientToken),
      secretKeyConfigured: Boolean(PADDLE.apiKey),
      webhookSecretConfigured: Boolean(PADDLE.webhookSecret),
      entitlements: store.length,
      sseClients: sseClients.size,
      endpoints: [
        "POST /api/paddle/webhook",
        "GET  /api/paddle/stream",
        "POST /api/paddle/subscriptions/:id/cancel|pause|resume|change",
        "GET  /api/paddle/subscriptions/:id",
        "GET  /api/paddle/transactions",
        "GET  /api/paddle/customers?email=",
        "GET  /api/paddle/discounts",
        "GET  /api/paddle/state",
      ],
    });
  }

  send(res, 404, { error: "not found" });
});

server.listen(SERVER_PORT, () => {
  console.log(`\n${"═".repeat(62)}`);
  console.log(`  🥑 Paddle billing server — Day of the Undead`);
  console.log(`  Environment : ${PADDLE.environment}`);
  console.log(`  Listening   : http://localhost:${SERVER_PORT}`);
  console.log(`  Webhook URL : http://localhost:${SERVER_PORT}/api/paddle/webhook`);
  console.log(`  Live stream : http://localhost:${SERVER_PORT}/api/paddle/stream`);
  if (!PADDLE.webhookSecret) {
    console.log(`\n  ⚠ PADDLE_WEBHOOK_SECRET não configurado.`);
    console.log(`    Copie o segredo em Paddle → Developer tools → Notifications`);
    console.log(`    e exporte: PADDLE_WEBHOOK_SECRET=... node server/paddle-server.mjs`);
  }
  if (!PADDLE.apiKey) {
    console.log(`\n  ⚠ PADDLE_API_KEY não configurado — a API do Paddle responderá 503.`);
    console.log(`    Exporte a chave secreta antes de iniciar o servidor.`);
  }
  console.log(`${"═".repeat(62)}\n`);
});
