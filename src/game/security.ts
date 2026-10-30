// ═══════════════════════════════════════════════════════════════
//  SECURITY — client-side hardening for Day of the Undead
//
//  Provides:
//    • SHA-256 (pure TS, verified against known test vectors)
//    • Admin access via a SERVER-SIDE session token
//      (no password, no secret, no allowlist in the bundle)
//    • Signed redeem-code entries with a per-device random key
//    • Brute-force protection with escalating lockout
//    • Input sanitisation + rate limiting for redemptions
//    • Persistent security audit log
//
//  ⚠️ THREAT MODEL — read this.
//  This is a browser app. It can raise the bar against casual
//  tampering but CANNOT enforce trust on its own. Therefore:
//
//    · There is NO admin password in the bundle any more.
//    · There is NO admin allowlist in the bundle any more.
//    · Admin identity comes exclusively from the backend, which
//      validates a stable account id against its own allowlist.
//    · The client only *hides* privileged UI. The server rejects
//      every privileged command that is not properly authorized.
//
//  For real guarantees, the backend must be reachable and must
//  have ADMIN_ACCOUNT_IDS configured. See server/adminConfig.mjs.
// ═══════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────
//  SHA-256
// ───────────────────────────────────────────────────────────────

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** UTF-8 encode a JS string into bytes. */
function utf8Bytes(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      // Surrogate pair
      code = 0x10000 + ((code & 0x3ff) << 10) + (str.charCodeAt(++i) & 0x3ff);
      out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return out;
}

/** SHA-256 hex digest of a UTF-8 string. */
export function sha256(text: string): string {
  const bytes = utf8Bytes(text);
  const bitLen = bytes.length * 8;

  // Padding: 0x80, then zeros until length ≡ 56 mod 64, then 64-bit big-endian length
  const padded = bytes.slice();
  padded.push(0x80);
  while (padded.length % 64 !== 56) padded.push(0);
  const lenBytes = new Array(8).fill(0);
  let hi = Math.floor(bitLen / 0x100000000);
  let lo = bitLen >>> 0;
  for (let i = 7; i >= 0; i--) { lenBytes[i] = lo & 0xff; lo = Math.floor(lo / 256); }
  for (let i = 3; i >= 0; i--) { lenBytes[i] = hi & 0xff; hi = Math.floor(hi / 256); }
  padded.push(...lenBytes);

  const h = H0.slice();
  for (let off = 0; off < padded.length; off += 64) {
    const w = new Array(64);
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = ((padded[j] << 24) | (padded[j + 1] << 16) | (padded[j + 2] << 8) | padded[j + 3]) | 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    const n = [a, b, c, d, e, f, g, hh];
    for (let i = 0; i < 8; i++) h[i] = (h[i] + n[i]) | 0;
  }
  let out = "";
  for (const v of h) out += (v >>> 0).toString(16).padStart(8, "0");
  return out;
}

/** Constant-time-ish string compare (avoids early-exit timing oracles). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ───────────────────────────────────────────────────────────────
//  Signing key — PER DEVICE, generated at runtime.
//
//  It is NOT a secret: it only detects casual tampering of the
//  redeem-code list stored in this browser's localStorage. The
//  previous hard-coded repository-wide key was removed because
//  anything shipped to the client is public.
//
//  Real redemption must be validated by the backend.
// ───────────────────────────────────────────────────────────────

const DEVICE_KEY_STORAGE = "zmb-device-sign-key";

function getDeviceSignKey(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY_STORAGE);
    if (existing && existing.length >= 32) return existing;
    const bytes = new Uint8Array(32);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(DEVICE_KEY_STORAGE, key);
    return key;
  } catch {
    // Storage unavailable — fall back to an ephemeral key so the app
    // still works (codes simply will not survive a reload).
    return sha256(`ephemeral-${Date.now()}-${Math.random()}`);
  }
}

/** HMAC-style signature (keyed hash — no external crypto needed). */
export function sign(payload: string): string {
  const key = getDeviceSignKey();
  const inner = sha256(key + payload);
  return sha256(inner + key).slice(0, 32);
}

export function verifySignature(payload: string, signature: string): boolean {
  return safeEqual(sign(payload), signature);
}

// ───────────────────────────────────────────────────────────────
//  Brute-force lockout
//
//  Protects the client's own retry loop against a script that
//  spams the permission endpoint. The server enforces its own
//  rate limits; this is an additional local guard.
// ───────────────────────────────────────────────────────────────
interface LockState {
  fails: number;
  lockedUntil: number;
}

const LOCK_KEY = "zmb-security-lock";
const MAX_FAILS = 5;
const LOCK_STEPS = [15_000, 60_000, 300_000, 900_000]; // escalating, in ms

function readLock(): LockState {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCK_KEY) || "{}");
    return { fails: raw.fails ?? 0, lockedUntil: raw.lockedUntil ?? 0 };
  } catch {
    return { fails: 0, lockedUntil: 0 };
  }
}

