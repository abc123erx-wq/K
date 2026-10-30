// ═══════════════════════════════════════════════════════════════
//  PLAYCANVAS INTEGRATION — runtime 3D leve (opcional)
//
//  O PlayCanvas tem um runtime de ~1–2 MB, WebGL2 + WebGPU e um
//  editor na nuvem. Neste projeto ele é usado como camada
//  **opcional** para:
//
//    · Um visualizador 3D do minimapa (o mapa do mundo como
//      relevo 3D), em vez do minimapa 2D.
//    · Pré-visualização 3D dos itens do inventário.
//
//  O runtime é carregado dinamicamente e **apenas quando o jogador
//  abre o visualizador 3D**. O jogo 2D continua sendo o jogo —
//  o PlayCanvas nunca altera as regras.
//
//  Sem o pacote instalado, o visualizador 3D simplesmente não
//  aparece e o minimapa 2D continua sendo usado.
// ═══════════════════════════════════════════════════════════════

import { loadOptionalEngine } from "./optionalEngines";

export type PlayCanvasLoadStatus = "idle" | "loading" | "ready" | "unavailable" | "error";

export interface PlayCanvasIntegrationState {
  status: PlayCanvasLoadStatus;
  active: boolean;
  rendererName: string;
  reason: string;
}

/** A tile of the world, prepared for the 3D view. */
export interface TerrainTile {
  x: number;
  y: number;
  kind: string;
  /** Height in world units. */
  height: number;
}

export interface PlayCanvasWorldOptions {
  /** Base URL of the PlayCanvas engine bundle (ESM). */
  engineUrl?: string;
  /** Application id on the PlayCanvas cloud editor (optional). */
  appId?: string;
}

/**
 * Manages the optional PlayCanvas layer.
 */
export class PlayCanvasIntegration {
  private pc: any = null;
  private app: any = null;
  private loadPromise: Promise<boolean> | null = null;

  private _state: PlayCanvasIntegrationState = {
    status: "idle",
    active: false,
    rendererName: "",
    reason: "",
  };

  private options: PlayCanvasWorldOptions;

  constructor(private canvas: HTMLCanvasElement, options: PlayCanvasWorldOptions = {}) {
    this.options = options;
  }

  get state(): PlayCanvasIntegrationState {
    return { ...this._state };
  }

  get active(): boolean {
    return this._state.active && !!this.app;
  }

  /**
   * Try to enable the PlayCanvas layer.
   * Resolves to false (never throws) when the engine is missing.
   */
  async enable(): Promise<boolean> {
    if (this._state.status === "ready" && this.app) return true;
    if (this.loadPromise) return this.loadPromise;
    this._state.status = "loading";
    this.loadPromise = this.doEnable();
    return this.loadPromise;
  }

  private async doEnable(): Promise<boolean> {
    let mod: any;
    try {
      mod = await loadOptionalEngine("playcanvas");
    } catch (err: any) {
      this._state = {
        status: "unavailable",
        active: false,
        rendererName: "",
        reason:
          "Runtime do PlayCanvas não está disponível neste projeto — o minimapa continua " +
          "sendo desenhado em 2D, com a mesma informação.",
      };
      return false;
    }

    this.pc = mod.default ?? mod;

    try {
      const pc = this.pc;
      const gfx = pc.GraphicsDevice ?? pc.WebglGraphicsDevice ?? pc.WebgpuGraphicsDevice;

      // Prefer WebGPU, fall back to WebGL2.
      const device = gfx
        ? new gfx(this.canvas, {
            deviceTypes: ["webgpu", "webgl2"],
            antialias: false,
            alpha: false,
            depth: true,
            powerPreference: "high-performance",
          })
        : null;

      if (!device) throw new Error("Não foi possível criar o dispositivo gráfico.");

      const createOptions = new pc.AppOptions();
      createOptions.graphicsDevice = device;
      // The cloud-editor app id is optional; when present the editor
      // can bootstrap the project assets from the PlayCanvas CDN.
      if (this.options.appId) {
        (createOptions as any).appId = this.options.appId;
      }
      createOptions.componentSystems = [pc.RenderComponentSystem, pc.CameraComponentSystem, pc.LightComponentSystem];
      createOptions.resourceHandlers = [];

      const app = new pc.AppBase(this.canvas);
      app.init(createOptions);
      app.setCanvasFillMode(pc.FILLMODE_NONE);
      app.setCanvasResolution(pc.RESOLUTION_AUTO);
      app.start();

      this.app = app;
      this._state = {
        status: "ready",
        active: true,
        rendererName: device.isWebGPU ? "WebGPU" : "WebGL2",
        reason: "",
      };
      return true;
    } catch (err: any) {
      this._state = {
        status: "error",
        active: false,
        rendererName: "",
        reason: `Falha ao inicializar o PlayCanvas: ${err?.message ?? "erro desconhecido"}`,
      };
      this.app = null;
      return false;
    }
  }

  /**
   * Build a simple height-map terrain from the world tiles.
   * Only the tiles inside the given bounds are created.
   */
  buildTerrain(tiles: TerrainTile[], tileSize = 42): void {
    if (!this.active || !this.pc) return;
    const pc = this.pc;

    try {
      const root = new pc.Entity("terrain-root");
      this.app.root.addChild(root);

      for (const tile of tiles) {
        const entity = new pc.Entity(`tile-${tile.x}-${tile.y}`);
        const render = entity.addComponent("render", {
          type: "box",
          material: this.getMaterial(tile.kind),
        });
        render.castShadows = false;
        render.receiveShadows = false;
        entity.setLocalScale(tileSize, tile.height, tileSize);
        entity.setLocalPosition(tile.x * tileSize, tile.height / 2, tile.y * tileSize);
        root.addChild(entity);
      }
    } catch (err) {
      this._state = {
        ...this._state,
        reason: `Não foi possível construir o terreno 3D: ${(err as Error)?.message ?? "erro"}`,
      };
    }
  }

  /** Create (or reuse) a simple coloured material for a tile kind. */
  private getMaterial(kind: string): any {
    const pc = this.pc;
    if (!this._materials) this._materials = new Map();
    const cached = this._materials.get(kind);
    if (cached) return cached;

    const colors: Record<string, [number, number, number]> = {
      grass: [0.15, 0.2, 0.13],
      forest: [0.09, 0.14, 0.09],
      road: [0.14, 0.14, 0.14],
      house: [0.23, 0.2, 0.17],
      fence: [0.3, 0.25, 0.2],
      ruin: [0.16, 0.15, 0.12],
      water: [0.1, 0.15, 0.21],
      debris: [0.18, 0.18, 0.13],
      rubble: [0.23, 0.19, 0.16],
      bunker: [0.12, 0.15, 0.12],
      park: [0.16, 0.22, 0.16],
    };
    const [r, g, b] = colors[kind] ?? [0.15, 0.15, 0.15];

    const material = new pc.StandardMaterial();
    material.diffuse = new pc.Color(r, g, b);
    material.useMetalness = true;
    material.metalness = 0;
    material.gloss = 0.2;
    material.update();

    this._materials.set(kind, material);
    return material;
  }

  private _materials: Map<string, any> | null = null;

  /** Resize the 3D canvas. */
  resize(width: number, height: number): void {
    try {
      this.app?.resizeCanvas(width, height);
    } catch { /* ignore */ }
  }

  /** Release every resource. */
  destroy(): void {
    try {
      this.app?.destroy();
    } catch { /* ignore */ }
    this.app = null;
    this.pc = null;
    this._materials?.clear();
    this._materials = null;
    this._state = { status: "idle", active: false, rendererName: "", reason: "" };
  }
}
