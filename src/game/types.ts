export type TileKind = "grass" | "road" | "house" | "forest" | "fence" | "ruin" | "water" | "debris" | "rubble" | "bunker" | "park";

export type MoodKind = "hungry" | "thirsty" | "panicked" | "tired" | "injured" | "infected" | "cold" | "hot" | "sick" | "wet" | "bleeding" | "exhausted";

export type ItemType = "food" | "water" | "weapon" | "ammo" | "medical" | "material" | "tool" | "bag" | "station" | "storage" | "survival" | "tech" | "military" | "electronics" | "chemical" | "luxury" | "craft" | "structure" | "vehicle" | "animal";

export type Rarity = "Comum" | "Incomum" | "Raro" | "Épico" | "Lendário";

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  weight: number;
  qty: number;
  hunger?: number;
  thirst?: number;
  heal?: number;
  warmth?: number;
  weapon?: {
    damage: number;
    range: number;
    stamina: number;
    noise: number;
    mode?: "melee" | "firearm";
    ammo?: string;
    critChance?: number;
  };
  carryBonus?: number;
  storageSlots?: number;
  tags?: string[];
  rarity?: Rarity;
  durability?: number;
  maxDurability?: number;
  stack?: number;
  value?: number;
  sanity?: number;
  stamina?: number;
}

export interface Stats {
  health: number;
  hunger: number;
  thirst: number;
  stamina: number;
  sanity: number;
  infection: number;
  warmth: number;
  radiation: number;
  encumbrance: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface House {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  door: Vec2;
  looted: boolean;
  container: Item[];
  barricaded: boolean;
  type: "house" | "store" | "hospital" | "police" | "military" | "school" | "factory" | "bunker" | "ruin" | "church" | "gas";
}

export interface Mood {
  kind: MoodKind;
  icon: string;
  label: string;
  severity: 1 | 2 | 3;
  description: string;
}

export interface ZombieSnapshot {
  total: number;
  chasing: number;
  nearby: number;
}

export interface GameEvent {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: "world" | "horde" | "weather" | "discovery" | "faction" | "disaster";
  duration: number;
  elapsed: number;
  active: boolean;
  effect: string;
}

export interface WorldStructure {
  x: number;
  y: number;
  w: number;
  h: number;
  type: "bunker" | "hospital" | "police" | "military" | "school" | "church" | "factory" | "gas" | "ruin" | "store" | "abandoned" | "shelter" | "tower" | "prison" | "airport";
  explored: boolean;
  loot: Item[];
  difficulty: number;
  npcs: NPC[];
}

export interface NPC {
  id: string;
  name: string;
  faction: string;
  role: "merchant" | "survivor" | "scientist" | "military" | "doctor" | "mechanic" | "hunter" | "bandit" | "cultist" | "hermit" | "traitor" | "special";
  dialogue: string[];
  health: number;
  hostile: boolean;
  tradeItems: Item[];
  quests?: { id: string; description: string; completed: boolean; reward: Item }[];
  trust: number;
}

export interface GameState {
  x: number;
  y: number;
  insideHouse: string | null;
  kills: number;
  days: number;
  weather: "clear" | "rain" | "fog" | "storm" | "snow" | "toxic";
  temperature: number;
  playerEvents: string[];
}

export interface GameSnapshot {
  stats: Stats;
  moodles: Mood[];
  inventory: Item[];
  hotbar: (Item | null)[];
  equipped: Item | null;
  capacity: number;
  weight: number;
  container: { houseId: string; items: Item[] } | null;
  recipes: Recipe[];
  time: { day: number; hour: number; minute: number; daysSurvived: number };
  kills: number;
  zombies: ZombieSnapshot;
  message: string;
  running: boolean;
  paused: boolean;
  position: Vec2;
  insideHouse: string | null;
  nearHouseGate: string | null;
  onlinePlayers: OnlinePlayer[];
  weather: "clear" | "rain" | "fog" | "storm" | "snow" | "toxic";
  weatherIntensity: number;
  chatMessages: { id: string; name: string; text: string; ts: number }[];
  myPlayerId: string;
  myPlayerName: string;
  isCoop: boolean;
  p2Stats?: Stats;
  p2Inventory?: Item[];
  p2Hotbar?: (Item | null)[];
  p2Equipped?: Item | null;
  p2InsideHouse?: string | null;
  p2Kills?: number;
  events: GameEvent[];
  temperature: number;
  structures: { type: string; x: number; y: number }[];
  npcsNearby: NPC[];
  notifications: { text: string; type: string; ts: number }[];
  vehicles: { id: string; name: string; emoji: string; x: number; y: number; angle: number; fuel: number; durability: number; color: string; type: string; rarity: string; description: string; cargoCapacity: number; seats: number }[];
  drivingVehicle: { name: string; emoji: string; fuel: number; maxFuel: number; durability: number; maxDur: number; speed: number; rarity: string } | null;
  pvpEnabled: boolean;
  pvpKills: number;
  pvpDeaths: number;
  pvpKillLog: { ts: number; killer: string; victim: string; weapon: string }[];
  groundItems: { id: string; name: string; qty: number; weight: number; x: number; y: number; type: string; rarity?: string }[];
  nearestGroundItem: { id: string; name: string; qty: number; distance: number } | null;
}

export interface OnlinePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  angle: number;
  health: number;
  kills: number;
  lastSeen: number;
  isSpeaking?: boolean;
}

export interface ChatMessage {
  id: string;
  name: string;
  text: string;
  ts: number;
}

export interface NetMessage {
  type: "join" | "leave" | "state" | "ping" | "heartbeat" | "chat" | "pvp-damage" | "pvp-kill" | "voice-status";
  id: string;
  name: string;
  x: number;
  y: number;
  angle: number;
  health: number;
  kills: number;
  ts: number;
  chatText?: string;
  // PvP fields
  targetId?: string;
  damage?: number;
  weapon?: string;
  // Voice Chat fields
  voiceSpeaking?: boolean;
  voiceVolume?: number;
  /** Multiplayer room (used by the server to scope privileged ops). */
  room?: string;
}

export interface DeathReport {
  cause: string;
  days: number;
  kills: number;
  hours: number;
}

export interface SandboxOptions {
  difficulty: "builder" | "survivor" | "apocalypse";
  zombieCount: number;
  loot: number;
  timeScale: number;
}

export interface Recipe {
  id: string;
  name: string;
  needs: Record<string, number>;
  result: Omit<Item, "id">;
  station?: string;
  skill?: string;
  category?: string;
}

export interface Progression {
  level: number;
  xp: number;
  skills: Record<string, number>;
  perks: string[];
}

export interface FactionData {
  name: string;
  reputation: number;
  hostile: boolean;
  territory: { x: number; y: number; radius: number };
  leaderId: string;
}
