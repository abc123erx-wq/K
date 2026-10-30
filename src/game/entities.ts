import type { Stats, Vec2 } from "./types";
import { World } from "./world";

export class Player {
  x = 44;
  y = 57;
  angle = 0;
  radius = 0.32;
  stats: Stats = { health: 100, hunger: 0, thirst: 0, stamina: 100, sanity: 100, infection: 0, warmth: 70, radiation: 0, encumbrance: 0 };
  bitten = false;
  hurtCooldown = 0;
  stepTimer = 0;
  // Walk animation cycle
  walkCycle = 0;
  moving = false;
  attackAnim = 0; // 0..1 swing animation
  noclip = false; // admin: walk through walls

  move(dx: number, dy: number, dt: number, world: World, running: boolean, speedMult = 1) {
    const speed = (running && this.stats.stamina > 5 ? 5.2 : 3.25) * speedMult;
    const length = Math.hypot(dx, dy) || 1;
    const nx = this.x + (dx / length) * speed * dt;
    const ny = this.y + (dy / length) * speed * dt;
    if (!this.collides(nx, this.y, world)) this.x = nx;
    if (!this.collides(this.x, ny, world)) this.y = ny;
    if (dx || dy) {
      this.angle = Math.atan2(dy, dx);
      if (running) this.stats.stamina = Math.max(0, this.stats.stamina - 12 * dt);
      else this.stats.stamina = Math.min(100, this.stats.stamina + 5 * dt);
      this.stepTimer -= dt;
      this.moving = true;
      this.walkCycle += dt * (running ? 14 : 8);
    } else {
      this.stats.stamina = Math.min(100, this.stats.stamina + 8 * dt);
      this.moving = false;
      this.walkCycle *= 0.85; // decay to 0
    }
    // Decay attack animation
    this.attackAnim = Math.max(0, this.attackAnim - dt * 5);
  }

  triggerAttackAnim() {
    this.attackAnim = 1;
  }

  /** Circle-vs-tile collision so the player cannot clip into walls/fences. */
  private collides(x: number, y: number, world: World): boolean {
    if (this.noclip) return false;
    const r = this.radius;
    const d = r * 0.72;
    const points: Array<[number, number]> = [
      [x, y],
      [x + r, y], [x - r, y],
      [x, y + r], [x, y - r],
      [x + d, y + d], [x - d, y + d],
      [x + d, y - d], [x - d, y - d],
    ];
    for (const [px, py] of points) {
      if (world.isBlocked(px, py)) return true;
    }
    return false;
  }
}

interface ZombieVariant {
  name: string;
  hp: number;
  chaseSpeed: number;
  wanderSpeed: number;
  sight: number;
  nightSight: number;
  damageMin: number;
  damageMax: number;
  attackCooldown: number;
  biteChance: number;
  infectionChance: number;
  scale: number;
  outfit?: number;
}

/**
 * 40 distinct outfits: shirt, pants, skin tone, shoes, plus optional
 * accessories (hat, tie, vest, apron, backpack, badge...).
 */
export interface ZombieOutfit {
  name: string;
  shirt: string;
  shirtAlt: string;
  pants: string;
  skin: string;
  shoes: string;
  hair: string;
  accessory: "none" | "cap" | "hat" | "helmet" | "hardhat" | "hood" | "tie" | "vest" | "apron" | "backpack" | "badge" | "scarf" | "mask" | "beanie" | "collar" | "bandana";
  accessoryColor: string;
  bloody: boolean;
}

