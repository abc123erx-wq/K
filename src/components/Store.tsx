// ═══════════════════════════════════════════════════════════════
//  STORE — Day of the Undead
//  Manual checkout: every purchase intent opens WhatsApp, payment is
//  settled directly with the seller, and access is released through
//  single-use redeem codes typed into the "Código" tab.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { PLANS, ACCENTS, formatBRL, intervalLabel, type Plan } from "../game/paddlePlans";
import {
  whatsappOrderUrl,
  whatsappSupportUrl,
  redeemCode,
  redemptionHistory,
  WHATSAPP_DISPLAY,
  WHATSAPP_NUMBER,
  type RedemptionResult,
} from "../game/redeem";
import {
  grantLocal,
  listEntitlements,
  activeEntitlements,
  activePerks,
  deliverEntitlements,
  enforceRevocations,
  sweepExpired,
  type Entitlement,
} from "../game/entitlements";
import type { PlayerSave } from "../game/database";

type Tab = "loja" | "codigo" | "historico";

interface StoreProps {
  isOpen: boolean;
  onClose: () => void;
  save: PlayerSave | null;
  onSaveChanged: (save: PlayerSave) => void;
  player: string;
  email?: string;
  /** Opens directly on the redeem tab */
  initialTab?: Tab;
}

const FILTERS = [
  { id: "todos", label: "Tudo", icon: "◈" },
  { id: "credits", label: "Moedas", icon: "◉" },
  { id: "bundle", label: "Kits", icon: "▣" },
  { id: "subscription", label: "Assinaturas", icon: "∞" },
] as const;

