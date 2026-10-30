// ============================================================
// MOBILE CONTROLS — Dedicated full-featured mobile UI
// Touch joystick, aim pad, action buttons, hotbar, gestures
// Adaptive layout for portrait/landscape orientation
// ============================================================

import { useEffect, useRef, useState } from "react";
import type { GameEngine } from "../game/engine";
import type { GameSnapshot } from "../game/types";
import { VoiceChat } from "../game/voiceChat";

interface MobileControlsProps {
  engineRef: React.RefObject<GameEngine | null>;
  snapshot: GameSnapshot;
  panelOpen: boolean;
  onOpenPanel: (panel: "character" | "inventory" | "crafting" | "map") => void;
}

export default function MobileControls({ engineRef, snapshot, panelOpen, onOpenPanel }: MobileControlsProps) {
  const stickRef = useRef<HTMLDivElement | null>(null);
  const aimRef = useRef<HTMLDivElement | null>(null);
  const [stick, setStick] = useState({ x: 0, y: 0, active: false });
  const [aiming, setAiming] = useState(false);
  const [running, setRunning] = useState(false);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [showChat, setShowChat] = useState(false);
  const [chatText, setChatText] = useState("");
  const [autoAttack, setAutoAttack] = useState(false);
  // Touch-based device detection (also force-on with localStorage flag)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    if (localStorage.getItem("knox-force-mobile") === "1") return true;
    return window.matchMedia("(hover: none) and (pointer: coarse)").matches || window.innerWidth < 1024;
  });

  useEffect(() => {
    const check = () => {
      if (localStorage.getItem("knox-force-mobile") === "1") { setIsMobile(true); return; }
      setIsMobile(window.matchMedia("(hover: none) and (pointer: coarse)").matches || window.innerWidth < 1024);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Detect orientation
  useEffect(() => {
    const check = () => setOrientation(window.innerWidth > window.innerHeight ? "landscape" : "portrait");
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  // Prevent iOS Safari scroll/zoom
  useEffect(() => {
    const preventTouch = (e: TouchEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.touches.length > 1) e.preventDefault();
    };
    const preventGesture = (e: Event) => e.preventDefault();
    document.addEventListener("touchmove", preventTouch, { passive: false });
    document.addEventListener("gesturestart", preventGesture);
    return () => {
      document.removeEventListener("touchmove", preventTouch);
      document.removeEventListener("gesturestart", preventGesture);
    };
  }, []);

  // Auto-attack loop
  useEffect(() => {
    if (!autoAttack) return;
    const interval = setInterval(() => {
      engineRef.current?.mobileAttack();
    }, 600);
    return () => clearInterval(interval);
  }, [autoAttack, engineRef]);

  // Vibration feedback
  const vibrate = (ms = 30) => {
    if ("vibrate" in navigator) navigator.vibrate(ms);
  };

  // Joystick handlers
  const updateStick = (clientX: number, clientY: number) => {
    const rect = stickRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const max = rect.width * 0.36;
    const rawX = clientX - cx;
    const rawY = clientY - cy;
    const length = Math.hypot(rawX, rawY);
    const clamped = Math.min(max, length || 0);
    const nx = length ? (rawX / length) * clamped : 0;
    const ny = length ? (rawY / length) * clamped : 0;
    setStick({ x: nx, y: ny, active: true });
    engineRef.current?.setVirtualMove(nx / max, ny / max, running);
  };

  const stopStick = () => {
    setStick({ x: 0, y: 0, active: false });
    engineRef.current?.clearVirtualMove();
  };

  // Aim pad handlers
  const aim = (clientX: number, clientY: number) => {
    engineRef.current?.setAimFromClient(clientX, clientY);
  };

  const stats = snapshot.stats;
  const isLandscape = orientation === "landscape";
  const isDriving = !!snapshot.drivingVehicle;
  const lowHp = stats.health < 30;
  const lowStam = stats.stamina < 25;
  const hasGun = snapshot.equipped?.weapon?.mode === "firearm";

  const sendMessage = () => {
    if (chatText.trim()) {
      engineRef.current?.sendChat(chatText.trim());
      setChatText("");
    }
    setShowChat(false);
  };

  return (
    <div
      className={`game-touch-layer pointer-events-none fixed inset-0 z-40 h-[100dvh] w-[100dvw] select-none overflow-hidden ${isMobile ? "" : "hidden"}`}
      onTouchMove={(event) => {
        if ((event.target as HTMLElement | null)?.closest("input")) return;
        event.preventDefault();
      }}
    >
      {/* ============ TOP STATUS BAR ============ */}
      <div className="pointer-events-auto fixed left-2 right-2 top-[calc(0.5rem+env(safe-area-inset-top))] flex items-center gap-1 text-[9px] uppercase tracking-widest">
        <button onClick={() => { vibrate(); onOpenPanel("character"); }} className="flex items-center gap-1 border border-[#2a2a2a] bg-[#0d0d0d]/90 px-2 py-1.5 text-[#d7c9a7] backdrop-blur">
          <span className={`inline-block h-2 w-2 rounded-full ${lowHp ? "animate-pulse bg-red-500" : stats.health > 70 ? "bg-[#4a5c45]" : "bg-[#8a6a2a]"}`} />
          <span>{Math.round(stats.health)}</span>
        </button>
        <button onClick={() => { vibrate(); onOpenPanel("character"); }} className="flex items-center gap-1 border border-[#2a2a2a] bg-[#0d0d0d]/90 px-2 py-1.5 text-zinc-300 backdrop-blur">
          <span className={`inline-block h-2 w-2 rounded-full ${lowStam ? "bg-yellow-500" : "bg-[#4a5c45]"}`} />
          <span>{Math.round(stats.stamina)}</span>
        </button>
        <div className="flex-1 border border-[#2a2a2a] bg-[#0d0d0d]/90 px-2 py-1.5 text-center text-zinc-400 backdrop-blur">
          <span className="text-[#d96b3a]">{String(snapshot.time.hour).padStart(2, "0")}:{String(snapshot.time.minute).padStart(2, "0")}</span>
          {snapshot.onlinePlayers.length > 0 && <span className="ml-2 text-blue-400">👥{snapshot.onlinePlayers.length}</span>}
          {snapshot.zombies.nearby > 0 && <span className="ml-2 text-red-400">🧟{snapshot.zombies.nearby}</span>}
          <span className="ml-2">{snapshot.weather === "clear" ? "☀" : snapshot.weather === "rain" ? "🌧" : snapshot.weather === "fog" ? "🌫" : snapshot.weather === "storm" ? "⛈" : "❄"}</span>
          {snapshot.pvpEnabled && <span className="ml-2 animate-pulse text-red-500">⚔️PvP</span>}
        </div>
        <button onClick={() => { vibrate(); onOpenPanel("inventory"); }} className="border border-[#2a2a2a] bg-[#0d0d0d]/90 px-2 py-1.5 text-[#d7c9a7] backdrop-blur">
          🎒{Math.floor(snapshot.weight)}/{Math.floor(snapshot.capacity)}
        </button>
        <button onClick={() => { vibrate(); engineRef.current?.togglePause(); }} className="border border-[#2a2a2a] bg-[#0d0d0d]/90 px-2 py-1.5 text-zinc-400 backdrop-blur">
          {snapshot.paused ? "▶" : "⏸"}
        </button>
        <button
          onClick={async () => {
            vibrate();
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen().catch(() => {});
          }}
          className="border border-[#2a2a2a] bg-[#0d0d0d]/90 px-2 py-1.5 text-zinc-400 backdrop-blur"
        >
          ⛶
        </button>
      </div>

      {/* ============ DRIVING HUD ============ */}
      {isDriving && snapshot.drivingVehicle && (
        <div className="pointer-events-auto absolute left-1/2 top-12 -translate-x-1/2 border border-[#d96b3a] bg-[#0d0d0d]/95 px-3 py-2 backdrop-blur">
          <div className="text-center text-[11px] font-bold uppercase tracking-widest text-[#d96b3a]">
            🚗 {snapshot.drivingVehicle.name}
          </div>
          <div className="mt-1 flex items-center gap-3 text-[9px] uppercase tracking-widest text-zinc-400">
            <span>⛽ {Math.round(snapshot.drivingVehicle.fuel)}/{snapshot.drivingVehicle.maxFuel}</span>
            <span>🔧 {Math.round(snapshot.drivingVehicle.durability)}%</span>
            <span>💨 {snapshot.drivingVehicle.speed}</span>
          </div>
        </div>
      )}

      {/* ============ EQUIPPED WEAPON DISPLAY ============ */}
      {snapshot.equipped && (
        <div className="pointer-events-auto absolute left-2 top-14 border border-[#4a5c45] bg-[#0d0d0d]/95 px-2 py-1 text-[10px] uppercase tracking-widest text-[#cdd7bf] backdrop-blur">
          {hasGun ? "🔫" : "🗡️"} {snapshot.equipped.name}
        </div>
      )}

      {/* ============ HOTBAR ============ */}
      {!panelOpen && (
        <div className="pointer-events-auto fixed left-1/2 top-[calc(6rem+env(safe-area-inset-top))] -translate-x-1/2 flex gap-1">
          {snapshot.hotbar.map((item, idx) => (
            <button
              key={idx}
              onClick={() => {
                vibrate(20);
                if (!item) return;
                if (item.weapon) engineRef.current?.equipItem(item.id);
                else engineRef.current?.useItem(item.id);
              }}
              className={`flex h-10 w-10 flex-col items-center justify-center border text-[9px] backdrop-blur ${
                snapshot.equipped?.id === item?.id
                  ? "border-[#d96b3a] bg-[#2a1714]/90 text-[#d96b3a]"
                  : item
                  ? "border-[#4a5c45] bg-[#0d0d0d]/90 text-[#cdd7bf]"
                  : "border-[#2a2a2a] bg-[#0d0d0d]/60 text-zinc-700"
              }`}
            >
              <span className="text-[8px] opacity-60">{idx + 1}</span>
              <span className="truncate text-[8px] leading-none">{item?.name.slice(0, 4) ?? "—"}</span>
            </button>
          ))}
        </div>
      )}

      {/* ============ LEFT JOYSTICK (movement) ============ */}
      {!panelOpen && (
        <div
          ref={stickRef}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            vibrate(10);
            updateStick(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => stick.active && updateStick(event.clientX, event.clientY)}
          onPointerUp={stopStick}
          onPointerCancel={stopStick}
          className={`pointer-events-auto fixed h-36 w-36 rounded-full border-2 border-[#4a5c45]/60 bg-black/55 backdrop-blur-md touch-none ${isLandscape ? "bottom-[calc(1rem+env(safe-area-inset-bottom))] left-[calc(1rem+env(safe-area-inset-left))]" : "bottom-[calc(8rem+env(safe-area-inset-bottom))] left-[calc(1rem+env(safe-area-inset-left))]"}`}
        >
          {/* Direction indicators */}
          <div className="absolute left-1/2 top-2 -translate-x-1/2 text-[10px] text-[#4a5c45]/60">▲</div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-[#4a5c45]/60">▼</div>
          <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-[#4a5c45]/60">◀</div>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#4a5c45]/60">▶</div>
          {/* Center dot */}
          <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4a5c45]/60" />
          {/* Knob */}
          <div
            className={`absolute left-1/2 top-1/2 grid h-16 w-16 place-items-center rounded-full border-2 text-[10px] font-bold uppercase shadow-lg shadow-black ${
              stick.active ? "border-[#d96b3a] bg-[#2a1714]/95 text-[#d96b3a]" : "border-[#4a5c45] bg-[#1f2521]/90 text-zinc-300"
            }`}
            style={{ transform: `translate(calc(-50% + ${stick.x}px), calc(-50% + ${stick.y}px))`, transition: stick.active ? "none" : "transform 0.15s ease-out" }}
          >
            {stick.active ? "↑" : "MV"}
          </div>
        </div>
      )}

      {/* ============ RIGHT AIM PAD ============ */}
      {!panelOpen && !isDriving && (
        <div
          ref={aimRef}
          onPointerDown={(event) => {
            setAiming(true);
            event.currentTarget.setPointerCapture(event.pointerId);
            aim(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => aiming && aim(event.clientX, event.clientY)}
          onPointerUp={() => setAiming(false)}
          onPointerCancel={() => setAiming(false)}
          className={`pointer-events-auto fixed h-32 w-32 rounded-full border border-[#2a2a2a] bg-black/30 backdrop-blur touch-none ${isLandscape ? "bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(11rem+env(safe-area-inset-right))]" : "bottom-[calc(8rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))]"}`}
        >
          <div className="absolute inset-6 rounded-full border border-dashed border-[#d96b3a]/40" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-widest text-[#d96b3a]/60">
            🎯 AIM
          </div>
        </div>
      )}

      {/* ============ ACTION BUTTONS (right side) ============ */}
      {!panelOpen && (
        <div className={`pointer-events-auto fixed grid gap-1.5 ${isLandscape ? "bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))]" : "bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))]"}`}>
          {/* Big ATTACK button */}
          <button
            onPointerDown={() => {
              vibrate(40);
              engineRef.current?.mobileAttack();
            }}
            className="grid h-20 w-20 place-items-center rounded-full border-2 border-[#8a2f22] bg-[#2a1714]/95 text-xl font-black uppercase tracking-widest text-[#d96b3a] shadow-xl shadow-black active:scale-95"
          >
            <span>⚔️</span>
            <span className="text-[9px]">{hasGun ? "FIRE" : "ATK"}</span>
          </button>

          <div className="grid grid-cols-3 gap-1.5">
            {/* RUN */}
            <button
              onPointerDown={() => {
                vibrate();
                const next = !running;
                setRunning(next);
                engineRef.current?.setVirtualMove(stick.x / 46, stick.y / 46, next);
              }}
              className={`h-12 w-12 rounded-full border text-[9px] font-bold uppercase tracking-widest ${
                running ? "border-[#d96b3a] bg-[#2a1714]/95 text-[#d96b3a]" : "border-[#2a2a2a] bg-[#0d0d0d]/90 text-zinc-300"
              }`}
            >
              {running ? "🏃" : "🚶"}
              <div className="text-[7px]">{running ? "RUN" : "WALK"}</div>
            </button>
            {/* E - Interact/Loot */}
            <button
              onPointerDown={() => { vibrate(); engineRef.current?.mobileInteract(); }}
              className="h-12 w-12 rounded-full border border-[#4a5c45] bg-[#0d0d0d]/90 text-[10px] font-bold uppercase text-[#cdd7bf]"
            >
              📦
              <div className="text-[7px]">LOOT</div>
            </button>
            {/* F - Enter House / Cut Wood (pulses near gate) */}
            <button
              onPointerDown={() => { vibrate(40); engineRef.current?.mobileContextAction(); }}
              className={`h-12 w-12 rounded-full border text-[10px] font-bold uppercase ${
                snapshot.nearHouseGate
                  ? "animate-pulse border-[#d96b3a] bg-[#2a1714]/95 text-[#d96b3a]"
                  : "border-[#2a2a2a] bg-[#0d0d0d]/90 text-zinc-400"
              }`}
            >
              🚪
              <div className="text-[7px]">{snapshot.nearHouseGate ? "ENTER" : "F"}</div>
            </button>
          </div>

          {/* Second row */}
          <div className="grid grid-cols-3 gap-1.5">
            {/* V - Vehicle */}
            <button
              onPointerDown={() => { vibrate(); engineRef.current?.enterVehicle(1); }}
              className={`h-12 w-12 rounded-full border text-[10px] font-bold uppercase ${
                isDriving
                  ? "border-[#d96b3a] bg-[#2a1714]/95 text-[#d96b3a]"
                  : "border-[#2a2a2a] bg-[#0d0d0d]/90 text-zinc-400"
              }`}
            >
              🚗
              <div className="text-[7px]">{isDriving ? "EXIT" : "DRIVE"}</div>
            </button>
            {/* Auto-Attack toggle */}
            <button
              onPointerDown={() => { vibrate(); setAutoAttack(!autoAttack); }}
              className={`h-12 w-12 rounded-full border text-[10px] font-bold uppercase ${
                autoAttack ? "animate-pulse border-red-700 bg-red-950/80 text-red-400" : "border-[#2a2a2a] bg-[#0d0d0d]/90 text-zinc-400"
              }`}
            >
              🔁
              <div className="text-[7px]">AUTO</div>
            </button>
            {/* PvP toggle */}
            <button
              onPointerDown={() => { vibrate(60); engineRef.current?.togglePvP(); }}
              className={`h-12 w-12 rounded-full border text-[10px] font-bold uppercase ${
                snapshot.pvpEnabled ? "border-red-600 bg-red-950/80 text-red-400" : "border-[#2a2a2a] bg-[#0d0d0d]/90 text-zinc-400"
              }`}
            >
              ⚔️
              <div className="text-[7px]">PvP</div>
            </button>
          </div>

          {/* Third row: drop / pickup */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onPointerDown={() => { vibrate(); const eq = snapshot.equipped; if (eq) engineRef.current?.dropItem(eq.id, 1, 1); }}
              className="h-12 w-12 rounded-full border border-[#5a4a2a] bg-[#0d0d0d]/90 text-[10px] font-bold uppercase text-[#d7c9a7]"
            >
              📤
              <div className="text-[7px]">DROP</div>
            </button>
            <button
              onPointerDown={() => { vibrate(); engineRef.current?.pickupNearestItem(1); }}
              className={`h-12 w-12 rounded-full border text-[10px] font-bold uppercase ${
                snapshot.nearestGroundItem
                  ? "animate-pulse border-[#4a5c45] bg-[#1f2521] text-[#4aff4a]"
                  : "border-[#2a2a2a] bg-[#0d0d0d]/90 text-zinc-500"
              }`}
            >
              🖐️
              <div className="text-[7px]">PEGAR</div>
            </button>
            <button
              onPointerDown={() => { vibrate(); onOpenPanel("inventory"); }}
              className="h-12 w-12 rounded-full border border-[#2a2a2a] bg-[#0d0d0d]/90 text-[10px] font-bold uppercase text-zinc-400"
            >
              🎒
              <div className="text-[7px]">BAG</div>
            </button>
          </div>
        </div>
      )}

      {/* ============ NEARBY GROUND ITEM PROMPT ============ */}
      {!panelOpen && snapshot.nearestGroundItem && (
        <div className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 translate-y-16 border border-[#4a5c45] bg-[#0d0d0d]/95 px-3 py-1.5 text-center backdrop-blur">
          <p className="text-[10px] uppercase tracking-widest text-[#4aff4a]">
            🖐️ {snapshot.nearestGroundItem.name} x{snapshot.nearestGroundItem.qty}
          </p>
        </div>
      )}

      {/* ============ QUICK MENU BAR (bottom) ============ */}
      {!panelOpen && (
        <div className={`pointer-events-auto fixed flex gap-1 ${isLandscape ? "top-1/2 left-[calc(0.5rem+env(safe-area-inset-left))] -translate-y-1/2 flex-col" : "bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2"}`}>
          <button onClick={() => { vibrate(); onOpenPanel("crafting"); }} className="h-10 w-10 rounded border border-[#2a2a2a] bg-[#0d0d0d]/85 text-base">🔨</button>
          <button onClick={() => { vibrate(); onOpenPanel("inventory"); }} className="h-10 w-10 rounded border border-[#2a2a2a] bg-[#0d0d0d]/85 text-base">🎒</button>
          <button onClick={() => { vibrate(); onOpenPanel("map"); }} className="h-10 w-10 rounded border border-[#2a2a2a] bg-[#0d0d0d]/85 text-base">🗺️</button>
          <button onClick={() => { vibrate(); setShowChat(true); }} className="h-10 w-10 rounded border border-[#2a2a2a] bg-[#0d0d0d]/85 text-base">💬</button>
          <button
            onClick={async () => {
              vibrate(20);
              const s = VoiceChat.getState();
              if (!s.isMicActive) {
                await VoiceChat.startMicrophone();
              } else {
                VoiceChat.toggleMuteSelf();
              }
            }}
            className="h-10 w-10 rounded border border-[#2a2a2a] bg-[#0d0d0d]/85 text-base"
            title="Ativar/Mudar Microfone"
          >
            🎙️
          </button>
        </div>
      )}

      {/* ============ CHAT MODAL ============ */}
      {showChat && (
        <div className="pointer-events-auto fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-50 border border-[#4a5c45] bg-[#0d0d0d]/98 p-3 shadow-2xl backdrop-blur">
          <div className="mb-2 max-h-40 overflow-y-auto space-y-1">
            {snapshot.chatMessages.slice(-10).map((msg, i) => (
              <p key={i} className="text-[10px]">
                <span className={`font-bold ${msg.id === snapshot.myPlayerId ? "text-[#4a5c45]" : msg.id === "system" ? "text-red-400" : "text-blue-400"}`}>{msg.name}:</span>
                <span className="ml-1 text-zinc-300">{msg.text}</span>
              </p>
            ))}
            {snapshot.chatMessages.length === 0 && <p className="text-center text-[10px] text-zinc-600">Sem mensagens. Abra outra aba para multiplayer!</p>}
          </div>
          <div className="flex gap-1">
            <input
              autoFocus
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Mensagem..."
              className="flex-1 border border-[#2a2a2a] bg-black px-2 py-2 text-xs text-zinc-200 outline-none"
            />
            <button onClick={sendMessage} className="border border-[#4a5c45] bg-[#1f2521] px-3 text-xs uppercase text-[#cdd7bf]">Enviar</button>
            <button onClick={() => setShowChat(false)} className="border border-[#5a2b24] bg-[#2a1714] px-3 text-xs uppercase text-[#d96b3a]">✕</button>
          </div>
        </div>
      )}

      {/* ============ HEALTH WARNING OVERLAY ============ */}
      {lowHp && !panelOpen && (
        <div className="pointer-events-none absolute inset-0 animate-pulse border-4 border-red-600/60" />
      )}

      {/* ============ MOODLES MINI (top-right under stats) ============ */}
      {!panelOpen && snapshot.moodles.length > 0 && (
        <div className="pointer-events-auto fixed right-[calc(0.5rem+env(safe-area-inset-right))] top-[calc(3.5rem+env(safe-area-inset-top))] flex flex-col gap-0.5">
          {snapshot.moodles.slice(0, 4).map((m) => (
            <div
              key={m.kind}
              title={m.description}
              className={`grid h-7 w-7 place-items-center rounded-full border text-sm ${
                m.severity === 3 ? "animate-pulse border-red-700 bg-red-950/90" : m.severity === 2 ? "border-[#8a6a2a] bg-[#2a2010]/90" : "border-[#4a5c45] bg-[#1f2521]/90"
              }`}
            >
              {m.icon}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
