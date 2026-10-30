// ═══════════════════════════════════════════════════════════════
//  PADDLE STORE — plans, checkout, subscriptions & billing history
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { PLANS, ACCENTS, formatBRL, intervalLabel, type Plan } from "../game/paddlePlans";
import {
  openCheckout,
  cancelCheckout,
  onCheckoutUpdate,
  manageSubscription,
  subscribeToWebhookStream,
  STATE_LABEL,
  PADDLE_SERVER_URL,
  type CheckoutSession,
  type PaymentState,
} from "../game/paddle";
import {
  listEntitlements,
  activeEntitlements,
  activePerks,
  lifetimeSpentBrl,
  lifetimeRefundedBrl,
  deliverEntitlements,
  applyWebhookEvent,
  enforceRevocations,
  sweepExpired,
  resetEntitlements,
  type Entitlement,
} from "../game/entitlements";
import type { PlayerSave } from "../game/database";

interface PaddleShopProps {
  isOpen: boolean;
  onClose: () => void;
  save: PlayerSave | null;
  onSaveChanged: (save: PlayerSave) => void;
  customerName: string;
  customerEmail: string;
}

type Filter = "todos" | "credits" | "bundle" | "subscription";

const FILTERS: { id: Filter; label: string; icon: string }[] = [
  { id: "todos", label: "Tudo", icon: "◈" },
  { id: "credits", label: "Moedas", icon: "◉" },
  { id: "bundle", label: "Kits", icon: "▣" },
  { id: "subscription", label: "Assinaturas", icon: "∞" },
];

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  active: { label: "Ativo", cls: "border-[#5d7a52] bg-[#16210f] text-[#8fb57e]" },
  trialing: { label: "Em teste", cls: "border-[#4f6a80] bg-[#101a22] text-[#8ab0cc]" },
  expiring: { label: "Encerra no período", cls: "border-[#c8912a] bg-[#241a08] text-[#e8b64a]" },
  paused: { label: "Pausado", cls: "border-[#7a6a3a] bg-[#1e1a0e] text-[#cdb87a]" },
  past_due: { label: "Em atraso", cls: "border-[#b5452e] bg-[#241009] text-[#e07a52]" },
  canceled: { label: "Cancelado", cls: "border-[#5a2b24] bg-[#1c0d0a] text-[#b06a52]" },
  refunded: { label: "Reembolsado", cls: "border-[#7a4a78] bg-[#1c1220] text-[#c08abe]" },
  expired: { label: "Expirado", cls: "border-[#3a3a3a] bg-[#141414] text-[#8a8a8a]" },
};

