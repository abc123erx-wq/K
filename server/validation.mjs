// ═══════════════════════════════════════════════════════════════
//  INPUT VALIDATION & SANITIZATION — server side
//
//  Every value that arrives from the network (body, query string,
//  headers) passes through this module before it is used or stored.
//
//  Why this matters even though the server talks to a database that
//  is not SQL:
//    · A hostile client can send a 10 MB JSON body, a 400 000-char
//      string, or control characters that corrupt logs.
//    · Anything echoed back to another player (chat, player list)
//      becomes an XSS vector if the client renders it as HTML.
//    · `__proto__` / `constructor` keys can poison `Object`.
//
//  The rules are strict allow-lists: a field is either valid or it
//  is rejected. Nothing is "cleaned up and passed through".
// ═══════════════════════════════════════════════════════════════

/** Hard ceiling for a JSON request body (16 KB). */
export const MAX_BODY_BYTES = 16 * 1024;

/** Maximum length of a single free-text field. */
export const MAX_TEXT_LENGTH = 200;

/** Allowed shape for an effect / entity id: lowercase, digits, _ and -. */
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/**
 * Allowed shape for an account id: `usr_` + a short lowercase token.
 * The real ids are produced by the client auth module as
 * `usr_` + 8 hex characters; short ids are accepted too so the
 * server can be configured with hand-made ids in tests/staging.
 */
const ACCOUNT_ID_PATTERN = /^usr_[a-z0-9]{2,32}$/;

/** Allowed shape for a room id. */
const ROOM_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/;

/**
 * Strip control characters and trim a string.
 * @param {unknown} value
 * @param {number} [maxLength]
 * @returns {string} "" when the value is not a usable string
 */
export function sanitizeText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") return "";
  // Remove C0 controls (except \n \t) and C1 controls + zero-width.
  let out = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");
  out = out.replace(/[\u200B-\u200D\uFEFF]/g, "");
  out = out.trim();
  if (out.length > maxLength) out = out.slice(0, maxLength);
  return out;
}

/**
 * Escape a string so it is safe to embed in HTML text or an
 * attribute. Used for anything the server echoes back.
 */
export function escapeHtml(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Validate a strict identifier (effect id, command name…).
 * @returns {string|null} the id, or null when invalid
 */
export function validateId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!ID_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validate an account id.
 * @returns {string|null}
 */
export function validateAccountId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!ACCOUNT_ID_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validate a display name. Unicode letters/digits plus a few
 * punctuation marks, 2–24 characters.
 *
 * IMPORTANT: the name is NOT trimmed. A name like " RimuOfc" must
 * be rejected rather than silently normalised into "RimuOfc" —
 * otherwise an allowlist check could be bypassed with whitespace.
 *
 * @returns {string|null}
 */
export function validateDisplayName(value) {
  if (typeof value !== "string") return null;
  // Reject leading/trailing whitespace outright.
  if (value !== value.trim()) return null;
  if (value.length < 2 || value.length > 24) return null;
  // Allow letters, numbers, spaces and a safe punctuation set.
  if (!/^[\p{L}\p{N} _.\-]+$/u.test(value)) return null;
  return value;
}

/**
 * Validate a room id.
 * @returns {string|null}
 */
export function validateRoomId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!ROOM_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/**
 * Parse a JSON body with a size ceiling and a plain-object check.
 * Rejects prototype-polluting keys.
 *
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<{ ok: true, value: Record<string, unknown> } | { ok: false, error: string }>}
 */
export async function readJsonBody(req) {
  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, error: "content-type-invalid" };
  }

  const chunks = [];
  let size = 0;

  return new Promise((resolve) => {
    let aborted = false;

    req.on("data", (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Stop reading, but let the caller answer with 413 first.
        // Destroying the socket here would kill the response.
        aborted = true;
        req.pause();
        resolve({ ok: false, error: "body-too-large" });
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (aborted) return;
      if (size > MAX_BODY_BYTES) {
        resolve({ ok: false, error: "body-too-large" });
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolve({ ok: false, error: "body-empty" });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        resolve({ ok: false, error: "body-invalid-json" });
        return;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        resolve({ ok: false, error: "body-not-object" });
        return;
      }
      // Drop prototype-polluting keys before the object is used.
      const clean = {};
      for (const [key, val] of Object.entries(parsed)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
        clean[key] = val;
      }
      resolve({ ok: true, value: clean });
    });

    req.on("error", () => {
      if (!aborted) resolve({ ok: false, error: "body-read-error" });
    });
  });
}

/**
 * Extract and validate a bearer token from the Authorization header.
 * @param {import("node:http").IncomingMessage} req
 * @returns {string|null}
 */
export function readBearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+([A-Za-z0-9_-]{16,128})$/.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * Read a validated query-string parameter.
 * @param {URLSearchParams} params
 * @param {string} name
 * @param {(v: string) => string|null} validator
 * @returns {string|null}
 */
export function queryParam(params, name, validator) {
  const raw = params.get(name);
  if (raw === null) return null;
  const cleaned = sanitizeText(raw, 128);
  if (!cleaned) return null;
  return validator(cleaned);
}
