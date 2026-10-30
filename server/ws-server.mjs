// ============================================================
//  Zomboid Web — WebSocket Multiplayer Server + Authoritative
//  Admin / Special Panel backend
//
//  Deploy to: AWS EC2, Railway, Render, Fly.io, VPS
//  Run: node ws-server.mjs
//
//  SECURITY MODEL
//  ──────────────
//  · The client NEVER decides who is an administrator.
//  · An account is authorized only when its stable account id
//    appears in ADMIN_ACCOUNT_IDS (env var / admin-accounts.json).
//  · Display names are matched exactly but are never the proof
//    of identity — a name binding only resolves to an id that
//    is already allowlisted.
//  · Admin session tokens are opaque, server-minted, server-held
//    and invalidated the moment the allowlist no longer contains
//    the account.
//  · Every privileged command is re-validated server-side:
//    token → account → allowlist → target → effect → limits.
//  · The browser is told nothing about internals on rejection.
//
//  See server/adminConfig.mjs for the setup instructions.
// ============================================================

import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { WebSocketServer } from "ws";

import {
  ADMIN_ACCOUNT_IDS,
  ADMIN_ACCESS_CODE,
  SPAWNABLE_EFFECTS,
  SPAWNABLE_IDS,
  LIMITS,
  adminConfigSummary,
  isAuthorizedAccountId,
  resolveAuthorizedAccountId,
  findSpawnableEffect,
} from "./adminConfig.mjs";
import {
  createSession,
  peekSession,
  touchSession,
  destroySession,
  destroySessionsForAccount,
  checkCommandRate,
  recordCommand,
  checkActivationCooldown,
  recordActivation,
  forgetAccount,
} from "./sessionStore.mjs";
import { resolveSpawnRequest } from "./panelSpawn.mjs";
import { audit, readAudit } from "./auditLog.mjs";
import { tileAt, isBlocked } from "./worldProbe.mjs";
import { applySecurityHeaders, redirectToHttps } from "./securityHeaders.mjs";
import {
  readJsonBody as readValidatedJsonBody,
  validateAccountId,
  validateDisplayName,
  validateId,
  validateRoomId,
  sanitizeText,
} from "./validation.mjs";

const PORT = process.env.PORT || 8080;
const TICK_RATE = 10; // 10 updates per second
const TIMEOUT = 15000;
/** Maximum size of a single WebSocket message (8 KB). */
const MAX_WS_MESSAGE_BYTES = 8 * 1024;

/**
 * HTTPS enforcement.
 *
 * When FORCE_HTTPS=1 (or NODE_ENV=production) every plain-HTTP
 * request is redirected to HTTPS. Behind a proxy we trust
 * `X-Forwarded-Proto`.
 */
const FORCE_HTTPS =
  process.env.FORCE_HTTPS === "1" ||
  process.env.FORCE_HTTPS === "true" ||
  process.env.NODE_ENV === "production";

/** Allowed CORS origin for the game API (empty = same-origin only). */
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || "").trim();

// Load optional admin accounts file (alternative to env var).
const ADMIN_ACCOUNTS_FILE = process.env.ADMIN_ACCOUNTS_FILE;
if (ADMIN_ACCOUNTS_FILE && existsSync(ADMIN_ACCOUNTS_FILE)) {
  try {
    const parsed = JSON.parse(readFileSync(ADMIN_ACCOUNTS_FILE, "utf8"));
    const ids = Array.isArray(parsed) ? parsed : parsed.accountIds;
    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (typeof id === "string" && id) ADMIN_ACCOUNT_IDS.add(id);
      }
      console.log(`[admin] Loaded ${ids.length} account id(s) from ${ADMIN_ACCOUNTS_FILE}`);
    }
  } catch (err) {
    console.warn(`[admin] Could not read ${ADMIN_ACCOUNTS_FILE}: ${err.message}`);
  }
}

// Game state
const players = new Map();
const chatHistory = [];