export const ZOMBIE_OUTFITS: ZombieOutfit[] = [
  { name: "Casual Verde", shirt: "#3a4a34", shirtAlt: "#2c3a28", pants: "#28322a", skin: "#7a8a6a", shoes: "#2a2a20", hair: "#2b2118", accessory: "none", accessoryColor: "#000", bloody: false },
  { name: "Camisa Vermelha", shirt: "#6a2a26", shirtAlt: "#4a1c19", pants: "#322828", skin: "#6d7d5f", shoes: "#241c18", hair: "#1f1a14", accessory: "none", accessoryColor: "#000", bloody: true },
  { name: "Jeans Azul", shirt: "#2f4a66", shirtAlt: "#243a52", pants: "#233046", skin: "#8a9a72", shoes: "#332a20", hair: "#3a2a1a", accessory: "none", accessoryColor: "#000", bloody: false },
  { name: "Operário", shirt: "#c07a1e", shirtAlt: "#9a5f14", pants: "#3a3528", skin: "#92997a", shoes: "#2c2418", hair: "#241c14", accessory: "hardhat", accessoryColor: "#e2b322", bloody: true },
  { name: "Policial", shirt: "#1c2740", shirtAlt: "#141d31", pants: "#171f30", skin: "#7f8f70", shoes: "#14120e", hair: "#221a12", accessory: "badge", accessoryColor: "#c9b037", bloody: true },
  { name: "Enfermeira", shirt: "#cfd8d3", shirtAlt: "#aab6b0", pants: "#b8c3bd", skin: "#8d9b78", shoes: "#e0e0e0", hair: "#4a3320", accessory: "mask", accessoryColor: "#9fd8c8", bloody: true },
  { name: "Médico", shirt: "#e2e6e4", shirtAlt: "#c2c9c6", pants: "#2f3a44", skin: "#7d8d6d", shoes: "#1c1a16", hair: "#3a3028", accessory: "tie", accessoryColor: "#2b4a6a", bloody: true },
  { name: "Bombeiro", shirt: "#8a3018", shirtAlt: "#682312", pants: "#3a2a1e", skin: "#8a9673", shoes: "#191512", hair: "#2a2018", accessory: "helmet", accessoryColor: "#c0392b", bloody: false },
  { name: "Militar", shirt: "#4a5232", shirtAlt: "#3a4126", pants: "#3f4630", skin: "#7c8b6c", shoes: "#221d14", hair: "#221a10", accessory: "helmet", accessoryColor: "#4a5232", bloody: true },
  { name: "Executivo", shirt: "#20232c", shirtAlt: "#171922", pants: "#1c1f26", skin: "#8b9878", shoes: "#100e0c", hair: "#241b12", accessory: "tie", accessoryColor: "#8a2222", bloody: false },
  { name: "Cozinheiro", shirt: "#dedbd2", shirtAlt: "#bdb9ae", pants: "#3b3b3b", skin: "#7d8b6b", shoes: "#1a1a1a", hair: "#2b2118", accessory: "apron", accessoryColor: "#f0ede4", bloody: true },
  { name: "Mecânico", shirt: "#38424c", shirtAlt: "#2a333c", pants: "#2f3740", skin: "#83916f", shoes: "#1a1712", hair: "#2c2118", accessory: "cap", accessoryColor: "#2a3540", bloody: true },
  { name: "Estudante", shirt: "#3d5aa6", shirtAlt: "#2f4784", pants: "#2b3448", skin: "#8f9c7b", shoes: "#e8e8e8", hair: "#1f1810", accessory: "backpack", accessoryColor: "#2a3a5a", bloody: false },
  { name: "Corredor", shirt: "#c8c221", shirtAlt: "#a49f18", pants: "#2b2b2b", skin: "#8c9a75", shoes: "#dcdcdc", hair: "#2a2118", accessory: "none", accessoryColor: "#000", bloody: false },
  { name: "Fazendeiro", shirt: "#8a6a3a", shirtAlt: "#6a512c", pants: "#3c4630", skin: "#93a07c", shoes: "#3a2c1c", hair: "#4a3a22", accessory: "cap", accessoryColor: "#5a4428", bloody: false },
  { name: "Faxineiro", shirt: "#2e6a4a", shirtAlt: "#245239", pants: "#2c3630", skin: "#7d8d6d", shoes: "#191512", hair: "#241c14", accessory: "vest", accessoryColor: "#d0d43a", bloody: false },
  { name: "Motoqueiro", shirt: "#1a1a1a", shirtAlt: "#111111", pants: "#20242a", skin: "#7a8a6a", shoes: "#141210", hair: "#181410", accessory: "helmet", accessoryColor: "#1a1a1a", bloody: true },
  { name: "Padre", shirt: "#181818", shirtAlt: "#101010", pants: "#141414", skin: "#8b9878", shoes: "#100e0c", hair: "#3a3028", accessory: "collar", accessoryColor: "#f0f0f0", bloody: false },
  { name: "Segurança", shirt: "#20262e", shirtAlt: "#171c22", pants: "#1b1f26", skin: "#7f8f70", shoes: "#14120e", hair: "#1d1710", accessory: "vest", accessoryColor: "#3a4a5a", bloody: true },
  { name: "Pescador", shirt: "#3a6a7a", shirtAlt: "#2c5260", pants: "#2f3a44", skin: "#94a07d", shoes: "#2a2418", hair: "#3a2c1a", accessory: "beanie", accessoryColor: "#2a4a58", bloody: false },
  { name: "Caçador", shirt: "#4a4028", shirtAlt: "#38301c", pants: "#3a3a28", skin: "#8a9673", shoes: "#2c2418", hair: "#2a2014", accessory: "cap", accessoryColor: "#4a4a2a", bloody: true },
  { name: "Turista", shirt: "#d97a3a", shirtAlt: "#b0602c", pants: "#5a6a7a", skin: "#95a17e", shoes: "#e0e0e0", hair: "#4a3520", accessory: "backpack", accessoryColor: "#8a5a2a", bloody: false },
  { name: "Roqueiro", shirt: "#221822", shirtAlt: "#181218", pants: "#1c1c22", skin: "#7c8b6c", shoes: "#141014", hair: "#141014", accessory: "bandana", accessoryColor: "#8a2a2a", bloody: true },
  { name: "Skatista", shirt: "#5a3a8a", shirtAlt: "#452c6a", pants: "#2c3040", skin: "#8d9b78", shoes: "#e8e0d0", hair: "#2a1f14", accessory: "cap", accessoryColor: "#5a3a8a", bloody: false },
  { name: "Vovô", shirt: "#7a7268", shirtAlt: "#5e574f", pants: "#4a463c", skin: "#9aa284", shoes: "#2c2418", hair: "#c8c8c0", accessory: "scarf", accessoryColor: "#7a3a3a", bloody: false },
  { name: "Vovó", shirt: "#8a5a7a", shirtAlt: "#6c4460", pants: "#5a4a58", skin: "#9aa284", shoes: "#2c2418", hair: "#d0d0c8", accessory: "scarf", accessoryColor: "#a86a8a", bloody: false },
  { name: "Prisioneiro", shirt: "#d97a2a", shirtAlt: "#b26020", pants: "#c96f22", skin: "#7d8b6b", shoes: "#2a2418", hair: "#1d1610", accessory: "none", accessoryColor: "#000", bloody: true },
  { name: "Cientista", shirt: "#e8ecea", shirtAlt: "#c8ccca", pants: "#3a4048", skin: "#8b9878", shoes: "#1c1a16", hair: "#3a3028", accessory: "mask", accessoryColor: "#cfd8d3", bloody: true },
  { name: "Entregador", shirt: "#8a4a1a", shirtAlt: "#6a3812", pants: "#3a3428", skin: "#83916f", shoes: "#2c2418", hair: "#241c14", accessory: "cap", accessoryColor: "#8a4a1a", bloody: false },
  { name: "Garçom", shirt: "#f0f0ea", shirtAlt: "#d0d0ca", pants: "#1c1c1c", skin: "#8d9b78", shoes: "#141210", hair: "#241b12", accessory: "tie", accessoryColor: "#1a1a1a", bloody: true },
  { name: "Jardineiro", shirt: "#4a6a3a", shirtAlt: "#38522c", pants: "#3f4a30", skin: "#93a07c", shoes: "#3a2c1c", hair: "#2c2118", accessory: "hat", accessoryColor: "#8a7a4a", bloody: false },
  { name: "Piloto", shirt: "#2a3a5a", shirtAlt: "#1f2c44", pants: "#232a38", skin: "#7f8f70", shoes: "#14120e", hair: "#221a12", accessory: "badge", accessoryColor: "#c9b037", bloody: false },
  { name: "Marinheiro", shirt: "#e0e4e8", shirtAlt: "#c0c4c8", pants: "#22304a", skin: "#8a9673", shoes: "#1a1712", hair: "#2a2018", accessory: "beanie", accessoryColor: "#22304a", bloody: false },
  { name: "Açougueiro", shirt: "#e8e4dc", shirtAlt: "#c4c0b8", pants: "#3a3a3a", skin: "#7d8b6b", shoes: "#1a1a1a", hair: "#2b2118", accessory: "apron", accessoryColor: "#a83a2a", bloody: true },
  { name: "Barista", shirt: "#5a3a2a", shirtAlt: "#442c20", pants: "#2f2a24", skin: "#8f9c7b", shoes: "#1f1a14", hair: "#241c14", accessory: "apron", accessoryColor: "#3a2a1e", bloody: false },
  { name: "Atleta", shirt: "#2a8a6a", shirtAlt: "#206a52", pants: "#1e2a28", skin: "#8c9a75", shoes: "#f0f0f0", hair: "#1f1810", accessory: "none", accessoryColor: "#000", bloody: false },
  { name: "Punk", shirt: "#3a1a3a", shirtAlt: "#2a122a", pants: "#20202a", skin: "#7a8a6a", shoes: "#141014", hair: "#8a2a5a", accessory: "hood", accessoryColor: "#2a1a2a", bloody: true },
  { name: "Hipster", shirt: "#6a5a3a", shirtAlt: "#50442c", pants: "#2c3444", skin: "#8d9b78", shoes: "#3a2c1c", hair: "#3a2a18", accessory: "beanie", accessoryColor: "#5a4a3a", bloody: false },
  { name: "Ferroviário", shirt: "#2a3a4a", shirtAlt: "#1f2c38", pants: "#2a3038", skin: "#83916f", shoes: "#1a1712", hair: "#221a12", accessory: "hardhat", accessoryColor: "#d0a020", bloody: true },
  { name: "Alpinista", shirt: "#b04a2a", shirtAlt: "#8a3820", pants: "#3a4048", skin: "#94a07d", shoes: "#2a2418", hair: "#2a2014", accessory: "backpack", accessoryColor: "#3a4a5a", bloody: false },
];

