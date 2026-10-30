// ═══════════════════════════════════════════════════════════════
//  ENGINE MODULES — fachada única dos motores externos
//
//  Reúne as integrações opcionais:
//
//    · PixiJS    → camada de sprites/partículas acelerada
//    · Phaser    → camada de cenas 2D / UI
//    · Godot     → build HTML5 hospedada (WebGL2 + WASM)
//    · PlayCanvas→ visualizador 3D (WebGL2 / WebGPU)
//    · Rapier    → física WASM (com fallback determinístico)
//    · WebGL2 / WebGPU → contexto acelerado e pós-processamento
//
//  REGRAS INALTERADAS: este módulo é **infraestrutura**. Ele não
//  decide nada sobre o jogo — apenas oferece aceleração opcional
//  e degrada de forma graciosa quando um motor não está presente.
// ═══════════════════════════════════════════════════════════════

import {
  AdaptiveQuality,
  GraphicsProfiler,
  detectGraphicsCapabilities,
  WebGL2SpriteBatch,
  type GraphicsCapabilities,
  type GraphicsStats,
  type QualitySettings,
  type QualityTier,
} from "./graphicsEngine";
import { PixiIntegration, ParticleSystem } from "./pixiIntegration";
import { PhaserIntegration } from "./phaserIntegration";
import { PlayCanvasIntegration } from "./playcanvasIntegration";
import { detectGodotBuild, loadGodotBuild, type GodotBuildInfo, type GodotInstance } from "./godotIntegration";
import { PhysicsEngine } from "./physics";

export interface EngineModuleStatus {
  /** Human-readable name of the module. */
  name: string;
  /** Whether it is running right now. */
  active: boolean;
  /** Why it is not running (when inactive). */
  reason: string;
  /** Extra detail (renderer name, version…). */
  detail: string;
}

/**
 * The façade that owns every optional engine module.
 *
 * One instance is created by the game engine and lives as long as
 * the game does.
 */
export class EngineModules {
  readonly capabilities: GraphicsCapabilities;
  readonly profiler = new GraphicsProfiler();
  readonly quality = new AdaptiveQuality();
  readonly physics = new PhysicsEngine();
  readonly particles = new ParticleSystem();

  readonly pixi: PixiIntegration;
  readonly phaser: PhaserIntegration;
  readonly playcanvas: PlayCanvasIntegration;

  /** Info about the optional Godot build (probed lazily). */
  private godotInfo: GodotBuildInfo | null = null;
  private godotInstance: GodotInstance | null = null;

  private webglBatch: WebGL2SpriteBatch | null = null;
  private enabled = false;

  constructor(canvas: HTMLCanvasElement) {
    this.capabilities = detectGraphicsCapabilities();
    this.pixi = new PixiIntegration(canvas);
    this.phaser = new PhaserIntegration(canvas);
    this.playcanvas = new PlayCanvasIntegration(canvas);
  }

  /**
   * Enable the optional layers.
   *
   * Everything here is best-effort: a module that cannot load is
   * simply reported as inactive and the game keeps working.
   */
  async enableAll(): Promise<void> {
    if (this.enabled) return;
    this.enabled = true;

    // The WASM physics engine — silent when not installed.
    await this.physics.tryEnableRapier();

    // The accelerated 2D layer — silent when not installed.
    await this.pixi.enable();
    await this.phaser.enable();

    // The 3D layer is only probed lazily (it is heavier), so the
    // engine is loaded on demand when the 3D view is opened.
  }

  /** Create the direct WebGL2 batcher (used for post-processing). */
  initWebGL(canvas: HTMLCanvasElement): boolean {
    const batch = new WebGL2SpriteBatch(canvas);
    if (!batch.ready) {
      batch.dispose();
      return false;
    }
    this.webglBatch = batch;
    return true;
  }

  /** The WebGL2 batcher, when available. */
  get webgl(): WebGL2SpriteBatch | null {
    return this.webglBatch;
  }

  /** Current quality settings. */
  get qualitySettings(): QualitySettings {
    return this.quality.settings();
  }

  /** Force a quality tier. */
  setQualityTier(tier: QualityTier): void {
    this.quality.setTier(tier);
  }

  /** Frame statistics of the accelerated layer. */
  get stats(): GraphicsStats {
    return this.profiler.stats();
  }

  /**
   * Probe the optional Godot build.
   * The result is cached so the network is hit only once.
   */
  async probeGodot(): Promise<GodotBuildInfo> {
    if (this.godotInfo) return this.godotInfo;
    this.godotInfo = await detectGodotBuild();
    return this.godotInfo;
  }

  /**
   * Load the Godot build into a container, when one is deployed.
   */
  async openGodot(container: HTMLElement): Promise<GodotInstance | null> {
    const info = await this.probeGodot();
    if (!info.available) return null;
    this.godotInstance = await loadGodotBuild(container, info);
    return this.godotInstance;
  }

  /** Status of every module, for the diagnostics panel. */
  status(): EngineModuleStatus[] {
    const pixiState = this.pixi.state;
    const phaserState = this.phaser.state;
    const playState = this.playcanvas.state;

    return [
      {
        name: "WebGL2 / WebGPU",
        active: this.capabilities.accelerated,
        reason: this.capabilities.accelerated ? "" : "WebGL2 indisponível neste navegador.",
        detail: this.capabilities.renderer,
      },
      {
        name: "PixiJS",
        active: pixiState.active,
        reason: pixiState.reason,
        detail: pixiState.rendererName,
      },
      {
        name: "Phaser",
        active: phaserState.active,
        reason: phaserState.reason,
        detail: phaserState.rendererName,
      },
      {
        name: "Godot (HTML5)",
        active: !!this.godotInfo?.available,
        reason: this.godotInfo?.reason ?? "Build do Godot não verificado.",
        detail: this.godotInfo?.version ?? "",
      },
      {
        name: "PlayCanvas",
        active: playState.active,
        reason: playState.reason,
        detail: playState.rendererName,
      },
      {
        name: "Rapier (WASM)",
        active: this.physics.accelerated,
        reason: this.physics.accelerated ? "" : "Rapier não carregado — física interna determinística em uso.",
        detail: this.physics.accelerated ? "WebAssembly" : "fallback determinístico",
      },
    ];
  }

  /** Release every resource. */
  destroy(): void {
    this.pixi.destroy();
    this.phaser.destroy();
    this.playcanvas.destroy();
    this.godotInstance?.destroy();
    this.godotInstance = null;
    this.physics.dispose();
    this.webglBatch?.dispose();
    this.webglBatch = null;
    this.particles.clear();
  }
}
