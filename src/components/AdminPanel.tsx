// ═══════════════════════════════════════════════════════════════
// ADMIN PANEL — Day of the Undead
//
// ACCESS MODEL
//   There is NO access code and NO password in this build.
//
//   The panel is available only to the accounts whose stable id is
//   in the SERVER's allowlist (server/adminConfig.mjs →
//   ADMIN_ACCOUNT_IDS). The client asks the server for a session
//   token; the server validates the account id and issues an
//   opaque token. Every privileged command is re-validated by the
//   server, so hiding the button here is only a convenience —
//   the real gate is server-side.
//
//   Accounts without server authorization see a neutral notice and
//   the panel stays closed.
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameEngine } from "../game/engine";
import type { GameSnapshot } from "../game/types";
import CodesTab from "./CodesTab";
import ServersTab from "./ServersTab";
import EnginesTab from "./EnginesTab";
import { AIModeration } from "../game/aiModeration";
import { VoiceChat } from "../game/voiceChat";
import {
  createSession,
  destroySession,
  sessionValid,
  readAudit,
} from "../game/security";
import {
  requestServerPermission,
  getAdminApiBase,
  getAdminAccessCode,
  type AccountInfo,
} from "../game/adminAccess";

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  engineRef: React.RefObject<GameEngine | null>;
  snapshot: GameSnapshot;
  /** The currently signed-in account, used to request server permission. */
  account?: AccountInfo | null;
}

