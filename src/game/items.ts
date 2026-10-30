import type { Item, Recipe } from "./types";

let itemSequence = 0;

export function makeItem(template: Omit<Item, "id">, qty = template.qty): Item {
  return { ...template, qty, id: `${template.name.toLowerCase().replace(/\s+/g, "-")}-${itemSequence++}` };
}

// 50 firearm families × 8 variants = 400 unique firearms
const firearmFamilies = [
  // ========== PISTOLS (9mm) ==========
  { prefix: "Knox 9mm Pistol", ammo: "9mm Rounds", damage: 42, range: 520, noise: 105, weight: 1.10, tags: ["firearm", "pistol"] },
  { prefix: "Glock 17 Tactical", ammo: "9mm Rounds", damage: 44, range: 530, noise: 108, weight: 1.05, tags: ["firearm", "pistol"] },
  { prefix: "Beretta M9", ammo: "9mm Rounds", damage: 45, range: 540, noise: 107, weight: 1.15, tags: ["firearm", "pistol"] },
  { prefix: "SIG Sauer P226", ammo: "9mm Rounds", damage: 46, range: 545, noise: 109, weight: 1.20, tags: ["firearm", "pistol"] },
  { prefix: "H&K USP Compact", ammo: "9mm Rounds", damage: 41, range: 510, noise: 102, weight: 0.95, tags: ["firearm", "pistol"] },
  { prefix: "Walther PPQ", ammo: "9mm Rounds", damage: 43, range: 525, noise: 106, weight: 1.00, tags: ["firearm", "pistol"] },
  { prefix: "CZ 75 Shadow", ammo: "9mm Rounds", damage: 47, range: 550, noise: 110, weight: 1.18, tags: ["firearm", "pistol"] },
  // ========== PISTOLS (.45) ==========
  { prefix: "Muldraugh .45 Pistol", ammo: ".45 Rounds", damage: 55, range: 500, noise: 112, weight: 1.25, tags: ["firearm", "pistol"] },
  { prefix: "Colt 1911 Government", ammo: ".45 Rounds", damage: 58, range: 510, noise: 114, weight: 1.30, tags: ["firearm", "pistol"] },
  { prefix: "Kimber Stainless TLE", ammo: ".45 Rounds", damage: 60, range: 515, noise: 115, weight: 1.28, tags: ["firearm", "pistol"] },
  { prefix: "FN FNX-45 Tactical", ammo: ".45 Rounds", damage: 59, range: 520, noise: 116, weight: 1.35, tags: ["firearm", "pistol"] },
  // ========== PISTOLS (10mm/.40) ==========
  { prefix: "Glock 20 10mm", ammo: ".45 Rounds", damage: 62, range: 540, noise: 118, weight: 1.40, tags: ["firearm", "pistol"] },
  { prefix: "S&W M&P .40", ammo: ".45 Rounds", damage: 56, range: 510, noise: 113, weight: 1.22, tags: ["firearm", "pistol"] },
  // ========== REVOLVERS ==========
  { prefix: "Rosewood Revolver", ammo: ".38 Rounds", damage: 48, range: 470, noise: 115, weight: 1.35, tags: ["firearm", "revolver"] },
  { prefix: "Smith & Wesson Model 10", ammo: ".38 Rounds", damage: 50, range: 480, noise: 116, weight: 1.30, tags: ["firearm", "revolver"] },
  { prefix: "Colt Detective Special", ammo: ".38 Rounds", damage: 46, range: 460, noise: 113, weight: 1.10, tags: ["firearm", "revolver"] },
  { prefix: "Ruger LCR", ammo: ".38 Rounds", damage: 47, range: 450, noise: 112, weight: 0.95, tags: ["firearm", "revolver"] },
  // ========== MAGNUMS ==========
  { prefix: "Riverside Magnum", ammo: ".44 Magnum Rounds", damage: 72, range: 560, noise: 128, weight: 1.60, tags: ["firearm", "revolver"] },
  { prefix: "S&W Model 29", ammo: ".44 Magnum Rounds", damage: 78, range: 580, noise: 132, weight: 1.65, tags: ["firearm", "revolver"] },
  { prefix: "Ruger Super Redhawk", ammo: ".44 Magnum Rounds", damage: 82, range: 600, noise: 135, weight: 1.85, tags: ["firearm", "revolver"] },
  { prefix: "Desert Eagle .50", ammo: ".44 Magnum Rounds", damage: 95, range: 620, noise: 142, weight: 2.20, tags: ["firearm", "pistol"] },
  // ========== SMGs ==========
  { prefix: "Compact SMG", ammo: "9mm Rounds", damage: 38, range: 560, noise: 118, weight: 2.70, tags: ["firearm", "smg"] },
  { prefix: "H&K MP5", ammo: "9mm Rounds", damage: 42, range: 580, noise: 122, weight: 2.80, tags: ["firearm", "smg"] },
  { prefix: "Uzi Pro", ammo: "9mm Rounds", damage: 40, range: 540, noise: 120, weight: 2.45, tags: ["firearm", "smg"] },
  { prefix: "FN P90", ammo: "5.56 Rounds", damage: 48, range: 600, noise: 124, weight: 2.55, tags: ["firearm", "smg"] },
  { prefix: "MAC-10", ammo: "9mm Rounds", damage: 36, range: 480, noise: 130, weight: 2.85, tags: ["firearm", "smg"] },
  { prefix: "Vector Tactical .45", ammo: ".45 Rounds", damage: 52, range: 570, noise: 121, weight: 2.65, tags: ["firearm", "smg"] },
  // ========== ASSAULT RIFLES ==========
  { prefix: "Civilian Carbine", ammo: "5.56 Rounds", damage: 68, range: 760, noise: 132, weight: 3.20, tags: ["firearm", "rifle"] },
  { prefix: "Police Carbine", ammo: "5.56 Rounds", damage: 74, range: 820, noise: 136, weight: 3.50, tags: ["firearm", "rifle"] },
  { prefix: "M16A4 Service", ammo: "5.56 Rounds", damage: 76, range: 840, noise: 138, weight: 3.65, tags: ["firearm", "rifle"] },
  { prefix: "M4A1 Carbine", ammo: "5.56 Rounds", damage: 72, range: 780, noise: 135, weight: 3.10, tags: ["firearm", "rifle"] },
  { prefix: "AK-47 Kalashnikov", ammo: ".308 Rounds", damage: 84, range: 800, noise: 140, weight: 3.80, tags: ["firearm", "rifle"] },
  { prefix: "AK-74M", ammo: "5.56 Rounds", damage: 78, range: 820, noise: 138, weight: 3.50, tags: ["firearm", "rifle"] },
  { prefix: "FN SCAR-L", ammo: "5.56 Rounds", damage: 80, range: 870, noise: 139, weight: 3.55, tags: ["firearm", "rifle"] },
  { prefix: "FN SCAR-H", ammo: ".308 Rounds", damage: 92, range: 900, noise: 144, weight: 3.95, tags: ["firearm", "rifle"] },
  { prefix: "Steyr AUG A3", ammo: "5.56 Rounds", damage: 75, range: 810, noise: 134, weight: 3.40, tags: ["firearm", "rifle"] },
  { prefix: "H&K G36", ammo: "5.56 Rounds", damage: 77, range: 830, noise: 136, weight: 3.55, tags: ["firearm", "rifle"] },
  { prefix: "Tavor X95", ammo: "5.56 Rounds", damage: 79, range: 850, noise: 137, weight: 3.45, tags: ["firearm", "rifle"] },
  { prefix: "Galil ACE", ammo: ".308 Rounds", damage: 86, range: 870, noise: 141, weight: 3.75, tags: ["firearm", "rifle"] },
  // ========== HUNTING RIFLES ==========
  { prefix: "Hunting Rifle", ammo: ".308 Rounds", damage: 96, range: 920, noise: 145, weight: 4.00, tags: ["firearm", "rifle"] },
  { prefix: "Varmint Rifle", ammo: ".223 Rounds", damage: 58, range: 840, noise: 122, weight: 3.40, tags: ["firearm", "rifle"] },
  { prefix: "Remington 700", ammo: ".308 Rounds", damage: 102, range: 960, noise: 148, weight: 4.10, tags: ["firearm", "rifle"] },
  { prefix: "Winchester Model 70", ammo: ".308 Rounds", damage: 105, range: 980, noise: 149, weight: 4.20, tags: ["firearm", "rifle"] },
  { prefix: "Ruger American Rifle", ammo: ".223 Rounds", damage: 62, range: 860, noise: 124, weight: 3.30, tags: ["firearm", "rifle"] },
  { prefix: "Tikka T3X Hunter", ammo: ".308 Rounds", damage: 99, range: 940, noise: 146, weight: 3.95, tags: ["firearm", "rifle"] },
  // ========== SNIPER RIFLES ==========
  { prefix: "Barrett M82 .50", ammo: ".44 Magnum Rounds", damage: 165, range: 1400, noise: 165, weight: 6.50, tags: ["firearm", "rifle"] },
  { prefix: "Accuracy AWP", ammo: ".308 Rounds", damage: 140, range: 1300, noise: 158, weight: 5.20, tags: ["firearm", "rifle"] },
  { prefix: "M40 USMC Sniper", ammo: ".308 Rounds", damage: 132, range: 1200, noise: 155, weight: 4.80, tags: ["firearm", "rifle"] },
  { prefix: "Dragunov SVD", ammo: ".308 Rounds", damage: 118, range: 1150, noise: 152, weight: 4.40, tags: ["firearm", "rifle"] },
  { prefix: "PSG-1 Marksman", ammo: ".308 Rounds", damage: 126, range: 1180, noise: 154, weight: 4.55, tags: ["firearm", "rifle"] },
  // ========== SHOTGUNS ==========
  { prefix: "Double Barrel Shotgun", ammo: "12 Gauge Shells", damage: 112, range: 380, noise: 150, weight: 3.70, tags: ["firearm", "shotgun"] },
  { prefix: "Pump Shotgun", ammo: "12 Gauge Shells", damage: 105, range: 430, noise: 148, weight: 3.90, tags: ["firearm", "shotgun"] },
  { prefix: "Remington 870 Tactical", ammo: "12 Gauge Shells", damage: 115, range: 420, noise: 152, weight: 3.85, tags: ["firearm", "shotgun"] },
  { prefix: "Mossberg 500 Cruiser", ammo: "12 Gauge Shells", damage: 108, range: 410, noise: 149, weight: 3.60, tags: ["firearm", "shotgun"] },
  { prefix: "Benelli M4 Auto", ammo: "12 Gauge Shells", damage: 118, range: 460, noise: 153, weight: 3.95, tags: ["firearm", "shotgun"] },
  { prefix: "SPAS-12 Combat", ammo: "12 Gauge Shells", damage: 122, range: 440, noise: 154, weight: 4.20, tags: ["firearm", "shotgun"] },
  { prefix: "Saiga-12K", ammo: "12 Gauge Shells", damage: 124, range: 470, noise: 156, weight: 4.40, tags: ["firearm", "shotgun"] },
  { prefix: "Sawed-Off Shotgun", ammo: "12 Gauge Shells", damage: 128, range: 280, noise: 156, weight: 2.60, tags: ["firearm", "shotgun"] },
  // ========== LEGENDARY ==========
  { prefix: "Ranger Lever Rifle", ammo: ".44 Magnum Rounds", damage: 82, range: 720, noise: 138, weight: 3.80, tags: ["firearm", "rifle"] },
  { prefix: "Winchester 1894", ammo: ".44 Magnum Rounds", damage: 88, range: 700, noise: 140, weight: 3.60, tags: ["firearm", "rifle"] },
  { prefix: "FN Minimi LMG", ammo: "5.56 Rounds", damage: 88, range: 900, noise: 156, weight: 7.10, tags: ["firearm", "rifle"] },
  { prefix: "M249 SAW", ammo: "5.56 Rounds", damage: 90, range: 920, noise: 158, weight: 7.50, tags: ["firearm", "rifle"] },
  { prefix: "RPK-74 LMG", ammo: ".308 Rounds", damage: 96, range: 880, noise: 160, weight: 6.80, tags: ["firearm", "rifle"] },
];

