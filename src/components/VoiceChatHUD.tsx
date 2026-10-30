// ═══════════════════════════════════════════════════════════════
//  VOICE CHAT HUD COMPONENT — Real-Time Audio Widget & Visualizer
//  Microphone waveform bars, PTT indicator, AI moderation alerts
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { VoiceChat, type VoiceChatState } from "../game/voiceChat";

interface VoiceChatHUDProps {
  isMobile?: boolean;
}

export default function VoiceChatHUD({ isMobile = false }: VoiceChatHUDProps) {
  const [state, setState] = useState<VoiceChatState>(() => VoiceChat.getState());
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const unsub = VoiceChat.subscribe((s) => setState(s));
    return () => {
      unsub();
    };
  }, []);

  // Keyboard shortcut: hold "T" for Push-To-Talk
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key.toLowerCase() === "t" && !e.repeat) {
        VoiceChat.setPTTPressed(true);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "t") {
        VoiceChat.setPTTPressed(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const toggleMic = async () => {
    if (state.isMicActive) {
      VoiceChat.stopMicrophone();
    } else {
      await VoiceChat.startMicrophone();
    }
  };

  return (
    <>
      {/* ── AI Moderation Alert Banner (if violation occurs) ── */}
      {state.incidentToast && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[200] max-w-md w-full px-4 animate-bounce">
          <div className="border-2 border-red-600 bg-red-950/95 text-red-200 p-3 rounded shadow-2xl backdrop-blur font-mono text-xs">
            <div className="flex items-center justify-between font-bold text-red-400 uppercase tracking-widest text-[11px]">
              <span>🛡️ [IA MODERAÇÃO] Alerta de Voz</span>
              <span className="text-[10px] bg-red-900 px-2 py-0.5 rounded">{state.incidentToast.category}</span>
            </div>
            <p className="mt-1 text-zinc-300">
              Violação detectada: <span className="line-through text-red-400">{state.incidentToast.censoredText}</span>
            </p>
            {state.incidentToast.action === "temp_mute" && (
              <p className="mt-1 text-yellow-300 font-bold">
                ⚠️ Microfone mutado temporariamente por 45s por conduta inapropriada.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Voice Chat Main HUD Widget ── */}
      <div className={`fixed z-[80] font-mono pointer-events-auto ${isMobile ? "top-14 right-2" : "bottom-16 left-4"}`}>
        <div className="border border-[#2a2a2a] bg-[#0c0a08]/92 p-2.5 rounded shadow-xl backdrop-blur max-w-xs text-xs">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-[#241d16] pb-2">
            <div className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${state.isSpeaking ? "bg-[#4aff4a] animate-ping" : state.isMicActive ? "bg-[#7fc25a]" : "bg-zinc-600"}`} />
              <span className="font-bold uppercase tracking-wider text-[10px] text-[#e4d8c4]">
                🎙️ Voice Chat
              </span>
            </div>

            <div className="flex items-center gap-1">
              <span title="Moderação Ativa" className="text-[9px] border border-[#3a6a2a] bg-[#0f1a10] px-1.5 py-0.5 rounded text-[#7fc25a]">
                🛡️ IA
              </span>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="text-zinc-500 hover:text-zinc-300 px-1 text-[11px]"
                title="Configurações de Áudio"
              >
                ⚙️
              </button>
            </div>
          </div>

          {/* Mic Status & Live Audio Waveform Visualizer */}
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              onClick={toggleMic}
              className={`border px-2.5 py-1 text-[10px] uppercase font-bold rounded tracking-wider transition-all ${
                state.isMicActive
                  ? "border-[#4a5c45] bg-[#1f2521] text-[#7fc25a] hover:bg-[#2b352e]"
                  : "border-[#5a2b24] bg-[#2a1714] text-[#d96b3a] hover:bg-[#3a2218]"
              }`}
            >
              {state.isMicActive ? "Microfone LIGADO" : "Ligar Mic"}
            </button>

            {/* Waveform Frequency Bars */}
            <div className="flex items-end gap-0.5 h-5 w-20 px-1 bg-black/60 rounded border border-[#1f2521]">
              {state.frequencyData.map((val, idx) => (
                <div
                  key={idx}
                  className={`w-1.5 rounded-t transition-all ${state.isSpeaking ? "bg-[#4aff4a]" : "bg-[#4a5c45]/40"}`}
                  style={{ height: `${Math.max(15, val * 100)}%` }}
                />
              ))}
            </div>
          </div>

          {/* AI Mute Warning Countdown */}
          {state.isMutedByAI && (
            <div className="mt-2 bg-red-950/80 border border-red-700 p-1.5 rounded text-[10px] text-red-300 text-center font-bold animate-pulse">
              🔇 Mutado pela IA ({state.aiMuteCountdown}s)
            </div>
          )}

          {/* PTT Status info */}
          {state.isMicActive && !state.isMutedByAI && (
            <div className="mt-2 text-[9px] text-zinc-400 flex items-center justify-between">
              {state.inputMode === "ptt" ? (
                <span>
                  PTT: Segure <kbd className="bg-black border border-zinc-700 px-1 rounded text-[#d7c9a7]">T</kbd> para falar
                </span>
              ) : (
                <span>Voz Ativa (Sensibilidade: {Math.round(state.vadThreshold * 100)}%)</span>
              )}
              {state.isSpeaking && (
                <span className="text-[#4aff4a] font-bold animate-pulse">TRANSMITINDO</span>
              )}
            </div>
          )}

          {/* Speech-To-Text Live Transcript */}
          {state.lastTranscript && state.isMicActive && (
            <div className="mt-2 p-1.5 bg-black/60 border border-[#1f2521] rounded text-[9px] text-zinc-400 truncate">
              <span className="text-[#7f936f] font-bold">Você:</span> "{state.lastTranscript}"
            </div>
          )}

          {/* Remote Speakers list */}
          {state.activeSpeakers.length > 0 && (
            <div className="mt-2 pt-2 border-t border-[#1f2521] space-y-1">
              <span className="text-[8px] uppercase tracking-wider text-zinc-500">Falando agora:</span>
              {state.activeSpeakers.map((sp) => (
                <div key={sp.id} className="flex items-center justify-between text-[9px] text-blue-300">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                    {sp.name}
                  </span>
                  <span className="text-[8px] text-zinc-500">🔊 {Math.round(sp.volume * 100)}%</span>
                </div>
              ))}
            </div>
          )}

          {/* Settings Drawer */}
          {showSettings && (
            <div className="mt-3 pt-2 border-t border-[#241d16] space-y-2 text-[10px] text-zinc-400">
              <div className="flex items-center justify-between">
                <span>Modo de Entrada:</span>
                <button
                  onClick={() => VoiceChat.setInputMode(state.inputMode === "ptt" ? "vad" : "ptt")}
                  className="border border-[#3a3229] px-2 py-0.5 rounded text-zinc-300 hover:border-[#7fc25a]"
                >
                  {state.inputMode === "ptt" ? "Push-To-Talk (T)" : "Voz Contínua"}
                </button>
              </div>

              <div>
                <div className="flex justify-between">
                  <span>Volume do Microfone:</span>
                  <span>{Math.round(state.micVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="2"
                  step="0.1"
                  value={state.micVolume}
                  onChange={(e) => VoiceChat.setMicVolume(parseFloat(e.target.value))}
                  className="w-full accent-[#7fc25a] h-1"
                />
              </div>

              {state.inputMode === "vad" && (
                <div>
                  <div className="flex justify-between">
                    <span>Sensibilidade do Mic:</span>
                    <span>{Math.round((1 - state.vadThreshold) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.02"
                    max="0.5"
                    step="0.02"
                    value={state.vadThreshold}
                    onChange={(e) => VoiceChat.setVadThreshold(parseFloat(e.target.value))}
                    className="w-full accent-[#7fc25a] h-1"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
