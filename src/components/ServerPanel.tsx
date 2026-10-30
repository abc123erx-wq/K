import { useState } from "react";
import { Server } from "../game/net";

interface ServerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (config: { backend: string; url: string }) => void;
}

const SERVER_PRESETS = [
  {
    name: "🔥 Firebase Realtime (Recomendado)",
    backend: "firebase",
    url: "",
    description: "Multiplayer real entre dispositivos diferentes. Já configurado e pronto.",
    latency: "~80-200ms",
  },
  {
    name: "🌐 Local Broadcast (Same Browser Tabs)",
    backend: "broadcast",
    url: "",
    description: "Open multiple tabs to play together. No server needed.",
    latency: "~0ms",
  },
  {
    name: "🔗 Local WebSocket Server",
    backend: "websocket",
    url: "ws://localhost:8080",
    description: "Run the included Node.js server locally for real multiplayer.",
    latency: "<10ms",
  },
  {
    name: "☁️ Railway Cloud Server",
    backend: "websocket",
    url: "wss://your-app.up.railway.app:8080",
    description: "Deploy to Railway. Free tier available. Game saves cross-tab.",
    latency: "~50-100ms",
  },
  {
    name: "☁️ Fly.io Edge Server",
    backend: "websocket",
    url: "wss://your-app.fly.dev:8080",
    description: "Deploy to Fly.io. Low latency with edge locations.",
    latency: "~20-60ms",
  },
  {
    name: "☁️ Render Cloud Server",
    backend: "websocket",
    url: "wss://your-app.onrender.com:8080",
    description: "Deploy to Render. Free tier with cold start.",
    latency: "~30-80ms",
  },
  {
    name: "🔗 Custom WebSocket URL",
    backend: "websocket",
    url: "wss://your-server.com:8080",
    description: "Connect to any WebSocket server endpoint.",
    latency: "varies",
  },
];