export default function Store({
  isOpen,
  onClose,
  save,
  onSaveChanged,
  player,
  email,
  initialTab = "loja",
}: StoreProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("todos");
  const [codeInput, setCodeInput] = useState("");
  const [result, setResult] = useState<RedemptionResult | null>(null);
  const [buying, setBuying] = useState<Plan | null>(null);
  const [contact, setContact] = useState("");
  const [history, setHistory] = useState(redemptionHistory());
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = () => {
    sweepExpired();
    setEntitlements(listEntitlements());
    setHistory(redemptionHistory());
  };

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab);
    refresh();
    enforceRevocations(save);
    const delivered = deliverEntitlements(save);
    if (delivered.delivered > 0 && save) {
      onSaveChanged({ ...save });
      showToast(`✨ ${delivered.delivered} compra(s) aplicada(s)${delivered.coins ? ` · +${delivered.coins} moedas` : ""}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTab]);

  const active = useMemo(() => activeEntitlements(), [entitlements]);
  const perks = useMemo(() => activePerks(), [entitlements]);
  const visible = useMemo(
    () => (filter === "todos" ? PLANS : PLANS.filter((p) => p.kind === filter)),
    [filter],
  );

  if (!isOpen) return null;

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(null), 4200);
  }

  /** Opens WhatsApp with the filled order — the only "checkout" step. */
  function startWhatsAppOrder(plan: Plan) {
    setBuying(plan);
    setContact(player || "");
    // The overlay below collects the name, then opens WhatsApp.
  }

  function confirmWhatsAppOrder() {
    if (!buying) return;
    const url = whatsappOrderUrl({ plan: buying, player: contact || player, email });
    window.open(url, "_blank", "noopener,noreferrer");
    showToast("Abrindo o WhatsApp… finalize o pagamento por lá.");
    setBuying(null);
  }

  function submitCode() {
    if (!codeInput.trim()) {
      setResult({ ok: false, message: "Digite o código que você recebeu no WhatsApp." });
      return;
    }
    const res = redeemCode(codeInput, player || "Jogador");
    setResult(res);

    if (res.ok && res.plan) {
      grantLocal(res.plan, {
        transactionId: `redeem:${res.entitlementKey}`,
        email,
      });
      refresh();
      const delivered = deliverEntitlements(save);
      if (save) {
        onSaveChanged({ ...save });
      }
      setCodeInput("");
      showToast(
        `🎉 ${res.plan.name} liberado!` +
          (delivered.coins ? ` +${delivered.coins} moedas` : "") +
          (delivered.items ? ` ${delivered.items} itens` : ""),
      );
    }
  }

  return (
    <div className="fixed inset-0 z-[1200] overflow-hidden bg-[#0a0908]">
      {/* ── Ambient background ─────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_0%,#22301c_0%,#12100c_48%,#070605_100%)]" />
        <div className="absolute inset-0 opacity-[0.14] [background-image:repeating-linear-gradient(115deg,transparent_0px,transparent_9px,rgba(74,153,58,0.5)_9px,rgba(74,153,58,0.5)_10px)]" />
        <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(#7fc25a_1px,transparent_1px),linear-gradient(90deg,#7fc25a_1px,transparent_1px)] [background-size:60px_60px]" />
        <div className="absolute -left-24 top-6 h-80 w-80 rounded-full bg-[#4a9c45]/12 blur-[100px]" />
        <div className="absolute -right-20 bottom-4 h-96 w-96 rounded-full bg-[#e8b64a]/10 blur-[120px]" />
        <style>{`
          @keyframes storeSlide { from { opacity:0; transform: translateY(16px); } to { opacity:1; transform:none; } }
          @keyframes storeGlow  { 0%,100% { box-shadow: 0 0 0 0 rgba(74,153,58,.0); } 50% { box-shadow: 0 0 26px -6px rgba(74,153,58,.55); } }
          @keyframes waPulse    { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
          .store-card { animation: storeSlide .4s cubic-bezier(.2,.8,.3,1) both; }
        `}</style>
      </div>

      <div className="relative flex h-full flex-col">
        {/* ── Header ─────────────────────────────────────────── */}
        <header className="border-b border-[#22301c] bg-[#0c0a08]/93 px-5 py-4 backdrop-blur-md sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 border border-[#3a6a2a] bg-[#0f1a10] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-[#7fc25a]">
                  <span style={{ animation: "waPulse 2.2s ease-in-out infinite" }}>📱</span> WhatsApp
                </span>
                <span className="border border-[#3a3229] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[#9a8f7a]">
                  Atendimento humano
                </span>
              </div>
              <h2 className="mt-1 truncate font-['Bebas_Neue'] text-4xl leading-[0.92] tracking-wide text-[#f0e6d6] sm:text-5xl">
                Loja de <span className="text-[#7fc25a]">Suprimentos</span>
              </h2>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a7d6c]">
                Compra pelo WhatsApp <span className="text-[#7fc25a]">{WHATSAPP_DISPLAY}</span> · acesso por código de resgate
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden border border-[#22301c] bg-[#0a0908] px-3 py-2 text-right sm:block">
                <span className="block font-mono text-[8px] uppercase tracking-[0.22em] text-[#6b6055]">Saldo</span>
                <span className="font-['Oswald'] text-lg font-semibold leading-none text-[#e8b64a]">
                  {save?.coins ?? 0} <span className="text-[10px] text-[#8a7d6c]">moedas</span>
                </span>
              </div>
              <button
                onClick={onClose}
                aria-label="Fechar loja"
                className="grid h-11 w-11 place-items-center border border-[#5a2b24] bg-[#1c0d0a] font-['Oswald'] text-lg text-[#d96b3a] transition-all hover:bg-[#2a1714] active:scale-95"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Tabs */}
          <nav className="mt-4 flex flex-wrap gap-2">
            {(
              [
                { id: "loja", label: "Loja", icon: "🛒" },
                { id: "codigo", label: "Código de resgate", icon: "🔑" },
                { id: "historico", label: "Minhas compras", icon: "📜" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`border px-4 py-2 font-['Oswald'] text-[11px] font-semibold uppercase tracking-[0.18em] transition-all ${
                  tab === t.id
                    ? "border-[#7fc25a] bg-[#0f1a10] text-[#7fc25a] shadow-[0_0_20px_-6px_rgba(127,194,90,0.6)]"
                    : "border-[#22301c] bg-[#0c0a08] text-[#8a7d6c] hover:-translate-y-0.5 hover:border-[#3a4a2e] hover:text-[#c9bba6]"
                }`}
              >
                <span className="mr-1.5">{t.icon}</span>
                {t.label}
              </button>
            ))}
            {active.length > 0 && (
              <span className="ml-auto self-center border border-[#7fc25a]/40 bg-[#0f1a10] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[#7fc25a]">
                ✓ {active.length} acesso(s) ativo(s)
              </span>
            )}
          </nav>
        </header>

        {/* ── Body ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-5 sm:px-8">
          {/* ══════ TAB: LOJA ══════ */}
          {tab === "loja" && (
            <>
              {/* How it works */}
              <div className="mb-6 grid gap-2 sm:grid-cols-3">
                {[
                  { n: "1", icon: "🛒", t: "Escolha o plano", d: "Clique em comprar e o WhatsApp abre com o pedido pronto." },
                  { n: "2", icon: "💸", t: "Pague por lá", d: "PIX, cartão ou como preferir — direto com o vendedor." },
                  { n: "3", icon: "🔑", t: "Resgate o código", d: "Você recebe um código e digita na aba Código." },
                ].map((s) => (
                  <div key={s.n} className="flex items-start gap-3 border border-[#22301c] bg-[#0c0a08]/80 p-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center border border-[#7fc25a]/50 bg-[#0f1a10] font-['Oswald'] text-sm font-bold text-[#7fc25a]">
                      {s.n}
                    </span>
                    <div>
                      <p className="font-['Oswald'] text-[12px] font-semibold tracking-wide text-[#e4d8c4]">
                        {s.icon} {s.t}
                      </p>
                      <p className="mt-0.5 font-mono text-[9px] leading-relaxed text-[#8a7d6c]">{s.d}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Filters */}
              <div className="mb-4 flex flex-wrap gap-2">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`border px-4 py-2 font-['Oswald'] text-[11px] font-semibold uppercase tracking-[0.18em] transition-all ${
                      filter === f.id
                        ? "border-[#7fc25a] bg-[#0f1a10] text-[#7fc25a]"
                        : "border-[#22301c] bg-[#0c0a08] text-[#8a7d6c] hover:border-[#3a4a2e] hover:text-[#c9bba6]"
                    }`}
                  >
                    <span className="mr-1.5 opacity-70">{f.icon}</span>
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Plans */}
              <div className="grid gap-4 lg:grid-cols-3">
                {visible.map((plan, i) => {
                  const accent = ACCENTS[plan.accent];
                  const owned = plan.unlockKey ? (save?.unlockedItems ?? []).includes(plan.unlockKey) : false;
                  const recurring = plan.interval !== "one_time";
                  return (
                    <article
                      key={plan.id}
                      className="store-card group relative flex flex-col overflow-hidden border bg-[#0c0a08]/85 p-5 transition-all duration-300 hover:-translate-y-1.5"
                      style={{
                        borderColor: plan.featured ? accent.border : "#241d16",
                        boxShadow: plan.featured ? `0 0 0 1px ${accent.glow}, 0 18px 44px -22px ${accent.glow}` : "none",
                        animationDelay: `${i * 50}ms`,
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
                          {recurring
                            ? plan.interval === "year"
                              ? "Assinatura anual"
                              : "Assinatura mensal"
                            : plan.kind === "bundle"
                            ? "Pacote de itens"
                            : "Créditos"}
                        </p>
                        <h3 className="mt-1.5 font-['Bebas_Neue'] text-3xl leading-none tracking-wide text-[#f0e6d6]">{plan.name}</h3>
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
                          onClick={() => (owned ? showToast("Você já possui este plano.") : startWhatsAppOrder(plan))}
                          className="mt-5 w-full border py-3 font-['Oswald'] text-[11px] font-bold uppercase tracking-[0.22em] transition-all active:scale-[0.98]"
                          style={{ borderColor: accent.border, color: accent.text, background: accent.bg }}
                        >
                          {owned ? "✓ Adquirido" : "📱 Comprar no WhatsApp"}
                        </button>
                        {owned && recurring && (
                          <p className="mt-2 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-[#6b6055]">
                            renovação manual via WhatsApp
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Support strip */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-[#22301c] bg-[#0c0a08]/80 px-4 py-3">
                <p className="font-mono text-[10px] text-[#8a7d6c]">
                  Dúvida sobre pagamento, código ou renovação? Fale com o suporte.
                </p>
                <a
                  href={whatsappSupportUrl(player)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-[#7fc25a] bg-[#0f1a10] px-4 py-2 font-['Oswald'] text-[11px] font-bold uppercase tracking-[0.18em] text-[#7fc25a] hover:bg-[#152616]"
                >
                  💬 Falar com o suporte
                </a>
              </div>
            </>
          )}

          {/* ══════ TAB: CÓDIGO ══════ */}
          {tab === "codigo" && (
            <div className="mx-auto max-w-xl">
              <div className="border border-[#7fc25a]/40 bg-[#0c0a08]/90 p-6" style={{ animation: "storeGlow 3s ease-in-out infinite" }}>
                <div className="text-center">
                  <span className="text-5xl">🔑</span>
                  <h3 className="mt-2 font-['Bebas_Neue'] text-3xl tracking-wide text-[#f0e6d6]">Resgatar código</h3>
                  <p className="mx-auto mt-2 max-w-sm font-mono text-[10px] leading-relaxed text-[#8a7d6c]">
                    Já pagou pelo WhatsApp? Digite o código de <span className="text-[#7fc25a]">{WHATSAPP_DISPLAY}</span> abaixo
                    para liberar seu acesso imediatamente.
                  </p>
                </div>

                <label className="mt-6 block font-mono text-[9px] uppercase tracking-[0.22em] text-[#6b6055]">
                  Código de resgate
                </label>
                <input
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value.toUpperCase());
                    setResult(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && submitCode()}
                  placeholder="DOU-XXXX-XXXX"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={16}
                  className="mt-2 w-full border border-[#3a6a2a] bg-black px-4 py-4 text-center font-['Oswald'] text-2xl font-bold tracking-[0.28em] text-[#7fc25a] outline-none transition-colors placeholder:text-[#2f3a28] focus:border-[#7fc25a] focus:shadow-[0_0_24px_-8px_rgba(127,194,90,0.7)]"
                />
                <p className="mt-2 text-center font-mono text-[9px] text-[#6b6055]">
                  Formato: DOU-XXXX-XXXX · não diferencia maiúsculas
                </p>

                <button
                  onClick={submitCode}
                  className="mt-4 w-full border border-[#7fc25a] bg-[#0f1a10] py-4 font-['Oswald'] text-sm font-bold uppercase tracking-[0.24em] text-[#7fc25a] transition-all hover:bg-[#152616] active:scale-[0.98]"
                >
                  🔓 Resgatar acesso
                </button>

                {/* Result */}
                {result && (
                  <div
                    className="mt-4 border p-4"
                    style={{
                      borderColor: result.ok ? "#7fc25a" : "#b5452e",
                      background: result.ok ? "rgba(127,194,90,0.07)" : "rgba(181,69,46,0.07)",
                    }}
                  >
                    <p
                      className="font-['Oswald'] text-sm font-bold tracking-wide"
                      style={{ color: result.ok ? "#7fc25a" : "#e07a52" }}
                    >
                      {result.ok ? "✅ " : "⚠️ "}
                      {result.message}
                    </p>

                    {result.ok && result.plan && (
                      <div className="mt-3 space-y-1 border-t border-[#2a3a28] pt-3 font-mono text-[10px] text-[#a8c09a]">
                        <p>▸ {result.plan.name} — {formatBRL(result.plan.amountBrl)}</p>
                        {result.plan.coins && <p>▸ +{result.plan.coins} moedas na conta</p>}
                        {result.plan.items?.length ? <p>▸ {result.plan.items.length} itens entregues no próximo jogo</p> : null}
                        {result.plan.unlockKey && <p>▸ Conteúdo desbloqueado permanentemente</p>}
                      </div>
                    )}

                    {!result.ok && (
                      <a
                        href={whatsappSupportUrl(player, codeInput)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-2 border border-[#3a6a2a] bg-[#0f1a10] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#7fc25a] hover:bg-[#152616]"
                      >
                        💬 Pedir ajuda no WhatsApp
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Recent redemptions for this browser */}
              {history.length > 0 && (
                <div className="mt-5 border border-[#22301c] bg-[#0c0a08]/80 p-4">
                  <p className="mb-2 font-['Oswald'] text-xs font-bold uppercase tracking-[0.24em] text-[#9a8f7a]">
                    Resgates neste dispositivo
                  </p>
                  <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                    {history.slice(0, 12).map((h) => (
                      <div key={h.code} className="flex items-center justify-between gap-2 border-b border-[#1a1510] pb-1.5">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-[10px] text-[#c9bba6]">{h.planName}</p>
                          <p className="font-mono text-[8px] text-[#5a5145]">
                            {h.code} · {new Date(h.ts).toLocaleString("pt-BR")}
                          </p>
                        </div>
                        <span className="shrink-0 font-['Oswald'] text-xs font-semibold text-[#e8b64a]">
                          {formatBRL(h.amountBrl)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════ TAB: HISTÓRICO ══════ */}
          {tab === "historico" && (
            <div className="mx-auto max-w-3xl">
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Acessos ativos", value: `${active.length}`, tone: "#7fc25a" },
                  { label: "Benefícios", value: `${perks.length}`, tone: "#e8b64a" },
                  { label: "Compras registradas", value: `${entitlements.length}`, tone: "#8ab0cc" },
                ].map((s) => (
                  <div key={s.label} className="border border-[#22301c] bg-[#0c0a08]/80 px-4 py-3">
                    <p className="font-mono text-[8px] uppercase tracking-[0.24em] text-[#6b6055]">{s.label}</p>
                    <p className="mt-1 font-['Oswald'] text-2xl font-semibold leading-none" style={{ color: s.tone }}>
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>

              {perks.length > 0 && (
                <div className="mb-4 border border-[#3a6a2a]/40 bg-[#0f1a10]/60 p-4">
                  <p className="mb-2 font-['Oswald'] text-xs font-bold uppercase tracking-[0.24em] text-[#7fc25a]">
                    Benefícios ativos
                  </p>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {perks.map((p) => (
                      <li key={p} className="flex items-start gap-2 font-mono text-[10px] text-[#a8c09a]">
                        <span className="text-[#7fc25a]">▸</span> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <h4 className="mb-3 font-['Bebas_Neue'] text-2xl tracking-wide text-[#f0e6d6]">Todas as transações</h4>
              {entitlements.length === 0 ? (
                <p className="font-mono text-[10px] text-[#5a5145]">Nenhuma compra registrada ainda.</p>
              ) : (
                <div className="space-y-2">
                  {entitlements.map((e) => {
                    const statusLabel =
                      e.status === "active" ? "Ativo" :
                      e.status === "canceled" ? "Cancelado" :
                      e.status === "refunded" ? "Reembolsado" :
                      e.status === "expiring" ? "Encerrando" :
                      e.status === "paused" ? "Pausado" :
                      e.status === "expired" ? "Expirado" : e.status;
                    const tone =
                      e.status === "active" ? "#7fc25a" :
                      e.status === "refunded" || e.status === "canceled" ? "#b5452e" :
                      "#c8912a";
                    return (
                      <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 border border-[#241d16] bg-[#0c0a08]/80 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate font-['Oswald'] text-sm font-semibold text-[#e4d8c4]">{e.planName}</p>
                          <p className="font-mono text-[9px] text-[#6b6055]">
                            {e.subscriptionId ?? e.transactionId ?? e.id} ·{" "}
                            {new Date(e.startsAt).toLocaleString("pt-BR")}
                            {e.currentPeriodEnd ? ` · válido até ${new Date(e.currentPeriodEnd).toLocaleDateString("pt-BR")}` : " · permanente"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-['Oswald'] text-sm font-bold text-[#e8b64a]">{formatBRL(e.amountBrl)}</span>
                          <span className="border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em]" style={{ borderColor: tone, color: tone }}>
                            {statusLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <a
                href={whatsappSupportUrl(player)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-2 border border-[#7fc25a] bg-[#0f1a10] px-4 py-2.5 font-['Oswald'] text-[11px] font-bold uppercase tracking-[0.18em] text-[#7fc25a] hover:bg-[#152616]"
              >
                💬 Renovar ou suporte no WhatsApp
              </a>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#22301c] bg-[#0a0908]/95 px-5 py-2.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[#5a5145] sm:px-8">
          <span>
            Vendas manuais · WhatsApp{" "}
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#7fc25a] hover:underline"
            >
              {WHATSAPP_DISPLAY}
            </a>
          </span>
          <span>
            pagamento direto ao vendedor · acesso liberado por <span className="text-[#7fc25a]">código único</span>
          </span>
        </footer>
      </div>

      {/* ── Confirm order overlay ─────────────────────────────── */}
      {buying && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm">
          <div className="w-full max-w-sm border-2 border-[#3a6a2a] bg-[#0c0a08] p-6 shadow-2xl">
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#6b6055]">Confirmar pedido</p>
            <h3 className="mt-1 font-['Bebas_Neue'] text-3xl tracking-wide text-[#f0e6d6]">{buying.name}</h3>
            <div className="mt-3 border-y border-[#241d16] py-3">
              <p className="font-['Oswald'] text-3xl font-bold leading-none text-[#7fc25a]">{formatBRL(buying.amountBrl)}</p>
              <p className="font-mono text-[10px] text-[#8a7d6c]">{intervalLabel(buying) || "pagamento único"} · via WhatsApp</p>
            </div>

            <label className="mt-4 block font-mono text-[9px] uppercase tracking-[0.22em] text-[#6b6055]">
              Seu nome de jogador (vai na mensagem)
            </label>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={player || "Como devemos te chamar?"}
              autoFocus
              className="mt-2 w-full border border-[#22301c] bg-black px-3 py-3 font-mono text-xs text-[#d8cbb6] outline-none focus:border-[#7fc25a]"
            />

            <ol className="mt-4 space-y-1.5 border border-[#22301c] bg-[#0a0908] p-3 font-mono text-[9px] leading-relaxed text-[#8a7d6c]">
              <li>1. O WhatsApp abre com seu pedido já escrito</li>
              <li>2. Combine e faça o pagamento por lá</li>
              <li>3. Você recebe um código DOU-XXXX-XXXX</li>
              <li>4. Resgate na aba <span className="text-[#7fc25a]">🔑 Código</span></li>
            </ol>

            <button
              onClick={confirmWhatsAppOrder}
              className="mt-4 w-full border border-[#7fc25a] bg-[#0f1a10] py-4 font-['Oswald'] text-sm font-bold uppercase tracking-[0.22em] text-[#7fc25a] transition-all hover:bg-[#152616] active:scale-[0.98]"
            >
              📱 Abrir WhatsApp
            </button>
            <button
              onClick={() => setBuying(null)}
              className="mt-2 w-full py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#6b6055] hover:text-[#c9bba6]"
            >
              cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Toast ─────────────────────────────────────────────── */}
      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[1400] -translate-x-1/2 border border-[#7fc25a] bg-[#0f1a10]/97 px-5 py-3 font-['Oswald'] text-sm font-semibold tracking-wide text-[#7fc25a] shadow-[0_18px_50px_-18px_rgba(127,194,90,0.6)]">
          {toast}
        </div>
      )}
    </div>
  );
}