const firearmVariants = ["A1", "A2", "A3", "Field", "Patrol", "Custom", "Worn", "Collector"];

function buildFirearms(): Record<string, Omit<Item, "id">> {
  const firearms: Record<string, Omit<Item, "id">> = {};
  firearmFamilies.forEach((family, familyIndex) => {
    firearmVariants.forEach((variant, variantIndex) => {
      const key = `firearm${familyIndex}_${variantIndex}`;
      const tuned = 0.92 + variantIndex * 0.025;
      firearms[key] = {
        name: `${family.prefix} ${variant}`,
        type: "weapon",
        weight: Number((family.weight + (variantIndex % 3) * 0.08).toFixed(2)),
        qty: 1,
        weapon: {
          damage: Math.round(family.damage * tuned),
          range: Math.round(family.range * (0.95 + (variantIndex % 4) * 0.025)),
          stamina: family.tags.includes("shotgun") || family.tags.includes("rifle") ? 9 : 5,
          noise: family.noise,
          mode: "firearm",
          ammo: family.ammo,
        },
        tags: [...family.tags, family.ammo],
      };
    });
  });
  return firearms;
}

export const firearmTemplates = buildFirearms();
const firearmPool = Object.values(firearmTemplates);

export const itemTemplates: Record<string, Omit<Item, "id">> = {
  // ==================== FOOD ====================
  cannedBeans: { name: "Canned Beans", type: "food", weight: 0.8, qty: 1, hunger: 24, tags: ["food"], rarity: "Comum", value: 120 },
  chips: { name: "Chips", type: "food", weight: 0.2, qty: 1, hunger: 12, tags: ["food"], rarity: "Comum", value: 60 },
  cannedTuna: { name: "Canned Tuna", type: "food", weight: 0.5, qty: 1, hunger: 20, tags: ["food"], rarity: "Comum", value: 140 },
  soup: { name: "Canned Soup", type: "food", weight: 0.7, qty: 1, hunger: 18, thirst: 10, tags: ["food"], rarity: "Comum", value: 130 },
  beefJerky: { name: "Beef Jerky", type: "food", weight: 0.15, qty: 1, hunger: 15, tags: ["food"], rarity: "Incomum", value: 180 },
  crackers: { name: "Crackers Pack", type: "food", weight: 0.2, qty: 1, hunger: 10, tags: ["food"], rarity: "Comum", value: 50 },
  granolaBar: { name: "Granola Bar", type: "food", weight: 0.08, qty: 1, hunger: 14, tags: ["food"], rarity: "Comum", value: 75 },
  peanutButter: { name: "Peanut Butter Jar", type: "food", weight: 0.5, qty: 1, hunger: 28, tags: ["food"], rarity: "Incomum", value: 280 },
  ricePkg: { name: "Rice Package 1kg", type: "food", weight: 1.0, qty: 1, hunger: 35, tags: ["food"], rarity: "Comum", value: 160 },
  pastaPkg: { name: "Pasta Package", type: "food", weight: 0.9, qty: 1, hunger: 30, tags: ["food"], rarity: "Comum", value: 150 },
  cannedSpaghetti: { name: "Spaghetti Tin", type: "food", weight: 0.6, qty: 1, hunger: 22, tags: ["food"], rarity: "Comum", value: 130 },
  energyBar: { name: "High Energy Bar", type: "food", weight: 0.05, qty: 1, hunger: 16, stamina: 10, tags: ["food"], rarity: "Incomum", value: 220 },
  mre: { name: "MRE Meal Ration", type: "food", weight: 1.2, qty: 1, hunger: 55, thirst: 15, tags: ["food", "military"], rarity: "Raro", value: 650 },
  chocolateBar: { name: "Chocolate Bar", type: "food", weight: 0.1, qty: 1, hunger: 8, sanity: 5, tags: ["food"], rarity: "Comum", value: 90 },
  fruitCup: { name: "Fruit Cup", type: "food", weight: 0.3, qty: 1, hunger: 12, thirst: 5, tags: ["food"], rarity: "Comum", value: 100 },
  cannedCorn: { name: "Canned Corn", type: "food", weight: 0.5, qty: 1, hunger: 16, tags: ["food"], rarity: "Comum", value: 110 },
  sausageCan: { name: "Canned Sausage", type: "food", weight: 0.4, qty: 1, hunger: 20, tags: ["food"], rarity: "Comum", value: 135 },
  cornedBeefCan: { name: "Corned Beef Can", type: "food", weight: 0.7, qty: 1, hunger: 28, tags: ["food"], rarity: "Incomum", value: 250 },
  chocolateSpread: { name: "Chocolate Spread", type: "food", weight: 0.4, qty: 1, hunger: 10, sanity: 8, tags: ["food"], rarity: "Incomum", value: 190 },
  oatmealPkg: { name: "Oatmeal Package", type: "food", weight: 0.5, qty: 1, hunger: 22, tags: ["food"], rarity: "Comum", value: 120 },

  // ==================== WATER ====================
  waterBottle: { name: "Water Bottle", type: "water", weight: 0.6, qty: 1, thirst: 28, tags: ["water"], rarity: "Comum", value: 100 },
  waterJug5L: { name: "5L Water Jug", type: "water", weight: 5.2, qty: 1, thirst: 25, carryBonus: 0, tags: ["water"], rarity: "Incomum", value: 450 },
  juiceBox: { name: "Juice Box", type: "water", weight: 0.3, qty: 1, thirst: 15, hunger: 3, tags: ["water"], rarity: "Comum", value: 80 },
  energyDrink: { name: "Energy Drink", type: "water", weight: 0.35, qty: 1, thirst: 12, stamina: 25, tags: ["water"], rarity: "Incomum", value: 280 },
  canteen: { name: "Military Canteen", type: "water", weight: 0.7, qty: 1, thirst: 35, tags: ["water", "military"], rarity: "Raro", value: 500 },
  coffeePowder: { name: "Coffee Powder", type: "food", weight: 0.2, qty: 1, hunger: 2, sanity: 10, stamina: 15, tags: ["food", "coffee"], rarity: "Comum", value: 180 },
  teaBags: { name: "Tea Bags Box", type: "food", weight: 0.1, qty: 1, hunger: 1, thirst: 15, sanity: 5, tags: ["food", "tea"], rarity: "Comum", value: 100 },
  waterFilter: { name: "Water Purifier", type: "survival", weight: 0.5, qty: 1, thirst: 30, tags: ["survival", "water", "tool"], rarity: "Raro", value: 850 },

  // ==================== WEAPONS ====================
  kitchenKnife: { name: "Kitchen Knife", type: "weapon", weight: 0.4, qty: 1, weapon: { damage: 22, range: 34, stamina: 12, noise: 22, mode: "melee" }, tags: ["blade"], rarity: "Comum", value: 80 },
  baseballBat: { name: "Baseball Bat", type: "weapon", weight: 1.7, qty: 1, weapon: { damage: 31, range: 48, stamina: 18, noise: 36, mode: "melee" }, tags: ["blunt"], rarity: "Comum", value: 300 },
  handAxe: { name: "Hand Axe", type: "weapon", weight: 1.5, qty: 1, weapon: { damage: 38, range: 44, stamina: 22, noise: 42, mode: "melee" }, tags: ["axe", "tool"], rarity: "Incomum", value: 650 },
  crowbar: { name: "Crowbar", type: "weapon", weight: 2.5, qty: 1, weapon: { damage: 34, range: 40, stamina: 20, noise: 38, mode: "melee" }, tags: ["tool", "blunt"], rarity: "Incomum", value: 450 },
  huntingKnife: { name: "Hunting Knife", type: "weapon", weight: 0.3, qty: 1, weapon: { damage: 26, range: 30, stamina: 10, noise: 18, mode: "melee" }, tags: ["blade"], rarity: "Raro", value: 550 },
  pipeWrench: { name: "Pipe Wrench", type: "weapon", weight: 3.0, qty: 1, weapon: { damage: 36, range: 36, stamina: 24, noise: 40, mode: "melee" }, tags: ["tool", "blunt"], rarity: "Comum", value: 320 },
  sledgeHammer: { name: "Sledgehammer", type: "weapon", weight: 5.5, qty: 1, weapon: { damage: 55, range: 52, stamina: 35, noise: 55, mode: "melee" }, tags: ["blunt"], rarity: "Raro", value: 1200 },
  machete: { name: "Machete", type: "weapon", weight: 1.0, qty: 1, weapon: { damage: 40, range: 42, stamina: 16, noise: 28, mode: "melee" }, tags: ["blade"], rarity: "Raro", value: 880 },
  katana: { name: "Katana", type: "weapon", weight: 1.1, qty: 1, weapon: { damage: 65, range: 55, stamina: 20, noise: 22, mode: "melee" }, tags: ["blade"], rarity: "Lendário", value: 3500 },
  spear: { name: "Homemade Spear", type: "weapon", weight: 1.8, qty: 1, weapon: { damage: 28, range: 65, stamina: 15, noise: 30, mode: "melee" }, tags: ["polearm"], rarity: "Incomum", value: 350 },
  nightstick: { name: "Police Nightstick", type: "weapon", weight: 0.8, qty: 1, weapon: { damage: 24, range: 36, stamina: 14, noise: 30, mode: "melee" }, tags: ["blunt"], rarity: "Incomum", value: 380 },
  hatchet: { name: "Hatchet", type: "weapon", weight: 1.2, qty: 1, weapon: { damage: 32, range: 38, stamina: 16, noise: 35, mode: "melee" }, tags: ["axe", "tool"], rarity: "Comum", value: 400 },
  sharpenedStick: { name: "Sharpened Stick", type: "weapon", weight: 0.8, qty: 1, weapon: { damage: 16, range: 45, stamina: 10, noise: 20, mode: "melee" }, tags: ["polearm"], rarity: "Comum", value: 60 },
  pipe: { name: "Metal Pipe", type: "weapon", weight: 2.0, qty: 1, weapon: { damage: 22, range: 40, stamina: 18, noise: 35, mode: "melee" }, tags: ["blunt"], rarity: "Comum", value: 150 },
  fryingPan: { name: "Cast Iron Frying Pan", type: "weapon", weight: 1.8, qty: 1, weapon: { damage: 18, range: 30, stamina: 14, noise: 40, mode: "melee" }, tags: ["blunt"], rarity: "Comum", value: 120 },
  brokenBottle: { name: "Broken Bottle", type: "weapon", weight: 0.15, qty: 1, weapon: { damage: 12, range: 22, stamina: 8, noise: 15, mode: "melee" }, tags: ["blade"], rarity: "Comum", value: 20 },
  sawedOff: { name: "Sawed-Off Shotgun", type: "weapon", weight: 2.0, qty: 1, weapon: { damage: 95, range: 280, stamina: 8, noise: 145, mode: "firearm", ammo: "12 Gauge Shells" }, tags: ["firearm", "shotgun"], rarity: "Raro", value: 1800 },
  revolver38: { name: "Revolver .38", type: "weapon", weight: 0.9, qty: 1, weapon: { damage: 48, range: 470, stamina: 5, noise: 115, mode: "firearm", ammo: ".38 Rounds" }, tags: ["firearm", "revolver"], rarity: "Raro", value: 1500 },
  pistol9mm: { name: "Pistol 9mm", type: "weapon", weight: 1.1, qty: 1, weapon: { damage: 42, range: 520, stamina: 5, noise: 105, mode: "firearm", ammo: "9mm Rounds" }, tags: ["firearm", "pistol"], rarity: "Raro", value: 1200 },
  rifle308: { name: "Hunting Rifle .308", type: "weapon", weight: 3.8, qty: 1, weapon: { damage: 96, range: 920, stamina: 9, noise: 145, mode: "firearm", ammo: ".308 Rounds" }, tags: ["firearm", "rifle"], rarity: "Épico", value: 3100 },
  shotgun12: { name: "12G Pump Shotgun", type: "weapon", weight: 3.5, qty: 1, weapon: { damage: 105, range: 430, stamina: 9, noise: 148, mode: "firearm", ammo: "12 Gauge Shells" }, tags: ["firearm", "shotgun"], rarity: "Épico", value: 2400 },
  crossbow: { name: "Crossbow", type: "weapon", weight: 2.8, qty: 1, weapon: { damage: 55, range: 380, stamina: 14, noise: 8, mode: "firearm", ammo: "Bolts" }, tags: ["firearm", "silent"], rarity: "Épico", value: 2800 },
  fireAxe: { name: "Fire Axe", type: "weapon", weight: 3.5, qty: 1, weapon: { damage: 45, range: 48, stamina: 28, noise: 38, mode: "melee" }, tags: ["axe", "tool"], rarity: "Raro", value: 950 },
  silencedPistol: { name: "Silenced Pistol", type: "weapon", weight: 1.3, qty: 1, weapon: { damage: 38, range: 480, stamina: 5, noise: 25, mode: "firearm", ammo: "9mm Rounds" }, tags: ["firearm", "pistol", "silent"], rarity: "Lendário", value: 4500 },
  sniperRifle: { name: "Sniper Rifle", type: "weapon", weight: 5.2, qty: 1, weapon: { damage: 110, range: 1200, stamina: 12, noise: 155, mode: "firearm", ammo: ".308 Rounds" }, tags: ["firearm", "rifle"], rarity: "Lendário", value: 5000 },

  // ==================== AMMO ====================
  ammo9mm: { name: "9mm Rounds", type: "ammo", weight: 0.02, qty: 12, tags: ["ammo", "9mm Rounds"], rarity: "Comum", value: 250 },
  ammo45: { name: ".45 Rounds", type: "ammo", weight: 0.025, qty: 10, tags: ["ammo", ".45 Rounds"], rarity: "Comum", value: 300 },
  ammo38: { name: ".38 Rounds", type: "ammo", weight: 0.02, qty: 12, tags: ["ammo", ".38 Rounds"], rarity: "Comum", value: 280 },
  ammo44: { name: ".44 Magnum Rounds", type: "ammo", weight: 0.035, qty: 8, tags: ["ammo", ".44 Magnum Rounds"], rarity: "Incomum", value: 450 },
  ammo556: { name: "5.56 Rounds", type: "ammo", weight: 0.03, qty: 20, tags: ["ammo", "5.56 Rounds"], rarity: "Raro", value: 600 },
  ammo308: { name: ".308 Rounds", type: "ammo", weight: 0.04, qty: 8, tags: ["ammo", ".308 Rounds"], rarity: "Raro", value: 500 },
  ammo223: { name: ".223 Rounds", type: "ammo", weight: 0.025, qty: 20, tags: ["ammo", ".223 Rounds"], rarity: "Incomum", value: 400 },
  shells12: { name: "12 Gauge Shells", type: "ammo", weight: 0.055, qty: 6, tags: ["ammo", "12 Gauge Shells"], rarity: "Incomum", value: 350 },
  arrows: { name: "Crossbow Bolts", type: "ammo", weight: 0.08, qty: 6, tags: ["ammo", "Bolts"], rarity: "Incomum", value: 200 },
  incendiaryShells: { name: "Incendiary Shells", type: "ammo", weight: 0.06, qty: 4, tags: ["ammo", "12 Gauge Shells"], rarity: "Épico", value: 1200 },
  armorPiercing556: { name: "5.56 AP Rounds", type: "ammo", weight: 0.035, qty: 10, tags: ["ammo", "5.56 Rounds"], rarity: "Épico", value: 900 },

  // ==================== MATERIALS ====================
  woodLog: { name: "Wood Log", type: "material", weight: 2.2, qty: 1, tags: ["wood", "log"], rarity: "Comum", value: 60 },
  planks: { name: "Planks", type: "material", weight: 1.2, qty: 1, tags: ["plank", "wood"], rarity: "Comum", value: 80 },
  nails: { name: "Nails", type: "material", weight: 0.1, qty: 1, tags: ["nails"], rarity: "Comum", value: 50 },
  scrapMetal: { name: "Scrap Metal", type: "material", weight: 1.5, qty: 1, tags: ["metal", "scrap"], rarity: "Comum", value: 40 },
  rope: { name: "Rope 10m", type: "material", weight: 0.8, qty: 1, tags: ["rope", "survival"], rarity: "Incomum", value: 200 },
  ductTape: { name: "Duct Tape Roll", type: "material", weight: 0.3, qty: 1, tags: ["tape", "craft"], rarity: "Comum", value: 120 },
  wire: { name: "Copper Wire", type: "material", weight: 0.4, qty: 1, tags: ["wire", "electronics"], rarity: "Incomum", value: 180 },
  sheetMetal: { name: "Sheet Metal", type: "material", weight: 2.0, qty: 1, tags: ["metal", "construction"], rarity: "Comum", value: 100 },
  glass: { name: "Glass Pane", type: "material", weight: 1.8, qty: 1, tags: ["glass", "construction"], rarity: "Comum", value: 90 },
  concrete: { name: "Concrete Bag", type: "material", weight: 25.0, qty: 1, tags: ["construction", "concrete"], rarity: "Comum", value: 350 },
  cement: { name: "Portland Cement 50kg", type: "material", weight: 25.0, qty: 1, tags: ["construction", "cement"], rarity: "Comum", value: 450 },
  brick: { name: "Brick", type: "material", weight: 1.8, qty: 1, tags: ["construction", "brick"], rarity: "Comum", value: 40 },
  stone: { name: "Stone Block", type: "material", weight: 3.0, qty: 1, tags: ["construction", "stone"], rarity: "Comum", value: 50 },
  leather: { name: "Leather Hide", type: "material", weight: 1.5, qty: 1, tags: ["leather", "craft"], rarity: "Incomum", value: 200 },
  cloth: { name: "Cloth Roll", type: "material", weight: 0.8, qty: 1, tags: ["cloth", "craft"], rarity: "Comum", value: 80 },
  rubber: { name: "Rubber Sheet", type: "material", weight: 0.6, qty: 1, tags: ["rubber", "craft"], rarity: "Comum", value: 70 },
  coal: { name: "Coal Bag", type: "material", weight: 5.0, qty: 1, tags: ["fuel", "craft"], rarity: "Comum", value: 150 },
  sulfur: { name: "Sulfur Powder", type: "material", weight: 0.5, qty: 1, tags: ["chemical", "craft"], rarity: "Raro", value: 400 },
  clay: { name: "Clay Block", type: "material", weight: 3.0, qty: 1, tags: ["construction", "clay"], rarity: "Comum", value: 60 },
  gravel: { name: "Gravel Bag", type: "material", weight: 10.0, qty: 1, tags: ["construction", "gravel"], rarity: "Comum", value: 80 },

  // ==================== TOOLS ====================
  hammer: { name: "Hammer", type: "tool", weight: 0.85, qty: 1, tags: ["tool", "construction"], rarity: "Comum", value: 150 },
  saw: { name: "Hand Saw", type: "tool", weight: 0.7, qty: 1, tags: ["tool", "woodworking"], rarity: "Comum", value: 180 },
  screwdriver: { name: "Screwdriver", type: "tool", weight: 0.18, qty: 1, tags: ["tool", "electronics"], rarity: "Comum", value: 60 },
  wrench: { name: "Adjustable Wrench", type: "tool", weight: 0.75, qty: 1, tags: ["tool", "mechanical"], rarity: "Comum", value: 140 },
  pliers: { name: "Pliers", type: "tool", weight: 0.45, qty: 1, tags: ["tool", "electronics"], rarity: "Comum", value: 110 },
  flashlight: { name: "Flashlight", type: "tool", weight: 0.4, qty: 1, tags: ["tool", "light", "survival"], rarity: "Comum", value: 200 },
  knife: { name: "Hunting Knife", type: "tool", weight: 0.3, qty: 1, weapon: { damage: 26, range: 30, stamina: 10, noise: 18, mode: "melee" }, tags: ["tool", "blade"], rarity: "Incomum", value: 350 },
  binoculars: { name: "Binoculars", type: "tool", weight: 0.8, qty: 1, tags: ["tool", "survival", "vision"], rarity: "Incomum", value: 650 },
  compass: { name: "Compass", type: "tool", weight: 0.08, qty: 1, tags: ["tool", "survival", "navigation"], rarity: "Incomum", value: 400 },
  map: { name: "Torn Map", type: "tool", weight: 0.05, qty: 1, tags: ["tool", "survival", "navigation"], rarity: "Comum", value: 150 },
  duct_tape: { name: "Duct Tape", type: "tool", weight: 0.3, qty: 1, tags: ["tool", "craft"], rarity: "Comum", value: 120 },
  toolbox: { name: "Toolbox", type: "tool", weight: 3.5, qty: 1, carryBonus: 4, tags: ["tool", "mechanical"], rarity: "Incomum", value: 450 },
  pickaxe: { name: "Pickaxe", type: "tool", weight: 2.8, qty: 1, weapon: { damage: 28, range: 40, stamina: 25, noise: 45, mode: "melee" }, tags: ["tool", "mining"], rarity: "Comum", value: 350 },
  shovel: { name: "Shovel", type: "tool", weight: 2.0, qty: 1, weapon: { damage: 20, range: 50, stamina: 18, noise: 30, mode: "melee" }, tags: ["tool", "digging"], rarity: "Comum", value: 200 },
  drill: { name: "Hand Drill", type: "tool", weight: 0.5, qty: 1, tags: ["tool", "construction"], rarity: "Comum", value: 120 },
  ropeLadder: { name: "Rope Ladder 3m", type: "tool", weight: 2.0, qty: 1, tags: ["tool", "survival", "climbing"], rarity: "Incomum", value: 350 },
  ropeRappel: { name: "Climbing Rope 30m", type: "tool", weight: 1.5, qty: 1, tags: ["tool", "survival", "climbing"], rarity: "Raro", value: 800 },
  hook: { name: "Grappling Hook", type: "tool", weight: 0.5, qty: 1, tags: ["tool", "survival", "climbing"], rarity: "Raro", value: 600 },

  // ==================== MEDICAL ====================
  rag: { name: "Rag", type: "medical", weight: 0.1, qty: 1, heal: 5, tags: ["rag"], rarity: "Comum", value: 30 },
  alcohol: { name: "Alcohol Wipes", type: "medical", weight: 0.1, qty: 1, heal: 3, tags: ["alcohol"], rarity: "Comum", value: 80 },
  bandage: { name: "Sterile Bandage", type: "medical", weight: 0.15, qty: 1, heal: 18, tags: ["bandage"], rarity: "Incomum", value: 250 },
  painkillers: { name: "Painkillers", type: "medical", weight: 0.08, qty: 1, heal: 8, sanity: 5, tags: ["medicine"], rarity: "Comum", value: 180 },
  antibiotics: { name: "Antibiotics", type: "medical", weight: 0.05, qty: 1, heal: 15, tags: ["medicine"], rarity: "Raro", value: 600 },
  adrenaline: { name: "Adrenaline Syringe", type: "medical", weight: 0.05, qty: 1, stamina: 40, heal: 5, tags: ["medicine", "military"], rarity: "Épico", value: 1500 },
  morphine: { name: "Morphine Shot", type: "medical", weight: 0.05, qty: 1, heal: 25, sanity: 10, tags: ["medicine"], rarity: "Épico", value: 1800 },
  splint: { name: "Homemade Splint", type: "medical", weight: 0.4, qty: 1, heal: 12, tags: ["medical", "tool"], rarity: "Comum", value: 120 },
  thermite: { name: "Thermite Pack", type: "chemical", weight: 0.5, qty: 1, tags: ["chemical", "fire"], rarity: "Raro", value: 800 },
  iodine: { name: "Iodine Drops", type: "medical", weight: 0.05, qty: 1, heal: 2, tags: ["medicine"], rarity: "Raro", value: 450 },
  suture: { name: "Surgical Suture Kit", type: "medical", weight: 0.08, qty: 1, heal: 22, tags: ["medicine", "surgery"], rarity: "Raro", value: 750 },
  splintsCane: { name: "Emergency Crutch", type: "medical", weight: 2.0, qty: 1, heal: 10, tags: ["medical", "tool"], rarity: "Comum", value: 180 },
  castPlaster: { name: "Plaster Cast", type: "medical", weight: 1.5, qty: 1, heal: 15, tags: ["medical"], rarity: "Incomum", value: 350 },
  antiseptic: { name: "Antiseptic Solution", type: "medical", weight: 0.2, qty: 1, heal: 6, tags: ["medicine"], rarity: "Comum", value: 150 },
  eyeDrops: { name: "Eye Drops", type: "medical", weight: 0.03, qty: 1, sanity: 5, tags: ["medicine"], rarity: "Comum", value: 90 },
  medkitSmall: { name: "Small Medkit", type: "medical", weight: 0.6, qty: 1, heal: 25, tags: ["medicine", "kit"], rarity: "Raro", value: 900 },
  medkitFull: { name: "Full Medical Kit", type: "medical", weight: 2.0, qty: 1, heal: 55, tags: ["medicine", "kit"], rarity: "Épico", value: 2500 },

  // ==================== SURVIVAL ====================
  sleepingBag: { name: "Sleeping Bag", type: "survival", weight: 1.5, qty: 1, warmth: 20, tags: ["survival", "shelter"], rarity: "Incomum", value: 450 },
  tent: { name: "2-Person Tent", type: "survival", weight: 3.5, qty: 1, warmth: 35, tags: ["survival", "shelter"], rarity: "Raro", value: 1200 },
  firekit: { name: "Fire Starter Kit", type: "survival", weight: 0.2, qty: 1, tags: ["survival", "fire"], rarity: "Incomum", value: 280 },
  fishingRod: { name: "Fishing Rod", type: "survival", weight: 1.2, qty: 1, tags: ["survival", "fishing"], rarity: "Comum", value: 200 },
  fishingNet: { name: "Fishing Net", type: "survival", weight: 1.5, qty: 1, tags: ["survival", "fishing"], rarity: "Incomum", value: 350 },
  raincoat: { name: "Raincoat", type: "survival", weight: 0.5, qty: 1, warmth: 10, tags: ["survival", "clothing"], rarity: "Comum", value: 250 },
  gasMask: { name: "Gas Mask", type: "survival", weight: 0.6, qty: 1, tags: ["survival", "protection", "military"], rarity: "Raro", value: 800 },
  hazmatSuit: { name: "Hazmat Suit", type: "survival", weight: 3.0, qty: 1, tags: ["survival", "protection"], rarity: "Épico", value: 3500 },
  geigerCounter: { name: "Geiger Counter", type: "survival", weight: 0.3, qty: 1, tags: ["survival", "detection", "tech"], rarity: "Raro", value: 1500 },
  watch: { name: "Military Watch", type: "survival", weight: 0.08, qty: 1, tags: ["survival", "time", "military"], rarity: "Comum", value: 350 },
  parachute: { name: "Emergency Parachute", type: "survival", weight: 8.0, qty: 1, tags: ["survival", "escape"], rarity: "Lendário", value: 4500 },
  thermalBlanket: { name: "Thermal Blanket", type: "survival", weight: 0.1, qty: 1, warmth: 15, tags: ["survival", "warmth"], rarity: "Comum", value: 120 },
  lanternOil: { name: "Oil Lantern", type: "survival", weight: 0.6, qty: 1, tags: ["survival", "light"], rarity: "Comum", value: 180 },
  solarCharger: { name: "Solar Panel Charger", type: "survival", weight: 1.0, qty: 1, tags: ["survival", "tech", "energy"], rarity: "Raro", value: 1200 },
  dynamiteStick: { name: "Dynamite Stick", type: "survival", weight: 0.5, qty: 1, weapon: { damage: 150, range: 150, stamina: 0, noise: 200, mode: "melee" }, tags: ["survival", "explosive"], rarity: "Lendário", value: 3000 },

  // ==================== TECH ====================
  militaryTablet: { name: "Military Tablet", type: "tech", weight: 0.8, qty: 1, tags: ["tech", "military", "data"], rarity: "Épico", value: 3500 },
  laptopWorking: { name: "Functional Laptop", type: "tech", weight: 2.0, qty: 1, tags: ["tech", "data"], rarity: "Raro", value: 2500 },
  hdEncrypted: { name: "Encrypted HDD", type: "tech", weight: 0.3, qty: 1, tags: ["tech", "data", "secret"], rarity: "Épico", value: 2000 },
  pendrive: { name: "Encrypted Pendrive", type: "tech", weight: 0.02, qty: 1, tags: ["tech", "data"], rarity: "Raro", value: 1000 },
  securityCam: { name: "Security Camera", type: "tech", weight: 0.9, qty: 1, tags: ["tech", "surveillance"], rarity: "Raro", value: 850 },
  droneRecon: { name: "Recon Drone", type: "tech", weight: 1.2, qty: 1, tags: ["tech", "military", "recon"], rarity: "Épico", value: 3200 },
  nightVision: { name: "Night Vision Goggles", type: "tech", weight: 0.4, qty: 1, tags: ["tech", "military", "vision"], rarity: "Épico", value: 2800 },
  thermalVisor: { name: "Thermal Visor", type: "tech", weight: 0.5, qty: 1, tags: ["tech", "military", "vision"], rarity: "Lendário", value: 4000 },
  radioTrx: { name: "Dual-Band Radio", type: "tech", weight: 0.3, qty: 1, tags: ["tech", "communication"], rarity: "Raro", value: 1200 },
  batteryPack: { name: "Power Bank 50000mAh", type: "tech", weight: 0.8, qty: 1, tags: ["tech", "energy"], rarity: "Incomum", value: 650 },
  generatorSmall: { name: "Portable Generator", type: "tech", weight: 25.0, qty: 1, tags: ["tech", "energy"], rarity: "Raro", value: 3500 },
  signalJammer: { name: "Signal Jammer", type: "tech", weight: 0.5, qty: 1, tags: ["tech", "military"], rarity: "Lendário", value: 3800 },
  binosNv: { name: "Night Binoculars", type: "tech", weight: 0.9, qty: 1, tags: ["tech", "vision", "military"], rarity: "Raro", value: 1800 },
  droneCombat: { name: "Combat Drone", type: "tech", weight: 3.0, qty: 1, weapon: { damage: 60, range: 800, stamina: 0, noise: 90, mode: "firearm", ammo: "9mm Rounds" }, tags: ["tech", "military", "drone"], rarity: "Lendário", value: 5000 },

  // ==================== MILITARY ====================
  vestFrag: { name: "Fragmentation Vest", type: "military", weight: 3.5, qty: 1, warmth: 8, tags: ["military", "armor"], rarity: "Raro", value: 1800 },
  vestKevlar: { name: "Kevlar Vest", type: "military", weight: 3.0, qty: 1, warmth: 6, tags: ["military", "armor"], rarity: "Épico", value: 2800 },
  helmetMil: { name: "Military Helmet", type: "military", weight: 1.2, qty: 1, warmth: 5, tags: ["military", "armor", "headgear"], rarity: "Raro", value: 1500 },
  camoUniform: { name: "Camo Uniform Set", type: "military", weight: 1.8, qty: 1, warmth: 12, tags: ["military", "clothing"], rarity: "Incomum", value: 650 },
  tacticalPack: { name: "Tactical Backpack", type: "bag", weight: 1.0, qty: 1, carryBonus: 14, tags: ["military", "bag"], rarity: "Raro", value: 1200 },
  suppressor: { name: "Suppressor Attachment", type: "military", weight: 0.3, qty: 1, tags: ["military", "attachment", "silent"], rarity: "Épico", value: 2500 },
  laserSight: { name: "Laser Sight", type: "military", weight: 0.1, qty: 1, tags: ["military", "attachment"], rarity: "Raro", value: 800 },
  holoSight: { name: "Holographic Sight", type: "military", weight: 0.2, qty: 1, tags: ["military", "attachment", "sight"], rarity: "Épico", value: 2200 },
  thermalSight: { name: "Thermal Sight", type: "military", weight: 0.5, qty: 1, tags: ["military", "attachment", "sight"], rarity: "Lendário", value: 4200 },
  nightSight: { name: "Night Vision Sight", type: "military", weight: 0.4, qty: 1, tags: ["military", "attachment", "sight"], rarity: "Lendário", value: 3800 },
  gasCanister: { name: "Tear Gas Canister", type: "military", weight: 0.4, qty: 1, tags: ["military", "chemical", "gas"], rarity: "Raro", value: 600 },
  smokeGrenade: { name: "Smoke Grenade", type: "military", weight: 0.5, qty: 1, tags: ["military", "tactical"], rarity: "Incomum", value: 350 },
  flashGrenade: { name: "Flashbang", type: "military", weight: 0.4, qty: 1, tags: ["military", "tactical", "light"], rarity: "Raro", value: 500 },
  grenadeFrag: { name: "Fragmentation Grenade", type: "military", weight: 0.4, qty: 1, weapon: { damage: 200, range: 100, stamina: 0, noise: 200, mode: "melee" }, tags: ["military", "explosive"], rarity: "Épico", value: 2000 },
  c4Charge: { name: "C4 Charge", type: "military", weight: 1.0, qty: 1, weapon: { damage: 500, range: 200, stamina: 0, noise: 250, mode: "melee" }, tags: ["military", "explosive"], rarity: "Lendário", value: 5000 },
  claymore: { name: "Claymore Mine", type: "military", weight: 1.5, qty: 1, tags: ["military", "explosive", "trap"], rarity: "Lendário", value: 4500 },

  // ==================== STRUCTURES ====================
  barricade: { name: "Window Barricade", type: "structure", weight: 2.5, qty: 1, tags: ["construction", "defense"], rarity: "Comum", value: 100 },
  workbench: { name: "Workbench", type: "station", weight: 8, qty: 1, tags: ["station", "workbench"], rarity: "Incomum", value: 400 },
  storageChest: { name: "Wooden Chest", type: "storage", weight: 6, qty: 1, storageSlots: 18, carryBonus: 18, tags: ["storage", "chest"], rarity: "Incomum", value: 350 },
  sandbag: { name: "Sandbag", type: "structure", weight: 15.0, qty: 1, tags: ["construction", "defense"], rarity: "Comum", value: 80 },
  fencePost: { name: "Fence Post", type: "structure", weight: 3.0, qty: 1, tags: ["construction", "defense"], rarity: "Comum", value: 60 },
  barbedWire: { name: "Barbed Wire Roll", type: "structure", weight: 4.0, qty: 1, tags: ["construction", "defense"], rarity: "Incomum", value: 250 },
  trapBearing: { name: "Bear Trap", type: "structure", weight: 5.0, qty: 1, weapon: { damage: 80, range: 10, stamina: 0, noise: 100, mode: "melee" }, tags: ["trap", "defense"], rarity: "Raro", value: 900 },
  campfire: { name: "Campfire Kit", type: "survival", weight: 2.0, qty: 1, warmth: 40, tags: ["survival", "fire"], rarity: "Comum", value: 150 },
  cookingPot: { name: "Cooking Pot", type: "survival", weight: 1.5, qty: 1, tags: ["survival", "cooking"], rarity: "Comum", value: 200 },
  forge: { name: "Portable Forge", type: "station", weight: 15.0, qty: 1, tags: ["station", "crafting", "metal"], rarity: "Raro", value: 1500 },
  farmPlot: { name: "Farming Plot", type: "structure", weight: 0.5, qty: 1, tags: ["farming", "construction"], rarity: "Comum", value: 80 },
  irrigation: { name: "Irrigation System", type: "structure", weight: 2.0, qty: 1, tags: ["farming", "construction"], rarity: "Incomum", value: 400 },
  solarArray: { name: "Solar Panel Array", type: "tech", weight: 12.0, qty: 1, tags: ["tech", "energy", "construction"], rarity: "Épico", value: 4500 },
  windmill: { name: "Homemade Windmill", type: "structure", weight: 8.0, qty: 1, tags: ["construction", "energy"], rarity: "Raro", value: 2000 },
  rainCollector: { name: "Rain Collector Barrel", type: "structure", weight: 5.0, qty: 1, thirst: 15, tags: ["survival", "water", "construction"], rarity: "Comum", value: 250 },
  antenna: { name: "Ham Radio Antenna", type: "tech", weight: 3.0, qty: 1, tags: ["tech", "communication", "construction"], rarity: "Raro", value: 1500 },
  turretAim: { name: "Auto-Turret Module", type: "military", weight: 8.0, qty: 1, weapon: { damage: 45, range: 600, stamina: 0, noise: 120, mode: "firearm", ammo: "9mm Rounds" }, tags: ["military", "defense", "tech"], rarity: "Lendário", value: 5000 },
  waterPurif: { name: "Water Purifier Unit", type: "survival", weight: 6.0, qty: 1, tags: ["survival", "water", "construction"], rarity: "Raro", value: 1800 },

  // ==================== VEHICLES ====================
  wheelRim: { name: "Tire and Rim", type: "vehicle", weight: 8.0, qty: 1, tags: ["vehicle", "part"], rarity: "Comum", value: 200 },
  fuelCan: { name: "Fuel Canister 5L", type: "vehicle", weight: 4.5, qty: 1, tags: ["vehicle", "fuel"], rarity: "Incomum", value: 350 },
  batteryCar: { name: "Car Battery", type: "vehicle", weight: 12.0, qty: 1, tags: ["vehicle", "part", "energy"], rarity: "Incomum", value: 400 },
  carEngine: { name: "Engine Block", type: "vehicle", weight: 25.0, qty: 1, tags: ["vehicle", "part"], rarity: "Raro", value: 800 },
  sparkPlug: { name: "Spark Plugs Set", type: "vehicle", weight: 0.1, qty: 1, tags: ["vehicle", "part"], rarity: "Incomum", value: 150 },
  oilFilter: { name: "Oil Filter", type: "vehicle", weight: 0.3, qty: 1, tags: ["vehicle", "part", "mechanical"], rarity: "Comum", value: 100 },
  brakePad: { name: "Brake Pads", type: "vehicle", weight: 1.0, qty: 1, tags: ["vehicle", "part"], rarity: "Comum", value: 120 },
  headlight: { name: "Headlight Assembly", type: "vehicle", weight: 0.8, qty: 1, tags: ["vehicle", "part", "light"], rarity: "Comum", value: 150 },
  transmission: { name: "Transmission Gearbox", type: "vehicle", weight: 30.0, qty: 1, tags: ["vehicle", "part"], rarity: "Épico", value: 2000 },
  turboKit: { name: "Turbo Kit", type: "vehicle", weight: 5.0, qty: 1, tags: ["vehicle", "part", "upgrade"], rarity: "Lendário", value: 4000 },
  armorPlates: { name: "Vehicle Armor Plates", type: "vehicle", weight: 20.0, qty: 1, tags: ["vehicle", "armor", "upgrade"], rarity: "Épico", value: 3500 },
  fuelInjector: { name: "Fuel Injector", type: "vehicle", weight: 0.5, qty: 1, tags: ["vehicle", "part"], rarity: "Raro", value: 350 },

  // ==================== FOOD (expanded) ====================
  noodlePack: { name: "Instant Noodles", type: "food", weight: 0.15, qty: 1, hunger: 14, tags: ["food"], rarity: "Comum", value: 55 },
  cannedChili: { name: "Canned Chili", type: "food", weight: 0.5, qty: 1, hunger: 22, tags: ["food"], rarity: "Comum", value: 140 },
  cerealBox: { name: "Cereal Box", type: "food", weight: 0.4, qty: 1, hunger: 12, tags: ["food"], rarity: "Comum", value: 100 },
  riceBowl: { name: "Instant Rice Bowl", type: "food", weight: 0.3, qty: 1, hunger: 18, tags: ["food"], rarity: "Comum", value: 110 },
  cannedFruit: { name: "Canned Peaches", type: "food", weight: 0.4, qty: 1, hunger: 10, thirst: 8, tags: ["food"], rarity: "Comum", value: 120 },
  trailMix: { name: "Trail Mix", type: "food", weight: 0.2, qty: 1, hunger: 12, stamina: 5, tags: ["food"], rarity: "Incomum", value: 180 },
  cannedSalmon: { name: "Canned Salmon", type: "food", weight: 0.5, qty: 1, hunger: 20, tags: ["food"], rarity: "Incomum", value: 200 },
  honey: { name: "Honey Jar", type: "food", weight: 0.4, qty: 1, hunger: 8, heal: 3, tags: ["food"], rarity: "Incomum", value: 250 },
  flour: { name: "Bag of Flour", type: "food", weight: 1.0, qty: 1, hunger: 25, tags: ["food"], rarity: "Comum", value: 130 },
  sugar: { name: "Bag of Sugar", type: "food", weight: 1.0, qty: 1, hunger: 5, tags: ["food"], rarity: "Comum", value: 120 },
  cookingOil: { name: "Cooking Oil Bottle", type: "food", weight: 0.9, qty: 1, hunger: 5, tags: ["food"], rarity: "Comum", value: 150 },
  proteinPowder: { name: "Protein Powder", type: "food", weight: 0.8, qty: 1, hunger: 10, stamina: 8, tags: ["food", "nutrition"], rarity: "Incomum", value: 350 },
  chiliCan: { name: "Hot Pepper Sauce", type: "food", weight: 0.2, qty: 1, hunger: 3, tags: ["food", "spice"], rarity: "Comum", value: 80 },
  mustard: { name: "Mustard Bottle", type: "food", weight: 0.3, qty: 1, hunger: 2, tags: ["food"], rarity: "Comum", value: 60 },
  ketchup: { name: "Ketchup Bottle", type: "food", weight: 0.3, qty: 1, hunger: 3, tags: ["food"], rarity: "Comum", value: 60 },

  // ==================== WATER (expanded) ====================
  sodaBottle: { name: "Cola 2L", type: "water", weight: 2.1, qty: 1, thirst: 20, tags: ["water"], rarity: "Comum", value: 100 },
  lemonade: { name: "Lemonade 1L", type: "water", weight: 1.0, qty: 1, thirst: 18, tags: ["water"], rarity: "Comum", value: 120 },
  purifiedWater: { name: "Purified Water", type: "water", weight: 0.5, qty: 1, thirst: 30, tags: ["water", "purified"], rarity: "Incomum", value: 200 },
  rainWater: { name: "Rainwater Container", type: "water", weight: 3.0, qty: 1, thirst: 22, tags: ["water", "harvest"], rarity: "Comum", value: 80 },

  // ==================== GUNS (expanded) ====================
  shotgunSawed: { name: "Sawed-Off Pump", type: "weapon", weight: 2.2, qty: 1, weapon: { damage: 100, range: 260, stamina: 9, noise: 155, mode: "firearm", ammo: "12 Gauge Shells" }, tags: ["firearm", "shotgun"], rarity: "Raro", value: 2000 },
  revolverMag: { name: ".44 Magnum Revolver", type: "weapon", weight: 1.5, qty: 1, weapon: { damage: 72, range: 560, stamina: 7, noise: 128, mode: "firearm", ammo: ".44 Magnum Rounds" }, tags: ["firearm", "revolver"], rarity: "Épico", value: 3200 },
  carbine556: { name: "5.56 Carbine", type: "weapon", weight: 3.2, qty: 1, weapon: { damage: 68, range: 760, stamina: 9, noise: 132, mode: "firearm", ammo: "5.56 Rounds" }, tags: ["firearm", "rifle"], rarity: "Épico", value: 4000 },
  smg9mm: { name: "9mm SMG", type: "weapon", weight: 2.5, qty: 1, weapon: { damage: 35, range: 520, stamina: 6, noise: 110, mode: "firearm", ammo: "9mm Rounds" }, tags: ["firearm", "smg"], rarity: "Épico", value: 3500 },
  leverRifle: { name: "Lever-Action Rifle", type: "weapon", weight: 3.5, qty: 1, weapon: { damage: 82, range: 720, stamina: 9, noise: 138, mode: "firearm", ammo: ".44 Magnum Rounds" }, tags: ["firearm", "rifle"], rarity: "Épico", value: 2900 },
  dblBarrel: { name: "Double Barrel Shotgun", type: "weapon", weight: 3.7, qty: 1, weapon: { damage: 112, range: 380, stamina: 9, noise: 150, mode: "firearm", ammo: "12 Gauge Shells" }, tags: ["firearm", "shotgun"], rarity: "Raro", value: 2200 },
  varmintRifle: { name: "Varmint Rifle .223", type: "weapon", weight: 3.4, qty: 1, weapon: { damage: 58, range: 840, stamina: 9, noise: 122, mode: "firearm", ammo: ".223 Rounds" }, tags: ["firearm", "rifle"], rarity: "Incomum", value: 1800 },
  grenadeLauncher: { name: "M203 Underbarrel", type: "weapon", weight: 2.0, qty: 1, weapon: { damage: 180, range: 400, stamina: 0, noise: 160, mode: "firearm", ammo: "40mm Grenade" }, tags: ["firearm", "launcher"], rarity: "Lendário", value: 5000 },
  flareGun: { name: "Flare Gun", type: "weapon", weight: 0.5, qty: 1, weapon: { damage: 20, range: 150, stamina: 3, noise: 30, mode: "firearm", ammo: "Flares" }, tags: ["firearm", "signal"], rarity: "Comum", value: 250 },
  bowCompound: { name: "Compound Bow", type: "weapon", weight: 2.0, qty: 1, weapon: { damage: 50, range: 450, stamina: 12, noise: 5, mode: "firearm", ammo: "Arrows" }, tags: ["firearm", "silent", "bow"], rarity: "Raro", value: 1500 },

  // ==================== CLOTHING (expanded) ====================
  jacketLeather: { name: "Leather Jacket", type: "bag", weight: 2.5, qty: 1, carryBonus: 2, warmth: 15, tags: ["clothing", "armor"], rarity: "Incomum", value: 550 },
  bootsCombat: { name: "Combat Boots", type: "bag", weight: 1.8, qty: 1, carryBonus: 1, warmth: 8, tags: ["clothing", "military"], rarity: "Raro", value: 650 },
  gasMaskFilter: { name: "Gas Mask Filter", type: "survival", weight: 0.2, qty: 1, tags: ["survival", "protection"], rarity: "Incomum", value: 350 },
  rainPoncho: { name: "Rain Poncho", type: "bag", weight: 0.4, qty: 1, carryBonus: 1, warmth: 5, tags: ["clothing", "survival"], rarity: "Comum", value: 150 },
  helmetConstruction: { name: "Hard Hat", type: "bag", weight: 0.35, qty: 1, carryBonus: 1, tags: ["clothing", "headgear"], rarity: "Comum", value: 100 },
  glovesLeather: { name: "Leather Gloves", type: "bag", weight: 0.2, qty: 1, carryBonus: 1, warmth: 5, tags: ["clothing", "gloves"], rarity: "Comum", value: 120 },
  scarfWool: { name: "Wool Scarf", type: "bag", weight: 0.15, qty: 1, carryBonus: 1, warmth: 10, tags: ["clothing"], rarity: "Comum", value: 90 },
  vestTactical: { name: "Tactical Vest", type: "bag", weight: 1.2, qty: 1, carryBonus: 8, warmth: 4, tags: ["military", "bag"], rarity: "Raro", value: 950 },
  kevlarHelm: { name: "Kevlar Helmet", type: "bag", weight: 1.4, qty: 1, carryBonus: 1, warmth: 4, tags: ["military", "armor", "headgear"], rarity: "Épico", value: 2400 },
  ghilieSuit: { name: "Ghillie Suit", type: "bag", weight: 3.0, qty: 1, carryBonus: 2, warmth: 8, tags: ["military", "camouflage"], rarity: "Lendário", value: 4500 },

  // ==================== SPECIAL / RARE ====================
  droneAmmo: { name: "Drone Payload Pack", type: "ammo", weight: 0.8, qty: 1, tags: ["ammo", "drone"], rarity: "Raro", value: 800 },
  infectedBlood: { name: "Infected Blood Sample", type: "material", weight: 0.05, qty: 1, tags: ["material", "biohazard"], rarity: "Épico", value: 2000 },
  immunityCure: { name: "Experimental Cure", type: "medical", weight: 0.2, qty: 1, heal: 80, tags: ["medicine", "cure"], rarity: "Lendário", value: 5000 },
  alienArtifact: { name: "Strange Artifact", type: "luxury", weight: 0.3, qty: 1, tags: ["mystery", "artifact"], rarity: "Lendário", value: 5000 },
  treasureMap: { name: "Treasure Map", type: "survival", weight: 0.02, qty: 1, tags: ["survival", "quest"], rarity: "Épico", value: 1500 },
  militaryDogTag: { name: "Dog Tags", type: "luxury", weight: 0.03, qty: 1, tags: ["military", "luxury"], rarity: "Incomum", value: 200 },
  goldBar: { name: "Gold Bar 1oz", type: "luxury", weight: 0.03, qty: 1, tags: ["luxury", "trade"], rarity: "Lendário", value: 5000 },
  diamondRing: { name: "Diamond Ring", type: "luxury", weight: 0.02, qty: 1, tags: ["luxury", "trade"], rarity: "Lendário", value: 4500 },
  rareCoin: { name: "Gold Coin", type: "luxury", weight: 0.01, qty: 1, tags: ["luxury", "trade"], rarity: "Raro", value: 2000 },
  photo: { name: "Old Photograph", type: "luxury", weight: 0.01, qty: 1, sanity: 3, tags: ["luxury", "memory"], rarity: "Comum", value: 50 },

  // Include firearms at the end
  ...firearmTemplates,
};

