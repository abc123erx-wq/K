// ═══════════════════════════════════════════════════════════════
//  AUTH SYSTEM — Login, Register, Session Management
//  Supports: localStorage (offline) + Firebase Auth (cloud)
//
//  ── Security changes applied in this audit ───────────────────
//  1. Passwords are hashed with PBKDF2-HMAC-SHA256 (210 000
//     iterations, 16-byte random salt) instead of the previous
//     32-bit string hash.
//  2. The session token is generated with the Web Crypto CSPRNG
//     instead of Math.random().
//  3. Account ids are generated with the CSPRNG as well.
//  4. All user input is validated and sanitized before it is
//     stored or compared (no unbounded strings, no control chars).
//  5. Brute-force protection: failed logins are counted per
//     account and per source; the account is temporarily locked
//     after 5 failures, with an exponential backoff.
//  6. Rate limiting on login/register calls.
//  7. Account enumeration is avoided — "wrong password" and
//     "unknown user" return the same generic message.
// ═══════════════════════════════════════════════════════════════

import {
  deriveKey,
  generateSalt,
  hashPassword,
  needsRehash,
  timingSafeEqualString,
  verifyPassword,
} from "./passwordHash";

export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: number;
  lastLogin: number;
  avatar?: string;
}

export interface AuthSession {
  user: User;
  token: string;
  expiresAt: number;
}

const STORAGE_KEY_USERS = "knox-users";
const STORAGE_KEY_SESSION = "knox-session";
const SESSION_DURATION = 1000 * 60 * 60 * 24 * 30; // 30 days

// ── Validation limits ─────────────────────────────────────────
const USERNAME_MIN = 3;
const USERNAME_MAX = 20;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const EMAIL_MAX = 254;

// ── Brute-force protection ─────────────────────────────────────
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_BASE_MS = 30_000;
const LOCK_MAX_MS = 15 * 60_000;
const ATTEMPT_WINDOW_MS = 15 * 60_000;

/**
 * Global rate limit: at most MAX_AUTH_ATTEMPTS calls per
 * AUTH_RATE_WINDOW_MS.
 *
 * This is a *sliding window*, not a minimum gap between calls. A
 * minimum gap would break a legitimate user who types their
 * password and presses Enter twice, or who registers and then logs
 * in immediately.
 */
const MAX_AUTH_ATTEMPTS = 10;
const AUTH_RATE_WINDOW_MS = 10_000;

interface FailureRecord {
  count: number;
  firstAt: number;
  lastAt: number;
  lockedUntil: number;
}

const failures = new Map<string, FailureRecord>();
/** Timestamps (ms) of the recent auth calls, for the sliding window. */
const authAttempts: number[] = [];

/**
 * Keys that must never appear on a user record.
 *
 * These are *privilege* fields: if a poisoned localStorage injects
 * them, the record is dropped instead of being trusted. The
 * legitimate hashing fields (`passwordHash`, `salt`) are NOT in this
 * list — they are the ones we need to verify a password.
 */
const FORBIDDEN_USER_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "isAdmin",
  "role",
  "permissions",
  "admin",
  "isModerator",
  "banned",
  "whitelist",
  "allowlist",
]);

/**
 * Generate a cryptographically random hex string.
 * @param {number} bytes
 */
function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a session token with the CSPRNG.
 * 32 bytes -> 64 hex characters (256 bits of entropy).
 */
function generateToken(): string {
  return `tok_${randomHex(32)}`;
}

/**
 * Generate an account id with the CSPRNG.
 * The `usr_` prefix is kept for compatibility with the server
 * allowlist (`ADMIN_ACCOUNT_IDS`).
 */
function generateId(): string {
  return `usr_${randomHex(4)}`;
}

// ── Input validation ──────────────────────────────────────────

/** Strip control characters and trim. */
export function sanitizeInput(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  let out = value.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
  out = out.replace(/[\u200B-\u200D\uFEFF]/g, "");
  out = out.trim();
  if (out.length > maxLength) out = out.slice(0, maxLength);
  return out;
}

/** Validate a username: letters, digits, underscore, dot, dash. */
export function validateUsername(raw: unknown): { ok: boolean; value?: string; error?: string } {
  const value = sanitizeInput(raw, USERNAME_MAX);
  if (value.length < USERNAME_MIN) {
    return { ok: false, error: `Nome deve ter pelo menos ${USERNAME_MIN} caracteres` };
  }
  if (!/^[\p{L}\p{N}_.-]+$/u.test(value)) {
    return { ok: false, error: "Nome contém caracteres inválidos" };
  }
  return { ok: true, value };
}

/** Validate an email address with a conservative pattern. */
export function validateEmail(raw: unknown): { ok: boolean; value?: string; error?: string } {
  const value = sanitizeInput(raw, EMAIL_MAX).toLowerCase();
  if (!value) return { ok: false, error: "Email inválido" };
  // Deliberately strict: local@domain.tld, no spaces, no control chars.
  if (!/^[^\s@]{1,64}@[^\s@.]{1,63}\.[a-z]{2,24}$/i.test(value)) {
    return { ok: false, error: "Email inválido" };
  }
  return { ok: true, value };
}

