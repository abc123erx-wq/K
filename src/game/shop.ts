// ═══════════════════════════════════════════════════════════════
//  SHOP CATALOG — Day of the Undead store
//  Prices in BRL, sold via Abacate Pay.
// ═══════════════════════════════════════════════════════════════

export type ShopCategory = "moedas" | "packs" | "cosmeticos" | "vip";

export interface ShopItem {
  id: string;
  name: string;
  emoji: string;
  category: ShopCategory;
  desc: string;
  price: number;          // BRL
  coins?: number;         // granted coins
  items?: string[];       // item template keys granted
  unlockedKey?: string;   // cosmetic/vip unlock key saved in save.unlockedItems
  badge?: string;         // e.g. "MAIS POPULAR"
  discount?: number;      // percentage off
}

export const SHOP_ITEMS: ShopItem[] = [
  // ── Moedas ────────────────────────────────────────────────────
  { id: "coins-100", name: "Pacote de 100 Moedas", emoji: "🪙", category: "moedas", desc: "100 moedas para gastar como quiser.", price: 4.99, coins: 100 },
  { id: "coins-550", name: "Pacote de 550 Moedas", emoji: "💰", category: "moedas", desc: "550 moedas com bônus de 10%.", price: 19.99, coins: 550, badge: "POPULAR" },
  { id: "coins-1200", name: "Pacote de 1200 Moedas", emoji: "🏦", category: "moedas", desc: "1200 moedas com bônus de 20%.", price: 39.99, coins: 1200 },
  { id: "coins-3200", name: "Pacote de 3200 Moedas", emoji: "👑", category: "moedas", desc: "3200 moedas com bônus de 28%.", price: 99.99, coins: 3200, badge: "MELHOR VALOR" },

  // ── Packs ─────────────────────────────────────────────────────
  { id: "starter-kit", name: "Kit Sobrevivente Inicial", emoji: "🎒", category: "packs", desc: "Mochila tática, faca, 2x água e MRE.", price: 9.99, items: ["tacticalPack", "huntingKnife", "waterBottle", "waterBottle", "mre", "mre", "bandage", "bandage"] },
  { id: "gunner-pack", name: "Kit Arsenal", emoji: "🔫", category: "packs", desc: "Pistola 9mm, escopeta, munição e medkit.", price: 24.99, items: ["pistol9mm", "shotgun12", "ammo9mm", "ammo9mm", "shells12", "shells12", "medkitFull"], badge: "POWER" },
  { id: "sniper-pack", name: "Kit Atirador de Elite", emoji: "🎯", category: "packs", desc: "Sniper + 24 munições .308 + binóculos.", price: 34.99, items: ["sniperRifle", "ammo308", "ammo308", "ammo308", "binoculars"] },
  { id: "fortress-pack", name: "Kit Fortaleza", emoji: "🏰", category: "packs", desc: "Barricadas, arame farpado e gerador.", price: 29.99, items: ["barricade", "barricade", "barbedWire", "barbedWire", "generatorSmall", "storageChest", "workbench"] },
  { id: "medical-pack", name: "Kit Médico Avançado", emoji: "💉", category: "packs", desc: "Medkits, morfina, adrenalina e antibióticos.", price: 19.99, items: ["medkitFull", "medkitFull", "morphine", "adrenaline", "antibiotics", "suture", "antiseptic"] },

  // ── Cosméticos ────────────────────────────────────────────────
  { id: "skin-soldier", name: "Skin Soldado de Elite", emoji: "🪖", category: "cosmeticos", desc: "Camuflagem militar premium para seu personagem.", price: 14.99, unlockedKey: "skin-soldier" },
  { id: "skin-medic", name: "Skin Médico de Campo", emoji: "⚕️", category: "cosmeticos", desc: "Jaleco branco com cruz vermelha.", price: 12.99, unlockedKey: "skin-medic" },
  { id: "skin-biker", name: "Skin Motoqueiro", emoji: "🏍️", category: "cosmeticos", desc: "Jaqueta de couro e visual radical.", price: 12.99, unlockedKey: "skin-biker" },
  { id: "skin-neon", name: "Skin Neon Apocalíptico", emoji: "🌈", category: "cosmeticos", desc: "Roupa brilhante que se destaca na escuridão.", price: 16.99, unlockedKey: "skin-neon", badge: "NOVO" },
  { id: "skin-hazmat", name: "Skin Traje Hazmat", emoji: "☣️", category: "cosmeticos", desc: "Traje de proteção química amarelo.", price: 15.99, unlockedKey: "skin-hazmat" },

  // ── VIP ───────────────────────────────────────────────────────
  { id: "vip-30", name: "VIP 30 Dias", emoji: "⭐", category: "vip", desc: "+2 slots de hotbar, mochila infinita e nome dourado por 30 dias.", price: 29.99, unlockedKey: "vip-30", badge: "PREMIUM" },
  { id: "vip-forever", name: "VIP Vitalício", emoji: "🌟", category: "vip", desc: "Todos os benefícios VIP para sempre.", price: 149.99, unlockedKey: "vip-forever", badge: "LENDÁRIO" },
];

export const SHOP_CATEGORIES: { id: ShopCategory | "todos"; label: string; icon: string }[] = [
  { id: "todos", label: "Todos", icon: "🛍️" },
  { id: "moedas", label: "Moedas", icon: "🪙" },
  { id: "packs", label: "Kits", icon: "🎁" },
  { id: "cosmeticos", label: "Cosméticos", icon: "🎨" },
  { id: "vip", label: "VIP", icon: "⭐" },
];

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
