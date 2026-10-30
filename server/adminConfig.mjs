// ============================================================
//  ADMIN / PANEL CONFIG — server-side authority
//
//  NOTHING in this file is shipped to the client. Every value
//  here is read by ws-server.mjs at runtime and is the single
//  source of truth for:
//
//    · which account ids may administer the game
//    · which display names map to an account id
//    · which entities/effects the special panel may invoke
//    · the rate limits that protect the room from spam
//
//  HOW TO BIND A LEGITIMATE ACCOUNT (admin task, one time):
//
//    1. Find the stable account id of the legitimate account.
//       The account id is printed by the server in the login
//       handshake (see AUTH below) and is also the `id` field
//       of the account record in your auth backend.
//
//    2. Add it to the environment variable ADMIN_ACCOUNT_IDS:
//
//         ADMIN_ACCOUNT_IDS="usr_abc123,usr_def456"
//
//       For local development you can use a file instead:
//
//         ADMIN_ACCOUNTS_FILE=./admin-accounts.json
//
//    3. Optionally bind a friendly display name to the same id so
//       the server can auto-resolve a session that only sends a
//       name (still validated against the id, never name-only):
//
//         ADMIN_ACCOUNT_NAMES='{"RimuOfc":"usr_abc123"}'
//
//  NEVER put a password, token, or secret in the repository.
//  The ids above are identifiers, not credentials; they are only
//  meaningful together with a real authenticated session.
// ============================================================

/** Account ids allowed to administer. Empty = nobody is authorized. */
function parseAccountIds() {
  const raw = process.env.ADMIN_ACCOUNT_IDS || "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(ids);
}

/** Optional map displayName -> accountId (validated against ADMIN_ACCOUNT_IDS). */
function parseAccountNames() {
  const raw = process.env.ADMIN_ACCOUNT_NAMES || "";
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const allowed = parseAccountIds();
    const out = {};
    for (const [name, id] of Object.entries(parsed)) {
      // A name binding is only useful if the id is itself allowed.
      if (typeof name === "string" && typeof id === "string" && allowed.has(id)) {
        out[name] = id;
      }
    }
    return out;
  } catch {
    console.warn("[admin-config] ADMIN_ACCOUNT_NAMES is not valid JSON — ignored.");
    return {};
  }
}

export const ADMIN_ACCOUNT_IDS = parseAccountIds();
export const ADMIN_ACCOUNT_NAMES = parseAccountNames();

/** Exact (case-sensitive) display-name allowlist for the admin UI hint. */
export const ADMIN_DISPLAY_NAMES = Object.keys(ADMIN_ACCOUNT_NAMES);

/**
 * Is this account id allowed to administer?
 * This is the ONLY authorization primitive. Display names are
 * matched exactly afterwards, but never used as the identity.
 */
export function isAuthorizedAccountId(accountId) {
  if (typeof accountId !== "string" || !accountId) return false;
  return ADMIN_ACCOUNT_IDS.has(accountId);
}

/**
 * Resolve an authenticated session to an account id.
 *
 * The authenticated account id is the ONLY proof of identity.
 * The display name is used exclusively as an *additional*
 * constraint: when name bindings are configured, the session's
 * name must match the binding exactly AND resolve to the very same
 * account id.
 *
 * This means a name alone NEVER grants access:
 *   · "RimuOfc" with an unauthorized account id → rejected.
 *   · an authorized account id with a foreign name → rejected.
 *   · "RimuOfc123" / "rimuofc" / " RimuOfc" → rejected.
 */
export function resolveAuthorizedAccountId({ accountId, displayName }) {
  if (!isAuthorizedAccountId(accountId)) return null;

  if (ADMIN_DISPLAY_NAMES.length > 0) {
    // Name bindings are configured: the name must match exactly and
    // point at this very account.
    if (typeof displayName !== "string") return null;
    if (!Object.prototype.hasOwnProperty.call(ADMIN_ACCOUNT_NAMES, displayName)) return null;
    if (ADMIN_ACCOUNT_NAMES[displayName] !== accountId) return null;
  }

  return accountId;
}

// ============================================================
//  SPECIAL PANEL — invocable resources
//
//  Each entry maps a stable id to the engine-side spawn routine
//  the server is allowed to request. The client cannot invent
//  new ids: anything not in this map is rejected.
// ============================================================

export const SPAWNABLE_EFFECTS = Object.freeze({
  zombie_scavenger: {
    label: "Vagante",
    kind: "zombie",
    count: 1,
    minDistance: 6,
    maxDistance: 12,
  },
  zombie_brute: {
    label: "Bruto",
    kind: "zombie",
    count: 1,
    minDistance: 8,
    maxDistance: 14,
  },
  zombie_swarm: {
    label: "Enxame",
    kind: "zombie",
    count: 5,
    minDistance: 8,
    maxDistance: 16,
  },
  hunter: {
    label: "Caçador",
    kind: "zombie",
    count: 1,
    minDistance: 10,
    maxDistance: 18,
  },
  pet: {
    label: "Companheiro",
    kind: "zombie",
    count: 1,
    minDistance: 3,
    maxDistance: 6,
  },
});

export const SPAWNABLE_IDS = Object.freeze(Object.keys(SPAWNABLE_EFFECTS));

/** Look up an allowed effect. Returns undefined for anything unknown. */
export function findSpawnableEffect(id) {
  if (typeof id !== "string") return undefined;
  // Exact match only — no trimming/case folding on the id itself.
  return Object.prototype.hasOwnProperty.call(SPAWNABLE_EFFECTS, id)
    ? SPAWNABLE_EFFECTS[id]
    : undefined;
}

// ============================================================
//  LIMITS — anti-spam / anti-degradation
// ============================================================

function numEnv(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export const LIMITS = Object.freeze({
  /** Minimum ms between two privileged commands from the same account. */
  COMMAND_COOLDOWN_MS: numEnv("PANEL_COMMAND_COOLDOWN_MS", 3000),
  /** Minimum ms between two panel activations from the same account. */
  ACTIVATION_COOLDOWN_MS: numEnv("PANEL_ACTIVATION_COOLDOWN_MS", 5000),
  /** Max privileged commands allowed inside the sliding window. */
  MAX_COMMANDS_PER_WINDOW: numEnv("PANEL_MAX_COMMANDS_PER_WINDOW", 10),
  /** Length of the sliding window in ms. */
  COMMAND_WINDOW_MS: numEnv("PANEL_COMMAND_WINDOW_MS", 60_000),
  /** Max live effects a single room may hold from the panel. */
  MAX_ACTIVE_EFFECTS_PER_ROOM: numEnv("PANEL_MAX_ACTIVE_EFFECTS_PER_ROOM", 30),
  /** Max live effects a single target player may carry from the panel. */
  MAX_ACTIVE_EFFECTS_PER_TARGET: numEnv("PANEL_MAX_ACTIVE_EFFECTS_PER_TARGET", 6),
  /** Session token lifetime in ms. */
  SESSION_TTL_MS: numEnv("ADMIN_SESSION_TTL_MS", 30 * 60 * 1000),
  /** Max length of a panel chat line. */
  MAX_COMMAND_LENGTH: 200,
});

export function adminConfigSummary() {
  return {
    authorizedAccountCount: ADMIN_ACCOUNT_IDS.size,
    displayNames: ADMIN_DISPLAY_NAMES,
    spawnableEffects: SPAWNABLE_IDS,
    limits: LIMITS,
  };
}
