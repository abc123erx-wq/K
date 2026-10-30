// ═══════════════════════════════════════════════════════════════
//  PASSWORD HASHING — PBKDF2-HMAC-SHA256 (WebCrypto)
//
//  The original implementation used a 32-bit Java-style string hash
//  with a 4-character salt. That is trivially brute-forced: a modern
//  GPU tries billions of such hashes per second.
//
//  This module replaces it with PBKDF2-HMAC-SHA256, 210 000
//  iterations, a 16-byte random salt and a 32-byte derived key.
//  It is implemented with Node's built-in WebCrypto, so it adds
//  **no dependency** to the project.
//
//  Format:  pbkdf2_sha256$<iterations>$<saltBase64>$<hashBase64>
//
// ═══════════════════════════════════════════════════════════════

const ALGORITHM = "PBKDF2";
const HASH_NAME = "SHA-256";
const ITERATIONS = 210_000;
const KEY_LENGTH_BITS = 256; // 32 bytes
const SALT_BYTES = 16;

/** Encode bytes to a base64url string (no padding). */
function toBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode a base64url string back to bytes. */
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Generate a cryptographically random salt. */
export function generateSalt(): string {
  const buf = new Uint8Array(new ArrayBuffer(SALT_BYTES));
  crypto.getRandomValues(buf);
  return toBase64Url(buf);
}

/**
 * Derive a key from a password and salt.
 * @param {string} password
 * @param {string} saltBase64Url
 * @param {number} [iterations]
 * @returns {Promise<string>} base64url derived key
 */
export async function deriveKey(
  password: string,
  saltBase64Url: string,
  iterations: number = ITERATIONS,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    ALGORITHM,
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: ALGORITHM,
      salt: fromBase64Url(saltBase64Url),
      iterations,
      hash: HASH_NAME,
    },
    keyMaterial,
    KEY_LENGTH_BITS,
  );
  return toBase64Url(new Uint8Array(bits));
}

/**
 * Hash a password.
 *
 * @param password the plaintext password
 * @param salt optional salt — when omitted a fresh random one is
 *   generated. Passing the salt explicitly lets the caller store
 *   the very salt that was used (otherwise the two would diverge
 *   and the verification would fail).
 * @returns the encoded hash
 */
export async function hashPassword(password: string, salt?: string): Promise<string> {
  const usedSalt = salt && salt.length > 0 ? salt : generateSalt();
  const derived = await deriveKey(password, usedSalt);
  return `pbkdf2_sha256$${ITERATIONS}$${usedSalt}$${derived}`;
}

/**
 * Verify a password against an encoded hash.
 * Uses a constant-time comparison.
 * @param {string} password
 * @param {string} encoded
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (typeof password !== "string" || typeof encoded !== "string") return false;
  const parts = encoded.split("$");
  if (parts.length !== 4) return false;
  const [scheme, iterRaw, salt, expected] = parts;
  if (scheme !== "pbkdf2_sha256") return false;

  const iterations = Number.parseInt(iterRaw, 10);
  if (!Number.isFinite(iterations) || iterations < 1000 || iterations > 2_000_000) {
    return false;
  }
  if (!salt || !expected) return false;

  let derived;
  try {
    derived = await deriveKey(password, salt, iterations);
  } catch {
    return false;
  }
  return timingSafeEqualString(derived, expected);
}

/**
 * Constant-time string comparison (prevents timing attacks).
 * @param {string} a
 * @param {string} b
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) {
    // Still burn a comparison so the length is not an oracle.
    let diff = 1;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ 0;
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Check whether an encoded hash uses outdated parameters and should
 * be upgraded on the next successful login.
 * @param {string} encoded
 */
export function needsRehash(encoded: string): boolean {
  if (typeof encoded !== "string") return true;
  const parts = encoded.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return true;
  return Number.parseInt(parts[1], 10) < ITERATIONS;
}

/** Exposed for tests / documentation. */
export const PBKDF2_ITERATIONS = ITERATIONS;
