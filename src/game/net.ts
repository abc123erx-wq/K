// ============================================================
// NET v3 — Multi-backend multiplayer: BroadcastChannel / WebSocket / Firebase / Photon
// Architecture: pluggable adapters that share the same interface
// ============================================================

import type { NetMessage, OnlinePlayer } from "./types";
import { VoiceChat } from "./voiceChat";

// ============================================================
//  Types
// ============================================================

export interface NetworkAdapter {
  name: string;
  init(): { myId: string; myName: string };
  broadcast(msg: NetMessage): void;
  setState(x: number, y: number, angle: number, health: number, kills: number): void;
  getActivePlayers(): OnlinePlayer[];
  getMyInfo(): { myId: string; myName: string };
  setOnChat(fn: (msg: { id: string; name: string; text: string; ts: number }) => void): void;
  setOnPvP(fn: (msg: { fromId: string; fromName: string; targetId: string; damage: number; weapon: string; ts: number; isKill: boolean }) => void): void;
  sendChat(text: string): void;
  sendPvPDamage(targetId: string, damage: number, weapon: string, isKill: boolean): void;
  update(dt: number): void;
  destroy(): void;
  connected: boolean;
  latency: number;
  getPlayerCount(): number;
}

export interface ServerConfig {
  backend: "broadcast" | "websocket" | "firebase" | "photon";
  wsUrl?: string;
  firebaseConfig?: {
    apiKey: string;
    authDomain: string;
    databaseURL: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  photonAppId?: string;
  photonAppVersion?: string;
  roomId?: string;
}

const TIMEOUT = 15000;
const HEARTBEAT_INTERVAL = 2000;

// ============================================================
//  Adapters
// ============================================================

class BroadcastChannelAdapter implements NetworkAdapter {
  name = "BroadcastChannel";
  connected = true;
  latency = 0;
  private channel: BroadcastChannel | null = null;
  private myId = "";
  private myName = "";
  private myState = { x: 0, y: 0, angle: 0, health: 100, kills: 0 };
  private others = new Map<string, OnlinePlayer>();
  private onChat: ((msg: { id: string; name: string; text: string; ts: number }) => void) | null = null;
  private onPvP: ((msg: { fromId: string; fromName: string; targetId: string; damage: number; weapon: string; ts: number; isKill: boolean }) => void) | null = null;
  private stateTimer = 0;
  private heartbeatTimer = 0;

  init() {
    this.myId = `p-${Math.random().toString(36).slice(2, 10)}`;
    this.myName = `Survivor-${this.myId.slice(2, 6).toUpperCase()}`;
    try {
      this.channel = new BroadcastChannel("knox-county-multiplayer");
      this.channel.onmessage = (event: MessageEvent<NetMessage>) => this.handle(event.data);
    } catch { /* ignore */ }

    // Storage fallback
    window.addEventListener("storage", (event) => {
      if (event.key === "knox-net" && event.newValue) {
        try {
          const msg = JSON.parse(event.newValue) as NetMessage;
          if (msg.id !== this.myId) this.handle(msg);
        } catch { /* ignore */ }
      }
    });

    this.broadcast({
      type: "join",
      id: this.myId,
      name: this.myName,
      x: 0, y: 0, angle: 0,
      health: 100, kills: 0, ts: Date.now(),
    });

    return { myId: this.myId, myName: this.myName };
  }

  broadcast(msg: NetMessage) {
    try { this.channel?.postMessage(msg); } catch { /* ignore */ }
    try { localStorage.setItem("knox-net", JSON.stringify(msg)); localStorage.removeItem("knox-net"); } catch { /* ignore */ }
  }

  setState(x: number, y: number, angle: number, health: number, kills: number) {
    this.myState = { x, y, angle, health, kills };
  }

  getActivePlayers(): OnlinePlayer[] {
    const now = Date.now();
    for (const [id, p] of this.others) {
      if (now - p.lastSeen > TIMEOUT) this.others.delete(id);
    }
    return Array.from(this.others.values());
  }