export default function ServerPanel({ isOpen, onClose, onConnect }: ServerPanelProps) {
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [customUrl, setCustomUrl] = useState("");
  const [customName, setCustomName] = useState("Zomboid-Server-1");
  const [roomId, setRoomId] = useState(() => {
    try { return localStorage.getItem("knox-room") || "global"; } catch { return "global"; }
  });
  const [connecting, setConnecting] = useState(false);
  const serverInfo = Server.getServerInfo();

  if (!isOpen) return null;

  const connect = () => {
    setConnecting(true);
    const preset = SERVER_PRESETS[selectedPreset];
    const url = preset.url.includes("your-") ? customUrl : preset.url;
    const room = roomId.trim() || "global";

    // Persist preference so the game engine reconnects with the same backend
    try {
      localStorage.setItem("knox-backend", preset.backend);
      localStorage.setItem("knox-room", room);
      if (url) localStorage.setItem("knox-ws-url", url);
    } catch { /* ignore */ }

    // Connect immediately so the panel shows live status
    Server.connect({
      backend: preset.backend as "broadcast" | "websocket" | "firebase" | "photon",
      wsUrl: url || undefined,
      roomId: room,
    });

    onConnect({ backend: preset.backend, url });
    setTimeout(() => setConnecting(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto border border-[#2a2a2a] bg-[#0d0d0d] shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#2a2a2a] bg-[#0d0d0d] p-4">
          <div>
            <h2 className="text-xl font-black uppercase tracking-widest text-[#d96b3a]">🌐 Server Configuration</h2>
            <p className="text-[10px] uppercase tracking-widest text-zinc-600">Choose your multiplayer backend</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center border border-[#2a2a2a] text-zinc-400 hover:bg-[#2a1714] hover:text-[#d96b3a]">✕</button>
        </div>

        <div className="p-6">
          {/* Current Status */}
          <div className="mb-6 border border-[#2a2a2a] bg-black p-4">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className={`text-lg font-black ${serverInfo.connected ? "text-[#4aff4a]" : "text-red-500"}`}>
                  {serverInfo.connected ? "●" : "○"}
                </p>
                <p className="text-[9px] uppercase tracking-widest text-zinc-500">Status</p>
              </div>
              <div>
                <p className="text-lg font-black text-[#d7c9a7]">{serverInfo.backend}</p>
                <p className="text-[9px] uppercase tracking-widest text-zinc-500">Backend</p>
              </div>
              <div>
                <p className="text-lg font-black text-[#d96b3a]">{serverInfo.latency}ms</p>
                <p className="text-[9px] uppercase tracking-widest text-zinc-500">Latency</p>
              </div>
              <div>
                <p className="text-lg font-black text-blue-400">{serverInfo.players}</p>
                <p className="text-[9px] uppercase tracking-widest text-zinc-500">Players</p>
              </div>
            </div>
          </div>

          {/* Server Presets */}
          <div className="mb-6">
            <h3 className="mb-3 text-[10px] uppercase tracking-widest text-[#7f936f]">Server Options</h3>
            <div className="space-y-2">
              {SERVER_PRESETS.map((preset, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedPreset(i)}
                  className={`cursor-pointer border p-4 transition-all ${
                    selectedPreset === i
                      ? "border-[#d96b3a] bg-[#2a1714]"
                      : "border-[#2a2a2a] bg-[#151515] hover:border-[#4a5c45]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-200">{preset.name}</span>
                    <span className="text-[10px] text-zinc-500">{preset.latency}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-500">{preset.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Room / Lobby code */}
          <div className="mb-6 border border-[#4a5c45]/40 bg-[#151515] p-4">
            <h3 className="mb-2 text-[10px] uppercase tracking-widest text-[#7f936f]">🚪 Sala / Lobby</h3>
            <p className="mb-3 text-[10px] text-zinc-500">
              Jogadores na mesma sala se veem no mapa. Use <span className="text-[#d7c9a7]">global</span> para o servidor público
              ou crie um código privado com seus amigos.
            </p>
            <div className="flex gap-2">
              <input
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24))}
                placeholder="global"
                className="flex-1 border border-[#2a2a2a] bg-black px-3 py-2 text-xs text-zinc-200 outline-none focus:border-[#4a5c45]"
              />
              <button
                onClick={() => setRoomId("global")}
                className="border border-[#2a2a2a] px-3 py-2 text-[10px] uppercase text-zinc-400 hover:border-[#4a5c45]"
              >
                Público
              </button>
              <button
                onClick={() => setRoomId(Math.random().toString(36).slice(2, 8).toUpperCase())}
                className="border border-[#4a5c45] bg-[#1f2521] px-3 py-2 text-[10px] uppercase text-[#cdd7bf] hover:bg-[#2b352e]"
              >
                Gerar Código
              </button>
            </div>
          </div>

          {/* Custom URL */}
          {SERVER_PRESETS[selectedPreset].url.includes("your-") && (
            <div className="mb-6 border border-[#2a2a2a] bg-[#151515] p-4">
              <h3 className="mb-3 text-[10px] uppercase tracking-widest text-[#7f936f]">Custom Server URL</h3>
              <div className="flex gap-2">
                <input
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="wss://your-server.com:8080"
                  className="flex-1 border border-[#2a2a2a] bg-black px-3 py-2 text-xs text-zinc-200 outline-none focus:border-[#4a5c45]"
                />
                <input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Server Name"
                  className="w-48 border border-[#2a2a2a] bg-black px-3 py-2 text-xs text-zinc-200 outline-none focus:border-[#4a5c45]"
                />
              </div>
            </div>
          )}

          {/* Deployment Guide */}
          <div className="mb-6 border border-[#2a2a2a] bg-[#151515] p-4">
            <h3 className="mb-3 text-[10px] uppercase tracking-widest text-[#7f936f]">🚀 Deploy Your Own Server</h3>
            <div className="space-y-3 text-xs text-zinc-400">
              <div className="border border-[#1f2521] bg-black p-3">
                <p className="font-bold text-[#d7c9a7]">Option 1: Local Development</p>
                <pre className="mt-1 text-[10px] text-zinc-500">
{`cd server
npm install ws
node ws-server.mjs`}
                </pre>
                <p className="mt-1 text-[9px] text-zinc-600">Server runs on ws://localhost:8080</p>
              </div>

              <div className="border border-[#1f2521] bg-black p-3">
                <p className="font-bold text-[#d7c9a7]">Option 2: Deploy to Railway (Free)</p>
                <pre className="mt-1 text-[10px] text-zinc-500">
{`1. Go to railway.app
2. Create new project
3. Add service → Deploy from GitHub
4. Point to server/ws-server.mjs
5. Railway auto-deploys WebSocket server
6. Copy URL → paste above`}
                </pre>
              </div>

              <div className="border border-[#1f2521] bg-black p-3">
                <p className="font-bold text-[#d7c9a7]">Option 3: Deploy to Fly.io (Edge)</p>
                <pre className="mt-1 text-[10px] text-zinc-500">
{`1. Install flyctl: curl -L https://fly.io/install.sh
2. fly launch
3. fly deploy
4. fly status → get URL
5. Connect with wss://<app>.fly.dev`}
                </pre>
              </div>

              <div className="border border-[#1f2521] bg-black p-3">
                <p className="font-bold text-[#d7c9a7]">Option 4: Deploy to AWS EC2</p>
                <pre className="mt-1 text-[10px] text-zinc-500">
{`1. Launch EC2 instance (t2.micro free tier)
2. Install Node.js
3. Upload server/ws-server.mjs
4. Run: node ws-server.mjs
5. Open port 8080 in security group
6. Connect with wss://<ip>:8080`}
                </pre>
              </div>

              <div className="border border-[#1f2521] bg-black p-3">
                <p className="font-bold text-[#d7c9a7]">Option 5: Render (Free with cold start)</p>
                <pre className="mt-1 text-[10px] text-zinc-500">
{`1. Go to render.com
2. New → Web Service
3. Connect GitHub repo
4. Build: npm install
5. Start: node server/ws-server.mjs
6. Render gives URL automatically`}
                </pre>
              </div>
            </div>
          </div>

          {/* Connect Button */}
          <div className="flex gap-3">
            <button
              onClick={connect}
              disabled={connecting}
              className="flex-1 bg-[#8a2f22] py-3 text-sm font-black uppercase tracking-widest text-zinc-100 hover:bg-[#b5452e] disabled:opacity-50"
            >
              {connecting ? "Connecting..." : `🔗 Connect to ${SERVER_PRESETS[selectedPreset].name.split(" ").slice(1).join(" ")}`}
            </button>
            <button
              onClick={onClose}
              className="border border-[#2a2a2a] px-6 py-3 text-sm uppercase tracking-widest text-zinc-400 hover:bg-[#1f2521]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
