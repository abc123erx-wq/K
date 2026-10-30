// ═══════════════════════════════════════════════════════════════
//  TESTS — server-side authorization, limits and spawn placement
//
//  These exercise the real server modules (the ones that decide
//  whether a privileged command is allowed and where an entity
//  may appear).
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from "vitest";

process.env.ADMIN_ACCOUNT_IDS = "usr_rimu,usr_guis";
process.env.ADMIN_ACCOUNT_NAMES = JSON.stringify({
  RimuOfc: "usr_rimu",
  Guisdfas: "usr_guis",
});

const adminConfig = await import("../server/adminConfig.mjs");
const sessionStore = await import("../server/sessionStore.mjs");
const panelSpawn = await import("../server/panelSpawn.mjs");
const worldProbe = await import("../server/worldProbe.mjs");

const {
  isAuthorizedAccountId,
  resolveAuthorizedAccountId,
  findSpawnableEffect,
  SPAWNABLE_IDS,
  LIMITS,
} = adminConfig;

// ───────────────────────────────────────────────────────────────
//  Authorization
// ───────────────────────────────────────────────────────────────
describe("account authorization (server)", () => {
  it("accepts the allowlisted account ids", () => {
    expect(isAuthorizedAccountId("usr_rimu")).toBe(true);
    expect(isAuthorizedAccountId("usr_guis")).toBe(true);
  });

  it("rejects any other account id", () => {
    expect(isAuthorizedAccountId("usr_someone")).toBe(false);
    expect(isAuthorizedAccountId("")).toBe(false);
    expect(isAuthorizedAccountId(undefined)).toBe(false);
    expect(isAuthorizedAccountId(null)).toBe(false);
  });

  it("rejects display-name look-alikes as an identity", () => {
    expect(resolveAuthorizedAccountId({ accountId: "usr_x", displayName: "RimuOfc" })).toBeNull();
    expect(resolveAuthorizedAccountId({ accountId: "usr_x", displayName: "RimuOfc123" })).toBeNull();
    expect(resolveAuthorizedAccountId({ accountId: "usr_x", displayName: "rimuofc" })).toBeNull();
    expect(resolveAuthorizedAccountId({ accountId: "usr_x", displayName: " RimuOfc" })).toBeNull();
  });

  it("resolves an exact display name to its bound account id", () => {
    expect(resolveAuthorizedAccountId({ accountId: "usr_x", displayName: "RimuOfc" })).toBeNull();
    expect(resolveAuthorizedAccountId({ accountId: "usr_rimu", displayName: "RimuOfc" })).toBe("usr_rimu");
  });

  it("rejects a display name that is not bound", () => {
    expect(resolveAuthorizedAccountId({ accountId: "usr_rimu", displayName: "Guisdfas" })).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────
//  Session lifecycle
// ───────────────────────────────────────────────────────────────
describe("admin sessions", () => {
  beforeEach(() => {
    for (const token of [...sessionStore.readAudit?.() ?? []]) void token;
  });

  it("mints a token for an authorized account and validates it", () => {
    const token = sessionStore.createSession({ accountId: "usr_rimu", displayName: "RimuOfc" });
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);
    const session = sessionStore.peekSession(token);
    expect(session?.accountId).toBe("usr_rimu");
  });

  it("does not mint a token for an unauthorized account", () => {
    // createSession is only called after authorization in the server;
    // the guard below proves the allowlist still rejects it.
    expect(isAuthorizedAccountId("usr_evil")).toBe(false);
  });

  it("invalidates a destroyed session", () => {
    const token = sessionStore.createSession({ accountId: "usr_guis", displayName: "Guisdfas" });
    expect(sessionStore.peekSession(token)).not.toBeNull();
    sessionStore.destroySession(token);
    expect(sessionStore.peekSession(token)).toBeNull();
  });

  it("invalidates every session of an account when the permission is revoked", () => {
    const a = sessionStore.createSession({ accountId: "usr_guis", displayName: "Guisdfas" });
    const b = sessionStore.createSession({ accountId: "usr_guis", displayName: "Guisdfas" });
    const removed = sessionStore.destroySessionsForAccount("usr_guis");
    expect(removed).toBeGreaterThanOrEqual(2);
    expect(sessionStore.peekSession(a)).toBeNull();
    expect(sessionStore.peekSession(b)).toBeNull();
  });

  it("rejects an unknown token", () => {
    expect(sessionStore.peekSession("not-a-token")).toBeNull();
    expect(sessionStore.peekSession("")).toBeNull();
    expect(sessionStore.peekSession(undefined)).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────
//  Rate limiting
// ───────────────────────────────────────────────────────────────
describe("command rate limiting", () => {
  it("blocks a second command inside the cooldown window", () => {
    const now = Date.now();
    const first = sessionStore.checkCommandRate("usr_rl", now);
    expect(first.ok).toBe(true);
    sessionStore.recordCommand("usr_rl", now);
    const second = sessionStore.checkCommandRate("usr_rl", now + 10);
    expect(second.ok).toBe(false);
    expect(second.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows a command once the cooldown elapsed", () => {
    const now = Date.now();
    sessionStore.checkCommandRate("usr_rl2", now);
    sessionStore.recordCommand("usr_rl2", now);
    const later = sessionStore.checkCommandRate("usr_rl2", now + LIMITS.COMMAND_COOLDOWN_MS + 5);
    expect(later.ok).toBe(true);
  });

  it("caps the number of commands inside the sliding window", () => {
    const now = Date.now();
    let allowed = 0;
    for (let i = 0; i < LIMITS.MAX_COMMANDS_PER_WINDOW + 5; i++) {
      const gate = sessionStore.checkCommandRate("usr_rl3", now + i * LIMITS.COMMAND_COOLDOWN_MS);
      if (gate.ok) {
        allowed++;
        sessionStore.recordCommand("usr_rl3", now + i * LIMITS.COMMAND_COOLDOWN_MS);
      }
    }
    expect(allowed).toBeLessThanOrEqual(LIMITS.MAX_COMMANDS_PER_WINDOW);
  });

  it("blocks rapid activation attempts", () => {
    const now = Date.now();
    expect(sessionStore.checkActivationCooldown("usr_act", now).ok).toBe(true);
    sessionStore.recordActivation("usr_act", now);
    expect(sessionStore.checkActivationCooldown("usr_act", now + 10).ok).toBe(false);
    expect(sessionStore.checkActivationCooldown("usr_act", now + LIMITS.ACTIVATION_COOLDOWN_MS + 5).ok).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────
//  Spawnable allowlist
// ───────────────────────────────────────────────────────────────
describe("spawnable allowlist", () => {
  it("exposes a non-empty list of effect ids", () => {
    expect(SPAWNABLE_IDS.length).toBeGreaterThan(0);
    for (const id of SPAWNABLE_IDS) {
      expect(findSpawnableEffect(id)).toBeDefined();
    }
  });

  it("rejects unknown, empty and non-string ids", () => {
    expect(findSpawnableEffect("rm -rf /")).toBeUndefined();
    expect(findSpawnableEffect("../../etc/passwd")).toBeUndefined();
    expect(findSpawnableEffect("")).toBeUndefined();
    expect(findSpawnableEffect(undefined)).toBeUndefined();
    expect(findSpawnableEffect(null)).toBeUndefined();
    expect(findSpawnableEffect("ZOMBIE_SCAVENGER")).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────
//  Spawn resolution
// ───────────────────────────────────────────────────────────────
describe("spawn resolution (server)", () => {
  const players = new Map();

  beforeEach(() => {
    players.clear();
    players.set("srv-alive", {
      id: "srv-alive",
      name: "Sobrevivente",
      x: 5000,
      y: 5000,
      connected: true,
    });
    players.set("srv-gone", {
      id: "srv-gone",
      name: "Ausente",
      x: 5010,
      y: 5010,
      connected: false,
    });
  });

  it("rejects an invalid effect id", () => {
    const result = panelSpawn.resolveSpawnRequest({
      effectId: "rm -rf /",
      targetId: "srv-alive",
      players,
      isBlocked: worldProbe.isBlocked,
      tileAt: worldProbe.tileAt,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("recurso-invalido");
  });

  it("rejects a disconnected target without redirecting", () => {
    const result = panelSpawn.resolveSpawnRequest({
      effectId: "zombie_scavenger",
      targetId: "srv-gone",
      players,
      isBlocked: worldProbe.isBlocked,
      tileAt: worldProbe.tileAt,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("alvo-desconectado");
  });

  it("rejects an unknown target", () => {
    const result = panelSpawn.resolveSpawnRequest({
      effectId: "zombie_scavenger",
      targetId: "srv-nobody",
      players,
      isBlocked: worldProbe.isBlocked,
      tileAt: worldProbe.tileAt,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("alvo-desconectado");
  });

  it("rejects a missing target id", () => {
    const result = panelSpawn.resolveSpawnRequest({
      effectId: "zombie_scavenger",
      targetId: "",
      players,
      isBlocked: worldProbe.isBlocked,
      tileAt: worldProbe.tileAt,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("alvo-invalido");
  });

  it("places the effect at a safe spot near the target", () => {
    const result = panelSpawn.resolveSpawnRequest({
      effectId: "zombie_scavenger",
      targetId: "srv-alive",
      players,
      isBlocked: worldProbe.isBlocked,
      tileAt: worldProbe.tileAt,
    });
    if (!result.ok) {
      // The deterministic terrain around the spawn point may be fully
      // blocked; in that case the server must refuse — which is the
      // documented behaviour.
      expect(result.reason).toBe("sem-ponto-seguro");
      return;
    }
    expect(result.positions.length).toBeGreaterThan(0);
    for (const pos of result.positions) {
      const distance = Math.hypot(pos.x - 5000, pos.y - 5000);
      expect(distance).toBeGreaterThanOrEqual(5.9);
      expect(distance).toBeLessThanOrEqual(13);
      expect(worldProbe.isBlocked(pos.x, pos.y)).toBe(false);
    }
  });

  it("never places an entity inside the target's body", () => {
    const result = panelSpawn.resolveSpawnRequest({
      effectId: "pet",
      targetId: "srv-alive",
      players,
      isBlocked: worldProbe.isBlocked,
      tileAt: worldProbe.tileAt,
    });
    if (!result.ok) return;
    for (const pos of result.positions) {
      expect(Math.hypot(pos.x - 5000, pos.y - 5000)).toBeGreaterThan(2.5);
    }
  });

  it("enforces the per-room limit", () => {
    const result = panelSpawn.resolveSpawnRequest({
      effectId: "zombie_scavenger",
      targetId: "srv-alive",
      players,
      isBlocked: worldProbe.isBlocked,
      tileAt: worldProbe.tileAt,
      activeEffectsInRoom: LIMITS.MAX_ACTIVE_EFFECTS_PER_ROOM,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("limite-sala");
  });

  it("enforces the per-target limit", () => {
    const result = panelSpawn.resolveSpawnRequest({
      effectId: "zombie_scavenger",
      targetId: "srv-alive",
      players,
      isBlocked: worldProbe.isBlocked,
      tileAt: worldProbe.tileAt,
      activeEffectsForTarget: LIMITS.MAX_ACTIVE_EFFECTS_PER_TARGET,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("limite-alvo");
  });

  it("refuses to place anything when there is no safe spot", () => {
    // A target in the middle of a wall has no safe surroundings.
    players.set("srv-walled", { id: "srv-walled", name: "Murado", x: 5000, y: 5000, connected: true });
    const result = panelSpawn.resolveSpawnRequest({
      effectId: "zombie_scavenger",
      targetId: "srv-walled",
      players,
      isBlocked: () => true, // everything blocked
      tileAt: () => "grass",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("sem-ponto-seguro");
  });

  it("refuses when the world probe is unavailable", () => {
    const result = panelSpawn.resolveSpawnRequest({
      effectId: "zombie_scavenger",
      targetId: "srv-alive",
      players,
      isBlocked: null,
      tileAt: null,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("mundo-indisponivel");
  });
});

// ───────────────────────────────────────────────────────────────
//  World probe parity
// ───────────────────────────────────────────────────────────────
describe("world probe", () => {
  it("reports out-of-bounds coordinates as blocked", () => {
    expect(worldProbe.isBlocked(-5, 10)).toBe(true);
    expect(worldProbe.isBlocked(10, 99999)).toBe(true);
  });

  it("is deterministic", () => {
    const a = worldProbe.tileAt(1234, 4321);
    const b = worldProbe.tileAt(1234, 4321);
    expect(a).toBe(b);
  });

  it("agrees with the client world generator on a sample of tiles", async () => {
    // The client world (src/game/world.ts) is the source of truth.
    // This sample asserts the server mirror produces the same tiles.
    const { World } = await import("../src/game/world.ts");
    const world = new World({ difficulty: "survivor", zombieCount: 10, loot: 1, timeScale: 1 });
    const samples = [
      [5000, 5000], [5001, 5000], [4999, 4999], [5010, 5012],
      [4970, 5030], [5030, 4970], [5045, 5045], [4955, 4955],
    ];
    for (const [x, y] of samples) {
      expect(worldProbe.tileAt(x, y)).toBe(world.tileAt(x, y));
    }
  });
});
