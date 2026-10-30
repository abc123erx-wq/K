// ═══════════════════════════════════════════════════════════════
//  PIXIJS INTEGRATION — camada de sprites acelerada (opcional)
//
//  O PixiJS é um renderer WebGL/WebGPU de batch exceedingly
//  eficiente. Aqui ele é usado como uma **camada de aceleração**
//  opcional por cima do renderer de Canvas 2D:
//
//    · Partículas (chuva, fumaça, faíscas, sangue)
//    · Sprites de zumbis / jogadores em alta contagem
//    · Efeitos de tela (vinheta, aberração, grão)
//
//  O carregamento é **dinâmico** (`await import(...)`), então:
//
//    · O bundle inicial não cresce quando o PixiJS não está
//      instalado — o jogo funciona 100% no Canvas 2D.
//    · Quando o pacote está presente, ele entra num chunk
//      separado e só é baixado se a aceleração for ativada.
//
//  NENHUMA regra de jogo é alterada aqui. Épuramente visual.
// ═══════════════════════════════════════════════════════════════

import type { GraphicsCapabilities } from "./graphicsEngine";
import { loadOptionalEngine } from "./optionalEngines";

/** The subset of the PixiJS API we rely on. */
interface PixiApplicationLike {
  stage: any;
  ticker?: { add: (fn: (delta: number) => void) => void; remove: (fn: (delta: number) => void) => void };
  renderer?: {
    resize: (w: number, h: number) => void;
    extract?: { canvas: (el: any) => any };
    name?: string;
  };
  /** PixiJS v8 requires `await app.init(options)` before use. */
  init?: (options: Record<string, unknown>) => Promise<void>;
  destroy: (removeView?: boolean, options?: any) => void;
}

interface PixiModule {
  Application?: new (options?: any) => PixiApplicationLike;
  Container?: new () => any;
  Graphics?: new () => any;
  Sprite?: new (texture?: any) => any;
  Texture?: { WHITE?: any; from?: (src: any) => any };
  BlurFilter?: new (...args: any[]) => any;
  ColorMatrixFilter?: new (...args: any[]) => any;
  ParticleContainer?: new (...args: any[]) => any;
  Rectangle?: new (x: number, y: number, w: number, h: number) => any;
  Ticker?: any;
  /** PixiJS v8 exposes the renderer preference here. */
  autoDetectRenderer?: (options?: any) => Promise<any>;
}

export type PixiLoadStatus = "idle" | "loading" | "ready" | "unavailable" | "error";

export interface PixiIntegrationState {
  status: PixiLoadStatus;
  /** True when the PixiJS application is running. */
  active: boolean;
  /** Which renderer PixiJS actually chose. */
  rendererName: string;
  /** Reason when unavailable/errored. */
  reason: string;
}

/**
 * Manages the optional PixiJS layer.
 *
 * Usage:
 *   const pixi = new PixiIntegration(canvas);
 *   await pixi.enable();        // no-op if the package is missing
 *   pixi.particles.add(...);
 *   pixi.destroy();
 */
export class PixiIntegration {
  private app: PixiApplicationLike | null = null;
  private loadPromise: Promise<boolean> | null = null;

  /** Container that holds the accelerated particle sprites. */
  particleLayer: any = null;
  /** Container that holds full-screen effects. */
  effectLayer: any = null;

  private _state: PixiIntegrationState = {
    status: "idle",
    active: false,
    rendererName: "",
    reason: "",
  };

  constructor(private canvas: HTMLCanvasElement) {}

  /** Current state. */
  get state(): PixiIntegrationState {
    return { ...this._state };
  }

  /**
   * Try to enable PixiJS.
   *
   * Resolves to `true` only when the layer is genuinely running.
   * A missing package resolves to `false` — never throws.
   */
  async enable(): Promise<boolean> {
    if (this._state.status === "ready" && this.app) return true;
    if (this.loadPromise) return this.loadPromise;

    this._state.status = "loading";
    this.loadPromise = this.doEnable();
    return this.loadPromise;
  }