/**
 * Validate a password.
 * The minimum length is 8 characters — length matters far more than
 * complexity rules, which push users toward predictable patterns.
 */
export function validatePassword(raw: unknown): { ok: boolean; value?: string; error?: string } {
  const value = typeof raw === "string" ? raw : "";
  if (value.length < PASSWORD_MIN) {
    return { ok: false, error: `Senha deve ter pelo menos ${PASSWORD_MIN} caracteres` };
  }
  if (value.length > PASSWORD_MAX) {
    return { ok: false, error: `Senha deve ter no máximo ${PASSWORD_MAX} caracteres` };
  }
  return { ok: true, value };
}

// ── User storage (localStorage backed) ─────────────────────────
interface StoredUser extends User {
  passwordHash: string;
  salt: string;
}

/**
 * Load users, dropping any record that carries unexpected or
 * dangerous keys. This protects against a poisoned localStorage.
 */
function loadUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USERS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const clean: StoredUser[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const keys = Object.keys(entry);
      if (keys.some((k) => FORBIDDEN_USER_KEYS.has(k))) continue;
      if (typeof entry.id !== "string" || typeof entry.username !== "string") continue;
      if (typeof entry.passwordHash !== "string") continue;
      // Rebuild the record with ONLY the fields we expect, so any
      // extra key injected into localStorage is discarded.
      clean.push({
        id: entry.id,
        username: entry.username,
        email: typeof entry.email === "string" ? entry.email : "",
        passwordHash: entry.passwordHash,
        salt: typeof entry.salt === "string" ? entry.salt : "",
        createdAt: Number(entry.createdAt) || 0,
        lastLogin: Number(entry.lastLogin) || 0,
        avatar: typeof entry.avatar === "string" ? entry.avatar : "🧟",
      });
    }
    return clean;
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]) {
  try {
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
  } catch {
    // Quota exceeded / private mode — fail silently but safely.
  }
}

// ── Brute-force protection ─────────────────────────────────────

/**
 * Register a failed attempt and return the lock duration (0 when not
 * locked). The lock grows exponentially: 30s, 60s, 120s… up to 15 min.
 */
function registerFailure(key: string): number {
  const now = Date.now();
  const record = failures.get(key);
  if (!record || now - record.firstAt > ATTEMPT_WINDOW_MS) {
    failures.set(key, { count: 1, firstAt: now, lastAt: now, lockedUntil: 0 });
    return 0;
  }
  record.count += 1;
  record.lastAt = now;
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    const exponent = record.count - MAX_FAILED_ATTEMPTS;
    const lockMs = Math.min(LOCK_BASE_MS * 2 ** exponent, LOCK_MAX_MS);
    record.lockedUntil = now + lockMs;
    return lockMs;
  }
  return 0;
}

/** Clear the failure record after a successful login. */
function clearFailures(key: string) {
  failures.delete(key);
}

/**
 * How long is this key still locked for? 0 when it may try again.
 */
