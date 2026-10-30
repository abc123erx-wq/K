// ═══════════════════════════════════════════════════════════════
//  ENTITLEMENTS — the single source of truth for "what this player
//  owns". Driven by Paddle webhooks: payments grant access,
//  cancellations schedule revocation, refunds revoke immediately.
// ═══════════════════════════════════════════════════════════════

import { Database, type PlayerSave } from "./database";
import { findPlan } from "./paddlePlans";
import type { Plan } from "./paddlePlans";

export type EntitlementStatus =
  | "active"       // paid, access granted
  | "trialing"     // subscription trial
  | "past_due"     // dunning — access suspended until payment clears
  | "paused"       // subscriber paused billing
  | "canceled"     // revoked (or scheduled to revoke at period end)
  | "expiring"     // canceled but valid until current_period_end
  | "refunded"     // adjustment created → access revoked
  | "expired";     // lifetime elapsed

export interface Entitlement {
  id: string;
  kind: "one_time" | "subscription";
  status: EntitlementStatus;
  planId: string;
  priceId: string;
  planName: string;
  amountBrl: number;
  currency: string;
  coins?: number;
  items?: string[];
  unlockKey?: string;
  perks?: string[];
  customerId?: string;
  customerEmail?: string;
  transactionId?: string;
  subscriptionId?: string;
  startsAt: number;
  /** null = never expires */
  currentPeriodEnd: number | null;
  /** set by subscription.canceled with effective_from=end_of_term */
  scheduledEndAt: number | null;
  canceledAt?: number;
  cancelReason?: string;
  pausedSince?: number;
  refundedAmount?: number;
  refundedAt?: number;
  /** true once coins/items/unlocks were written into the PlayerSave */
  delivered: boolean;
  updatedAt: number;
}

const STORE_KEY = "paddle-entitlements";
const DELIVERED_KEY = "paddle-delivered-log";

function loadAll(): Entitlement[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "[]") as Entitlement[];
  } catch {
    return [];
  }
}

function persist(list: Entitlement[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 200)));
  } catch { /* quota — keep playing */ }
}

function upsert(entitlement: Entitlement) {
  const list = loadAll();
  const key = entitlement.subscriptionId ?? entitlement.transactionId ?? entitlement.id;
  const idx = list.findIndex(
    (e) => (e.subscriptionId ?? e.transactionId ?? e.id) === key,
  );
  if (idx >= 0) list[idx] = { ...list[idx], ...entitlement, updatedAt: Date.now() };
  else list.unshift(entitlement);
  persist(list);
  return entitlement;
}

function makeEntitlement(plan: Plan, patch: Partial<Entitlement> = {}): Entitlement {
  const now = Date.now();
  const isSub = plan.interval !== "one_time";
  return {
    id: `ent_${Math.random().toString(36).slice(2, 10)}`,
    kind: isSub ? "subscription" : "one_time",
    status: "active",
    planId: plan.id,
    priceId: plan.priceId,
    planName: plan.name,
    amountBrl: plan.amountBrl,
    currency: "BRL",
    coins: plan.coins,
    items: plan.items,
    unlockKey: plan.unlockKey,
    perks: plan.perks,
    startsAt: now,
    currentPeriodEnd: isSub ? now + (plan.interval === "year" ? 365 : 30) * 86400000 : null,
    scheduledEndAt: null,
    delivered: false,
    updatedAt: now,
    ...patch,
  };
}

// ───────────────────────────────────────────────────────────────
//  Queries
// ───────────────────────────────────────────────────────────────

export function listEntitlements(): Entitlement[] {
  return loadAll();
}

/** Entitlements that currently grant access (respects expiry & refunds). */
export function activeEntitlements(): Entitlement[] {
  const now = Date.now();
  return loadAll().filter((e) => {
    if (e.status === "refunded" || e.status === "expired") return false;
    if (e.status === "paused" || e.status === "past_due") return false;
    if (e.status === "canceled") return false;
    if (e.status === "expiring") return (e.scheduledEndAt ?? 0) > now;
    if (e.currentPeriodEnd && e.currentPeriodEnd < now) return false;
    return true;
  });
}

export function ownsUnlock(key: string): boolean {
  return activeEntitlements().some((e) => e.unlockKey === key);
}

export function activePerks(): string[] {
  const perks = new Set<string>();
  for (const e of activeEntitlements()) for (const p of e.perks ?? []) perks.add(p);
  return Array.from(perks);
}