  getMyInfo() { return { myId: this.myId, myName: this.myName }; }
  setOnChat(fn: (msg: { id: string; name: string; text: string; ts: number }) => void) { this.onChat = fn; }
  setOnPvP(fn: (msg: { fromId: string; fromName: string; targetId: string; damage: number; weapon: string; ts: number; isKill: boolean }) => void) { this.onPvP = fn; }
  sendChat(text: string) {
    this.broadcast({ type: "chat", id: this.myId, name: this.myName, x: this.myState.x, y: this.myState.y, angle: this.myState.angle, health: this.myState.health, kills: this.myState.kills, ts: Date.now(), chatText: text });
  }
  sendPvPDamage(targetId: string, damage: number, weapon: string, isKill: boolean) {
    this.broadcast({ type: isKill ? "pvp-kill" : "pvp-damage", id: this.myId, name: this.myName, x: this.myState.x, y: this.myState.y, angle: this.myState.angle, health: this.myState.health, kills: this.myState.kills, ts: Date.now(), targetId, damage, weapon });
  }

  update(dt: number) {
    this.stateTimer += dt * 1000;
    this.heartbeatTimer += dt * 1000;
    if (this.stateTimer >= 150) {
      this.stateTimer = 0;
      this.broadcast({ type: "state", id: this.myId, name: this.myName, x: this.myState.x, y: this.myState.y, angle: this.myState.angle, health: this.myState.health, kills: this.myState.kills, ts: Date.now() });
    }
    if (this.heartbeatTimer >= HEARTBEAT_INTERVAL) {
      this.heartbeatTimer = 0;
      this.broadcast({ type: "heartbeat", id: this.myId, name: this.myName, x: this.myState.x, y: this.myState.y, angle: this.myState.angle, health: this.myState.health, kills: this.myState.kills, ts: Date.now() });
    }
  }

  getPlayerCount() { return this.others.size + 1; }

  destroy() {
    this.broadcast({ type: "leave", id: this.myId, name: this.myName, x: 0, y: 0, angle: 0, health: 100, kills: 0, ts: Date.now() });
    this.channel?.close();
    this.channel = null;
  }

