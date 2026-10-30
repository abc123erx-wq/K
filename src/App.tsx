import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameEngine } from "./game/engine";
import type { DeathReport, GameSnapshot, Item, SandboxOptions } from "./game/types";
import AdminPanel from "./components/AdminPanel";
import MobileControls from "./components/MobileControls";
import ItemEncyclopedia from "./components/ItemEncyclopedia";
import ServerPanel from "./components/ServerPanel";
import AuthScreen from "./components/AuthScreen";
import MobileInstallBanner from "./components/MobileInstallBanner";
import ShopPanel from "./components/ShopPanel";
import Store from "./components/Store";
import VoiceChatHUD from "./components/VoiceChatHUD";
import SpecialPanel, { SpecialPanelActivator } from "./components/SpecialPanel";
import {
  loadFirstPerson,
  saveFirstPerson,
  syncFirstPersonToSave,
  toggleFirstPerson,
  type FirstPersonSettings,
} from "./game/firstPerson";
import {
  loadAccessibility,
  saveAccessibility,
  type AccessibilitySettings,
} from "./game/accessibility";
import { requestServerPermission } from "./game/adminAccess";
import {
  deliverEntitlements,
  enforceRevocations,
  sweepExpired,
  activePerks,
  hasActiveSubscription,
  activeEntitlements,
} from "./game/entitlements";
import { Auth, type User } from "./game/auth";
import { Database, type PlayerSave } from "./game/database";

const defaultSnapshot: GameSnapshot = {
  stats: { health: 100, hunger: 0, thirst: 0, stamina: 100, sanity: 100, infection: 0, warmth: 70, radiation: 0, encumbrance: 0 },
  moodles: [],
  inventory: [],
  hotbar: [null, null, null, null, null],
  equipped: null,
  capacity: 12,
  weight: 0,
  container: null,
  recipes: [],
  time: { day: 1, hour: 8, minute: 0, daysSurvived: 0 },
  kills: 0,
  zombies: { total: 0, chasing: 0, nearby: 0 },
  message: "The outbreak has started. Loot a house before nightfall.",
  running: false,
  paused: false,
  position: { x: 5000, y: 5000 },
  insideHouse: null,
  nearHouseGate: null,
  onlinePlayers: [],
  weather: "clear",
  weatherIntensity: 0,
  chatMessages: [],
  myPlayerId: "",
  myPlayerName: "",
  isCoop: false,
  events: [],
  temperature: 20,
  structures: [],
  npcsNearby: [],
  notifications: [],
  vehicles: [],
  drivingVehicle: null,
  pvpEnabled: false,
  pvpKills: 0,
  pvpDeaths: 0,
  pvpKillLog: [],
  groundItems: [],
  nearestGroundItem: null,
};

const difficultyOptions: Record<SandboxOptions["difficulty"], SandboxOptions> = {
  builder: { difficulty: "builder", zombieCount: 15, loot: 1.35, timeScale: 5.5 },
  survivor: { difficulty: "survivor", zombieCount: 21, loot: 1, timeScale: 7 },
  apocalypse: { difficulty: "apocalypse", zombieCount: 25, loot: 0.72, timeScale: 8.5 },
};

function barColor(value: number, inverse = false) {
  const danger = inverse ? value > 70 : value < 30;
  const warn = inverse ? value > 45 : value < 58;
  if (danger) return "bg-red-800";
  if (warn) return "bg-[#8a6a2a]";
  return "bg-[#4a5c45]";
}

