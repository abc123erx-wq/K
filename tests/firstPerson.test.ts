// ═══════════════════════════════════════════════════════════════
//  TESTS — first-person camera preference
//
//  The option must persist per player, survive reloads and never
//  alter gameplay rules.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from "vitest";
import {
  loadFirstPerson,
  saveFirstPerson,
  toggleFirstPerson,
  syncFirstPersonToSave,
  DEFAULT_FIRST_PERSON,
} from "../src/game/firstPerson";
import type { PlayerSave } from "../src/game/database";

function makeSave(userId: string): PlayerSave {
  return {
    userId,
    username: "tester",
    totalKills: 0, bestDaysSurvived: 0, totalDaysSurvived: 0, totalMatches: 0, totalDeaths: 0,
    pvpKills: 0, pvpDeaths: 0, pvpWins: 0, pvpLosses: 0,
    level: 1, xp: 0, coins: 0, achievements: [], unlockedItems: [],
    lastStats: { health: 100, hunger: 0, thirst: 0, stamina: 100, sanity: 100, infection: 0, warmth: 70, radiation: 0, encumbrance: 0 },
    lastPosition: { x: 5000, y: 5000 }, lastInventory: [], savedInventory: [], savedEquipped: null,
    preferredDifficulty: "survivor", preferredBackend: "broadcast",
    createdAt: 0, updatedAt: 0, lastPlayedAt: 0,
  };
}

describe("first-person preference", () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
  });

  it("defaults to disabled", () => {
    expect(loadFirstPerson("usr_a").enabled).toBe(false);
    expect(loadFirstPerson("usr_a").fov).toBe(DEFAULT_FIRST_PERSON.fov);
  });

  it("persists across reloads (simulated by a fresh read)", () => {
    saveFirstPerson("usr_a", { enabled: true, fov: 90, sensitivity: 1.5, reduceMotion: true });
    const loaded = loadFirstPerson("usr_a");
    expect(loaded.enabled).toBe(true);
    expect(loaded.fov).toBe(90);
    expect(loaded.sensitivity).toBe(1.5);
    expect(loaded.reduceMotion).toBe(true);
  });

  it("keeps the preference per player", () => {
    saveFirstPerson("usr_a", { enabled: true, fov: 80, sensitivity: 1, reduceMotion: false });
    saveFirstPerson("usr_b", { enabled: false, fov: 60, sensitivity: 1, reduceMotion: false });
    expect(loadFirstPerson("usr_a").enabled).toBe(true);
    expect(loadFirstPerson("usr_b").enabled).toBe(false);
    expect(loadFirstPerson("usr_b").fov).toBe(60);
  });

  it("toggles on and off and persists each change", () => {
    const initial = loadFirstPerson("usr_a");
    const on = toggleFirstPerson("usr_a", initial);
    expect(on.enabled).toBe(true);
    expect(loadFirstPerson("usr_a").enabled).toBe(true);

    const off = toggleFirstPerson("usr_a", on);
    expect(off.enabled).toBe(false);
    expect(loadFirstPerson("usr_a").enabled).toBe(false);
  });

  it("clamps out-of-range values", () => {
    saveFirstPerson("usr_a", { enabled: true, fov: 999, sensitivity: 99, reduceMotion: false });
    const loaded = loadFirstPerson("usr_a");
    expect(loaded.fov).toBeLessThanOrEqual(100);
    expect(loaded.fov).toBeGreaterThanOrEqual(55);
    expect(loaded.sensitivity).toBeLessThanOrEqual(3);
    expect(loaded.sensitivity).toBeGreaterThanOrEqual(0.25);
  });

  it("mirrors the preference into the player save without touching gameplay stats", () => {
    const save = makeSave("usr_a");
    const before = { ...save };
    syncFirstPersonToSave(save, { enabled: true, fov: 88, sensitivity: 1.2, reduceMotion: true });
    const target = save as PlayerSave & { firstPerson?: unknown };
    expect(target.firstPerson).toMatchObject({ enabled: true, fov: 88 });
    // Gameplay-relevant fields untouched.
    expect(save.totalKills).toBe(before.totalKills);
    expect(save.level).toBe(before.level);
    expect(save.preferredDifficulty).toBe(before.preferredDifficulty);
  });

  it("tolerates a null save", () => {
    expect(() => syncFirstPersonToSave(null, { ...DEFAULT_FIRST_PERSON })).not.toThrow();
  });
});
