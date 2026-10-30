// ═══════════════════════════════════════════════════════════════
//  REDEEM CODES — manual payment flow via WhatsApp
//
//  1. Player picks a plan → WhatsApp opens with a pre-filled order.
//  2. You receive payment (PIX / card / whatever you agree on).
//  3. You generate a single-use code in the Admin Panel.
//  4. Player redeems the code here → entitlement granted.
//
//  Codes are stored in localStorage, signed with a checksum so that
//  casual tampering (editing the JSON by hand) is detected.
// ═══════════════════════════════════════════════════════════════

import { PLANS, type Plan } from "./paddlePlans";
import {
  sign as hmacSign,
  verifySignature,
  sanitizeText,
  redemptionAllowed,
  registerRedemptionAttempt,
  audit,
} from "./security";

export const WHATSAPP_NUMBER = "5518996369846"; // +55 18 996369846
export const WHATSAPP_DISPLAY = "+55 18 99636-9846";

export type CodeStatus = "unused" | "redeemed" | "revoked" | "expired";

export interface RedeemCode {
  code: string;
  planId: string;
  planName: string;
  status: CodeStatus;
  createdAt: number;
  /** Player that consumed the code */
  redeemedBy?: string;
  redeemedAt?: number;
  /** Optional buyer note you write when generating */
  note?: string;
  expiresAt?: number;
}

export interface RedemptionResult {
  ok: boolean;
  message: string;
  plan?: Plan;
  entitlementKey?: string;
}

// ── Storage ─────────────────────────────────────────────────────
const CODES_KEY = "whatsapp-redeem-codes";
const LEDGER_KEY = "whatsapp-redeem-ledger";

/**
 * HMAC-style signature binding a code to its plan, status and creation
 * time. Hand-editing any field invalidates the signature, so forged or
 * replayed codes are rejected on load.
 */
function signEntry(entry: RedeemCode): string {
  return hmacSign(`${entry.code}|${entry.planId}|${entry.status}|${entry.createdAt}`);
}

function loadCodes(): RedeemCode[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CODES_KEY) || "[]") as (RedeemCode & { sig?: string })[];
    // Drop entries whose signature no longer matches (tampered with)
    return raw.filter((c) => !c.sig || verifySignature(`${c.code}|${c.planId}|${c.status}|${c.createdAt}`, c.sig));
  } catch {
    return [];
  }
}

function saveCodes(list: RedeemCode[]) {
  const signed = list.map((c) => ({ ...c, sig: signEntry(c) }));
  try {
    localStorage.setItem(CODES_KEY, JSON.stringify(signed.slice(0, 400)));
  } catch { /* quota */ }
}

export function listCodes(): RedeemCode[] {
  return loadCodes().sort((a, b) => b.createdAt - a.createdAt);
}

export function codesByStatus(status: CodeStatus): RedeemCode[] {
  return listCodes().filter((c) => c.status === status);
}

export function statsCodes() {
  const all = listCodes();
  return {
    total: all.length,
    unused: all.filter((c) => c.status === "unused").length,
    redeemed: all.filter((c) => c.status === "redeemed").length,
    revoked: all.filter((c) => c.status === "revoked").length,
    revenueEstimate: all
      .filter((c) => c.status === "redeemed")
      .reduce((sum, c) => sum + (PLANS.find((p) => p.id === c.planId)?.amountBrl ?? 0), 0),
  };
}

// ── Code generation (admin) ─────────────────────────────────────
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1 → less confusion when typing

function randomBlock(len = 4): string {
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

/** Human friendly format: DOU-XXXX-XXXX */
export function generateCode(planId: string, note?: string, expiresInDays?: number): RedeemCode {
  const plan = PLANS.find((p) => p.id === planId);
  const code = `DOU-${randomBlock()}-${randomBlock()}`;
  const entry: RedeemCode = {
    code,
    planId: plan?.id ?? planId,
    planName: plan?.name ?? planId,
    status: "unused",
    createdAt: Date.now(),
    note: note ? sanitizeText(note, 80) : undefined,
    expiresAt: expiresInDays ? Date.now() + expiresInDays * 86400000 : undefined,
  };
  const list = loadCodes();
  list.unshift(entry);
  saveCodes(list);
  return entry;
}

/** Bulk generation for batch sales. */
export function generateCodes(planId: string, count: number, note?: string): RedeemCode[] {
  const out: RedeemCode[] = [];
  for (let i = 0; i < Math.max(1, Math.min(200, count)); i++) out.push(generateCode(planId, note));
  return out;
}

export function revokeCode(code: string): boolean {
  const list = loadCodes();
  const idx = list.findIndex((c) => c.code.toUpperCase() === code.toUpperCase());
  if (idx < 0) return false;
  list[idx].status = "revoked";
  saveCodes(list);
  audit("code-revoke", `código ${code.toUpperCase()} revogado`);
  return true;
}

export function deleteCode(code: string): boolean {
  const list = loadCodes();
  const next = list.filter((c) => c.code.toUpperCase() !== code.toUpperCase());
  if (next.length === list.length) return false;
  saveCodes(next);
  audit("code-delete", `código ${code.toUpperCase()} excluído`);
  return true;
}

/** Copy-paste helper for sending the code to the buyer on WhatsApp. */
export function codeMessage(code: RedeemCode): string {
  const plan = PLANS.find((p) => p.id === code.planId);
  return [
    `🎮 DAY OF THE UNDEAD — compra confirmada!`,
    ``,
    `Plano: ${code.planName}`,
    plan ? `Valor: R$ ${(plan.amountBrl / 100).toFixed(2)}` : "",
    ``,
    `Seu código de resgate:`,
    `▸ ${code.code}`,
    ``,
    `Abra o jogo → Loja → Aba CÓDIGO → digite e resgatar.`,
    `Bom jogo, sobrevivente! 🧟`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Redemption (player) ─────────────────────────────────────────
function pushLedger(entry: { code: string; planId: string; planName: string; player: string; amountBrl: number }) {
  try {
    const ledger = JSON.parse(localStorage.getItem(LEDGER_KEY) || "[]") as unknown[];
    ledger.unshift({ ...entry, ts: Date.now() });
    localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger.slice(0, 200)));
  } catch { /* ignore */ }
}

export function redemptionHistory(): { code: string; planName: string; player: string; amountBrl: number; ts: number }[] {
  try {
    return JSON.parse(localStorage.getItem(LEDGER_KEY) || "[]");
  } catch {
    return [];
  }
}

/** Normalize what the player typed: lowercase/uppercase, strip junk, fix separators. */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^DOU/, "DOU-")
    .trim();
}