  private handle(msg: NetMessage) {
    if (msg.id === this.myId) return;
    if (msg.type === "join" || msg.type === "state" || msg.type === "heartbeat" || msg.type === "voice-status") {
      this.others.set(msg.id, {
        id: msg.id,
        name: msg.name,
        x: msg.x,
        y: msg.y,
        angle: msg.angle,
        health: msg.health,
        kills: msg.kills,
        lastSeen: msg.ts ?? Date.now(),
        isSpeaking: msg.voiceSpeaking,
      });
      if (msg.voiceSpeaking) {
        VoiceChat.setRemoteSpeaker(msg.id, msg.name, msg.voiceVolume ?? 0.8, false);
      }
    } else if (msg.type === "leave") {
      this.others.delete(msg.id);
    } else if (msg.type === "chat" && msg.chatText && this.onChat) {
      this.onChat({ id: msg.id, name: msg.name, text: msg.chatText, ts: msg.ts });
    } else if ((msg.type === "pvp-damage" || msg.type === "pvp-kill") && this.onPvP && msg.targetId && msg.damage != null) {
      this.onPvP({ fromId: msg.id, fromName: msg.name, targetId: msg.targetId, damage: msg.damage, weapon: msg.weapon ?? "fist", ts: msg.ts, isKill: msg.type === "pvp-kill" });
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  FIREBASE REALTIME DATABASE ADAPTER
//  Cross-device multiplayer via Firebase RTDB
// ═══════════════════════════════════════════════════════════════
class FirebaseAdapter implements NetworkAdapter {
  name = "Firebase";
  connected = false;
  latency = 0;
  private myId = "";
  private myName = "";
  private roomId = "global";
  private myState = { x: 0, y: 0, angle: 0, health: 100, kills: 0 };
  private others = new Map<string, OnlinePlayer>();
  private onChat: ((msg: { id: string; name: string; text: string; ts: number }) => void) | null = null;
  private onPvP: ((msg: { fromId: string; fromName: string; targetId: string; damage: number; weapon: string; ts: number; isKill: boolean }) => void) | null = null;
  private stateTimer = 0;
  private unsubscribers: (() => void)[] = [];
  private seenChatKeys = new Set<string>();
  private seenPvpKeys = new Set<string>();
  private lastWriteTs = 0;

  constructor(roomId = "global") {
    this.roomId = roomId;
  }

  init() {
    this.myId = `fb-${Math.random().toString(36).slice(2, 10)}`;
    this.myName = `Survivor-${this.myId.slice(3, 7).toUpperCase()}`;

    // Dynamic import so Firebase is only loaded when actually used
    import("./firebase").then((FB) => {
      const db = FB.getFirebaseDb();
      if (!db) { this.connected = false; return; }

      const playerRef = FB.ref(db, `rooms/${this.roomId}/players/${this.myId}`);

      // Auto-remove player node on disconnect
      FB.onDisconnect(playerRef).remove();

      // Initial write
      FB.set(playerRef, {
        id: this.myId,
        name: this.myName,
        x: 0, y: 0, angle: 0,
        health: 100, kills: 0,
        ts: Date.now(),
      }).then(() => { this.connected = true; })
        .catch(() => { this.connected = false; });

      // Listen for all players in room
      const playersRef = FB.ref(db, `rooms/${this.roomId}/players`);
      const unsubPlayers = FB.onValue(playersRef, (snap) => {
        const data = snap.val() as Record<string, any> | null;
        this.others.clear();
        if (!data) return;
        const now = Date.now();
        for (const [key, val] of Object.entries(data)) {
          if (key === this.myId || !val) continue;
          // Skip stale entries (>20s old)
          if (val.ts && now - val.ts > 20000) continue;
          this.others.set(key, {
            id: key,
            name: val.name ?? "Unknown",
            x: val.x ?? 0,
            y: val.y ?? 0,
            angle: val.angle ?? 0,
            health: val.health ?? 100,
            kills: val.kills ?? 0,
            lastSeen: val.ts ?? now,
          });
        }
      }, () => { this.connected = false; });
      this.unsubscribers.push(unsubPlayers);

      // Listen for chat (last 30 messages)
      const chatRef = FB.query(FB.ref(db, `rooms/${this.roomId}/chat`), FB.limitToLast(30));
      const unsubChat = FB.onValue(chatRef, (snap) => {
        const data = snap.val() as Record<string, any> | null;
        if (!data) return;
        for (const [key, val] of Object.entries(data)) {
          if (this.seenChatKeys.has(key)) continue;
          this.seenChatKeys.add(key);
          // Skip our own messages and old ones from before we joined
          if (val.id === this.myId) continue;
          if (val.ts && Date.now() - val.ts > 60000) continue;
          this.onChat?.({ id: val.id, name: val.name, text: val.text, ts: val.ts });
        }
        // Prevent unbounded growth
        if (this.seenChatKeys.size > 200) {
          this.seenChatKeys = new Set(Array.from(this.seenChatKeys).slice(-100));
        }
      });
      this.unsubscribers.push(unsubChat);

      // Listen for PvP events
      const pvpRef = FB.query(FB.ref(db, `rooms/${this.roomId}/pvp`), FB.limitToLast(20));
      const unsubPvp = FB.onValue(pvpRef, (snap) => {
        const data = snap.val() as Record<string, any> | null;
        if (!data) return;
        for (const [key, val] of Object.entries(data)) {
          if (this.seenPvpKeys.has(key)) continue;
          this.seenPvpKeys.add(key);
          if (val.fromId === this.myId) continue;
          if (val.ts && Date.now() - val.ts > 15000) continue;
          this.onPvP?.({
            fromId: val.fromId, fromName: val.fromName,
            targetId: val.targetId, damage: val.damage,
            weapon: val.weapon, ts: val.ts, isKill: val.isKill,
          });
        }
        if (this.seenPvpKeys.size > 100) {
          this.seenPvpKeys = new Set(Array.from(this.seenPvpKeys).slice(-50));
        }
      });
      this.unsubscribers.push(unsubPvp);
    }).catch(() => { this.connected = false; });

    return { myId: this.myId, myName: this.myName };
  }

  broadcast(_msg: NetMessage) { /* Firebase uses direct writes, not broadcast */ }

  setState(x: number, y: number, angle: number, health: number, kills: number) {
    this.myState = { x, y, angle, health, kills };
  }

  getActivePlayers(): OnlinePlayer[] {
    const now = Date.now();
    for (const [id, p] of this.others) {
      if (now - p.lastSeen > TIMEOUT) this.others.delete(id);
    }
    return Array.from(this.others.values());
  }

  getMyInfo() { return { myId: this.myId, myName: this.myName }; }
  setOnChat(fn: (msg: { id: string; name: string; text: string; ts: number }) => void) { this.onChat = fn; }
  setOnPvP(fn: (msg: { fromId: string; fromName: string; targetId: string; damage: number; weapon: string; ts: number; isKill: boolean }) => void) { this.onPvP = fn; }

  sendChat(text: string) {
    import("./firebase").then((FB) => {
      const db = FB.getFirebaseDb();
      if (!db) return;
      FB.push(FB.ref(db, `rooms/${this.roomId}/chat`), {
        id: this.myId, name: this.myName,
        text: text.slice(0, 200), ts: Date.now(),
      }).catch(() => {});
    });
  }

  sendPvPDamage(targetId: string, damage: number, weapon: string, isKill: boolean) {
    import("./firebase").then((FB) => {
      const db = FB.getFirebaseDb();
      if (!db) return;
      FB.push(FB.ref(db, `rooms/${this.roomId}/pvp`), {
        fromId: this.myId, fromName: this.myName,
        targetId, damage: Math.round(damage), weapon,
        isKill, ts: Date.now(),
      }).catch(() => {});
    });
  }

  update(dt: number) {
    this.stateTimer += dt * 1000;
    // Throttle to 5Hz to stay well within Firebase free-tier limits
    if (this.stateTimer < 200) return;
    this.stateTimer = 0;

    const now = Date.now();
    // Extra guard against write storms
    if (now - this.lastWriteTs < 180) return;
    this.lastWriteTs = now;

    import("./firebase").then((FB) => {
      const db = FB.getFirebaseDb();
      if (!db) return;
      const start = performance.now();
      FB.set(FB.ref(db, `rooms/${this.roomId}/players/${this.myId}`), {
        id: this.myId,
        name: this.myName,
        x: Math.round(this.myState.x * 100) / 100,
        y: Math.round(this.myState.y * 100) / 100,
        angle: Math.round(this.myState.angle * 100) / 100,
        health: Math.round(this.myState.health),
        kills: this.myState.kills,
        ts: now,
      }).then(() => {
        this.latency = Math.round(performance.now() - start);
        this.connected = true;
      }).catch(() => { this.connected = false; });
    });
  }

  getPlayerCount() { return this.others.size + 1; }

  destroy() {
    for (const unsub of this.unsubscribers) {
      try { unsub(); } catch { /* ignore */ }
    }
    this.unsubscribers = [];
    import("./firebase").then((FB) => {
      const db = FB.getFirebaseDb();
      if (!db) return;
      FB.remove(FB.ref(db, `rooms/${this.roomId}/players/${this.myId}`)).catch(() => {});
    });
    this.connected = false;
  }
}

class WebSocketAdapter implements NetworkAdapter {
  name = "WebSocket";
  connected = false;
  latency = 0;
  private ws: WebSocket | null = null;
  private myId = "";
  private myName = "";
  /** Room the player is in — sent to the server so privileged
   *  operations can be scoped to the right room. */
  private myRoom = "global";
  private myState = { x: 0, y: 0, angle: 0, health: 100, kills: 0 };
  private others = new Map<string, OnlinePlayer>();
  private onChat: ((msg: { id: string; name: string; text: string; ts: number }) => void) | null = null;
  private onPvP: ((msg: { fromId: string; fromName: string; targetId: string; damage: number; weapon: string; ts: number; isKill: boolean }) => void) | null = null;
  private stateTimer = 0;
  private heartbeatTimer = 0;
  private pingStart = 0;
  private constructor(private url: string) {}

  static create(url: string): WebSocketAdapter {
    return new WebSocketAdapter(url);
  }

  init() {
    this.myId = `ws-${Math.random().toString(36).slice(2, 10)}`;
    this.myName = `Survivor-${this.myId.slice(2, 6).toUpperCase()}`;
    try {
      this.myRoom = localStorage.getItem("knox-room") || "global";
    } catch { /* ignore */ }

    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        this.connected = true;
        this.broadcast({
          type: "join", id: this.myId, name: this.myName, x: 0, y: 0, angle: 0,
          health: 100, kills: 0, ts: Date.now(),
          // Room is sent so the server can scope privileged operations.
          ...({ room: this.myRoom } as Record<string, unknown>),
        } as NetMessage);
      };
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as NetMessage;
          this.handle(msg);
        } catch { /* ignore */ }
      };
      this.ws.onclose = () => { this.connected = false; };
      this.ws.onerror = () => { this.connected = false; };
    } catch {
      console.warn("WebSocket connection failed, falling back to BroadcastChannel");
    }

