// ═══════════════════════════════════════════════════════════════
//  SPECIAL PANEL — hidden operator panel
//
//  · Starts CLOSED for everybody.
//  · Opens only after:
//      1) the account is authorized by the SERVER (stable account
//         id validated against the server allowlist), AND
//      2) the exact activation phrase is recognized locally while
//         the microphone has been explicitly permitted.
//
//  · The phrase is NOT authentication. The server re-validates
//    every privileged command.
//  · No audio is recorded, stored or transmitted by this panel.
//  · Closing the panel (button / Escape / disconnect) stops the
//    speech recognition immediately.
//
//  Privacy notes shown to the player before the microphone prompt:
//    · the browser may send the audio to the vendor's recognition
//      service — we never claim local-only processing.
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIVATION_PHRASE,
  VoiceActivation,
  detectVoiceSupport,
  matchesActivationPhrase,
  normalizePhrase,
  requestMicrophonePermission,
} from "../game/panelAccess";
import { fetchPanelPlayers, notifyActivation, requestSpawn, type PanelTarget } from "../game/panelService";
import { getSpawnableIds, subscribeToPermission } from "../game/adminAccess";
import type { GameEngine } from "../game/engine";

interface SpecialPanelProps {
  isOpen: boolean;
  onClose: () => void;
  engineRef: React.RefObject<GameEngine | null>;
  room?: string;
}

interface HistoryEntry {
  ts: number;
  ok: boolean;
  text: string;
}

/** Human labels for the server-provided effect ids. */
const EFFECT_LABELS: Record<string, string> = {
  zombie_scavenger: "Vagante",
  zombie_brute: "Bruto",
  zombie_swarm: "Enxame",
  hunter: "Caçador",
  pet: "Companheiro",
};

export default function SpecialPanel({ isOpen, onClose, engineRef, room = "global" }: SpecialPanelProps) {
  return (
    <SpecialPanelInner
      isOpen={isOpen}
      onClose={onClose}
      engineRef={engineRef}
      room={room}
    />
  );
}

// ═══════════════════════════════════════════════════════════════
//  ACTIVATOR — the discreet, always-mounted listener.
//
//  It stays mounted during the session so the activation phrase
//  can be heard. It only listens when:
//    · the SERVER has authorized the account, AND
//    · the player explicitly enabled the listener (and granted the
//      microphone permission).
//
//  Nothing is recorded. The recognizer is destroyed when the panel
//  opens, when the player stops it, or when the account loses the
//  permission.
// ═══════════════════════════════════════════════════════════════

interface ActivatorProps {
  /** Whether the server has authorized this account. */
  authorized: boolean;
  /** Called when the exact activation phrase was recognized AND confirmed. */
  onActivated: () => void;
  /** Called when the player wants to stop listening. */
  onListeningChange?: (listening: boolean) => void;
}

