// ============================================================
// DATABASE — Save / Load player progress
// LocalStorage primary + optional Firebase Realtime DB cloud sync
// ============================================================

import type { Stats } from "./types";

export interface PlayerSave {
  userId: string;
  username: string;
  // Persistent stats
  totalKills: number;
  bestDaysSurvived: number;
  totalDaysSurvived: number;
  totalMatches: number;
  totalDeaths: number;
  // PvP stats
  pvpKills: number;
  pvpDeaths: number;
  pvpWins: number;
  pvpLosses: number;
  // Career
  level: number;
  xp: number;
  coins: number;
  achievements: string[];
  unlockedItems: string[];
  // Last session
  lastStats: Stats;
  lastPosition: { x: number; y: number };
  lastInventory: { itemId: string; qty: number }[];
  // Persisted across death — the survivor keeps what they were carrying
  savedInventory: { name: string; qty: number }[];
  savedEquipped: string | null;
  // Settings
  preferredDifficulty: "builder" | "survivor" | "apocalypse";
  preferredBackend: string;
  // Timestamps
  createdAt: number;
  updatedAt: number;
  lastPlayedAt: number;
}

const SAVE_PREFIX = "knox-save-";
const LEADERBOARD_KEY = "knox-leaderboard";

function defaultSave(userId: string, username: string): PlayerSave {
  return {
    userId,
    username,
    totalKills: 0,
    bestDaysSurvived: 0,
    totalDaysSurvived: 0,
    totalMatches: 0,
    totalDeaths: 0,
    pvpKills: 0,
    pvpDeaths: 0,
    pvpWins: 0,
    pvpLosses: 0,
    level: 1,
    xp: 0,
    coins: 0,
    achievements: [],
    unlockedItems: [],
    lastStats: { health: 100, hunger: 0, thirst: 0, stamina: 100, sanity: 100, infection: 0, warmth: 70, radiation: 0, encumbrance: 0 },
    lastPosition: { x: 5000, y: 5000 },
    lastInventory: [],
    savedInventory: [],
    savedEquipped: null,
    preferredDifficulty: "survivor",
    preferredBackend: "broadcast",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastPlayedAt: Date.now(),
  };
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  totalKills: number;
  bestDaysSurvived: number;
  pvpKills: number;
  level: number;
  xp: number;
  lastPlayedAt: number;
}

// XP needed to reach level N+1 from N
function xpForNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.4, level - 1));
}

export const Database = {
  /** Get or create player save */
  load(userId: string, username: string): PlayerSave {
    try {
      const raw = localStorage.getItem(SAVE_PREFIX + userId);
      if (raw) {
        const save = JSON.parse(raw) as PlayerSave;
        // Ensure all fields present (forward compat)
        return { ...defaultSave(userId, username), ...save };
      }
    } catch { /* ignore */ }
    const save = defaultSave(userId, username);
    Database.save(save);
    return save;
  },

  /** Save player data */
  save(save: PlayerSave) {
    save.updatedAt = Date.now();
    save.lastPlayedAt = Date.now();
    try {
      localStorage.setItem(SAVE_PREFIX + save.userId, JSON.stringify(save));
      Database.updateLeaderboard(save);
    } catch { /* ignore */ }
  },

  /** Delete save */
  delete(userId: string) {
    localStorage.removeItem(SAVE_PREFIX + userId);
    try {
      const lb = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || "[]") as LeaderboardEntry[];
      localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(lb.filter((e) => e.userId !== userId)));
    } catch { /* ignore */ }
  },

  /** Add purchased coins to the account. */
  addCoins(save: PlayerSave, amount: number) {
    save.coins += Math.max(0, amount);
  },

  /** Unlock a cosmetic/vip key (idempotent). */
  unlockItem(save: PlayerSave, key: string): boolean {
    if (save.unlockedItems.includes(key)) return false;
    save.unlockedItems.push(key);
    return true;
  },

  /** Check whether a cosmetic/vip key is already owned. */
  ownsItem(save: PlayerSave, key: string): boolean {
    return save.unlockedItems.includes(key);
  },

  /** Award XP, handle level-ups */
  awardXp(save: PlayerSave, amount: number): { leveledUp: boolean; newLevel: number } {
    save.xp += amount;
    let leveledUp = false;
    while (save.xp >= xpForNextLevel(save.level)) {
      save.xp -= xpForNextLevel(save.level);
      save.level += 1;
      leveledUp = true;
    }
    return { leveledUp, newLevel: save.level };
  },

  /** XP needed for next level */
  xpForNext(level: number): number {
    return xpForNextLevel(level);
  },

  /** Unlock achievement */
  unlockAchievement(save: PlayerSave, id: string): boolean {
    if (save.achievements.includes(id)) return false;
    save.achievements.push(id);
    return true;
  },

  /** Update global leaderboard */
  updateLeaderboard(save: PlayerSave) {
    try {
      const lb = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || "[]") as LeaderboardEntry[];
      const idx = lb.findIndex((e) => e.userId === save.userId);
      const entry: LeaderboardEntry = {
        userId: save.userId,
        username: save.username,
        totalKills: save.totalKills,
        bestDaysSurvived: save.bestDaysSurvived,
        pvpKills: save.pvpKills,
        level: save.level,
        xp: save.xp,
        lastPlayedAt: save.lastPlayedAt,
      };
      if (idx >= 0) lb[idx] = entry;
      else lb.push(entry);
      // Sort by XP desc, keep top 100
      lb.sort((a, b) => b.level * 10000 + b.xp - (a.level * 10000 + a.xp));
      localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(lb.slice(0, 100)));
    } catch { /* ignore */ }
  },

  /** Get leaderboard */
  getLeaderboard(): LeaderboardEntry[] {
    try {
      return JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || "[]") as LeaderboardEntry[];
    } catch {
      return [];
    }
  },

  /** Get all saves (debug/admin) */
  getAllSaves(): PlayerSave[] {
    const saves: PlayerSave[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(SAVE_PREFIX)) {
        try {
          saves.push(JSON.parse(localStorage.getItem(key)!));
        } catch { /* ignore */ }
      }
    }
    return saves;
  },

  /** Export save as JSON (for backup) */
  exportSave(userId: string): string {
    return localStorage.getItem(SAVE_PREFIX + userId) || "{}";
  },

  /** Import save from JSON */
  importSave(json: string): { success: boolean; error?: string } {
    try {
      const save = JSON.parse(json) as PlayerSave;
      if (!save.userId || !save.username) return { success: false, error: "Save inválido" };
      localStorage.setItem(SAVE_PREFIX + save.userId, JSON.stringify(save));
      Database.updateLeaderboard(save);
      return { success: true };
    } catch (e) {
      return { success: false, error: "JSON inválido" };
    }
  },
};
