// ============================================================
//  FIRST-PERSON CAMERA — preference + helpers
//
//  The option is a purely VISUAL / CONTROL choice. It never
//  touches hitboxes, range, speed, accuracy or any gameplay
//  rule. It is stored per player and survives restarts.
//
//  Storage follows the project's existing pattern: a
//  per-account key in localStorage, mirroring how `Database`
//  stores per-user settings (knox-save-<userId>).
// ============================================================

import type { PlayerSave } from "./database";

const PREFIX = "knox-fpv-";
const GLOBAL_KEY = "knox-first-person";

export interface FirstPersonSettings {
  enabled: boolean;
  /** Field of view in degrees, clamped to a sane range. */
  fov: number;
  /** Look sensitivity multiplier (1 = default). */
  sensitivity: number;
  /** Reduce motion: disables camera bob/shake smoothing in FP. */
  reduceMotion: boolean;
}

export const DEFAULT_FIRST_PERSON: FirstPersonSettings = {
  enabled: false,
  fov: 75,
  sensitivity: 1,
  reduceMotion: false,
};

function clamp(v: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function readRaw(userId: string | null): Partial<FirstPersonSettings> {
  const key = userId ? PREFIX + userId : GLOBAL_KEY;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<FirstPersonSettings>) : {};
  } catch {
    return {};
  }
}

function writeRaw(userId: string | null, settings: FirstPersonSettings): void {
  const key = userId ? PREFIX + userId : GLOBAL_KEY;
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch { /* ignore */ }
}

/** Read the preference for a player (falls back to the global one). */
export function loadFirstPerson(userId: string | null): FirstPersonSettings {
  const raw = readRaw(userId);
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_FIRST_PERSON.enabled,
    fov: clamp(Number(raw.fov), 55, 100, DEFAULT_FIRST_PERSON.fov),
    sensitivity: clamp(Number(raw.sensitivity), 0.25, 3, DEFAULT_FIRST_PERSON.sensitivity),
    reduceMotion: typeof raw.reduceMotion === "boolean" ? raw.reduceMotion : DEFAULT_FIRST_PERSON.reduceMotion,
  };
}

/** Persist the preference for a player. */
export function saveFirstPerson(userId: string | null, settings: FirstPersonSettings): void {
  writeRaw(userId, {
    enabled: settings.enabled,
    fov: clamp(settings.fov, 55, 100, DEFAULT_FIRST_PERSON.fov),
    sensitivity: clamp(settings.sensitivity, 0.25, 3, DEFAULT_FIRST_PERSON.sensitivity),
    reduceMotion: settings.reduceMotion,
  });
}

/** Toggle the flag and persist it. Returns the new state. */
export function toggleFirstPerson(userId: string | null, current: FirstPersonSettings): FirstPersonSettings {
  const next = { ...current, enabled: !current.enabled };
  saveFirstPerson(userId, next);
  return next;
}

/**
 * Mirror the preference into the per-account save file so it also
 * lives with the rest of the player's persisted settings.
 */
export function syncFirstPersonToSave(save: PlayerSave | null, settings: FirstPersonSettings): void {
  if (!save) return;
  const target = save as PlayerSave & { firstPerson?: FirstPersonSettings };
  target.firstPerson = {
    enabled: settings.enabled,
    fov: settings.fov,
    sensitivity: settings.sensitivity,
    reduceMotion: settings.reduceMotion,
  };
}
