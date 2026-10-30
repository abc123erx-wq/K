// ═══════════════════════════════════════════════════════════════
//  SECURITY TESTS — hashing, validação, rate limit, headers
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateSalt,
  deriveKey,
  needsRehash,
  timingSafeEqualString,
  PBKDF2_ITERATIONS,
} from "@/game/passwordHash";
import {
  sanitizeInput,
  validateUsername,
  validateEmail,
  validatePassword,
  getAuthRateLimitDelay,
  resetAuthFailures,
  getLockRemaining,
  Auth,
} from "@/game/auth";
import { isAuthorizedPanelUsername } from "@/game/panelAccess";

describe("password hashing (PBKDF2)", () => {
  it("produces a salted hash with the expected format", async () => {
    const hash = await hashPassword("minhaSenha123");
    const parts = hash.split("$");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("pbkdf2_sha256");
    expect(Number(parts[1])).toBe(PBKDF2_ITERATIONS);
    expect(parts[2].length).toBeGreaterThanOrEqual(16);
    expect(parts[3].length).toBeGreaterThanOrEqual(32);
  });

  it("never stores the plaintext password", async () => {
    const hash = await hashPassword("minhaSenha123");
    expect(hash).not.toContain("minhaSenha123");
  });

  it("uses a different salt for every hash", async () => {
    const a = await hashPassword("mesmaSenha");
    const b = await hashPassword("mesmaSenha");
    expect(a).not.toBe(b);
    // …but both verify the same password.
    expect(await verifyPassword("mesmaSenha", a)).toBe(true);
    expect(await verifyPassword("mesmaSenha", b)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("senhaCorreta");
    expect(await verifyPassword("senhaErrada", hash)).toBe(false);
  });

  it("rejects a malformed hash instead of throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2_sha256$abc$salt$hash")).toBe(false);
    expect(await verifyPassword("x", "md5$1$salt$hash")).toBe(false);
  });

  it("rejects an absurd iteration count (DoS guard)", async () => {
    const salt = generateSalt();
    const derived = await deriveKey("x", salt, 1000);
    const evil = `pbkdf2_sha256$999999999$${salt}$${derived}`;
    expect(await verifyPassword("x", evil)).toBe(false);
  });

  it("detects a hash that needs rehashing", async () => {
    const salt = generateSalt();
    const weak = await deriveKey("x", salt, 1000);
    expect(needsRehash(`pbkdf2_sha256$1000$${salt}$${weak}`)).toBe(true);
    expect(needsRehash(await hashPassword("x"))).toBe(false);
  });

  it("compares strings in constant time", () => {
    expect(timingSafeEqualString("abc", "abc")).toBe(true);
    expect(timingSafeEqualString("abc", "abd")).toBe(false);
    expect(timingSafeEqualString("abc", "abcd")).toBe(false);
  });
});

describe("input validation", () => {
  it("strips control characters", () => {
    expect(sanitizeInput("abc\u0000\u0007def", 100)).toBe("abcdef");
    expect(sanitizeInput("  spaced  ", 100)).toBe("spaced");
  });

  it("truncates over-long input", () => {
    expect(sanitizeInput("x".repeat(500), 100)).toHaveLength(100);
  });

  it("rejects a username that is too short", () => {
    expect(validateUsername("ab").ok).toBe(false);
  });

  it("accepts a normal username", () => {
    const r = validateUsername("SurvivorPro");
    expect(r.ok).toBe(true);
    expect(r.value).toBe("SurvivorPro");
  });

  it("rejects a username with html/script characters", () => {
    expect(validateUsername("<script>alert(1)</script>").ok).toBe(false);
    expect(validateUsername("user'; DROP TABLE users;--").ok).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(validateEmail("not-an-email").ok).toBe(false);
    expect(validateEmail("a@b").ok).toBe(false);
    expect(validateEmail("a b@example.com").ok).toBe(false);
    expect(validateEmail("player@example.com").ok).toBe(true);
  });

  it("requires a minimum password length", () => {
    expect(validatePassword("curta").ok).toBe(false);
    expect(validatePassword("longenough1").ok).toBe(true);
  });

  it("rejects an over-long password", () => {
    expect(validatePassword("x".repeat(500)).ok).toBe(false);
  });
});

