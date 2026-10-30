// ═══════════════════════════════════════════════════════════════
//  SHOP — Day of the Undead store (Abacate Pay)
//  Cards, PIX, purchase history and entitlements.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { SHOP_ITEMS, SHOP_CATEGORIES, formatBRL, type ShopItem } from "../game/shop";
import {
  createCharge,
  onChargeConfirmed,
  recordPurchase,
  getPurchases,
  getLifetimeSpent,
  type Charge,
} from "../game/payments";
import { Database, type PlayerSave } from "../game/database";

interface ShopPanelProps {
  isOpen: boolean;
  onClose: () => void;
  save: PlayerSave | null;
  onSaveChanged: (save: PlayerSave) => void;
  username: string;
  email: string;
}

type CheckoutState =
  | { step: "closed" }
  | { step: "details"; item: ShopItem }
  | { step: "pix"; item: ShopItem; charge: Charge }
  | { step: "success"; item: ShopItem };

export default function ShopPanel({ isOpen, onClose, save, onSaveChanged, username, email }: ShopPanelProps) {
  const [category, setCategory] = useState<string>("todos");
  const [checkout, setCheckout] = useState<CheckoutState>({ step: "closed" });
  const [card, setCard] = useState({ number: "", holder: username, expiry: "", cvv: "", installments: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [purchases, setPurchases] = useState(getPurchases());

  // Listen for sandbox charge confirmations
  useEffect(() => {
    const unsubscribe = onChargeConfirmed((charge) => {
      setCheckout((current) => {
        if (current.step === "pix" && current.charge.id === charge.id) {
          grantEntitlement(current.item, charge);
          return { step: "success", item: current.item };
        }
        return current;
      });
    });
    return unsubscribe;
  }, [checkout]);

  if (!isOpen) return null;

  const filtered = useMemo(
    () => (category === "todos" ? SHOP_ITEMS : SHOP_ITEMS.filter((i) => i.category === category)),
    [category],
  );

  const grantEntitlement = (item: ShopItem, charge: Charge) => {
    if (!save) return;
    if (item.coins) Database.addCoins(save, item.coins);
    if (item.unlockedKey) Database.unlockItem(save, item.unlockedKey);
    if (item.items?.length) {
      // Items are delivered via localStorage queue, applied on next game start.
      const queue = JSON.parse(localStorage.getItem("knox-pending-items") || "[]") as string[];
      queue.push(...item.items);
      localStorage.setItem("knox-pending-items", JSON.stringify(queue));
    }
    Database.save(save);
    onSaveChanged({ ...save });
    recordPurchase({
      id: `pur_${Math.random().toString(36).slice(2, 10)}`,
      chargeId: charge.id,
      itemId: item.id,
      amount: item.price,
      method: charge.method,
      status: "paid",
      ts: Date.now(),
    });
    setPurchases(getPurchases());
  };

  const startCardPayment = async (item: ShopItem) => {
    setBusy(true);
    setError("");
    try {
      if (card.number.replace(/\s/g, "").length < 12) throw new Error("Número de cartão inválido");
      if (!card.expiry.includes("/")) throw new Error("Validade inválida (use MM/AA)");
      if (card.cvv.length < 3) throw new Error("CVV inválido");
      const charge = await createCharge({
        amount: item.price,
        currency: "BRL",
        method: "card",
        description: item.name,
        customer: { name: username, email },
        card: { ...card, number: card.number.replace(/\s/g, "") },
        metadata: { itemId: item.id },
      });
      // Card charges auto-confirm via webhook listener; wait briefly.
      setCheckout({ step: "pix", item, charge });
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  };

  const startPixPayment = async (item: ShopItem) => {
    setBusy(true);
    setError("");
    try {
      const charge = await createCharge({
        amount: item.price,
        currency: "BRL",
        method: "pix",
        description: item.name,
        customer: { name: username, email },
        metadata: { itemId: item.id },
      });
      setCheckout({ step: "pix", item, charge });
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  };

  const owned = (item: ShopItem) =>
    item.unlockedKey ? (save?.unlockedItems ?? []).includes(item.unlockedKey) : false;

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/85 p-2 backdrop-blur-sm">
      <div className="relative flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden border-2 border-[#2a2a2a] bg-[#0b0b0b] shadow-2xl shadow-black">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2a2a2a] bg-[#0d0d0d] px-5 py-4">
          <div>
            <h2 className="text-xl font-black uppercase tracking-widest text-[#d96b3a]">🛒 Loja — Day of the Undead</h2>
            <p className="mt-0.5 text-[10px] uppercase tracking-widest text-zinc-600">
              Pagamento processado por <span className="text-[#3a9a4a]">🥑 Abacate Pay</span> · Sandbox ativo
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="border border-[#2a2a2a] bg-black px-3 py-1.5 text-right">
              <span className="block text-[9px] uppercase tracking-widest text-zinc-500">Seu saldo</span>
              <span className="text-sm font-black text-[#d96b3a]">🪙 {save?.coins ?? 0} moedas</span>
            </div>
            <button onClick={onClose} className="grid h-9 w-9 place-items-center border border-[#5a2b24] bg-[#1a0d0b] text-lg text-[#d96b3a] hover:bg-[#2a1714]">✕</button>
          </div>
        </div>

        {/* Main content: either checkout or catalog */}
        {checkout.step === "closed" ? (
          <>
            {/* Categories */}
            <div className="flex flex-wrap gap-1 border-b border-[#2a2a2a] bg-[#080808] px-4 py-2">
              {SHOP_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`border px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors ${
                    category === c.id
                      ? "border-[#d96b3a] bg-[#2a1714] text-[#d96b3a] font-bold"
                      : "border-[#2a2a2a] text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {c.icon} {c.label}
                </button>
              ))}
            </div>

            {/* Catalog grid */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((item) => (
                  <div
                    key={item.id}
                    className={`relative flex flex-col border p-3 transition-colors ${
                      owned(item)
                        ? "border-[#4a5c45] bg-[#0f1a10]"
                        : "border-[#1f2521] bg-[#0d0d0d] hover:border-[#4a5c45]"
                    }`}
                  >
                    {item.badge && (
                      <span className="absolute -top-2 right-2 border border-[#d96b3a] bg-[#2a1714] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-[#d96b3a]">
                        {item.badge}
                      </span>
                    )}
                    <div className="flex items-start gap-3">
                      <span className="text-3xl">{item.emoji}</span>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-zinc-200">{item.name}</h3>
                        <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">{item.desc}</p>
                        {item.coins && (
                          <p className="mt-1 text-[10px] font-bold text-[#d96b3a]">+{item.coins} moedas</p>
                        )}
                        {item.items && (
                          <p className="mt-1 text-[9px] text-[#7f936f]">🎁 {item.items.length} itens no jogo</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-[#1a1a1a] pt-2">
                      <span className="text-base font-black text-[#d7c9a7]">{formatBRL(item.price)}</span>
                      {owned(item) ? (
                        <span className="border border-[#4a5c45] bg-[#1f2521] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#4aff4a]">✓ Adquirido</span>
                      ) : (
                        <button
                          onClick={() => setCheckout({ step: "details", item })}
                          className="border border-[#8a2f22] bg-[#2a1714] px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-[#d96b3a] hover:bg-[#3a2218]"
                        >
                          Comprar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Purchase history */}
              <div className="mt-5 border-t border-[#2a2a2a] pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500">Histórico de compras</p>
                  <p className="text-[10px] text-zinc-600">Total gasto: <span className="text-[#d7c9a7]">{formatBRL(getLifetimeSpent())}</span></p>
                </div>
                {purchases.length === 0 ? (
                  <p className="mt-2 text-[11px] text-zinc-700">Nenhuma compra ainda.</p>
                ) : (
                  <div className="mt-2 max-h-28 space-y-1 overflow-y-auto text-[10px]">
                    {purchases.map((p) => (
                      <div key={p.id} className="flex items-center justify-between border-b border-[#141414] py-1">
                        <span className="text-zinc-400">
                          {SHOP_ITEMS.find((i) => i.id === p.itemId)?.emoji ?? "🛍️"} {SHOP_ITEMS.find((i) => i.id === p.itemId)?.name ?? p.itemId}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className={`font-bold ${p.status === "paid" ? "text-[#4aff4a]" : p.status === "refunded" ? "text-red-400" : "text-zinc-500"}`}>
                            {p.status === "paid" ? "PAGO" : p.status.toUpperCase()}
                          </span>
                          <span className="text-zinc-500">{formatBRL(p.amount)} · {p.method.toUpperCase()}</span>
                          <span className="text-zinc-700">{new Date(p.ts).toLocaleDateString("pt-BR")}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : checkout.step === "details" ? (
          /* ── PAYMENT METHOD SELECTION ── */
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-md">
              <button onClick={() => setCheckout({ step: "closed" })} className="mb-4 text-[11px] text-zinc-500 hover:text-zinc-300">← Voltar à loja</button>
              <div className="border border-[#2a2a2a] bg-[#0d0d0d] p-5">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{checkout.item.emoji}</span>
                  <div>
                    <h3 className="text-lg font-black text-zinc-100">{checkout.item.name}</h3>
                    <p className="text-xs text-zinc-500">{checkout.item.desc}</p>
                  </div>
                </div>
                <div className="mt-4 border-t border-[#1f2521] pt-3 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500">Total a pagar</p>
                  <p className="text-3xl font-black text-[#d96b3a]">{formatBRL(checkout.item.price)}</p>
                </div>
                {error && <p className="mt-3 border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-400">⚠️ {error}</p>}
              </div>

              {/* PIX */}
              <button
                onClick={() => startPixPayment(checkout.item)}
                disabled={busy}
                className="mt-4 w-full border-2 border-[#3a9a4a] bg-[#0f1a10] p-4 text-left hover:bg-[#152616] disabled:opacity-50"
              >
                <span className="block text-sm font-black uppercase tracking-widest text-[#3a9a4a]">📱 Pagar com PIX</span>
                <span className="block text-[10px] text-zinc-500">Aprovação instantânea no sandbox · QR code</span>
              </button>

              {/* Card */}
              <div className="mt-4 border border-[#2a2a2a] bg-[#0d0d0d] p-4">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-zinc-400">💳 Cartão de crédito</p>
                <div className="space-y-2">
                  <input
                    value={card.number}
                    onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, "").slice(0, 19) })}
                    placeholder="Número do cartão"
                    className="w-full border border-[#2a2a2a] bg-black px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-[#4a5c45]"
                  />
                  <input
                    value={card.holder}
                    onChange={(e) => setCard({ ...card, holder: e.target.value })}
                    placeholder="Nome do titular"
                    className="w-full border border-[#2a2a2a] bg-black px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-[#4a5c45]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={card.expiry}
                      onChange={(e) => setCard({ ...card, expiry: e.target.value.replace(/[^\d/]/g, "").slice(0, 5) })}
                      placeholder="MM/AA"
                      className="border border-[#2a2a2a] bg-black px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-[#4a5c45]"
                    />
                    <input
                      value={card.cvv}
                      onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                      placeholder="CVV"
                      type="password"
                      className="border border-[#2a2a2a] bg-black px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-[#4a5c45]"
                    />
                  </div>
                  <select
                    value={card.installments}
                    onChange={(e) => setCard({ ...card, installments: Number(e.target.value) })}
                    className="w-full border border-[#2a2a2a] bg-black px-3 py-2.5 text-sm text-zinc-300 outline-none"
                  >
                    {[1, 2, 3, 6, 12].map((n) => (
                      <option key={n} value={n}>
                        {n}x de {formatBRL(checkout.item.price / n)} sem juros
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => startCardPayment(checkout.item)}
                  disabled={busy}
                  className="mt-3 w-full bg-[#8a2f22] py-3 text-sm font-black uppercase tracking-widest text-zinc-100 hover:bg-[#b5452e] disabled:opacity-50"
                >
                  {busy ? "Processando..." : `Pagar ${formatBRL(checkout.item.price)}`}
                </button>
              </div>
            </div>
          </div>
        ) : checkout.step === "pix" ? (
          /* ── PIX QR / PROCESSING ── */
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-sm text-center">
              <p className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Aguardando confirmação</p>
              <h3 className="mb-4 text-xl font-black text-[#d96b3a]">{checkout.item.name}</h3>
              {checkout.charge.pix ? (
                <>
                  <div className="mx-auto grid h-56 w-56 place-items-center border border-[#3a9a4a] bg-white">
                    {/* Sandbox QR placeholder (would be the provider's image) */}
                    <svg viewBox="0 0 100 100" className="h-full w-full p-3">
                      <rect width="100" height="100" fill="#fff" />
                      {Array.from({ length: 21 }, (_, y) =>
                        Array.from({ length: 21 }, (_, x) => (
                          ((x * 7 + y * 13 + checkout.charge.id.length) % 3) < 1 && !(x < 3 && y < 3) && !(x > 17 && y < 3) && !(x < 3 && y > 17) ? (
                            <rect key={`${x}-${y}`} x={x * 4.5 + 2} y={y * 4.5 + 2} width="3" height="3" fill="#111" />
                          ) : null
                        )),
                      )}
                    </svg>
                  </div>
                  <p className="mt-3 text-xs text-zinc-400">
                    Expira em <span className="text-[#d7c9a7]">{new Date(checkout.charge.pix.expiration).toLocaleTimeString("pt-BR")}</span>
                  </p>
                </>
              ) : (
                <div className="mx-auto grid h-56 w-56 place-items-center">
                  <div className="h-14 w-14 animate-spin rounded-full border-4 border-[#2a2a2a] border-t-[#d96b3a]" />
                </div>
              )}
              <p className="mt-4 text-[11px] text-zinc-500">
                {checkout.charge.method === "pix"
                  ? "Escaneie o QR code com seu banco. No sandbox a confirmação é automática."
                  : "Processando pagamento no sandbox... a confirmação é automática."}
              </p>
              <button
                onClick={() => setCheckout({ step: "closed" })}
                className="mt-4 border border-[#2a2a2a] px-4 py-2 text-[11px] uppercase tracking-widest text-zinc-400 hover:bg-[#1f2521]"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          /* ── SUCCESS ── */
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-sm text-center">
              <div className="text-6xl">🎉</div>
              <h3 className="mt-3 text-2xl font-black uppercase text-[#4aff4a]">Compra aprovada!</h3>
              <p className="mt-2 text-sm text-zinc-300">{checkout.item.name} foi adicionado à sua conta.</p>
              <div className="mt-4 space-y-1 border border-[#2a2a2a] bg-[#0d0d0d] p-4 text-left text-xs text-zinc-400">
                {checkout.item.coins && <p>🪙 <span className="text-[#d96b3a]">+{checkout.item.coins}</span> moedas adicionadas</p>}
                {checkout.item.unlockedKey && <p>🎨 Cosmético/VIP desbloqueado permanentemente</p>}
                {checkout.item.items && <p>🎁 <span className="text-[#7f936f]">{checkout.item.items.length} itens</span> entregues no seu próximo jogo</p>}
                <p className="pt-2 text-[10px] text-zinc-600">Novo saldo: 🪙 {save?.coins ?? 0}</p>
              </div>
              <button
                onClick={() => setCheckout({ step: "closed" })}
                className="mt-5 w-full bg-[#4a5c45] py-3 text-sm font-black uppercase tracking-widest text-zinc-100 hover:bg-[#5a6c55]"
              >
                Voltar à loja
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-[#2a2a2a] bg-[#080808] px-5 py-2 text-center text-[9px] uppercase tracking-widest text-zinc-700">
          🥑 Abacate Pay · <span className="text-zinc-600">abc_dev_c5NxrpC6xtRm5dncQr0PPQET</span> · Transações protegidas · Reembolso em 7 dias
        </div>
      </div>
    </div>
  );
}
