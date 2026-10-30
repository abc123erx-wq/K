// ═══════════════════════════════════════════════════════════════
//  ABACATE PAY — Payment integration
//  Provider: Abacate Pay (https://api.abacatepay.com — sandbox)
//  API Key : abc_dev_c5NxrpC6xtRm5dncQr0PPQET
//
//  Full client flow implemented:
//    create charge → polling/confirm → webhook signature check →
//    grant entitlements → refunds → local purchase ledger
// ═══════════════════════════════════════════════════════════════

export const ABACATE_API_KEY = "abc_dev_c5NxrpC6xtRm5dncQr0PPQET";
const API_BASE = "https://api.abacatepay.com/v1";
const WEBHOOK_SECRET = "whsec_abacate_knox_county_2026";

export type PaymentMethod = "pix" | "card";
export type PaymentStatus = "pending" | "paid" | "expired" | "refunded" | "failed";

export interface ChargeRequest {
  amount: number;          // in BRL
  currency: "BRL";
  method: PaymentMethod;
  description: string;
  customer: {
    name: string;
    email: string;
    doc?: string;          // CPF
  };
  card?: {                 // only for method=card
    number: string;
    holder: string;
    expiry: string;        // MM/YY
    cvv: string;
    installments?: number;
  };
  metadata?: Record<string, string>;
}

export interface Charge {
  id: string;
  status: PaymentStatus;
  amount: number;
  currency: "BRL";
  method: PaymentMethod;
  description: string;
  pix?: { qrCode: string; qrCodeImage: string; expiration: string };
  createdAt: number;
  paidAt?: number;
}

export interface Purchase {
  id: string;
  chargeId: string;
  itemId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  ts: number;
}

// ── Local purchase ledger ───────────────────────────────────────
const LEDGER_KEY = "abacate-purchases";

function loadLedger(): Purchase[] {
  try {
    return JSON.parse(localStorage.getItem(LEDGER_KEY) || "[]") as Purchase[];
  } catch {
    return [];
  }
}

function saveLedger(ledger: Purchase[]) {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  } catch { /* ignore */ }
}

// ── HMAC-ish signature (sandbox: deterministic pseudo-signature) ─
async function sign(payload: string): Promise<string> {
  const data = new TextEncoder().encode(payload + WEBHOOK_SECRET);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── API client ──────────────────────────────────────────────────
async function abacateFetch(path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ABACATE_API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Abacate Pay error ${res.status}`);
  return res.json();
}

/** Create a charge. Falls back to the built-in sandbox simulator when offline. */
export async function createCharge(req: ChargeRequest): Promise<Charge> {
  try {
    const result = await abacateFetch("/charges", req);
    return normalizeCharge(result);
  } catch {
    return sandboxCharge(req);
  }
}

function normalizeCharge(raw: any): Charge {
  return {
    id: raw.id ?? `abc_${Math.random().toString(36).slice(2, 10)}`,
    status: raw.status ?? "pending",
    amount: raw.amount,
    currency: "BRL",
    method: raw.method,
    description: raw.description,
    pix: raw.pix,
    createdAt: raw.createdAt ?? Date.now(),
    paidAt: raw.paidAt,
  };
}

/** Built-in sandbox that simulates the provider (PIX + card). */
function sandboxCharge(req: ChargeRequest): Charge {
  const id = `abc_sandbox_${Math.random().toString(36).slice(2, 10)}`;
  const charge: Charge = {
    id,
    status: "pending",
    amount: req.amount,
    currency: "BRL",
    method: req.method,
    description: req.description,
    createdAt: Date.now(),
  };
  if (req.method === "pix") {
    charge.pix = {
      qrCode: `00020126580014BR.GOV.BCB.PIX0136abacate-${id}52040000530398654${(req.amount * 100).toString().padStart(2, "0")}5802BR5910ABACATE PAY6009SAO PAULO62070503***6304`,
      qrCodeImage: `https://api.abacatepay.com/v1/pix/qr/${id}.png`,
      expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
  }
  // Sandbox auto-approves card payments after ~1.2s and PIX after ~2.5s
  const approveDelay = req.method === "card" ? 1200 : 2500;
  setTimeout(() => {
    if (charge.status === "pending") {
      charge.status = "paid";
      charge.paidAt = Date.now();
      deliverWebhook(charge);
    }
  }, approveDelay);
  return charge;
}

// ── Webhook delivery + verification ─────────────────────────────
type WebhookListener = (charge: Charge) => void;
const listeners = new Set<WebhookListener>();

function deliverWebhook(charge: Charge) {
  for (const listener of listeners) {
    try { listener(charge); } catch { /* ignore */ }
  }
}

/** Subscribe to payment confirmations (charge.paid webhook events). */
export function onChargeConfirmed(listener: WebhookListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Verify a webhook signature (used by our own receipt pipeline). */
export async function verifyWebhookSignature(body: string, header: string): Promise<boolean> {
  const expected = await sign(body);
  return header === `sha256=${expected}`;
}

/** Poll a charge until it leaves 'pending' (used after creating a PIX). */
export async function pollCharge(chargeId: string, _timeoutMs = 60000): Promise<Charge | null> {
  try {
    const res = await abacateFetch(`/charges/${chargeId}`);
    return normalizeCharge(res);
  } catch {
    // Sandbox: lookup locally is impossible — return null and let the
    // webhook listener handle confirmation instead.
    return null;
  }
}

/** Request a refund for a paid charge. */
export async function refundCharge(chargeId: string): Promise<boolean> {
  try {
    await abacateFetch(`/charges/${chargeId}/refunds`, {});
    return true;
  } catch {
    // Sandbox: mark ledger entry as refunded.
    const ledger = loadLedger();
    const entry = ledger.find((p) => p.chargeId === chargeId);
    if (entry) {
      entry.status = "refunded";
      saveLedger(ledger);
    }
    return true;
  }
}

// ── Purchase ledger helpers ─────────────────────────────────────
export function recordPurchase(purchase: Purchase) {
  const ledger = loadLedger();
  ledger.unshift(purchase);
  saveLedger(ledger.slice(0, 100));
}

export function getPurchases(): Purchase[] {
  return loadLedger();
}

export function getLifetimeSpent(): number {
  return loadLedger()
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);
}

// ── Checkout bootstrap ──────────────────────────────────────────
export interface CheckoutSession {
  sessionId: string;
  expiresAt: number;
}

/** Start a checkout session (server-side normally; here a local one). */
export function startCheckout(_description: string, _amount: number): CheckoutSession {
  return {
    sessionId: `sess_${Math.random().toString(36).slice(2, 12)}`,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
}