/**
 * Attempt to redeem a code for the given player.
 * Returns the entitlement payload on success (caller grants the perks).
 */
export function redeemCode(
  rawInput: string,
  player: string,
): RedemptionResult {
  const clean = normalizeCode(rawInput);
  const cleanPlayer = sanitizeText(player, 32) || "Jogador";

  if (clean.length < 6) {
    registerRedemptionAttempt(false);
    return { ok: false, message: "Código muito curto. Confira o formato DOU-XXXX-XXXX." };
  }

  // Rate limit: block brute-force enumeration of code space
  const gate = redemptionAllowed();
  if (!gate.ok) {
    const mins = Math.ceil(gate.retryAfterMs / 60000);
    return { ok: false, message: `Muitas tentativas incorretas. Aguarde ${mins} min ou fale com o suporte.` };
  }

  const list = loadCodes();
  const idx = list.findIndex((c) => c.code.replace(/-/g, "") === clean.replace(/-/g, ""));
  if (idx < 0) {
    registerRedemptionAttempt(false);
    return { ok: false, message: "Código não encontrado. Verifique se digitou corretamente." };
  }

  const entry = list[idx];

  if (entry.status === "redeemed") {
    registerRedemptionAttempt(false);
    return { ok: false, message: "Este código já foi utilizado." };
  }
  if (entry.status === "revoked") {
    registerRedemptionAttempt(false);
    return { ok: false, message: "Este código foi cancelado pelo suporte." };
  }
  if (entry.expiresAt && entry.expiresAt < Date.now()) {
    registerRedemptionAttempt(false);
    list[idx].status = "expired";
    saveCodes(list);
    return { ok: false, message: "Este código expirou. Fale com o suporte no WhatsApp." };
  }

  const plan = PLANS.find((p) => p.id === entry.planId);
  if (!plan) {
    registerRedemptionAttempt(false);
    return { ok: false, message: "Plano do código não existe mais. Fale com o suporte." };
  }

  // Consume the code
  list[idx].status = "redeemed";
  list[idx].redeemedBy = cleanPlayer;
  list[idx].redeemedAt = Date.now();
  saveCodes(list);

  pushLedger({
    code: entry.code,
    planId: entry.planId,
    planName: entry.planName,
    player: cleanPlayer,
    amountBrl: plan.amountBrl,
  });

  registerRedemptionAttempt(true);
  return {
    ok: true,
    message: `Resgate concluído! ${plan.name} liberado.`,
    plan,
    entitlementKey: entry.code,
  };
}

// ── WhatsApp deep link ──────────────────────────────────────────
export interface OrderDraft {
  plan: Plan;
  player: string;
  email?: string;
}

/** Builds the wa.me URL with a fully filled order message. */
export function whatsappOrderUrl({ plan, player, email }: OrderDraft): string {
  const price = `R$ ${(plan.amountBrl / 100).toFixed(2).replace(".", ",")}`;
  const recurring =
    plan.interval === "month" ? "(mensal)" : plan.interval === "year" ? "(anual)" : "(pagamento único)";

  const lines = [
    `*DAY OF THE UNDEAD* 🧟 — Quero comprar`,
    ``,
    `*Plano:* ${plan.name}`,
    `*Detalhe:* ${plan.tagline}`,
    `*Valor:* ${price} ${recurring}`,
    ``,
    `*Meus dados*`,
    `Jogador: ${player || "(informar)"}`,
    email ? `E-mail: ${email}` : "",
    ``,
    `Como posso pagar? (PIX / cartão / outro)`,
    `Assim que o pagamento cair, aguardo meu código de resgate. Obrigado!`,
  ].filter(Boolean);

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
}

/** Support link when something goes wrong with a code. */
export function whatsappSupportUrl(player: string, code?: string): string {
  const lines = [
    `*DAY OF THE UNDEAD* 🧟 — Suporte`,
    ``,
    `Jogador: ${player || "(informar)"}`,
    code ? `Código: ${code}` : "",
    ``,
    `Preciso de ajuda com meu código/pagamento.`,
  ].filter(Boolean);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
}
