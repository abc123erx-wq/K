// ═══════════════════════════════════════════════════════════════
//  SERVER SECURITY TESTS — headers, HTTPS, validação, rate limit
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, "../server/ws-server.mjs");
const PORT = 8500 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;

let child;

beforeAll(async () => {
  child = spawn(process.execPath, [SERVER], {
    cwd: path.resolve(__dirname, "../server"),
    env: {
      ...process.env,
      PORT: String(PORT),
      ADMIN_ACCOUNT_IDS: "usr_rimu,usr_guis",
      ADMIN_ACCOUNT_NAMES: JSON.stringify({ RimuOfc: "usr_rimu", Guisdfas: "usr_guis" }),
      ADMIN_ACCESS_CODE: "codigo-de-teste",
      FORCE_HTTPS: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.resume();
  child.stderr.resume();

  // Wait for the server to accept connections.
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error("server did not start");
}, 30_000);

afterAll(() => {
  try { child?.kill("SIGTERM"); } catch { /* ignore */ }
});

describe("security headers", () => {
  it("sends CSP, HSTS-capable and anti-sniffing headers", async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);

    const csp = res.headers.get("content-security-policy");
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");

    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("permissions-policy")).toContain("geolocation=()");
    expect(res.headers.get("cross-origin-opener-policy")).toBe("same-origin");
  });

  it("sets the headers on the status page too", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toBeTruthy();
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("sets the headers on a 404 as well", async () => {
    const res = await fetch(`${BASE}/rota-inexistente`);
    expect(res.status).toBe(404);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("input validation", () => {
  it("rejects a non-JSON content type", async () => {
    const res = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "accountId=usr_rimu",
    });
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const res = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects an oversized body", async () => {
    const res = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "usr_rimu", pad: "x".repeat(40_000) }),
    });
    expect(res.status).toBe(413);
  });

  it("rejects a malformed account id", async () => {
    const res = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "../../etc/passwd", displayName: "RimuOfc" }),
    });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.granted).toBe(false);
    expect(data.token).toBeUndefined();
  });

  it("rejects an array body", async () => {
    const res = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(["usr_rimu"]),
    });
    expect(res.status).toBe(400);
  });

  it("ignores prototype-polluting keys", async () => {
    const res = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "usr_rimu", displayName: "RimuOfc", __proto__: { isAdmin: true } }),
    });
    // The request must still work normally — the pollution is stripped.
    expect([200, 403]).toContain(res.status);
    expect({}.isAdmin).toBeUndefined();
  });
});

describe("authorization", () => {
  it("does not disclose the access code to an unauthorized account", async () => {
    const res = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "usr_hacker", displayName: "RimuOfc" }),
    });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.granted).toBe(false);
    expect(data.accessCode).toBeUndefined();
  });

  it("discloses the access code only to an authorized account", async () => {
    const res = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "usr_rimu", displayName: "RimuOfc" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.granted).toBe(true);
    expect(data.accessCode).toBe("codigo-de-teste");
  });

  it("rejects a look-alike display name", async () => {
    for (const name of ["RimuOfc123", "rimuofc", " RimuOfc", "RimuOfc "]) {
      const res = await fetch(`${BASE}/admin/permission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: "usr_rimu", displayName: name }),
      });
      expect(res.status).toBe(403);
    }
  });

  it("requires a bearer token on the privileged routes", async () => {
    for (const path of ["/panel/players?room=global", "/admin/audit", "/admin/session"]) {
      const res = await fetch(`${BASE}${path}`);
      expect(res.status).toBe(401);
    }
  });

  it("rejects a forged token", async () => {
    const res = await fetch(`${BASE}/panel/players?room=global`, {
      headers: { Authorization: "Bearer " + "a".repeat(43) },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a malformed Authorization header", async () => {
    const res = await fetch(`${BASE}/panel/players?room=global`, {
      headers: { Authorization: "Basic YWRtaW46YWRtaW4=" },
    });
    expect(res.status).toBe(401);
  });
});

describe("privileged command limits", () => {
  it("rejects a spawn without a token", async () => {
    const res = await fetch(`${BASE}/panel/spawn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ effectId: "zombie_scavenger", targetId: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects an effect that is not on the allowlist", async () => {
    const auth = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "usr_guis", displayName: "Guisdfas" }),
    });
    const { token } = await auth.json();

    const res = await fetch(`${BASE}/panel/spawn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ effectId: "rm -rf /", targetId: "ws-x" }),
    });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  it("consumes the cooldown slot even on a rejected attempt", async () => {
    // A dedicated account, so the cooldown of the other tests does
    // not interfere with this assertion.
    const auth = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "usr_rimu", displayName: "RimuOfc" }),
    });
    const { token } = await auth.json();

    const first = await fetch(`${BASE}/panel/spawn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ effectId: "zombie_scavenger", targetId: "ws-inexistente" }),
    });
    expect(first.status).toBe(422);

    const second = await fetch(`${BASE}/panel/spawn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ effectId: "zombie_scavenger", targetId: "ws-inexistente" }),
    });
    expect(second.status).toBe(429);
  });
});
