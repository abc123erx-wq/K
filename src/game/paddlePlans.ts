// ═══════════════════════════════════════════════════════════════
//  PADDLE PLAN CATALOG — Day of the Undead
//  All prices in BRL (moeda local). Price IDs mirror the ones you
//  create in Paddle → Catalog. Replace the demo IDs with your live
//  price IDs once created; everything else keeps working.
// ═══════════════════════════════════════════════════════════════

export type PlanInterval = "one_time" | "month" | "year";
export type PlanKind = "credits" | "bundle" | "subscription";

export interface Plan {
  id: string;
  /** Paddle price_id (Catalog → Prices) */
  priceId: string;
  productId: string;
  name: string;
  tagline: string;
  kind: PlanKind;
  interval: PlanInterval;
  /** Price in BRL cents — never floats */
  amountBrl: number;
  benefits: string[];
  coins?: number;
  items?: string[];
  unlockKey?: string;
  /** Extra perks granted while a subscription is active */
  perks?: string[];
  badge?: string;
  accent: "ochre" | "moss" | "ember" | "steel" | "plum";
  featured?: boolean;
}

export const PLANS: Plan[] = [
  // ── CREDITS ─────────────────────────────────────────────────
  {
    id: "credits-100",
    priceId: "pri_01credits100",
    productId: "prd_01coins",
    name: "Ração de Moedas",
    tagline: "100 moedas",
    kind: "credits",
    interval: "one_time",
    amountBrl: 990,
    coins: 100,
    benefits: ["100 moedas na conta", "Entrega instantânea", "Sem renovação"],
    accent: "steel",
  },
  {
    id: "credits-550",
    priceId: "pri_01credits550",
    productId: "prd_01coins",
    name: "Caixa de Suprimentos",
    tagline: "550 moedas · bônus 10%",
    kind: "credits",
    interval: "one_time",
    amountBrl: 3990,
    coins: 550,
    benefits: ["550 moedas na conta", "10% de bônus incluso", "Entrega instantânea"],
    badge: "MAIS VENDIDO",
    accent: "ochre",
    featured: true,
  },
  {
    id: "credits-1200",
    priceId: "pri_01credits1200",
    productId: "prd_01coins",
    name: "Cofre do Quartermaster",
    tagline: "1200 moedas · bônus 20%",
    kind: "credits",
    interval: "one_time",
    amountBrl: 6990,
    coins: 1200,
    benefits: ["1200 moedas na conta", "20% de bônus incluso", "Selo de apoiador"],
    accent: "ember",
  },

  // ── BUNDLES ─────────────────────────────────────────────────
  {
    id: "bundle-arsenal",
    priceId: "pri_01arsenal",
    productId: "prd_01arsenal",
    name: "Kit Arsenal",
    tagline: "9 itens de combate",
    kind: "bundle",
    interval: "one_time",
    amountBrl: 2490,
    items: ["pistol9mm", "shotgun12", "ammo9mm", "ammo9mm", "shells12", "shells12", "medkitFull", "tacticalPack", "adrenaline"],
    benefits: ["Pistola 9mm + Escopeta 12G", "48 munições sortidas", "Medkit completo + adrenalina"],
    accent: "ember",
  },
  {
    id: "bundle-fortaleza",
    priceId: "pri_01fortaleza",
    productId: "prd_01fortaleza",
    name: "Kit Fortaleza",
    tagline: "Base fortificada",
    kind: "bundle",
    interval: "one_time",
    amountBrl: 3490,
    items: ["barricade", "barricade", "barbedWire", "barbedWire", "generatorSmall", "storageChest", "workbench", "turretAim"],
    benefits: ["Barricadas + arame farpado", "Gerador e baú de estoque", "Torreta automática"],
    accent: "moss",
  },

  // ── SUBSCRIPTIONS ───────────────────────────────────────────
  {
    id: "passe-mensal",
    priceId: "pri_01passemensal",
    productId: "prd_01passe",
    name: "Passe Sobrevivente",
    tagline: "Assinatura mensal",
    kind: "subscription",
    interval: "month",
    amountBrl: 1990,
    coins: 250,
    unlockKey: "passe-sobrevivente",
    perks: ["250 moedas todo mês", "+2 slots de hotbar", "Nome dourado no chat", "Skin Soldado de Elite"],
    benefits: ["Cancele quando quiser", "Renovação automática", "Acesso imediato"],
    badge: "ASSINATURA",
    accent: "moss",
  },
  {
    id: "passe-anual",
    priceId: "pri_01passeanual",
    productId: "prd_01passe",
    name: "Passe Sobrevivente Anual",
    tagline: "12 meses · 2 grátis",
    kind: "subscription",
    interval: "year",
    amountBrl: 19990,
    coins: 3000,
    unlockKey: "passe-anual",
    perks: ["3000 moedas no ato", "+4 slots de hotbar", "Skin Neon Apocalíptico", "Fila prioritária em salas"],
    benefits: ["Economia de R$ 38,90", "2 meses grátis", "Cancele quando quiser"],
    badge: "MELHOR VALOR",
    accent: "ochre",
    featured: true,
  },
  {
    id: "vault-vitalicio",
    priceId: "pri_01vault",
    productId: "prd_01vault",
    name: "Cofre Vitalício",
    tagline: "Acesso permanente",
    kind: "subscription",
    interval: "one_time",
    amountBrl: 14990,
    coins: 2000,
    unlockKey: "vip-forever",
    perks: ["2000 moedas no ato", "Todos os benefícios VIP", "Suas compras futuras com 15% off", "Selo lendário no ranking"],
    benefits: ["Pagamento único", "Nunca expira", "Transferível entre contas"],
    badge: "LENDÁRIO",
    accent: "plum",
  },
];

export const ACCENTS: Record<Plan["accent"], { border: string; bg: string; text: string; glow: string; bar: string }> = {
  ochre: { border: "#c8912a", bg: "rgba(200,145,42,0.08)", text: "#e8b64a", glow: "rgba(200,145,42,0.28)", bar: "#c8912a" },
  moss: { border: "#5d7a52", bg: "rgba(93,122,82,0.10)", text: "#8fb57e", glow: "rgba(93,122,82,0.28)", bar: "#5d7a52" },
  ember: { border: "#b5452e", bg: "rgba(181,69,46,0.08)", text: "#e07a52", glow: "rgba(181,69,46,0.26)", bar: "#b5452e" },
  steel: { border: "#4f6a80", bg: "rgba(79,106,128,0.10)", text: "#8ab0cc", glow: "rgba(79,106,128,0.26)", bar: "#4f6a80" },
  plum: { border: "#7a4a78", bg: "rgba(122,74,120,0.10)", text: "#c08abe", glow: "rgba(122,74,120,0.26)", bar: "#7a4a78" },
};

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function intervalLabel(plan: Plan): string {
  if (plan.interval === "month") return "/mês";
  if (plan.interval === "year") return "/ano";
  return "";
}

export function findPlan(idOrPriceId: string): Plan | undefined {
  return PLANS.find((p) => p.id === idOrPriceId || p.priceId === idOrPriceId || p.productId === idOrPriceId);
}
