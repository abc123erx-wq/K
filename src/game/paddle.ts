// ═══════════════════════════════════════════════════════════════
//  PADDLE CLIENT — browser side ONLY
//
//  ⚠️ SECURITY: only the CLIENT-SIDE TOKEN belongs in the browser.
//  The secret API key (pdl_live_apikey_…) is NEVER bundled here —
//  it lives in server/paddleConfig.mjs and is used exclusively by
//  the webhook + management API. Exposing it would let anyone
//  refund, cancel or read every transaction in your account.
// ═══════════════════════════════════════════════════════════════

import type { Plan } from "./paddlePlans";

/**
 * Public, safe to ship in the browser (Paddle client-side tokens are
 * designed for client use). Can be overridden at build time with
 * VITE_PADDLE_CLIENT_TOKEN.
 */
export const PADDLE_CLIENT_TOKEN =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_PADDLE_CLIENT_TOKEN) ||
  "live_f1f4f92feb3c52abacfef399136";

/** Where your webhook server runs (server/paddle-server.mjs). */
export const PADDLE_SERVER_URL =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_PADDLE_SERVER) || "http://localhost:8787";

export type PaymentState =
  | "idle"
  | "opening"
  | "pending"      // checkout opened, buyer authorizing
  | "processing"   // payment captured, waiting for webhook
  | "completed"
  | "failed"
  | "canceled"
  | "expired";

export interface CheckoutSession {
  sessionId: string;
  plan: Plan;
  state: PaymentState;
  transactionId?: string;
  subscriptionId?: string;
  customerEmail?: string;
  error?: string;
  openedAt: number;
  settledAt?: number;
  /** true when the local simulator handled it (no live Paddle SDK) */
  simulated: boolean;
}

declare global {
  interface Window {
    Paddle?: any;
  }
}

type Listener = (session: CheckoutSession) => void;
const listeners = new Set<Listener>();
const sessions = new Map<string, CheckoutSession>();

let sdkReady = false;
let sdkLoading: Promise<boolean> | null = null;

export function onCheckoutUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(session: CheckoutSession) {
  sessions.set(session.sessionId, session);
  for (const listener of listeners) {
    try { listener({ ...session }); } catch { /* ignore */ }
  }
}

export function getSession(id: string) {
  return sessions.get(id);
}

/** Load Paddle.js once. Returns false if unavailable (offline/sandbox). */
function loadSdk(): Promise<boolean> {
  if (sdkReady) return Promise.resolve(true);
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise<boolean>((resolve) => {
    if (window.Paddle) { sdkReady = true; resolve(true); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    const timeout = setTimeout(() => resolve(false), 6000);
    script.onload = () => {
      clearTimeout(timeout);
      try {
        window.Paddle.Environment.set(PADDLE_CLIENT_TOKEN.startsWith("live_") ? "production" : "sandbox");
        window.Paddle.Initialize({ token: PADDLE_CLIENT_TOKEN, eventCallback: handlePaddleEvent });
        sdkReady = true;
        resolve(true);
      } catch {
        resolve(false);
      }
    };
    script.onerror = () => { clearTimeout(timeout); resolve(false); };
    document.head.appendChild(script);
  });
  return sdkLoading;
}

/** Maps Paddle Checkout events onto our payment state machine. */
function handlePaddleEvent(event: any) {
  const data = event?.data ?? {};
  const sessionId: string = data.custom_data?.sessionId ?? data.checkout?.id ?? "";
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session) return;

  switch (event?.name) {
    case "checkout.opened":
      emit({ ...session, state: "pending" });
      break;
    case "checkout.payment.selected":
      emit({ ...session, state: "processing" });
      break;
    case "checkout.completed": {
      const tx = data.checkout?.transaction;
      emit({
        ...session,
        state: "completed",
        transactionId: tx?.id ?? tx?.transaction_id,
        subscriptionId: tx?.subscription_id ?? data.checkout?.subscription?.id,
        customerEmail: data.checkout?.customer?.email ?? session.customerEmail,
        settledAt: Date.now(),
      });
      notifyServer(session, "checkout.completed");
      break;
    }
    case "checkout.closed":
      if (session.state !== "completed") {
        emit({ ...session, state: "canceled", settledAt: Date.now() });
      }
      break;
    case "checkout.error":
      emit({ ...session, state: "failed", error: data?.message ?? "Erro no checkout", settledAt: Date.now() });
      break;
  }
}