export default function PaddleShop({ isOpen, onClose, save, onSaveChanged, customerName, customerEmail }: PaddleShopProps) {
  const [filter, setFilter] = useState<Filter>("todos");
  const [email, setEmail] = useState(customerEmail);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [feed, setFeed] = useState<{ id: string; text: string; tone: "ok" | "warn" | "bad" }[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => {
    sweepExpired();
    setEntitlements(listEntitlements());
  };

  // Boot: reconcile local state, deliver anything undelivered, enforce refunds
  useEffect(() => {
    if (!isOpen) return;
    refresh();
    enforceRevocations(save);
    const result = deliverEntitlements(save);
    if (result.delivered > 0 && save) {
      onSaveChanged({ ...save });
      pushFeed(`Entrega automática: ${result.delivered} compra(s) aplicada(s)${result.coins ? ` · +${result.coins} moedas` : ""}${result.items ? ` · ${result.items} itens` : ""}`, "ok");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Checkout state machine listener
  useEffect(() => onCheckoutUpdate((s) => setSession(s)), []);

  // Live webhook stream → entitlement updates without a reload
  useEffect(() => {
    if (!isOpen) return;
    const stop = subscribeToWebhookStream((event) => {
      if (event.type !== "entitlement") return;
      const summary = applyWebhookEvent({ event_type: event.payload?.eventType ?? "", data: event.payload?.data ?? {} });
      if (summary) {
        const tone = summary.startsWith("✅") || summary.startsWith("🔓") || summary.startsWith("▶️")
          ? "ok" : summary.startsWith("↩️") || summary.startsWith("❌") || summary.startsWith("⚠️")
          ? "bad" : "warn";
        pushFeed(`${summary} · via webhook`, tone);
      }
      refresh();
      const result = deliverEntitlements(save);
      if (result.delivered > 0 && save) onSaveChanged({ ...save });
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, save]);

  // Grant locally once the checkout reports completed (covers offline/sandbox)
  useEffect(() => {
    if (session?.state !== "completed") return;
    import("../game/entitlements").then(({ grantLocal }) => {
      grantLocal(session.plan, {
        transactionId: session.transactionId,
        subscriptionId: session.subscriptionId,
        email: session.customerEmail,
      });
      refresh();
      const result = deliverEntitlements(save);
      if (save) onSaveChanged({ ...save });
      pushFeed(
        `Pagamento concluído — ${session.plan.name}${result.coins ? ` · +${result.coins} moedas` : ""}${result.items ? ` · ${result.items} itens na fila` : ""}${result.unlocks.length ? ` · ${result.unlocks.length} desbloqueio(s)` : ""}`,
        "ok",
      );
      showToast(`🥑 ${session.plan.name} liberado!`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.state]);

  function pushFeed(text: string, tone: "ok" | "warn" | "bad") {
    setFeed((prev) => [{ id: `${Date.now()}-${Math.random()}`, text, tone }, ...prev].slice(0, 12));
  }

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(null), 4200);
  }

  const visible = useMemo(
    () => (filter === "todos" ? PLANS : PLANS.filter((p) => p.kind === filter)),
    [filter],
  );

  const active = useMemo(() => activeEntitlements(), [entitlements]);
  const perks = useMemo(() => activePerks(), [entitlements]);
  const subscriptions = entitlements.filter((e) => e.kind === "subscription" && !["refunded", "expired"].includes(e.status));

  if (!isOpen) return null;

  const beginPurchase = async (plan: Plan) => {
    if (!email.includes("@")) {
      showToast("Informe um e-mail válido para o recibo.");
      return;
    }
    setSession(null);
    await openCheckout(plan, { customerEmail: email, customerName: customerName || "Sobrevivente" });
  };

  const runSubscriptionAction = async (ent: Entitlement, action: "cancel" | "pause" | "resume", effectiveFrom?: string) => {
    const subId = ent.subscriptionId;
    if (!subId) {
      showToast("Esta compra não é uma assinatura recorrente.");
      return;
    }
    setBusyId(ent.id);
    const res = await manageSubscription(subId, action, effectiveFrom ? { effectiveFrom } : undefined);
    setBusyId(null);
    if (res.ok) {
      pushFeed(`Assinatura ${action === "cancel" ? "cancelada" : action === "pause" ? "pausada" : "retomada"} (${subId})`, action === "cancel" ? "bad" : "ok");
      showToast(action === "resume" ? "▶️ Assinatura retomada" : action === "pause" ? "⏸ Assinatura pausada" : "Cancelamento registrado no Paddle");
      refresh();
    } else {
      pushFeed(`Falha em ${action}: ${res.error ?? "servidor Paddle indisponível"}`, "bad");
      showToast(`⚠️ ${res.error ?? "Não foi possível falar com o servidor Paddle"}`);
    }
  };

  const stepOrder: PaymentState[] = ["opening", "pending", "processing", "completed"];
  const stepIndex = session ? Math.max(0, stepOrder.indexOf(session.state)) : -1;

  return (
    <div className="fixed inset-0 z-[1200] overflow-hidden bg-[#0a0908]">
      {/* ── Layered ambient background ─────────────────────────── */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_18%_0%,#2a2118_0%,#14100d_45%,#080706_100%)]" />
        <div className="absolute inset-0 opacity-[0.16] [background-image:repeating-linear-gradient(115deg,transparent_0px,transparent_9px,rgba(217,107,58,0.5)_9px,rgba(217,107,58,0.5)_10px)]" />
        <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(#c8912a_1px,transparent_1px),linear-gradient(90deg,#c8912a_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-32 top-10 h-[420px] w-[420px] rounded-full bg-[#b5452e]/10 blur-[110px]" />
        <div className="absolute -right-24 bottom-0 h-[460px] w-[460px] rounded-full bg-[#5d7a52]/12 blur-[120px]" />
        {/* drifting embers */}
        {Array.from({ length: 14 }, (_, i) => (
          <span
            key={i}
            className="absolute block h-1 w-1 rounded-full bg-[#e8b64a]/70"
            style={{
              left: `${(i * 7.3) % 100}%`,
              bottom: "-10px",
              animation: `paddleEmber ${9 + (i % 5) * 2.4}s linear ${i * 0.7}s infinite`,
            }}
          />
        ))}
        <style>{`
          @keyframes paddleEmber {
            0%   { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
            12%  { opacity: .85; }
            100% { transform: translateY(-96vh) translateX(${(Math.random() - 0.5) * 60}px) scale(.35); opacity: 0; }
          }
          @keyframes paddleSlideIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
          @keyframes paddlePulseRing { 0% { box-shadow: 0 0 0 0 rgba(232,182,74,.45); } 100% { box-shadow: 0 0 0 16px rgba(232,182,74,0); } }
          .paddle-card { animation: paddleSlideIn .42s cubic-bezier(.2,.8,.3,1) both; }
        `}</style>
      </div>

      {/* ── Shell ─────────────────────────────────────────────── */}
      <div className="relative flex h-full flex-col">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b border-[#2a2118] bg-[#0d0b09]/92 px-5 py-4 backdrop-blur-md sm:px-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="border border-[#5d7a52] bg-[#111a0e] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-[#8fb57e]">
                🥑 Paddle
              </span>
              <span className="border border-[#3a3229] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.25em] text-[#9a8f7a]">
                Merchant billing
              </span>
              <span className="hidden font-mono text-[9px] uppercase tracking-[0.2em] text-[#6b6055] sm:inline">
                BRL · pt-BR · PCI handled by Paddle
              </span>
            </div>
            <h2 className="mt-1 truncate font-['Bebas_Neue'] text-4xl leading-[0.92] tracking-wide text-[#f0e6d6] sm:text-5xl">
              Loja de <span className="text-[#d96b3a]">Suprimentos</span>
            </h2>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a7d6c]">
              Pagamentos, assinaturas e reembolsos sincronizados por webhook
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden border border-[#2a2118] bg-[#0a0908] px-3 py-2 text-right sm:block">
              <span className="block font-mono text-[8px] uppercase tracking-[0.22em] text-[#6b6055]">Saldo</span>
              <span className="font-['Oswald'] text-lg font-semibold leading-none text-[#e8b64a]">
                {save?.coins ?? 0} <span className="text-[10px] text-[#8a7d6c]">moedas</span>
              </span>
            </div>
            <button
              onClick={onClose}
              className="grid h-11 w-11 place-items-center border border-[#5a2b24] bg-[#1c0d0a] font-['Oswald'] text-lg text-[#d96b3a] transition-all hover:bg-[#2a1714] hover:shadow-[0_0_18px_rgba(217,107,58,0.35)] active:scale-95"
              aria-label="Fechar loja"
            >
              ✕
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-5 sm:px-8">
          {/* Live status strip */}
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Acesso ativo" value={`${active.length}`} sub={`${perks.length} benefícios`} tone="#8fb57e" />
            <StatTile label="Assinaturas" value={`${subscriptions.length}`} sub={subscriptions.some((s) => s.status === "expiring") ? "com cancelamento agendado" : "gerenciáveis aqui"} tone="#8ab0cc" />
            <StatTile label="Total investido" value={formatBRL(lifetimeSpentBrl())} sub={`reembolsos ${formatBRL(lifetimeRefundedBrl())}`} tone="#e8b64a" />
            <StatTile label="Servidor Paddle" value={PADDLE_SERVER_URL.includes("localhost") ? "Local" : "Remoto"} sub="webhook → SSE → jogo" tone="#c08abe" />
          </div>

          {/* Filters */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`border px-4 py-2 font-['Oswald'] text-[11px] font-semibold uppercase tracking-[0.18em] transition-all duration-200 ${
                  filter === f.id
                    ? "border-[#d96b3a] bg-[#2a1714] text-[#e8a06a] shadow-[0_0_20px_rgba(217,107,58,0.22)]"
                    : "border-[#2a2118] bg-[#0d0b09] text-[#8a7d6c] hover:-translate-y-0.5 hover:border-[#4a3d2e] hover:text-[#c9bba6]"
                }`}
              >
                <span className="mr-1.5 opacity-70">{f.icon}</span>
                {f.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <label className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#6b6055]">E-mail do recibo</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                className="w-52 border border-[#2a2118] bg-[#0a0908] px-3 py-2 font-mono text-[11px] text-[#d8cbb6] outline-none transition-colors placeholder:text-[#4d4438] focus:border-[#c8912a]"
              />
            </div>
          </div>

          {/* Plan grid */}
          <div className="grid gap-4 lg:grid-cols-3">
            {visible.map((plan, i) => {
              const accent = ACCENTS[plan.accent];
              const owned = plan.unlockKey ? (save?.unlockedItems ?? []).includes(plan.unlockKey) : false;
              const recurring = plan.interval !== "one_time";
              return (
                <article
                  key={plan.id}
                  className={`paddle-card group relative flex flex-col overflow-hidden border bg-[#0d0b09]/85 p-5 transition-all duration-300 hover:-translate-y-1.5 ${
                    plan.featured ? "lg:col-span-1" : ""
                  }`}
                  style={{
                    borderColor: plan.featured ? accent.border : "#241d16",
                    boxShadow: plan.featured ? `0 0 0 1px ${accent.glow}, 0 18px 44px -22px ${accent.glow}` : "none",
                    animationDelay: `${i * 55}ms`,
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{ background: `radial-gradient(120% 80% at 50% 0%, ${accent.bg}, transparent 70%)` }}
                  />
                  <span className="absolute left-0 top-0 h-full w-[3px]" style={{ background: accent.bar }} />

                  {plan.badge && (
                    <span
                      className="absolute right-0 top-0 px-3 py-1 font-['Oswald'] text-[9px] font-bold uppercase tracking-[0.2em] text-[#0a0908]"
                      style={{ background: accent.bar }}
                    >
                      {plan.badge}
                    </span>
                  )}

                  <div className="relative">
                    <p className="font-mono text-[9px] uppercase tracking-[0.28em]" style={{ color: accent.text }}>
                      {recurring ? (plan.interval === "year" ? "Assinatura anual" : "Assinatura mensal") : plan.kind === "bundle" ? "Pacote de itens" : "Créditos"}
                    </p>
                    <h3 className="mt-1.5 font-['Bebas_Neue'] text-3xl leading-none tracking-wide text-[#f0e6d6]">
                      {plan.name}
                    </h3>
                    <p className="mt-1 font-mono text-[10px] text-[#8a7d6c]">{plan.tagline}</p>

                    <div className="mt-4 flex items-baseline gap-1.5">
                      <span className="font-['Oswald'] text-4xl font-bold leading-none" style={{ color: accent.text }}>
                        {formatBRL(plan.amountBrl)}
                      </span>
                      <span className="font-mono text-[10px] text-[#6b6055]">{intervalLabel(plan)}</span>
                    </div>

                    <ul className="mt-4 space-y-1.5 border-t border-[#241d16] pt-3">
                      {(plan.perks?.length ? plan.perks : plan.benefits).map((b) => (
                        <li key={b} className="flex items-start gap-2 font-mono text-[10px] leading-relaxed text-[#a89a86]">
                          <span className="mt-[1px]" style={{ color: accent.text }}>▸</span>
                          {b}
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => beginPurchase(plan)}
                      disabled={owned}
                      className="mt-5 w-full border py-3 font-['Oswald'] text-[11px] font-bold uppercase tracking-[0.22em] transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                      style={{
                        borderColor: accent.border,
                        color: accent.text,
                        background: owned ? "transparent" : accent.bg,
                      }}
                      onMouseEnter={(e) => { if (!owned) (e.currentTarget.style.boxShadow = `0 0 24px -6px ${accent.glow}`); }}
                      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
                    >
                      {owned ? "✓ Adquirido" : recurring ? "Assinar agora" : "Comprar"}
                    </button>
                    {owned && recurring && (
                      <p className="mt-2 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-[#6b6055]">
                        renovação automática via Paddle
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {/* ── Checkout state machine ─────────────────────────── */}
          {session && (
            <section className="mt-8 border border-[#2a2118] bg-[#0d0b09]/92 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-[#6b6055]">Checkout Paddle</p>
                  <h4 className="font-['Bebas_Neue'] text-2xl tracking-wide text-[#f0e6d6]">{session.plan.name}</h4>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{
                      borderColor: STATE_LABEL[session.state].color,
                      color: STATE_LABEL[session.state].color,
                      background: `${STATE_LABEL[session.state].color}14`,
                      animation: session.state === "pending" || session.state === "processing" ? "paddlePulseRing 1.6s ease-out infinite" : undefined,
                    }}
                  >
                    {STATE_LABEL[session.state].label}
                  </span>
                  {session.state !== "completed" && session.state !== "failed" && session.state !== "canceled" && (
                    <button
                      onClick={() => cancelCheckout(session.sessionId)}
                      className="border border-[#3a3229] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#9a8f7a] hover:border-[#b5452e] hover:text-[#e07a52]"
                    >
                      Cancelar
                    </button>
                  )}
                  <button onClick={() => setSession(null)} className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#6b6055] hover:text-[#c9bba6]">
                    fechar
                  </button>
                </div>
              </div>

              {/* Stepper */}
              <div className="mt-5 flex items-center gap-1">
                {stepOrder.map((s, idx) => {
                  const done = stepIndex > idx || session.state === "completed";
                  const current = stepIndex === idx && session.state !== "failed" && session.state !== "canceled";
                  const failed = session.state === "failed" && idx === stepOrder.length - 1;
                  return (
                    <div key={s} className="flex flex-1 items-center gap-1">
                      <div className="flex-1">
                        <div className="h-[3px] w-full overflow-hidden bg-[#241d16]">
                          <div
                            className="h-full transition-all duration-700"
                            style={{
                              width: done ? "100%" : current ? "55%" : "0%",
                              background: failed ? "#b5452e" : done ? "#8fb57e" : "#c8912a",
                            }}
                          />
                        </div>
                        <p className="mt-1.5 font-mono text-[8px] uppercase tracking-[0.16em]" style={{ color: done ? "#8fb57e" : current ? "#e8b64a" : "#5a5145" }}>
                          {STATE_LABEL[s].label}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {session.error && (
                <p className="mt-4 border border-[#5a2b24] bg-[#1c0d0a] px-3 py-2 font-mono text-[10px] text-[#e07a52]">
                  ⚠️ {session.error}
                </p>
              )}
              {session.state === "completed" && (
                <div className="mt-4 grid gap-2 border border-[#5d7a52] bg-[#111a0e] p-4 font-mono text-[10px] text-[#a8c09a] sm:grid-cols-3">
                  <p><span className="text-[#6b6055]">transação</span><br />{session.transactionId ?? "—"}</p>
                  <p><span className="text-[#6b6055]">assinatura</span><br />{session.subscriptionId ?? "compra única"}</p>
                  <p><span className="text-[#6b6055]">modo</span><br />{session.simulated ? "simulado (SDK offline)" : "Paddle Checkout live"}</p>
                </div>
              )}
            </section>
          )}

          {/* ── Subscription management ────────────────────────── */}
          {subscriptions.length > 0 && (
            <section className="mt-8">
              <h4 className="mb-3 font-['Bebas_Neue'] text-2xl tracking-wide text-[#f0e6d6]">
                Gerenciar <span className="text-[#8ab0cc]">assinaturas</span>
              </h4>
              <div className="space-y-2">
                {subscriptions.map((sub) => {
                  const style = STATUS_STYLE[sub.status] ?? STATUS_STYLE.active;
                  const busy = busyId === sub.id;
                  return (
                    <div key={sub.id} className="flex flex-wrap items-center gap-3 border border-[#241d16] bg-[#0d0b09]/90 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-['Oswald'] text-sm font-semibold text-[#e4d8c4]">{sub.planName}</p>
                        <p className="font-mono text-[9px] text-[#6b6055]">
                          {sub.subscriptionId ?? sub.transactionId} · {formatBRL(sub.amountBrl)}
                          {sub.currentPeriodEnd ? ` · renova ${new Date(sub.currentPeriodEnd).toLocaleDateString("pt-BR")}` : ""}
                        </p>
                      </div>
                      <span className={`border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.16em] ${style.cls}`}>{style.label}</span>

                      <div className="flex flex-wrap gap-1.5">
                        {sub.status !== "canceled" && sub.status !== "expiring" && (
                          <>
                            <ActionBtn label="Pausar" onClick={() => runSubscriptionAction(sub, "pause")} busy={busy} />
                            <ActionBtn label="Cancelar no fim" tone="warn" onClick={() => runSubscriptionAction(sub, "cancel", "end_of_term")} busy={busy} />
                            <ActionBtn label="Cancelar agora" tone="bad" onClick={() => runSubscriptionAction(sub, "cancel", "immediately")} busy={busy} />
                          </>
                        )}
                        {(sub.status === "paused" || sub.status === "expiring" || sub.status === "canceled") && (
                          <ActionBtn label="Retomar" tone="good" onClick={() => runSubscriptionAction(sub, "resume")} busy={busy} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Billing history + webhook feed ─────────────────── */}
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <section className="border border-[#241d16] bg-[#0d0b09]/90 p-4">
              <h4 className="mb-3 font-['Oswald'] text-xs font-bold uppercase tracking-[0.24em] text-[#9a8f7a]">Histórico de faturamento</h4>
              {entitlements.length === 0 ? (
                <p className="font-mono text-[10px] text-[#5a5145]">Nenhuma transação ainda.</p>
              ) : (
                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {entitlements.map((e) => {
                    const style = STATUS_STYLE[e.status] ?? STATUS_STYLE.active;
                    return (
                      <div key={e.id} className="flex items-center justify-between gap-2 border-b border-[#1a1510] pb-1.5">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-[10px] text-[#c9bba6]">{e.planName}</p>
                          <p className="font-mono text-[8px] text-[#5a5145]">
                            {new Date(e.startsAt).toLocaleString("pt-BR")}
                            {e.refundedAt ? ` · reembolsado ${new Date(e.refundedAt).toLocaleDateString("pt-BR")}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-['Oswald'] text-xs font-semibold text-[#e8b64a]">{formatBRL(e.amountBrl)}</span>
                          <span className={`border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] ${style.cls}`}>{style.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="border border-[#241d16] bg-[#0d0b09]/90 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="font-['Oswald'] text-xs font-bold uppercase tracking-[0.24em] text-[#9a8f7a]">Eventos em tempo real</h4>
                <button
                  onClick={() => { resetEntitlements(); refresh(); showToast("Estado de testes limpo."); }}
                  className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#5a5145] hover:text-[#b5452e]"
                >
                  limpar estado
                </button>
              </div>
              {feed.length === 0 ? (
                <p className="font-mono text-[10px] text-[#5a5145]">
                  Aguardando eventos… compre algo ou dispare um webhook em{" "}
                  <span className="text-[#8a7d6c]">/api/paddle/webhook</span>
                </p>
              ) : (
                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {feed.map((f) => (
                    <p
                      key={f.id}
                      className="border-l-2 pl-2.5 font-mono text-[10px] leading-relaxed"
                      style={{
                        borderColor: f.tone === "ok" ? "#5d7a52" : f.tone === "bad" ? "#b5452e" : "#c8912a",
                        color: f.tone === "ok" ? "#a8c09a" : f.tone === "bad" ? "#e0a08a" : "#cdb87a",
                      }}
                    >
                      {f.text}
                    </p>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#2a2118] bg-[#0a0908]/95 px-5 py-2.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#5a5145] sm:px-8">
          <span>Paddle · Merchant of Record · impostos e fraude por conta deles</span>
          <span className="text-[#6b6055]">
            webhook <span className="text-[#8fb57e]">transaction.completed</span> ·{" "}
            <span className="text-[#cdb87a]">subscription.canceled</span> ·{" "}
            <span className="text-[#c08abe]">adjustment.created</span>
          </span>
        </footer>
      </div>

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[1300] -translate-x-1/2 border border-[#c8912a] bg-[#14100a]/97 px-5 py-3 font-['Oswald'] text-sm font-semibold tracking-wide text-[#e8b64a] shadow-[0_18px_50px_-18px_rgba(200,145,42,0.6)]">
          {toast}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="group relative overflow-hidden border border-[#241d16] bg-[#0d0b09]/85 px-4 py-3 transition-colors hover:border-[#4a3d2e]">
      <span className="absolute inset-x-0 bottom-0 h-[2px] origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100" style={{ background: tone }} />
      <p className="font-mono text-[8px] uppercase tracking-[0.24em] text-[#6b6055]">{label}</p>
      <p className="mt-1 font-['Oswald'] text-2xl font-semibold leading-none" style={{ color: tone }}>{value}</p>
      <p className="mt-1 font-mono text-[9px] text-[#7a6d5d]">{sub}</p>
    </div>
  );
}

function ActionBtn({ label, onClick, busy, tone = "neutral" }: { label: string; onClick: () => void; busy?: boolean; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const tones = {
    neutral: "border-[#3a3229] text-[#9a8f7a] hover:border-[#8ab0cc] hover:text-[#8ab0cc]",
    good: "border-[#3f5a36] text-[#8fb57e] hover:bg-[#111a0e]",
    warn: "border-[#5c4a1e] text-[#cdb87a] hover:bg-[#1e1a0e]",
    bad: "border-[#5a2b24] text-[#b06a52] hover:bg-[#1c0d0a]",
  } as const;
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] transition-all disabled:opacity-40 ${tones[tone]}`}
    >
      {busy ? "…" : label}
    </button>
  );
}