const ammoPool = [
  itemTemplates.ammo9mm,
  itemTemplates.ammo45,
  itemTemplates.ammo38,
  itemTemplates.ammo44,
  itemTemplates.ammo556,
  itemTemplates.ammo308,
  itemTemplates.ammo223,
  itemTemplates.shells12,
];

export const recipes: Recipe[] = [
  // === BASIC ===
  { id: "saw-planks", name: "🪵 Wood Log = 2 Planks", needs: { "Wood Log": 1 }, result: { ...itemTemplates.planks, qty: 2 }, category: "Materials" },
  { id: "barricade", name: "🔨 Planks + Nails = Barricade", needs: { Planks: 2, Nails: 2 }, result: itemTemplates.barricade, category: "Defense" },
  { id: "clean-bandage", name: "🩹 Rag + Alcohol = Bandage", needs: { Rag: 1, "Alcohol Wipes": 1 }, result: itemTemplates.bandage, category: "Medical" },
  { id: "workbench", name: "🪵 Wood Logs + Planks + Nails = Workbench", needs: { "Wood Log": 4, Planks: 2, Nails: 4 }, result: itemTemplates.workbench, category: "Station" },
  { id: "storage-chest", name: "📦 Workbench: Planks + Nails = Chest", needs: { Planks: 6, Nails: 6 }, station: "Workbench", result: itemTemplates.storageChest, category: "Storage" },

  // === WEAPONS (improvised) ===
  { id: "spear-homemade", name: "🗡️ Plank + Knife = Spear", needs: { Planks: 1, "Kitchen Knife": 1 }, result: itemTemplates.spear, category: "Weapon" },
  { id: "nail-bat", name: "🔨 Bat + Nails = Nail Bat", needs: { "Baseball Bat": 1, Nails: 5 }, result: { ...itemTemplates.baseballBat, name: "Nail Bat", weapon: { damage: 40, range: 48, stamina: 18, noise: 36, mode: "melee" as const }, rarity: "Incomum" }, category: "Weapon" },
  { id: "fire-bottle", name: "🔥 Rag + Alcohol = Molotov", needs: { Rag: 1, "Alcohol Wipes": 2 }, result: { name: "Molotov Cocktail", type: "weapon" as const, weight: 0.5, qty: 1, weapon: { damage: 45, range: 60, stamina: 10, noise: 80, mode: "melee" as const }, tags: ["fire", "thrown"], rarity: "Incomum" }, category: "Weapon" },

  // === STRUCTURES ===
  { id: "sandbag", name: "🏗️ Scrap Metal + Cloth = Sandbag", needs: { "Scrap Metal": 2, "Cloth Roll": 1 }, result: itemTemplates.sandbag, category: "Defense" },
  { id: "barbed-wire", name: "🏗️ Copper Wire + Nails = Barbed Wire", needs: { "Copper Wire": 2, Nails: 4 }, result: itemTemplates.barbedWire, category: "Defense" },
  { id: "fence-post", name: "🏗️ Wood Log + Nails = Fence Post", needs: { "Wood Log": 1, Nails: 3 }, result: itemTemplates.fencePost, category: "Defense" },
  { id: "trap-bear", name: "🔨 Scrap Metal + Rope = Bear Trap", needs: { "Scrap Metal": 3, "Rope 10m": 1 }, station: "Workbench", result: itemTemplates.trapBearing, category: "Defense" },
  { id: "forge-portable", name: "🔥 Workbench: Scrap Metal + Stone Block = Forge", needs: { "Scrap Metal": 8, "Stone Block": 6, Nails: 10 }, station: "Workbench", result: itemTemplates.forge, category: "Station" },
  { id: "farm-plot", name: "🌱 Planks + Rope = Farming Plot", needs: { Planks: 3, "Rope 10m": 1 }, result: itemTemplates.farmPlot, category: "Food" },
  { id: "rain-collector", name: "💧 Scrap Metal + Barrel = Rain Collector", needs: { "Scrap Metal": 5, Planks: 4 }, station: "Workbench", result: itemTemplates.rainCollector, category: "Survival" },
  { id: "water-purifier", name: "💧 Copper Wire + Filter = Water Purifier", needs: { "Copper Wire": 4, "Planks": 2, "Glass Pane": 1 }, station: "Workbench", result: itemTemplates.waterPurif, category: "Survival" },
  { id: "windmill", name: "🏗️ Wood Logs + Planks + Scrap Metal = Windmill", needs: { "Wood Log": 6, Planks: 8, "Scrap Metal": 4 }, station: "Workbench", result: itemTemplates.windmill, category: "Energy" },
  { id: "solar-panel", name: "🔋 Glass + Wire + Scrap = Solar Panel", needs: { "Glass Pane": 2, "Copper Wire": 6, "Scrap Metal": 4 }, station: "Workbench", result: itemTemplates.solarArray, category: "Energy" },
  { id: "auto-turret", name: "⚔️ Workbench: SMG + Camera + Electronics = Auto-Turret", needs: { "9mm SMG": 1, "Security Camera": 1, "Copper Wire": 3, "Scrap Metal": 5 }, station: "Workbench", result: itemTemplates.turretAim, category: "Defense" },
  { id: "antenna-ham", name: "📡 Wire + Scrap Metal = Ham Antenna", needs: { "Copper Wire": 4, "Scrap Metal": 3 }, station: "Workbench", result: itemTemplates.antenna, category: "Tech" },

  // === MEDICAL ===
  { id: "painkillers-improv", name: "💊 Rag + Alcohol = Improvised Painkillers", needs: { Rag: 2, "Alcohol Wipes": 1 }, result: itemTemplates.painkillers, category: "Medical" },
  { id: "antiseptic-spray", name: "💊 Alcohol + Copper Wire = Antiseptic", needs: { "Alcohol Wipes": 2, "Copper Wire": 1 }, result: itemTemplates.antiseptic, category: "Medical" },
  { id: "medkit-improv", name: "💊 Bandage + Antiseptic + Cloth = Small Medkit", needs: { "Sterile Bandage": 3, "Antiseptic Solution": 1, "Cloth Roll": 1 }, result: itemTemplates.medkitSmall, category: "Medical" },
  { id: "suture-kit", name: "💊 Copper Wire + Needle = Suture Kit", needs: { "Copper Wire": 1, "Rag": 2 }, result: itemTemplates.suture, category: "Medical" },
  { id: "splint-make", name: "💊 Planks + Cloth = Splint", needs: { Planks: 1, "Cloth Roll": 1 }, result: itemTemplates.splint, category: "Medical" },

  // === MELEE (advanced) ===
  { id: "machete-improv", name: "🗡️ Forge: Scrap Metal + Planks + Nails = Machete", needs: { "Scrap Metal": 3, Planks: 1, Nails: 2 }, station: "Forge", result: itemTemplates.machete, category: "Weapon" },
  { id: "fire-axe", name: "🗡️ Forge: Scrap Metal + Wood Log = Fire Axe", needs: { "Scrap Metal": 4, "Wood Log": 1 }, station: "Forge", result: itemTemplates.fireAxe, category: "Weapon" },
  { id: "crossbow", name: "🗡️ Workbench: Planks + Scrap Metal + Rope = Crossbow", needs: { Planks: 2, "Scrap Metal": 4, "Rope 10m": 1 }, station: "Workbench", result: itemTemplates.crossbow, category: "Weapon" },
  { id: "arrow-pack", name: "🗡️ Planks + Rag = 6 Bolts", needs: { Planks: 1, Rag: 3 }, result: { ...itemTemplates.arrows, qty: 6 }, category: "Weapon" },

  // === FUEL & CHEMICAL ===
  { id: "thermite", name: "🧪 Forge: Coal + Sulfur = Thermite", needs: { "Coal Bag": 1, "Sulfur Powder": 2 }, station: "Forge", result: itemTemplates.thermite, category: "Explosive" },
  { id: "c4-charge", name: "🧪 Workbench: Thermite + Wire + Scrap = C4 Charge", needs: { "Thermite Pack": 1, "Copper Wire": 3, "Scrap Metal": 5 }, station: "Workbench", result: itemTemplates.c4Charge, category: "Explosive" },
  { id: "grenade-make", name: "🧪 Workbench: Scrap Metal + Sulfur + Wire = Frag Grenade", needs: { "Scrap Metal": 2, "Sulfur Powder": 1, "Copper Wire": 1 }, station: "Workbench", result: itemTemplates.grenadeFrag, category: "Explosive" },
  { id: "smoke-grenade", name: "🧪 Rag + Chemical = Smoke Grenade", needs: { Rag: 3, "Alcohol Wipes": 2 }, result: itemTemplates.smokeGrenade, category: "Tactical" },
  { id: "flashbang-make", name: "🧪 Workbench: Wire + Glass + Rag = Flashbang", needs: { "Copper Wire": 2, "Glass Pane": 1, Rag: 2 }, station: "Workbench", result: itemTemplates.flashGrenade, category: "Tactical" },

  // === VEHICLE PARTS ===
  { id: "fuel-can", name: "⛽ Scrap Metal + Rubber = Fuel Canister", needs: { "Scrap Metal": 2, "Rubber Sheet": 1 }, result: itemTemplates.fuelCan, category: "Vehicle" },
  { id: "spark-plugs", name: "🔧 Copper Wire + Scrap = Spark Plugs", needs: { "Copper Wire": 2, "Scrap Metal": 1 }, result: itemTemplates.sparkPlug, category: "Vehicle" },
  { id: "armor-plates", name: "🔧 Workbench: Sheet Metal + Nails = Armor Plates", needs: { "Sheet Metal": 4, Nails: 8 }, station: "Workbench", result: itemTemplates.armorPlates, category: "Vehicle" },
  { id: "turbo-kit", name: "🔧 Forge: Engine Block + Wire + Scrap = Turbo Kit", needs: { "Engine Block": 1, "Copper Wire": 4, "Scrap Metal": 6 }, station: "Forge", result: itemTemplates.turboKit, category: "Vehicle" },

  // === AMMO CRAFTING ===
  { id: "ammo9mm-make", name: "💥 Sulfur + Scrap + Lead = 9mm Rounds x10", needs: { "Sulfur Powder": 1, "Scrap Metal": 1 }, result: { ...itemTemplates.ammo9mm, qty: 10 }, category: "Ammo" },
  { id: "shells-make", name: "💥 Sulfur + Rag = 12G Shells x4", needs: { "Sulfur Powder": 1, Rag: 2 }, result: { ...itemTemplates.shells12, qty: 4 }, category: "Ammo" },
  { id: "arrows-make", name: "💥 Planks + Scrap = Bolts x6", needs: { Planks: 1, "Scrap Metal": 1 }, result: { ...itemTemplates.arrows, qty: 6 }, category: "Ammo" },
];

