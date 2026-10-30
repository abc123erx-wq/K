// ═══════════════════════════════════════════════════════════════
//  TESTS — WebSocket flow (admin auth + panel spawn)
//
//  Exercises the socket protocol end-to-end: a player connects,
//  authenticates as an admin account and requests a spawn for
//  another connected player.
// ═══════════════════════════════════════════════════════════════

// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";

const PORT = 8400 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}`;

let server;

beforeAll(async () => {
  server = spawn(process.execPath, ["ws-server.mjs"], {
    cwd: path.resolve(process.cwd(), "server"),
    env: {
      ...process.env,
      PORT: String(PORT),
      ADMIN_ACCOUNT_IDS: "usr_rimu,usr_t1",
      ADMIN_ACCOUNT_NAMES: JSON.stringify({
        RimuOfc: "usr_rimu",
        TestOne: "usr_t1",
      }),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", () => {});
  server.stderr?.on("data", () => {});

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

/**
 * Open a socket and wait until it receives a message of the given type.
 * Uses the WebSocket client built into Node 22 (no extra dependency).
 */
function openSocket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const inbox = [];
    const waiters = [];

    ws.addEventListener("message", (event) => {
      let msg;
      try { msg = JSON.parse(typeof event.data === "string" ? event.data : String(event.data)); } catch { return; }
      inbox.push(msg);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].predicate(msg)) {
          const waiter = waiters[i];
          waiters.splice(i, 1);
          clearTimeout(waiter.timer);
          waiter.resolve(msg);
        }
      }
    });

    const waitFor = (predicate, timeoutMs = 5000) =>
      new Promise((res, rej) => {
        const existing = inbox.find(predicate);
        if (existing) return res(existing);
        const waiter = { predicate, resolve: res };
        waiter.timer = setTimeout(() => {
          const idx = waiters.indexOf(waiter);
          if (idx >= 0) waiters.splice(idx, 1);
          rej(new Error("timed out waiting for a socket message"));
        }, timeoutMs);
        waiters.push(waiter);
      });

    ws.addEventListener("error", () => reject(new Error("socket error")));
    ws.addEventListener("open", () => resolve({ ws, waitFor, inbox }));
  });
}

describe("websocket admin + panel flow", () => {
  it("assigns a session id on connect", async () => {
    const { ws, waitFor } = await openSocket();
    const assigned = await waitFor((m) => m.type === "assignId");
    expect(assigned.id).toMatch(/^srv-/);
    ws.close();
  });

  it("grants admin auth to the authorized account", async () => {
    const { ws, waitFor } = await openSocket();
    ws.send(JSON.stringify({
      type: "admin-auth",
      accountId: "usr_rimu",
      displayName: "RimuOfc",
    }));
    const result = await waitFor((m) => m.type === "admin-auth-result");
    expect(result.granted).toBe(true);
    expect(typeof result.token).toBe("string");
    expect(Array.isArray(result.spawnable)).toBe(true);
    ws.close();
  });

  it("denies admin auth to an unauthorized account", async () => {
    const { ws, waitFor } = await openSocket();
    ws.send(JSON.stringify({
      type: "admin-auth",
      accountId: "usr_attacker",
      displayName: "RimuOfc",
    }));
    const result = await waitFor((m) => m.type === "admin-auth-result");
    expect(result.granted).toBe(false);
    expect(result.token).toBeUndefined();
    ws.close();
  });

  it("denies admin auth when the name does not match the bound account", async () => {
    const { ws, waitFor } = await openSocket();
    ws.send(JSON.stringify({
      type: "admin-auth",
      accountId: "usr_rimu",
      displayName: "TestOne",
    }));
    const result = await waitFor((m) => m.type === "admin-auth-result");
    expect(result.granted).toBe(false);
    ws.close();
  });

  it("rejects a panel spawn without a session token", async () => {
    const { ws, waitFor } = await openSocket();
    ws.send(JSON.stringify({
      type: "panel-spawn",
      effectId: "zombie_scavenger",
      targetId: "srv-nobody",
    }));
    const result = await waitFor((m) => m.type === "panel-spawn-result");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("sem-permissao");
    ws.close();
  });

  it("spawns near a connected target and replicates to the room", async () => {
    // The admin connects first.
    const admin = await openSocket();
    const adminId = (await admin.waitFor((m) => m.type === "assignId")).id;

    // The target player connects and joins with a position.
    const target = await openSocket();
    const targetId = (await target.waitFor((m) => m.type === "assignId")).id;
    target.ws.send(JSON.stringify({
      type: "join",
      id: targetId,
      name: "Alvo",
      x: 5000,
      y: 5000,
      angle: 0,
      health: 100,
      kills: 0,
      ts: Date.now(),
    }));

    // Give the server a moment to register the target.
    await new Promise((r) => setTimeout(r, 250));

    // The admin authenticates.
    admin.ws.send(JSON.stringify({
      type: "admin-auth",
      accountId: "usr_t1",
      displayName: "TestOne",
    }));
    const auth = await admin.waitFor((m) => m.type === "admin-auth-result");
    expect(auth.granted).toBe(true);

    // The admin requests a spawn near the target.
    admin.ws.send(JSON.stringify({
      type: "panel-spawn",
      token: auth.token,
      effectId: "zombie_scavenger",
      targetId,
      room: "global",
    }));

    const result = await admin.waitFor((m) => m.type === "panel-spawn-result");
    expect(result.ok).toBe(true);
    expect(result.effectId).toBe("zombie_scavenger");
    expect(result.targetId).toBe(targetId);
    expect(result.targetName).toBe("Alvo");
    expect(result.positions.length).toBeGreaterThan(0);

    // The target receives the replicated effect.
    const replicated = await target.waitFor((m) => m.type === "panel-effect");
    expect(replicated.effectId).toBe("zombie_scavenger");
    expect(replicated.targetId).toBe(targetId);

    // Every position is near the target and outside the target's body.
    for (const pos of result.positions) {
      const distance = Math.hypot(pos.x - 5000, pos.y - 5000);
      expect(distance).toBeGreaterThan(2.5);
      expect(distance).toBeLessThan(20);
    }

    admin.ws.close();
    target.ws.close();
  });

  it("scopes the target list to the requested room", async () => {
    const admin = await openSocket();
    const adminId = (await admin.waitFor((m) => m.type === "assignId")).id;

    // A player joins room "alpha".
    const inAlpha = await openSocket();
    const alphaId = (await inAlpha.waitFor((m) => m.type === "assignId")).id;
    inAlpha.ws.send(JSON.stringify({
      type: "join", id: alphaId, name: "Alfa", x: 5000, y: 5000, angle: 0,
      health: 100, kills: 0, ts: Date.now(), room: "alpha",
    }));

    // Another player joins room "beta".
    const inBeta = await openSocket();
    const betaId = (await inBeta.waitFor((m) => m.type === "assignId")).id;
    inBeta.ws.send(JSON.stringify({
      type: "join", id: betaId, name: "Beta", x: 5000, y: 5000, angle: 0,
      health: 100, kills: 0, ts: Date.now(), room: "beta",
    }));

    await new Promise((r) => setTimeout(r, 300));

    admin.ws.send(JSON.stringify({
      type: "admin-auth", accountId: "usr_rimu", displayName: "RimuOfc",
    }));
    const auth = await admin.waitFor((m) => m.type === "admin-auth-result");
    expect(auth.granted).toBe(true);

    const res = await fetch(`${BASE}/panel/players?room=alpha`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    const data = await res.json();
    expect(data.ok).toBe(true);
    const names = data.players.map((p) => p.name);
    expect(names).toContain("Alfa");
    expect(names).not.toContain("Beta");

    admin.ws.close();
    inAlpha.ws.close();
    inBeta.ws.close();
  });

  it("rejects a spawn for a target that disconnected", async () => {
    const admin = await openSocket();
    const adminId = (await admin.waitFor((m) => m.type === "assignId")).id;

    const target = await openSocket();
    const targetId = (await target.waitFor((m) => m.type === "assignId")).id;
    target.ws.send(JSON.stringify({
      type: "join",
      id: targetId,
      name: "Sai",
      x: 5010,
      y: 5010,
      angle: 0,
      health: 100,
      kills: 0,
      ts: Date.now(),
    }));
    await new Promise((r) => setTimeout(r, 250));

    admin.ws.send(JSON.stringify({
      type: "admin-auth",
      accountId: "usr_rimu",
      displayName: "RimuOfc",
    }));
    const auth = await admin.waitFor((m) => m.type === "admin-auth-result");

    // The target leaves before the command is sent.
    target.ws.close();
    await new Promise((r) => setTimeout(r, 300));

    admin.ws.send(JSON.stringify({
      type: "panel-spawn",
      token: auth.token,
      effectId: "zombie_scavenger",
      targetId,
      room: "global",
    }));

    const result = await admin.waitFor((m) => m.type === "panel-spawn-result");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("alvo-desconectado");
    admin.ws.close();
  });
});