function writeLock(state: LockState) {
  try { localStorage.setItem(LOCK_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function lockRemainingMs(): number {
  return Math.max(0, readLock().lockedUntil - Date.now());
}

export function isLockedOut(): boolean {
  return lockRemainingMs() > 0;
}

/** Records a failed attempt and applies escalation. Returns new lock duration (0 = not locked). */
export function registerFailedAttempt(): number {
  const state = readLock();
  state.fails += 1;
  const step = Math.min(LOCK_STEPS.length - 1, Math.floor((state.fails - 1) / MAX_FAILS));
  state.lockedUntil = Date.now() + LOCK_STEPS[step];
  writeLock(state);
  audit("permission-denied", `${state.fails} tentativa(s) sem permissão`);
  return LOCK_STEPS[step];
}

export function resetLockout() {
  writeLock({ fails: 0, lockedUntil: 0 });
}

// ───────────────────────────────────────────────────────────────
//  Admin session token (SERVER-ISSUED)
//
//  The token is minted by the backend after it validated the
//  account id against its allowlist. The client stores it in
//  sessionStorage only (never persisted across browser restarts)
//  and sends it back for every privileged call.
// ───────────────────────────────────────────────────────────────
const SESSION_KEY = "zmb-admin-session";
const SESSION_TTL = 30 * 60 * 1000;   // 30 min absolute
const SESSION_IDLE = 10 * 60 * 1000;  // 10 min idle timeout

interface Session { token: string; issued: number; seen: number; accountId?: string; }

/** Store a server-issued admin token. */
export function createSession(token: string, accountId?: string): void {
  const session: Session = {
    token,
    issued: Date.now(),
    seen: Date.now(),
    accountId,
  };
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* ignore */ }
  audit("admin-session", "sessão administrativa recebida do servidor");
}

/** Is there a locally-held, non-expired admin token? */
export function sessionValid(): boolean {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw) as Session;
    if (!s.token) { destroySession(); return false; }
    const now = Date.now();
    if (now - s.issued > SESSION_TTL) { destroySession(); return false; }
    if (now - s.seen > SESSION_IDLE) { destroySession(); return false; }
    s.seen = now; // sliding renewal
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/** Read the stored token (or null). */
export function getSessionToken(): string | null {
  try {
    if (!sessionValid()) return null;
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null") as Session | null;
    return s?.token ?? null;
  } catch {
    return null;
  }
}

/** Read the account id bound to the stored token (or null). */
export function getSessionAccountId(): string | null {
  try {
    if (!sessionValid()) return null;
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null") as Session | null;
    return s?.accountId ?? null;
  } catch {
    return null;
  }
}

export function destroySession(): void {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  audit("admin-session", "sessão encerrada");
}

// ───────────────────────────────────────────────────────────────
//  Redeem-code redemption rate limiting
// ───────────────────────────────────────────────────────────────
const REDEEM_ATTEMPT_KEY = "zmb-redeem-attempts";
const REDEEM_MAX_ATTEMPTS = 8;
const REDEEM_WINDOW = 5 * 60 * 1000; // 5 min

interface AttemptWindow { count: number; start: number; }

export function redemptionAllowed(): { ok: boolean; retryAfterMs: number } {
  let state: AttemptWindow = { count: 0, start: Date.now() };
  try {
    const raw = JSON.parse(localStorage.getItem(REDEEM_ATTEMPT_KEY) || "null");
    if (raw) state = raw as AttemptWindow;
  } catch { /* ignore */ }
  const now = Date.now();
  if (now - state.start > REDEEM_WINDOW) state = { count: 0, start: now };
  if (state.count >= REDEEM_MAX_ATTEMPTS) {
    return { ok: false, retryAfterMs: state.start + REDEEM_WINDOW - now };
  }
  return { ok: true, retryAfterMs: 0 };
}

export function registerRedemptionAttempt(success: boolean): void {
  let state: AttemptWindow = { count: 0, start: Date.now() };
  try {
    const raw = JSON.parse(localStorage.getItem(REDEEM_ATTEMPT_KEY) || "null");
    if (raw) state = raw as AttemptWindow;
  } catch { /* ignore */ }
  const now = Date.now();
  if (now - state.start > REDEEM_WINDOW) state = { count: 0, start: now };
  // Successes don't count toward the limit — only failures
  if (!success) state.count += 1;
  try { localStorage.setItem(REDEEM_ATTEMPT_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  audit(success ? "redeem-success" : "redeem-fail", success ? "código resgatado" : "tentativa inválida");
}

// ───────────────────────────────────────────────────────────────
//  Input sanitisation
// ───────────────────────────────────────────────────────────────
/** Strips control chars, angle brackets and collapses whitespace. */
export function sanitizeText(input: string, maxLength = 200): string {
  return input
    .replace(/[<>&"'`\\]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** Validate a room/lobby code: alphanumeric, dash, underscore only. */
export function sanitizeRoom(input: string, maxLength = 24): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, maxLength);
}

// ───────────────────────────────────────────────────────────────
//  Audit log
//
//  Stores technical events only — never audio, never transcripts,
//  never tokens. Kept in localStorage for the session audit view.
// ───────────────────────────────────────────────────────────────
const AUDIT_KEY = "zmb-security-audit";
const AUDIT_MAX = 60;

export interface AuditEntry { ts: number; event: string; detail: string; }

export function audit(event: string, detail: string): void {
  try {
    const log = JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]") as AuditEntry[];
    log.unshift({ ts: Date.now(), event, detail });
    localStorage.setItem(AUDIT_KEY, JSON.stringify(log.slice(0, AUDIT_MAX)));
  } catch { /* ignore */ }
}

export function readAudit(): AuditEntry[] {
  try {
    return JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]") as AuditEntry[];
  } catch {
    return [];
  }
}