export function randomLoot(lootMultiplier: number): Item[] {
  // Common household items
  const householdPool = [
    itemTemplates.cannedBeans,
    itemTemplates.chips,
    itemTemplates.cannedTuna,
    itemTemplates.soup,
    itemTemplates.crackers,
    itemTemplates.granolaBar,
    itemTemplates.waterBottle,
    itemTemplates.juiceBox,
    itemTemplates.sodaBottle,
    itemTemplates.kitchenKnife,
    itemTemplates.baseballBat,
    itemTemplates.fryingPan,
    itemTemplates.pipe,
    itemTemplates.sharpenedStick,
    itemTemplates.planks,
    itemTemplates.nails,
    itemTemplates.rag,
    itemTemplates.alcohol,
    itemTemplates.painkillers,
    itemTemplates.ductTape,
    itemTemplates.rope,
    itemTemplates.scrapMetal,
    itemTemplates.flashlight,
    itemTemplates.hammer,
    itemTemplates.screwdriver,
    itemTemplates.wrench,
    itemTemplates.pliers,
    itemTemplates.compass,
    itemTemplates.map,
    itemTemplates.watch,
    itemTemplates.raincoat,
    itemTemplates.bootsCombat,
    itemTemplates.firekit,
    itemTemplates.fishingRod,
    itemTemplates.sleepingBag,
    itemTemplates.thermalBlanket,
    itemTemplates.campfire,
    itemTemplates.cookingPot,
    itemTemplates.farmPlot,
    itemTemplates.rainCollector,
    itemTemplates.energyBar,
    itemTemplates.teaBags,
    itemTemplates.coffeePowder,
    itemTemplates.chocolateBar,
    itemTemplates.fruitCup,
    itemTemplates.cerealBox,
    itemTemplates.noodlePack,
    itemTemplates.oatmealPkg,
    itemTemplates.trailMix,
    itemTemplates.honey,
    itemTemplates.flour,
    itemTemplates.sugar,
    itemTemplates.cookingOil,
    itemTemplates.militaryDogTag,
    itemTemplates.photo,
    itemTemplates.bandage,
    itemTemplates.antiseptic,
    itemTemplates.eyeDrops,
  ];

  // Tools and weapons
  const toolPool = [
    itemTemplates.handAxe,
    itemTemplates.hatchet,
    itemTemplates.crowbar,
    itemTemplates.nightstick,
    itemTemplates.knife,
    itemTemplates.huntingKnife,
    itemTemplates.saw,
    itemTemplates.drill,
    itemTemplates.wrench,
    itemTemplates.binoculars,
    itemTemplates.lanternOil,
    itemTemplates.compass,
    itemTemplates.solarCharger,
    itemTemplates.waterFilter,
    itemTemplates.ropeLadder,
    itemTemplates.ropeRappel,
    itemTemplates.hook,
    itemTemplates.sledgeHammer,
    itemTemplates.machete,
    itemTemplates.pickaxe,
    itemTemplates.shovel,
    itemTemplates.toolbox,
    itemTemplates.fishingNet,
  ];

  // Medical
  const medicalPool = [
    itemTemplates.bandage,
    itemTemplates.painkillers,
    itemTemplates.antibiotics,
    itemTemplates.adrenaline,
    itemTemplates.morphine,
    itemTemplates.splint,
    itemTemplates.antiseptic,
    itemTemplates.medkitSmall,
    itemTemplates.medkitFull,
    itemTemplates.suture,
    itemTemplates.iodine,
    itemTemplates.castPlaster,
    itemTemplates.splintsCane,
  ];

  // Tech
  const techPool = [
    itemTemplates.batteryPack,
    itemTemplates.radioTrx,
    itemTemplates.securityCam,
    itemTemplates.laptopWorking,
    itemTemplates.pendrive,
    itemTemplates.signalJammer,
    itemTemplates.binosNv,
    itemTemplates.nightVision,
    itemTemplates.thermalVisor,
    itemTemplates.militaryTablet,
    itemTemplates.geigerCounter,
    itemTemplates.hdEncrypted,
  ];

  // Military
  const militaryPool = [
    itemTemplates.vestFrag,
    itemTemplates.vestKevlar,
    itemTemplates.helmetMil,
    itemTemplates.camoUniform,
    itemTemplates.tacticalPack,
    itemTemplates.suppressor,
    itemTemplates.laserSight,
    itemTemplates.holoSight,
    itemTemplates.nightSight,
    itemTemplates.thermalSight,
    itemTemplates.gasMask,
    itemTemplates.hazmatSuit,
    itemTemplates.thermalBlanket,
    itemTemplates.canteen,
    itemTemplates.mre,
  ];

  // Structure
  const structurePool = [
    itemTemplates.sandbag,
    itemTemplates.barbedWire,
    itemTemplates.fencePost,
    itemTemplates.trapBearing,
    itemTemplates.forge,
    itemTemplates.solarArray,
    itemTemplates.windmill,
    itemTemplates.antenna,
    itemTemplates.irrigation,
    itemTemplates.farmPlot,
    itemTemplates.storageChest,
    itemTemplates.workbench,
  ];

  // Luxury
  const luxuryPool = [
    itemTemplates.goldBar,
    itemTemplates.diamondRing,
    itemTemplates.rareCoin,
    itemTemplates.alienArtifact,
    itemTemplates.immunityCure,
    itemTemplates.infectedBlood,
    itemTemplates.treasureMap,
    itemTemplates.photo,
  ];

  // Vehicle
  const vehiclePool = [
    itemTemplates.wheelRim,
    itemTemplates.fuelCan,
    itemTemplates.batteryCar,
    itemTemplates.carEngine,
    itemTemplates.sparkPlug,
    itemTemplates.oilFilter,
    itemTemplates.brakePad,
    itemTemplates.headlight,
    itemTemplates.fuelInjector,
  ];

  const count = Math.max(2, Math.floor((3 + Math.random() * 6) * lootMultiplier));
  const items: Item[] = [];

  for (let i = 0; i < count; i++) {
    if (Math.random() < 0.12 / lootMultiplier) continue;

    const roll = Math.random();
    let pool = householdPool;

    if (roll < 0.45) pool = householdPool;
    else if (roll < 0.62) pool = toolPool;
    else if (roll < 0.72) pool = medicalPool;
    else if (roll < 0.78) pool = vehiclePool;
    else if (roll < 0.82) pool = structurePool;
    else if (roll < 0.88) pool = foodAndWater();

    const template = pool[Math.floor(Math.random() * pool.length)];
    items.push(makeItem(template));
  }

  // Ammo drops (common)
  if (Math.random() < 0.35 * lootMultiplier) {
    items.push(makeItem(ammoPool[Math.floor(Math.random() * ammoPool.length)]));
  }
  // Tool drops (uncommon)
  if (Math.random() < 0.15 * lootMultiplier) {
    items.push(makeItem(toolPool[Math.floor(Math.random() * toolPool.length)]));
  }
  // Tech drops (rare)
  if (Math.random() < 0.08 * lootMultiplier) {
    items.push(makeItem(techPool[Math.floor(Math.random() * techPool.length)]));
  }
  // Military drops (very rare)
  if (Math.random() < 0.03 * lootMultiplier) {
    items.push(makeItem(militaryPool[Math.floor(Math.random() * militaryPool.length)]));
  }
  // Firearms (extremely rare)
  if (Math.random() < 0.01 * lootMultiplier) {
    items.push(makeItem(firearmPool[Math.floor(Math.random() * firearmPool.length)]));
  }
  // Luxury drops (legendary)
  if (Math.random() < 0.005 * lootMultiplier) {
    items.push(makeItem(luxuryPool[Math.floor(Math.random() * luxuryPool.length)]));
  }

  return items;

  function foodAndWater() {
    return [itemTemplates.cannedBeans, itemTemplates.waterBottle, itemTemplates.soup, itemTemplates.cerealBox, itemTemplates.noodlePack, itemTemplates.coffeePowder, itemTemplates.energyDrink, itemTemplates.juiceBox];
  }
}