/**
 * Live effects created through the special panel, per room.
 * room -> Map<effectId, {effectId, targetId, positions, createdAt, ttl}>
 */
const roomEffects = new Map();

// Stats
let totalConnections = 0;
let peakPlayers = 0;
const startTime = Date.now();

function roomKey(room) {
  return typeof room === "string" && room ? room : "global";
}

function getRoomEffects(room) {
  const key = roomKey(room);
  let effects = roomEffects.get(key);
  if (!effects) {
    effects = new Map();
    roomEffects.set(key, effects);
  }
  return effects;
}

function countEffectsForTarget(room, targetId) {
  let n = 0;
  for (const e of getRoomEffects(room).values()) {
    if (e.targetId === targetId) n++;
  }
  return n;
}

// Create HTTP server with status page
const httpServer = createServer(async (req, res) => {
  const isSecure = Boolean(req.socket && req.socket.encrypted);
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const effectiveSecure = isSecure || forwardedProto === "https";

  // ── Security headers on EVERY response ──────────────────────
  applySecurityHeaders(res, { isSecure: effectiveSecure, hsts: FORCE_HTTPS || effectiveSecure });

  // ── Force HTTPS: redirect plain HTTP ────────────────────────
  if (FORCE_HTTPS && redirectToHttps(req, res, req.headers.host)) {
    return;
  }

  // ── CORS: only the configured origin, never "*" ─────────────
  const origin = String(req.headers.origin || "");
  if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  let url;
  try {
    url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "bad-request" }));
    return;
  }

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "online",
      players: players.size,
      peak: peakPlayers,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      totalConnections,
      adminConfigured: ADMIN_ACCOUNT_IDS.size > 0,
      https: effectiveSecure,
    }));
    return;
  }

  if (url.pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(getStatusPage());
    return;
  }

  // ------------------------------------------------------------
  //  ADMIN AUTH — exchange an authenticated account identity for
  //  a server-side admin session token.
  //
  //  The client sends the account id + display name it obtained
  //  from the game's auth system. The server checks the id
  //  against ADMIN_ACCOUNT_IDS. If it matches, a session token is
  //  minted. Otherwise the request is rejected WITHOUT revealing
  //  whether the name exists.
  // ------------------------------------------------------------
  if (url.pathname === "/admin/permission" && req.method === "POST") {
    const parsed = await readValidatedJsonBody(req);
    if (!parsed.ok) {
      const status = parsed.error === "body-too-large" ? 413 : 400;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ granted: false, error: parsed.error }));
      return;
    }
    const body = parsed.value;
    // Validate the shape of every field before it reaches the
    // allowlist logic — a malformed id never reaches the resolver.
    const accountId = validateAccountId(body.accountId) ?? "";
    const displayName = validateDisplayName(body.displayName) ?? "";
    if (!accountId) {
      audit("admin.permission", "denied", { accountId: null, reason: "invalid-account-id" });
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ granted: false }));
      return;
    }
    const resolved = resolveAuthorizedAccountId({ accountId, displayName });

    if (!resolved) {
      audit("admin.permission", "denied", {
        accountId: accountId || null,
        reason: "not-allowlisted",
      });
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ granted: false }));
      return;
    }

    // resolveAuthorizedAccountId already enforces the exact
    // display-name ↔ account-id binding (when configured), so an
    // allowlisted id paired with a foreign name was rejected above.
    const token = createSession({ accountId: resolved, displayName });
    audit("admin.permission", "granted", { accountId: resolved });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      granted: true,
      token,
      accountId: resolved,
      displayName,
      expiresInMs: LIMITS.SESSION_TTL_MS,
      spawnable: SPAWNABLE_IDS,
      // The access code is disclosed ONLY to an account that just
      // passed the server-side allowlist check. It is never part of
      // the browser bundle — it lives in the server environment.
      accessCode: ADMIN_ACCESS_CODE || null,
      limits: {
        cooldownMs: LIMITS.COMMAND_COOLDOWN_MS,
        maxPerWindow: LIMITS.MAX_COMMANDS_PER_WINDOW,
        windowMs: LIMITS.COMMAND_WINDOW_MS,
        maxPerRoom: LIMITS.MAX_ACTIVE_EFFECTS_PER_ROOM,
        maxPerTarget: LIMITS.MAX_ACTIVE_EFFECTS_PER_TARGET,
      },
    }));
    return;
  }

  // ------------------------------------------------------------
  //  ADMIN SESSION — introspect / revoke
  // ------------------------------------------------------------
  if (url.pathname === "/admin/session" && req.method === "GET") {
    const token = bearerToken(req);
    const session = peekSession(token);
    if (!session || !isAuthorizedAccountId(session.accountId)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ valid: false }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      valid: true,
      accountId: session.accountId,
      displayName: session.displayName,
      spawnable: SPAWNABLE_IDS,
    }));
    return;
  }

  if (url.pathname === "/admin/session" && req.method === "DELETE") {
    const token = bearerToken(req);
    destroySession(token);
    res.writeHead(204);
    res.end();
    return;
  }

  // ------------------------------------------------------------
  //  PANEL — spawn command. The client asks; the server decides.
  // ------------------------------------------------------------
  if (url.pathname === "/panel/spawn" && req.method === "POST") {
    const token = bearerToken(req);
    const session = peekSession(token);
    if (!session || !isAuthorizedAccountId(session.accountId)) {
      audit("panel.spawn", "denied", { reason: "no-session" });
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, code: "sem-permissao" }));
      return;
    }

    const parsedSpawn = await readValidatedJsonBody(req);
    if (!parsedSpawn.ok) {
      const status = parsedSpawn.error === "body-too-large" ? 413 : 400;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, code: parsedSpawn.error }));
      return;
    }
    const body = parsedSpawn.value;

    // Re-check the rate limit on EVERY privileged command.
    const rate = checkCommandRate(session.accountId);
    if (!rate.ok) {
      audit("panel.spawn", "rejected", {
        accountId: session.accountId,
        reason: "cooldown",
      });
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, code: "cooldown", retryAfterMs: rate.retryAfterMs }));
      return;
    }
    // The cooldown slot is consumed by the ATTEMPT, not only by the
    // successful commands. Otherwise a client could spam rejected
    // requests without ever hitting the limit.
    recordCommand(session.accountId);

    // Validate every field before it is used. The effect id must
    // match the strict id pattern AND be on the server allowlist;
    // the target id must be a well-formed player id.
    const room = roomKey(validateRoomId(body.room) ?? "global");
    const targetId = typeof body.targetId === "string" ? body.targetId.trim().slice(0, 64) : "";
    const effectId = validateId(body.effectId) ?? "";

    const resolution = resolveSpawnRequest({
      effectId,
      targetId,
      players,
      isBlocked,
      tileAt,
      activeEffectsInRoom: getRoomEffects(room).size,
      activeEffectsForTarget: countEffectsForTarget(room, targetId),
    });

    if (!resolution.ok) {
      audit("panel.spawn", "rejected", {
        accountId: session.accountId,
        room,
        reason: resolution.reason,
      });
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, code: resolution.reason }));
      return;
    }

    // Commit: store the effect so per-room/per-target limits apply
    // to subsequent commands.
    const effectKey = `${session.accountId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    getRoomEffects(room).set(effectKey, {
      effectId,
      targetId,
      positions: resolution.positions,
      createdAt: Date.now(),
      ttl: 120_000,
    });

    audit("panel.spawn", "ok", {
      accountId: session.accountId,
      room,
      reason: effectId,
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      effectId,
      label: resolution.effect.label,
      targetId,
      targetName: resolution.targetName,
      positions: resolution.positions,
    }));
    return;
  }

  // ------------------------------------------------------------
  //  PANEL — activation bookkeeping (the phrase never leaves the
  //  client; the server only records that an activation happened
  //  for an authorized account, enforcing anti-replay).
  // ------------------------------------------------------------
  if (url.pathname === "/panel/activate" && req.method === "POST") {
    const token = bearerToken(req);
    const session = peekSession(token);
    if (!session || !isAuthorizedAccountId(session.accountId)) {
      audit("panel.activation", "denied", { reason: "no-session" });
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    const gate = checkActivationCooldown(session.accountId);
    if (!gate.ok) {
      audit("panel.activation", "rejected", {
        accountId: session.accountId,
        reason: "cooldown",
      });
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, code: "cooldown", retryAfterMs: gate.retryAfterMs }));
      return;
    }
    recordActivation(session.accountId);
    audit("panel.activation", "granted", { accountId: session.accountId });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ------------------------------------------------------------
  //  ADMIN — list live players in the current room (for the
  //  panel's target picker). Requires a valid session.
  // ------------------------------------------------------------
  if (url.pathname === "/panel/players" && req.method === "GET") {
    const token = bearerToken(req);
    const session = peekSession(token);
    if (!session || !isAuthorizedAccountId(session.accountId)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    // Validate the room id — it arrives from the query string.
    const rawRoom = url.searchParams.get("room") || "global";
    const room = validateRoomId(rawRoom) ?? "global";
    const list = [];
    for (const p of players.values()) {
      if (p.room !== roomKey(room)) continue;
      list.push({ id: p.id, name: p.name || "Sobrevivente", x: p.x, y: p.y });
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, players: list }));
    return;
  }

  // Audit feed (technical events only).
  if (url.pathname === "/admin/audit" && req.method === "GET") {
    const token = bearerToken(req);
    const session = peekSession(token);
    if (!session || !isAuthorizedAccountId(session.accountId)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, entries: readAudit().slice(0, 50) }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

function bearerToken(req) {
  const header = req.headers["authorization"] || "";
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return "";
}


// WebSocket server
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws, req) => {
  const playerId = `srv-${Math.random().toString(36).slice(2, 10)}`;
  totalConnections++;
  const startTime = Date.now();

  const player = {
    id: playerId,
    name: "",
    room: "global",
    x: 0,
    y: 0,
    angle: 0,
    health: 100,
    kills: 0,
    lastUpdate: Date.now(),
    ws,
    pingStart: 0,
    connected: true,
    // Set when this connection authenticates as an admin account.
    adminAccountId: null,
    adminToken: null,
  };

  players.set(playerId, player);

  // Send player their ID
  ws.send(JSON.stringify({
    type: "assignId",
    id: playerId,
    serverTime: Date.now(),
    playerCount: players.size,
  }));

  ws.on("message", (data) => {
    // Reject oversized frames before parsing them — a client must
    // not be able to make the server allocate arbitrary memory.
    const raw = typeof data === "string" ? data : data.toString("utf8");
    if (raw.length > MAX_WS_MESSAGE_BYTES) {
      try { ws.close(1009, "message-too-big"); } catch { /* ignore */ }
      return;
    }
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // Invalid JSON — ignore silently.
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;
    // Drop prototype-polluting keys.
    for (const key of Object.keys(msg)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        delete msg[key];
      }
    }
    handleMessage(playerId, msg);
  });

  ws.on("close", () => {
    players.delete(playerId);
    // A disconnect invalidates the session bound to this socket.
    if (player.adminToken) {
      destroySession(player.adminToken);
      forgetAccount(player.adminAccountId);
    }
    broadcastToAll({
      type: "leave",
      id: playerId,
      name: player.name,
      x: player.x,
      y: player.y,
      angle: player.angle,
      health: player.health,
      kills: player.kills,
      ts: Date.now(),
    }, playerId, player.room);
    peakPlayers = Math.max(peakPlayers, players.size);
  });

  ws.on("error", () => {
    players.delete(playerId);
  });

  // Send existing players to new connection
  for (const [id, p] of players) {
    if (id !== playerId && p.connected) {
      ws.send(JSON.stringify({
        type: "state",
        id: p.id,
        name: p.name,
        x: p.x,
        y: p.y,
        angle: p.angle,
        health: p.health,
        kills: p.kills,
        ts: Date.now(),
      }));
    }
  }

  // Send chat history
  for (const msg of chatHistory.slice(-20)) {
    ws.send(JSON.stringify(msg));
  }
});

function handleMessage(playerId, msg) {
  const player = players.get(playerId);
  if (!player) return;

  if (msg.id && msg.id !== playerId) return; // Ignore spoofed messages

  switch (msg.type) {
    case "join":
    case "state":
    case "heartbeat": {
      if (typeof msg.name === "string") {
        const cleanName = sanitizeText(msg.name, 40);
        if (cleanName) player.name = cleanName;
      }
      if (typeof msg.room === "string") {
        player.room = roomKey(validateRoomId(msg.room) ?? "global");
      }
      if (Number.isFinite(msg.x)) player.x = msg.x;
      if (Number.isFinite(msg.y)) player.y = msg.y;
      if (Number.isFinite(msg.angle)) player.angle = msg.angle;
      if (Number.isFinite(msg.health)) player.health = msg.health;
      if (Number.isFinite(msg.kills)) player.kills = msg.kills;
      player.lastUpdate = Date.now();

      // Broadcast to all other players in the same room
      broadcastToAll({
        type: "state",
        id: playerId,
        name: player.name,
        x: player.x,
        y: player.y,
        angle: player.angle,
        health: player.health,
        kills: player.kills,
        ts: Date.now(),
      }, playerId, player.room);
      break;
    }

    case "leave":
      players.delete(playerId);
      broadcastToAll({
        type: "leave",
        id: playerId,
        name: player.name,
        x: 0, y: 0, angle: 0,
        health: 0, kills: 0, ts: Date.now(),
      }, playerId, player.room);
      break;

    case "chat": {
      if (!msg.chatText) break;
      // Strip control characters (including \u2028/\u2029 which
      // break JSON in some parsers) and cap the length. The text is
      // rendered as plain text by the client, and React escapes it.
      const text = sanitizeText(msg.chatText, LIMITS.MAX_COMMAND_LENGTH);
      if (!text) break;
      const chatMsg = {
        type: "chat",
        id: playerId,
        name: player.name,
        x: player.x,
        y: player.y,
        angle: player.angle,
        health: player.health,
        kills: player.kills,
        ts: Date.now(),
        chatText: text,
      };
      chatHistory.push(chatMsg);
      if (chatHistory.length > 100) chatHistory.shift();
      broadcastToAll(chatMsg, null, player.room); // Include sender
      break;
    }

    // -------------------------------------------------------
    //  ADMIN AUTH over the socket: the client proves its
    //  authenticated account id; the server decides.
    // -------------------------------------------------------
    case "admin-auth": {
      const accountId = validateAccountId(msg.accountId) ?? "";
      const displayName = validateDisplayName(msg.displayName) ?? "";
      const resolved = resolveAuthorizedAccountId({ accountId, displayName });
      if (!resolved) {
        audit("admin.auth", "denied", { accountId: accountId || null, reason: "not-allowlisted" });
        player.ws.send(JSON.stringify({ type: "admin-auth-result", granted: false }));
        break;
      }
      const token = createSession({ accountId: resolved, displayName });
      player.adminAccountId = resolved;
      player.adminToken = token;
      audit("admin.auth", "granted", { accountId: resolved });
      player.ws.send(JSON.stringify({
        type: "admin-auth-result",
        granted: true,
        token,
        accountId: resolved,
        spawnable: SPAWNABLE_IDS,
      }));
      break;
    }

    // -------------------------------------------------------
    //  PANEL SPAWN over the socket.
    //  The server validates and positions; it broadcasts the
    //  result to the room so every client sees the same thing.
    // -------------------------------------------------------
    case "panel-spawn": {
      const token = msg.token;
      const session = peekSession(typeof token === "string" ? token : "");
      if (!session || !isAuthorizedAccountId(session.accountId)) {
        audit("panel.spawn", "denied", { reason: "no-session" });
        player.ws.send(JSON.stringify({ type: "panel-spawn-result", ok: false, code: "sem-permissao" }));
        break;
      }
      const rate = checkCommandRate(session.accountId);
      if (!rate.ok) {
        audit("panel.spawn", "rejected", { accountId: session.accountId, reason: "cooldown" });
        player.ws.send(JSON.stringify({
          type: "panel-spawn-result", ok: false, code: "cooldown", retryAfterMs: rate.retryAfterMs,
        }));
        break;
      }
      // The cooldown slot is consumed by the ATTEMPT (see the HTTP
      // route) so rejected requests cannot be used to spam.
      recordCommand(session.accountId);
      const effectId = typeof msg.effectId === "string" ? msg.effectId : "";
      const targetId = typeof msg.targetId === "string" ? msg.targetId : "";
      const room = roomKey(msg.room);

      const resolution = resolveSpawnRequest({
        effectId,
        targetId,
        players,
        isBlocked,
        tileAt,
        activeEffectsInRoom: getRoomEffects(room).size,
        activeEffectsForTarget: countEffectsForTarget(room, targetId),
      });
      if (!resolution.ok) {
        audit("panel.spawn", "rejected", { accountId: session.accountId, room, reason: resolution.reason });
        player.ws.send(JSON.stringify({ type: "panel-spawn-result", ok: false, code: resolution.reason }));
        break;
      }

      const effectKey = `${session.accountId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      getRoomEffects(room).set(effectKey, {
        effectId,
        targetId,
        positions: resolution.positions,
        createdAt: Date.now(),
        ttl: 120_000,
      });
      audit("panel.spawn", "ok", { accountId: session.accountId, room, reason: effectId });

      const payload = {
        type: "panel-spawn-result",
        ok: true,
        effectId,
        label: resolution.effect.label,
        targetId,
        targetName: resolution.targetName,
        positions: resolution.positions,
      };
      player.ws.send(JSON.stringify(payload));
      broadcastToAll({
        type: "panel-effect",
        effectId,
        targetId,
        positions: resolution.positions,
        ts: Date.now(),
      }, null, room);
      break;
    }

    case "ping":
      player.ws.send(JSON.stringify({
        type: "ping",
        id: "server",
        ts: msg.ts,
        serverTime: Date.now(),
        x: 0, y: 0, angle: 0, health: 0, kills: 0,
        name: "Server",
      }));
      break;
  }
}

