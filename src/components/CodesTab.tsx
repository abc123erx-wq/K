// ═══════════════════════════════════════════════════════════════
//  CODES TAB — generate & manage WhatsApp redeem codes (admin only)
// ═══════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { PLANS, formatBRL } from "../game/paddlePlans";
import {
  listCodes,
  generateCode,
  generateCodes,
  revokeCode,
  deleteCode,
  codeMessage,
  statsCodes,
  WHATSAPP_NUMBER,
  WHATSAPP_DISPLAY,
  type RedeemCode,
} from "../game/redeem";

interface CodesTabProps {
  onLog: (line: string) => void;
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  unused: { label: "Disponível", cls: "border-[#5d7a52] bg-[#111a0e] text-[#8fb57e]" },
  redeemed: { label: "Utilizado", cls: "border-[#4f6a80] bg-[#101a22] text-[#8ab0cc]" },
  revoked: { label: "Cancelado", cls: "border-[#5a2b24] bg-[#1c0d0a] text-[#b06a52]" },
  expired: { label: "Expirado", cls: "border-[#3a3a3a] bg-[#141414] text-[#8a8a8a]" },
};

export default function CodesTab({ onLog }: CodesTabProps) {
  const [version, bump] = useState(0);
  const [planId, setPlanId] = useState(PLANS[0].id);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<"all" | "unused" | "redeemed" | "revoked">("all");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const codes = useMemo(() => {
    void version;
    const list = listCodes();
    const q = search.trim().toLowerCase();
    return list.filter((c) => {
      const statusOk = filter === "all" || c.status === filter;
      const searchOk =
        !q ||
        c.code.toLowerCase().includes(q) ||
        c.planName.toLowerCase().includes(q) ||
        (c.redeemedBy ?? "").toLowerCase().includes(q) ||
        (c.note ?? "").toLowerCase().includes(q);
      return statusOk && searchOk;
    });
  }, [version, filter, search]);

  const stats = useMemo(() => {
    void version;
    return statsCodes();
  }, [version]);

  const refresh = () => bump((v) => v + 1);

  function copy(text: string, id: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(id);
        window.setTimeout(() => setCopied(null), 1600);
      },
      () => onLog("Falha ao copiar (clipboard bloqueado)."),
    );
  }

  function create(q: number) {
    const created = q === 1 ? [generateCode(planId, note || undefined)] : generateCodes(planId, q, note || undefined);
    onLog(`Gerado(s) ${created.length} código(s) para ${created[0].planName}.`);
    refresh();
    return created;
  }

  function createAndCopy() {
    const [c] = create(1);
    if (c) copy(codeMessage(c), c.code);
  }

  function openWhatsAppWith(code: RedeemCode) {
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(codeMessage(code))}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4">
      <div className="border border-[#c8912a]/40 bg-[#1a1408]/60 p-3">
        <p className="font-['Oswald'] text-xs font-bold uppercase tracking-[0.24em] text-[#e8b64a]">
          🔑 Vendas via WhatsApp — gerador de códigos
        </p>
        <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-[#a89a86]">
          Gere um código único, envie para o comprador pelo WhatsApp ({WHATSAPP_DISPLAY}) e ele resgata na aba{" "}
          <span className="text-[#7fc25a]">🔑 Código de resgate</span> da loja. Cada código funciona uma única vez.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { label: "Total", value: stats.total, tone: "#c9bba6" },
          { label: "Disponíveis", value: stats.unused, tone: "#8fb57e" },
          { label: "Utilizados", value: stats.redeemed, tone: "#8ab0cc" },
          { label: "Cancelados", value: stats.revoked, tone: "#b06a52" },
          { label: "Receita", value: formatBRL(stats.revenueEstimate), tone: "#e8b64a" },
        ].map((s) => (
          <div key={s.label} className="border border-[#241d16] bg-[#0a0a0a] p-2.5">
            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#6b6055]">{s.label}</p>
            <p className="mt-0.5 font-['Oswald'] text-lg font-semibold leading-none" style={{ color: s.tone }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Generator */}
      <div className="border border-[#241d16] bg-[#0a0a0a] p-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-[#7f936f]">Gerar código</p>

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="font-mono text-[9px] text-zinc-500">Plano</label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="w-full border border-[#2a2a2a] bg-black px-2 py-2 text-xs text-zinc-200 outline-none focus:border-[#c8912a]"
            >
              {PLANS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatBRL(p.amountBrl)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-mono text-[9px] text-zinc-500">Quantidade</label>
            <input
              type="number"
              min={1}
              max={200}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
              className="w-full border border-[#2a2a2a] bg-black px-2 py-2 text-xs text-zinc-200 outline-none focus:border-[#c8912a]"
            />
          </div>
        </div>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anotação interna (ex: nome do comprador, ID do PIX)"
          className="mt-2 w-full border border-[#2a2a2a] bg-black px-3 py-2 text-xs text-zinc-200 outline-none focus:border-[#c8912a]"
        />

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => create(qty)}
            className="border border-[#c8912a] bg-[#1a1408] px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-[#e8b64a] hover:bg-[#241a08]"
          >
            🔑 Gerar {qty > 1 ? `${qty} códigos` : "código"}
          </button>
          <button
            onClick={createAndCopy}
            className="border border-[#7fc25a] bg-[#0f1a10] px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-[#7fc25a] hover:bg-[#152616]"
          >
            📋 Gerar e copiar mensagem
          </button>
        </div>
        <p className="mt-1.5 font-mono text-[9px] text-zinc-600">
          "Gerar e copiar" já copia a mensagem pronta — cole direto no chat do comprador.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "unused", "redeemed", "revoked"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`border px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest ${
              filter === f ? "border-[#c8912a] bg-[#1a1408] text-[#e8b64a]" : "border-[#2a2a2a] text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {f === "all" ? "todos" : f}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar código / comprador..."
          className="ml-auto w-48 border border-[#2a2a2a] bg-black px-3 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-[#c8912a]"
        />
      </div>

      {/* Code list */}
      <div className="space-y-1.5">
        {codes.length === 0 ? (
          <p className="border border-[#1f2521] bg-[#0a0a0a] p-4 text-center font-mono text-[10px] text-zinc-600">
            Nenhum código {filter !== "all" ? `com status "${filter}"` : "gerado ainda"}.
          </p>
        ) : (
          codes.slice(0, 60).map((c) => {
            const style = STATUS_STYLE[c.status] ?? STATUS_STYLE.unused;
            const plan = PLANS.find((p) => p.id === c.planId);
            return (
              <div key={c.code} className="border border-[#1f2521] bg-[#0a0a0a] px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-[13px] font-bold tracking-[0.14em] text-[#e8b64a]">{c.code}</code>
                  <span className={`border px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.12em] ${style.cls}`}>
                    {style.label}
                  </span>
                  {c.status === "redeemed" && (
                    <span className="font-mono text-[9px] text-[#8ab0cc]">por {c.redeemedBy ?? "?"}</span>
                  )}
                </div>

                <p className="mt-1 font-mono text-[9px] text-zinc-500">
                  {c.planName} · {plan ? formatBRL(plan.amountBrl) : "—"} ·{" "}
                  {new Date(c.createdAt).toLocaleString("pt-BR")}
                  {c.redeemedAt ? ` · resgatado ${new Date(c.redeemedAt).toLocaleString("pt-BR")}` : ""}
                  {c.note ? ` · 📝 ${c.note}` : ""}
                </p>

                <div className="mt-1.5 flex flex-wrap gap-1">
                  <MiniBtn label={copied === c.code ? "✓ copiado" : "📋 código"} onClick={() => copy(c.code, c.code)} />
                  <MiniBtn label="💬 mensagem" onClick={() => copy(codeMessage(c), `msg-${c.code}`)} />
                  <MiniBtn label="📱 wa.me" onClick={() => openWhatsAppWith(c)} />
                  {c.status === "unused" && (
                    <MiniBtn label="🚫 revogar" tone="bad" onClick={() => { revokeCode(c.code); onLog(`Código ${c.code} revogado.`); refresh(); }} />
                  )}
                  <MiniBtn label="🗑 excluir" tone="bad" onClick={() => { deleteCode(c.code); onLog(`Código ${c.code} excluído.`); refresh(); }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function MiniBtn({ label, onClick, tone = "neutral" }: { label: string; onClick: () => void; tone?: "neutral" | "bad" }) {
  return (
    <button
      onClick={onClick}
      className={`border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors ${
        tone === "bad"
          ? "border-[#5a2b24] text-[#b06a52] hover:bg-[#1c0d0a]"
          : "border-[#3a3229] text-zinc-400 hover:border-[#c8912a] hover:text-[#e8b64a]"
      }`}
    >
      {label}
    </button>
  );
}