    return { myId: this.myId, myName: this.myName };
  }

  broadcast(msg: NetMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  setState(x: number, y: number, angle: number, health: number, kills: number) {
    this.myState = { x, y, angle, health, kills };
  }

  getActivePlayers(): OnlinePlayer[] {
    const now = Date.now();
    for (const [id, p] of this.others) {
      if (now - p.lastSeen > TIMEOUT) this.others.delete(id);
    }
    return Array.from(this.others.values());
  }

  getMyInfo() { return { myId: this.myId, myName: this.myName }; }
  setOnChat(fn: (msg: { id: string; name: string; text: string; ts: number }) => void) { this.onChat = fn; }
  setOnPvP(fn: (msg: { fromId: string; fromName: string; targetId: string; damage: number; weapon: string; ts: number; isKill: boolean }) => void) { this.onPvP = fn; }
  sendChat(text: string) {
    this.broadcast({ type: "chat", id: this.myId, name: this.myName, x: this.myState.x, y: this.myState.y, angle: this.myState.angle, health: this.myState.health, kills: this.myState.kills, ts: Date.now(), chatText: text });
  }
  sendPvPDamage(targetId: string, damage: number, weapon: string, isKill: boolean) {
    this.broadcast({ type: isKill ? "pvp-kill" : "pvp-damage", id: this.myId, name: this.myName, x: this.myState.x, y: this.myState.y, angle: this.myState.angle, health: this.myState.health, kills: this.myState.kills, ts: Date.now(), targetId, damage, weapon });
  }

  update(dt: number) {
    this.stateTimer += dt * 1000;
    this.heartbeatTimer += dt * 1000;
    if (this.stateTimer >= 100) {
      this.stateTimer = 0;
      this.broadcast({
        type: "state", id: this.myId, name: this.myName, x: this.myState.x, y: this.myState.y,
        angle: this.myState.angle, health: this.myState.health, kills: this.myState.kills,
        ts: Date.now(), ...({ room: this.myRoom } as Record<string, unknown>),
      } as NetMessage);
    }
    if (this.heartbeatTimer >= HEARTBEAT_INTERVAL) {
      this.heartbeatTimer = 0;
      this.broadcast({
        type: "heartbeat", id: this.myId, name: this.myName, x: this.myState.x, y: this.myState.y,
        angle: this.myState.angle, health: this.myState.health, kills: this.myState.kills,
        ts: Date.now(), ...({ room: this.myRoom } as Record<string, unknown>),
      } as NetMessage);
      this.pingStart = Date.now();
    }
  }

  getPlayerCount() { return this.others.size + 1; }

  destroy() {
    this.broadcast({ type: "leave", id: this.myId, name: this.myName, x: 0, y: 0, angle: 0, health: 100, kills: 0, ts: Date.now() });
    this.ws?.close();
    this.ws = null;
  }

  private handle(msg: NetMessage) {
    if (msg.id === this.myId) return;
    if (msg.type === "ping" && this.pingStart > 0) {
      this.latency = Date.now() - this.pingStart;
      this.pingStart = 0;
      return;
    }
    if (msg.type === "join" || msg.type === "state" || msg.type === "heartbeat" || msg.type === "voice-status") {
      this.others.set(msg.id, {
        id: msg.id,
        name: msg.name,
        x: msg.x,
        y: msg.y,
        angle: msg.angle,
        health: msg.health,
        kills: msg.kills,
        lastSeen: msg.ts ?? Date.now(),
        isSpeaking: msg.voiceSpeaking,
      });
      if (msg.voiceSpeaking) {
        VoiceChat.setRemoteSpeaker(msg.id, msg.name, msg.voiceVolume ?? 0.8, false);
      }
    } else if (msg.type === "leave") {
      this.others.delete(msg.id);
    } else if (msg.type === "chat" && msg.chatText && this.onChat) {
      this.onChat({ id: msg.id, name: msg.name, text: msg.chatText, ts: msg.ts });
    } else if ((msg.type === "pvp-damage" || msg.type === "pvp-kill") && this.onPvP && msg.targetId && msg.damage != null) {
      this.onPvP({ fromId: msg.id, fromName: msg.name, targetId: msg.targetId, damage: msg.damage, weapon: msg.weapon ?? "fist", ts: msg.ts, isKill: msg.type === "pvp-kill" });
    }
  }
}

// ============================================================
//  Server Manager (singleton)
// ============================================================

class ServerManager {
  private adapter: NetworkAdapter | null = null;
  private config: ServerConfig = { backend: "broadcast" };