export const ZOMBIE_VARIANTS: ZombieVariant[] = [
  { name: "Knox Walker", hp: 60, chaseSpeed: 1.5, wanderSpeed: 0.6, sight: 8.5, nightSight: 5.5, damageMin: 7, damageMax: 15, attackCooldown: 1.35, biteChance: 0.18, infectionChance: 0.75, scale: 1 },
  { name: "Fast Shambler", hp: 50, chaseSpeed: 2.05, wanderSpeed: 0.8, sight: 9.5, nightSight: 6.2, damageMin: 6, damageMax: 12, attackCooldown: 1.15, biteChance: 0.14, infectionChance: 0.7, scale: 0.94 },
  { name: "Heavy Biter", hp: 95, chaseSpeed: 1.05, wanderSpeed: 0.45, sight: 7.5, nightSight: 5, damageMin: 14, damageMax: 26, attackCooldown: 1.65, biteChance: 0.28, infectionChance: 0.82, scale: 1.15 },
  { name: "Rotten Crawler", hp: 40, chaseSpeed: 1.1, wanderSpeed: 0.38, sight: 6.8, nightSight: 4.4, damageMin: 5, damageMax: 10, attackCooldown: 1.05, biteChance: 0.12, infectionChance: 0.65, scale: 0.82 },
  { name: "Panicked Sprinter", hp: 42, chaseSpeed: 2.35, wanderSpeed: 0.9, sight: 10.5, nightSight: 7, damageMin: 5, damageMax: 11, attackCooldown: 1, biteChance: 0.13, infectionChance: 0.68, scale: 0.9 },
  { name: "Construction Corpse", hp: 110, chaseSpeed: 1, wanderSpeed: 0.42, sight: 7.2, nightSight: 4.8, damageMin: 15, damageMax: 28, attackCooldown: 1.75, biteChance: 0.22, infectionChance: 0.78, scale: 1.2 },
  { name: "Nurse Shambler", hp: 55, chaseSpeed: 1.7, wanderSpeed: 0.7, sight: 8.8, nightSight: 5.8, damageMin: 6, damageMax: 13, attackCooldown: 1.2, biteChance: 0.2, infectionChance: 0.76, scale: 0.96 },
  { name: "Police Dead", hp: 78, chaseSpeed: 1.55, wanderSpeed: 0.62, sight: 9.2, nightSight: 6.1, damageMin: 9, damageMax: 18, attackCooldown: 1.3, biteChance: 0.19, infectionChance: 0.74, scale: 1.04 },
  { name: "Firefighter Corpse", hp: 120, chaseSpeed: 1.08, wanderSpeed: 0.48, sight: 7.8, nightSight: 5.2, damageMin: 13, damageMax: 24, attackCooldown: 1.6, biteChance: 0.2, infectionChance: 0.78, scale: 1.18 },
  { name: "Starved Runner", hp: 38, chaseSpeed: 2.25, wanderSpeed: 0.84, sight: 9.8, nightSight: 6.5, damageMin: 4, damageMax: 10, attackCooldown: 0.95, biteChance: 0.1, infectionChance: 0.62, scale: 0.86 },
  { name: "Bloated Walker", hp: 105, chaseSpeed: 0.95, wanderSpeed: 0.38, sight: 6.8, nightSight: 4.6, damageMin: 12, damageMax: 23, attackCooldown: 1.7, biteChance: 0.25, infectionChance: 0.84, scale: 1.22 },
  { name: "Office Corpse", hp: 58, chaseSpeed: 1.45, wanderSpeed: 0.58, sight: 8, nightSight: 5.2, damageMin: 7, damageMax: 14, attackCooldown: 1.35, biteChance: 0.16, infectionChance: 0.72, scale: 0.98 },
  { name: "Teen Zombie", hp: 45, chaseSpeed: 1.95, wanderSpeed: 0.76, sight: 9, nightSight: 5.9, damageMin: 5, damageMax: 12, attackCooldown: 1.1, biteChance: 0.15, infectionChance: 0.7, scale: 0.88 },
  { name: "Veteran Corpse", hp: 82, chaseSpeed: 1.45, wanderSpeed: 0.58, sight: 9.6, nightSight: 6.4, damageMin: 10, damageMax: 19, attackCooldown: 1.28, biteChance: 0.2, infectionChance: 0.76, scale: 1.05 },
  { name: "Mall Walker", hp: 62, chaseSpeed: 1.42, wanderSpeed: 0.56, sight: 8.3, nightSight: 5.4, damageMin: 7, damageMax: 15, attackCooldown: 1.36, biteChance: 0.18, infectionChance: 0.73, scale: 1 },
  { name: "Farmhand Dead", hp: 88, chaseSpeed: 1.28, wanderSpeed: 0.54, sight: 8.1, nightSight: 5.5, damageMin: 11, damageMax: 21, attackCooldown: 1.45, biteChance: 0.21, infectionChance: 0.77, scale: 1.1 },
  { name: "Prisoner Rotter", hp: 76, chaseSpeed: 1.62, wanderSpeed: 0.64, sight: 8.7, nightSight: 5.8, damageMin: 9, damageMax: 17, attackCooldown: 1.25, biteChance: 0.2, infectionChance: 0.75, scale: 1.02 },
  { name: "Graveyard Slowpoke", hp: 130, chaseSpeed: 0.82, wanderSpeed: 0.32, sight: 6.2, nightSight: 4.2, damageMin: 16, damageMax: 30, attackCooldown: 1.95, biteChance: 0.24, infectionChance: 0.84, scale: 1.25 },
  { name: "Screamer Husk", hp: 48, chaseSpeed: 1.8, wanderSpeed: 0.76, sight: 11, nightSight: 7.4, damageMin: 5, damageMax: 12, attackCooldown: 1.2, biteChance: 0.14, infectionChance: 0.7, scale: 0.95 },
  { name: "Motel Guest", hp: 57, chaseSpeed: 1.5, wanderSpeed: 0.6, sight: 8.1, nightSight: 5.2, damageMin: 7, damageMax: 15, attackCooldown: 1.35, biteChance: 0.17, infectionChance: 0.74, scale: 1 },
  { name: "Gas Station Dead", hp: 67, chaseSpeed: 1.58, wanderSpeed: 0.62, sight: 8.9, nightSight: 5.9, damageMin: 8, damageMax: 16, attackCooldown: 1.28, biteChance: 0.18, infectionChance: 0.73, scale: 1.02 },
  { name: "Jogger Corpse", hp: 44, chaseSpeed: 2.18, wanderSpeed: 0.86, sight: 10, nightSight: 6.8, damageMin: 5, damageMax: 11, attackCooldown: 1.02, biteChance: 0.13, infectionChance: 0.68, scale: 0.9 },
  { name: "Hunter Dead", hp: 74, chaseSpeed: 1.52, wanderSpeed: 0.6, sight: 10.2, nightSight: 6.9, damageMin: 9, damageMax: 18, attackCooldown: 1.3, biteChance: 0.19, infectionChance: 0.75, scale: 1.04 },
  { name: "Mechanic Rotter", hp: 90, chaseSpeed: 1.22, wanderSpeed: 0.5, sight: 7.9, nightSight: 5.4, damageMin: 12, damageMax: 22, attackCooldown: 1.48, biteChance: 0.22, infectionChance: 0.78, scale: 1.12 },
  { name: "School Teacher", hp: 56, chaseSpeed: 1.48, wanderSpeed: 0.58, sight: 8.4, nightSight: 5.6, damageMin: 7, damageMax: 14, attackCooldown: 1.34, biteChance: 0.17, infectionChance: 0.73, scale: 0.99 },
  { name: "Road Crew Brute", hp: 118, chaseSpeed: 0.98, wanderSpeed: 0.44, sight: 7.5, nightSight: 5, damageMin: 15, damageMax: 29, attackCooldown: 1.72, biteChance: 0.23, infectionChance: 0.8, scale: 1.2 },
  { name: "Sickly Twitcher", hp: 46, chaseSpeed: 1.88, wanderSpeed: 0.74, sight: 8.7, nightSight: 5.8, damageMin: 6, damageMax: 13, attackCooldown: 1.05, biteChance: 0.22, infectionChance: 0.86, scale: 0.93 },
  { name: "Church Corpse", hp: 70, chaseSpeed: 1.34, wanderSpeed: 0.54, sight: 8.2, nightSight: 5.4, damageMin: 8, damageMax: 17, attackCooldown: 1.38, biteChance: 0.18, infectionChance: 0.76, scale: 1.03 },
  { name: "Warehouse Dead", hp: 100, chaseSpeed: 1.12, wanderSpeed: 0.46, sight: 7.6, nightSight: 5.1, damageMin: 13, damageMax: 24, attackCooldown: 1.58, biteChance: 0.22, infectionChance: 0.79, scale: 1.16 },
  { name: "Thin Drifter", hp: 43, chaseSpeed: 1.9, wanderSpeed: 0.78, sight: 9.1, nightSight: 6, damageMin: 5, damageMax: 12, attackCooldown: 1.08, biteChance: 0.14, infectionChance: 0.7, scale: 0.9 },
  { name: "Old Veteran", hp: 85, chaseSpeed: 1.24, wanderSpeed: 0.48, sight: 9, nightSight: 6.2, damageMin: 10, damageMax: 20, attackCooldown: 1.42, biteChance: 0.2, infectionChance: 0.77, scale: 1.08 },
  { name: "Kitchen Dead", hp: 64, chaseSpeed: 1.52, wanderSpeed: 0.62, sight: 8.4, nightSight: 5.5, damageMin: 8, damageMax: 16, attackCooldown: 1.28, biteChance: 0.19, infectionChance: 0.74, scale: 1 },
  { name: "Creek Mudder", hp: 92, chaseSpeed: 1.18, wanderSpeed: 0.42, sight: 7.1, nightSight: 4.8, damageMin: 11, damageMax: 22, attackCooldown: 1.52, biteChance: 0.24, infectionChance: 0.82, scale: 1.1 },
  { name: "Fresh Turned", hp: 52, chaseSpeed: 2.05, wanderSpeed: 0.82, sight: 9.8, nightSight: 6.6, damageMin: 7, damageMax: 15, attackCooldown: 1.08, biteChance: 0.17, infectionChance: 0.74, scale: 0.96 },
];