describe("brute-force protection", () => {
  beforeEach(() => {
    resetAuthFailures();
    localStorage.clear();
  });

  it("blocks repeated login attempts with a growing lock", async () => {
    // Register a real account.
    const reg = await Auth.register("tester", "tester@example.com", "senhaForte123");
    expect(reg.success).toBe(true);

    // Five wrong passwords → the account gets locked.
    for (let i = 0; i < 5; i++) {
      const res = await Auth.login("tester", "senhaErrada");
      expect(res.success).toBe(false);
    }
    const remaining = getLockRemaining("tester");
    expect(remaining).toBeGreaterThan(0);

    // Even the CORRECT password is refused while locked.
    const blocked = await Auth.login("tester", "senhaForte123");
    expect(blocked.success).toBe(false);
    expect(blocked.error).toMatch(/bloqueada/i);
  });

  it("does not reveal whether an account exists", async () => {
    const missing = await Auth.login("naoexiste", "qualquer123");
    expect(missing.error).toBe("Credenciais inválidas");

    await Auth.register("existe", "existe@example.com", "senhaForte123");
    const wrong = await Auth.login("existe", "senhaErrada123");
    expect(wrong.error).toBe("Credenciais inválidas");
  });

  it("allows a burst of attempts before the rate limit kicks in", () => {
    resetAuthFailures();
    // The first calls go through — a legitimate user who presses
    // Enter twice must not be blocked.
    for (let i = 0; i < 5; i++) {
      expect(getAuthRateLimitDelay()).toBe(0);
    }
  });

  it("blocks once the sliding window is exhausted", () => {
    resetAuthFailures();
    let delayed = 0;
    for (let i = 0; i < 20; i++) {
      if (getAuthRateLimitDelay() > 0) delayed++;
    }
    expect(delayed).toBeGreaterThan(0);
  });

  it("lets the correct password through when not locked", async () => {
    const reg = await Auth.register("okuser", "ok@example.com", "senhaForte123");
    expect(reg.success).toBe(true);
    const login = await Auth.login("okuser", "senhaForte123");
    expect(login.success).toBe(true);
    expect(login.user?.username).toBe("okuser");
  });
});

describe("stored user records", () => {
  beforeEach(() => {
    resetAuthFailures();
    localStorage.clear();
  });

  it("never stores the plaintext password", async () => {
    await Auth.register("safeuser", "safe@example.com", "senhaSuperSecreta");
    const raw = localStorage.getItem("knox-users") ?? "";
    expect(raw).not.toContain("senhaSuperSecreta");
  });

  it("does not persist role/permission fields on the user record", async () => {
    await Auth.register("norole", "norole@example.com", "senhaForte123");
    const users = JSON.parse(localStorage.getItem("knox-users") ?? "[]");
    for (const user of users) {
      expect(user.isAdmin).toBeUndefined();
      expect(user.role).toBeUndefined();
      expect(user.permissions).toBeUndefined();
    }
  });

  it("drops a poisoned user record that carries privilege fields", async () => {
    localStorage.setItem(
      "knox-users",
      JSON.stringify([
        { id: "usr_evil", username: "evil", email: "e@e.com", passwordHash: "x", isAdmin: true },
      ]),
    );
    expect(Auth.getUserCount()).toBe(0);
  });
});

describe("panel authorization has no client-side name list", () => {
  it("does not ship an allowlist of usernames", () => {
    // The client must not decide who is allowed — the server does.
    expect(isAuthorizedPanelUsername("RimuOfc")).toBe(false);
    expect(isAuthorizedPanelUsername("guisdfas")).toBe(false);
    expect(isAuthorizedPanelUsername("qualquer")).toBe(false);
  });

  it("contains no admin display name in the client sources", async () => {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const files = [
      "src/game/panelAccess.ts",
      "src/game/adminAccess.ts",
      "src/game/security.ts",
      "src/App.tsx",
    ];
    for (const file of files) {
      const content = await readFile(path.resolve(process.cwd(), file), "utf8");
      expect(content).not.toContain("RimuOfc");
      expect(content).not.toContain("Guisdfas");
    }
  });
});
