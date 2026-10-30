// ═══════════════════════════════════════════════════════════════
//  ADMIN COMMAND REGISTRY
//  A single source of truth for every admin command. Each entry is
//  callable both from the in-game console (by typing) and from the
//  "Comandos" browser tab (by clicking RUN).
// ═══════════════════════════════════════════════════════════════

import type { GameEngine } from "./engine";
import { Net } from "./net";

export interface AdminCommand {
  /** Console token, e.g. "nuke" */
  cmd: string;
  /** Alternate console tokens */
  aliases?: string[];
  /** Grouping category */
  category: string;
  /** Short human description */
  desc: string;
  /** Optional argument hints shown in the browser, e.g. ["raio=12"] */
  args?: string[];
  /** Destructive / risky commands get flagged red */
  danger?: boolean;
  /** Execute the command. `say` writes a line to the console output. */
  exec: (engine: GameEngine, args: string[], say: (line: string) => void) => void;
}

const num = (args: string[], i: number, fallback: number): number => {
  const v = parseFloat(args[i]);
  return Number.isFinite(v) ? v : fallback;
};

export const ADMIN_COMMANDS: AdminCommand[] = [
  // ═══════════════ JOGADOR ═══════════════
  { cmd: "heal", aliases: ["curar", "vida"], category: "Jogador", desc: "Restaura vida, fome, sede, stamina e sanidade ao máximo.", exec: (e) => e.adminHealFull() },
  { cmd: "god", aliases: ["deus", "invencivel"], category: "Jogador", desc: "Liga/desliga o modo Deus (invencibilidade).", exec: (e) => e.adminGodMode() },
  { cmd: "suicide", aliases: ["morrer"], category: "Jogador", desc: "Mata o jogador instantaneamente.", danger: true, exec: (e) => e.adminSetStat("health", 0) },
  { cmd: "stamina", category: "Jogador", desc: "Stamina ao máximo.", exec: (e) => e.adminSetStat("stamina", 100) },
  { cmd: "sanity", aliases: ["sanidade"], category: "Jogador", desc: "Sanidade ao máximo.", exec: (e) => e.adminSetStat("sanity", 100) },
  { cmd: "cure", aliases: ["curarinfec"], category: "Jogador", desc: "Remove a infecção Knox.", exec: (e) => e.adminSetStat("infection", 0) },
  { cmd: "infect", category: "Jogador", desc: "Infecta o jogador (teste).", danger: true, exec: (e) => e.adminSetStat("infection", 60) },
  { cmd: "speed", category: "Jogador", desc: "Multiplica a velocidade do jogador.", args: ["mult=2"], exec: (e, a) => { e.adminFlags.playerSpeedMult = num(a, 0, 2); } },
  { cmd: "speedreset", category: "Jogador", desc: "Velocidade do jogador ao normal.", exec: (e) => { e.adminFlags.playerSpeedMult = 1; } },
  { cmd: "noclip", category: "Jogador", desc: "Atravessar paredes (liga/desliga).", exec: (e) => { e.adminFlags.noclip = !e.adminFlags.noclip; } },
  { cmd: "phase", category: "Jogador", desc: "Atravessa paredes por N segundos.", args: ["seg=5"], exec: (e, a) => { e.adminFlags.phaseUntil = performance.now() + num(a, 0, 5) * 1000; } },
  { cmd: "dash", category: "Jogador", desc: "Avança 4 tiles na direção mirada.", exec: (e) => e.adminDash() },
  { cmd: "blink", category: "Jogador", desc: "Teleporta 7 tiles na direção mirada.", exec: (e) => e.adminBlink() },
  { cmd: "bighead", category: "Jogador", desc: "Cabeçudão (liga/desliga).", exec: (e) => { e.adminFlags.bigHead = !e.adminFlags.bigHead; } },
  { cmd: "drunk", aliases: ["bebado"], category: "Jogador", desc: "Câmera cambaleante de bêbado.", exec: (e) => { e.adminFlags.drunk = !e.adminFlags.drunk; } },
  { cmd: "invert", aliases: ["inverter"], category: "Jogador", desc: "Inverte os controles (troll).", exec: (e) => { e.adminFlags.invertControls = !e.adminFlags.invertControls; } },
  { cmd: "savepos", category: "Jogador", desc: "Salva a posição atual.", exec: (e) => e.adminSavePos() },
  { cmd: "loadpos", category: "Jogador", desc: "Volta à posição salva.", exec: (e) => e.adminLoadPos() },

  // ═══════════════ COMBATE ═══════════════
  { cmd: "oneshot", category: "Combate", desc: "Um golpe mata qualquer coisa.", exec: (e) => { e.adminFlags.oneShot = !e.adminFlags.oneShot; } },
  { cmd: "zombies1hp", category: "Combate", desc: "Todos os zumbis ficam com 1 HP.", exec: (e) => { e.adminFlags.zombiesOneHp = !e.adminFlags.zombiesOneHp; } },
  { cmd: "infammo", aliases: ["muniinf"], category: "Combate", desc: "Munição infinita.", exec: (e) => { e.adminFlags.infiniteAmmo = !e.adminFlags.infiniteAmmo; } },
  { cmd: "dmg", category: "Combate", desc: "Multiplica seu dano.", args: ["mult=3"], exec: (e, a) => { e.adminFlags.damageMult = num(a, 0, 3); } },
  { cmd: "dmgreset", category: "Combate", desc: "Dano ao normal.", exec: (e) => { e.adminFlags.damageMult = 1; } },
  { cmd: "nuke", category: "Combate", desc: "Vaporiza zumbis num raio.", args: ["raio=12"], danger: true, exec: (e, a) => e.adminNuke(num(a, 0, 12)) },
  { cmd: "meteor", aliases: ["meteoros"], category: "Combate", desc: "Chama meteoros do céu.", args: ["qtd=6"], danger: true, exec: (e, a) => e.adminMeteor(num(a, 0, 6)) },
  { cmd: "lightning", aliases: ["raio"], category: "Combate", desc: "Raio no ponto mirado.", danger: true, exec: (e) => e.adminLightning() },
  { cmd: "earthquake", aliases: ["terremoto"], category: "Combate", desc: "Terremoto que danifica tudo.", danger: true, exec: (e) => e.adminEarthquake() },
  { cmd: "killall", aliases: ["matarzumbis"], category: "Combate", desc: "Elimina todos os zumbis do mapa.", danger: true, exec: (e) => e.adminKillAllZombies() },
  { cmd: "explodez", category: "Combate", desc: "Todos os zumbis explodem.", danger: true, exec: (e) => e.adminExplodeZombies() },

  // ═══════════════ ZUMBIS ═══════════════
  { cmd: "spawn", category: "Zumbis", desc: "Spawna N zumbis ao redor.", args: ["qtd=10"], exec: (e, a) => e.adminSpawnZombies(num(a, 0, 10)) },
  { cmd: "spawn5", category: "Zumbis", desc: "Spawna 5 zumbis.", exec: (e) => e.adminSpawnZombies(5) },
  { cmd: "spawn25", category: "Zumbis", desc: "Spawna 25 zumbis.", exec: (e) => e.adminSpawnZombies(25) },
  { cmd: "spawn100", category: "Zumbis", desc: "Spawna 100 zumbis.", exec: (e) => e.adminSpawnZombies(100) },
  { cmd: "ring", aliases: ["anel"], category: "Zumbis", desc: "Anel de zumbis se fechando.", args: ["qtd=12"], exec: (e, a) => e.adminSpawnHordeRing(num(a, 0, 12)) },
  { cmd: "chasers", category: "Zumbis", desc: "Zumbis que já nascem te caçando.", args: ["qtd=10"], exec: (e, a) => e.adminSpawnChasers(num(a, 0, 10)) },
  { cmd: "dummies", aliases: ["manequins"], category: "Zumbis", desc: "Manequins passivos para treinar.", args: ["qtd=6"], exec: (e, a) => e.adminSpawnDummies(num(a, 0, 6)) },
  { cmd: "pet", aliases: ["bichinho"], category: "Zumbis", desc: "Spawna um zumbi de estimação que te segue.", exec: (e) => e.adminSpawnPet() },
  { cmd: "duplicate", aliases: ["duplicar"], category: "Zumbis", desc: "Duplica os zumbis próximos.", exec: (e) => e.adminDuplicateNearby() },
  { cmd: "freeze", aliases: ["congelar"], category: "Zumbis", desc: "Congela os zumbis por N segundos.", args: ["seg=6"], exec: (e, a) => e.adminFreezeZombies(num(a, 0, 6)) },
  { cmd: "timestop", aliases: ["parartempo"], category: "Zumbis", desc: "Para o tempo (ZA WARUDO).", args: ["seg=5"], exec: (e, a) => e.adminTimeStop(num(a, 0, 5)) },
  { cmd: "enrage", aliases: ["enfurecer"], category: "Zumbis", desc: "Todos os zumbis ficam furiosos.", danger: true, exec: (e) => e.adminEnrageAll() },
  { cmd: "calm", aliases: ["acalmar"], category: "Zumbis", desc: "Acalma todos os zumbis.", exec: (e) => e.adminCalmAll() },
  { cmd: "friendly", aliases: ["amigos"], category: "Zumbis", desc: "Zumbis amigáveis (não atacam).", exec: (e) => { e.adminFlags.friendlyZombies = !e.adminFlags.friendlyZombies; } },
  { cmd: "blackhole", aliases: ["buraconegro"], category: "Zumbis", desc: "Buraco negro engole os zumbis.", danger: true, exec: (e) => e.adminBlackHole() },
  { cmd: "yeet", category: "Zumbis", desc: "Arremessa o zumbi mais próximo.", exec: (e) => e.adminYeet() },
  { cmd: "swap", aliases: ["trocar"], category: "Zumbis", desc: "Troca de lugar com um zumbi.", exec: (e) => e.adminSwapWithZombie() },
  { cmd: "conga", category: "Zumbis", desc: "Zumbis fazem uma conga atrás de você.", exec: (e) => e.adminConga() },
  { cmd: "dance", aliases: ["dancar"], category: "Zumbis", desc: "Zumbis próximos dançam.", args: ["seg=5"], exec: (e, a) => e.adminDance(num(a, 0, 5)) },
  { cmd: "talk", aliases: ["falar"], category: "Zumbis", desc: "Um zumbi diz algo aleatório.", exec: (e) => e.adminZombieTalk() },
  { cmd: "rename", aliases: ["renomear"], category: "Zumbis", desc: "Renomeia o zumbi mais próximo.", args: ["nome"], exec: (e, a) => e.adminRenameZombie(a.join(" ")) },
  { cmd: "grow", aliases: ["gigantes"], category: "Zumbis", desc: "Zumbis ficam 1.5x maiores.", exec: (e) => e.adminZombieScale(1.5) },
  { cmd: "shrink", aliases: ["pequenos"], category: "Zumbis", desc: "Zumbis ficam menores.", exec: (e) => e.adminZombieScale(0.6) },
  { cmd: "zspeed", category: "Zumbis", desc: "Multiplica a velocidade dos zumbis.", args: ["mult=2"], exec: (e, a) => { e.adminFlags.zombieSpeedMult = num(a, 0, 2); } },
  { cmd: "zspeedreset", category: "Zumbis", desc: "Velocidade dos zumbis ao normal.", exec: (e) => { e.adminFlags.zombieSpeedMult = 1; } },

  // ═══════════════ BOSS ═══════════════
  { cmd: "tpboss", category: "Boss", desc: "Teleporta você até o GUI.", exec: (e) => e.adminTeleportToBoss() },
  { cmd: "bosstome", category: "Boss", desc: "Traz o GUI até você.", danger: true, exec: (e) => e.adminBossToMe() },
  { cmd: "dmgboss", category: "Boss", desc: "Causa dano massivo ao boss.", args: ["dano=100000"], danger: true, exec: (e, a) => e.adminDamageBoss(num(a, 0, 100000)) },
  { cmd: "healboss", category: "Boss", desc: "Cura o boss.", args: ["cura=500000"], exec: (e, a) => e.adminHealBoss(num(a, 0, 500000)) },
  { cmd: "respawnboss", category: "Boss", desc: "Renasce o GUI com HP cheio.", exec: (e) => e.adminRespawnBoss() },

  // ═══════════════ ITENS ═══════════════
  { cmd: "giveall", aliases: ["daritens"], category: "Itens", desc: "Dá 5 de cada item do jogo.", exec: (e) => e.adminGiveAllItems() },
  { cmd: "give", aliases: ["dar"], category: "Itens", desc: "Spawna um item específico no inventário.", args: ["item"], exec: (e, a) => e.adminSpawnItem(a[0] ?? "katana", num(a, 1, 1)) },
  { cmd: "rain", aliases: ["chuva"], category: "Itens", desc: "Chove itens aleatórios do céu.", args: ["qtd=12"], exec: (e, a) => e.adminRainItems(undefined, num(a, 0, 12)) },
  { cmd: "rainweapons", category: "Itens", desc: "Chove armas do céu.", exec: (e) => e.adminRainItems("sniperRifle", 6) },
  { cmd: "supplydrop", aliases: ["airdrop"], category: "Itens", desc: "Airdrop de suprimentos militares.", exec: (e) => e.adminSupplyDrop() },
  { cmd: "magnet", aliases: ["ima"], category: "Itens", desc: "Itens voam até você (liga/desliga).", exec: (e) => { e.adminFlags.magnet = !e.adminFlags.magnet; } },
  { cmd: "autoloot", category: "Itens", desc: "Coleta automática de itens (liga/desliga).", exec: (e) => { e.adminFlags.autoLoot = !e.adminFlags.autoLoot; } },
  { cmd: "clearitems", category: "Itens", desc: "Remove todos os itens do chão.", exec: (e) => e.adminClearGroundItems() },

  // ═══════════════ VEÍCULOS ═══════════════
  { cmd: "spawnveh", aliases: ["carros"], category: "Veículos", desc: "Spawna veículos ao redor.", args: ["qtd=5"], exec: (e, a) => e.adminSpawnVehiclesNear(num(a, 0, 5)) },
  { cmd: "refuel", aliases: ["abastecer"], category: "Veículos", desc: "Reabastece todos os veículos.", exec: (e) => e.adminRefuelAllVehicles() },
  { cmd: "repairveh", category: "Veículos", desc: "Repara todos os veículos.", exec: (e) => e.adminRepairAllVehicles() },
  { cmd: "explodeveh", category: "Veículos", desc: "Explode todos os veículos.", danger: true, exec: (e) => e.adminExplodeAllVehicles() },
  { cmd: "godveh", category: "Veículos", desc: "Veículos indestrutíveis (liga/desliga).", exec: (e) => { e.adminFlags.godVehicles = !e.adminFlags.godVehicles; } },
  { cmd: "inffuel", aliases: ["fuelinf"], category: "Veículos", desc: "Combustível infinito (liga/desliga).", exec: (e) => { e.adminFlags.infiniteFuel = !e.adminFlags.infiniteFuel; } },

  // ═══════════════ TELEPORTE ═══════════════
  { cmd: "tp", category: "Teleporte", desc: "Teleporta para coordenadas.", args: ["x", "y"], exec: (e, a) => e.adminTeleport(num(a, 0, 5000), num(a, 1, 5000)) },
  { cmd: "spawnpoint", aliases: ["irspawn"], category: "Teleporte", desc: "Volta ao ponto de spawn.", exec: (e) => e.adminTeleport(5000, 5000) },
  { cmd: "north", category: "Teleporte", desc: "Teleporta para o norte.", exec: (e) => e.adminTeleport(5000, 2000) },
  { cmd: "south", category: "Teleporte", desc: "Teleporta para o sul.", exec: (e) => e.adminTeleport(5000, 8000) },
  { cmd: "east", category: "Teleporte", desc: "Teleporta para o leste.", exec: (e) => e.adminTeleport(8000, 5000) },
  { cmd: "west", category: "Teleporte", desc: "Teleporta para o oeste.", exec: (e) => e.adminTeleport(2000, 5000) },
  { cmd: "mark", aliases: ["marcar"], category: "Teleporte", desc: "Marca a posição atual.", args: ["nome"], exec: (e, a) => e.adminMark(a[0] ?? "base") },
  { cmd: "tpmark", category: "Teleporte", desc: "Teleporta para uma marca.", args: ["nome"], exec: (e, a) => e.adminTpMark(a[0] ?? "base") },
  { cmd: "forward", category: "Teleporte", desc: "Avança 10 tiles à frente.", exec: (e) => { e.player.x += Math.cos(e.player.angle) * 10; e.player.y += Math.sin(e.player.angle) * 10; e.emitSnapshot(); } },

  // ═══════════════ TEMPO ═══════════════
  { cmd: "day", aliases: ["dia"], category: "Tempo", desc: "Define para 8h (dia).", exec: (e) => e.adminSetTime(8) },
  { cmd: "night", aliases: ["noite"], category: "Tempo", desc: "Define para 22h (noite).", exec: (e) => e.adminSetTime(22) },
  { cmd: "noon", category: "Tempo", desc: "Meio-dia.", exec: (e) => e.adminSetTime(12) },
  { cmd: "dawn", category: "Tempo", desc: "Amanhecer.", exec: (e) => e.adminSetTime(6) },
  { cmd: "dusk", category: "Tempo", desc: "Entardecer.", exec: (e) => e.adminSetTime(18) },
  { cmd: "midnight", category: "Tempo", desc: "Meia-noite.", exec: (e) => e.adminSetTime(0) },
  { cmd: "time", aliases: ["hora"], category: "Tempo", desc: "Define uma hora específica.", args: ["hora=12"], exec: (e, a) => e.adminSetTime(num(a, 0, 12)) },
  { cmd: "slowmo", category: "Tempo", desc: "Câmera lenta (0.25x).", exec: (e) => { e.adminFlags.timeScaleMult = 0.25; } },
  { cmd: "fastforward", category: "Tempo", desc: "Acelera o tempo (8x).", exec: (e) => { e.adminFlags.timeScaleMult = 8; } },
  { cmd: "timescale", category: "Tempo", desc: "Define a escala de tempo.", args: ["mult=1"], exec: (e, a) => { e.adminFlags.timeScaleMult = num(a, 0, 1); } },

  // ═══════════════ CLIMA ═══════════════
  { cmd: "clearweather", aliases: ["limparclima"], category: "Clima", desc: "Céu limpo.", exec: (e) => { e.adminSetTime(12); } },
  { cmd: "bloodmoon", aliases: ["luasangue"], category: "Clima", desc: "Lua de sangue (zumbis mais fortes).", danger: true, exec: (e) => { e.adminFlags.bloodMoon = !e.adminFlags.bloodMoon; e.adminSetTime(22); } },

  // ═══════════════ VISUAL ═══════════════
  { cmd: "filter", category: "Visual", desc: "Aplica um filtro de tela.", args: ["normal|matrix|noir|thermal|nightvision|xray|invert|sepia|vaporwave|cyberpunk|disco|crt"], exec: (e, a) => { e.adminFlags.renderFilter = a[0] ?? "normal"; } },
  { cmd: "normal", category: "Visual", desc: "Remove filtros.", exec: (e) => { e.adminFlags.renderFilter = "normal"; } },
  { cmd: "matrix", category: "Visual", desc: "Filtro Matrix.", exec: (e) => { e.adminFlags.renderFilter = "matrix"; } },
  { cmd: "noir", category: "Visual", desc: "Filtro preto e branco.", exec: (e) => { e.adminFlags.renderFilter = "noir"; } },
  { cmd: "thermal", category: "Visual", desc: "Visão térmica.", exec: (e) => { e.adminFlags.renderFilter = "thermal"; } },
  { cmd: "nightvision", aliases: ["nv"], category: "Visual", desc: "Visão noturna.", exec: (e) => { e.adminFlags.renderFilter = "nightvision"; } },
  { cmd: "xray", category: "Visual", desc: "Raio-X (inverte cores).", exec: (e) => { e.adminFlags.renderFilter = "xray"; } },
  { cmd: "disco", category: "Visual", desc: "Modo discoteca.", exec: (e) => { e.adminFlags.renderFilter = "disco"; } },
  { cmd: "crt", category: "Visual", desc: "Efeito de TV antiga.", exec: (e) => { e.adminFlags.renderFilter = "crt"; } },
  { cmd: "vaporwave", category: "Visual", desc: "Estética vaporwave.", exec: (e) => { e.adminFlags.renderFilter = "vaporwave"; } },
  { cmd: "zoom", category: "Visual", desc: "Define o zoom da câmera.", args: ["nivel=1.5"], exec: (e, a) => { e.adminFlags.zoom = Math.max(0.3, Math.min(4, num(a, 0, 1.5))); } },
  { cmd: "zoomreset", category: "Visual", desc: "Zoom ao normal.", exec: (e) => { e.adminFlags.zoom = 1; } },
  { cmd: "shake", aliases: ["tremer"], category: "Visual", desc: "Treme a tela.", args: ["forca=1"], exec: (e, a) => e.adminScreenShake(num(a, 0, 1)) },
  { cmd: "flash", category: "Visual", desc: "Flash de cor na tela.", args: ["#ffffff"], exec: (e, a) => e.adminFlash(a[0] ?? "#ffffff") },

  // ═══════════════ MULTIPLAYER ═══════════════
  { cmd: "broadcast", aliases: ["anunciar"], category: "Multiplayer", desc: "Envia mensagem para todos os jogadores.", args: ["mensagem"], exec: (_e, a) => Net.sendChat(`[ADMIN] ${a.join(" ")}`) },
  { cmd: "killallpvp", category: "Multiplayer", desc: "Mata todos os jogadores online.", danger: true, exec: () => { for (const p of Net.getActivePlayers()) Net.sendPvPDamage(p.id, 99999, "Admin", true); } },
  { cmd: "pvp", category: "Multiplayer", desc: "Liga/desliga o PvP.", exec: (e) => e.togglePvP() },

  // ═══════════════ DIVERSÃO / EVENTOS ═══════════════
  { cmd: "party", aliases: ["festa"], category: "Diversão", desc: "Modo festa: disco + fogos + dança.", exec: (e) => e.adminParty() },
  { cmd: "zen", category: "Diversão", desc: "Modo zen: nenhum zumbi spawna.", exec: (e) => e.adminZen() },
  { cmd: "apocalypse", aliases: ["apocalipse"], category: "Diversão", desc: "APOCALIPSE: lua de sangue + 40 caçadores.", danger: true, exec: (e) => e.adminApocalypse() },
  { cmd: "chaos", aliases: ["caos"], category: "Diversão", desc: "4 eventos aleatórios em sequência.", danger: true, exec: (e) => e.adminChaos() },
  { cmd: "fireworks", aliases: ["fogos"], category: "Diversão", desc: "Fogos de artifício.", args: ["qtd=8"], exec: (e, a) => e.adminFireworks(num(a, 0, 8)) },
  { cmd: "coinflip", aliases: ["moeda"], category: "Diversão", desc: "Cara ou coroa.", exec: (_e, _a, say) => say(Math.random() < 0.5 ? "🪙 Deu CARA!" : "🪙 Deu COROA!") },
  { cmd: "dice", aliases: ["dado"], category: "Diversão", desc: "Rola um dado de 6.", exec: (_e, _a, say) => say(`🎲 Você rolou um ${1 + Math.floor(Math.random() * 6)}!`) },

  // ═══════════════ SISTEMA ═══════════════
  { cmd: "clearall", aliases: ["limpartudo"], category: "Sistema", desc: "Remove todos os zumbis, itens e veículos.", danger: true, exec: (e) => e.adminClearEverything() },
  { cmd: "help", aliases: ["ajuda", "?"], category: "Sistema", desc: "Lista todas as categorias de comandos.", exec: (_e, _a, say) => {
    const cats = Array.from(new Set(ADMIN_COMMANDS.map((c) => c.category)));
    say(`Categorias: ${cats.join(", ")}`);
    say(`Use 'cmds <categoria>' ou digite um comando. Total: ${ADMIN_COMMANDS.length} comandos.`);
  } },
  { cmd: "cmds", aliases: ["comandos"], category: "Sistema", desc: "Lista os comandos de uma categoria.", args: ["categoria"], exec: (_e, a, say) => {
    const cat = a.join(" ");
    const list = cat ? ADMIN_COMMANDS.filter((c) => c.category.toLowerCase() === cat.toLowerCase()) : ADMIN_COMMANDS;
    list.slice(0, 40).forEach((c) => say(`  ${c.cmd} — ${c.desc}`));
    if (list.length > 40) say(`  ... e mais ${list.length - 40}`);
  } },
];