function broadcastToAll(msg, excludeId, room) {
  const data = JSON.stringify(msg);
  const roomFilter = room ? roomKey(room) : null;
  for (const [id, player] of players) {
    if (id === excludeId) continue;
    if (roomFilter && player.room !== roomFilter) continue;
    if (player.ws.readyState === 1) {
      try {
        player.ws.send(data);
      } catch {
        // Connection broken
      }
    }
  }
}

// Server tick - clean up stale connections and expired panel effects
setInterval(() => {
  const now = Date.now();
  for (const [id, player] of players) {
    if (now - player.lastUpdate > TIMEOUT) {
      players.delete(id);
      if (player.adminToken) {
        destroySession(player.adminToken);
        forgetAccount(player.adminAccountId);
      }
      broadcastToAll({
        type: "leave",
        id,
        name: player.name,
        x: 0, y: 0, angle: 0,
        health: 0, kills: 0, ts: now,
      }, id, player.room);
    }
  }
  // Expire panel effects (they are short-lived markers, not entities).
  for (const [room, effects] of roomEffects) {
    for (const [key, effect] of effects) {
      if (now - effect.createdAt > effect.ttl) effects.delete(key);
    }
    if (effects.size === 0) roomEffects.delete(room);
  }
  peakPlayers = Math.max(peakPlayers, players.size);
}, 5000);