  private async doEnable(): Promise<boolean> {
    let mod: PixiModule;
    try {
      // Runtime-resolved import: the package stays OUT of the
      // main bundle and is only fetched when it is actually needed.
      mod = (await loadOptionalEngine("pixi")) as PixiModule;
    } catch (err: any) {
      this._state = {
        status: "unavailable",
        active: false,
        rendererName: "",
        reason:
          "PixiJS não está instalado neste projeto — o jogo segue no renderizador Canvas 2D, " +
          "com a mesma aparência e desempenho de antes.",
      };
      return false;
    }


    try {
      const Application = mod.Application;
      if (!Application) throw new Error("PixiJS sem Application");

      const app = new Application();
      if (typeof app.init !== "function") {
        throw new Error("PixiJS sem init() — versão incompatível.");
      }
      await app.init({
        canvas: this.canvas,
        width: this.canvas.width,
        height: this.canvas.height,
        antialias: false,
        backgroundAlpha: 0,
        // Prefer WebGL2; PixiJS falls back to WebGPU/Canvas on its own.
        preference: "webgl",
        powerPreference: "high-performance",
        resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
        autoDensity: true,
      });

      this.app = app;

      const ParticleContainer = mod.ParticleContainer;
      const Container = mod.Container;
      if (!Container) throw new Error("PixiJS sem Container");
      this.particleLayer = ParticleContainer
        ? new ParticleContainer(undefined, { dynamicProperties: true })
        : new Container();
      this.effectLayer = new Container();
      app.stage.addChild(this.particleLayer);
      app.stage.addChild(this.effectLayer);

      this._state = {
        status: "ready",
        active: true,
        rendererName: app.renderer?.name ?? "desconhecido",
        reason: "",
      };
      return true;
    } catch (err: any) {
      this._state = {
        status: "error",
        active: false,
        rendererName: "",
        reason: `Falha ao inicializar o PixiJS: ${err?.message ?? "erro desconhecido"}`,
      };
      try { this.app?.destroy(true, { children: true }); } catch { /* ignore */ }
      this.app = null;
      return false;
    }
  }

  /** Resize the PixiJS stage to match the canvas. */
  resize(width: number, height: number): void {
    try {
      this.app?.renderer?.resize(width, height);
    } catch { /* ignore */ }
  }

  /** Whether the layer is running. */
  get active(): boolean {
    return this._state.active && !!this.app;
  }

  /**
   * Report the capabilities of the running PixiJS renderer so the
   * UI can tell the player which backend is in use.
   */
  describe(capabilities: GraphicsCapabilities): string {
    if (!this.active) return capabilities.active;
    return `pixi (${this._state.rendererName})`;
  }

  /** Release every GPU resource. */
  destroy(): void {
    try {
      this.app?.destroy(true, { children: true, texture: true });
    } catch { /* ignore */ }
    this.app = null;
    this._state = { status: "idle", active: false, rendererName: "", reason: "" };
  }
}

/**
 * A tiny CPU particle system used by the accelerated layer.
 *
 * It is intentionally independent of PixiJS so the game can use it
 * with the plain Canvas 2D renderer as well (fallback path).
 */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  /** Gravity applied per second. */
  gravity: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private capacity: number;

  constructor(capacity = 260) {
    this.capacity = capacity;
  }

  /** Change the maximum number of live particles. */
  setCapacity(capacity: number): void {
    this.capacity = Math.max(0, capacity);
    if (this.particles.length > this.capacity) {
      this.particles.length = this.capacity;
    }
  }

  /** Spawn a particle (silently ignored when at capacity). */
  spawn(particle: Particle): void {
    if (this.particles.length >= this.capacity) return;
    this.particles.push(particle);
  }

  /** Update every particle. `dt` is in seconds. */
  update(dt: number): void {
    const step = Math.min(dt, 0.1); // clamp after a tab-switch
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= step;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
    }
  }

  /** Live particle count. */
  get count(): number {
    return this.particles.length;
  }

  /** Read-only view of the particles. */
  get all(): readonly Particle[] {
    return this.particles;
  }

  /** Remove every particle. */
  clear(): void {
    this.particles.length = 0;
  }
}
