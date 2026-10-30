// ============================================================
//  SESSION STORE — server-side admin/panel sessions
//
//  A session token is minted ONLY by the server, AFTER the
//  server has verified that the authenticated account id is in
//  the admin allowlist (see adminConfig.mjs). The token lives
//  server-side; the client only holds an opaque string.
//
//  Because the token never encodes a permission, revoking the
//  allowlist entry (or restarting with an empty allowlist)
//  immediately invalidates every outstanding session.
// ============================================================

import { randomBytes, timingSafeEqual } from "node:crypto";
import { LIMITS } from "./adminConfig.mjs";

/** token -> { accountId, displayName, createdAt, lastSeenAt, scope } */
const sessions = new Map();

/** Per-account sliding window of privileged command timestamps. */
const commandWindows = new Map();

/** Per-account last activation timestamp (anti-replay). */
const lastActivation = new Map();

function pruneSessions(now) {
  for (const [token, s] of sessions) {
    if (now - s.createdAt > LIMITS.SESSION_TTL_MS) sessions.delete(token);
  }
}

/** Mint a session for an already-authorized account id. */
export function createSession({ accountId, displayName }) {
  const now = Date.now();
  pruneSessions(now);
  const token = randomBytes(32).toString("base64url");
  sessions.set(token, {
    accountId,
    displayName: typeof displayName === "string" ? displayName : "",
    createdAt: now,
    lastSeenAt: now,
  });
  return token;
}

/** Look up a session without mutating it. */
export function peekSession(token) {
  if (typeof token !== "string" || !token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.createdAt > LIMITS.SESSION_TTL_MS) {
    sessions.delete(token);
    return null;
  }
  return s;
}

/** Look up + refresh the idle timer. */
export function touchSession(token) {
  const s = peekSession(token);
  if (!s) return null;
  s.lastSeenAt = Date.now();
  return s;
}

/** Destroy a single session (logout / disconnect). */
export function destroySession(token) {
  if (typeof token !== "string") return false;
  return sessions.delete(token);
}

/** Destroy every session belonging to an account (permission revoked). */
export function destroySessionsForAccount(accountId) {
  let removed = 0;
  for (const [token, s] of sessions) {
    if (s.accountId === accountId) {
      sessions.delete(token);
      removed++;
    }
  }
  return removed;
}

/** Constant-time token comparison for HTTP header checks. */
export function safeTokenEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// ============================================================
//  RATE LIMITING
// ============================================================

/**
 * Check whether the account may issue a privileged command now.
 * Returns { ok: true } or { ok: false, retryAfterMs }.
 */
export function checkCommandRate(accountId, now = Date.now()) {
  const times = (commandWindows.get(accountId) || []).filter(
    (t) => now - t < LIMITS.COMMAND_WINDOW_MS,
  );

  if (times.length >= LIMITS.MAX_COMMANDS_PER_WINDOW) {
    commandWindows.set(accountId, times);
    const oldest = times[0];
    return {
      ok: false,
      retryAfterMs: Math.max(0, oldest + LIMITS.COMMAND_WINDOW_MS - now),
    };
  }

  const last = times.length ? times[times.length - 1] : 0;
  if (now - last < LIMITS.COMMAND_COOLDOWN_MS) {
    commandWindows.set(accountId, times);
    return {
      ok: false,
      retryAfterMs: Math.max(0, last + LIMITS.COMMAND_COOLDOWN_MS - now),
    };
  }

  commandWindows.set(accountId, times);
  return { ok: true, retryAfterMs: 0 };
}

/** Record a privileged command that was actually accepted. */
export function recordCommand(accountId, now = Date.now()) {
  const times = (commandWindows.get(accountId) || []).filter(
    (t) => now - t < LIMITS.COMMAND_WINDOW_MS,
  );
  times.push(now);
  commandWindows.set(accountId, times);
}

/** Activation anti-replay: too soon after the previous activation? */
export function checkActivationCooldown(accountId, now = Date.now()) {
  const last = lastActivation.get(accountId);
  if (last && now - last < LIMITS.ACTIVATION_COOLDOWN_MS) {
    return { ok: false, retryAfterMs: LIMITS.ACTIVATION_COOLDOWN_MS - (now - last) };
  }
  return { ok: true, retryAfterMs: 0 };
}

/** Record an accepted activation. */
export function recordActivation(accountId, now = Date.now()) {
  lastActivation.set(accountId, now);
}

/** Forget all state for an account (used when a session ends). */
export function forgetAccount(accountId) {
  commandWindows.delete(accountId);
  lastActivation.delete(accountId);
}