export function hasActiveSubscription(): boolean {
  return activeEntitlements().some((e) => e.kind === "subscription");
}

export function lifetimeSpentBrl(): number {
  return loadAll()
    .filter((e) => e.status !== "refunded")
    .reduce((sum, e) => sum + e.amountBrl, 0);
}

export function lifetimeRefundedBrl(): number {
  return loadAll().reduce((sum, e) => sum + (e.refundedAmount ?? 0), 0);
}

// ───────────────────────────────────────────────────────────────
//  Delivery — turn an entitlement into real in-game value
// ───────────────────────────────────────────────────────────────

function deliveredIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DELIVERED_KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

function markDelivered(key: string) {
  const ids = deliveredIds();
  ids.add(key);
  // Keep the log bounded
  const trimmed = Array.from(ids).slice(-300);
  try { localStorage.setItem(DELIVERED_KEY, JSON.stringify(trimmed)); } catch { /* ignore */ }
}

/**
 * Apply every undelivered active entitlement to the player's save.
 * Idempotent: coins are never granted twice for the same transaction.
 */
export function deliverEntitlements(save: PlayerSave | null): { delivered: number; coins: number; items: number; unlocks: string[] } {
  const summary = { delivered: 0, coins: 0, items: 0, unlocks: [] as string[] };
  const entitlements = activeEntitlements();
  const done = deliveredIds();
  const pendingItems: string[] = [];

  for (const ent of entitlements) {
    const key = ent.subscriptionId ?? ent.transactionId ?? ent.id;
    if (done.has(key)) continue;

    if (save) {
      if (ent.coins) {
        Database.addCoins(save, ent.coins);
        summary.coins += ent.coins;
      }
      if (ent.unlockKey && Database.unlockItem(save, ent.unlockKey)) {
        summary.unlocks.push(ent.unlockKey);
      }
      Database.unlockAchievement(save, `paddle-${ent.planId}`);
      ent.delivered = true;
      upsert(ent);
    }

    if (ent.items?.length) pendingItems.push(...ent.items);
    markDelivered(key);
    summary.delivered++;
  }

  if (pendingItems.length) {
    try {
      const queue = JSON.parse(localStorage.getItem("knox-pending-items") || "[]") as string[];
      queue.push(...pendingItems);
      localStorage.setItem("knox-pending-items", JSON.stringify(queue));
      summary.items = pendingItems.length;
    } catch { /* ignore */ }
  }

  if (save && summary.delivered > 0) Database.save(save);
  return summary;
}

// ───────────────────────────────────────────────────────────────
//  Webhook event handling — the state machine
// ───────────────────────────────────────────────────────────────

interface WebhookEvent {
  event_type: string;
  data: any;
}

function planFromData(data: any): Plan | null {
  const items = data?.items ?? data?.transaction?.items ?? data?.subscription?.items ?? [];
  for (const item of items) {
    const priceId = item?.price?.id ?? item?.price_id ?? item?.priceId;
    const plan = findPlan(priceId) ?? findPlan(item?.price?.product_id ?? item?.product_id ?? "");
    if (plan) return plan;
  }
  return null;
}

