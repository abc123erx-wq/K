import { GameAudio } from "./audio";
import { BossGui, Player, Zombie } from "./entities";
import { Inventory } from "./inventory";
import { itemTemplates, makeItem, recipes } from "./items";
import { Renderer } from "./renderer";
import { EngineModules } from "./engineModules";
import type { DeathReport, GameEvent, GameSnapshot, House, Item, Mood, NPC, SandboxOptions } from "./types";
import { TILE, World } from "./world";
import { Net, Server, type ServerConfig } from "./net";
import { VEHICLES, createVehicle, type ActiveVehicle } from "./vehicles";
import { sanitizeText } from "./security";
import { VoiceChat } from "./voiceChat";
import type { FirstPersonConfig } from "./renderer";
import { DEFAULT_FIRST_PERSON_CONFIG } from "./renderer";
import type { AccessibilitySettings } from "./accessibility";
import { DEFAULT_ACCESSIBILITY } from "./accessibility";

type SnapshotListener = (snapshot: GameSnapshot) => void;
type DeathListener = (report: DeathReport) => void;

// Zombie spawn radius around player
const ZOMBIE_SPAWN_MIN = 18;
const ZOMBIE_SPAWN_MAX = 40;
const ZOMBIE_DESPAWN = 60;
const MAX_ACTIVE_ZOMBIES = 80;

export class GameEngine {
  world: World;
  player = new Player();
  zombies: Zombie[] = [];
  inventory = new Inventory();
  renderer: Renderer;
  audio = new GameAudio();
  keys = new Set<string>();
  running = false;
  paused = false;
  kills = 0;
  message = "Knox Event started. Loot a house before nightfall.";
  seconds = 0;
  gameMinutes = 8 * 60;
  dead = false;
  godMode = false;
  insideHouseId: string | null = null;
  private _nearHouseGate: string | null = null;

  isCoop = false;
  player2: Player | null = null;
  inventory2: Inventory | null = null;
  insideHouseId2: string | null = null;
  kills2 = 0;
  running2 = false;
  boss: BossGui | null = null;
  bossSpawned = false;
  groundItems: { id: string; item: Item; x: number; y: number; ts: number }[] = [];

  // ============================================================
  //  FIRST-PERSON CAMERA — visual/control option only.
  //
  //  Nothing here changes the character's position, hitboxes,
  //  reach, speed, accuracy or any gameplay rule. The camera
  //  transition is handled by the renderer and never teleports
  //  the player.
  // ============================================================

  /** Apply the first-person configuration (called on load and on toggle). */
  setFirstPerson(config: Partial<FirstPersonConfig>) {
    this.firstPerson = {
      ...this.firstPerson,
      ...config,
      fov: Math.min(100, Math.max(55, config.fov ?? this.firstPerson.fov)),
      sensitivity: Math.min(3, Math.max(0.25, config.sensitivity ?? this.firstPerson.sensitivity)),
    };
  }

  /** Toggle the first-person camera. Returns the new enabled state. */
  toggleFirstPerson(): boolean {
    this.firstPerson = { ...this.firstPerson, enabled: !this.firstPerson.enabled };
    this.message = `[AJUSTE] Câmera em primeira pessoa ${this.firstPerson.enabled ? "ATIVADA" : "DESATIVADA"}.`;
    this.emitSnapshot();
    return this.firstPerson.enabled;
  }

  /** Is the first-person camera currently enabled? */
  get firstPersonEnabled(): boolean {
    return this.firstPerson.enabled;
  }

  /**
   * Apply the accessibility / safety options.
   * Called on load and whenever the player changes them.
   */
  setAccessibility(settings: Partial<AccessibilitySettings>) {
    this.accessibility = { ...this.accessibility, ...settings };
    this.audio.setVolume(this.accessibility.volume);
  }

  // ============================================================
  //  SPECIAL PANEL — server-authorised effect placement.
  //
  //  The SERVER decides whether an effect may appear and exactly
  //  where. The client only materialises it at the coordinates
  //  the server returned, after re-checking that the spot is still
  //  walkable locally (defensive, never widening the placement).
  // ============================================================

  /**
   * Spawn an effect at server-chosen positions.
   *
   * @param effectId id from the server allowlist
   * @param positions world coordinates validated by the server
   */
  applyServerSpawn(effectId: string, positions: { x: number; y: number }[]): { ok: boolean; spawned: number; reason?: string } {
    const known = new Set([
      "zombie_scavenger",
      "zombie_brute",
      "zombie_swarm",
      "hunter",
      "pet",
    ]);
    if (!known.has(effectId)) {
      return { ok: false, spawned: 0, reason: "recurso-invalido" };
    }
    if (!Array.isArray(positions) || positions.length === 0) {
      return { ok: false, spawned: 0, reason: "sem-ponto-seguro" };
    }

    let spawned = 0;
    for (const pos of positions) {
      const x = pos?.x;
      const y = pos?.y;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      // Defensive local re-check: never place inside a wall.
      if (this.world.isBlocked(x, y)) continue;
      if (!this.world.inBounds(Math.floor(x), Math.floor(y))) continue;

      const zombie = new Zombie(x, y);
      switch (effectId) {
        case "zombie_scavenger":
          zombie.hp = 60;
          break;
        case "zombie_brute":
          zombie.hp = 180;
          zombie.scale = 1.45;
          zombie.radius = 0.26 * zombie.scale;
          break;
        case "hunter":
          zombie.hp = 110;
          zombie.state = "chase";
          zombie.faceAngle = Math.random() * Math.PI * 2;
          break;
        case "pet":
          zombie.hp = 40;
          zombie.tame = true;
          zombie.pet = true;
          break;
        case "zombie_swarm":
        default:
          zombie.hp = 50;
          break;
      }
      this.zombies.push(zombie);
      spawned++;
    }

    // Respect the engine's own entity ceiling.
    if (this.zombies.length > MAX_ACTIVE_ZOMBIES) {
      this.zombies.length = MAX_ACTIVE_ZOMBIES;
    }

    if (spawned === 0) {
      return { ok: false, spawned: 0, reason: "sem-ponto-seguro" };
    }
    this.emitSnapshot();
    return { ok: true, spawned };
  }

  // ============================================================
  //  ADMIN FLAGS & FX STATE — mutated by the admin command registry
  // ============================================================
  adminFlags = {
    oneShot: false,
    zombiesOneHp: false,
    infiniteAmmo: false,
    infiniteFuel: false,
    godVehicles: false,
    magnet: false,
    autoLoot: false,
    friendlyZombies: false,
    bloodMoon: false,
    zenNoSpawns: false,
    bigHead: false,
    drunk: false,
    invertControls: false,
    xray: false,
    noclip: false,
    freezeZombiesUntil: 0,
    timestopUntil: 0,
    phaseUntil: 0,
    timeScaleMult: 1,
    zombieSpeedMult: 1,
    playerSpeedMult: 1,
    damageMult: 1,
    zoom: 1,
    renderFilter: "normal" as string,
    shake: 0,
    flashColor: null as string | null,
    flashAlpha: 0,
  };
  adminMarks: Record<string, { x: number; y: number }> = {};
  private savedPos: { x: number; y: number } | null = null;
  private pendingFx: { at: number; fn: () => void }[] = [];

  /** Schedule a one-shot visual/game effect `delayMs` from now. */
  scheduleFx(delayMs: number, fn: () => void) {
    this.pendingFx.push({ at: performance.now() + delayMs, fn });
  }

  getAdminFx() {
    const f = this.adminFlags;
    // Accessibility: damp the intense visual effects when the player
    // asked for reduced flashes / reduced motion. This only changes
    // presentation — never the gameplay.
    const shakeScale = this.accessibility.reduceMotion ? 0.25 : 1;
    const flashScale = this.accessibility.reduceFlashes ? 0.25 : 1;
    return {
      filter: f.renderFilter,
      zoom: f.zoom,
      shake: f.shake * shakeScale,
      flashColor: f.flashColor,
      flashAlpha: f.flashAlpha * flashScale,
      bigHead: f.bigHead,
      drunk: f.drunk,
      xray: f.xray,
    };
  }
  private _weather: "clear" | "rain" | "fog" | "storm" = "clear";
  private _weatherTimer = 0;
  private _weatherIntensity = 0;
  private _chatMessages: { id: string; name: string; text: string; ts: number }[] = [];
  private _netInfo = { myId: "", myName: "" };
  vehicles: ActiveVehicle[] = [];
  drivingVehicle: ActiveVehicle | null = null;
  drivingVehicleP2: ActiveVehicle | null = null;
  // PvP
  pvpEnabled = false;
  pvpKills = 0;
  pvpKillsP2 = 0;
  pvpDeaths = 0;
  pvpKillLog: { ts: number; killer: string; victim: string; weapon: string }[] = [];
  private _nearbyVehicles: { id: string; name: string; emoji: string; x: number; y: number; angle: number; fuel: number; durability: number; color: string; type: string; rarity: string; description: string; cargoCapacity: number; seats: number }[] = [];
  private _activeEvents: GameEvent[] = [];
  private _temperature = 20;
  private _nearbyStructures: { type: string; x: number; y: number }[] = [];
  private _nearbyNpcs: NPC[] = [];
  private _notifications: { text: string; type: string; ts: number }[] = [];
  private _eventTimer = 0;

  private options: SandboxOptions;
  /**
   * First-person camera configuration.
   * VISUAL ONLY — it never alters hitboxes, reach, speed,
   * accuracy or any gameplay rule.
   */
  firstPerson: FirstPersonConfig = { ...DEFAULT_FIRST_PERSON_CONFIG };
  /**
   * Accessibility & safety options.
   * These only affect presentation (volume, flashes, motion) and can
   * switch the suspense events off entirely. They never change the
   * rules of the game.
   */
  accessibility: AccessibilitySettings = { ...DEFAULT_ACCESSIBILITY };
  private animation = 0;
  private last = performance.now();
  private snapshotTimer = 0;
  private spawnTimer = 0;
  private mouseWorld = { x: 0, y: 0 };
  private virtualMove = { x: 0, y: 0, running: false };
  private virtualAimActive = false;
  private cleanupHandlers: (() => void)[] = [];
  private onSnapshot: SnapshotListener;
  private onDeath: DeathListener;
  private canvas: HTMLCanvasElement;

  /**
   * Optional accelerated engines (PixiJS, Phaser, PlayCanvas, Godot,
   * Rapier/WASM, WebGL2/WebGPU). They are *infrastructure* — the
   * game rules live entirely in this class and never change.
   */
  readonly modules: EngineModules;