function StatBar({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] uppercase tracking-widest text-zinc-400">
        <span>{label}</span>
        <span>{Math.max(0, Math.round(value))}%</span>
      </div>
      <div className="h-2 border border-[#2a2a2a] bg-black">
        <div className={`h-full ${barColor(value, inverse)} transition-all duration-200`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}

function ItemRow({ item, onUse, onEquip, onDrop }: { item: Item; onUse: (id: string) => void; onEquip: (id: string) => void; onDrop: (id: string, qty: number) => void }) {
  return (
    <div
      draggable
      onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
      className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-[#2a2a2a] py-1.5 text-xs text-zinc-200"
    >
      <div>
        <span className="text-[#d7c9a7]">{item.name}</span>
        <span className="ml-2 text-zinc-500">x{item.qty}</span>
        <span className="ml-2 text-zinc-600">{(item.weight * item.qty).toFixed(1)}kg</span>
      </div>
      <div className="flex gap-1">
        {item.weapon && <button onClick={() => onEquip(item.id)} className="border border-[#4a5c45] px-2 py-0.5 text-[#cdd7bf] hover:bg-[#1f2521]">Equip</button>}
        {(item.hunger || item.thirst || item.heal) && <button onClick={() => onUse(item.id)} className="border border-[#5a3b2f] px-2 py-0.5 text-[#e0b08d] hover:bg-[#2a1714]">Use</button>}
        <button onClick={() => onDrop(item.id, 1)} title="Largar 1" className="border border-[#5a4a2a] px-2 py-0.5 text-[#d7c9a7] hover:bg-[#2a2010]">↓</button>
        {item.qty > 1 && (
          <button onClick={() => onDrop(item.id, item.qty)} title={`Largar todos (${item.qty})`} className="border border-[#5a2b24] px-2 py-0.5 text-[#d96b3a] hover:bg-[#2a1714]">⇊</button>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [phase, setPhase] = useState<"menu" | "playing" | "dead" | "auth">(() => Auth.isLoggedIn() ? "menu" : "auth");
  const [snapshot, setSnapshot] = useState<GameSnapshot>(defaultSnapshot);
  const [death, setDeath] = useState<DeathReport | null>(null);
  const [difficulty, setDifficulty] = useState<SandboxOptions["difficulty"]>("survivor");
  const [gameMode, setGameMode] = useState<"single" | "coop">("single");
  const [currentUser, setCurrentUser] = useState<User | null>(Auth.getCurrentUser());
  const [playerSave, setPlayerSave] = useState<PlayerSave | null>(() => {
    const u = Auth.getCurrentUser();
    return u ? Database.load(u.id, u.username) : null;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showEncyclopedia, setShowEncyclopedia] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showStore, setShowStore] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showSpecialPanel, setShowSpecialPanel] = useState(false);
  // Server-confirmed administrative permission for this account.
  const [serverAuthorized, setServerAuthorized] = useState(false);
  /**
   * Gate for the special panel's voice activation.
   *
   * The verdict comes from the SERVER (`serverAuthorized`), which
   * checks the account against its allowlist. The client keeps no
   * name list of its own — otherwise the allowlist would be readable
   * by anyone who opens the devtools.
   */
  const panelUsernameAllowed = serverAuthorized;
  // First-person camera preference (per player, persisted).
  const [firstPerson, setFirstPerson] = useState<FirstPersonSettings>(() =>
    loadFirstPerson(Auth.getCurrentUser()?.id ?? null),
  );
  // Accessibility / safety options (per player, persisted).
  const [accessibility, setAccessibility] = useState<AccessibilitySettings>(() =>
    loadAccessibility(Auth.getCurrentUser()?.id ?? null),
  );
  const [storeTab, setStoreTab] = useState<"loja" | "codigo" | "historico">("loja");
  // The multiplayer room the player is in (used by the special panel
  // so the server can scope the spawn to the right room).
  const [currentRoom] = useState<string>(() => {
    try { return localStorage.getItem("knox-room") || "global"; } catch { return "global"; }
  });
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<"character" | "inventory" | "crafting" | "map">("character");
  const [chatInput, setChatInput] = useState("");
  const chatRef = useRef<HTMLDivElement | null>(null);
  const options = useMemo(() => difficultyOptions[difficulty], [difficulty]);

  // Paddle entitlements — recomputed whenever the save changes so webhook
  // driven grants/revocations show up in the UI immediately.
  const vipPerks = useMemo(() => {
    void playerSave;
    return activePerks();
  }, [playerSave]);
  const subActive = useMemo(() => {
    void playerSave;
    return hasActiveSubscription();
  }, [playerSave]);
  const ownedCount = useMemo(() => {
    void playerSave;
    return activeEntitlements().length;
  }, [playerSave]);

  // Keep a live reference to the save so the death callback never reads a stale value
  const playerSaveRef = useRef<PlayerSave | null>(playerSave);
  const currentUserRef = useRef<User | null>(currentUser);
  useEffect(() => {
    playerSaveRef.current = playerSave;
    currentUserRef.current = currentUser;
  }, [playerSave, currentUser]);

  useEffect(() => {
    if (phase !== "playing" || !canvasRef.current) return;
    const engine = new GameEngine(
      canvasRef.current,
      options,
      setSnapshot,
      (report) => {
        setDeath(report);
        setPhase("dead");

        // Snapshot the inventory BEFORE the engine is torn down, so the
        // survivor keeps what they were carrying into the next run.
        const carried = engineRef.current
          ? engineRef.current.inventory.items.map((item) => ({ name: item.name, qty: item.qty }))
          : [];
        const carriedEquipped = engineRef.current?.inventory.equipped?.name ?? null;

        const save = playerSaveRef.current;
        if (save && currentUserRef.current) {
          save.totalKills += report.kills;
          save.totalDeaths += 1;
          save.totalMatches += 1;
          save.totalDaysSurvived += report.days;
          if (report.days > save.bestDaysSurvived) save.bestDaysSurvived = report.days;
          // Award XP: 10 per kill, 50 per day survived
          const xpEarned = report.kills * 10 + report.days * 50;
          const levelUp = Database.awardXp(save, xpEarned);
          save.coins += Math.floor(xpEarned / 5);
          // Persist the carry-over loadout
          save.savedInventory = carried;
          save.savedEquipped = carriedEquipped;
          Database.save(save);
          setPlayerSave({ ...save });
          if (levelUp.leveledUp) console.log(`🎉 Level up! Now level ${levelUp.newLevel}`);
        }
      },
      gameMode === "coop",
      playerSave?.savedInventory ?? [],
      playerSave?.savedEquipped ?? null,
    );
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [phase, options, gameMode]);

  const start = () => {
    setSnapshot(defaultSnapshot);
    setDeath(null);
    setPhase("playing");
  };

  /**
   * Toggle the first-person camera.
   *
   * Shared by the Settings button and the in-game shortcut (V), so
   * both paths behave identically: persist, mirror into the save
   * file and push to the running engine.
   */
  const toggleFirstPersonCamera = useCallback(() => {
    const userId = currentUser?.id ?? null;
    const next = toggleFirstPerson(userId, firstPerson);
    setFirstPerson(next);
    syncFirstPersonToSave(playerSave, next);
    if (playerSave) Database.save(playerSave);
    engineRef.current?.setFirstPerson({
      enabled: next.enabled,
      fov: next.fov,
      sensitivity: next.sensitivity,
      reduceMotion: next.reduceMotion || accessibility.reduceMotion,
    });
  }, [currentUser?.id, firstPerson, playerSave, accessibility.reduceMotion]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "i") {
        setActivePanel("inventory");
        setMobilePanelOpen(true);
      }
      if (event.key.toLowerCase() === "c") {
        setActivePanel("crafting");
        setMobilePanelOpen(true);
      }
      if (event.key === "Enter" && phase === "playing") {
        event.preventDefault();
        if (chatInput.trim()) {
          engineRef.current?.sendChat(chatInput);
          setChatInput("");
        }
      }
      // "V" alterna a câmera em primeira pessoa durante o jogo.
      if (event.key.toLowerCase() === "v" && phase === "playing") {
        const target = event.target as HTMLElement | null;
        // Não dispara enquanto o jogador está a digitar.
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
        event.preventDefault();
        toggleFirstPersonCamera();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, chatInput, toggleFirstPersonCamera]);

  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight);
  }, [snapshot.chatMessages]);

  // Ask the server whether the signed-in account is authorized.
  // This is the ONLY source of truth for privileged features; a
  // denied response keeps every panel closed.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!currentUser || currentUser.id.startsWith("guest_")) {
        setServerAuthorized(false);
        return;
      }
      const state = await requestServerPermission({
        id: currentUser.id,
        username: currentUser.username,
        isGuest: false,
      });
      if (cancelled) return;
      setServerAuthorized(state.mode === "granted" && !!state.token);
    };
    void check();
    return () => { cancelled = true; };
  }, [currentUser?.id, currentUser?.username]);

  // Push the first-person camera preference into the running engine.
  useEffect(() => {
    engineRef.current?.setFirstPerson({
      enabled: firstPerson.enabled,
      fov: firstPerson.fov,
      sensitivity: firstPerson.sensitivity,
      reduceMotion: firstPerson.reduceMotion || accessibility.reduceMotion,
    });
  }, [firstPerson, accessibility.reduceMotion, phase]);

  // Push the accessibility / safety options into the running engine.
  useEffect(() => {
    engineRef.current?.setAccessibility(accessibility);
  }, [accessibility, phase]);

  // Apply the saved preference to the engine as soon as it starts.
  useEffect(() => {
    if (phase !== "playing") return;
    engineRef.current?.setFirstPerson({
      enabled: firstPerson.enabled,
      fov: firstPerson.fov,
      sensitivity: firstPerson.sensitivity,
      reduceMotion: firstPerson.reduceMotion || accessibility.reduceMotion,
    });
    engineRef.current?.setAccessibility(accessibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    const root = document.getElementById("root");
    if (phase !== "playing") {
      document.body.classList.remove("game-active");
      document.documentElement.classList.remove("game-active");
      root?.classList.remove("game-active-root");
      return;
    }

    const preventPageScroll = (event: TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("aside") || target?.closest("input") || target?.closest("textarea")) return;
      event.preventDefault();
    };

    document.body.classList.add("game-active");
    document.documentElement.classList.add("game-active");
    root?.classList.add("game-active-root");
    window.scrollTo(0, 0);
    root?.scrollTo(0, 0);
    document.addEventListener("touchmove", preventPageScroll, { passive: false });

    return () => {
      document.body.classList.remove("game-active");
      document.documentElement.classList.remove("game-active");
      root?.classList.remove("game-active-root");
      document.removeEventListener("touchmove", preventPageScroll);
    };
  }, [phase]);

  return (
    <main className={`${phase === "playing" ? "fixed inset-0 h-[100dvh] w-[100dvw] overflow-hidden" : "min-h-screen overflow-y-auto overflow-x-hidden"} bg-[#111111] font-mono text-zinc-200`}>
      <MobileInstallBanner />
      <canvas
        ref={canvasRef}
        className={`fixed inset-0 h-[100dvh] w-[100dvw] ${phase === "playing" ? "block" : "hidden"}`}
        style={{ touchAction: "none", WebkitTapHighlightColor: "transparent" }}
      />

      {/* Item Encyclopedia in Menu */}
      {phase === "menu" && showEncyclopedia && (
        <ItemEncyclopedia
          isOpen={showEncyclopedia}
          onClose={() => setShowEncyclopedia(false)}
          engineRef={engineRef}
          godMode={false}
        />
      )}

      {/* ==================== AUTH ==================== */}
      {phase === "auth" && (
        <AuthScreen
          onLogin={(user, save) => {
            setCurrentUser(user);
            // Paddle: expire stale entitlements, enforce refunds, then deliver
            sweepExpired();
            enforceRevocations(save);
            const delivered = deliverEntitlements(save);
            setPlayerSave(delivered.delivered > 0 ? { ...save } : save);
            setPhase("menu");
          }}
        />
      )}

      {/* ==================== MENU ==================== */}
      {phase === "menu" && (
        <section className="relative min-h-screen bg-[radial-gradient(circle_at_35%_25%,#253321_0%,#111_42%,#050505_100%)]">
          <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(#2a2a2a_1px,transparent_1px),linear-gradient(90deg,#2a2a2a_1px,transparent_1px)] [background-size:42px_42px]" />

          {/* User Bar */}
          {currentUser && playerSave && (
            <div className="relative z-10 mx-auto flex max-w-6xl items-center justify-between border-b border-[#2a2a2a] bg-[#0d0d0d]/80 px-6 py-3 backdrop-blur">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{currentUser.avatar ?? "🧟"}</span>
                <div>
                  <div className="text-sm font-bold text-[#d7c9a7]">{currentUser.username}</div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                    Lv.{playerSave.level} · {playerSave.xp}/{Database.xpForNext(playerSave.level)} XP
                  </div>
                </div>
              </div>
              <div className="hidden gap-6 text-[10px] uppercase tracking-widest text-zinc-500 sm:flex">
                <div title="Total kills"><span className="text-[#d7c9a7]">💀 {playerSave.totalKills}</span></div>
                <div title="PvP kills"><span className="text-red-400">⚔️ {playerSave.pvpKills}</span></div>
                <div title="Best days survived"><span className="text-[#7f936f]">📅 {playerSave.bestDaysSurvived}</span></div>
                <div title="Coins"><span className="text-[#d96b3a]">💰 {playerSave.coins}</span></div>
                {vipPerks.length > 0 && (
                  <div
                    title={[...vipPerks, `${ownedCount} compra(s) ativa(s)`].join(" · ")}
                    className="cursor-help border border-[#c8912a]/50 bg-[#1a1408] px-1.5 py-0.5"
                  >
                    <span className={subActive ? "animate-pulse text-[#e8b64a]" : "text-[#8fb57e]"}>
                      {subActive ? "🥑 VIP" : "✓ PREMIUM"}
                    </span>
                    <span className="ml-1 text-[#8a7d6c]">{ownedCount}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => { Auth.logout(); setCurrentUser(null); setPlayerSave(null); setPhase("auth"); }}
                className="border border-[#5a2b24] px-3 py-1 text-[10px] uppercase tracking-widest text-[#d96b3a] hover:bg-[#2a1714]"
              >
                Sair
              </button>
            </div>
          )}

          <div className="relative mx-auto flex min-h-screen max-w-6xl items-center px-6 py-10">
            <div className="max-w-3xl">
              <p className="mb-4 text-sm uppercase tracking-[0.45em] text-[#7f936f]">Survival Horror</p>
              <h1 className="text-5xl font-black uppercase leading-none text-[#d96b3a] md:text-7xl">Day of the<br/>Undead</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">
                Bem-vindo a Day of the Undead. Saqueie casas, controle fome e sede, faça pouco barulho e sobreviva aos mortos.
              </p>
              <div className="mt-8 border border-[#2a2a2a] bg-[#151515]/85 p-5 shadow-2xl shadow-black">
                <h2 className="text-lg uppercase tracking-widest text-[#d7c9a7]">Tutorial rápido</h2>
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm leading-7 text-zinc-400">
                  <p><span className="text-[#d96b3a]">WASD</span> — Mover</p>
                  <p><span className="text-[#d96b3a]">Shift</span> — Correr (faz barulho)</p>
                  <p><span className="text-[#d96b3a]">Mouse</span> — Mirar</p>
                  <p><span className="text-[#d96b3a]">Clique</span> — Atacar / atirar</p>
                  <p><span className="text-[#d96b3a]">F</span> — Entrar em casas / cortar madeira</p>
                  <p><span className="text-[#d96b3a]">E</span> — Loot dentro das casas</p>
                  <p><span className="text-[#d96b3a]">I / C</span> — Inventário / Crafting</p>
                  <p><span className="text-[#d96b3a]">1-5</span> — Usar hotbar</p>
                  <p><span className="text-[#d96b3a]">P</span> — Pausar</p>
                  <p><span className="text-[#d96b3a]">V</span> — Alternar câmera em primeira pessoa</p>
                  <p className="col-span-2"><span className="text-[#d96b3a]">Mobile</span> — joystick, mira touch, Attack, F, E, Run e painel Bag/Craft.</p>
                  <p className="col-span-2"><span className="text-[#d96b3a]">Online</span> — abra 2 abas do navegador para ver outros jogadores no mapa! Use Enter para chat.</p>
                </div>
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button onClick={start} className="bg-[#8a2f22] px-6 py-3 text-sm font-black uppercase tracking-widest text-zinc-100 hover:bg-[#b5452e] active:scale-95">Start Survival</button>
                <button onClick={() => setShowSettings((v) => !v)} className="border border-[#2a2a2a] px-5 py-3 text-sm font-black uppercase tracking-widest text-zinc-300 hover:bg-[#1f2521]">⚙ Settings</button>
                <button onClick={() => setShowEncyclopedia(true)} className="border border-[#4a5c45] bg-[#1f2521] px-5 py-3 text-sm font-black uppercase tracking-widest text-[#cdd7bf] hover:bg-[#2b352e]">📖 Item Compendium</button>
                <button onClick={() => setShowServer(true)} className="border border-[#5a8aaa] bg-[#1a2535] px-5 py-3 text-sm font-black uppercase tracking-widest text-blue-400 hover:bg-[#253545]">🌐 Server</button>
                <button
                  onClick={() => { setStoreTab("loja"); setShowStore(true); }}
                  className="group relative overflow-hidden border border-[#3a6a2a] bg-[#0f1a10] px-5 py-3 text-sm font-black uppercase tracking-widest text-[#7fc25a] transition-all hover:bg-[#152616] hover:shadow-[0_0_24px_-6px_rgba(127,194,90,0.7)]"
                >
                  <span className="relative z-10">🛒 Loja</span>
                  <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[#7fc25a]/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                </button>
                <button
                  onClick={() => { setStoreTab("codigo"); setShowStore(true); }}
                  className="border border-[#c8912a] bg-[#1a1408] px-5 py-3 text-sm font-black uppercase tracking-widest text-[#e8b64a] transition-all hover:bg-[#241a08] hover:shadow-[0_0_24px_-6px_rgba(200,145,42,0.7)]"
                >
                  🔑 Tenho um código
                </button>
              </div>
              {showSettings && (
                <div className="mt-4 flex flex-wrap items-center gap-4 border border-[#2a2a2a] bg-[#111]/90 p-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm uppercase tracking-widest text-zinc-500">Mode</label>
                    <button
                      onClick={() => setGameMode(gameMode === "single" ? "coop" : "single")}
                      className={`border px-4 py-2 text-sm font-bold uppercase tracking-widest ${gameMode === "coop" ? "border-[#d96b3a] bg-[#2a1714] text-[#d96b3a]" : "border-[#2a2a2a] text-zinc-400"}`}
                    >
                      {gameMode === "single" ? "🔘 Solo" : "👥 Coop (2 Jogadores)"}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm uppercase tracking-widest text-zinc-500">Dificuldade</label>
                    <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as SandboxOptions["difficulty"])} className="border border-[#2a2a2a] bg-[#111] px-4 py-2 text-sm text-zinc-200 outline-none">
                      <option value="builder">Builder — menos zumbis, mais loot</option>
                      <option value="survivor">Survivor — Knox padrão</option>
                      <option value="apocalypse">Apocalypse — fome, noite e horda</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm uppercase tracking-widest text-zinc-500">Mobile UI</label>
                    <button
                      onClick={() => {
                        const enabled = localStorage.getItem("knox-force-mobile") === "1";
                        if (enabled) localStorage.removeItem("knox-force-mobile");
                        else localStorage.setItem("knox-force-mobile", "1");
                        window.location.reload();
                      }}
                      className={`border px-4 py-2 text-sm font-bold uppercase tracking-widest ${localStorage.getItem("knox-force-mobile") === "1" ? "border-[#d96b3a] bg-[#2a1714] text-[#d96b3a]" : "border-[#2a2a2a] text-zinc-400"}`}
                    >
                      {localStorage.getItem("knox-force-mobile") === "1" ? "📱 Mobile ON" : "🖥️ Auto"}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm uppercase tracking-widest text-zinc-500">Câmera</label>
                    <button
                      onClick={toggleFirstPersonCamera}
                      className={`border px-4 py-2 text-sm font-bold uppercase tracking-widest ${firstPerson.enabled ? "border-[#d96b3a] bg-[#2a1714] text-[#d96b3a]" : "border-[#2a2a2a] text-zinc-400"}`}
                      title="Alterna entre a câmera atual e uma câmera em primeira pessoa. É uma opção visual e de controle — não altera as regras do jogo."
                    >
                      {firstPerson.enabled ? "👁 Primeira pessoa ON" : "👁 Primeira pessoa OFF"}
                    </button>
                  </div>
                  {firstPerson.enabled && (
                    <div className="flex flex-wrap items-center gap-4 border border-[#2a2a2a] bg-[#0d0d0d]/80 p-3">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase tracking-widest text-zinc-500">Campo de visão</label>
                        <input
                          type="range" min={55} max={100} step={1}
                          value={firstPerson.fov}
                          onChange={(e) => {
                            const next = { ...firstPerson, fov: Number(e.target.value) };
                            setFirstPerson(next);
                            saveFirstPerson(currentUser?.id ?? null, next);
                            syncFirstPersonToSave(playerSave, next);
                            if (playerSave) Database.save(playerSave);
                            engineRef.current?.setFirstPerson({ fov: next.fov });
                          }}
                          className="w-28 accent-[#d96b3a]"
                        />
                        <span className="w-10 font-mono text-[10px] text-zinc-400">{firstPerson.fov}°</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase tracking-widest text-zinc-500">Sensibilidade</label>
                        <input
                          type="range" min={0.25} max={3} step={0.05}
                          value={firstPerson.sensitivity}
                          onChange={(e) => {
                            const next = { ...firstPerson, sensitivity: Number(e.target.value) };
                            setFirstPerson(next);
                            saveFirstPerson(currentUser?.id ?? null, next);
                            syncFirstPersonToSave(playerSave, next);
                            if (playerSave) Database.save(playerSave);
                            engineRef.current?.setFirstPerson({ sensitivity: next.sensitivity });
                          }}
                          className="w-28 accent-[#d96b3a]"
                        />
                        <span className="w-10 font-mono text-[10px] text-zinc-400">{firstPerson.sensitivity.toFixed(2)}×</span>
                      </div>
                      <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500">
                        <input
                          type="checkbox"
                          checked={firstPerson.reduceMotion}
                          onChange={(e) => {
                            const next = { ...firstPerson, reduceMotion: e.target.checked };
                            setFirstPerson(next);
                            saveFirstPerson(currentUser?.id ?? null, next);
                            syncFirstPersonToSave(playerSave, next);
                            if (playerSave) Database.save(playerSave);
                            engineRef.current?.setFirstPerson({ reduceMotion: next.reduceMotion });
                          }}
                          className="accent-[#d96b3a]"
                        />
                        Reduzir movimento
                      </label>
                      <p className="w-full text-[9px] leading-relaxed text-zinc-600">
                        A câmera em primeira pessoa é uma escolha visual e de controle. Ela não altera hitboxes,
                        alcance, velocidade, precisão nem as regras do jogo. A transição é suave e não move o personagem.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-4 border border-[#2a2a2a] bg-[#111]/90 p-4">
                    <div className="flex items-center gap-2">
                      <label className="text-sm uppercase tracking-widest text-zinc-500">Acessibilidade</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] uppercase tracking-widest text-zinc-500">Volume</label>
                      <input
                        type="range" min={0} max={1} step={0.05}
                        value={accessibility.volume}
                        onChange={(e) => {
                          const next = { ...accessibility, volume: Number(e.target.value) };
                          setAccessibility(next);
                          saveAccessibility(currentUser?.id ?? null, next);
                        }}
                        className="w-24 accent-[#d96b3a]"
                      />
                      <span className="w-9 font-mono text-[10px] text-zinc-400">
                        {Math.round(accessibility.volume * 100)}%
                      </span>
                    </div>
                    {[
                      { key: "subtitles" as const, label: "Legendas" },
                      { key: "reduceFlashes" as const, label: "Reduzir flashes" },
                      { key: "reduceMotion" as const, label: "Reduzir movimento" },
                      { key: "disableEvents" as const, label: "Desativar eventos de suspense" },
                    ].map((opt) => (
                      <label key={opt.key} className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500">
                        <input
                          type="checkbox"
                          checked={accessibility[opt.key]}
                          onChange={(e) => {
                            const next = { ...accessibility, [opt.key]: e.target.checked };
                            setAccessibility(next);
                            saveAccessibility(currentUser?.id ?? null, next);
                          }}
                          className="accent-[#d96b3a]"
                        />
                        {opt.label}
                      </label>
                    ))}
                    <p className="w-full text-[9px] leading-relaxed text-zinc-600">
                      O jogo pode conter eventos de suspense e efeitos de tela. Use estas opções para
                      reduzi-los ou desativá-los. Nenhum efeito altera o sistema do seu dispositivo:
                      tudo acontece dentro do jogo.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm uppercase tracking-widest text-zinc-500">Gráficos</label>
                    <button
                      onClick={() => {
                        const cur = localStorage.getItem("knox-graphics") === "turbo" ? "hd" : "turbo";
                        localStorage.setItem("knox-graphics", cur);
                        window.location.reload();
                      }}
                      className="border border-[#2a2a2a] px-4 py-2 text-sm font-bold uppercase tracking-widest text-zinc-300 hover:border-[#4a5c45]"
                      title="Alternar entre modo Turbo (super leve) e HD (efeitos visuais suaves)"
                    >
                      {localStorage.getItem("knox-graphics") === "turbo" ? "⚡ Turbo 60 FPS (Anti-Lag)" : "✨ HD Aprimorado"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ==================== GAME HUD ==================== */}
      {phase === "playing" && (
        <div className="pointer-events-none fixed inset-0">
          {/* First-person indicator */}
          {firstPerson.enabled && (
            <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2">
              <div className="border border-[#d96b3a]/60 bg-black/60 px-3 py-1 text-[9px] uppercase tracking-[0.3em] text-[#d96b3a]">
                👁 Primeira pessoa · tecla V
              </div>
            </div>
          )}

          {/* Moodles */}
          <div className="pointer-events-auto absolute left-4 top-4 flex flex-col gap-2">
            {snapshot.moodles.length === 0 && (
              <div className="rounded-full border border-[#2a2a2a] bg-[#111]/80 px-3 py-2 text-xs text-[#7f936f]">✓ Stable</div>
            )}
            {snapshot.moodles.map((moodle) => (
              <div key={moodle.kind} title={moodle.description} className="flex items-center gap-2 border border-[#2a2a2a] bg-[#111]/90 px-3 py-2 shadow-lg shadow-black">
                <span className={`grid h-9 w-9 place-items-center rounded-full border text-lg ${moodle.severity === 3 ? "animate-pulse border-red-700 bg-red-950" : moodle.severity === 2 ? "border-[#8a6a2a] bg-[#2a2010]" : "border-[#4a5c45] bg-[#1f2521]"}`}>{moodle.icon}</span>
                <div>
                  <span className={`text-xs font-bold uppercase tracking-widest ${moodle.severity === 3 ? "text-red-400" : "text-zinc-300"}`}>{moodle.label}</span>
                  <span className="block text-[9px] text-zinc-600">{moodle.description}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Right Panel */}
          <aside
            onTouchStart={(e) => { (e.currentTarget as any)._touchStart = e.touches[0].clientY; }}
            onTouchMove={(e) => {
              const start = (e.currentTarget as any)._touchStart;
              if (start == null) return;
              const dy = e.touches[0].clientY - start;
              if (mobilePanelOpen && dy > 80) setMobilePanelOpen(false);
              else if (!mobilePanelOpen && dy < -40) setMobilePanelOpen(true);
            }}
            className={`pointer-events-auto absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto border-t-2 border-[#4a5c45] bg-[#0d0d0d]/97 p-3 shadow-2xl shadow-black backdrop-blur-md transition-transform duration-300 md:max-h-none md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:w-[360px] md:translate-y-0 md:border-l md:border-t-0 md:p-4 ${mobilePanelOpen ? "translate-y-0" : "translate-y-[calc(100%-44px)]"}`}>
            {/* Mobile drag handle */}
            <div
              onClick={() => setMobilePanelOpen((v) => !v)}
              className="sticky top-0 z-20 -mt-3 mb-2 flex justify-center py-1.5 md:hidden"
            >
              <div className="h-1.5 w-12 rounded-full bg-[#4a5c45]/60" />
            </div>
            <header className="sticky top-3 z-10 flex items-start justify-between gap-3 border-b border-[#2a2a2a] bg-[#0d0d0d]/95 pb-3 md:top-0">
              <div>
                <h1 className="text-xl font-black uppercase text-[#d96b3a] md:text-2xl">Day of the Undead</h1>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500 md:text-xs">
                  Day {snapshot.time.day} — {String(snapshot.time.hour).padStart(2, "0")}:{String(snapshot.time.minute).padStart(2, "0")} — survived {snapshot.time.daysSurvived} days
                </p>
              </div>
              <button onClick={() => setMobilePanelOpen((value) => !value)} className="border border-[#2a2a2a] px-3 py-2 text-[10px] uppercase tracking-widest text-zinc-400 md:hidden">
                {mobilePanelOpen ? "▼ Fechar" : "▲ Abrir"}
              </button>
            </header>

            {/* Character Stats */}
            <section className={`mt-4 space-y-3 border-b pb-4 ${activePanel === "character" ? "border-[#4a5c45]" : "border-[#2a2a2a]"}`} onMouseEnter={() => setActivePanel("character")}>
              <div className="flex items-center justify-between text-xs uppercase tracking-widest text-[#7f936f]">
                <span>Character</span>
                <span>{snapshot.nearHouseGate ? "🏠 F: Enter house" : snapshot.running ? "🏃 Running" : "🚶 Walking"}</span>
              </div>
              <StatBar label="Health" value={snapshot.stats.health} />
              <StatBar label="Hunger" value={snapshot.stats.hunger} inverse />
              <StatBar label="Thirst" value={snapshot.stats.thirst} inverse />
              <StatBar label="Stamina" value={snapshot.stats.stamina} />
              <StatBar label="Sanity" value={snapshot.stats.sanity} />
              {snapshot.stats.warmth !== undefined && <StatBar label="Warmth" value={snapshot.stats.warmth} />}
              {snapshot.stats.radiation > 0 && <StatBar label="Radiation" value={snapshot.stats.radiation} inverse />}
              {snapshot.stats.infection > 0 && <StatBar label="Knox Infection" value={snapshot.stats.infection} inverse />}

              {snapshot.isCoop && snapshot.p2Stats && (
                <div className="mt-3 border-t border-[#d96b3a]/30 pt-3">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#d96b3a]">P2 — Coop Partner</div>
                  <StatBar label="Health" value={snapshot.p2Stats.health} />
                  <StatBar label="Stamina" value={snapshot.p2Stats.stamina} />
                  {snapshot.p2Stats.infection > 0 && <StatBar label="Infection" value={snapshot.p2Stats.infection} inverse />}
                </div>
              )}
            </section>

            {/* Inventory */}
            <section className={`mt-4 border-b pb-4 ${activePanel === "inventory" ? "border-[#4a5c45]" : "border-[#2a2a2a]"}`} onMouseEnter={() => setActivePanel("inventory")}>
              <div className="mb-2 flex justify-between text-xs uppercase tracking-widest text-[#7f936f]">
                <span>Inventory</span>
                <span>{snapshot.weight.toFixed(1)} / {snapshot.capacity.toFixed(1)}kg</span>
              </div>
              <div className="mb-3 grid grid-cols-5 gap-2">
                {snapshot.hotbar.map((item, index) => (
                  <div
                    key={index}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => engineRef.current?.assignHotbar(index, event.dataTransfer.getData("text/plain"))}
                    className={`flex h-14 flex-col justify-between border p-1.5 text-[10px] ${item ? "border-[#4a5c45] bg-[#1a201a]" : "border-[#2a2a2a] bg-black/60"} text-zinc-500`}
                  >
                    <span className="text-[#d96b3a] font-bold">{index + 1}</span>
                    <span className="truncate leading-tight">{item?.name ?? "—"}</span>
                  </div>
                ))}
              </div>
              <div className="max-h-52 overflow-y-auto border border-[#1f2521] bg-black/35 px-2">
                {snapshot.inventory.length === 0 && <p className="py-2 text-center text-xs text-zinc-600">Empty. Loot a house.</p>}
                {snapshot.inventory.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onUse={(id) => engineRef.current?.useItem(id)}
                    onEquip={(id) => engineRef.current?.equipItem(id)}
                    onDrop={(id, qty) => engineRef.current?.dropItem(id, qty, 1)}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500">Equipped: <span className="text-[#d7c9a7]">{snapshot.equipped?.name ?? "Bare hands"}</span></p>

              {/* Ground items near player */}
              {snapshot.nearestGroundItem && (
                <button
                  onClick={() => engineRef.current?.pickupNearestItem(1)}
                  className="mt-2 w-full border border-[#4a5c45] bg-[#1f2521] py-2 text-[10px] font-bold uppercase tracking-widest text-[#cdd7bf] hover:bg-[#2b352e]"
                >
                  🖐️ [H] Pegar {snapshot.nearestGroundItem.name} x{snapshot.nearestGroundItem.qty}
                </button>
              )}
              {snapshot.groundItems.length > 0 && (
                <p className="mt-1 text-[10px] text-zinc-600">📦 {snapshot.groundItems.length} itens no chão por perto</p>
              )}
            </section>

            {/* Loot Container */}
            <section className={`mt-4 border-b pb-4 ${activePanel === "crafting" ? "border-[#4a5c45]" : "border-[#2a2a2a]"}`} onMouseEnter={() => setActivePanel("crafting")}>
              <div className="mb-2 text-xs uppercase tracking-widest text-[#7f936f]">🏠 Loot Container</div>
              {!snapshot.container && <p className="text-xs text-zinc-500">Aproxime-se do portão de uma casa e pressione F para entrar. Depois use E para lootear.</p>}
              {snapshot.container && (
                <div className="space-y-1">
                  {snapshot.container.items.length === 0 && <p className="text-xs text-zinc-500">Empty cabinets. Only dust.</p>}
                  {snapshot.container.items.map((item) => (
                    <button key={item.id} onClick={() => engineRef.current?.lootItem(item.id)} className="block w-full border-b border-[#2a2a2a] py-1.5 text-left text-xs text-[#d7c9a7] hover:bg-[#1f2521]">
                      ↓ Take {item.name} x{item.qty} <span className="text-zinc-600">({(item.weight * item.qty).toFixed(1)}kg)</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Crafting */}
            <section className="mt-4 border-b border-[#2a2a2a] pb-4">
              <div className="mb-2 text-xs uppercase tracking-widest text-[#7f936f]">🔨 Crafting</div>
              {snapshot.recipes.map((recipe) => (
                <button key={recipe.id} onClick={() => engineRef.current?.craft(recipe.id)} className="mb-2 block w-full border border-[#2a2a2a] bg-[#151515] px-3 py-2.5 text-left text-xs text-zinc-300 hover:border-[#4a5c45] hover:bg-[#1f2521]">
                  {recipe.name}{recipe.station ? <span className="ml-2 text-[#d96b3a]">requires {recipe.station}</span> : null}
                </button>
              ))}
            </section>

            {/* Map & Info */}
            <section className={`mt-4 space-y-2 border-b pb-4 text-xs text-zinc-400 ${activePanel === "map" ? "border-[#4a5c45]" : "border-[#2a2a2a]"}`} onMouseEnter={() => setActivePanel("map")}>
              <div className="text-xs uppercase tracking-widest text-[#7f936f]">📍 Map and Time</div>
              <p>Position: <span className="text-[#d7c9a7]">{snapshot.position.x}, {snapshot.position.y}</span> <span className="text-zinc-600">/ 9999²</span></p>
              <p>Location: <span className="text-[#d7c9a7]">{snapshot.insideHouse ? "Inside house" : "Outside"}</span></p>
              <p>Weather: <span className={snapshot.weather === "storm" ? "text-red-400" : snapshot.weather === "rain" ? "text-blue-300" : snapshot.weather === "fog" ? "text-zinc-400" : "text-[#4a5c45]"}>{snapshot.weather.toUpperCase()}</span> <span className="text-zinc-600">({Math.round(snapshot.weatherIntensity * 100)}%)</span></p>
              <p>Temp: <span className="text-[#d7c9a7]">{Math.round(snapshot.temperature)}°C</span></p>
              <p>Zombies: <span className="text-[#d7c9a7]">{snapshot.zombies.total}</span> alive, <span className="text-red-400">{snapshot.zombies.chasing}</span> chasing, <span className="text-[#d96b3a]">{snapshot.zombies.nearby}</span> nearby.</p>
              <p>Kills: <span className="text-[#d7c9a7]">{snapshot.kills}</span>{snapshot.isCoop && snapshot.p2Kills !== undefined ? <span className="ml-1 text-zinc-500">(+{snapshot.p2Kills} P2)</span> : null}</p>
              <p>Online: <span className="text-blue-400">{snapshot.onlinePlayers.length} survivor{snapshot.onlinePlayers.length !== 1 ? "s" : ""}</span>
                {snapshot.onlinePlayers.length > 0 && snapshot.onlinePlayers.map(op => (
                  <span key={op.id} className="ml-1 text-[10px] text-blue-300/70">• {op.name}</span>
                ))}
              </p>
              <p className="border border-[#2a2a2a] bg-black/40 p-2 text-[#d7c9a7]">{snapshot.message}</p>

              {/* Active Events */}
              {snapshot.events.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[10px] uppercase tracking-widest text-[#d96b3a]">⚡ Active Events</div>
                  {snapshot.events.map((ev) => (
                    <div key={ev.id} className="flex items-center gap-2 border border-[#d96b3a]/30 bg-[#2a1714]/60 px-2 py-1">
                      <span className="text-sm">{ev.icon}</span>
                      <div className="flex-1">
                        <span className="text-[10px] font-bold text-[#d96b3a]">{ev.name}</span>
                        <span className="block text-[9px] text-zinc-500">{ev.description}</span>
                      </div>
                      <span className="text-[9px] text-zinc-600">{Math.max(0, Math.round(ev.duration - ev.elapsed))}s</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent Notifications */}
              {snapshot.notifications.length > 0 && (
                <div className="mt-2 max-h-16 overflow-y-auto space-y-0.5">
                  {snapshot.notifications.slice(-3).map((n, i) => (
                    <p key={i} className={`text-[9px] ${n.type === "danger" ? "text-red-400" : n.type === "success" ? "text-[#4a5c45]" : n.type === "event" ? "text-[#d96b3a]" : "text-zinc-500"}`}>
                      {n.text}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                <button onClick={() => engineRef.current?.togglePause()} className="border border-[#2a2a2a] px-3 py-2 uppercase tracking-widest text-zinc-300 hover:bg-[#1f2521]">
                  {snapshot.paused ? "▶ Resume" : "⏸ Pause"}
                </button>
                <button
                  onClick={toggleFirstPersonCamera}
                  title="Alterna a câmera em primeira pessoa (tecla V). É uma opção visual e de controle — não altera as regras do jogo."
                  className={`border px-3 py-2 uppercase tracking-widest ${
                    firstPerson.enabled
                      ? "border-[#d96b3a] bg-[#2a1714] text-[#d96b3a]"
                      : "border-[#2a2a2a] text-zinc-300 hover:bg-[#1f2521]"
                  }`}
                >
                  {firstPerson.enabled ? "👁 1ª pessoa ON" : "👁 1ª pessoa OFF"}
                </button>
                <button onClick={() => setShowEncyclopedia(true)} className="border border-[#4a5c45] bg-[#1f2521] px-3 py-2 uppercase tracking-widest text-[#cdd7bf] hover:bg-[#2b352e]">
                  📖 Items
                </button>
                <button onClick={() => setPhase("menu")} className="border border-[#5a2b24] px-3 py-2 uppercase tracking-widest text-[#d96b3a] hover:bg-[#2a1714]">✕ Quit</button>
              </div>
            </section>
          </aside>

          {/* Chat */}
          <div className="pointer-events-auto absolute bottom-4 left-4 max-w-xs md:max-w-sm">
            <div ref={chatRef} className="mb-1 max-h-28 overflow-y-auto space-y-0.5 scrollbar-thin">
              {snapshot.chatMessages.slice(-8).map((msg, i) => (
                <div key={i} className="text-[10px] text-zinc-400 bg-black/60 px-2 py-0.5 rounded">
                  <span className={`font-bold ${msg.id === snapshot.myPlayerId ? "text-[#4a5c45]" : "text-blue-400"}`}>{msg.name}</span>
                  <span className="text-zinc-300 ml-1">{msg.text}</span>
                </div>
              ))}
            </div>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Press Enter to chat..."
              className="w-full border border-[#2a2a2a] bg-[#111]/90 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-[#4a5c45]"
            />
          </div>

          {/* Item Encyclopedia Modal */}
          <ItemEncyclopedia
            isOpen={showEncyclopedia}
            onClose={() => setShowEncyclopedia(false)}
            engineRef={engineRef}
            godMode={snapshot.moodles.some(m => m.label === "God Mode")}
          />
          <MobileControls
            engineRef={engineRef}
            snapshot={snapshot}
            panelOpen={mobilePanelOpen}
            onOpenPanel={(panel) => {
              setActivePanel(panel);
              setMobilePanelOpen(true);
            }}
            firstPersonEnabled={firstPerson.enabled}
            onToggleFirstPerson={toggleFirstPersonCamera}
          />

          {/* Voice Chat with AI Moderation */}
          <VoiceChatHUD isMobile={mobilePanelOpen} />

          {/* Server Panel */}
          <ServerPanel
            isOpen={showServer}
            onClose={() => setShowServer(false)}
            onConnect={() => setShowServer(false)}
          />
        </div>
      )}

      {/* Server Panel on Menu */}
      {phase === "menu" && (
        <ServerPanel
          isOpen={showServer}
          onClose={() => setShowServer(false)}
          onConnect={() => setShowServer(false)}
        />
      )}

      {/* ==================== DEATH ==================== */}
      {phase === "dead" && (
        <section className="grid min-h-screen place-items-center bg-black px-6 text-center">
          <div>
            <p className="mb-4 text-sm uppercase tracking-[0.5em] text-zinc-600">Quarantine Zone</p>
            <h1 className="text-5xl font-black uppercase tracking-widest text-[#d96b3a] md:text-7xl">
              THIS IS HOW<br/>YOU DIED
            </h1>
            <div className="mx-auto mt-8 max-w-xl border border-[#2a2a2a] bg-[#111] p-6 text-left text-zinc-300">
              <p className="text-sm uppercase tracking-widest text-zinc-500">Cause of death</p>
              <p className="mt-2 text-2xl text-[#d7c9a7]">{death?.cause ?? "Unknown"}</p>
              <div className="mt-6 grid grid-cols-3 gap-4 text-center">
                <div className="border border-[#2a2a2a] p-4">
                  <p className="text-3xl font-black text-[#d96b3a]">{death?.days ?? 0}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">Days Survived</p>
                </div>
                <div className="border border-[#2a2a2a] p-4">
                  <p className="text-3xl font-black text-[#d96b3a]">{death?.kills ?? 0}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">Zombies Killed</p>
                </div>
                <div className="border border-[#2a2a2a] p-4">
                  <p className="text-3xl font-black text-[#d96b3a]">{death?.hours ?? 0}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">Hours In-Game</p>
                </div>
              </div>
            </div>
            {playerSave && playerSave.savedInventory.length > 0 && (
              <div className="mx-auto mt-6 max-w-xl border border-[#3a6a2a] bg-[#0f1a10]/70 p-4 text-left">
                <p className="font-mono text-[10px] uppercase tracking-widest text-[#7fc25a]">🎒 Loadout recuperado</p>
                <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-[#a8c09a]">
                  Você renasce com {playerSave.savedInventory.length} tipo(s) de item
                  {playerSave.savedInventory.length > 1 ? "s" : ""} que carregava:{" "}
                  {playerSave.savedInventory
                    .slice(0, 6)
                    .map((i) => `${i.name}${i.qty > 1 ? ` x${i.qty}` : ""}`)
                    .join(", ")}
                  {playerSave.savedInventory.length > 6 ? ` e mais ${playerSave.savedInventory.length - 6}…` : ""}
                </p>
                <p className="mt-2 font-mono text-[9px] text-[#5f7a54]">
                  Os itens foram salvos automaticamente no banco de dados da sua conta.
                </p>
              </div>
            )}
            <button onClick={start} className="mt-8 bg-[#8a2f22] px-8 py-4 text-sm font-black uppercase tracking-widest text-zinc-100 hover:bg-[#b5452e] active:scale-95">
              Try Again
            </button>
          </div>
        </section>
      )}

      {/* ── Admin panel ───────────────────────────────────────────
          The button is only a convenience. The real gate is the
          SERVER: AdminPanel asks it for a session token and every
          privileged command is re-validated there. Accounts without
          server authorization never get a token. */}
      {!showAdmin && phase !== "auth" && (
        <button
          onClick={() => setShowAdmin(true)}
          className="fixed bottom-4 right-4 z-[1000] border-2 border-[#d96b3a] bg-[#2a1714]/95 px-4 py-3 text-xs font-black uppercase tracking-widest text-[#d96b3a] shadow-xl shadow-black hover:bg-[#3a2218] active:scale-95"
          title="Admin Panel"
        >
          ⚙ ADMIN
        </button>
      )}
      <AdminPanel
        isOpen={showAdmin}
        onClose={() => setShowAdmin(false)}
        engineRef={engineRef}
        snapshot={snapshot}
        account={currentUser ? { id: currentUser.id, username: currentUser.username, isGuest: currentUser.id.startsWith("guest_") } : null}
      />

      {/* ── Special panel ──────────────────────────────────────────
          Starts closed. Opens only via the exact voice activation
          phrase, and only for an account the server has authorized. */}
      <SpecialPanelActivator
        authorized={serverAuthorized && panelUsernameAllowed}
        onActivated={() => setShowSpecialPanel(true)}
      />
      <SpecialPanel
        isOpen={showSpecialPanel}
        onClose={() => setShowSpecialPanel(false)}
        engineRef={engineRef}
        room={currentRoom}
      />

      {/* Shop (Abacate Pay) */}
      <ShopPanel
        isOpen={showShop}
        onClose={() => setShowShop(false)}
        save={playerSave}
        onSaveChanged={(updated) => setPlayerSave(updated)}
        username={currentUser?.username ?? "Jogador"}
        email={currentUser?.email ?? "jogador@abacatepay.com"}
      />

      {/* Store — checkout manual via WhatsApp + resgate de código */}
      <Store
        isOpen={showStore}
        onClose={() => setShowStore(false)}
        save={playerSave}
        onSaveChanged={(updated) => setPlayerSave(updated)}
        player={currentUser?.username ?? "Jogador"}
        email={currentUser?.email ?? ""}
        initialTab={storeTab}
      />
    </main>
  );
}
