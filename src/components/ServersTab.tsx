// ═══════════════════════════════════════════════════════════════
//  SERVERS TAB — Firebase / multiplayer administration (admin only)
//  Switch backend, manage the room, control PvP, see who is online.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import type { GameEngine } from "../game/engine";
import type { GameSnapshot } from "../game/types";
import { Server, type ServerConfig } from "../game/net";

interface ServersTabProps {
  engineRef: React.RefObject<GameEngine | null>;
  snapshot: GameSnapshot;
  onLog: (line: string) => void;
}

type Backend = "firebase" | "broadcast" | "websocket";

const BACKENDS: { id: Backend; label: string; icon: string; desc: string }[] = [
  { id: "firebase", label: "Firebase Realtime", icon: "🔥", desc: "Cross-device, sala compartilhada na nuvem" },
  { id: "broadcast", label: "Broadcast local", icon: "📡", desc: "Somente abas do mesmo navegador" },
  { id: "websocket", label: "WebSocket dedicado", icon: "🔌", desc: "Servidor próprio (ws:// ou wss://)" },
];

function readStored(): { backend: Backend; roomId: string; wsUrl: string } {
  try {
    const backend = localStorage.getItem("knox-backend");
    const valid: Backend[] = ["firebase", "broadcast", "websocket"];
    return {
      backend: valid.includes(backend as Backend) ? (backend as Backend) : "firebase",
      roomId: localStorage.getItem("knox-room") || "global",
      wsUrl: localStorage.getItem("knox-ws-url") || "",
    };
  } catch {
    return { backend: "firebase", roomId: "global", wsUrl: "" };
  }
}