/** Best-effort ping so the local server can reconcile before the webhook lands. */
function notifyServer(session: CheckoutSession, eventName: string) {
  try {
    fetch(`${PADDLE_SERVER_URL}/api/paddle/client-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: eventName,
        sessionId: session.sessionId,
        planId: session.plan.id,
        priceId: session.plan.priceId,
        transactionId: session.transactionId,
        subscriptionId: session.subscriptionId,
        email: session.customerEmail,
      }),
    }).catch(() => {});
  } catch { /* offline is fine — the webhook is the source of truth */ }
}

// ───────────────────────────────────────────────────────────────
//  Checkout
// ───────────────────────────────────────────────────────────────

export interface OpenCheckoutOptions {
  customerEmail: string;
  customerName: string;
  /** Discount code from Paddle → Discounts */
  discountCode?: string;
  quantity?: number;
  locale?: string;
}

export async function openCheckout(plan: Plan, opts: OpenCheckoutOptions): Promise<CheckoutSession> {
  const session: CheckoutSession = {
    sessionId: `sess_${Math.random().toString(36).slice(2, 12)}`,
    plan,
    state: "opening",
    customerEmail: opts.customerEmail,
    openedAt: Date.now(),
    simulated: false,
  };
  emit(session);

  const hasSdk = await loadSdk();
  if (hasSdk && window.Paddle?.Checkout?.open) {
    try {
      window.Paddle.Checkout.open({
        settings: {
          locale: opts.locale ?? "pt-BR",
          currencyCode: "BRL",
          theme: "dark",
          displayMode: "overlay",
        },
        items: [{ priceId: plan.priceId, quantity: opts.quantity ?? 1 }],
        customer: { email: opts.customerEmail, name: opts.customerName },
        customData: { sessionId: session.sessionId, planId: plan.id, game: "day-of-the-undead" },
        ...(opts.discountCode ? { discountCode: opts.discountCode } : {}),
        successCallback: (payload: any) => {
          const tx = payload?.data ?? payload;
          emit({
            ...session,
            state: "completed",
            transactionId: tx?.transaction_id ?? tx?.id,
            subscriptionId: tx?.subscription_id,
            settledAt: Date.now(),
          });
          notifyServer(session, "checkout.completed");
        },
        errorCallback: (payload: any) => {
          emit({ ...session, state: "failed", error: payload?.message ?? "Falha no pagamento", settledAt: Date.now() });
        },
      });
      return session;
    } catch (err) {
      emit({ ...session, state: "failed", error: String(err), settledAt: Date.now() });
      return session;
    }
  }

  // ── Local simulator: mirrors the real event sequence so the whole
  //    state machine stays testable without network access.
  return simulateCheckout(session);
}

function simulateCheckout(session: CheckoutSession): CheckoutSession {
  const sim = { ...session, simulated: true };
  emit(sim);

  const timers: number[] = [];
  timers.push(window.setTimeout(() => emit({ ...sim, state: "pending" }), 450));
  timers.push(window.setTimeout(() => emit({ ...sim, state: "processing" }), 1500));
  timers.push(
    window.setTimeout(() => {
      emit({
        ...sim,
        state: "completed",
        transactionId: `txn_sim_${Math.random().toString(36).slice(2, 12)}`,
        subscriptionId: sim.plan.interval === "one_time" ? undefined : `sub_sim_${Math.random().toString(36).slice(2, 10)}`,
        settledAt: Date.now(),
      });
      notifyServer(sim, "checkout.completed");
    }, 2800),
  );
  void timers;
  return sim;
}

export function cancelCheckout(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session || session.state === "completed") return;
  emit({ ...session, state: "canceled", settledAt: Date.now() });
  try { window.Paddle?.Checkout?.close?.(); } catch { /* ignore */ }
}

// ───────────────────────────────────────────────────────────────
//  Subscription management (proxied through OUR server so the
//  secret API key never reaches the browser)
// ───────────────────────────────────────────────────────────────

export type SubscriptionAction = "cancel" | "pause" | "resume" | "change";

export async function manageSubscription(
  subscriptionId: string,
  action: SubscriptionAction,
  extra?: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; data?: any }> {
  try {
    const res = await fetch(`${PADDLE_SERVER_URL}/api/paddle/subscriptions/${subscriptionId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(extra ?? {}),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, error: json?.error, data: json };
  } catch (err) {
    return { ok: false, error: `Servidor Paddle indisponível (${String(err)})` };
  }
}

/** Subscribe to the server's SSE stream so webhook updates reach the game live. */
export function subscribeToWebhookStream(onEvent: (event: { type: string; payload: any }) => void): () => void {
  let source: EventSource | null = null;
  try {
    source = new EventSource(`${PADDLE_SERVER_URL}/api/paddle/stream`);
    source.onmessage = (msg) => {
      try { onEvent(JSON.parse(msg.data)); } catch { /* ignore */ }
    };
    source.onerror = () => { /* server offline — entitlements still load from storage */ };
  } catch {
    /* EventSource unavailable */
  }
  return () => {
    try { source?.close(); } catch { /* ignore */ }
  };
}

export const STATE_LABEL: Record<PaymentState, { label: string; color: string }> = {
  idle: { label: "Aguardando", color: "#6b6b6b" },
  opening: { label: "Abrindo checkout", color: "#8ab0cc" },
  pending: { label: "Autorização pendente", color: "#e8b64a" },
  processing: { label: "Processando pagamento", color: "#e8b64a" },
  completed: { label: "Pagamento aprovado", color: "#8fb57e" },
  failed: { label: "Pagamento recusado", color: "#e07a52" },
  canceled: { label: "Checkout cancelado", color: "#9a8f7a" },
  expired: { label: "Sessão expirada", color: "#9a8f7a" },
};