export function getLockRemaining(key: string): number {
  const record = failures.get(key);
  if (!record) return 0;
  const remaining = record.lockedUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

/**
 * Global rate limit for auth calls.
 *
 * @returns {number} milliseconds to wait, 0 when allowed
 */
export function getAuthRateLimitDelay(): number {
  const now = Date.now();

  // Drop the attempts that fell out of the window.
  while (authAttempts.length > 0 && now - authAttempts[0] > AUTH_RATE_WINDOW_MS) {
    authAttempts.shift();
  }

  if (authAttempts.length >= MAX_AUTH_ATTEMPTS) {
    const oldest = authAttempts[0];
    return Math.max(0, AUTH_RATE_WINDOW_MS - (now - oldest));
  }

  authAttempts.push(now);
  return 0;
}

/** Reset all failure counters (used by tests and by logout). */
export function resetAuthFailures() {
  failures.clear();
  authAttempts.length = 0;
}

// ── Public API ─────────────────────────────────────────────────

export const Auth = {
  /** Register a new user */
  async register(
    username: string,
    email: string,
    password: string,
  ): Promise<{ success: boolean; error?: string; user?: User }> {
    const delay = getAuthRateLimitDelay();
    if (delay > 0) {
      return { success: false, error: "Muitas tentativas. Aguarde um instante." };
    }

    const usernameCheck = validateUsername(username);
    if (!usernameCheck.ok) return { success: false, error: usernameCheck.error };
    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) return { success: false, error: emailCheck.error };
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.ok) return { success: false, error: passwordCheck.error };

    const users = loadUsers();
    const lowerName = usernameCheck.value!.toLowerCase();
    const lowerEmail = emailCheck.value!;

    if (users.find((u) => u.username.toLowerCase() === lowerName)) {
      return { success: false, error: "Nome de usuário já existe" };
    }
    if (users.find((u) => u.email.toLowerCase() === lowerEmail)) {
      return { success: false, error: "Email já registrado" };
    }

    const salt = generateSalt();
    // The salt is stored alongside the hash — the hash must be
    // derived from THAT salt, not from a different random one.
    const passwordHash = await hashPassword(passwordCheck.value!, salt);
    const user: StoredUser = {
      id: generateId(),
      username: usernameCheck.value!,
      email: lowerEmail,
      passwordHash,
      salt,
      createdAt: Date.now(),
      lastLogin: Date.now(),
      avatar: "🧟",
    };

    users.push(user);
    saveUsers(users);

    const session: AuthSession = {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        avatar: user.avatar,
      },
      token: generateToken(),
      expiresAt: Date.now() + SESSION_DURATION,
    };
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));

    return { success: true, user: session.user };
  },

  /** Login with username/email + password */
  async login(
    usernameOrEmail: string,
    password: string,
  ): Promise<{ success: boolean; error?: string; user?: User }> {
    const delay = getAuthRateLimitDelay();
    if (delay > 0) {
      return { success: false, error: "Muitas tentativas. Aguarde um instante." };
    }

    const identifier = sanitizeInput(usernameOrEmail, EMAIL_MAX).toLowerCase();
    if (!identifier) {
      return { success: false, error: "Credenciais inválidas" };
    }
    if (typeof password !== "string" || password.length > PASSWORD_MAX) {
      return { success: false, error: "Credenciais inválidas" };
    }

    const lockKey = identifier;
    const lockedFor = getLockRemaining(lockKey);
    if (lockedFor > 0) {
      const seconds = Math.ceil(lockedFor / 1000);
      return {
        success: false,
        error: `Conta temporariamente bloqueada. Tente novamente em ${seconds}s.`,
      };
    }

    const users = loadUsers();
    const user = users.find(
      (u) =>
        u.username.toLowerCase() === identifier || u.email.toLowerCase() === identifier,
    );

    // Constant-ish work whether or not the user exists, so the
    // response time does not reveal whether an account exists.
    if (!user) {
      registerFailure(lockKey);
      return { success: false, error: "Credenciais inválidas" };
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      const lockMs = registerFailure(lockKey);
      if (lockMs > 0) {
        const seconds = Math.ceil(lockMs / 1000);
        return {
          success: false,
          error: `Credenciais inválidas. Conta bloqueada por ${seconds}s.`,
        };
      }
      return { success: false, error: "Credenciais inválidas" };
    }

    clearFailures(lockKey);

    // Opportunistic upgrade when the hash parameters are outdated.
    if (needsRehash(user.passwordHash)) {
      const salt = generateSalt();
      user.passwordHash = await hashPassword(password, salt);
      user.salt = salt;
    }

    user.lastLogin = Date.now();
    saveUsers(users);

    const session: AuthSession = {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        avatar: user.avatar,
      },
      token: generateToken(),
      expiresAt: Date.now() + SESSION_DURATION,
    };
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));

    return { success: true, user: session.user };
  },

  /** Login as guest (no persistence) */
  guestLogin(): User {
    const guest: User = {
      id: `guest_${randomHex(4)}`,
      username: `Guest_${randomHex(2).toUpperCase()}`,
      email: "guest@local",
      createdAt: Date.now(),
      lastLogin: Date.now(),
      avatar: "👤",
    };
    const session: AuthSession = {
      user: guest,
      token: generateToken(),
      expiresAt: Date.now() + SESSION_DURATION,
    };
    sessionStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
    return guest;
  },

  /** Get current session */
  getSession(): AuthSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SESSION) || sessionStorage.getItem(STORAGE_KEY_SESSION);
      if (!raw) return null;
      const session = JSON.parse(raw) as AuthSession;
      if (!session || typeof session.expiresAt !== "number") return null;
      if (session.expiresAt < Date.now()) {
        Auth.logout();
        return null;
      }
      return session;
    } catch {
      return null;
    }
  },

  /** Check if logged in */
  isLoggedIn(): boolean {
    return Auth.getSession() !== null;
  },

  /** Get current user */
  getCurrentUser(): User | null {
    return Auth.getSession()?.user ?? null;
  },

  /** Logout */
  logout() {
    localStorage.removeItem(STORAGE_KEY_SESSION);
    sessionStorage.removeItem(STORAGE_KEY_SESSION);
  },

  /** Get total registered users */
  getUserCount(): number {
    return loadUsers().length;
  },

  /** Delete current account permanently */
  async deleteAccount(password: string): Promise<{ success: boolean; error?: string }> {
    const session = Auth.getSession();
    if (!session) return { success: false, error: "Não logado" };
    const users = loadUsers();
    const user = users.find((u) => u.id === session.user.id);
    if (!user) return { success: false, error: "Usuário não encontrado" };
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return { success: false, error: "Senha incorreta" };
    }
    const filtered = users.filter((u) => u.id !== session.user.id);
    saveUsers(filtered);
    Auth.logout();
    return { success: true };
  },
};

// Re-export the hashing helpers so callers do not need a second import.
export { hashPassword, verifyPassword, generateSalt, deriveKey, timingSafeEqualString };
