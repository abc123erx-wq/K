// ═══════════════════════════════════════════════════════════════
//  PHASER INTEGRATION — camada de cena 2D acelerada (opcional)
//
//  O Phaser é um framework de jogos 2D com renderer WebGL (e um
//  fallback automático para Canvas). Aqui ele é usado como uma
//  **camada de apresentação opcional**:
//
//    · Sobreposições de interface (HUD, menus, avisos).
//    · Cenas de interlúdio (telas de morte, respawn).
//    · Um "minijogo" de treino dentro do jogo.
//
//  Carregamento **dinâmico**: o Phaser entra num chunk separado
//  e só é baixado quando a camada é ativada. Sem o pacote
//  instalado, o jogo segue funcionando normalmente.
//
//  Assim como no PixiJS, NENHUMA regra de jogo é alterada — é uma
//  camada puramente visual sobreposta ao canvas principal.
// ═══════════════════════════════════════════════════════════════

import { loadOptionalEngine } from "./optionalEngines";

export type PhaserLoadStatus = "idle" | "loading" | "ready" | "unavailable" | "error";

export interface PhaserIntegrationState {
  status: PhaserLoadStatus;
  active: boolean;
  rendererName: string;
  reason: string;
}

export interface PhaserSceneDefinition {
  /** Unique scene key. */
  key: string;
  /** Scene class or a factory returning a scene config. */
  create: (data?: Record<string, unknown>) => Record<string, unknown>;
  /** Whether the scene starts active. */
  active?: boolean;
}

/**
 * Manages the optional Phaser layer.
 */
export class PhaserIntegration {
  private game: any = null;
  private Phaser: any = null;
  private loadPromise: Promise<boolean> | null = null;

  private _state: PhaserIntegrationState = {
    status: "idle",
    active: false,
    rendererName: "",
    reason: "",
  };

  constructor(private canvas: HTMLCanvasElement) {}

  get state(): PhaserIntegrationState {
    return { ...this._state };
  }

  get active(): boolean {
    return this._state.active && !!this.game;
  }

  /**
   * Try to enable the Phaser layer.
   * Resolves to false (never throws) when the package is missing.
   */
  async enable(scenes: PhaserSceneDefinition[] = []): Promise<boolean> {
    if (this._state.status === "ready" && this.game) return true;
    if (this.loadPromise) return this.loadPromise;
    this._state.status = "loading";
    this.loadPromise = this.doEnable(scenes);
    return this.loadPromise;
  }

  private async doEnable(scenes: PhaserSceneDefinition[]): Promise<boolean> {
    let mod: any;
    try {
      mod = await loadOptionalEngine("phaser");
    } catch (err: any) {
      this._state = {
        status: "unavailable",
        active: false,
        rendererName: "",
        reason:
          "Phaser não está instalado neste projeto — as cenas continuam sendo desenhadas " +
          "pelo renderizador principal, sem alteração de aparência.",
      };
      return false;
    }

    this.Phaser = mod.default ?? mod;

    try {
      const sceneList = scenes.map((scene) => ({
        key: scene.key,
        create: scene.create,
        active: scene.active ?? false,
      }));

      this.game = new this.Phaser.Game({
        type: this.Phaser.WEBGL,
        canvas: this.canvas,
        width: this.canvas.width,
        height: this.canvas.height,
        backgroundColor: "#00000000",
        transparent: true,
        antialias: false,
        powerPreference: "high-performance",
        scale: { mode: this.Phaser.Scale.RESIZE },
        audio: { noAudio: true },
        banner: false,
        scene: sceneList,
      });

      this._state = {
        status: "ready",
        active: true,
        rendererName: String(this.game.renderer?.type === this.Phaser.WEBGL ? "WebGL" : "Canvas"),
        reason: "",
      };
      return true;
    } catch (err: any) {
      this._state = {
        status: "error",
        active: false,
        rendererName: "",
        reason: `Falha ao inicializar o Phaser: ${err?.message ?? "erro desconhecido"}`,
      };
      this.game = null;
      return false;
    }
  }

  /** Resize the game to match the canvas. */
  resize(width: number, height: number): void {
    try {
      this.game?.scale?.resize(width, height);
    } catch { /* ignore */ }
  }

  /** Start a scene by key. */
  startScene(key: string, data?: Record<string, unknown>): void {
    try {
      this.game?.scene?.start(key, data);
    } catch { /* ignore */ }
  }

  /** Stop a scene by key. */
  stopScene(key: string): void {
    try {
      this.game?.scene?.stop(key);
    } catch { /* ignore */ }
  }

  /** Pause / resume the whole game. */
  setPaused(paused: boolean): void {
    try {
      if (paused) this.game?.scene?.pause();
      else this.game?.scene?.resume();
    } catch { /* ignore */ }
  }

  /** Release every resource. */
  destroy(): void {
    try {
      this.game?.destroy(true);
    } catch { /* ignore */ }
    this.game = null;
    this.Phaser = null;
    this._state = { status: "idle", active: false, rendererName: "", reason: "" };
  }
}
