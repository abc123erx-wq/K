// ═══════════════════════════════════════════════════════════════
//  ENGINES TAB — diagnóstico dos motores acelerados
//
//  Mostra o estado de cada motor opcional (PixiJS, Phaser, Godot,
//  PlayCanvas, Rapier/WASM, WebGL2/WebGPU), as estatísticas de
//  frame e o controle de qualidade adaptativa.
//
//  Tudo aqui é **diagnóstico e ajuste de desempenho** — nenhuma
//  regra de jogo é alterada por este painel.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import type { GameEngine } from "../game/engine";
import type { EngineModuleStatus } from "../game/engineModules";
import type { QualityTier } from "../game/graphicsEngine";

interface EnginesTabProps {
  engineRef: React.RefObject<GameEngine | null>;
}

const TIER_LABELS: Record<QualityTier, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

export default function EnginesTab({ engineRef }: EnginesTabProps) {
  const [status, setStatus] = useState<EngineModuleStatus[]>([]);
  const [fps, setFps] = useState(0);
  const [frameMs, setFrameMs] = useState(0);
  const [tier, setTier] = useState<QualityTier>("high");
  const [renderer, setRenderer] = useState("");

  useEffect(() => {
    const id = setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      setStatus(engine.modules.status());
      const stats = engine.modules.stats;
      setFps(Math.round(stats.fps));
      setFrameMs(Number(stats.avgFrameMs.toFixed(1)));
      setTier(engine.modules.qualitySettings.tier);
      setRenderer(engine.modules.capabilities.renderer);
    }, 500);
    return () => clearInterval(id);
  }, [engineRef]);

  const setQuality = (next: QualityTier) => {
    engineRef.current?.modules.setQualityTier(next);
    setTier(next);
  };

  return (
    <div className="space-y-4">
      <div className="border border-[#5a8aaa] bg-[#0e1620] p-3">
        <p className="font-['Oswald'] text-xs font-bold uppercase tracking-[0.24em] text-[#8ab0cc]">
          ⚙ Motores de Renderização
        </p>
        <p className="mt-1 font-mono text-[10px] leading-relaxed text-[#bcd6eb]">
          Camadas de aceleração opcionais. Todas são carregadas sob demanda e o jogo
          funciona normalmente sem nenhuma delas — as regras nunca mudam.
        </p>
      </div>

      {/* ── Performance ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="border border-[#1f2521] bg-[#0a0a0a] p-3 text-center">
          <p className="text-[9px] uppercase tracking-widest text-zinc-500">FPS</p>
          <p className="font-['Oswald'] text-2xl font-bold text-[#7fc25a]">{fps}</p>
        </div>
        <div className="border border-[#1f2521] bg-[#0a0a0a] p-3 text-center">
          <p className="text-[9px] uppercase tracking-widest text-zinc-500">Frame</p>
          <p className="font-['Oswald'] text-2xl font-bold text-[#8ab0cc]">{frameMs}ms</p>
        </div>
        <div className="border border-[#1f2521] bg-[#0a0a0a] p-3 text-center">
          <p className="text-[9px] uppercase tracking-widest text-zinc-500">Qualidade</p>
          <p className="font-['Oswald'] text-2xl font-bold text-[#e8b64a]">{TIER_LABELS[tier]}</p>
        </div>
      </div>

      {renderer && (
        <p className="break-all font-mono text-[9px] text-zinc-600">GPU: {renderer}</p>
      )}

      {/* ── Quality control ─────────────────────────────────── */}
      <div className="border border-[#1f2521] bg-[#0a0a0a] p-3">
        <p className="mb-2 text-[9px] uppercase tracking-widest text-zinc-500">
          Qualidade (automática por padrão)
        </p>
        <div className="flex gap-2">
          {(["low", "medium", "high"] as QualityTier[]).map((t) => (
            <button
              key={t}
              onClick={() => setQuality(t)}
              className={`flex-1 border px-2 py-1.5 text-[10px] uppercase tracking-widest transition-colors ${
                tier === t
                  ? "border-[#4a5c45] bg-[#1f2521] text-[#cdd7bf]"
                  : "border-[#2a2a2a] bg-black text-zinc-500 hover:border-[#4a5c45]"
              }`}
            >
              {TIER_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Module status ───────────────────────────────────── */}
      <div className="space-y-2">
        {status.map((mod) => (
          <div
            key={mod.name}
            className="flex items-start gap-3 border border-[#1f2521] bg-[#0a0a0a] p-3"
          >
            <span
              className={`mt-0.5 inline-block h-2.5 w-2.5 shrink-0 ${
                mod.active ? "bg-[#7fc25a]" : "bg-[#3a3a3a]"
              }`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="font-['Oswald'] text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-300">
                {mod.name}
                <span
                  className={`ml-2 text-[9px] ${
                    mod.active ? "text-[#7fc25a]" : "text-zinc-600]"
                  }`}
                >
                  {mod.active ? "ATIVO" : "INATIVO"}
                </span>
              </p>
              {mod.detail && (
                <p className="mt-0.5 break-all font-mono text-[9px] text-zinc-500">
                  {mod.detail}
                </p>
              )}
              {mod.reason && (
                <p className="mt-0.5 font-mono text-[9px] leading-relaxed text-zinc-600">
                  {mod.reason}
                </p>
              )}
            </div>
          </div>
        ))}
        {status.length === 0 && (
          <p className="font-mono text-[10px] text-zinc-600">
            Aguardando o motor iniciar…
          </p>
        )}
      </div>
    </div>
  );
}