export class Zombie {
  x: number;
  y: number;
  hp = 60;
  state: "wander" | "alert" | "chase" = "wander";
  target: Vec2 | null = null;
  wanderTimer = 0;
  attackCooldown = 0;
  // Walk animation
  walkCycle = 0;
  moving = false;
  faceAngle = Math.random() * Math.PI * 2;
  // Visual variation
  variant: number;
  variantName: string;
  scale = 1;
  radius = 0.3;
  outfit: number;
  // Admin flags
  tame = false;      // never aggros/attacks the player (dummies, pets, friendly mode)
  pet = false;       // follows the player around
  renamed = false;   // shows a custom name overhead
  customName = "";
  danceUntil = 0;    // timestamp: dance animation active until then
  private profile: ZombieVariant;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.variant = Math.floor(Math.random() * ZOMBIE_VARIANTS.length);
    this.profile = ZOMBIE_VARIANTS[this.variant];
    this.variantName = this.profile.name;
    this.hp = this.profile.hp;
    this.scale = this.profile.scale;
    this.outfit = this.profile.outfit ?? Math.floor(Math.random() * ZOMBIE_OUTFITS.length);
    this.radius = 0.26 * this.scale;
  }

  /** Circle-vs-tile collision so zombies stop at walls instead of sliding through. */
  private collides(x: number, y: number, world: World): boolean {
    const r = this.radius;
    const d = r * 0.72;
    const points: Array<[number, number]> = [
      [x, y],
      [x + r, y], [x - r, y],
      [x, y + r], [x, y - r],
      [x + d, y + d], [x - d, y + d],
      [x + d, y - d], [x - d, y - d],
    ];
    for (const [px, py] of points) {
      if (world.isBlocked(px, py)) return true;
    }
    return false;
  }

  update(dt: number, player: Player, world: World, night: boolean, player2?: Player, hostile = true, dmgMult = 1) {
    this.attackCooldown -= dt;

    let targetPlayer = player;
    let distance = Math.hypot(player.x - this.x, player.y - this.y);

    if (player2 && player2.stats.health > 0) {
      const dist2 = Math.hypot(player2.x - this.x, player2.y - this.y);
      if (player.stats.health <= 0 || dist2 < distance) {
        targetPlayer = player2;
        distance = dist2;
      }
    }

    const aggressive = !this.tame && hostile;
    const sight = night ? this.profile.nightSight : this.profile.sight;
    if (aggressive && distance < sight && targetPlayer.stats.health > 0) this.state = "chase";
    if (aggressive && this.state === "chase" && targetPlayer.stats.health > 0) this.target = { x: targetPlayer.x, y: targetPlayer.y };
    // Tame pets keep following (engine refreshes target); dummies just wander.
    if (this.tame && this.pet && this.state === "chase") this.state = "alert";
    if (this.state === "wander" || (targetPlayer.stats.health <= 0 && this.state === "chase")) {
      this.wanderTimer -= dt;
      if (!this.target || this.wanderTimer <= 0) {
        this.target = { x: this.x + (Math.random() - 0.5) * 8, y: this.y + (Math.random() - 0.5) * 8 };
        this.wanderTimer = 2 + Math.random() * 4;
      }
    }
    if (!this.target) return;
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const length = Math.hypot(dx, dy);
    if (length > 0.12) {
      const speed = this.state === "chase" ? this.profile.chaseSpeed : this.profile.wanderSpeed;
      const nx = this.x + (dx / length) * speed * dt;
      const ny = this.y + (dy / length) * speed * dt;
      const prevX = this.x;
      const prevY = this.y;
      if (!this.collides(nx, this.y, world)) this.x = nx;
      if (!this.collides(this.x, ny, world)) this.y = ny;
      this.faceAngle = Math.atan2(dy, dx);
      this.moving = this.x !== prevX || this.y !== prevY;
      if (this.moving) {
        this.walkCycle += dt * (this.state === "chase" ? 7 + this.profile.chaseSpeed * 2.2 : 4 + this.profile.wanderSpeed * 2);
      }
    } else {
      this.moving = false;
    }
    if (!this.moving) {
      this.walkCycle *= 0.85;
    }
    if (aggressive && distance < 0.72 && this.attackCooldown <= 0 && targetPlayer.stats.health > 0) {
      targetPlayer.stats.health -= (this.profile.damageMin + Math.random() * (this.profile.damageMax - this.profile.damageMin)) * dmgMult;
      targetPlayer.stats.sanity -= 3;
      targetPlayer.hurtCooldown = 0.45;
      this.attackCooldown = this.profile.attackCooldown;
      if (!targetPlayer.bitten && Math.random() < this.profile.biteChance) {
        targetPlayer.bitten = true;
        if (Math.random() < this.profile.infectionChance) targetPlayer.stats.infection = 1;
      }
    }
  }

  hear(x: number, y: number, radius: number) {
    const distance = Math.hypot(x - this.x, y - this.y);
    if (distance < radius) {
      this.state = distance < radius * 0.55 ? "chase" : "alert";
      this.target = { x, y };
      this.wanderTimer = 0;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  BOSS: GUI — 3.000.000 HP — Teleport — Spawn Único
// ═══════════════════════════════════════════════════════════════

export class BossGui {
  x = 5070; // Fixed spawn position (slightly offset from center for drama)
  y = 5070;
  hp = 3000000;
  maxHp = 3000000;
  state: "idle" | "alert" | "teleporting" | "chase" = "idle";
  target: Vec2 | null = null;
  attackCooldown = 0;
  teleportTimer = 0;
  scale = 2.5;
  faceAngle = 0;
  phase = 1; // Phase 1, 2, 3 based on HP%
  defeated = false;
  // Visual effects
  glowColor = "#8a0044";
  teleportFlash = 0;
  hitCooldown = 0;
  walkCycle = 0;
  variant = 0;
  variantName = "The Gui";

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.hp = 3000000;
    this.maxHp = 3000000;
    this.teleportTimer = 3 + Math.random() * 2;
  }

  update(dt: number, player: Player, world: World, _night: boolean, player2?: Player) {
    if (this.defeated) return;
    this.attackCooldown -= dt;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    this.teleportFlash = Math.max(0, this.teleportFlash - dt);

    // Determine phase by HP%
    const hpPct = this.hp / this.maxHp;
    if (hpPct < 0.25) this.phase = 3;
    else if (hpPct < 0.55) this.phase = 2;
    else this.phase = 1;

    // Pick closest alive player
    let targetPlayer = player;
    let distance = Math.hypot(player.x - this.x, player.y - this.y);
    if (player2 && player2.stats.health > 0) {
      const dist2 = Math.hypot(player2.x - this.x, player2.y - this.y);
      if (player.stats.health <= 0 || dist2 < distance) {
        targetPlayer = player2;
        distance = dist2;
      }
    }
    if (targetPlayer.stats.health <= 0) return;

    // Detection range — sees the player from very far
    const detectRange = 60;
    if (distance < detectRange && targetPlayer.stats.health > 0) {
      if (this.state === "idle") {
        this.state = "alert";
        this.target = { x: targetPlayer.x, y: targetPlayer.y };
      }
    }

    // Teleport logic — teleports every 3-5 seconds (faster in lower phases)
    this.teleportTimer -= dt;
    const teleportInterval = this.phase === 3 ? 2.5 : this.phase === 2 ? 3.5 : 5;
    if (this.state !== "idle" && this.teleportTimer <= 0 && distance > 8) {
      this.teleportTimer = teleportInterval;
      this.teleportNearTarget(targetPlayer, distance);
      return;
    }

    // Chase / walk toward target
    if (this.state !== "idle" && targetPlayer.stats.health > 0) {
      this.target = { x: targetPlayer.x, y: targetPlayer.y };
    }

    if (this.state === "idle") {
      this.walkCycle += dt * 0.5;
      return;
    }

    if (!this.target) return;

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const length = Math.hypot(dx, dy);
    const chaseSpeed = this.phase === 3 ? 3.5 : this.phase === 2 ? 2.8 : 2.0;

    if (length > 1) {
      const nx = this.x + (dx / length) * chaseSpeed * dt;
      const ny = this.y + (dy / length) * chaseSpeed * dt;
      if (!world.isBlocked(nx, this.y)) this.x = nx;
      if (!world.isBlocked(this.x, ny)) this.y = ny;
      this.faceAngle = Math.atan2(dy, dx);
      this.walkCycle += dt * chaseSpeed * 3;
    }

    // Melee attack — massive damage, huge range
    const attackRange = this.phase === 3 ? 3.5 : this.phase === 2 ? 3.0 : 2.5;
    const damageMultiplier = this.phase === 3 ? 2.0 : this.phase === 2 ? 1.5 : 1.0;

    if (distance < attackRange && this.attackCooldown <= 0 && targetPlayer.stats.health > 0) {
      const baseDamage = 80 + Math.random() * 120;
      const totalDamage = baseDamage * damageMultiplier;
      targetPlayer.stats.health -= totalDamage;
      targetPlayer.stats.sanity -= 15;
      targetPlayer.hurtCooldown = 0.8;
      this.attackCooldown = this.phase === 3 ? 1.0 : this.phase === 2 ? 1.3 : 1.8;
      targetPlayer.bitten = true;
      targetPlayer.stats.infection = Math.min(100, targetPlayer.stats.infection + 5);
    }
  }

  private teleportNearTarget(target: Player, _currentDistance: number) {
    // Teleport to a random position near the target player (within 3-8 tiles)
    const angle = Math.random() * Math.PI * 2;
    const dist = 3 + Math.random() * 5;
    const newX = target.x + Math.cos(angle) * dist;
    const newY = target.y + Math.sin(angle) * dist;
    this.x = newX;
    this.y = newY;
    this.faceAngle = angle;
    this.teleportFlash = 0.3;
    this.state = "chase";
    this.target = { x: target.x, y: target.y };
  }

  takeDamage(amount: number) {
    if (this.defeated) return;
    this.hp -= amount;
    this.hitCooldown = 0.15;
    if (this.hp <= 0) {
      this.hp = 0;
      this.defeated = true;
    }
  }
}
