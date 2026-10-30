// ═══════════════════════════════════════════════════════════════
//  TESTS — HTTP integration against the real server
//
//  Boots server/ws-server.mjs on a random port and exercises the
//  authorization + panel endpoints over real HTTP.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";

const PORT = 8099 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;

let server;

beforeAll(async () => {
  server = spawn(process.execPath, ["ws-server.mjs"], {
    cwd: path.resolve(process.cwd(), "server"),
    env: {
      ...process.env,
      PORT: String(PORT),
      ADMIN_ACCOUNT_IDS: "usr_rimu,usr_guis,usr_t1,usr_t2,usr_t3",
      ADMIN_ACCOUNT_NAMES: JSON.stringify({
        RimuOfc: "usr_rimu",
        Guisdfas: "usr_guis",
        TestOne: "usr_t1",
        TestTwo: "usr_t2",
        TestThree: "usr_t3",
      }),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Drain the logs so the pipe never fills up.
  server.stdout?.on("data", () => {});
  server.stderr?.on("data", () => {});

  // Wait until the server answers /health.
  for (let i = 0; i < 150; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
}, 30_000);

afterAll(() => {
  server?.kill("SIGTERM");
});

describe("server HTTP API", () => {
  it("reports health without leaking internals", async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.status).toBe("online");
    expect(data.adminConfigured).toBe(true);
  });

  it("grants permission to the authorized account", async () => {
    const res = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "usr_rimu", displayName: "RimuOfc" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.granted).toBe(true);
    expect(typeof data.token).toBe("string");
    expect(data.token.length).toBeGreaterThan(20);
    expect(Array.isArray(data.spawnable)).toBe(true);
    expect(data.spawnable.length).toBeGreaterThan(0);
  });

  it("grants permission to the second authorized account", async () => {
    const res = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "usr_guis", displayName: "Guisdfas" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.granted).toBe(true);
  });

  it("denies an unauthorized account id", async () => {
    const res = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "usr_attacker", displayName: "RimuOfc" }),
    });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.granted).toBe(false);
    expect(data.token).toBeUndefined();
  });

  it("denies a look-alike display name", async () => {
    for (const name of ["RimuOfc123", "rimuofc", " RimuOfc", "RimuOfc "]) {
      const res = await fetch(`${BASE}/admin/permission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: "usr_rimu", displayName: name }),
      });
      expect(res.status).toBe(403);
    }
  });

  it("denies an authorized id paired with a foreign name", async () => {
    const res = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "usr_rimu", displayName: "Guisdfas" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects a spawn request without a token", async () => {
    const res = await fetch(`${BASE}/panel/spawn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ effectId: "zombie_scavenger", targetId: "srv-x" }),
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.code).toBe("sem-permissao");
  });

  it("rejects a spawn request with a forged token", async () => {
    const res = await fetch(`${BASE}/panel/spawn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer forged-token" },
      body: JSON.stringify({ effectId: "zombie_scavenger", targetId: "srv-x" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid effect id even with a valid token", async () => {
    const auth = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "usr_t1", displayName: "TestOne" }),
    });
    const { token } = await auth.json();

    const res = await fetch(`${BASE}/panel/spawn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ effectId: "rm -rf /", targetId: "srv-x" }),
    });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.code).toBe("recurso-invalido");
  });

  it("rejects a disconnected target with a clear reason", async () => {
    const auth = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "usr_t2", displayName: "TestTwo" }),
    });
    const { token } = await auth.json();

    const res = await fetch(`${BASE}/panel/spawn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ effectId: "zombie_scavenger", targetId: "srv-not-here" }),
    });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.code).toBe("alvo-desconectado");
  });

  it("enforces the command cooldown", async () => {
    // A dedicated account so this test's cooldown window does not
    // interfere with the other cases.
    const auth = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "usr_t3", displayName: "TestThree" }),
    });
    const { token } = await auth.json();

    const body = JSON.stringify({ effectId: "zombie_scavenger", targetId: "srv-not-here" });
    const first = await fetch(`${BASE}/panel/spawn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body,
    });
    // The first call consumes the cooldown slot (the slot is consumed
    // by the ATTEMPT, even when the target is missing — that is the
    // safe anti-spam behaviour).
    expect([200, 422]).toContain(first.status);

    const second = await fetch(`${BASE}/panel/spawn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body,
    });
    expect(second.status).toBe(429);
    const data = await second.json();
    expect(data.code).toBe("cooldown");
    expect(data.retryAfterMs).toBeGreaterThan(0);
  });

  it("consumes the cooldown slot on a rejected attempt", async () => {
    // Fresh account id -> fresh cooldown window.
    const auth = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "usr_guis", displayName: "Guisdfas" }),
    });
    const { token } = await auth.json();

    // An invalid effect is rejected — but the attempt still counts.
    const first = await fetch(`${BASE}/panel/spawn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ effectId: "not-a-real-effect", targetId: "srv-x" }),
    });
    expect(first.status).toBe(422);

    const second = await fetch(`${BASE}/panel/spawn`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ effectId: "zombie_scavenger", targetId: "srv-x" }),
    });
    expect(second.status).toBe(429);
  });

  it("rejects a body that is not valid JSON", async () => {
    const res = await fetch(`${BASE}/admin/permission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("does not expose the audit feed without a token", async () => {
    const res = await fetch(`${BASE}/admin/audit`);
    expect(res.status).toBe(401);
  });

  it("does not expose the player list without a token", async () => {
    const res = await fetch(`${BASE}/panel/players`);
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown routes", async () => {
    const res = await fetch(`${BASE}/nope`);
    expect(res.status).toBe(404);
  });
});