  getAdapter(): NetworkAdapter | null {
    return this.adapter;
  }

  isReady(): boolean {
    return this.adapter !== null && this.adapter.connected;
  }

  getServerInfo() {
    return {
      backend: this.config.backend,
      connected: this.adapter?.connected ?? false,
      latency: this.adapter?.latency ?? 0,
      players: this.adapter?.getPlayerCount() ?? 0,
    };
  }

  connect(config: ServerConfig): NetworkAdapter {
    this.config = config;
    this.disconnect();

    switch (config.backend) {
      case "firebase":
        this.adapter = new FirebaseAdapter(config.roomId ?? "global");
        break;
      case "websocket":
        if (config.wsUrl) {
          this.adapter = WebSocketAdapter.create(config.wsUrl);
        } else {
          this.adapter = new BroadcastChannelAdapter();
        }
        break;
      default:
        this.adapter = new BroadcastChannelAdapter();
        break;
    }

    this.adapter.init();
    return this.adapter;
  }

  disconnect() {
    this.adapter?.destroy();
    this.adapter = null;
  }
}

export const Server = new ServerManager();

// ============================================================
//  Legacy API (backwards compatible)
// ============================================================

const myId = `p-${Math.random().toString(36).slice(2, 10)}`;
const myName = `Survivor-${myId.slice(2, 6).toUpperCase()}`;

function legacyInit() {
  // If an adapter is already connected (e.g. user picked Firebase in the
  // Server panel before starting), reuse it instead of resetting to local.
  const existing = Server.getAdapter();
  if (existing) {
    return { myId: existing.getMyInfo().myId, myName: existing.getMyInfo().myName };
  }

  // Read saved preference, default to Firebase for real cross-device play
  let backend: ServerConfig["backend"] = "firebase";
  let roomId = "global";
  try {
    const saved = localStorage.getItem("knox-backend");
    if (saved === "broadcast" || saved === "websocket" || saved === "firebase") backend = saved;
    roomId = localStorage.getItem("knox-room") || "global";
  } catch { /* ignore */ }

  const wsUrl = (() => { try { return localStorage.getItem("knox-ws-url") ?? undefined; } catch { return undefined; } })();
  const adapter = Server.connect({ backend, roomId, wsUrl });
  return { myId: adapter.getMyInfo().myId, myName: adapter.getMyInfo().myName };
}

function legacySetState(x: number, y: number, angle: number, health: number, kills: number) {
  Server.getAdapter()?.setState(x, y, angle, health, kills);
}

function legacyUpdate(dt: number) {
  Server.getAdapter()?.update(dt);
}

function legacyGetActivePlayers(): OnlinePlayer[] {
  return Server.getAdapter()?.getActivePlayers() ?? [];
}

function legacySendChat(text: string) {
  Server.getAdapter()?.sendChat(text);
}

function legacySetOnChat(fn: (msg: { id: string; name: string; text: string; ts: number }) => void) {
  Server.getAdapter()?.setOnChat(fn);
}

function legacySetOnPvP(fn: (msg: { fromId: string; fromName: string; targetId: string; damage: number; weapon: string; ts: number; isKill: boolean }) => void) {
  Server.getAdapter()?.setOnPvP(fn);
}

function legacySendPvPDamage(targetId: string, damage: number, weapon: string, isKill: boolean) {
  Server.getAdapter()?.sendPvPDamage(targetId, damage, weapon, isKill);
}

function legacyDestroy() {
  Server.disconnect();
}

export const Net = {
  init: legacyInit,
  update: legacyUpdate,
  setState: legacySetState,
  getActivePlayers: legacyGetActivePlayers,
  getMyInfo: () => Server.getAdapter()?.getMyInfo() ?? { myId, myName },
  setOnChat: legacySetOnChat,
  setOnPvP: legacySetOnPvP,
  sendChat: legacySendChat,
  sendPvPDamage: legacySendPvPDamage,
  destroy: legacyDestroy,
};