export default function ServersTab({ engineRef, snapshot, onLog }: ServersTabProps) {
  const stored = useMemo(readStored, []);
  const [backend, setBackend] = useState<Backend>(stored.backend);
  const [roomId, setRoomId] = useState(stored.roomId);
  const [wsUrl, setWsUrl] = useState(stored.wsUrl);
  const [info, setInfo] = useState(() => Server.getServerInfo());
  const [flash, setFlash] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  // Poll server info so the status card stays live
  useEffect(() => {
    const id = window.setInterval(() => setInfo(Server.getServerInfo()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const say = (text: string) => {
    setFlash(text);
    onLog(text);
    window.setTimeout(() => setFlash(null), 3000);
  };

  function apply() {
    const engine = engineRef.current;
    if (!engine) {
      say("⚠️ Inicie uma partida antes de trocar o servidor.");
      return;
    }
    const room = roomId.trim() || "global";
    const config: ServerConfig =
      backend === "websocket"
        ? { backend: "websocket", wsUrl: wsUrl.trim() || undefined, roomId: room }
        : { backend, roomId: room };
    engine.switchServer(config);
    setInfo(Server.getServerInfo());
    say(`Servidor trocado para ${backend} · sala "${room}".`);
  }

  function quickRoom(name: string) {
    setRoomId(name);
  }

  return (
    <div className="space-y-4">
      {/* ── Live status ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          {
            label: "Backend",
            value: info.backend,
            tone: info.backend === "firebase" ? "#e8764a" : "#8ab0cc",
          },
          {
            label: "Conexão",
            value: info.connected ? "online" : "offline",
            tone: info.connected ? "#7fc25a" : "#b5452e",
          },
          { label: "Latência", value: `${info.latency}ms`, tone: info.latency > 180 ? "#e8764a" : "#7fc25a" },
          { label: "Jogadores", value: `${info.players}`, tone: "#e8b64a" },
        ].map((s) => (
          <div key={s.label} className="border border-[#1f2521] bg-[#0a0a0a] p-2.5">
            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#6b6055]">{s.label}</p>
            <p className="mt-0.5 font-mono text-sm font-bold leading-none capitalize" style={{ color: s.tone }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Backend selector ───────────────────────────────────── */}
      <div className="border border-[#1f2521] bg-[#0a0a0a] p-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-[#7f936f]">🌐 Backend de rede</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {BACKENDS.map((b) => (
            <button
              key={b.id}
              onClick={() => setBackend(b.id)}
              className={`border p-2.5 text-left transition-colors ${
                backend === b.id
                  ? "border-[#d96b3a] bg-[#2a1714]"
                  : "border-[#2a2a2a] bg-black hover:border-[#4a5c45]"
              }`}
            >
              <p className="font-mono text-[11px] font-bold text-zinc-200">{b.icon} {b.label}</p>
              <p className="mt-0.5 font-mono text-[9px] leading-snug text-zinc-600">{b.desc}</p>
            </button>
          ))}
        </div>

        {backend === "websocket" && (
          <input
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            placeholder="wss://seu-servidor.com:8080"
            className="mt-2 w-full border border-[#2a2a2a] bg-black px-3 py-2 font-mono text-xs text-zinc-200 outline-none focus:border-[#d96b3a]"
          />
        )}
      </div>

      {/* ── Room ───────────────────────────────────────────────── */}
      <div className="border border-[#1f2521] bg-[#0a0a0a] p-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-[#7f936f]">🚪 Sala / Lobby</p>
        <div className="flex gap-2">
          <input
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24))}
            placeholder="global"
            className="flex-1 border border-[#2a2a2a] bg-black px-3 py-2 font-mono text-xs text-zinc-200 outline-none focus:border-[#d96b3a]"
          />
          <button
            onClick={() => quickRoom("global")}
            className="border border-[#2a2a2a] px-3 py-2 font-mono text-[9px] uppercase text-zinc-400 hover:border-[#4a5c45]"
          >
            global
          </button>
          <button
            onClick={() => quickRoom(Math.random().toString(36).slice(2, 8).toUpperCase())}
            className="border border-[#4a5c45] bg-[#1f2521] px-3 py-2 font-mono text-[9px] uppercase text-[#cdd7bf] hover:bg-[#2b352e]"
          >
            gerar
          </button>
        </div>

        <button
          onClick={apply}
          className="mt-2 w-full border border-[#d96b3a] bg-[#2a1714] py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[#d96b3a] hover:bg-[#3a2218]"
        >
          🔄 Aplicar e reconectar
        </button>
        <p className="mt-1.5 font-mono text-[9px] leading-relaxed text-zinc-600">
          Todos que entrarem na sala <span className="text-[#d7c9a7]">"{roomId || "global"}"</span> se veem no mapa,
          no chat e nos eventos PvP.
        </p>
      </div>

      {/* ── PvP controls ──────────────────────────────────────── */}
      <div className="border border-[#5a2b24]/50 bg-[#150c0a]/60 p-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-[#d96b3a]">⚔️ PvP</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              engineRef.current?.togglePvP();
              onLog(`PvP ${!snapshot.pvpEnabled ? "ativado" : "desativado"}.`);
            }}
            className={`border px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest ${
              snapshot.pvpEnabled
                ? "animate-pulse border-red-600 bg-red-950 text-red-400"
                : "border-[#4a5c45] bg-[#0f1a10] text-[#7fc25a]"
            }`}
          >
            {snapshot.pvpEnabled ? "⚔️ PvP ATIVO — desligar" : "🤝 PvP desligado — ativar"}
          </button>
          <button
            onClick={() => {
              for (const p of snapshot.onlinePlayers) {
                engineRef.current?.receivePvP({
                  fromId: "admin",
                  fromName: "Admin",
                  targetId: p.id,
                  damage: 0,
                  weapon: "admin",
                  ts: Date.now(),
                  isKill: false,
                });
              }
              onLog("Revisto jogadores online.");
            }}
            className="border border-[#2a2a2a] bg-[#0a0a0a] px-4 py-2.5 font-mono text-[11px] uppercase text-zinc-400 hover:border-[#4a5c45]"
          >
            🔄 Atualizar lista
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#2a1714] pt-3">
          {[
            { label: "Seus kills", value: snapshot.pvpKills },
            { label: "Suas mortes", value: snapshot.pvpDeaths },
            { label: "K/D", value: snapshot.pvpDeaths === 0 ? snapshot.pvpKills : (snapshot.pvpKills / snapshot.pvpDeaths).toFixed(2) },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-mono text-lg font-bold leading-none text-[#e8b64a]">{s.value}</p>
              <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-[#6b6055]">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Online players ────────────────────────────────────── */}
      <div className="border border-[#1f2521] bg-[#0a0a0a] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#7f936f]">
            👥 Jogadores online ({snapshot.onlinePlayers.length + 1})
          </p>
          <span className="font-mono text-[9px] text-zinc-600">você incluso</span>
        </div>

        <div className="max-h-40 space-y-1 overflow-y-auto">
          <div className="flex items-center justify-between border-b border-[#1a1510] py-1.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#7fc25a]" />
              <span className="font-mono text-[11px] text-[#7fc25a]">{snapshot.myPlayerName} (você)</span>
            </div>
            <span className="font-mono text-[9px] text-zinc-600">
              {snapshot.position.x}, {snapshot.position.y}
            </span>
          </div>
          {snapshot.onlinePlayers.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-b border-[#1a1510] py-1.5">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${p.health > 0 ? "bg-[#8ab0cc]" : "bg-[#5a2b24]"}`} />
                <span className="font-mono text-[11px] text-[#8ab0cc]">{p.name}</span>
              </div>
              <div className="flex items-center gap-3 font-mono text-[9px] text-zinc-600">
                <span>{Math.round(p.health)} hp</span>
                <span>{p.kills} kills</span>
                <span>
                  {Math.round(p.x)}, {Math.round(p.y)}
                </span>
              </div>
            </div>
          ))}
          {snapshot.onlinePlayers.length === 0 && (
            <p className="py-3 text-center font-mono text-[10px] text-zinc-600">
              Ninguém mais na sala. Compartilhe o código da sala para jogarem juntos.
            </p>
          )}
        </div>
      </div>

      {/* ── Broadcast ─────────────────────────────────────────── */}
      <div className="border border-[#1f2521] bg-[#0a0a0a] p-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-[#7f936f]">📣 Anúncio global</p>
        <div className="flex gap-2">
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && msg.trim()) {
                engineRef.current?.sendChat(`[ADMIN] ${msg.trim()}`);
                onLog(`Anúncio enviado: "${msg.trim()}"`);
                setMsg("");
              }
            }}
            placeholder="Mensagem para todos na sala..."
            className="flex-1 border border-[#2a2a2a] bg-black px-3 py-2 font-mono text-xs text-zinc-200 outline-none focus:border-[#d96b3a]"
          />
          <button
            onClick={() => {
              if (!msg.trim()) return;
              engineRef.current?.sendChat(`[ADMIN] ${msg.trim()}`);
              onLog(`Anúncio enviado: "${msg.trim()}"`);
              setMsg("");
            }}
            className="border border-[#4a5c45] bg-[#1f2521] px-4 py-2 font-mono text-[11px] uppercase text-[#cdd7bf] hover:bg-[#2b352e]"
          >
            Enviar
          </button>
        </div>
      </div>

      {/* ── PvP kill log ─────────────────────────────────────── */}
      {snapshot.pvpKillLog.length > 0 && (
        <div className="border border-[#1f2521] bg-[#0a0a0a] p-3">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-[#7f936f]">📜 Registro de mortes</p>
          <div className="max-h-32 space-y-1 overflow-y-auto font-mono text-[10px]">
            {snapshot.pvpKillLog.map((k, i) => (
              <p key={i} className="text-zinc-500">
                <span className="text-red-400">{k.killer}</span> → {k.victim}{" "}
                <span className="text-zinc-700">({k.weapon})</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {flash && (
        <div className="border border-[#7fc25a] bg-[#0f1a10] px-4 py-2 font-mono text-[11px] text-[#7fc25a]">
          {flash}
        </div>
      )}
    </div>
  );
}