export function SpecialPanelActivator({ authorized, onActivated, onListeningChange }: ActivatorProps) {
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const recognizerRef = useRef<VoiceActivation | null>(null);
  const support = useMemo(() => detectVoiceSupport(), []);

  const stopListening = useCallback(() => {
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setListening(false);
    onListeningChange?.(false);
  }, [onListeningChange]);

  // Stop listening whenever the authorization goes away.
  useEffect(() => {
    if (!authorized && listening) {
      stopListening();
      setStatus("Permissão encerrada. Escuta interrompida.");
    }
  }, [authorized, listening, stopListening]);

  // Release the microphone when the component unmounts.
  useEffect(() => () => {
    recognizerRef.current?.stop();
    recognizerRef.current = null;
  }, []);

  const startListening = useCallback(async () => {
    setError("");
    setStatus("");
    if (support.level === "unsupported") { setError(support.reason); return; }
    if (support.level === "needs-https") { setError(support.reason); return; }

    setShowPrompt(false);
    const permission = await requestMicrophonePermission();
    if (!permission.granted) {
      setError(permission.reason);
      return;
    }

    const recognizer = new VoiceActivation();
    recognizerRef.current = recognizer;

    const result = await recognizer.start(
      (transcript, isFinal) => {
        if (!isFinal) return;
        if (!matchesActivationPhrase(transcript)) {
          setError(`Frase não reconhecida. Diga exatamente: "${ACTIVATION_PHRASE}".`);
          return;
        }
        void (async () => {
          const confirmation = await notifyActivation();
          if (!confirmation.ok) {
            setError(confirmation.message);
            stopListening();
            return;
          }
          setError("");
          setStatus("Painel liberado.");
          stopListening();
          onActivated();
        })();
      },
      (_code, message) => {
        setError(message);
        setListening(false);
        recognizerRef.current = null;
        onListeningChange?.(false);
      },
    );

    if (!result.ok) {
      setError(result.message);
      recognizerRef.current = null;
      return;
    }
    setListening(true);
    onListeningChange?.(true);
    setStatus(result.message);
  }, [support, stopListening, onActivated, onListeningChange]);

  if (!authorized) return null;

  return (
    <>
      {/* Discreet arm button — only rendered for server-authorized accounts */}
      {!listening && !showPrompt && (
        <button
          type="button"
          onClick={() => setShowPrompt(true)}
          title="Ativação por voz do painel especial"
          className="pointer-events-auto fixed bottom-4 left-4 z-[900] border border-[#2f3a30] bg-[#0a0c0a]/85 px-2.5 py-2 font-mono text-[9px] uppercase tracking-widest text-zinc-600 hover:border-[#4a5c45] hover:text-[#7f936f]"
        >
          ◈
        </button>
      )}

      {/* Discreet indicator while listening */}
      {listening && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[900] -translate-x-1/2">
          <div className="flex items-center gap-2 border border-[#8a2f22] bg-[#2a1714]/95 px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-[#d96b3a] shadow-lg shadow-black">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#d96b3a]" />
            Escutando
          </div>
        </div>
      )}

      {/* Neutral status / error line for the operator */}
      {(status || error) && !showPrompt && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[900] -translate-x-1/2 max-w-[90vw]">
          <p className={`border px-3 py-1.5 font-mono text-[9px] shadow-lg shadow-black ${error ? "border-[#5a2b24] bg-[#1a0d0b]/95 text-[#d96b3a]" : "border-[#2f3a30] bg-[#0a0c0a]/95 text-[#7f936f]"}`}>
            {error || status}
          </p>
        </div>
      )}

      {/* Stop-listening affordance */}
      {listening && (
        <button
          type="button"
          onClick={stopListening}
          className="pointer-events-auto fixed bottom-16 left-1/2 z-[900] -translate-x-1/2 border border-[#5a2b24] bg-[#1a0d0b]/95 px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-[#d96b3a] hover:bg-[#2a1714]"
        >
          ■ Parar escuta
        </button>
      )}

      {/* Prompt (shown before requesting the microphone permission) */}
      {showPrompt && (
        <div className="pointer-events-auto fixed inset-0 z-[960] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-3 border border-[#2f3a30] bg-[#070907] p-5">
            <h3 className="text-sm font-black uppercase tracking-[0.24em] text-[#7f936f]">Ativação por voz</h3>
            <p className="font-mono text-[10px] leading-relaxed text-zinc-400">
              O painel especial exige a frase de ativação exata
              {" "}<span className="text-[#d7c9a7]">"{ACTIVATION_PHRASE}"</span>.
            </p>
            <p className="font-mono text-[10px] leading-relaxed text-zinc-500">
              O reconhecimento usa a Web Speech API do navegador, que <strong className="text-zinc-400">pode enviar o áudio</strong> ao serviço
              de reconhecimento do fornecedor. O jogo <strong className="text-zinc-400">não grava nem armazena</strong> o áudio ou a transcrição.
              A frase é apenas um gatilho local: a permissão é confirmada pelo servidor.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void startListening()}
                className="border border-[#4a5c45] bg-[#1f2521] px-4 py-2 text-[10px] uppercase tracking-widest text-[#cdd7bf] hover:bg-[#2b352e]"
              >
                Permitir e escutar
              </button>
              <button
                type="button"
                onClick={() => setShowPrompt(false)}
                className="border border-[#2a2a2a] bg-black px-4 py-2 text-[10px] uppercase tracking-widest text-zinc-400 hover:border-[#4a5c45]"
              >
                Cancelar
              </button>
            </div>
            {error && <p className="font-mono text-[10px] text-[#d96b3a]">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}

function SpecialPanelInner({ isOpen, onClose, engineRef, room = "global" }: SpecialPanelProps) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [targets, setTargets] = useState<PanelTarget[]>([]);
  const [targetId, setTargetId] = useState("");
  const [effectId, setEffectId] = useState("");
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [confirmHighImpact, setConfirmHighImpact] = useState(false);

  const historyRef = useRef<HTMLDivElement | null>(null);

  const support = useMemo(() => detectVoiceSupport(), []);
  // The allowlist always comes from the server; it is refreshed as
  // soon as the permission state changes.
  const [spawnable, setSpawnable] = useState<string[]>(() => getSpawnableIds());
  useEffect(() => subscribeToPermission((state) => setSpawnable(state.spawnable)), []);

  const pushHistory = useCallback((ok: boolean, text: string) => {
    setHistory((prev) => [{ ts: Date.now(), ok, text }, ...prev].slice(0, 30));
  }, []);

  useEffect(() => {
    if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight;
  }, [history]);

  // ---- Escape closes the panel ---------------------------------------
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // ---- Refresh the target list while the panel is open ----------------
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const load = async () => {
      const list = await fetchPanelPlayers(room);
      if (cancelled) return;
      setTargets(list);
      // Drop a target that disconnected so we never silently redirect.
      setTargetId((current) => (list.some((t) => t.id === current) ? current : ""));
    };
    void load();
    const timer = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isOpen, room]);

  // ---- Voice status ----------------------------------------------------
  // The listening itself is handled by SpecialPanelActivator, which
  // lives outside the panel so the phrase can be heard before the
  // panel opens. Here we only reflect the current state.
  const [voiceActive, setVoiceActive] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      // Closing the panel ends the listening session.
      setVoiceActive(false);
    }
  }, [isOpen]);

  // ---- Command handling ------------------------------------------------
  const submit = useCallback(async () => {
    const line = command.trim();
    if (!line) return;
    if (sending) return;

    // Structured syntax: /spawn <effect_id> --alvo <sessionId>
    // Free text is NEVER interpreted as code.
    const parsed = parseCommand(line);
    if (!parsed.ok) {
      setError(parsed.message);
      pushHistory(false, parsed.message);
      return;
    }
    if (!targetId) {
      setError("Selecione um jogador-alvo conectado.");
      pushHistory(false, "Nenhum alvo selecionado.");
      return;
    }
    const requestedId = parsed.effectId ?? "";
    if (!spawnable.includes(requestedId)) {
      const suggestion = suggestEffect(requestedId, spawnable);
      setError(suggestion);
      pushHistory(false, suggestion);
      return;
    }

    setSending(true);
    const result = await requestSpawn(requestedId, targetId, room);
    setSending(false);

    if (!result.ok) {
      setError(result.message);
      pushHistory(false, result.message);
      return;
    }

    // The server validated the placement; the engine materialises it.
    const engine = engineRef.current;
    if (engine) {
      const applied = engine.applyServerSpawn(result.effectId ?? requestedId, result.positions ?? []);
      if (!applied.ok) {
        const reason = "Não foi possível criar o efeito em um ponto seguro próximo.";
        setError(reason);
        pushHistory(false, reason);
        return;
      }
      const targetName = result.targetName ?? targets.find((t) => t.id === targetId)?.name ?? "alvo";
      const label = result.label ?? EFFECT_LABELS[requestedId] ?? requestedId;
      const okMsg = `"${label}" invocado perto de ${targetName}.`;
      setError("");
      setStatus(okMsg);
      pushHistory(true, okMsg);
      setCommand("");
    } else {
      const reason = "A partida não está ativa.";
      setError(reason);
      pushHistory(false, reason);
    }
  }, [command, sending, targetId, spawnable, engineRef, room, targets, pushHistory]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (confirmHighImpact) {
        setConfirmHighImpact(false);
        void submit();
      }
    }
  };

  if (!isOpen) return null;

  const selectedTarget = targets.find((t) => t.id === targetId);
  const highImpact = effectId === "zombie_swarm" || effectId === "zombie_brute";

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[950] flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm"
      role="dialog"
      aria-label="Painel especial"
    >
      <div className="relative max-h-[94dvh] w-full max-w-2xl overflow-y-auto overscroll-contain border border-[#2f3a30] bg-[#070907] shadow-2xl shadow-black">
        {/* ── HEADER ─────────────────────────────────────────────── */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[#2f3a30] bg-[#0a0c0a] px-4 py-3">
          <div>
            <h2 className="text-base font-black uppercase tracking-[0.28em] text-[#7f936f]">
              ◈ Painel Especial
            </h2>
            <p className="mt-0.5 text-[9px] uppercase tracking-widest text-zinc-600">
              evento · modo · painel especial
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center border border-[#5a2b24] bg-[#1a0d0b] text-sm text-[#d96b3a] hover:bg-[#2a1714]"
            title="Fechar (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* ── VOICE STATUS ──────────────────────────────────────── */}
          <div className="border border-[#2f3a30] bg-[#0a0c0a] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">Ativação por voz</p>
              {voiceActive && (
                <span className="flex items-center gap-1.5 border border-[#8a2f22] bg-[#2a1714] px-2 py-0.5 text-[9px] uppercase tracking-widest text-[#d96b3a]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#d96b3a]" />
                  Escutando
                </span>
              )}
            </div>
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500">
              Este painel é liberado somente para a conta autorizada, confirmada pelo servidor.
              A frase de ativação é usada apenas como gatilho local — <strong className="text-zinc-400">não é autenticação</strong> —
              e o servidor revalida a permissão a cada comando.
            </p>
            <p className="mt-2 font-mono text-[9px] leading-relaxed text-zinc-600">
              Privacidade: o reconhecimento usa a Web Speech API do navegador, que <strong className="text-zinc-500">pode enviar o áudio</strong> ao
              serviço de reconhecimento do fornecedor. O jogo <strong className="text-zinc-500">não grava nem armazena</strong> o áudio ou a transcrição.
              A captura é encerrada ao fechar o painel, desconectar ou revogar a permissão.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setCommand(""); setError(""); }}
                className="border border-[#2a2a2a] bg-black px-3 py-2 text-[10px] uppercase tracking-widest text-zinc-400 hover:border-[#4a5c45] hover:text-zinc-200"
              >
                Limpar campo
              </button>
            </div>
            {voiceActive && (
              <p className="mt-2 font-mono text-[10px] text-[#7f936f]">
                Reconhecimento de fala ativo fora deste painel.
              </p>
            )}
            {status && <p className="mt-2 font-mono text-[10px] text-[#7f936f]">{status}</p>}
            {error && <p className="mt-2 font-mono text-[10px] text-[#d96b3a]">{error}</p>}
            {support.level !== "ready" && (
              <p className="mt-2 border border-[#5a4a2a] bg-[#1a1408] p-2 font-mono text-[9px] leading-relaxed text-[#e8b64a]">
                {support.reason}
                {" "}O painel permanece fechado para contas sem permissão confirmada pelo servidor.
              </p>
            )}
          </div>

          {/* ── TARGET PICKER ─────────────────────────────────────── */}
          <div className="border border-[#2f3a30] bg-[#0a0c0a] p-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">Jogador-alvo</p>
              <button
                type="button"
                onClick={() => { void fetchPanelPlayers(room).then(setTargets); }}
                className="border border-[#2a2a2a] px-2 py-0.5 text-[9px] uppercase text-zinc-500 hover:text-zinc-300"
              >
                Atualizar
              </button>
            </div>
            {targets.length === 0 ? (
              <p className="mt-2 font-mono text-[10px] text-zinc-600">
                Nenhum jogador conectado na sala atual.
              </p>
            ) : (
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="mt-2 w-full border border-[#2a2a2a] bg-black px-3 py-2 text-xs text-zinc-200 outline-none focus:border-[#4a5c45]"
              >
                <option value="">— selecione um jogador —</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            )}
            {selectedTarget && (
              <p className="mt-1 font-mono text-[9px] text-zinc-600">
                Sessão selecionada: {selectedTarget.id}
              </p>
            )}
          </div>

          {/* ── EFFECT PICKER + CHAT ──────────────────────────────── */}
          <div className="border border-[#2f3a30] bg-[#0a0c0a] p-3">
            <p className="text-[10px] uppercase tracking-widest text-[#7f936f]">Entidade / efeito permitido</p>
            {spawnable.length === 0 ? (
              <p className="mt-2 font-mono text-[10px] text-zinc-600">
                O servidor não disponibilizou nenhum recurso invocável.
              </p>
            ) : (
              <select
                value={effectId}
                onChange={(e) => { setEffectId(e.target.value); setCommand(`/spawn ${e.target.value} --alvo ${targetId}`); }}
                className="mt-2 w-full border border-[#2a2a2a] bg-black px-3 py-2 text-xs text-zinc-200 outline-none focus:border-[#4a5c45]"
              >
                <option value="">— selecione um recurso —</option>
                {spawnable.map((id) => (
                  <option key={id} value={id}>
                    {EFFECT_LABELS[id] ?? id} ({id})
                  </option>
                ))}
              </select>
            )}

            <div className="mt-3 flex flex-col gap-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-600">
                Comando
                <span className="ml-2 normal-case tracking-normal text-zinc-700">
                  /spawn &lt;recurso&gt; --alvo &lt;sessão&gt;
                </span>
              </label>
              <div className="flex gap-2">
                <input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="/spawn zombie_scavenger --alvo srv-xxxx"
                  spellCheck={false}
                  autoComplete="off"
                  className="flex-1 border border-[#2a2a2a] bg-black px-3 py-2 font-mono text-xs text-zinc-200 outline-none focus:border-[#4a5c45]"
                />
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={sending || !effectId || !targetId}
                  className="border border-[#4a5c45] bg-[#1f2521] px-4 py-2 text-[10px] uppercase tracking-widest text-[#cdd7bf] hover:bg-[#2b352e] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending ? "…" : "Invocar"}
                </button>
              </div>
              {highImpact && (
                <div className="flex items-center justify-between border border-[#8a6a2a] bg-[#1a1408] p-2">
                  <p className="font-mono text-[9px] text-[#e8b64a]">
                    Efeito de alto impacto — confirme para prosseguir.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setConfirmHighImpact(false); void submit(); }}
                    className="border border-[#8a6a2a] px-2 py-1 text-[9px] uppercase text-[#e8b64a] hover:bg-[#241a08]"
                  >
                    Confirmar
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── HISTORY ──────────────────────────────────────────── */}
          <div className="border border-[#2f3a30] bg-[#0a0c0a] p-3">
            <p className="mb-2 text-[10px] uppercase tracking-widest text-[#7f936f]">Histórico do painel</p>
            <div ref={historyRef} className="max-h-40 space-y-1 overflow-y-auto font-mono text-[10px]">
              {history.length === 0 && <p className="text-zinc-700">Nenhum comando executado.</p>}
              {history.map((entry, i) => (
                <p key={i} className="flex gap-2 border-b border-[#141414] py-1">
                  <span className="shrink-0 text-zinc-600">
                    {new Date(entry.ts).toLocaleTimeString("pt-BR")}
                  </span>
                  <span className={entry.ok ? "text-[#7f936f]" : "text-[#d96b3a]"}>{entry.text}</span>
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* ── FOOTER ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-[#2f3a30] bg-[#0a0c0a] px-4 py-2.5">
          <p className="text-[9px] uppercase tracking-widest text-zinc-700">
            Esc encerra a escuta e fecha o painel
          </p>
          <button
            type="button"
            onClick={onClose}
            className="border border-[#5a2b24] px-3 py-1 text-[10px] uppercase tracking-widest text-red-900 hover:bg-[#2a1714] hover:text-red-500"
          >
            Encerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
//  Command parsing — structured, no eval, no dynamic execution
// ───────────────────────────────────────────────────────────────

export interface ParsedCommand {
  ok: boolean;
  effectId?: string;
  message: string;
}

/**
 * Parse the structured panel command.
 *
 * Accepted syntax (case-insensitive keywords, exact ids):
 *   /spawn <effect_id> --alvo <sessionId>
 *   /spawn <effect_id> --target <sessionId>
 *
 * Anything else is rejected with a helpful message. The parsed
 * effect id is validated against the server-provided allowlist
 * by the caller — and again by the server.
 */
export function parseCommand(raw: string): ParsedCommand {
  const line = raw.trim();
  if (!line) return { ok: false, message: "Digite um comando." };

  if (!/^\/spawn\b/i.test(line)) {
    return {
      ok: false,
      message: "Comando inválido. Use: /spawn <recurso> --alvo <sessão>",
    };
  }

  const tokens = line.split(/\s+/);
  if (tokens[0].toLowerCase() !== "/spawn") {
    return { ok: false, message: "Comando inválido." };
  }

  const effectId = tokens[1];
  if (!effectId) {
    return { ok: false, message: "Informe o recurso: /spawn <recurso> --alvo <sessão>" };
  }
  // Effect ids are opaque slugs — never anything that could be code.
  if (!/^[a-z][a-z0-9_]{1,47}$/.test(effectId)) {
    return { ok: false, message: `Recurso inválido: "${effectId}".` };
  }

  const targetFlag = tokens.findIndex((t) => t.toLowerCase() === "--alvo" || t.toLowerCase() === "--target");
  if (targetFlag === -1) {
    return { ok: false, message: "Informe o alvo: /spawn <recurso> --alvo <sessão>" };
  }
  const target = tokens[targetFlag + 1];
  if (!target || target.startsWith("--")) {
    return { ok: false, message: "Alvo ausente após --alvo." };
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(target)) {
    return { ok: false, message: "Identificador de sessão inválido." };
  }

  // Reject trailing garbage — the command has exactly four tokens.
  if (tokens.length > targetFlag + 2) {
    return { ok: false, message: "Argumentos extras não permitidos no comando." };
  }

  return { ok: true, effectId, message: "ok" };
}

/** Suggest valid alternatives when an unknown resource is requested. */
export function suggestEffect(input: string, allowed: string[]): string {
  if (allowed.length === 0) {
    return "Nenhum recurso invocável está disponível.";
  }
  const normalized = normalizePhrase(input);
  const close = allowed.filter(
    (id) => normalizePhrase(id).includes(normalized) || normalized.includes(normalizePhrase(id)),
  );
  const list = (close.length ? close : allowed).slice(0, 6).join(", ");
  return `Recurso "${input}" não permitido. Opções válidas: ${list}.`;
}