  constructor(
    canvas: HTMLCanvasElement,
    options: SandboxOptions,
    onSnapshot: SnapshotListener,
    onDeath: DeathListener,
    isCoop = false,
    savedItems?: { name: string; qty: number }[],
    savedEquipped?: string | null,
  ) {
    this.canvas = canvas;
    this.modules = new EngineModules(canvas);
    // Kick off the optional layers without blocking the first frame.
    void this.modules.enableAll();
    this.options = options;
    this.onSnapshot = onSnapshot;
    this.onDeath = onDeath;
    this.isCoop = isCoop;
    this.world = new World(options);
    this.renderer = new Renderer(canvas);
    // Start player near center of map
    this.player.x = 5000;
    this.player.y = 5000;
    // Initial chunk load
    this.world.updateLoadedChunks(this.player.x, this.player.y);
    // Find a good spawn on road/grass
    this.findPlayerSpawn();
    this.seedPlayer(savedItems, savedEquipped);
    if (isCoop) {
      this.player2 = new Player();
      this.inventory2 = new Inventory();
      this.player2.x = this.player.x + 1.2;
      this.player2.y = this.player.y;
      this.inventory2.add(makeItem(itemTemplates.kitchenKnife));
      this.inventory2.add(makeItem(itemTemplates.waterBottle));
      this.inventory2.add(makeItem(itemTemplates.rag));
      this.inventory2.equip(this.inventory2.items[0].id);
    }
    this.seedInitialZombies();
    this.seedVehicles();
    this.boss = new BossGui(5070, 5070);
    this.bossSpawned = true;
    this.message = "⚠️ BOSS GUI HAS AWAKENED AT X:5070 Y:5070! Seek him out or flee!";
    this.bindInput();
    this.renderer.resize();
    this.audio.start();
    this.audio.setVolume(this.accessibility.volume);
    this._netInfo = Net.init();
    Net.setOnChat((msg) => this.receiveChat(msg));
    Net.setOnPvP((msg) => this.receivePvP(msg));
    VoiceChat.init(this._netInfo.myId, this._netInfo.myName);
    this.emitSnapshot();
    this.animation = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.animation);
    this.cleanupHandlers.forEach((cleanup) => cleanup());
    this.audio.stop();
    VoiceChat.stopMicrophone();
    Net.destroy();
    // Release every optional engine (GPU buffers, WASM world).
    this.modules.destroy();
  }

  /** Find a walkable spawn point near the center */
  private findPlayerSpawn() {
    for (let attempt = 0; attempt < 500; attempt++) {
      const x = 4990 + Math.random() * 20;
      const y = 4990 + Math.random() * 20;
      const tile = this.world.tileAt(x, y);
      if (tile === "road" || tile === "grass") {
        this.player.x = x;
        this.player.y = y;
        return;
      }
    }
  }

  useItem(id: string, pNum: 1 | 2 = 1) {
    const inv = pNum === 1 ? this.inventory : (this.inventory2 ?? this.inventory);
    const p = pNum === 1 ? this.player : (this.player2 ?? this.player);
    const item = inv.consume(id);
    if (!item) return;
    if (item.hunger) p.stats.hunger = Math.max(0, p.stats.hunger - item.hunger);
    if (item.thirst) p.stats.thirst = Math.max(0, p.stats.thirst - item.thirst);
    if (item.heal) p.stats.health = Math.min(100, p.stats.health + item.heal);
    if (item.sanity) p.stats.sanity = Math.min(100, Math.max(0, p.stats.sanity + item.sanity));
    if (item.stamina) p.stats.stamina = Math.min(100, Math.max(0, p.stats.stamina + item.stamina));
    if (item.warmth) p.stats.warmth = Math.min(100, Math.max(0, p.stats.warmth + item.warmth));
    if (item.carryBonus) inv.add(item);
    this.noise(7);
    this.message = `P${pNum} used ${item.name}.`;
    this.emitSnapshot();
  }

  equipItem(id: string, pNum: 1 | 2 = 1) {
    const inv = pNum === 1 ? this.inventory : (this.inventory2 ?? this.inventory);
    inv.equip(id);
    this.message = `P${pNum} readied weapon.`;
    this.emitSnapshot();
  }

  lootItem(id: string, pNum: 1 | 2 = 1) {
    const inside = pNum === 1 ? this.insideHouseId : this.insideHouseId2;
    const inv = pNum === 1 ? this.inventory : (this.inventory2 ?? this.inventory);
    const house = inside ? this.currentHouse(pNum) : null;
    const item = house?.container.find((entry) => entry.id === id);
    if (!house || !item) return;
    if (inv.weight + item.weight * item.qty > inv.capacity) {
      this.message = `P${pNum}: too heavy.`;
      this.emitSnapshot();
      return;
    }
    house.container = house.container.filter((entry) => entry.id !== id);
    inv.add(item);
    house.looted = house.container.length === 0;
    this.message = `P${pNum} looted ${item.name}.`;
    this.emitSnapshot();
  }

  craft(recipeId: string, pNum: 1 | 2 = 1) {
    const inv = pNum === 1 ? this.inventory : (this.inventory2 ?? this.inventory);
    const recipe = recipes.find((entry) => entry.id === recipeId);
    if (!recipe) return;
    if (recipe.station && !inv.hasItem(recipe.station)) {
      this.message = `P${pNum} needs ${recipe.station}.`;
      this.emitSnapshot();
      return;
    }
    if (inv.craft(recipe)) this.message = `P${pNum} crafted ${recipe.result.name}.`;
    else this.message = `P${pNum}: missing ingredients.`;
    this.emitSnapshot();
  }

  assignHotbar(slot: number, id: string, pNum: 1 | 2 = 1) {
    const inv = pNum === 1 ? this.inventory : (this.inventory2 ?? this.inventory);
    inv.assignHotbar(slot, id);
    this.emitSnapshot();
  }

  togglePause() {
    this.paused = !this.paused;
    this.emitSnapshot();
  }

  setVirtualMove(x: number, y: number, running = false) {
    const length = Math.hypot(x, y);
    this.virtualMove = {
      x: length > 1 ? x / length : x,
      y: length > 1 ? y / length : y,
      running,
    };
  }

  clearVirtualMove() {
    this.virtualMove = { x: 0, y: 0, running: false };
  }

  setAimFromClient(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.renderer.mouse = { x: clientX - rect.left, y: clientY - rect.top };
    this.mouseWorld = this.renderer.screenToWorld(this.renderer.mouse.x, this.renderer.mouse.y);
    this.player.angle = Math.atan2(this.mouseWorld.y - this.player.y, this.mouseWorld.x - this.player.x);
    this.virtualAimActive = true;
  }

  mobileAttack() {
    if (!this.virtualAimActive) this.aimAtNearestZombie();
    this.attack();
  }

  mobileInteract() {
    this.interact();
  }

  mobileContextAction() {
    this.contextAction();
  }

  sendChat(rawText: string) {
    const text = sanitizeText(rawText, 200);
    if (!text) return;
    Net.sendChat(text);
    this._chatMessages.push({
      id: this._netInfo.myId,
      name: this._netInfo.myName,
      text,
      ts: Date.now(),
    });
    // Keep only last 100 messages
    if (this._chatMessages.length > 100) this._chatMessages.shift();
    this.message = `[Chat] ${this._netInfo.myName}: ${text.trim()}`;
    this.emitSnapshot();
  }

  receiveChat(msg: { id: string; name: string; text: string; ts: number }) {
    this._chatMessages.push(msg);
    if (this._chatMessages.length > 100) this._chatMessages.shift();
    this.emitSnapshot();
  }

  receivePvP(msg: { fromId: string; fromName: string; targetId: string; damage: number; weapon: string; ts: number; isKill: boolean }) {
    // Check if WE are the target
    const myInfo = Net.getMyInfo();
    if (msg.targetId !== myInfo.myId) {
      // Just log to chat for spectator awareness
      if (msg.isKill) {
        this._chatMessages.push({ id: "system", name: "⚔️", text: `${msg.fromName} killed someone with ${msg.weapon}!`, ts: msg.ts });
      }
      return;
    }
    // We are the target - apply damage
    if (!this.pvpEnabled) {
      // Auto-enable PvP if attacked (defensive)
      this.pvpEnabled = true;
      this.addNotification(`⚔️ ${msg.fromName} attacked you! PvP enabled.`, "danger");
    }
    this.player.stats.health = Math.max(0, this.player.stats.health - msg.damage);
    this.player.hurtCooldown = 0.5;
    this.addNotification(`💥 ${msg.fromName} hit you for ${Math.round(msg.damage)} dmg with ${msg.weapon}`, "danger");
    this.pvpKillLog.unshift({ ts: msg.ts, killer: msg.fromName, victim: this._netInfo.myName, weapon: msg.weapon });
    if (this.pvpKillLog.length > 20) this.pvpKillLog.pop();
    if (msg.isKill && this.player.stats.health <= 0) {
      this.pvpDeaths++;
      this.die(`Killed by ${msg.fromName} (${msg.weapon})`);
    }
    this.emitSnapshot();
  }

  togglePvP() {
    this.pvpEnabled = !this.pvpEnabled;
    this.addNotification(this.pvpEnabled ? "⚔️ PvP ATIVADO" : "🤝 PvP desativado", this.pvpEnabled ? "danger" : "info");
    this.emitSnapshot();
  }

  /**
   * Swap the multiplayer backend at runtime (admin → Servidores).
   * Reconnects the adapter and re-registers chat / PvP callbacks.
   */
  switchServer(config: ServerConfig) {
    Server.disconnect();
    const adapter = Server.connect(config);
    this._netInfo = adapter.getMyInfo();
    Net.setOnChat((msg) => this.receiveChat(msg));
    Net.setOnPvP((msg) => this.receivePvP(msg));
    try {
      localStorage.setItem("knox-backend", config.backend);
      localStorage.setItem("knox-room", config.roomId ?? "global");
      if (config.wsUrl) localStorage.setItem("knox-ws-url", config.wsUrl);
      else localStorage.removeItem("knox-ws-url");
    } catch { /* ignore */ }
    this.message = `[SERVER] Conectado via ${config.backend} na sala "${config.roomId ?? "global"}".`;
    this.emitSnapshot();
  }

  // ============================================================
  //  Admin commands
  // ============================================================
  adminHealFull() {
    this.player.stats.health = 100;
    this.player.stats.hunger = 0;
    this.player.stats.thirst = 0;
    this.player.stats.stamina = 100;
    this.player.stats.sanity = 100;
    this.player.stats.infection = 0;
    this.player.bitten = false;
    this.message = "[ADMIN] Full heal applied.";
    this.emitSnapshot();
  }

  adminGodMode() {
    this.godMode = !this.godMode;
    this.message = `[ADMIN] God Mode ${this.godMode ? "ON" : "OFF"}.`;
    this.emitSnapshot();
  }

  adminKillAllZombies() {
    this.kills += this.zombies.length;
    this.zombies = [];
    this.message = "[ADMIN] All zombies eliminated.";
    this.emitSnapshot();
  }

  adminSpawnZombies(count: number) {
    let spawned = 0;
    let tries = 0;
    while (spawned < count && tries < 2000) {
      tries++;
      const angle = Math.random() * Math.PI * 2;
      const dist = 5 + Math.random() * 10;
      const x = this.player.x + Math.cos(angle) * dist;
      const y = this.player.y + Math.sin(angle) * dist;
      if (!this.world.inBounds(Math.floor(x), Math.floor(y))) continue;
      const tile = this.world.tileAt(x, y);
      if (tile === "house" || tile === "fence") continue;
      this.zombies.push(new Zombie(x, y));
      spawned++;
    }
    this.message = `[ADMIN] Spawned ${spawned} zombies.`;
    this.emitSnapshot();
  }

  adminGiveAllItems() {
    for (const key of Object.keys(itemTemplates)) {
      this.inventory.add(makeItem(itemTemplates[key], 5));
    }
    this.message = "[ADMIN] All items x5 added.";
    this.emitSnapshot();
  }

  adminSpawnItem(templateKey: string, qty = 1) {
    const template = itemTemplates[templateKey];
    if (!template) {
      this.message = `[ADMIN] Unknown item: ${templateKey}`;
      this.emitSnapshot();
      return;
    }
    for (let i = 0; i < Math.max(1, qty); i++) {
      this.inventory.add(makeItem(template));
    }
    this.message = `[ADMIN] Spawned ${qty}x ${template.name}.`;
    this.emitSnapshot();
  }

  // ============================================================
  //  DROP SYSTEM — drop items on the ground
  // ============================================================

  /** Drop a single item (or partial stack) from inventory to the ground */
  dropItem(itemId: string, qty = 1, pNum: 1 | 2 = 1) {
    const inv = pNum === 1 ? this.inventory : (this.inventory2 ?? this.inventory);
    const p = pNum === 1 ? this.player : (this.player2 ?? this.player);
    const removed = inv.removeById(itemId, qty);
    if (!removed) {
      this.message = `P${pNum}: item not found.`;
      this.emitSnapshot();
      return;
    }
    // Scatter slightly in front of the player so it is visible
    const dropX = p.x + Math.cos(p.angle) * 0.9 + (Math.random() - 0.5) * 0.4;
    const dropY = p.y + Math.sin(p.angle) * 0.9 + (Math.random() - 0.5) * 0.4;
    this.groundItems.push({
      id: `drop-${Math.random().toString(36).slice(2, 9)}`,
      item: removed,
      x: dropX,
      y: dropY,
      ts: Date.now(),
    });
    this.message = `P${pNum} dropped ${removed.qty}x ${removed.name}.`;
    this.emitSnapshot();
  }

  /** Drop every item in the inventory */
  dropAllItems(pNum: 1 | 2 = 1) {
    const inv = pNum === 1 ? this.inventory : (this.inventory2 ?? this.inventory);
    const snapshot = [...inv.items];
    let count = 0;
    for (const item of snapshot) {
      this.dropItemSilent(item.id, item.qty, pNum);
      count++;
    }
    this.message = `P${pNum} dropped ${count} item stacks.`;
    this.emitSnapshot();
  }

  private dropItemSilent(itemId: string, qty: number, pNum: 1 | 2) {
    const inv = pNum === 1 ? this.inventory : (this.inventory2 ?? this.inventory);
    const p = pNum === 1 ? this.player : (this.player2 ?? this.player);
    const removed = inv.removeById(itemId, qty);
    if (!removed) return;
    this.groundItems.push({
      id: `drop-${Math.random().toString(36).slice(2, 9)}`,
      item: removed,
      x: p.x + (Math.random() - 0.5) * 1.8,
      y: p.y + (Math.random() - 0.5) * 1.8,
      ts: Date.now(),
    });
  }

  /** Pick up the nearest ground item */
  pickupNearestItem(pNum: 1 | 2 = 1) {
    const p = pNum === 1 ? this.player : (this.player2 ?? this.player);
    const inv = pNum === 1 ? this.inventory : (this.inventory2 ?? this.inventory);

    let bestIdx = -1;
    let bestDist = 2.2;
    for (let i = 0; i < this.groundItems.length; i++) {
      const g = this.groundItems[i];
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx < 0) {
      this.message = `P${pNum}: nothing to pick up nearby.`;
      this.emitSnapshot();
      return;
    }
    const ground = this.groundItems[bestIdx];
    const weightAdd = ground.item.weight * ground.item.qty;
    if (inv.weight + weightAdd > inv.capacity) {
      this.message = `P${pNum}: too heavy to pick up ${ground.item.name}.`;
      this.emitSnapshot();
      return;
    }
    inv.add(ground.item);
    this.groundItems.splice(bestIdx, 1);
    this.message = `P${pNum} picked up ${ground.item.qty}x ${ground.item.name}.`;
    this.emitSnapshot();
  }

  /** Admin: drop a fresh item template on the ground near the player */
  adminDropItem(templateKey: string, qty = 1) {
    const template = itemTemplates[templateKey];
    if (!template) {
      this.message = `[ADMIN] Unknown item: ${templateKey}`;
      this.emitSnapshot();
      return;
    }
    for (let i = 0; i < Math.max(1, qty); i++) {
      this.groundItems.push({
        id: `drop-${Math.random().toString(36).slice(2, 9)}`,
        item: makeItem(template),
        x: this.player.x + (Math.random() - 0.5) * 3,
        y: this.player.y + (Math.random() - 0.5) * 3,
        ts: Date.now(),
      });
    }
    this.message = `[ADMIN] Dropped ${qty}x ${template.name} on the ground.`;
    this.emitSnapshot();
  }

  /** Remove all ground items (cleanup) */
  adminClearGroundItems() {
    const n = this.groundItems.length;
    this.groundItems = [];
    this.message = `[ADMIN] Cleared ${n} ground items.`;
    this.emitSnapshot();
  }

  adminSpawnItemFromCompendium(compItem: { id: string; nome: string; categoria: string; peso_kg: number; valor: number; stack: number }) {
    let type: any = "material";
    if (compItem.categoria === "Armas brancas" || compItem.categoria === "Armas de fogo") type = "weapon";
    else if (compItem.categoria === "Munição e acessórios") type = "ammo";
    else if (compItem.categoria === "Ferramentas") type = "tool";
    else if (compItem.categoria === "Comida e água") type = "food";
    else if (compItem.categoria === "Medicina/curas") type = "medical";
    else if (compItem.categoria === "Roupas/armaduras") type = "bag";

    let weaponAttrs: any = undefined;
    if (compItem.categoria === "Armas brancas") {
      weaponAttrs = { damage: 25 + Math.floor(compItem.valor / 50), range: 40, stamina: 12, noise: 25, mode: "melee" };
    } else if (compItem.categoria === "Armas de fogo") {
      weaponAttrs = { damage: 50 + Math.floor(compItem.valor / 50), range: 600, stamina: 6, noise: 120, mode: "firearm", ammo: "9mm Rounds" };
    }

    const gameItem = makeItem({
      name: compItem.nome,
      type,
      weight: compItem.peso_kg,
      qty: 1,
      weapon: weaponAttrs,
      hunger: compItem.categoria === "Comida e água" ? 25 : undefined,
      heal: compItem.categoria === "Medicina/curas" ? 30 : undefined,
      tags: [compItem.categoria.toLowerCase()],
    });

    this.inventory.add(gameItem);
    this.message = `[ADMIN] Spawned ${compItem.nome} into inventory.`;
    this.emitSnapshot();
  }

  adminSetTime(hour: number) {
    const currentDay = Math.floor(this.gameMinutes / 1440);
    this.gameMinutes = currentDay * 1440 + hour * 60;
    this.message = `[ADMIN] Time set to ${hour}:00.`;
    this.emitSnapshot();
  }

  adminTeleport(x: number, y: number) {
    if (this.world.inBounds(x, y)) {
      this.player.x = x;
      this.player.y = y;
      // Force chunk reload around new position
      this.world.updateLoadedChunks(x, y);
      this.message = `[ADMIN] Teleported to ${x}, ${y}.`;
    }
    this.emitSnapshot();
  }

  adminSetStat(stat: keyof typeof this.player.stats, value: number) {
    this.player.stats[stat] = Math.max(0, Math.min(100, value));
    this.message = `[ADMIN] ${stat} set to ${value}.`;
    this.emitSnapshot();
  }

  /**
   * Seed the player's inventory.
   * If the survivor died before, they keep what they were carrying
   * (saved on death). Otherwise they get the standard starter kit.
   */
  private seedPlayer(savedItems?: { name: string; qty: number }[], savedEquipped?: string | null) {
    const restoredFromDeath = !!savedItems && savedItems.length > 0;

    if (restoredFromDeath && savedItems) {
      for (const entry of savedItems) {
        const template = Object.values(itemTemplates).find((t) => t.name === entry.name);
        if (!template) continue;
        this.inventory.add(makeItem(template, entry.qty));
      }
      // Re-equip the same weapon they died with, or any weapon available
      const restored = savedEquipped
        ? this.inventory.items.find((i) => i.name === savedEquipped)
        : undefined;
      const weapon = restored?.weapon ? restored : this.inventory.items.find((i) => i.weapon);
      if (weapon) this.inventory.equip(weapon.id);
    } else {
      this.inventory.add(makeItem(itemTemplates.kitchenKnife));
      this.inventory.add(makeItem(itemTemplates.waterBottle));
      this.inventory.add(makeItem(itemTemplates.rag));
    }

    // Deliver shop purchases (items queued by Abacate Pay checkout)
    try {
      const raw = localStorage.getItem("knox-pending-items");
      if (raw) {
        const keys = JSON.parse(raw) as string[];
        let delivered = 0;
        for (const key of keys) {
          const template = itemTemplates[key];
          if (template) {
            this.inventory.add(makeItem(template));
            delivered++;
          }
        }
        localStorage.removeItem("knox-pending-items");
        if (delivered > 0) {
          this.addNotification(`🛒 Entrega da loja: ${delivered} itens adicionados ao inventário!`, "success");
        }
      }
    } catch { /* ignore */ }

    if (restoredFromDeath) {
      const weapon = this.inventory.items.find((i) => i.weapon);
      if (weapon) this.inventory.equip(weapon.id);
      else this.inventory.equippedId = null;
    } else {
      this.inventory.equip(this.inventory.items[0].id);
    }
  }

  /** Spawn initial zombies around the player */
  private seedInitialZombies() {
    const count = this.options.zombieCount;
    let tries = 0;
    while (this.zombies.length < count && tries < 2000) {
      tries++;
      const angle = Math.random() * Math.PI * 2;
      const dist = ZOMBIE_SPAWN_MIN + Math.random() * (ZOMBIE_SPAWN_MAX - ZOMBIE_SPAWN_MIN);
      const x = this.player.x + Math.cos(angle) * dist;
      const y = this.player.y + Math.sin(angle) * dist;
      if (!this.world.inBounds(Math.floor(x), Math.floor(y))) continue;
      const tile = this.world.tileAt(x, y);
      if (tile === "house" || tile === "fence") continue;
      this.zombies.push(new Zombie(x, y));
    }
  }

  // ============================================================
  //  VEHICLES
  // ============================================================
  private seedVehicles() {
    // Spawn 15 random vehicles around player on roads/grass
    let tries = 0;
    let spawned = 0;
    const target = 18;
    while (spawned < target && tries < 500) {
      tries++;
      const angle = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 35;
      const x = this.player.x + Math.cos(angle) * dist;
      const y = this.player.y + Math.sin(angle) * dist;
      if (!this.world.inBounds(Math.floor(x), Math.floor(y))) continue;
      const tile = this.world.tileAt(x, y);
      if (tile !== "road" && tile !== "grass") continue;
      // Random vehicle, biased towards commons
      const roll = Math.random();
      let pool = VEHICLES.filter(v => v.rarity === "Comum");
      if (roll > 0.75) pool = VEHICLES.filter(v => v.rarity === "Incomum");
      if (roll > 0.92) pool = VEHICLES.filter(v => v.rarity === "Raro");
      if (roll > 0.98) pool = VEHICLES.filter(v => v.rarity === "Épico" || v.rarity === "Lendário");
      if (pool.length === 0) pool = VEHICLES.filter(v => v.rarity === "Comum");
      const stats = pool[Math.floor(Math.random() * pool.length)];
      this.vehicles.push(createVehicle(stats, x, y));
      spawned++;
    }
  }

  enterVehicle(pNum: 1 | 2 = 1) {
    const p = pNum === 1 ? this.player : (this.player2 ?? this.player);
    const currentVehicle = pNum === 1 ? this.drivingVehicle : this.drivingVehicleP2;
    if (currentVehicle) {
      // Exit vehicle
      if (pNum === 1) this.drivingVehicle = null;
      else this.drivingVehicleP2 = null;
      currentVehicle.driver = null;
      currentVehicle.engineOn = false;
      p.x = currentVehicle.x + 1;
      p.y = currentVehicle.y;
      this.message = `P${pNum}: Exited ${currentVehicle.stats.name}.`;
      this.emitSnapshot();
      return;
    }
    // Find closest vehicle within 2.5 tiles
    let closest: ActiveVehicle | null = null;
    let closestDist = 2.5;
    for (const v of this.vehicles) {
      if (v.driver !== null) continue;
      const d = Math.hypot(v.x - p.x, v.y - p.y);
      if (d < closestDist) { closest = v; closestDist = d; }
    }
    if (!closest) {
      this.message = `P${pNum}: No vehicle nearby. Press V near a car to drive.`;
      this.emitSnapshot();
      return;
    }
    closest.driver = pNum;
    closest.engineOn = closest.fuel > 0;
    if (pNum === 1) this.drivingVehicle = closest;
    else this.drivingVehicleP2 = closest;
    this.message = `P${pNum}: Entered ${closest.stats.name}.${closest.fuel <= 0 ? " Out of fuel!" : ""}`;
    this.emitSnapshot();
  }

  private updateVehicles(dt: number) {
    // Driving physics
    const drive = (vehicle: ActiveVehicle, p: Player, pNum: 1 | 2) => {
      if (!vehicle.engineOn || vehicle.fuel <= 0) return;
      const left = this.keys.has("a") || this.keys.has("arrowleft") ? -1 : 0;
      const right = this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0;
      const up = this.keys.has("w") || this.keys.has("arrowup") ? -1 : 0;
      const down = this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0;
      const acc = vehicle.stats.acceleration;
      const maxSpeed = vehicle.stats.maxSpeed;
      vehicle.vx += (left + right + this.virtualMove.x) * acc * dt;
      vehicle.vy += (up + down + this.virtualMove.y) * acc * dt;
      // Speed cap
      const speed = Math.hypot(vehicle.vx, vehicle.vy);
      if (speed > maxSpeed) {
        vehicle.vx = (vehicle.vx / speed) * maxSpeed;
        vehicle.vy = (vehicle.vy / speed) * maxSpeed;
      }
      // Friction
      vehicle.vx *= 0.96;
      vehicle.vy *= 0.96;
      // Apply movement
      const nx = vehicle.x + vehicle.vx * dt;
      const ny = vehicle.y + vehicle.vy * dt;
      if (!this.world.isBlocked(nx, vehicle.y)) vehicle.x = nx;
      if (!this.world.isBlocked(vehicle.x, ny)) vehicle.y = ny;
      // Angle from velocity
      if (speed > 0.5) vehicle.angle = Math.atan2(vehicle.vy, vehicle.vx);
      // Sync player position to vehicle
      p.x = vehicle.x;
      p.y = vehicle.y;
      p.angle = vehicle.angle;
      // Burn fuel (admin: infinite fuel)
      if (!this.adminFlags.infiniteFuel) {
        vehicle.fuel = Math.max(0, vehicle.fuel - (speed / vehicle.stats.fuelEfficiency) * dt);
      }
      if (vehicle.fuel <= 0 && !this.adminFlags.infiniteFuel) {
        vehicle.engineOn = false;
        this.addNotification(`P${pNum}: ${vehicle.stats.name} ran out of fuel!`, "danger");
      }
      // Run over zombies
      for (const z of this.zombies) {
        if (Math.hypot(z.x - vehicle.x, z.y - vehicle.y) < 1.2 && speed > 2) {
          z.hp -= speed * 12;
          if (z.hp <= 0 && pNum === 1) this.kills++;
          else if (z.hp <= 0) this.kills2++;
          if (!this.adminFlags.godVehicles) vehicle.durability -= 0.3;
        }
      }
      // Noise attracts zombies
      if (speed > 1) this.noise(Math.min(40, speed * 3 + 10));
    };
    if (this.drivingVehicle) drive(this.drivingVehicle, this.player, 1);
    if (this.drivingVehicleP2 && this.player2) drive(this.drivingVehicleP2, this.player2, 2);
  }

  private bindInput() {
    const keydown = (event: KeyboardEvent) => {
      const k = event.key.toLowerCase();
      this.keys.add(k);
      if (k === "e") this.interact(1);
      if (k === "f") this.contextAction(1);
      if (k === "v") this.enterVehicle(1);
      if (k === "j") this.enterVehicle(2);
      if (k === "k") this.togglePvP();
      if (k === "p") this.togglePause();
      if (k === "g") {
        const equipped = this.inventory.equipped;
        if (equipped) this.dropItem(equipped.id, 1, 1);
        else this.message = "Nothing equipped to drop.";
      }
      if (k === "h") this.pickupNearestItem(1);
      const slot = Number(event.key) - 1;
      if (slot >= 0 && slot < 5) {
        const item = this.inventory.hotbar[slot];
        if (item?.weapon) this.equipItem(item.id, 1);
        else if (item) this.useItem(item.id, 1);
      }

      // Player 2 controls
      if (this.isCoop && this.player2 && this.player2.stats.health > 0 && this.inventory2) {
        if (k === "enter" || k === "0" || k === "l") this.attack(2);
        if (k === "/" || k === "]" || k === "1" || k === "k") this.interact(2);
        if (k === "." || k === "2" || k === "j") this.contextAction(2);
        const p2Slots: Record<string, number> = { "7": 0, "8": 1, "9": 2, "0": 3, "-": 4 };
        if (k in p2Slots) {
          const item2 = this.inventory2.hotbar[p2Slots[k]];
          if (item2?.weapon) this.equipItem(item2.id, 2);
          else if (item2) this.useItem(item2.id, 2);
        }
      }
    };
    const keyup = (event: KeyboardEvent) => this.keys.delete(event.key.toLowerCase());
    const mousemove = (event: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.renderer.mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      this.mouseWorld = this.renderer.screenToWorld(this.renderer.mouse.x, this.renderer.mouse.y);
      this.player.angle = Math.atan2(this.mouseWorld.y - this.player.y, this.mouseWorld.x - this.player.x);
    };
    const mousedown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const clickedHouse = this.world.houseAt(this.mouseWorld.x, this.mouseWorld.y);
      if (clickedHouse && Math.hypot(clickedHouse.door.x - this.player.x, clickedHouse.door.y - this.player.y) < 3.6) {
        this.interact(1);
        return;
      }
      this.attack(1);
    };
    const resize = () => this.renderer.resize();
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", () => setTimeout(resize, 200));
    this.canvas.addEventListener("mousemove", mousemove);
    this.canvas.addEventListener("mousedown", mousedown);
    this.cleanupHandlers.push(
      () => window.removeEventListener("keydown", keydown),
      () => window.removeEventListener("keyup", keyup),
      () => window.removeEventListener("resize", resize),
      () => this.canvas.removeEventListener("mousemove", mousemove),
      () => this.canvas.removeEventListener("mousedown", mousedown),
    );
  }

  // OPTIMIZATION: cache values updated per-frame (not per-call)
  private _cachedHour = 8;
  private _cachedMoodles: Mood[] = [];
  private _cachedOnlinePlayers: ReturnType<typeof Net.getActivePlayers> = [];
  private _cachedRenderVehicles: typeof this._nearbyVehicles = [];

  private loop = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // Feed the profiler + the adaptive quality controller.
    this.modules.profiler.begin(now);
    this.modules.quality.update(dt * 1000);
    if (!this.paused && !this.dead) this.update(dt);

    // Compute cached values once per frame
    this._cachedHour = Math.floor(this.gameMinutes / 60) % 24;
    this._cachedMoodles = this.getMoodles(1);
    this._cachedOnlinePlayers = Net.getActivePlayers();

    // Pass vehicles for rendering
    this._cachedRenderVehicles = this._nearbyVehicles;

    this.renderer.render(
      this.world,
      this.player,
      this.zombies,
      this._cachedHour,
      this._cachedMoodles,
      this.paused,
      this.insideHouseId,
      this._cachedOnlinePlayers,
      this._weather,
      this._weatherIntensity,
      this.player2,
      this.insideHouseId2,
      this._cachedRenderVehicles.map((v) => ({
        x: v.x,
        y: v.y,
        angle: v.angle,
        color: v.color,
        accentColor: this.vehicles.find((veh) => veh.id === v.id)?.stats.accentColor,
        width: this.vehicles.find((veh) => veh.id === v.id)?.stats.width,
        height: this.vehicles.find((veh) => veh.id === v.id)?.stats.height,
        name: v.name,
        type: v.type,
        fuel: v.fuel,
        durability: v.durability,
      })),
      this.drivingVehicle
        ? {
            name: this.drivingVehicle.stats.name,
            emoji: this.drivingVehicle.stats.emoji,
            fuel: this.drivingVehicle.fuel,
            maxFuel: this.drivingVehicle.stats.fuelCapacity,
            durability: this.drivingVehicle.durability,
            maxDur: this.drivingVehicle.stats.durability,
            speed: Math.round(Math.hypot(this.drivingVehicle.vx, this.drivingVehicle.vy) * 10) / 10,
            rarity: this.drivingVehicle.stats.rarity,
          }
        : null,
      this.getAdminFx(),
      this.inventory.equipped,
      this.inventory2?.equipped ?? null,
      this.firstPerson,
    );

    // Draw dropped ground items
    if (this.groundItems.length > 0) {
      this.renderer.drawGroundItems(
        this.groundItems
          .filter((g) => Math.abs(g.x - this.player.x) < 40 && Math.abs(g.y - this.player.y) < 40)
          .map((g) => ({
            id: g.id, name: g.item.name, qty: g.item.qty,
            x: g.x, y: g.y, type: g.item.type, rarity: g.item.rarity,
          })),
        this.player.x, this.player.y,
      );
    }

    // Draw Boss GUI on top of the scene
    if (this.boss && this.bossSpawned) {
      this.renderer.drawBossGui(this.boss);
    }

    // Throttled snapshot - 5 Hz (was ~6 Hz)
    this.snapshotTimer += dt;
    if (this.snapshotTimer > 0.2) {
      this.snapshotTimer = 0;
      this.emitSnapshot();
    }
    this.animation = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    this.seconds += dt;
    this.gameMinutes += dt * this.options.timeScale * this.adminFlags.timeScaleMult;

    // ---- Admin FX bookkeeping ----
    const nowMs = performance.now();
    this.pendingFx = this.pendingFx.filter((fx) => {
      if (nowMs >= fx.at) { try { fx.fn(); } catch { /* ignore */ } return false; }
      return true;
    });
    const F = this.adminFlags;
    F.shake = Math.max(0, F.shake - dt * (0.6 + F.shake * 1.4));
    F.flashAlpha = Math.max(0, F.flashAlpha - dt * 1.8);

    // Update loaded world chunks around the player
    this.world.updateLoadedChunks(this.player.x, this.player.y);

    // Track nearby house gate for mobile UI
    this._nearHouseGate = this.insideHouseId ? null : (this.nearbyHouse(5.2, 1)?.id ?? null);

    // OPTIMIZATION: only keep vehicles within render distance in snapshot
    const VIEW_DIST = 40;
    this._nearbyVehicles = [];
    for (const v of this.vehicles) {
      if (Math.abs(v.x - this.player.x) < VIEW_DIST && Math.abs(v.y - this.player.y) < VIEW_DIST) {
        this._nearbyVehicles.push({
          id: v.id,
          name: v.stats.name,
          emoji: v.stats.emoji,
          x: v.x, y: v.y, angle: v.angle,
          fuel: v.fuel, durability: v.durability,
          color: v.stats.color, type: v.stats.type,
          rarity: v.stats.rarity, description: v.stats.description,
          cargoCapacity: v.stats.cargoCapacity, seats: v.stats.seats,
        });
      }
    }

    this.updateWeather(dt);

    this.updatePlayer(dt);
    this.updateSurvival(dt);
    if (this.isCoop && this.player2 && this.player2.stats.health > 0) this.updateSurvivalP2(dt);
    this.updateZombiePopulation(dt);
    this.updateVehicles(dt);

    // Sync with other players
    Net.setState(this.player.x, this.player.y, this.player.angle, this.player.stats.health, this.kills);
    Net.update(dt);

    const night = this.isNight();
    const F2 = this.adminFlags;
    const frozen = nowMs < F2.freezeZombiesUntil || nowMs < F2.timestopUntil;
    const zdt = frozen ? 0 : dt * F2.zombieSpeedMult * (F2.bloodMoon ? 1.35 : 1);
    const dmgMult = F2.bloodMoon ? 1.5 : 1;
    for (const zombie of this.zombies) {
      // Pets keep following the player
      if (zombie.pet && !frozen) {
        zombie.target = { x: this.player.x, y: this.player.y };
        if (zombie.state === "chase") zombie.state = "alert";
      }
      zombie.update(zdt, this.player, this.world, night, (this.isCoop && this.player2) ? this.player2 : undefined, !F2.friendlyZombies, dmgMult);
      // One-HP zombies mode
      if (F2.zombiesOneHp && zombie.hp > 1) zombie.hp = 1;
      if (zombie.danceUntil && zombie.danceUntil < nowMs) zombie.danceUntil = 0;
    }
    this.zombies = this.zombies.filter((zombie) => zombie.hp > 0);
    this.separateEntities();

    // Magnet: pull ground items toward the player; AutoLoot: pick them up
    if (F2.magnet || F2.autoLoot) {
      for (const g of this.groundItems) {
        const d = Math.hypot(g.x - this.player.x, g.y - this.player.y);
        if (F2.magnet && d < 9 && d > 0.6) {
          const pull = Math.min(d, 7 * dt);
          g.x += ((this.player.x - g.x) / d) * pull;
          g.y += ((this.player.y - g.y) / d) * pull;
        }
        if (F2.autoLoot && d < 1.2) {
          if (this.inventory.weight + g.item.weight * g.item.qty <= this.inventory.capacity) {
            this.inventory.add(g.item);
            g.item.qty = 0; // mark for removal
          }
        }
      }
      this.groundItems = this.groundItems.filter((g) => g.item.qty > 0);
    }
    // Update Boss Gui
    if (this.boss && this.bossSpawned) {
      this.boss.update(dt, this.player, this.world, this.isNight(), (this.isCoop && this.player2) ? this.player2 : undefined);
      if (this.boss.defeated) {
        this.bossSpawned = false;
        this.kills += 500;
        this.addNotification("💀 BOSS GUI DEFEATED! Rewards: +500 kills!", "success");
      }
    }

    this.audio.groan(dt, this.nearbyZombies(1) + (this.isCoop ? this.nearbyZombies(2) : 0));

    this.player.hurtCooldown = Math.max(0, this.player.hurtCooldown - dt);
    if (this.isCoop && this.player2) this.player2.hurtCooldown = Math.max(0, this.player2.hurtCooldown - dt);

    if (this.godMode) {
      this.player.stats.health = 100;
      this.player.stats.stamina = 100;
      if (this.player2) {
        this.player2.stats.health = 100;
        this.player2.stats.stamina = 100;
      }
    }

    if (this.isCoop && this.player2) {
      if (this.player.stats.health <= 0 && this.player2.stats.health <= 0 && !this.godMode) {
        this.die(this.player.stats.infection >= 100 ? "Knox Infection" : "Blood loss and trauma");
      }
    } else {
      if (this.player.stats.health <= 0 && !this.godMode) {
        this.die(this.player.stats.infection >= 100 ? "Knox Infection" : "Blood loss and trauma");
      }
    }
  }

  /** Continuously spawn new zombies as the player moves, despawn far ones */
  private updateZombiePopulation(dt: number) {
    // Admin Zen mode: no spawns at all
    if (this.adminFlags.zenNoSpawns) { this.spawnTimer = 1; return; }
    this.spawnTimer -= dt;

    // Despawn far zombies
    this.zombies = this.zombies.filter((z) => {
      const dist = Math.hypot(z.x - this.player.x, z.y - this.player.y);
      return dist < ZOMBIE_DESPAWN;
    });

    // Spawn new zombies periodically
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 1.5 + Math.random() * 2;

    const targetCount = this.options.zombieCount;
    if (this.zombies.length >= Math.min(targetCount, MAX_ACTIVE_ZOMBIES)) return;

    const toSpawn = Math.min(3, targetCount - this.zombies.length);
    for (let i = 0; i < toSpawn; i++) {
      let tries = 0;
      while (tries < 30) {
        tries++;
        const angle = Math.random() * Math.PI * 2;
        const dist = ZOMBIE_SPAWN_MIN + Math.random() * (ZOMBIE_SPAWN_MAX - ZOMBIE_SPAWN_MIN);
        const x = this.player.x + Math.cos(angle) * dist;
        const y = this.player.y + Math.sin(angle) * dist;
        if (!this.world.inBounds(Math.floor(x), Math.floor(y))) continue;
        const tile = this.world.tileAt(x, y);
        if (tile === "house" || tile === "fence" || tile === "water" || tile === "bunker") continue;
        this.zombies.push(new Zombie(x, y));
        break;
      }
    }
  }

  private updatePlayer(dt: number) {
    const left = this.keys.has("a") || this.keys.has("arrowleft") ? -1 : 0;
    const right = this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0;
    const up = this.keys.has("w") || this.keys.has("arrowup") ? -1 : 0;
    const down = this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0;
    let moveX = left + right + this.virtualMove.x;
    let moveY = up + down + this.virtualMove.y;
    const F3 = this.adminFlags;
    if (F3.invertControls) { moveX = -moveX; moveY = -moveY; }
    this.running = (this.keys.has("shift") || this.virtualMove.running) && (moveX || moveY) !== 0;
    // Admin movement modes
    this.player.noclip = F3.noclip || performance.now() < F3.phaseUntil;
    const beforeX = this.player.x;
    const beforeY = this.player.y;
    this.player.move(moveX, moveY, dt, this.world, this.running, F3.playerSpeedMult);
    if (beforeX !== this.player.x || beforeY !== this.player.y) {
      if (this.player.stepTimer <= 0) {
        this.audio.step();
        this.player.stepTimer = this.running ? 0.22 : 0.42;
      }
      if (this.running) this.noise(7, false);
    }
  }

  private updateSurvival(dt: number) {
    if (this.godMode) return;
    const stats = this.player.stats;
    stats.hunger = Math.min(100, stats.hunger + 0.03 * dt * this.options.timeScale);
    stats.thirst = Math.min(100, stats.thirst + 0.045 * dt * this.options.timeScale);
    stats.sanity = Math.max(0, stats.sanity - (this.nearbyZombies() > 0 ? 0.55 : 0.04) * dt);

    // Warmth system
    const hour = Math.floor(this.gameMinutes / 60) % 24;
    const isNight = this.isNight();
    const isInside = !!this.insideHouseId;
    if (isNight && !isInside) stats.warmth = Math.max(0, stats.warmth - 0.3 * dt);
    else if (this._weather === "storm") stats.warmth = Math.max(0, stats.warmth - 0.15 * dt);
    else stats.warmth = Math.min(100, stats.warmth + 0.08 * dt);

    // Radiation (passive if active event)
    const hasRadEvent = this._activeEvents.some(e => e.type === "disaster" && e.effect === "radiation");
    if (hasRadEvent && !isInside) stats.radiation = Math.min(100, stats.radiation + 0.5 * dt);

    // Temperature display
    this._temperature = 15 + Math.sin((hour - 6) * Math.PI / 12) * 12 + (isInside ? 5 : 0) - (isNight ? 8 : 0);

    // Health effects
    if (stats.hunger > 75) stats.health -= 0.6 * dt;
    if (stats.thirst > 72) stats.health -= 0.9 * dt;
    if (stats.stamina < 16) stats.sanity -= 0.1 * dt;
    if (stats.warmth < 20) stats.health -= 0.3 * dt;
    if (stats.radiation > 50) stats.health -= 0.4 * dt;
    if (stats.infection > 0) {
      stats.infection = Math.min(100, stats.infection + 0.08 * dt * this.options.timeScale);
      stats.sanity -= 0.25 * dt;
      if (stats.infection >= 82) stats.health -= 0.9 * dt;
    }

    // Dynamic events
    this._eventTimer -= dt;
    if (this._eventTimer <= 0) {
      this._eventTimer = 300 + Math.random() * 600;
      // The player can switch the suspense events off entirely.
      if (!this.accessibility.disableEvents) this.triggerRandomEvent();
    }
    // Tick active events
    this._activeEvents = this._activeEvents.filter(event => {
      event.elapsed += dt;
      if (event.elapsed > event.duration) {
        this.addNotification(`${event.name} has ended.`, "event");
        return false;
      }
      return true;
    });
  }

  private triggerRandomEvent() {
    const events = [
      { id: "horde-incoming", name: "Horde Incoming!", description: "A horde of zombies is approaching from the east.", icon: "🧟", type: "horde" as const, duration: 60, elapsed: 0, active: true, effect: "spawn" },
      { id: "radio-signal", name: "Radio Signal Detected", description: "A weak radio signal from a nearby bunker.", icon: "📡", type: "discovery" as const, duration: 120, elapsed: 0, active: true, effect: "discovery" },
      { id: "supply-drop", name: "Supply Drop", description: "Military supply drop nearby. Look for flares.", icon: "📦", type: "discovery" as const, duration: 180, elapsed: 0, active: true, effect: "loot" },
      { id: "storm-warning", name: "Storm Warning", description: "Severe storm approaching. Seek shelter.", icon: "⛈️", type: "weather" as const, duration: 240, elapsed: 0, active: true, effect: "storm" },
      { id: "faction-patrol", name: "Bandit Patrol", description: "Bandits are patrolling the nearby roads.", icon: "🔫", type: "faction" as const, duration: 120, elapsed: 0, active: true, effect: "hostile" },
      { id: "building-collapse", name: "Building Collapse", description: "An old building just collapsed nearby.", icon: "🏚️", type: "disaster" as const, duration: 60, elapsed: 0, active: true, effect: "blockage" },
      { id: "helicopter", name: "Helicopter Overhead", description: "A helicopter passes overhead, attracting zombies.", icon: "🚁", type: "world" as const, duration: 30, elapsed: 0, active: true, effect: "horde" },
      { id: "dead-zombie-feast", name: "Zombie Feast", description: "Zombies are feasting on a corpse. Stay quiet.", icon: "💀", type: "world" as const, duration: 90, elapsed: 0, active: true, effect: "attract" },
      { id: "power-outage", name: "Power Outage", description: "Local power grid failed. All lights off.", icon: "⚡", type: "disaster" as const, duration: 180, elapsed: 0, active: true, effect: "dark" },
      { id: "lone-survivor", name: "Lone Survivor", description: "Someone was spotted on the rooftop.", icon: "👤", type: "discovery" as const, duration: 120, elapsed: 0, active: true, effect: "npc" },
    ];

    const event = events[Math.floor(Math.random() * events.length)];
    this._activeEvents.push(event);
    this.addNotification(`EVENT: ${event.name} — ${event.description}`, "event");

    // Trigger event effects
    if (event.effect === "spawn") {
      for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 25 + Math.random() * 15;
        const x = this.player.x + Math.cos(angle) * dist;
        const y = this.player.y + Math.sin(angle) * dist;
        if (this.world.inBounds(Math.floor(x), Math.floor(y)) && this.world.tileAt(x, y) !== "house") {
          this.zombies.push(new Zombie(x, y));
        }
      }
    }
    if (event.effect === "horde") {
      for (let i = 0; i < 12; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 18 + Math.random() * 22;
        const x = this.player.x + Math.cos(angle) * dist;
        const y = this.player.y + Math.sin(angle) * dist;
        if (this.world.inBounds(Math.floor(x), Math.floor(y)) && this.world.tileAt(x, y) !== "house") {
          this.zombies.push(new Zombie(x, y));
        }
      }
    }
    if (event.effect === "storm") {
      this._weather = "storm";
      this._weatherIntensity = 0.7 + Math.random() * 0.3;
    }
    if (event.effect === "loot") {
      // Add bonus items to nearby house
      const house = this.nearbyHouse(15, 1);
      if (house) {
        const extras = [itemTemplates.mre, itemTemplates.medkitSmall, itemTemplates.waterJug5L];
        for (const e of extras) house.container.push(makeItem(e));
        this.addNotification("Supply items placed in a nearby building!", "success");
      }
    }
    if (event.effect === "radiation") {
      this.addNotification("Radiation detected! Stay inside or find a Geiger counter.", "danger");
    }
  }

  private addNotification(text: string, type: "event" | "success" | "danger" | "info") {
    this._notifications.push({ text, type, ts: Date.now() });
    if (this._notifications.length > 30) this._notifications.shift();
    this.message = text;
  }

  private updateSurvivalP2(dt: number) {
    if (!this.player2) return;
    const stats = this.player2.stats;
    stats.hunger = Math.min(100, stats.hunger + 0.03 * dt * this.options.timeScale);
    stats.thirst = Math.min(100, stats.thirst + 0.045 * dt * this.options.timeScale);
    stats.sanity = Math.max(0, stats.sanity - (this.nearbyZombies(2) > 0 ? 0.55 : 0.04) * dt);
    if (stats.hunger > 75) stats.health -= 0.6 * dt;
    if (stats.thirst > 72) stats.health -= 0.9 * dt;
    if (stats.stamina < 16) stats.sanity -= 0.1 * dt;
    if (stats.warmth < 20 && !this.insideHouseId2) stats.health -= 0.3 * dt;
    if (stats.infection > 0) {
      stats.infection = Math.min(100, stats.infection + 0.08 * dt * this.options.timeScale);
      stats.sanity -= 0.25 * dt;
      if (stats.infection >= 82) stats.health -= 0.9 * dt;
    }
  }

  private contextAction(pNum: 1 | 2 = 1) {
    const inside = pNum === 1 ? this.insideHouseId : this.insideHouseId2;
    const p = pNum === 1 ? this.player : (this.player2 ?? this.player);
    if (inside) {
      const house = this.currentHouse(pNum);
      if (house && Math.hypot(house.door.x - p.x, house.door.y - p.y) < 3.2) {
        this.exitHouse(house, pNum);
      } else {
        this.message = `P${pNum}: find the gate/door and press F to leave.`;
        this.emitSnapshot();
      }
      return;
    }

    const house = this.world.houseAt(p.x, p.y) ?? this.nearbyHouse(5.2, pNum);
    if (house) {
      this.enterHouse(house, pNum);
      return;
    }

    if (this.cutWood(pNum)) return;
    this.message = `P${pNum}: stand near a house gate to enter, or near a tree with an axe to cut wood.`;
    this.emitSnapshot();
  }

  private enterHouse(house: House, pNum: 1 | 2 = 1) {
    if (pNum === 1) this.insideHouseId = house.id;
    else this.insideHouseId2 = house.id;
    this.movePlayerJustInside(house, pNum);
    this.message = `P${pNum} slipped through the gate.`;
    this.noise(house.barricaded ? 8 : 4, false, pNum);
    this.emitSnapshot();
  }

  private exitHouse(house: House, pNum: 1 | 2 = 1) {
    if (pNum === 1) this.insideHouseId = null;
    else this.insideHouseId2 = null;
    const p = pNum === 1 ? this.player : (this.player2 ?? this.player);
    const dx = house.door.x < house.x ? -0.8 : house.door.x > house.x + house.w - 1 ? 0.8 : 0;
    const dy = house.door.y < house.y ? -0.8 : house.door.y > house.y + house.h - 1 ? 0.8 : 0;
    p.x = house.door.x + dx;
    p.y = house.door.y + dy;
    this.message = `P${pNum} back outside.`;
    this.emitSnapshot();
  }

  private movePlayerJustInside(house: House, pNum: 1 | 2 = 1) {
    const p = pNum === 1 ? this.player : (this.player2 ?? this.player);
    p.x = Math.min(house.x + house.w - 1.2, Math.max(house.x + 1.2, house.door.x));
    p.y = Math.min(house.y + house.h - 1.2, Math.max(house.y + 1.2, house.door.y));
  }

  private cutWood(pNum: 1 | 2 = 1) {
    const inv = pNum === 1 ? this.inventory : (this.inventory2 ?? this.inventory);
    const p = pNum === 1 ? this.player : (this.player2 ?? this.player);
    const equipped = inv.equipped;
    if (!equipped?.tags?.includes("axe")) {
      if (this.world.hasTreeNear(p.x, p.y, 1.35)) {
        this.message = `P${pNum}: need an axe equipped to cut wood.`;
        this.emitSnapshot();
        return true;
      }
      return false;
    }
    if (p.stats.stamina < 18 && !this.godMode) {
      this.message = `P${pNum}: too exhausted to swing an axe.`;
      this.emitSnapshot();
      return true;
    }
    const logs = this.world.cutNearestTree(p.x, p.y, 1.8);
    if (!logs) return false;
    p.stats.stamina = Math.max(0, p.stats.stamina - 18);
    inv.add(makeItem(itemTemplates.woodLog, logs));
    this.noise(34, true, pNum);
    this.message = `P${pNum} chopped a tree and collected ${logs} Wood Logs.`;
    this.emitSnapshot();
    return true;
  }

  private interact(pNum: 1 | 2 = 1) {
    const inside = pNum === 1 ? this.insideHouseId : this.insideHouseId2;
    const house = inside ? this.currentHouse(pNum) : null;
    if (!house) {
      this.message = `P${pNum}: nothing to loot. Press F near a house gate to get inside first.`;
      this.emitSnapshot();
      return;
    }
    this.message = house.container.length ? `P${pNum} opened house container.` : "This house is empty.";
    this.noise(house.barricaded ? 3 : 12, true, pNum);
    this.emitSnapshot();
  }

  private attack(pNum: 1 | 2 = 1) {
    const p = pNum === 1 ? this.player : (this.player2 ?? this.player);
    const inv = pNum === 1 ? this.inventory : (this.inventory2 ?? this.inventory);
    if (p.stats.health <= 0) return;

    const weapon = inv.equipped;
    const firearm = weapon?.weapon?.mode === "firearm";
    const ammoName = weapon?.weapon?.ammo;
    const damage = weapon?.weapon?.damage ?? 12;
    // FIX: melee range was way too short (34/42 = 0.81 tiles = unusable).
    // Firearms use raw pixel range; melee gets a generous tile-based reach.
    const rawRange = weapon?.weapon?.range ?? 30;
    const range = firearm
      ? rawRange / TILE
      : Math.max(2.0, (rawRange / TILE) * 2.4);
    const stamina = weapon?.weapon?.stamina ?? 16;
    const staminaCost = firearm ? 0 : stamina;
    if (staminaCost > 0 && p.stats.stamina < staminaCost * 0.45 && !this.godMode) {
      this.message = `P${pNum}: too exhausted to swing.`;
      return;
    }
    if (firearm && ammoName && !this.adminFlags.infiniteAmmo && !inv.removeByName(ammoName, 1)) {
      this.message = `P${pNum}: ${weapon?.name ?? "Firearm"} is empty. Need ${ammoName}.`;
      this.audio.hit();
      this.emitSnapshot();
      return;
    }
    p.stats.stamina = Math.max(0, p.stats.stamina - staminaCost);
    p.triggerAttackAnim();
    this.audio.hit();
    this.noise(weapon?.weapon?.noise ?? 28, true, pNum);
    // Cones widened so aiming feels fair (was 0.28 rad ≈ 16°, too strict).
    const cone = firearm
      ? (weapon?.tags?.includes("shotgun") ? 0.7 : 0.42)
      : 1.25; // melee has a wide 143° arc

    const inArc = (tx: number, ty: number) => {
      const angleTo = Math.atan2(ty - p.y, tx - p.x);
      const delta = Math.abs(Math.atan2(Math.sin(angleTo - p.angle), Math.cos(angleTo - p.angle)));
      return delta < cone;
    };

    // FIX: Boss was never included in hit detection, making it invulnerable.
    const boss = this.boss;
    if (boss && this.bossSpawned && !boss.defeated) {
      const bossHitRadius = 1.6; // boss is large (scale 2.5)
      const bossDist = Math.hypot(boss.x - p.x, boss.y - p.y);
      if (bossDist < range + bossHitRadius && inArc(boss.x, boss.y)) {
        let dmg = damage * (firearm ? 0.95 + Math.random() * 0.45 : 0.7 + Math.random() * 0.6);
        dmg *= this.adminFlags.damageMult;
        if (this.adminFlags.oneShot) dmg = 1e9;
        boss.takeDamage(dmg);
        this.message = `☠ Hit GUI for ${Math.round(dmg)}! (${boss.hp.toLocaleString()} HP left)`;
        this.emitSnapshot();
        return;
      }
    }

    let hit: Zombie | null = null;
    let best = Infinity;
    for (const zombie of this.zombies) {
      const distance = Math.hypot(zombie.x - p.x, zombie.y - p.y);
      if (distance >= range || distance >= best) continue;
      if (!inArc(zombie.x, zombie.y)) continue;
      hit = zombie;
      best = distance;
    }
    if (hit) {
      let hitDmg = damage * (firearm ? 0.95 + Math.random() * 0.45 : 0.7 + Math.random() * 0.6);
      hitDmg *= this.adminFlags.damageMult;
      if (this.adminFlags.oneShot) hitDmg = 1e9;
      hit.hp -= hitDmg;
      hit.state = "chase";
      hit.target = { x: p.x, y: p.y };
      this.message = hit.hp <= 0 ? "The corpse drops hard." : firearm ? "Shot connected." : "Hit landed.";
      if (hit.hp <= 0) {
        if (pNum === 1) this.kills++;
        else this.kills2++;
      }
    } else {
      // No zombie hit — check for online PvP targets
      if (this.pvpEnabled) {
        const target = this.findPvPTarget(p, range, firearm, weapon?.tags?.includes("shotgun") ?? false);
        if (target) {
          const dmg = damage * (firearm ? 0.95 + Math.random() * 0.45 : 0.7 + Math.random() * 0.6);
          const wasKill = target.health - dmg <= 0;
          Net.sendPvPDamage(target.id, dmg, weapon?.name ?? "fists", wasKill);
          this.message = wasKill
            ? `⚔️ KILLED ${target.name}!`
            : `⚔️ Hit ${target.name} for ${Math.round(dmg)} damage`;
          if (wasKill) {
            if (pNum === 1) this.pvpKills++;
            else this.pvpKillsP2++;
            this.addNotification(`💀 Killed ${target.name} (PvP)`, "success");
          }
          this.emitSnapshot();
          return;
        }
      }
      this.message = firearm ? "Shot missed." : "Attack missed.";
    }
    this.emitSnapshot();
  }

  /** Find online PvP target in range of player */
  private findPvPTarget(p: { x: number; y: number; angle: number }, range: number, firearm: boolean, isShotgun: boolean) {
    const players = Net.getActivePlayers();
    let best: typeof players[number] | null = null;
    let bestDist = Infinity;
    for (const op of players) {
      if (op.health <= 0) continue;
      const distance = Math.hypot(op.x - p.x, op.y - p.y);
      if (distance > range) continue;
      if (firearm) {
        const angleToTarget = Math.atan2(op.y - p.y, op.x - p.x);
        const delta = Math.abs(Math.atan2(Math.sin(angleToTarget - p.angle), Math.cos(angleToTarget - p.angle)));
        const cone = isShotgun ? 0.55 : 0.28;
        if (delta > cone) continue;
      }
      if (distance < bestDist) {
        best = op;
        bestDist = distance;
      }
    }
    return best;
  }

  // ============================================================
  //  ADMIN POWERS — called by the command registry (adminCommands.ts)
  // ============================================================

  adminScreenShake(power = 1) {
    this.adminFlags.shake = Math.min(3, this.adminFlags.shake + power);
  }

  adminFlash(color = "#ffffff", alpha = 0.85) {
    this.adminFlags.flashColor = color;
    this.adminFlags.flashAlpha = alpha;
  }

  /** Kill every zombie within `radius` tiles of the player. Big boom. */
  adminNuke(radius = 12) {
    let killed = 0;
    this.zombies = this.zombies.filter((z) => {
      if (Math.hypot(z.x - this.player.x, z.y - this.player.y) < radius) { killed++; return false; }
      return true;
    });
    this.kills += killed;
    this.adminFlash("#ffb020", 0.95);
    this.adminScreenShake(2.5);
    this.noise(60);
    this.message = `☢ NUKE: ${killed} zumbis vaporizados num raio de ${radius} tiles.`;
    this.emitSnapshot();
  }

  /** Meteors strike random spots near the player. */
  adminMeteor(count = 6) {
    for (let i = 0; i < count; i++) {
      this.scheduleFx(i * 260, () => {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * 14;
        const x = this.player.x + Math.cos(a) * d;
        const y = this.player.y + Math.sin(a) * d;
        this.zombies = this.zombies.filter((z) => {
          if (Math.hypot(z.x - x, z.y - y) < 3.2) { this.kills++; return false; }
          return true;
        });
        this.adminFlash("#ff5a20", 0.5);
        this.adminScreenShake(1.2);
      });
    }
    this.message = `☄ ${count} meteoros a caminho...`;
    this.emitSnapshot();
  }

  /** Lightning strikes the point the player is aiming at. */
  adminLightning() {
    const tx = this.player.x + Math.cos(this.player.angle) * 4;
    const ty = this.player.y + Math.sin(this.player.angle) * 4;
    this.zombies = this.zombies.filter((z) => {
      if (Math.hypot(z.x - tx, z.y - ty) < 2.6) { this.kills++; return false; }
      return true;
    });
    this.adminFlash("#eaf6ff", 0.95);
    this.adminScreenShake(1.5);
    this.noise(50);
    this.message = "⚡ Raio caiu onde você mirou.";
    this.emitSnapshot();
  }

  adminEarthquake() {
    this.adminScreenShake(3);
    for (const z of this.zombies) z.hp -= 25;
    this.zombies = this.zombies.filter((z) => z.hp > 0);
    this.message = "🌍 TERREMOTO! O chão racha e os mortos tropeçam.";
    this.emitSnapshot();
  }

  adminFireworks(n = 8) {
    const colors = ["#ff4a4a", "#ffd24a", "#4aff8a", "#4aaaff", "#c04aff", "#ff4ad2"];
    for (let i = 0; i < n; i++) {
      this.scheduleFx(i * 240, () => {
        this.adminFlash(colors[i % colors.length], 0.4);
        this.adminScreenShake(0.4);
      });
    }
    this.message = "🎆 Fogos de artifício!";
    this.emitSnapshot();
  }

  /** Rain items from the sky around the player. */
  adminRainItems(key?: string, count = 12) {
    const keys = Object.keys(itemTemplates);
    for (let i = 0; i < count; i++) {
      const k = key && itemTemplates[key] ? key : keys[Math.floor(Math.random() * keys.length)];
      const a = Math.random() * Math.PI * 2;
      const d = 1.5 + Math.random() * 6;
      this.groundItems.push({
        id: `rain-${Math.random().toString(36).slice(2, 9)}`,
        item: makeItem(itemTemplates[k]),
        x: this.player.x + Math.cos(a) * d,
        y: this.player.y + Math.sin(a) * d,
        ts: Date.now(),
      });
    }
    this.adminFlash("#8ac0ff", 0.3);
    this.message = `🌧 Choveu ${count} itens do céu!`;
    this.emitSnapshot();
  }

  /** High-quality supply drop cluster. */
  adminSupplyDrop() {
    const good = ["medkitFull", "ammo556", "mre", "adrenaline", "tacticalPack", "shotgun12", "waterJug5L", "sniperRifle", "goldBar", "grenadeFrag"];
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 1 + Math.random() * 3;
      const k = good[Math.floor(Math.random() * good.length)];
      this.groundItems.push({
        id: `drop-${Math.random().toString(36).slice(2, 9)}`,
        item: makeItem(itemTemplates[k]),
        x: this.player.x + Math.cos(a) * d,
        y: this.player.y + Math.sin(a) * d,
        ts: Date.now(),
      });
    }
    this.adminFlash("#ffd24a", 0.5);
    this.message = "📦 AIRDROP! Suprimentos militares caíram perto de você.";
    this.emitSnapshot();
  }

  adminSpawnHordeRing(count = 12, dist = 10) {
    let spawned = 0;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const x = this.player.x + Math.cos(a) * dist;
      const y = this.player.y + Math.sin(a) * dist;
      if (!this.world.inBounds(Math.floor(x), Math.floor(y))) continue;
      if (this.world.isBlocked(x, y)) continue;
      this.zombies.push(new Zombie(x, y));
      spawned++;
    }
    this.adminScreenShake(0.8);
    this.message = `🧟 Anel de ${spawned} zumbis se fecha ao seu redor...`;
    this.emitSnapshot();
  }

  adminSpawnChasers(count = 10) {
    let spawned = 0;
    for (let i = 0; i < count && spawned < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 6 + Math.random() * 6;
      const x = this.player.x + Math.cos(a) * d;
      const y = this.player.y + Math.sin(a) * d;
      if (!this.world.inBounds(Math.floor(x), Math.floor(y)) || this.world.isBlocked(x, y)) continue;
      const z = new Zombie(x, y);
      z.state = "chase";
      z.target = { x: this.player.x, y: this.player.y };
      this.zombies.push(z);
      spawned++;
    }
    this.message = `🧟 ${spawned} zumbis já chegam com sede de sangue!`;
    this.emitSnapshot();
  }

  /** Passive training dummies — they wander and never fight back. */
  adminSpawnDummies(count = 6) {
    let spawned = 0;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 3 + Math.random() * 6;
      const x = this.player.x + Math.cos(a) * d;
      const y = this.player.y + Math.sin(a) * d;
      if (!this.world.inBounds(Math.floor(x), Math.floor(y)) || this.world.isBlocked(x, y)) continue;
      const z = new Zombie(x, y);
      z.tame = true;
      z.renamed = true;
      z.customName = "Manequim";
      z.hp = 30;
      this.zombies.push(z);
      spawned++;
    }
    this.message = `🎯 ${spawned} manequins de treino spawnados. Eles não revidam.`;
    this.emitSnapshot();
  }

  /** Spawn a tame zombie pet that follows you everywhere. */
  adminSpawnPet() {
    const a = Math.random() * Math.PI * 2;
    const x = this.player.x + Math.cos(a) * 2;
    const y = this.player.y + Math.sin(a) * 2;
    const z = new Zombie(x, y);
    z.tame = true;
    z.pet = true;
    z.renamed = true;
    z.customName = "Bolt 🐾";
    z.hp = 500;
    this.zombies.push(z);
    this.message = "🐾 Bolt, o zumbi de estimação, agora te segue para todo lado!";
    this.emitSnapshot();
  }

  adminDuplicateNearby() {
    const near = this.zombies.filter((z) => Math.hypot(z.x - this.player.x, z.y - this.player.y) < 14);
    if (near.length === 0) { this.message = "Nenhum zumbi por perto para duplicar."; this.emitSnapshot(); return; }
    for (const z of near) {
      if (this.zombies.length > 240) break;
      const c = new Zombie(z.x + (Math.random() - 0.5), z.y + (Math.random() - 0.5));
      c.variant = z.variant; c.outfit = z.outfit; c.scale = z.scale; c.hp = z.hp;
      this.zombies.push(c);
    }
    this.message = `👯 ${near.length} zumbis duplicados!`;
    this.emitSnapshot();
  }

  adminExplodeZombies() {
    const n = this.zombies.length;
    this.kills += n;
    this.zombies = [];
    this.adminFlash("#ff5a20", 0.9);
    this.adminScreenShake(2.5);
    this.message = `💥 ${n} zumbis explodiram ao mesmo tempo!`;
    this.emitSnapshot();
  }

  adminFreezeZombies(sec = 6) {
    this.adminFlags.freezeZombiesUntil = performance.now() + sec * 1000;
    this.adminFlash("#aee6ff", 0.4);
    this.message = `🧊 Zumbis congelados por ${sec}s!`;
    this.emitSnapshot();
  }

  adminTimeStop(sec = 5) {
    this.adminFlags.timestopUntil = performance.now() + sec * 1000;
    this.adminFlash("#e8e8ff", 0.35);
    this.message = `⏱ ZA WARUDO! O tempo parou por ${sec}s.`;
    this.emitSnapshot();
  }

  adminEnrageAll() {
    for (const z of this.zombies) { z.state = "chase"; z.target = { x: this.player.x, y: this.player.y }; }
    this.adminFlash("#ff2020", 0.4);
    this.message = "😡 TODOS os zumbis ficaram furiosos e vêm te caçar!";
    this.emitSnapshot();
  }

  adminCalmAll() {
    for (const z of this.zombies) { z.state = "wander"; z.target = null; }
    this.message = "😌 Os zumbis se acalmaram e voltaram a vagar.";
    this.emitSnapshot();
  }

  /** Suck all nearby zombies into one point and crush them. */
  adminBlackHole() {
    let sucked = 0;
    this.zombies = this.zombies.filter((z) => {
      if (Math.hypot(z.x - this.player.x, z.y - this.player.y) < 20) { sucked++; return false; }
      return true;
    });
    this.kills += sucked;
    this.adminFlash("#8a2aff", 0.7);
    this.adminScreenShake(2);
    this.message = `🕳 Um buraco negro engoliu ${sucked} zumbis!`;
    this.emitSnapshot();
  }

  /** Yeet the nearest zombie across the map. */
  adminYeet() {
    let best: Zombie | null = null; let bd = 15;
    for (const z of this.zombies) {
      const d = Math.hypot(z.x - this.player.x, z.y - this.player.y);
      if (d < bd) { bd = d; best = z; }
    }
    if (!best) { this.message = "Nenhum zumbi perto para arremessar."; this.emitSnapshot(); return; }
    const a = Math.random() * Math.PI * 2;
    best.x = Math.min(9990, Math.max(10, best.x + Math.cos(a) * 40));
    best.y = Math.min(9990, Math.max(10, best.y + Math.sin(a) * 40));
    this.message = "🚀 YEET! O zumbi voou 40 tiles para longe.";
    this.emitSnapshot();
  }

  adminSwapWithZombie() {
    let best: Zombie | null = null; let bd = 20;
    for (const z of this.zombies) {
      const d = Math.hypot(z.x - this.player.x, z.y - this.player.y);
      if (d < bd) { bd = d; best = z; }
    }
    if (!best) { this.message = "Nenhum zumbi perto para trocar."; this.emitSnapshot(); return; }
    const px = this.player.x, py = this.player.y;
    this.player.x = best.x; this.player.y = best.y;
    best.x = px; best.y = py;
    this.adminFlash("#c04aff", 0.5);
    this.message = "🔀 Você trocou de lugar com um zumbi!";
    this.emitSnapshot();
  }

  /** Line up nearby zombies in a conga line behind the player. */
  adminConga() {
    const near = this.zombies
      .filter((z) => Math.hypot(z.x - this.player.x, z.y - this.player.y) < 16)
      .slice(0, 10);
    const back = this.player.angle + Math.PI;
    near.forEach((z, i) => {
      z.x = this.player.x + Math.cos(back) * (1.2 + i * 1.1);
      z.y = this.player.y + Math.sin(back) * (1.2 + i * 1.1);
      z.tame = true;
      z.danceUntil = performance.now() + 6000;
    });
    this.message = `🕺 CONGA! ${near.length} zumbis dançando atrás de você!`;
    this.emitSnapshot();
  }

  adminDance(sec = 5) {
    const until = performance.now() + sec * 1000;
    for (const z of this.zombies) {
      if (Math.hypot(z.x - this.player.x, z.y - this.player.y) < 20) z.danceUntil = until;
    }
    this.message = `🪩 Os zumbis próximos vão dançar por ${sec}s!`;
    this.emitSnapshot();
  }

  adminZombieTalk() {
    const lines = [
      "🧟 'Cééérebroos...'", "🧟 'Eu tinha um emprego sabe...'", "🧟 'Meu nome era Cláudio...'",
      "🧟 'Aaargh... que fome...'", "🧟 'Você viu meu carro por aí?'", "🧟 'Eu só queria um abraço...'",
      "🧟 'Aposentadoria foi uma fraude...'", "🧟 'Mordida não dói, confia.'", "🧟 'Me empresta 20 reais?'",
      "🧟 'Eu votei errado...'", "🧟 'Ahh, segunda-feira de novo...'",
    ];
    this.message = lines[Math.floor(Math.random() * lines.length)];
    this.emitSnapshot();
  }

  adminRenameZombie(name: string) {
    let best: Zombie | null = null; let bd = 15;
    for (const z of this.zombies) {
      const d = Math.hypot(z.x - this.player.x, z.y - this.player.y);
      if (d < bd) { bd = d; best = z; }
    }
    if (!best) { this.message = "Nenhum zumbi perto para nomear."; this.emitSnapshot(); return; }
    best.renamed = true;
    best.customName = name || "Sem Nome";
    this.message = `🏷 Zumbi renomeado para "${best.customName}".`;
    this.emitSnapshot();
  }

  adminZombieScale(mult: number) {
    for (const z of this.zombies) z.scale = Math.max(0.3, Math.min(4, z.scale * mult));
    this.message = `📏 Zumbis redimensionados x${mult}.`;
    this.emitSnapshot();
  }

  // ---- Boss commands ----
  adminTeleportToBoss() {
    if (!this.boss) { this.message = "Boss não existe."; this.emitSnapshot(); return; }
    this.player.x = this.boss.x + 5; this.player.y = this.boss.y;
    this.world.updateLoadedChunks(this.player.x, this.player.y);
    this.message = "👹 Teleportado para o GUI. Boa sorte.";
    this.emitSnapshot();
  }

  adminBossToMe() {
    if (!this.boss) { this.message = "Boss não existe."; this.emitSnapshot(); return; }
    this.boss.x = this.player.x + 6; this.boss.y = this.player.y;
    this.message = "👹 O GUI apareceu na sua frente. CORRE.";
    this.emitSnapshot();
  }

  adminDamageBoss(amount = 100000) {
    if (!this.boss || this.boss.defeated) { this.message = "Boss não existe ou já morreu."; this.emitSnapshot(); return; }
    this.boss.takeDamage(amount);
    if (this.boss.defeated) { this.bossSpawned = false; this.kills += 500; }
    this.adminFlash("#ff2060", 0.5);
    this.message = `👹 Boss tomou ${amount.toLocaleString()} de dano! (${this.boss.hp.toLocaleString()} HP restantes)`;
    this.emitSnapshot();
  }

  adminHealBoss(amount = 500000) {
    if (!this.boss) { this.message = "Boss não existe."; this.emitSnapshot(); return; }
    this.boss.hp = Math.min(this.boss.maxHp, this.boss.hp + amount);
    this.boss.defeated = false;
    this.message = `👹 Boss curado em ${amount.toLocaleString()}.`;
    this.emitSnapshot();
  }

  adminRespawnBoss() {
    this.boss = new BossGui(this.player.x + 10, this.player.y);
    this.bossSpawned = true;
    this.message = "👹 O GUI RENASCEU com 3.000.000 HP!";
    this.emitSnapshot();
  }

  // ---- Vehicle commands ----
  adminSpawnVehiclesNear(count = 5) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 3 + Math.random() * 6;
      const stats = VEHICLES[Math.floor(Math.random() * VEHICLES.length)];
      this.vehicles.push(createVehicle(stats, this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d));
    }
    this.message = `🚗 ${count} veículos spawnados ao redor!`;
    this.emitSnapshot();
  }

  adminRefuelAllVehicles() {
    for (const v of this.vehicles) v.fuel = v.stats.fuelCapacity;
    this.message = "⛽ Todos os veículos reabastecidos.";
    this.emitSnapshot();
  }

  adminRepairAllVehicles() {
    for (const v of this.vehicles) v.durability = v.stats.durability;
    this.message = "🔧 Todos os veículos reparados.";
    this.emitSnapshot();
  }

  adminExplodeAllVehicles() {
    const n = this.vehicles.length;
    this.vehicles = [];
    this.drivingVehicle = null;
    this.adminFlash("#ff5a20", 0.9);
    this.adminScreenShake(2.5);
    this.message = `💥 ${n} veículos explodiram!`;
    this.emitSnapshot();
  }

  // ---- Movement powers ----
  adminDash() {
    const d = 4;
    const nx = this.player.x + Math.cos(this.player.angle) * d;
    const ny = this.player.y + Math.sin(this.player.angle) * d;
    if (this.world.inBounds(Math.floor(nx), Math.floor(ny)) && !this.world.isBlocked(nx, ny)) {
      this.player.x = nx; this.player.y = ny;
      this.adminFlash("#8ac0ff", 0.25);
      this.message = "💨 Dash!";
    } else this.message = "Dash bloqueado por obstáculo.";
    this.emitSnapshot();
  }

  adminBlink() {
    const d = 7;
    const nx = this.player.x + Math.cos(this.player.angle) * d;
    const ny = this.player.y + Math.sin(this.player.angle) * d;
    if (this.world.inBounds(Math.floor(nx), Math.floor(ny)) && !this.world.isBlocked(nx, ny)) {
      this.player.x = nx; this.player.y = ny;
      this.adminFlash("#c04aff", 0.35);
      this.message = "✨ Blink!";
    } else this.message = "Blink bloqueado por obstáculo.";
    this.emitSnapshot();
  }

  adminMark(name: string) {
    this.adminMarks[name] = { x: this.player.x, y: this.player.y };
    this.message = `📍 Local "${name}" marcado em ${Math.round(this.player.x)}, ${Math.round(this.player.y)}.`;
    this.emitSnapshot();
  }

  adminTpMark(name: string): boolean {
    const m = this.adminMarks[name];
    if (!m) { this.message = `Local "${name}" não existe.`; this.emitSnapshot(); return false; }
    this.player.x = m.x; this.player.y = m.y;
    this.world.updateLoadedChunks(m.x, m.y);
    this.message = `📍 Teleportado para "${name}".`;
    this.emitSnapshot();
    return true;
  }

  adminSavePos() {
    this.savedPos = { x: this.player.x, y: this.player.y };
    this.message = `💾 Posição salva (${Math.round(this.player.x)}, ${Math.round(this.player.y)}).`;
    this.emitSnapshot();
  }

  adminLoadPos() {
    if (!this.savedPos) { this.message = "Nenhuma posição salva."; this.emitSnapshot(); return; }
    this.player.x = this.savedPos.x; this.player.y = this.savedPos.y;
    this.world.updateLoadedChunks(this.player.x, this.player.y);
    this.message = "📂 Posição carregada.";
    this.emitSnapshot();
  }

  adminClearEverything() {
    const z = this.zombies.length, g = this.groundItems.length, v = this.vehicles.length;
    this.zombies = []; this.groundItems = []; this.vehicles = [];
    this.drivingVehicle = null;
    this.message = `🧹 Limpeza total: ${z} zumbis, ${g} itens, ${v} veículos removidos.`;
    this.emitSnapshot();
  }

  adminApocalypse() {
    this.adminFlags.bloodMoon = true;
    this.adminSpawnChasers(40);
    this.scheduleFx(300, () => this.adminFlash("#ff2020", 0.6));
    this.message = "🌑 APOCALIPSE! Lua de sangue + 40 caçadores!";
    this.emitSnapshot();
  }

  adminParty() {
    this.adminFlags.renderFilter = "disco";
    this.adminFireworks(10);
    this.adminDance(8);
    this.message = "🪩 MODO FESTA! Disco + fogos + dança!";
    this.emitSnapshot();
  }

  adminZen() {
    this.adminFlags.zenNoSpawns = true;
    this.zombies = [];
    this.message = "🧘 Modo Zen: nenhum zumbi vai spawnar. Aproveite a paz.";
    this.emitSnapshot();
  }

  adminChaos(say?: (s: string) => void) {
    const pool: Array<{ n: string; fn: () => void }> = [
      { n: "meteoro", fn: () => this.adminMeteor(4) },
      { n: "nuke", fn: () => this.adminNuke(8) },
      { n: "horda", fn: () => this.adminSpawnChasers(15) },
      { n: "chuva de itens", fn: () => this.adminRainItems(undefined, 15) },
      { n: "terremoto", fn: () => this.adminEarthquake() },
      { n: "fogos", fn: () => this.adminFireworks(6) },
      { n: "raio", fn: () => this.adminLightning() },
      { n: "zumbis gigantes", fn: () => this.adminZombieScale(1.5) },
      { n: "festa", fn: () => this.adminParty() },
      { n: "congelar", fn: () => this.adminFreezeZombies(4) },
    ];
    const picks = 4;
    for (let i = 0; i < picks; i++) {
      const choice = pool[Math.floor(Math.random() * pool.length)];
      this.scheduleFx(i * 900, () => { choice.fn(); say?.(`🎲 Caos: ${choice.n}!`); });
    }
    this.message = "🎲 CAOS ALEATÓRIO! 4 eventos em sequência...";
    this.emitSnapshot();
  }

  /**
   * Push overlapping bodies apart so zombies form a crowd instead of
   * stacking into a single sprite, and so they cannot walk through the player.
   */
  private separateEntities() {
    const zs = this.zombies;
    // Only resolve zombies close to the player (perf: skip distant crowds)
    const near: Zombie[] = [];
    for (const z of zs) {
      if (Math.abs(z.x - this.player.x) < 26 && Math.abs(z.y - this.player.y) < 26) near.push(z);
    }

    // Zombie vs zombie
    for (let i = 0; i < near.length; i++) {
      const a = near[i];
      for (let j = i + 1; j < near.length; j++) {
        const b = near[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.radius + b.radius;
        const distSq = dx * dx + dy * dy;
        if (distSq >= minDist * minDist || distSq === 0) continue;
        const dist = Math.sqrt(distSq);
        const overlap = (minDist - dist) * 0.5;
        const ux = dx / dist;
        const uy = dy / dist;
        const ax = a.x - ux * overlap;
        const ay = a.y - uy * overlap;
        const bx = b.x + ux * overlap;
        const by = b.y + uy * overlap;
        if (!this.world.isBlocked(ax, a.y)) a.x = ax;
        if (!this.world.isBlocked(a.x, ay)) a.y = ay;
        if (!this.world.isBlocked(bx, b.y)) b.x = bx;
        if (!this.world.isBlocked(b.x, by)) b.y = by;
      }
    }

    // Zombie vs player (players get pushed slightly, zombies more)
    const players: Player[] = [this.player];
    if (this.isCoop && this.player2 && this.player2.stats.health > 0) players.push(this.player2);

    for (const p of players) {
      if (p.stats.health <= 0) continue;
      for (const z of near) {
        const dx = z.x - p.x;
        const dy = z.y - p.y;
        const minDist = p.radius + z.radius;
        const distSq = dx * dx + dy * dy;
        if (distSq >= minDist * minDist || distSq === 0) continue;
        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;
        const ux = dx / dist;
        const uy = dy / dist;
        // Zombie absorbs 75% of the correction, player 25%
        const zx = z.x + ux * overlap * 0.75;
        const zy = z.y + uy * overlap * 0.75;
        const px = p.x - ux * overlap * 0.25;
        const py = p.y - uy * overlap * 0.25;
        if (!this.world.isBlocked(zx, z.y)) z.x = zx;
        if (!this.world.isBlocked(z.x, zy)) z.y = zy;
        if (!this.world.isBlocked(px, p.y)) p.x = px;
        if (!this.world.isBlocked(p.x, py)) p.y = py;
      }
    }

    // Parked vehicles act as solid obstacles for players on foot
    for (const p of players) {
      if (p.stats.health <= 0) continue;
      const driving = p === this.player ? this.drivingVehicle : this.drivingVehicleP2;
      for (const veh of this.vehicles) {
        if (veh === driving) continue;
        const halfW = (veh.stats.height ?? 4) * 0.42;
        const halfH = (veh.stats.width ?? 2) * 0.42;
        const dx = p.x - veh.x;
        const dy = p.y - veh.y;
        if (Math.abs(dx) > halfW + 1.5 || Math.abs(dy) > halfH + 1.5) continue;

        // Rotate the player into the vehicle's local space (AABB test)
        const cos = Math.cos(-veh.angle);
        const sin = Math.sin(-veh.angle);
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;
        const ox = halfW + p.radius - Math.abs(lx);
        const oy = halfH + p.radius - Math.abs(ly);
        if (ox <= 0 || oy <= 0) continue;

        // Push out along the shallowest axis
        let plx = lx;
        let ply = ly;
        if (ox < oy) plx += Math.sign(lx || 1) * ox;
        else ply += Math.sign(ly || 1) * oy;

        const bcos = Math.cos(veh.angle);
        const bsin = Math.sin(veh.angle);
        const nx = veh.x + (plx * bcos - ply * bsin);
        const ny = veh.y + (plx * bsin + ply * bcos);
        if (!this.world.isBlocked(nx, p.y)) p.x = nx;
        if (!this.world.isBlocked(p.x, ny)) p.y = ny;
      }
    }
  }

  private aimAtNearestZombie() {
    let closest: Zombie | null = null;
    let closestDistance = Infinity;
    for (const zombie of this.zombies) {
      const distance = Math.hypot(zombie.x - this.player.x, zombie.y - this.player.y);
      if (distance < 13 && distance < closestDistance) {
        closest = zombie;
        closestDistance = distance;
      }
    }
    if (closest) {
      this.player.angle = Math.atan2(closest.y - this.player.y, closest.x - this.player.x);
      this.renderer.mouse = {
        x: closest.x * TILE - this.renderer.camera.x,
        y: closest.y * TILE - this.renderer.camera.y,
      };
    }
  }

  private currentHouse(pNum: 1 | 2 = 1) {
    const inside = pNum === 1 ? this.insideHouseId : this.insideHouseId2;
    if (!inside) return null;
    return this.world.houses.find((house) => house.id === inside) ?? null;
  }

  private nearbyHouse(radius = 2.4, pNum: 1 | 2 = 1) {
    const p = pNum === 1 ? this.player : (this.player2 ?? this.player);
    const houses = this.world.houses;
    let closest: typeof houses[0] | null = null;
    let closestDist = Infinity;
    for (const house of houses) {
      const dist = Math.hypot(house.door.x - p.x, house.door.y - p.y);
      if (dist < radius && dist < closestDist) {
        closest = house;
        closestDist = dist;
      }
    }
    return closest;
  }

  private noise(radius: number, setMessage = true, pNum: 1 | 2 = 1) {
    const p = pNum === 1 ? this.player : (this.player2 ?? this.player);
    const modified = this.isNight() ? radius * 1.25 : radius;
    for (const zombie of this.zombies) zombie.hear(p.x, p.y, modified);
    if (setMessage && modified > 20) this.message = `P${pNum} noise echoes through the block.`;
  }

  private nearbyZombies(pNum: 1 | 2 = 1) {
    const p = pNum === 1 ? this.player : (this.player2 ?? this.player);
    return this.zombies.filter((zombie) => Math.hypot(zombie.x - p.x, zombie.y - p.y) < 7).length;
  }

  private getMoodles(pNum: 1 | 2 = 1): Mood[] {
    const p = pNum === 1 ? this.player : (this.player2 ?? this.player);
    const s = p.stats;
    const moodles: Mood[] = [];
    if (s.hunger > 35) moodles.push({ kind: "hungry", icon: "😣", label: "Hungry", severity: s.hunger > 75 ? 3 : s.hunger > 55 ? 2 : 1, description: "Strength and healing are reduced." });
    if (s.thirst > 30) moodles.push({ kind: "thirsty", icon: "🥵", label: "Thirsty", severity: s.thirst > 70 ? 3 : s.thirst > 50 ? 2 : 1, description: "Drink soon or health will drain." });
    if (this.nearbyZombies(pNum) > 0 || s.sanity < 55) moodles.push({ kind: "panicked", icon: "😱", label: "Panic", severity: s.sanity < 25 ? 3 : this.nearbyZombies(pNum) > 2 ? 2 : 1, description: "Aim and stamina recovery suffer." });
    if (s.stamina < 35) moodles.push({ kind: "tired", icon: "😴", label: "Exerted", severity: s.stamina < 12 ? 3 : s.stamina < 22 ? 2 : 1, description: "You need to stop running." });
    if (s.health < 78 || p.bitten) moodles.push({ kind: "injured", icon: "🩸", label: p.bitten ? "Bitten" : "Injured", severity: s.health < 35 ? 3 : s.health < 60 ? 2 : 1, description: "Bandage and avoid more contact." });
    if (s.infection > 0) moodles.push({ kind: "infected", icon: "☣", label: "Queasy", severity: s.infection > 70 ? 3 : s.infection > 35 ? 2 : 1, description: "Something is wrong. It will not stop." });
    if (this.godMode) moodles.push({ kind: "panicked" as any, icon: "🛡️", label: "God Mode", severity: 1, description: "Admin god mode active." });
    return moodles;
  }

  private isNight() {
    const hour = Math.floor(this.gameMinutes / 60) % 24;
    return hour < 6 || hour > 20;
  }

  private updateWeather(dt: number) {
    this._weatherTimer -= dt * this.options.timeScale;
    if (this._weatherTimer > 0) return;
    // Change weather every 8-20 game hours
    this._weatherTimer = (8 + Math.random() * 12) * 60;
    const roll = Math.random();
    const night = this.isNight();
    if (roll < 0.35) {
      this._weather = "clear";
      this._weatherIntensity = 0;
    } else if (roll < 0.6) {
      this._weather = "rain";
      this._weatherIntensity = 0.3 + Math.random() * 0.5;
    } else if (roll < 0.8 && !night) {
      this._weather = "fog";
      this._weatherIntensity = 0.15 + Math.random() * 0.25;
    } else {
      this._weather = "storm";
      this._weatherIntensity = 0.5 + Math.random() * 0.5;
    }
  }

  private die(cause: string) {
    if (this.dead) return;
    this.dead = true;
    this.onDeath({ cause, days: Math.floor(this.gameMinutes / 1440), kills: this.kills, hours: Math.floor(this.gameMinutes / 60) });
  }

  emitSnapshot() {
    const hour = Math.floor(this.gameMinutes / 60) % 24;
    const minute = Math.floor(this.gameMinutes % 60);
    const house = this.insideHouseId ? this.currentHouse(1) : null;
    const chasing = this.zombies.filter((zombie) => zombie.state === "chase").length;
    this.onSnapshot({
      stats: { ...this.player.stats },
      moodles: this.getMoodles(1),
      inventory: [...this.inventory.items],
      hotbar: [...this.inventory.hotbar],
      equipped: this.inventory.equipped,
      capacity: this.inventory.capacity,
      weight: this.inventory.weight,
      container: house ? { houseId: house.id, items: [...house.container] } : null,
      recipes,
      time: { day: Math.floor(this.gameMinutes / 1440) + 1, hour, minute, daysSurvived: Math.floor((this.gameMinutes - 8 * 60) / 1440) },
      kills: this.kills,
      zombies: { total: this.zombies.length, chasing, nearby: this.nearbyZombies(1) + (this.isCoop ? this.nearbyZombies(2) : 0) },
      message: this.message,
      running: this.running,
      paused: this.paused,
      position: { x: Math.round(this.player.x), y: Math.round(this.player.y) },
      insideHouse: this.insideHouseId,
      nearHouseGate: this._nearHouseGate,
      onlinePlayers: Net.getActivePlayers(),
      weather: this._weather,
      weatherIntensity: this._weatherIntensity,
      chatMessages: this._chatMessages.slice(-50),
      myPlayerId: this._netInfo.myId,
      myPlayerName: this._netInfo.myName,
      isCoop: this.isCoop,
      p2Stats: this.player2 ? { ...this.player2.stats } : undefined,
      p2Inventory: this.inventory2 ? [...this.inventory2.items] : undefined,
      p2Hotbar: this.inventory2 ? [...this.inventory2.hotbar] : undefined,
      p2Equipped: this.inventory2?.equipped ?? null,
      p2InsideHouse: this.insideHouseId2,
      p2Kills: this.kills2,
      events: this._activeEvents,
      temperature: this._temperature,
      structures: this._nearbyStructures,
      npcsNearby: this._nearbyNpcs,
      notifications: this._notifications.slice(-20),
      vehicles: this._nearbyVehicles,
      drivingVehicle: this.drivingVehicle ? {
        name: this.drivingVehicle.stats.name,
        emoji: this.drivingVehicle.stats.emoji,
        fuel: this.drivingVehicle.fuel,
        maxFuel: this.drivingVehicle.stats.fuelCapacity,
        durability: this.drivingVehicle.durability,
        maxDur: this.drivingVehicle.stats.durability,
        speed: Math.round(Math.hypot(this.drivingVehicle.vx, this.drivingVehicle.vy) * 10) / 10,
        rarity: this.drivingVehicle.stats.rarity,
      } : null,
      pvpEnabled: this.pvpEnabled,
      pvpKills: this.pvpKills,
      pvpDeaths: this.pvpDeaths,
      pvpKillLog: this.pvpKillLog.slice(0, 10),
      groundItems: this.groundItems
        .filter((g) => Math.abs(g.x - this.player.x) < 40 && Math.abs(g.y - this.player.y) < 40)
        .map((g) => ({
          id: g.id,
          name: g.item.name,
          qty: g.item.qty,
          weight: g.item.weight,
          x: g.x,
          y: g.y,
          type: g.item.type,
          rarity: g.item.rarity,
        })),
      nearestGroundItem: (() => {
        let best: { id: string; name: string; qty: number; distance: number } | null = null;
        let bestDist = 2.2;
        for (const g of this.groundItems) {
          const d = Math.hypot(g.x - this.player.x, g.y - this.player.y);
          if (d < bestDist) {
            bestDist = d;
            best = { id: g.id, name: g.item.name, qty: g.item.qty, distance: Math.round(d * 10) / 10 };
          }
        }
        return best;
      })(),
    });
  }
}