// ───────────────────────────────────────────────────────────────
//  Lookup & execution helpers (used by the console)
// ───────────────────────────────────────────────────────────────

const commandIndex = new Map<string, AdminCommand>();
for (const c of ADMIN_COMMANDS) {
  commandIndex.set(c.cmd.toLowerCase(), c);
  for (const alias of c.aliases ?? []) commandIndex.set(alias.toLowerCase(), c);
}

export function findCommand(token: string): AdminCommand | undefined {
  return commandIndex.get(token.toLowerCase());
}

/** All commands whose console token starts with the given prefix (autocomplete). */
export function autocompleteCommands(prefix: string): AdminCommand[] {
  const p = prefix.toLowerCase();
  const seen = new Set<AdminCommand>();
  for (const c of ADMIN_COMMANDS) {
    if (c.cmd.startsWith(p)) seen.add(c);
    else if ((c.aliases ?? []).some((a) => a.startsWith(p))) seen.add(c);
  }
  return Array.from(seen);
}

/**
 * Parse and run a full console line, e.g. "spawn 25" or "filter matrix".
 * Returns true if a command matched, false otherwise.
 */
export function runAdminLine(engine: GameEngine, line: string, say: (line: string) => void): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const tokens = trimmed.split(/\s+/);
  const cmd = findCommand(tokens[0]);
  if (!cmd) return false;
  try {
    cmd.exec(engine, tokens.slice(1), say);
  } catch (err) {
    say(`Erro ao executar '${cmd.cmd}': ${String(err)}`);
  }
  return true;
}

export const COMMAND_COUNT = ADMIN_COMMANDS.length;
export const COMMAND_CATEGORIES = Array.from(new Set(ADMIN_COMMANDS.map((c) => c.category)));