// Start server
httpServer.listen(PORT, () => {
  const summary = adminConfigSummary();
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  🧟 Zomboid Web — Multiplayer Server`);
  console.log(`  📍 WebSocket: ws://localhost:${PORT}`);
  console.log(`  🌐 Status:    http://localhost:${PORT}`);
  console.log(`  ❤️  Health:    http://localhost:${PORT}/health`);
  console.log(`  ⚙️  Tick Rate: ${TICK_RATE}/s`);
  console.log(`  🔐 Admin accounts configured: ${summary.authorizedAccountCount}`);
  if (summary.authorizedAccountCount === 0) {
    console.log(`     ⚠️  No ADMIN_ACCOUNT_IDS configured — the admin panel`);
    console.log(`        and special panel stay closed for everyone.`);
  } else {
    console.log(`     Names: ${summary.displayNames.join(", ") || "(none)"}`);
  }
  console.log(`  🎯 Spawnable effects: ${summary.spawnableEffects.join(", ")}`);
  console.log(`  ⏱  Command cooldown: ${LIMITS.COMMAND_COOLDOWN_MS}ms`);
  console.log(`${"═".repeat(60)}\n`);
});

function getStatusPage() {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(uptime / 3600);
  const mins = Math.floor((uptime % 3600) / 60);
  const secs = uptime % 60;

  return `<!DOCTYPE html>
<html><head><title>Zomboid Web Server</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #111; color: #d7c9a7; font-family: 'Courier New', monospace; padding: 2rem; min-height: 100vh; }
  h1 { color: #d96b3a; font-size: 2rem; margin-bottom: 1rem; }
  .card { border: 1px solid #2a2a2a; background: #151515; padding: 1.5rem; margin-bottom: 1rem; }
  .stat { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #2a2a2a; }
  .stat:last-child { border: none; }
  .label { color: #7f936f; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.1em; }
  .value { color: #d96b3a; font-size: 1.2rem; font-weight: bold; }
  .status { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #4aff4a; margin-right: 0.5rem; }
  .players { margin-top: 1rem; }
  .player-item { padding: 0.3rem 0; font-size: 0.8rem; color: #5a8aaa; border-bottom: 1px solid #1f2521; }
</style>
<meta http-equiv="refresh" content="5">
</head>
<body>
  <h1>🧟 Zomboid Web Server</h1>
  <div class="card">
    <div class="stat"><span class="label">Status</span><span class="value"><span class="status"></span>ONLINE</span></div>
    <div class="stat"><span class="label">Uptime</span><span class="value">${hours}h ${mins}m ${secs}s</span></div>
    <div class="stat"><span class="label">Port</span><span class="value">${PORT}</span></div>
    <div class="stat"><span class="label">Tick Rate</span><span class="value">${TICK_RATE}/s</span></div>
  </div>
  <div class="card">
    <div class="stat"><span class="label">Connected Players</span><span class="value">${players.size}</span></div>
    <div class="stat"><span class="label">Peak Players</span><span class="value">${peakPlayers}</span></div>
    <div class="stat"><span class="label">Total Connections</span><span class="value">${totalConnections}</span></div>
  </div>
  <div class="card">
    <h2 style="font-size: 0.9rem; color: #7f936f; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.1em;">Active Players</h2>
    ${players.size === 0 ? '<p style="color: #666;">No players connected</p>' : ''}
    ${Array.from(players.values()).map(p => `<div class="player-item">👤 ${p.name || 'Unnamed'} — HP: ${Math.round(p.health)} — Kills: ${p.kills}</div>`).join('')}
  </div>
</body></html>`;
}
