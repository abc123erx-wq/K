// ============================================================
//  ACCESSIBILITY & SAFETY SETTINGS
//
//  The game can contain suspense events and special effects.
//  These options let the player reduce or disable them, and they
//  are stored per player like the other preferences.
//
//  Nothing here is required for the panel; these are the general
//  accessibility controls of the game.
// ============================================================

const PREFIX = "knox-a11y-";
const GLOBAL_KEY = "knox-accessibility";

export interface AccessibilitySettings {
  /** Master volume (0..1). */
  volume: number;
  /** Show subtitles / captions for sound cues. */
  subtitles: boolean;
  /** Reduce flashing and other intense visual effects. */
  reduceFlashes: boolean;
  /** Reduce camera shake and screen movement. */
  reduceMotion: boolean;
  /** Disable the suspense events entirely. */
  disableEvents: boolean;
}

export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  volume: 0.7,
  subtitles: false,
  reduceFlashes: false,
  reduceMotion: false,
  disableEvents: false,
};

function clamp(v: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

export function loadAccessibility(userId: string | null): AccessibilitySettings {
  const key = userId ? PREFIX + userId : GLOBAL_KEY;
  let raw: Partial<AccessibilitySettings> = {};
  try {
    const stored = localStorage.getItem(key);
    if (stored) raw = JSON.parse(stored) as Partial<AccessibilitySettings>;
  } catch { /* ignore */ }
  return {
    volume: clamp(Number(raw.volume), 0, 1, DEFAULT_ACCESSIBILITY.volume),
    subtitles: typeof raw.subtitles === "boolean" ? raw.subtitles : DEFAULT_ACCESSIBILITY.subtitles,
    reduceFlashes: typeof raw.reduceFlashes === "boolean" ? raw.reduceFlashes : DEFAULT_ACCESSIBILITY.reduceFlashes,
    reduceMotion: typeof raw.reduceMotion === "boolean" ? raw.reduceMotion : DEFAULT_ACCESSIBILITY.reduceMotion,
    disableEvents: typeof raw.disableEvents === "boolean" ? raw.disableEvents : DEFAULT_ACCESSIBILITY.disableEvents,
  };
}

export function saveAccessibility(userId: string | null, settings: AccessibilitySettings): void {
  const key = userId ? PREFIX + userId : GLOBAL_KEY;
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch { /* ignore */ }
}