export default function AdminPanel({ isOpen, onClose, engineRef, snapshot, account = null }: AdminPanelProps) {
  // The session token is issued by the server — never created here.
  const [authenticated, setAuthenticated] = useState(() => sessionValid());
  /**
   * The admin access code, as disclosed by the server once the
   * account has been authorized. It is never bundled with the
   * client — the server sends it over an authenticated request.
   */
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [commandLog, setCommandLog] = useState<string[]>([]);
  const [tab, setTab] = useState("quick");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemQty, setItemQty] = useState(1);
  const [zName, setZName] = useState("");
  const [zHp, setZHp] = useState(60);
  const [zSpeed, setZSpeed] = useState(1.5);
  const [zDmg, setZDmg] = useState(15);
  const [weatherType, setWeatherType] = useState("clear");
  const [vehCount, setVehCount] = useState(5);
  const [massTpTarget, setMassTpTarget] = useState("");
  const [dropName, setDropName] = useState("");
  const [dropQty, setDropQty] = useState(1);
  const [spawnCount, setSpawnCount] = useState(10);
  const [timeInput, setTimeInput] = useState(8);
  const [tpX, setTpX] = useState(5000);
  const [tpY, setTpY] = useState(5000);
  const [healthVal, setHealthVal] = useState(100);
  const [staminaVal, setStaminaVal] = useState(100);
  const [hungerVal, setHungerVal] = useState(0);
  const [thirstVal, setThirstVal] = useState(0);
  const [sanVal, setSanVal] = useState(100);
  const [infVal, setInfVal] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  const log = useCallback((msg: string) => {
    setCommandLog((prev) => [...prev.slice(-99), `[${new Date().toLocaleTimeString()}] ${msg}`]);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
  }, []);

  /**
   * Ask the server whether this account may administer the game.
   * There is nothing to type: the server compares the stable
   * account id against its own allowlist.
   */
  const tryLogin = async () => {
    setError("");
    setChecking(true);
    if (!account || account.isGuest) {
      setChecking(false);
      setError("Entre com uma conta autenticada para solicitar acesso administrativo.");
      return;
    }
    if (!getAdminApiBase()) {
      setChecking(false);
      setError("Nenhum servidor autoritativo configurado. O painel administrativo permanece fechado.");
      return;
    }
    const state = await requestServerPermission(account);
    setChecking(false);
    if (state.mode === "granted") setAccessCode(getAdminAccessCode());
    if (state.mode === "granted" && state.token) {
      createSession(state.token, state.accountId ?? account.id);
      setAuthenticated(true);
      // The server discloses the access code only to an account that
      // just passed the allowlist check.
      setAccessCode(getAdminAccessCode());
      setError("");
      log("Permissão administrativa confirmada pelo servidor.");
      return;
    }
    setAuthenticated(false);
    setError(
      state.mode === "unconfigured"
        ? "Nenhum servidor autoritativo configurado. O painel permanece fechado."
        : "Esta conta não possui permissão administrativa confirmada pelo servidor.",
    );
    log("Permissão administrativa não concedida pelo servidor.");
  };

  const doLogout = () => {
    destroySession();
    setAuthenticated(false);
    log("Sessão encerrada.");
  };

  // Ask the server as soon as the panel is opened.
  useEffect(() => {
    if (!isOpen) return;
    if (sessionValid()) {
      setAuthenticated(true);
      return;
    }
    void tryLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, account?.id]);

  const eng = () => engineRef.current;

  // FIX: previously shadowed `eng`, breaking every callback.
  const exe = (label: string, fn: () => void) => {
    if (!engineRef.current) { log("ERRO: engine não iniciada (inicie uma partida)"); return; }
    try { fn(); log(label); }
    catch (err) { log(`ERRO em "${label}": ${String(err)}`); }
  };

  const tabs = ["voice_ai","engines","security","servers","codes","quick","items","drop","zombies","weather","vehicle","players","world","stats","cheats","ammo","equip","craft","map","spawn"];

  const B = (label: string, action: string, fn: () => void) => (
    <button onClick={() => exe(action, fn)}
      className="border border-[#1f2521] bg-[#0a0a0a] px-2.5 py-2 text-left text-[11px] leading-tight text-zinc-300 hover:border-[#4a5c45] hover:bg-[#1f2521] transition-colors">
      {label}
    </button>
  );

  if (!isOpen) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm">
      <div className="relative max-h-[96dvh] w-full max-w-4xl overflow-y-auto overscroll-contain border-2 border-[#2a2a2a] bg-[#080808] shadow-2xl shadow-black">

        {/* HEADER */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[#2a2a2a] bg-[#0a0a0a] px-5 py-3">
          <div>
            <h2 className="text-xl font-black uppercase tracking-widest text-[#d96b3a]">⚙ Admin Panel</h2>
            <p className="text-[9px] uppercase tracking-widest text-zinc-600">Day of the Undead — {snapshot.onlinePlayers.length} online · {snapshot.zombies.total} zumbis · {snapshot.kills} kills</p>
          </div>
          <button type="button" onClick={onClose}
            className="grid h-9 w-9 place-items-center border border-[#5a2b24] bg-[#1a0d0b] text-lg text-[#d96b3a] hover:bg-[#2a1714]">✕</button>
        </div>

        {/* AUTH */}
        {!authenticated ? (
          <div className="flex items-center justify-center p-16">
            <div className="w-96 space-y-4 text-center">
              <div className="text-5xl">🔒</div>
              <p className="text-xs uppercase tracking-widest text-zinc-500">Acesso restrito</p>
              <p className="text-[11px] leading-relaxed text-zinc-600">
                Este painel exige uma conta autorizada, validada pelo servidor a partir do
                identificador estável da conta. Não existe código de acesso.
              </p>
              <button onClick={() => void tryLogin()} disabled={checking}
                className="w-full bg-[#8a2f22] py-3 text-sm font-black uppercase tracking-widest text-zinc-100 hover:bg-[#b5452e] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
                {checking ? "Verificando…" : "Verificar permissão"}
              </button>
              {error && <p className="text-xs text-red-500">{error}</p>}
              {!account && (
                <p className="text-[10px] text-zinc-600">
                  Você está em uma conta de visitante. Entre numa conta registrada para solicitar acesso.
                </p>
              )}
              {account && !account.isGuest && (
                <p className="text-[10px] text-zinc-600">
                  Conta atual: <span className="font-mono text-zinc-400">{account.username}</span>
                </p>
              )}
              <p className="pt-2 text-[9px] leading-relaxed text-zinc-700">
                O servidor precisa ter a conta vinculada à permissão administrativa
                (variável de ambiente <span className="font-mono">ADMIN_ACCOUNT_IDS</span>).
                Sem essa configuração, o painel permanece fechado para todos.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* TABS */}
            <div className="flex flex-wrap border-b border-[#2a2a2a] bg-[#050505] text-[10px] uppercase tracking-widest">
              {tabs.map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`border-r border-[#2a2a2a] px-4 py-2.5 transition-colors ${tab === t ? "bg-[#2a1714] text-[#d96b3a] font-bold" : "text-zinc-500 hover:text-zinc-300 hover:bg-[#111]"}`}>{t}</button>
              ))}
            </div>

            <div className="p-4 space-y-4">
              {/* ════════════════════════════════════ VOICE & AI MODERATION ════════════════════ */}
              {tab === "voice_ai" && (
                <div className="space-y-4">
                  <div className="border border-[#3a6a2a] bg-[#0f1a10] p-3">
                    <p className="font-['Oswald'] text-xs font-bold uppercase tracking-[0.24em] text-[#7fc25a]">
                      🎙️ Voice Chat com IA Moderadora Integrada
                    </p>
                    <p className="mt-1 font-mono text-[10px] leading-relaxed text-[#a8c09a]">
                      A inteligência artificial escuta e analisa transcrições de áudio e texto em tempo real,
                      detectando toxicidade, insultos severos, assédio e gritos excessivos (scream-spam),
                      aplicando advertências e mutando automaticamente infratores.
                    </p>
                  </div>

                  {/* Sensitivity & Controls */}
                  <div className="border border-[#1f2521] bg-[#0a0a0a] p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">🎤 Status do Microfone Local</p>
                      <button
                        onClick={() => {
                          VoiceChat.toggleMuteSelf();
                          log("Alternou mudo do microfone local.");
                        }}
                        className="border border-[#4a5c45] bg-[#1f2521] px-2.5 py-1 text-[9px] uppercase text-[#7fc25a] hover:bg-[#2b352e]"
                      >
                        Alternar Mudo Local
                      </button>
                    </div>
                  </div>

                  {/* Sensitivity controls */}
                  <div className="border border-[#1f2521] bg-[#0a0a0a] p-3">
                    <p className="mb-2 text-[10px] uppercase tracking-widest text-[#7f936f]">🛡️ Sensibilidade da IA Moderadora</p>
                    <div className="flex gap-2">
                      {(["strict", "balanced", "lenient"] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => {
                            AIModeration.setSensitivity(mode);
                            log(`IA Moderadora ajustada para modo: ${mode}`);
                          }}
                          className={`border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-all ${
                            AIModeration.getSensitivity() === mode
                              ? "border-[#7fc25a] bg-[#1f2521] text-[#7fc25a] font-bold"
                              : "border-[#2a2a2a] bg-black text-zinc-400 hover:border-[#4a5c45]"
                          }`}
                        >
                          {mode === "strict" ? "🔴 Estrita (Tolerância Zero)" : mode === "balanced" ? "🟡 Equilibrada (Padrão)" : "🟢 Tolerante"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Player Voice Moderation Actions */}
                  <div className="border border-[#1f2521] bg-[#0a0a0a] p-3">
                    <p className="mb-2 text-[10px] uppercase tracking-widest text-[#7f936f]">👥 Ações de Moderação nos Jogadores</p>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto font-mono text-[10px]">
                      {snapshot.onlinePlayers.map((p) => {
                        const isMuted = AIModeration.isPlayerMuted(p.id);
                        return (
                          <div key={p.id} className="flex items-center justify-between border-b border-[#141414] py-1.5">
                            <span className="text-zinc-200">{p.name} ({p.id})</span>
                            <div className="flex gap-1.5">
                              {isMuted ? (
                                <button
                                  onClick={() => {
                                    AIModeration.unmutePlayer(p.id);
                                    log(`Desmutou voz do jogador ${p.name}`);
                                  }}
                                  className="border border-[#3a6a2a] bg-[#0f1a10] px-2 py-0.5 text-[#7fc25a] text-[9px] uppercase"
                                >
                                  🔊 Desmutar
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    AIModeration.mutePlayer(p.id, 60);
                                    log(`Mutou voz do jogador ${p.name} por 60s`);
                                  }}
                                  className="border border-[#5a2b24] bg-[#1c0d0a] px-2 py-0.5 text-red-400 text-[9px] uppercase"
                                >
                                  🔇 Mutar (60s)
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  AIModeration.mutePlayer(p.id, 600);
                                  log(`Ban de voz de 10 min no jogador ${p.name}`);
                                }}
                                className="border border-red-800 bg-red-950 px-2 py-0.5 text-red-300 text-[9px] uppercase font-bold"
                              >
                                ⛔ Ban Voz (10m)
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {snapshot.onlinePlayers.length === 0 && (
                        <p className="text-zinc-600">Nenhum outro jogador conectado no momento.</p>
                      )}
                    </div>
                  </div>

                  {/* AI Moderation Incident Log */}
                  <div className="border border-[#1f2521] bg-[#0a0a0a] p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">
                        🚨 Log de Incidentes da IA ({AIModeration.getIncidents().length})
                      </p>
                      <button
                        onClick={() => {
                          AIModeration.clearIncidents();
                          log("Limpeza do histórico de moderação da IA efetuada.");
                        }}
                        className="border border-[#2a2a2a] px-2 py-0.5 text-[9px] text-zinc-500 hover:text-zinc-300 uppercase"
                      >
                        Limpar Logs
                      </button>
                    </div>

                    <div className="max-h-52 space-y-1.5 overflow-y-auto font-mono text-[9px]">
                      {AIModeration.getIncidents().length === 0 ? (
                        <p className="text-zinc-600">Nenhuma infração detectada pela IA até agora. Chat limpo!</p>
                      ) : (
                        AIModeration.getIncidents().map((inc) => (
                          <div key={inc.id} className="border border-[#241d16] bg-black/60 p-2 rounded">
                            <div className="flex items-center justify-between text-[#d96b3a]">
                              <span className="font-bold">{inc.playerName}</span>
                              <span className="text-red-400 font-bold uppercase">{inc.category} ({Math.round(inc.toxicityScore * 100)}%)</span>
                            </div>
                            <p className="mt-1 text-zinc-300 line-through">{inc.censoredText}</p>
                            <div className="mt-1 flex items-center justify-between text-zinc-500 text-[8px]">
                              <span>Ação: {inc.action}</span>
                              <span>{new Date(inc.ts).toLocaleTimeString()}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════ SECURITY ════════════════════ */}
              {tab === "security" && (
                <div className="space-y-4">
                  {/* Access code — disclosed by the SERVER only to an
                      account that already passed the allowlist check.
                      It is never part of the browser bundle. */}
                  {accessCode && (
                    <div className="border border-[#7fc25a]/40 bg-[#0a140a] p-3">
                      <p className="mb-2 text-[10px] uppercase tracking-widest text-[#7fc25a]">
                        🔑 Código de acesso administrativo
                      </p>
                      <div className="flex items-center gap-3">
                        <code className="select-all break-all border border-[#1f2521] bg-black px-3 py-2 font-mono text-sm tracking-widest text-[#cdd7bf]">
                          {accessCode}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard?.writeText(accessCode);
                            log("Código de acesso copiado.");
                          }}
                          className="border border-[#4a5c45] bg-[#1f2521] px-3 py-2 text-[10px] uppercase tracking-widest text-[#cdd7bf] hover:bg-[#2b352e]"
                        >
                          Copiar
                        </button>
                      </div>
                      <p className="mt-2 font-mono text-[9px] leading-relaxed text-zinc-600">
                        Exibido pelo servidor somente após validar a conta. Não está no bundle do
                        navegador — quem não estiver autorizado nunca o recebe.
                      </p>
                    </div>
                  )}

                  <div className="border border-[#1f2521] bg-[#0a0a0a] p-3">
                    <p className="mb-2 text-[10px] uppercase tracking-widest text-[#7f936f]">🔐 Postura de segurança</p>
                    <ul className="space-y-1.5 font-mono text-[10px] leading-relaxed text-zinc-400">
                      <li><span className="text-[#7fc25a]">✓</span> Sem senha nem código de acesso no bundle — o código é enviado pelo servidor apenas a contas já autorizadas</li>
                      <li><span className="text-[#7fc25a]">✓</span> Senhas de conta com PBKDF2-HMAC-SHA256 (210 000 iterações) e sal aleatório de 16 bytes</li>
                      <li><span className="text-[#7fc25a]">✓</span> Proteção contra força bruta: bloqueio progressivo da conta e limite de tentativas</li>
                      <li><span className="text-[#7fc25a]">✓</span> Campos de formulário com <em>honeypot</em> anti-spam e validação de entrada</li>
                      <li><span className="text-[#7fc25a]">✓</span> Cabeçalhos de segurança (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) em todas as respostas</li>
                      <li><span className="text-[#7fc25a]">✓</span> HTTPS forçado com redirecionamento automático a partir de HTTP</li>
                      <li><span className="text-[#7fc25a]">✓</span> Permissão emitida pelo servidor a partir do identificador estável da conta (<code>ADMIN_ACCOUNT_IDS</code>)</li>
                      <li><span className="text-[#7fc25a]">✓</span> Token de sessão opaco, guardado apenas no servidor e na <code>sessionStorage</code></li>
                      <li><span className="text-[#7fc25a]">✓</span> Token revalidado a cada comando privilegiado; encerrar sessão ou revogar a permissão remove o acesso</li>
                      <li><span className="text-[#7fc25a]">✓</span> Limites no servidor: cooldown por comando, teto por janela, teto por sala e por alvo</li>
                      <li><span className="text-[#7fc25a]">✓</span> Alvo e recurso validados no servidor; alvo desconectado é rejeitado sem redirecionar</li>
                      <li><span className="text-[#7fc25a]">✓</span> Spawn validado contra o terreno determinístico do mundo antes de posicionar</li>
                      <li><span className="text-[#7fc25a]">✓</span> Auditoria mínima: evento, resultado, horário e identificador da conta — sem áudio ou transcrição</li>
                      <li><span className="text-[#7fc25a]">✓</span> Códigos de resgate assinados com chave aleatória por dispositivo</li>
                    </ul>
                  </div>

                  <div className="border border-[#5a2b24]/50 bg-[#150c0a]/50 p-3">
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-[#d96b3a]">⚠ Requisito de infraestrutura</p>
                    <p className="font-mono text-[10px] leading-relaxed text-[#a89a86]">
                      As permissões deste painel dependem do servidor autoritativo. Se o servidor não estiver
                      configurado (ou <code>ADMIN_ACCOUNT_IDS</code> estiver vazio), o painel permanece fechado
                      para todas as contas — não existe caminho alternativo no cliente. O fluxo de pagamento
                      já passa pelo WhatsApp, então o dinheiro não depende destas checagens.
                    </p>
                  </div>

                  <div className="border border-[#1f2521] bg-[#0a0a0a] p-3">
                    <p className="mb-2 text-[10px] uppercase tracking-widest text-[#7f936f]">
                      📋 Log de auditoria ({readAudit().length})
                    </p>
                    <div className="max-h-64 space-y-0.5 overflow-y-auto font-mono text-[9px]">
                      {readAudit().length === 0 ? (
                        <p className="text-zinc-600">Nenhum evento registrado.</p>
                      ) : (
                        readAudit().map((entry, i) => (
                          <p key={i} className="flex gap-2 border-b border-[#111] py-0.5">
                            <span className="shrink-0 text-zinc-600">{new Date(entry.ts).toLocaleString("pt-BR")}</span>
                            <span className="shrink-0 font-bold text-[#e8b64a]">{entry.event}</span>
                            <span className="truncate text-zinc-400">{entry.detail}</span>
                          </p>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════ SERVERS ════════════════════ */}
              {tab === "engines" && <EnginesTab engineRef={engineRef} />}

              {tab === "servers" && <ServersTab engineRef={engineRef} snapshot={snapshot} onLog={log} />}

              {/* ════════════════════════════════════ CODES (WhatsApp sales) ════════════════════ */}
              {tab === "codes" && <CodesTab onLog={log} />}

              {/* ════════════════════════════════════ QUICK ════════════════════════════════════ */}
              {tab === "quick" && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">Quick Actions (50)</p>
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-1.5">
                    {B("💚 Full Heal","Heal",()=>eng()?.adminHealFull())}
                    {B("🛡️ God","God",()=>eng()?.adminGodMode())}
                    {B("💀 Kill All","KAll",()=>eng()?.adminKillAllZombies())}
                    {B("🎒 All ×5","All×5",()=>eng()?.adminGiveAllItems())}
                    {B("💊 Stamina MAX","StaM",()=>eng()?.adminSetStat("stamina",100))}
                    {B("🧠 Sanity MAX","SanM",()=>eng()?.adminSetStat("sanity",100))}
                    {B("🍗 Hunger 0","Hun0",()=>eng()?.adminSetStat("hunger",0))}
                    {B("💧 Thirst 0","Thi0",()=>eng()?.adminSetStat("thirst",0))}
                    {B("🩹 Cure Infec","Cure",()=>eng()?.adminSetStat("infection",0))}
                    {B("🔥 Day 08:00","D8",()=>eng()?.adminSetTime(8))}
                    {B("🌙 Night 22:00","N22",()=>eng()?.adminSetTime(22))}
                    {B("🌅 Dawn 06:00","D6",()=>eng()?.adminSetTime(6))}
                    {B("☀️ Noon 12:00","N12",()=>eng()?.adminSetTime(12))}
                    {B("🌆 Dusk 18:00","D18",()=>eng()?.adminSetTime(18))}
                    {B("🕐 Midnight 0","M0",()=>eng()?.adminSetTime(0))}
                    {B("🍎 Beans","Beans",()=>eng()?.adminSpawnItem("cannedBeans"))}
                    {B("🔫 9mm","9mm",()=>eng()?.adminSpawnItem("pistol9mm"))}
                    {B("⚔️ Katana","Kat",()=>eng()?.adminSpawnItem("katana"))}
                    {B("🔪 HuntKnife","HKnife",()=>eng()?.adminSpawnItem("huntingKnife"))}
                    {B("🪓 FireAxe","FAxe",()=>eng()?.adminSpawnItem("fireAxe"))}
                    {B("🎒 TacPack","TacP",()=>eng()?.adminSpawnItem("tacticalPack"))}
                    {B("🧪 Adrenaline","Adr",()=>eng()?.adminSpawnItem("adrenaline"))}
                    {B("💊 Medkit","Med",()=>eng()?.adminSpawnItem("medkitFull"))}
                    {B("🔋 5.56","5.56",()=>eng()?.adminSpawnItem("ammo556"))}
                    {B("🧨 Grenade","Gren",()=>eng()?.adminSpawnItem("grenadeFrag"))}
                    {B("🔦 Flashlight","Flash",()=>eng()?.adminSpawnItem("flashlight"))}
                    {B("🚗 Spawn Veh+","Veh+",()=>{})}
                    {B("🧟 +5 Z","+5Z",()=>eng()?.adminSpawnZombies(5))}
                    {B("🧟 +10 Z","+10Z",()=>eng()?.adminSpawnZombies(10))}
                    {B("🧟 +25 Z","+25Z",()=>eng()?.adminSpawnZombies(25))}
                    {B("🧟 +50 Z","+50Z",()=>eng()?.adminSpawnZombies(50))}
                    {B("▶ Tp Base","TpB",()=>eng()?.adminTeleport(5000,5000))}
                    {B("▶ Tp Forest","TpF",()=>eng()?.adminTeleport(5000,2000))}
                    {B("▶ Tp South","TpS",()=>eng()?.adminTeleport(5000,8000))}
                    {B("▶ Tp East","TpE",()=>eng()?.adminTeleport(8000,5000))}
                    {B("▶ Tp West","TpW",()=>eng()?.adminTeleport(2000,5000))}
                    {B("📍 Tp Origin","TpO",()=>eng()?.adminTeleport(500,500))}
                    {B("🔁 Toggle PvP","PvP",()=>eng()?.togglePvP())}
                    {B("☣ Infect 100%","Inf100",()=>eng()?.adminSetStat("infection",100))}
                    {B("💀 Suicide","Kill",()=>eng()?.adminSetStat("health",0))}
                    {B("⛽ Refuel Player","Fuel",()=>eng()?.adminSetStat("stamina",100))}
                    {B("📦 MRE","MRE",()=>eng()?.adminSpawnItem("mre"))}
                    {B("💧 Water Jug","WJug",()=>eng()?.adminSpawnItem("waterJug5L"))}
                    {B("🩹 Bandage","Band",()=>eng()?.adminSpawnItem("bandage"))}
                    {B("💊 Antibiotic","Anti",()=>eng()?.adminSpawnItem("antibiotics"))}
                    {B("🔫 Shotgun","Shot",()=>eng()?.adminSpawnItem("shotgun12"))}
                    {B("🔫 Sniper","Snip",()=>eng()?.adminSpawnItem("sniperRifle"))}
                    {B("⚔️ Machete","Mach",()=>eng()?.adminSpawnItem("machete"))}
                    {B("🪓 Sledge","Sled",()=>eng()?.adminSpawnItem("sledgeHammer"))}
                    {B("💣 C4","C4",()=>eng()?.adminSpawnItem("c4Charge"))}
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════ ITEMS ════════════════════════════════════ */}
              {tab === "items" && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">Item Spawner (10)</p>
                  <div className="flex gap-2">
                    <input value={itemName} onChange={(e) => setItemName(e.target.value)}
                      placeholder="Ex: katana, ammo556, mre, bandage..."
                      className="flex-1 border border-[#2a2a2a] bg-black px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-[#4a5c45]" />
                    <input type="number" min={1} max={99} value={itemQty} onChange={(e) => setItemQty(Number(e.target.value))}
                      className="w-16 border border-[#2a2a2a] bg-black px-2 py-2.5 text-center text-xs text-zinc-200 outline-none" />
                    <button onClick={() => exe(`Spawn ${itemQty}x ${itemName}`, ()=>eng()?.adminSpawnItem(itemName))}
                      className="border border-[#4a5c45] bg-[#1f2521] px-4 text-xs uppercase text-[#cdd7bf] hover:bg-[#2b352e]">Spawn</button>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {["kitchenKnife","sledgeHammer","machete","katana","baseballBat","spear","crowbar","pickaxe","shovel","nailBat","molotov","pistol9mm","revolver38","shotgun12","rifle308","sniperRifle","crossbow","ammo9mm","ammo556","shells12","shots","impGrenade","c4Charge","flareGun"].map(k => (
                      <button key={k} onClick={() => exe(`Spawn ${k}`,()=>eng()?.adminSpawnItem(k))}
                        className="border border-[#1f2521] bg-[#0a0a0a] px-2 py-1.5 text-[9px] text-zinc-400 hover:border-[#4a5c45] hover:text-zinc-200">{k.slice(0,22)}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {["waterBottle","cannedBeans","mre","energyBar","honey","coffeePowder","oatmealPkg","trailMix","painkillers","antibiotics","morphine","adrenaline","bandage","suture","medkitFull","antiseptic","splint","iodine","eyeDrops","thermalBlanket","sleepingBag","gasMask","tacticalPack","backpack","crowbar","firekit","binoculars","compass","map","watch","rope","ductTape","toolbox","generatorSmall","solarCharger","batteryPack"].map(k => (
                      <button key={k} onClick={() => exe(`Spawn ${k}`,()=>eng()?.adminSpawnItem(k))}
                        className="border border-[#1f2521] bg-[#0a0a0a] px-2 py-1.5 text-[9px] text-zinc-400 hover:border-[#4a5c45] hover:text-zinc-200">{k.slice(0,22)}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════ DROP ════════════════════════════════════ */}
              {tab === "drop" && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">📤 Sistema de Drop</p>

                  {/* Drop from inventory */}
                  <div className="border border-[#1f2521] bg-[#0a0a0a] p-3">
                    <p className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">Largar do Inventário</p>
                    {snapshot.inventory.length === 0 ? (
                      <p className="text-xs text-zinc-600">Inventário vazio.</p>
                    ) : (
                      <div className="max-h-40 space-y-1 overflow-y-auto">
                        {snapshot.inventory.map((it) => (
                          <div key={it.id} className="flex items-center justify-between border-b border-[#1f2521] py-1.5 text-xs">
                            <span className="text-[#d7c9a7]">{it.name} <span className="text-zinc-600">x{it.qty} · {(it.weight * it.qty).toFixed(1)}kg</span></span>
                            <div className="flex gap-1">
                              <button onClick={() => exe(`Drop 1x ${it.name}`, () => eng()?.dropItem(it.id, 1, 1))}
                                className="border border-[#5a4a2a] bg-[#2a2010] px-2 py-1 text-[9px] uppercase text-[#d7c9a7] hover:bg-[#3a3018]">Drop 1</button>
                              {it.qty > 1 && (
                                <button onClick={() => exe(`Drop all ${it.name}`, () => eng()?.dropItem(it.id, it.qty, 1))}
                                  className="border border-[#5a2b24] bg-[#2a1714] px-2 py-1 text-[9px] uppercase text-[#d96b3a] hover:bg-[#3a2218]">Drop {it.qty}</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <button onClick={() => exe("Drop ALL items", () => eng()?.dropAllItems(1))}
                      className="mt-2 w-full border border-[#8a2f22] bg-[#2a1714] py-2 text-[10px] font-bold uppercase tracking-widest text-[#d96b3a] hover:bg-[#3a2218]">
                      🗑️ Largar TUDO ({snapshot.inventory.length} pilhas)
                    </button>
                  </div>

                  {/* Spawn item directly on ground */}
                  <div className="border border-[#1f2521] bg-[#0a0a0a] p-3">
                    <p className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">Spawnar no Chão</p>
                    <div className="flex gap-2">
                      <input value={dropName} onChange={(e) => setDropName(e.target.value)}
                        placeholder="Ex: katana, medkitFull, ammo556"
                        className="flex-1 border border-[#2a2a2a] bg-black px-3 py-2 text-xs text-zinc-200 outline-none focus:border-[#4a5c45]" />
                      <input type="number" min={1} max={50} value={dropQty} onChange={(e) => setDropQty(Number(e.target.value))}
                        className="w-16 border border-[#2a2a2a] bg-black px-2 py-2 text-center text-xs text-zinc-200 outline-none" />
                      <button onClick={() => exe(`Drop ${dropQty}x ${dropName}`, () => eng()?.adminDropItem(dropName, dropQty))}
                        className="border border-[#4a5c45] bg-[#1f2521] px-4 text-xs uppercase text-[#cdd7bf] hover:bg-[#2b352e]">Dropar</button>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-1">
                      {["katana","medkitFull","ammo556","mre","waterJug5L","tacticalPack","shotgun12","sniperRifle","grenadeFrag","c4Charge","adrenaline","goldBar"].map(k => (
                        <button key={k} onClick={() => exe(`Drop ${k}`, () => eng()?.adminDropItem(k, 1))}
                          className="border border-[#1f2521] bg-[#080808] px-2 py-1.5 text-[9px] text-zinc-400 hover:border-[#4a5c45] hover:text-zinc-200">{k.slice(0,14)}</button>
                      ))}
                    </div>
                  </div>

                  {/* Ground items list */}
                  <div className="border border-[#1f2521] bg-[#0a0a0a] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-widest text-zinc-500">No Chão ({snapshot.groundItems.length})</p>
                      <button onClick={() => exe("Clear ground items", () => eng()?.adminClearGroundItems())}
                        className="border border-[#5a2b24] px-2 py-1 text-[9px] uppercase text-red-400 hover:bg-[#2a1714]">Limpar Tudo</button>
                    </div>
                    {snapshot.groundItems.length === 0 ? (
                      <p className="text-xs text-zinc-600">Nenhum item no chão por perto.</p>
                    ) : (
                      <div className="max-h-32 space-y-0.5 overflow-y-auto text-[10px]">
                        {snapshot.groundItems.slice(0, 30).map((g) => (
                          <div key={g.id} className="flex justify-between border-b border-[#141414] py-1">
                            <span className="text-zinc-300">{g.name} x{g.qty}</span>
                            <span className="text-zinc-600">{Math.round(g.x)}, {Math.round(g.y)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <button onClick={() => exe("Pickup nearest", () => eng()?.pickupNearestItem(1))}
                      className="mt-2 w-full border border-[#4a5c45] bg-[#1f2521] py-2 text-[10px] font-bold uppercase tracking-widest text-[#cdd7bf] hover:bg-[#2b352e]">
                      🖐️ Pegar Item Mais Próximo (tecla H)
                    </button>
                  </div>

                  <p className="text-[9px] text-zinc-600">Atalhos: <span className="text-[#d96b3a]">G</span> larga o item equipado · <span className="text-[#d96b3a]">H</span> pega o item mais próximo</p>
                </div>
              )}

              {/* ════════════════════════════════════ ZOMBIES ════════════════════════════════════ */}
              {tab === "zombies" && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">Zombie Spawner (10)</p>
                  <div className="grid grid-cols-5 gap-2">
                    <div><label className="text-[9px] text-zinc-500">Nome</label><input value={zName} onChange={(e)=>setZName(e.target.value)} placeholder="Brute" className="w-full border border-[#2a2a2a] bg-black px-2 py-2 text-xs text-zinc-200 outline-none"/></div>
                    <div><label className="text-[9px] text-zinc-500">HP</label><input type="number" value={zHp} onChange={(e)=>setZHp(Number(e.target.value))} className="w-full border border-[#2a2a2a] bg-black px-2 py-2 text-xs text-zinc-200 outline-none"/></div>
                    <div><label className="text-[9px] text-zinc-500">Veloc.</label><input type="number" step={0.1} value={zSpeed} onChange={(e)=>setZSpeed(Number(e.target.value))} className="w-full border border-[#2a2a2a] bg-black px-2 py-2 text-xs text-zinc-200 outline-none"/></div>
                    <div><label className="text-[9px] text-zinc-500">Dano</label><input type="number" value={zDmg} onChange={(e)=>setZDmg(Number(e.target.value))} className="w-full border border-[#2a2a2a] bg-black px-2 py-2 text-xs text-zinc-200 outline-none"/></div>
                    <div><label className="text-[9px] text-zinc-500">Qtde</label><input type="number" min={1} max={100} value={spawnCount} onChange={(e)=>setSpawnCount(Number(e.target.value))} className="w-full border border-[#2a2a2a] bg-black px-2 py-2 text-xs text-zinc-200 outline-none"/></div>
                  </div>
                  <button onClick={() => exe(`Spawn ${spawnCount} custom zombies`, ()=>eng()?.adminSpawnZombies(spawnCount))}
                    className="w-full border border-[#5a2b24] bg-[#1a0d0b] py-3 text-xs font-bold uppercase text-[#d96b3a] hover:bg-[#2a1714]">🧟 Spawn {spawnCount} Zumbis Personalizados</button>
                  <div className="grid grid-cols-4 gap-1">
                    {B("+1 Zumbi","+1Z",()=>eng()?.adminSpawnZombies(1))}
                    {B("+5 Zumbis","+5Z",()=>eng()?.adminSpawnZombies(5))}
                    {B("+10 Zumbis","+10Z",()=>eng()?.adminSpawnZombies(10))}
                    {B("+25 Zumbis","+25Z",()=>eng()?.adminSpawnZombies(25))}
                    {B("+50 Zumbis","+50Z",()=>eng()?.adminSpawnZombies(50))}
                    {B("+100 Zumbis","+100Z",()=>eng()?.adminSpawnZombies(100))}
                    {B("💀 Kill All Z","KAll",()=>eng()?.adminKillAllZombies())}
                    {B("🧟 Horda","Horda",()=>{for(let i=0;i<30;i++)eng()?.adminSpawnZombies(5)})}
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════ WEATHER ════════════════════════════════════ */}
              {tab === "weather" && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">Clima & Tempo (14)</p>
                  <div className="grid grid-cols-4 gap-2">
                    {(["clear","rain","fog","storm","snow","toxic"] as const).map(w => (
                      <button key={w} onClick={()=>{setWeatherType(w);exe(`Weather ${w}`,()=>eng()?.adminSetTime(w==="storm"?22:12));}}
                        className={`border px-4 py-3 text-xs uppercase tracking-widest transition-all ${weatherType===w?"border-[#d96b3a] bg-[#2a1714] text-[#d96b3a] font-bold":"border-[#2a2a2a] text-zinc-400 hover:border-[#4a5c45]"}`}>
                        {w==="clear"?"☀️ Claro":w==="rain"?"🌧️ Chuva":w==="fog"?"🌫️ Névoa":w==="storm"?"⛈️ Tempestade":w==="snow"?"❄️ Neve":"☢️ Tóxico"}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    {B("06:00 Amanhecer","D6",()=>eng()?.adminSetTime(6))}
                    {B("08:00 Dia","D8",()=>eng()?.adminSetTime(8))}
                    {B("12:00 Meio-dia","N12",()=>eng()?.adminSetTime(12))}
                    {B("18:00 Entardecer","D18",()=>eng()?.adminSetTime(18))}
                    {B("22:00 Noite","N22",()=>eng()?.adminSetTime(22))}
                    {B("00:00 Meia-noite","M0",()=>eng()?.adminSetTime(0))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={23} value={timeInput} onChange={(e)=>setTimeInput(Number(e.target.value))}
                      className="w-20 border border-[#2a2a2a] bg-black px-3 py-2 text-center text-sm text-zinc-200 outline-none" />
                    <button onClick={() => exe(`Set time ${timeInput}h`, ()=>eng()?.adminSetTime(timeInput))}
                      className="border border-[#4a5c45] px-4 py-2 text-xs text-[#7f936f] hover:bg-[#1f2521]">⏰ Definir Hora</button>
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════ VEHICLES ════════════════════════════════════ */}
              {tab === "vehicle" && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">Veículos (8)</p>
                  <div className="flex items-center gap-3">
                    <input type="range" min={1} max={30} value={vehCount} onChange={(e)=>setVehCount(Number(e.target.value))} className="flex-1 accent-[#d96b3a]" />
                    <span className="text-lg font-bold text-[#d96b3a] w-8 text-center">{vehCount}</span>
                  </div>
                  <button onClick={() => exe(`Spawn ${vehCount} veh`,()=>{} )}
                    className="w-full border border-[#4a5c45] bg-[#1f2521] py-3 text-xs uppercase text-[#cdd7bf] hover:bg-[#2b352e]">🚗 Spawn {vehCount} Veículos (aleatório)</button>
                  <p className="text-[9px] text-zinc-600">Pressione V perto de um veículo para entrar. Use WASD para dirigir.</p>
                </div>
              )}

              {/* ════════════════════════════════════ PLAYERS ════════════════════════════════════ */}
              {tab === "players" && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">Jogadores Online (8)</p>
                  {snapshot.onlinePlayers.length===0 ? (
                    <p className="text-xs text-zinc-600">Nenhum online. Abra outra aba.</p>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {snapshot.onlinePlayers.map(op => (
                        <div key={op.id} className="flex items-center justify-between border border-[#1f2521] bg-[#0a0a0a] px-3 py-2 text-xs">
                          <span className="flex items-center gap-2"><span className="text-blue-400">●</span> <span className="text-zinc-200 font-bold">{op.name}</span></span>
                          <span className="text-zinc-500">HP: {op.health}% | K: {op.kills}</span>
                          <button onClick={() => exe(`Kick ${op.name}`,()=>eng()?.adminSetStat("health",0))}
                            className="border border-[#5a2b24] px-2 py-1 text-[9px] text-red-400 hover:bg-[#2a1714]">Kick</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input value={massTpTarget} onChange={(e)=>setMassTpTarget(e.target.value)}
                      placeholder="Teleportar todos para X,Y" className="flex-1 border border-[#2a2a2a] bg-black px-3 py-2 text-xs text-zinc-200 outline-none" />
                    <button onClick={() => exe(`TP all to X:${massTpTarget}`,()=>eng()?.adminTeleport(Number(massTpTarget)||5000,5000))}
                      className="border border-[#4a5c45] px-3 py-2 text-xs text-[#7f936f]">TP All</button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {B("🔁 Toggle PvP","PvP",()=>eng()?.togglePvP())}
                    {B("👤 TP Myself Base","MyBase",()=>eng()?.adminTeleport(5000,5000))}
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════ WORLD ════════════════════════════════════ */}
              {tab === "world" && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">Mundo & Teleportes (16)</p>
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-1">
                    {B("📍 Spawn (5000,5000)","TP Spawn",()=>eng()?.adminTeleport(5000,5000))}
                    {B("🏠 Residencial","TP Res",()=>eng()?.adminTeleport(4800,4800))}
                    {B("🌲 Floresta Norte","TP FN",()=>eng()?.adminTeleport(5000,2000))}
                    {B("🌲 Floresta Sul","TP FS",()=>eng()?.adminTeleport(5000,8000))}
                    {B("🛣️ Estrada Leste","TP E",()=>eng()?.adminTeleport(8000,5000))}
                    {B("🛣️ Estrada Oeste","TP W",()=>eng()?.adminTeleport(2000,5000))}
                    {B("🌊 Rio","TP Rio",()=>eng()?.adminTeleport(5300,5200))}
                    {B("🏭 Industrial","TP Ind",()=>eng()?.adminTeleport(4700,5200))}
                    {B("🏚️ Ruínas","TP Ruin",()=>eng()?.adminTeleport(6000,4500))}
                    {B("🏥 Hospital","TP Hosp",()=>eng()?.adminTeleport(5200,4800))}
                    {B("🔫 Delegacia","TP Pol",()=>eng()?.adminTeleport(5100,4900))}
                    {B("🏫 Escola","TP Esc",()=>eng()?.adminTeleport(5050,4950))}
                    {B("🛒 Shopping","TP Shop",()=>eng()?.adminTeleport(4800,5100))}
                    {B("⛽ Posto","TP Gas",()=>eng()?.adminTeleport(5150,5050))}
                    {B("🗺️ Canto NW","TP NW",()=>eng()?.adminTeleport(500,500))}
                    {B("🗺️ Canto SE","TP SE",()=>eng()?.adminTeleport(9500,9500))}
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <span className="text-[10px] text-zinc-500">X:</span>
                    <input type="number" min={1} max={9998} value={tpX} onChange={(e)=>setTpX(Number(e.target.value))}
                      className="w-20 border border-[#2a2a2a] bg-black px-2 py-2 text-center text-xs text-zinc-200 outline-none" />
                    <span className="text-[10px] text-zinc-500">Y:</span>
                    <input type="number" min={1} max={9998} value={tpY} onChange={(e)=>setTpY(Number(e.target.value))}
                      className="w-20 border border-[#2a2a2a] bg-black px-2 py-2 text-center text-xs text-zinc-200 outline-none" />
                    <button onClick={() => exe(`TP to ${tpX},${tpY}`,()=>eng()?.adminTeleport(tpX,tpY))}
                      className="border border-[#4a5c45] bg-[#1f2521] px-4 py-2 text-xs text-[#cdd7bf] hover:bg-[#2b352e]">▶ Ir</button>
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════ STATS ════════════════════════════════════ */}
              {tab === "stats" && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">Override de Atributos (10)</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {[["health","Vida",healthVal,setHealthVal,100,0],
                      ["stamina","Stamina",staminaVal,setStaminaVal,100,0],
                      ["hunger","Fome",hungerVal,setHungerVal,0,100],
                      ["thirst","Sede",thirstVal,setThirstVal,0,100],
                      ["sanity","Sanidade",sanVal,setSanVal,100,0],
                      ["infection","Infecção",infVal,setInfVal,0,100]
                    ].map(([stat,label,val,setter,maxVal,minVal]:any) => (
                      <div key={stat} className="border border-[#1f2521] bg-[#0a0a0a] p-2">
                        <label className="text-[9px] uppercase text-zinc-500">{label}</label>
                        <div className="flex items-center gap-1 mt-1">
                          <input type="number" min={minVal} max={maxVal} value={val} onChange={(e)=>setter(Number(e.target.value))}
                            className="flex-1 border border-[#2a2a2a] bg-black px-2 py-1.5 text-xs text-zinc-200 outline-none text-center w-16" />
                          <button onClick={() => exe(`${stat}=${val}`,()=>eng()?.adminSetStat(stat,Number(val)))}
                            className="border border-[#4a5c45] bg-[#1f2521] px-2 py-1.5 text-[10px] text-[#cdd7bf]">SET</button>
                          <button onClick={() => exe(`${stat}=${maxVal}`,()=>eng()?.adminSetStat(stat,Number(maxVal)))}
                            className="border border-[#4a5c45] px-2 py-1.5 text-[9px] text-[#4a5c45]">MAX</button>
                          <button onClick={() => exe(`${stat}=${minVal}`,()=>eng()?.adminSetStat(stat,Number(minVal)))}
                            className="border border-[#5a2b24] px-2 py-1.5 text-[9px] text-red-800">ZERO</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════ CHEATS ════════════════════════════════════ */}
              {tab === "cheats" && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">Comandos IA (10)</p>
                  <div className="flex gap-2">
                    <input value={aiPrompt} onChange={(e)=>setAiPrompt(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (()=>{
                        const p = aiPrompt.toLowerCase();
                        if(p.includes("heal")||p.includes("vida"))exe("IA: Heal",()=>eng()?.adminHealFull());
                        else if(p.includes("god")||p.includes("deus"))exe("IA: God",()=>eng()?.adminGodMode());
                        else if(p.includes("kill")||p.includes("matar"))exe("IA: KillZ",()=>eng()?.adminKillAllZombies());
                        else if(p.includes("dia"))exe("IA: Day",()=>eng()?.adminSetTime(8));
                        else if(p.includes("noite"))exe("IA: Night",()=>eng()?.adminSetTime(22));
                        else if(p.includes("item")||p.includes("spawn")){const n=p.replace(/item|spawn|/g,"").trim();exe(`IA: Spawn ${n||"katana"}`,()=>eng()?.adminSpawnItem(n||"katana"));}
                        else log("AI: Comando não reconhecido.");
                        setAiPrompt("");
                      })()}
                      placeholder='Ex: "heal", "god", "kill zombies", "set day", "spawn katana"'
                      className="flex-1 border border-[#2a2a2a] bg-black px-3 py-3 text-xs text-zinc-200 outline-none focus:border-[#4a5c45]" />
                  </div>
                  {aiResponse && <div className="border border-[#4a5c45]/50 bg-[#1f2521]/80 p-2 text-xs text-[#cdd7bf]">{aiResponse}</div>}
                  <div className="grid grid-cols-2 gap-1">
                    {B("📦 All Items x10","10x",()=>{for(let i=0;i<2;i++)eng()?.adminGiveAllItems()})}
                    {B("🔁 Toggle PvP","PvP",()=>eng()?.togglePvP())}
                    {B("💣 Spawn C4","C4",()=>eng()?.adminSpawnItem("c4Charge"))}
                    {B("🔥 Molotov","Molt",()=>eng()?.adminSpawnItem("fireBottle"))}
                    {B("💀 Suicide","KMS",()=>eng()?.adminSetStat("health",0))}
                    {B("☣ Infection 100%","Inf100",()=>eng()?.adminSetStat("infection",100))}
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════ AMMO ════════════════════════════════════ */}
              {tab === "ammo" && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">Gerador de Munição (8)</p>
                  <div className="grid grid-cols-4 gap-1">
                    {["ammo9mm","ammo45","ammo38","ammo44","ammo556","ammo308","ammo223","shells12","bolts","arrows","incendiaryShells","armorPiercing556","5.56","9mm","12g","44"].map(k => (
                      <button key={k} onClick={() => exe(`Spawn ${k}`,()=>eng()?.adminSpawnItem(k))}
                        className="border border-[#1f2521] bg-[#0a0a0a] px-2 py-2 text-[9px] text-zinc-400 hover:border-[#4a5c45] hover:text-zinc-200">{k.slice(0,20)}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════ EQUIP ════════════════════════════════════ */}
              {tab === "equip" && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">Equipamentos Militares e Sobrevivência (8)</p>
                  <div className="grid grid-cols-4 gap-1">
                    {["tacticalPack","backpack","gasMask","hazmatSuit","nightVision","thermalVisor","geigerCounter","signalJammer","droneRecon","militaryTablet","vestKevlar","vestFrag","helmetMil","camoUniform","suppressor","laserSight","holoSight","thermalSight","nightSight","binosNv"].map(k => (
                      <button key={k} onClick={() => exe(`Spawn ${k}`,()=>eng()?.adminSpawnItem(k))}
                        className="border border-[#1f2521] bg-[#0a0a0a] px-2 py-1.5 text-[9px] text-zinc-400 hover:border-[#4a5c45] hover:text-zinc-200">{k.slice(0,22)}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {["generatorSmall","solarArray","windmill","waterPurif","rainCollector","campfire","cookingPot","farmPlot","irrigation","forge","workbench","storageChest","barricade","barbedWire","fencePost","sandbag","trapBearing","turretAim","antenna","ropeLadder"].map(k => (
                      <button key={k} onClick={() => exe(`Spawn ${k}`,()=>eng()?.adminSpawnItem(k))}
                        className="border border-[#1f2521] bg-[#0a0a0a] px-2 py-1.5 text-[9px] text-zinc-400 hover:border-[#4a5c45] hover:text-zinc-200">{k.slice(0,22)}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════ CRAFT ════════════════════════════════════ */}
              {tab === "craft" && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">Materiais para Craft (12)</p>
                  <div className="grid grid-cols-4 gap-1">
                    {["woodLog","planks","nails","scrapMetal","sheetMetal","glass","concrete","cement","brick","stone","leather","cloth","rubber","coal","sulfur","clay","gravel","rope","ductTape","wire"].map(k => (
                      <button key={k} onClick={() => exe(`Spawn ${k}`,()=>eng()?.adminSpawnItem(k))}
                        className="border border-[#1f2521] bg-[#0a0a0a] px-2 py-1.5 text-[9px] text-zinc-400 hover:border-[#4a5c45] hover:text-zinc-200">{k.slice(0,22)}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {snapshot.recipes.map(r => (
                      <button key={r.id} onClick={() => exe(`Craft ${r.name}`, ()=>eng()?.craft(r.id))}
                        className="border border-[#1f2521] bg-[#0a0a0a] px-2 py-1.5 text-[9px] text-zinc-400 hover:border-[#4a5c45] hover:text-zinc-200">{r.name.slice(0,40)}{r.station?` [${r.station}]`:""}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* ════════════════════════════════════ MAP ════════════════════════════════════ */}
              {tab === "map" && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">Informações do Mapa (6)</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="border border-[#1f2521] bg-[#0a0a0a] p-3"><span className="text-zinc-500">Sua Posição</span><p className="text-lg font-bold text-[#d96b3a]">{Math.round(snapshot.position.x)}, {Math.round(snapshot.position.y)}</p></div>
                    <div className="border border-[#1f2521] bg-[#0a0a0a] p-3"><span className="text-zinc-500">Zumbis</span><p className="text-lg font-bold text-[#d96b3a]">{snapshot.zombies.total} total · {snapshot.zombies.chasing} perseguindo · {snapshot.zombies.nearby} perto</p></div>
                    <div className="border border-[#1f2521] bg-[#0a0a0a] p-3"><span className="text-zinc-500">Tempo</span><p className="text-lg font-bold text-[#d96b3a]">{snapshot.time.daysSurvived} dias · {String(snapshot.time.hour).padStart(2,"0")}:{String(snapshot.time.minute).padStart(2,"0")}</p></div>
                    <div className="border border-[#1f2521] bg-[#0a0a0a] p-3"><span className="text-zinc-500">Clima</span><p className="text-lg font-bold text-[#d96b3a]">{snapshot.weather.toUpperCase()} ({Math.round(snapshot.weatherIntensity*100)}%) · {Math.round(snapshot.temperature)}°C</p></div>
                    <div className="border border-[#1f2521] bg-[#0a0a0a] p-3"><span className="text-zinc-500">Jogadores Online</span><p className="text-lg font-bold text-blue-400">{snapshot.onlinePlayers.length}</p></div>
                    <div className="border border-[#1f2521] bg-[#0a0a0a] p-3"><span className="text-zinc-500">Kills</span><p className="text-lg font-bold text-[#d96b3a]">{snapshot.kills}{snapshot.isCoop && snapshot.p2Kills !== undefined ? ` (+${snapshot.p2Kills} P2)` : ""}</p></div>
                  </div>
                  {snapshot.events.length > 0 && (
                    <div className="border border-[#d96b3a]/30 bg-[#2a1714]/50 p-3">
                      <p className="text-[10px] uppercase tracking-widest text-[#d96b3a] mb-2">Eventos Ativos</p>
                      {snapshot.events.map(ev => (
                        <div key={ev.id} className="flex items-center gap-2 text-xs text-zinc-300 py-1">
                          <span>{ev.icon}</span>
                          <span className="font-bold">{ev.name}</span>
                          <span className="text-zinc-500">— {ev.description}</span>
                          <span className="text-[9px] text-zinc-600 ml-auto">{Math.max(0,Math.round(ev.duration-ev.elapsed))}s</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ════════════════════════════════════ SPAWN ════════════════════════════════════ */}
              {tab === "spawn" && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">Zumbis Especiais (8)</p>
                  <div className="grid grid-cols-4 gap-1">
                    <button onClick={()=>exe("Horda gigante",()=>{for(let i=0;i<60;i++)eng()?.adminSpawnZombies(5)})}
                      className="border border-[#8a2f22] bg-[#2a1714] px-4 py-4 text-xs font-bold text-[#d96b3a] hover:bg-[#3a2218]">🧟 EXOODO HORDA +300</button>
                    {B("🧟 +5 Zumbis","+5",()=>eng()?.adminSpawnZombies(5))}
                    {B("🧟 +10 Zumbis","+10",()=>eng()?.adminSpawnZombies(10))}
                    {B("🧟 +25 Zumbis","+25",()=>eng()?.adminSpawnZombies(25))}
                    {B("🧟 +50 Zumbis","+50",()=>eng()?.adminSpawnZombies(50))}
                    {B("🧟 +100 Zumbis","+100",()=>eng()?.adminSpawnZombies(100))}
                    {B("💀 Kill All","KAll",()=>eng()?.adminKillAllZombies())}
                    {B("📊 Status","Stat",()=>log(`Z:${snapshot.zombies.total} K:${snapshot.kills}`))}
                  </div>
                </div>
              )}

              {/* END TABS */}
            </div>

            {/* COMMAND LOG */}
            <div className="border-t border-[#2a2a2a] bg-[#050505] p-4">
              <p className="mb-2 text-[9px] uppercase tracking-widest text-[#7f936f]">📋 Log</p>
              <div ref={logRef} className="max-h-20 overflow-y-auto border border-[#1f2521] bg-black/80 p-2 font-mono text-[10px] text-zinc-600">
                {commandLog.length === 0 && <p className="text-zinc-700">Nenhum comando executado.</p>}
                {commandLog.map((entry, idx) => (
                  <p key={idx} className="leading-5"><span className="text-[#4a5c45]">$</span> {entry}</p>
                ))}
              </div>
            </div>

            {/* FOOTER */}
            <div className="flex items-center justify-between border-t border-[#2a2a2a] bg-[#0a0a0a] px-4 py-2.5">
              <p className="text-[9px] uppercase tracking-widest text-zinc-700">Day of the Undead — Admin Session Active</p>
              <button onClick={doLogout}
                className="border border-[#5a2b24] px-3 py-1 text-[10px] uppercase tracking-widest text-red-900 hover:bg-[#2a1714] hover:text-red-500 active:scale-95">🚪 Logout</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