function moneyBrl(data: any, path: string): number {
  const raw = path.split(".").reduce<any>((acc, k) => acc?.[k], data);
  // Paddle sends amounts as strings in minor units
  const n = parseInt(raw ?? "0", 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Apply a Paddle webhook event. Returns a human readable summary or null.
 * Handles: payment, cancellation (immediate + end-of-term), pause, resume,
 * past_due, trial, expiration and refunds (full + partial).
 */
export function applyWebhookEvent(event: WebhookEvent): string | null {
  const data = event.data ?? {};
  const type = event.event_type;
  const list = loadAll();
  const subId: string | undefined = data?.id?.startsWith?.("sub_") ? data.id : data?.subscription_id ?? data?.subscription?.id;
  const txId: string | undefined = data?.id?.startsWith?.("txn_") ? data.id : data?.transaction_id ?? data?.transaction?.id;

  const findEnt = () =>
    list.find((e) => (subId && e.subscriptionId === subId) || (txId && e.transactionId === txId));

  switch (type) {
    // ── PAYMENT ────────────────────────────────────────────────
    case "transaction.completed":
    case "transaction.paid": {
      const plan = planFromData(data);
      if (!plan) return null;
      const ent = upsert(
        makeEntitlement(plan, {
          transactionId: txId,
          subscriptionId: subId,
          customerId: data?.customer_id ?? data?.customer?.id,
          customerEmail: data?.customer?.email,
          amountBrl: moneyBrl(data, "details.totals.grand_total") || plan.amountBrl,
          currency: data?.currency_code ?? data?.currency ?? "BRL",
          status: subId ? "active" : "active",
        }),
      );
      return `✅ Pagamento aprovado — ${ent.planName}`;
    }

    case "transaction.payment_failed": {
      const ent = findEnt();
      if (ent) {
        ent.status = "past_due";
        ent.updatedAt = Date.now();
        upsert(ent);
        return `⚠️ Pagamento recusado — acesso suspenso (${ent.planName})`;
      }
      return null;
    }

    // ── SUBSCRIPTION LIFECYCLE ─────────────────────────────────
    case "subscription.activated":
    case "subscription.started": {
      const plan = planFromData(data) ?? (subId ? list.find((e) => e.subscriptionId === subId) : undefined);
      if (!plan) return null;
      const existing = plan && "planId" in plan ? findEnt() : undefined;
      const base = existing ?? makeEntitlement(plan as Plan);
      const ent = upsert({
        ...base,
        subscriptionId: subId ?? base.subscriptionId,
        status: data?.status === "trialing" ? "trialing" : "active",
        currentPeriodEnd: parseTime(data?.current_billing_period?.ends_at) ?? base.currentPeriodEnd,
        canceledAt: undefined,
        scheduledEndAt: null,
        updatedAt: Date.now(),
      } as Entitlement);
      return `🔓 Assinatura ativa — ${ent.planName}`;
    }

    case "subscription.trialing": {
      const ent = findEnt();
      if (!ent) return null;
      ent.status = "trialing";
      ent.currentPeriodEnd = parseTime(data?.current_billing_period?.ends_at) ?? ent.currentPeriodEnd;
      upsert(ent);
      return `🎁 Período de teste iniciado — ${ent.planName}`;
    }

    case "subscription.updated": {
      const ent = findEnt();
      if (!ent) return null;
      ent.currentPeriodEnd = parseTime(data?.current_billing_period?.ends_at) ?? ent.currentPeriodEnd;
      if (data?.scheduled_change) {
        const change = data.scheduled_change;
        ent.scheduledEndAt = parseTime(change.effective_from) ?? ent.scheduledEndAt;
        ent.status = change.type === "cancel" ? "expiring" : ent.status;
        ent.cancelReason = change.reason;
      }
      ent.updatedAt = Date.now();
      upsert(ent);
      return `🔄 Assinatura atualizada — ${ent.planName}`;
    }

    case "subscription.paused": {
      const ent = findEnt();
      if (!ent) return null;
      ent.status = "paused";
      ent.updatedAt = Date.now();
      upsert(ent);
      return `⏸ Assinatura pausada — benefícios suspensos (${ent.planName})`;
    }

    case "subscription.resumed": {
      const ent = findEnt();
      if (!ent) return null;
      ent.status = "active";
      ent.pausedSince = undefined;
      ent.currentPeriodEnd = parseTime(data?.current_billing_period?.ends_at) ?? ent.currentPeriodEnd;
      ent.updatedAt = Date.now();
      upsert(ent);
      return `▶️ Assinatura retomada — ${ent.planName}`;
    }

    case "subscription.past_due": {
      const ent = findEnt();
      if (!ent) return null;
      ent.status = "past_due";
      ent.updatedAt = Date.now();
      upsert(ent);
      return `⚠️ Cobrança em atraso — acesso suspenso até regularizar (${ent.planName})`;
    }

    case "subscription.canceled": {
      const ent = findEnt();
      if (!ent) return null;
      const effectiveFrom: string = data?.scheduled_change?.effective_from ?? data?.effective_from ?? "immediately";
      ent.canceledAt = Date.now();
      ent.cancelReason = data?.scheduled_change?.reason ?? data?.custom_data?.reason ?? "cancelado pelo assinante";
      if (effectiveFrom === "end_of_term") {
        // Access stays until the paid period runs out
        ent.status = "expiring";
        ent.scheduledEndAt = ent.currentPeriodEnd ?? Date.now();
        upsert(ent);
        return `📅 Cancelamento agendado — ${ent.planName} válido até ${new Date(ent.scheduledEndAt).toLocaleDateString("pt-BR")}`;
      }
      ent.status = "canceled";
      ent.scheduledEndAt = Date.now();
      upsert(ent);
      return `❌ Assinatura cancelada — acesso revogado (${ent.planName})`;
    }

    case "subscription.expired": {
      const ent = findEnt();
      if (!ent) return null;
      ent.status = "expired";
      ent.updatedAt = Date.now();
      upsert(ent);
      return `⌛ Assinatura expirada — ${ent.planName}`;
    }

    // ── REFUNDS ────────────────────────────────────────────────
    case "adjustment.created":
    case "adjustment.updated": {
      const reason: string = data?.reason ?? "reembolso";
      const action: string = data?.action ?? "refund";
      const amountMinor = parseInt(data?.items?.[0]?.amount ?? data?.amount ?? "0", 10);
      const targetTx: string | undefined = data?.transaction_id;
      const ent = list.find((e) => e.transactionId === targetTx) ?? findEnt();
      if (!ent) return null;

      if (action !== "refund") return null;

      const isFull = (data?.status === "approved" && !amountMinor) || amountMinor >= ent.amountBrl;
      ent.refundedAmount = (ent.refundedAmount ?? 0) + (amountMinor || ent.amountBrl);
      ent.refundedAt = Date.now();
      ent.status = "refunded";
      ent.updatedAt = Date.now();
      upsert(ent);

      // Revoke the granted value
      revokeDelivery(ent);
      return isFull
        ? `↩️ Reembolso total — acesso revogado (${ent.planName})`
        : `↩️ Reembolso parcial de R$ ${((amountMinor || 0) / 100).toFixed(2)} — ${reason}`;
    }

    default:
      return null;
  }
}

function parseTime(value?: string): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** Undo the in-game value granted by a refunded entitlement. */
function revokeDelivery(ent: Entitlement) {
  // Remove queued items that were never consumed
  try {
    const queue = JSON.parse(localStorage.getItem("knox-pending-items") || "[]") as string[];
    const remove = new Set(ent.items ?? []);
    const filtered = queue.filter((k) => !remove.has(k));
    localStorage.setItem("knox-pending-items", JSON.stringify(filtered));
  } catch { /* ignore */ }

  // Unlock keys are revoked on the next save load
  if (ent.unlockKey) {
    try {
      const revoked = JSON.parse(localStorage.getItem("paddle-revoked") || "[]") as string[];
      if (!revoked.includes(ent.unlockKey)) {
        revoked.push(ent.unlockKey);
        localStorage.setItem("paddle-revoked", JSON.stringify(revoked));
      }
    } catch { /* ignore */ }
  }
}

/** Re-apply revocations (called when a save loads). */
export function enforceRevocations(save: PlayerSave | null) {
  if (!save) return;
  try {
    const revoked = JSON.parse(localStorage.getItem("paddle-revoked") || "[]") as string[];
    if (!revoked.length) return;
    const activeKeys = new Set(activeEntitlements().map((e) => e.unlockKey).filter(Boolean) as string[]);
    save.unlockedItems = save.unlockedItems.filter((k) => !revoked.includes(k) || activeKeys.has(k));
    Database.save(save);
  } catch { /* ignore */ }
}

/** Expire entitlements whose period ended. Call on boot + periodically. */
export function sweepExpired(): number {
  const now = Date.now();
  let changed = 0;
  for (const ent of loadAll()) {
    if (ent.status === "expiring" && (ent.scheduledEndAt ?? 0) <= now) {
      ent.status = "canceled";
      ent.updatedAt = now;
      changed++;
    } else if (ent.status === "active" && ent.currentPeriodEnd && ent.currentPeriodEnd < now && ent.kind === "subscription") {
      ent.status = "expired";
      ent.updatedAt = now;
      changed++;
    }
  }
  if (changed) persist(loadAll());
  return changed;
}

/** Grant an entitlement locally (used when the SDK simulates a payment). */
export function grantLocal(plan: Plan, meta: { transactionId?: string; subscriptionId?: string; email?: string } = {}) {
  const ent = upsert(
    makeEntitlement(plan, {
      transactionId: meta.transactionId,
      subscriptionId: meta.subscriptionId,
      customerEmail: meta.email,
    }),
  );
  return ent;
}

/** Clear everything (dev/debug). */
export function resetEntitlements() {
  try {
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem(DELIVERED_KEY);
    localStorage.removeItem("paddle-revoked");
  } catch { /* ignore */ }
}
