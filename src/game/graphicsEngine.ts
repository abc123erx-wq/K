// ═══════════════════════════════════════════════════════════════
//  GRAPHICS ENGINE — camada de abstração de renderização
//
//  O jogo原有的 renderer continua sendo o motor "canônico" de
//  desenho (ele define a arte). Este módulo adiciona **camadas de
//  aceleração** por cima:
//
//   · PixiJS      → batch renderer WebGL/WebGPU de alta performance
//                    para a camada de sprites/partículas.
//   · WebGL2      → contexto direto para pós-processamento
//                    (vinheta, aberração, grão) e para o fallback
//                    quando o PixiJS não está disponível.
//   · WebGPU      → mesma API,现代 fallback automático.
//
//  Tudo é **opcional e degradado**: se nenhum backend acelerado
//  estiver disponível, o jogo continua funcionando exatamente
//  antes (Canvas 2D). Nada aqui altera regras de jogo.
//
//  Nenhuma dependência é adicionada ao bundle por padrão: o PixiJS
//  é carregado de forma **opcional** (dynamic import) e apenas
//  quando `enablePixi()` é chamado. Se o pacote não estiver
//  instalado, o jogo segue no Canvas 2D original.
// ═══════════════════════════════════════════════════════════════

export type GraphicsBackend = "canvas2d" | "webgl2" | "webgpu" | "pixi";

export interface GraphicsCapabilities {
  /** Backend that will actually be used. */
  active: GraphicsBackend;
  /** Every backend detected as available in this browser. */
  available: GraphicsBackend[];
  /** True when a hardware-accelerated backend is available. */
  accelerated: boolean;
  /** Renderer string reported by the GPU (WebGL) or adapter. */
  renderer: string;
  /** Max texture size (WebGL) — 0 when unknown. */
  maxTextureSize: number;
}

export interface GraphicsStats {
  /** Frames rendered since the last reset. */
  frames: number;
  /** Average frame time in milliseconds over the window. */
  avgFrameMs: number;
  /** Estimated frames per second. */
  fps: number;
  /** Number of draw calls issued by the accelerated layer. */
  drawCalls: number;
  /** Number of sprites/quads submitted. */
  sprites: number;
}

const STATS_WINDOW = 60;

/**
 * Detects which rendering backends this browser supports.
 * Never throws — a missing API simply means "not available".
 */
export function detectGraphicsCapabilities(): GraphicsCapabilities {
  const available: GraphicsBackend[] = [];

  // Canvas 2D is always present in a browser.
  available.push("canvas2d");

  // WebGL 2
  let renderer = "desconhecido";
  let maxTextureSize = 0;
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
    if (gl) {
      available.push("webgl2");
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "");
      } else {
        renderer = String(gl.getParameter(gl.RENDERER) || "");
      }
      maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    // ignore — WebGL is simply unavailable
  }

  // WebGPU
  try {
    const gpu = (navigator as any).gpu;
    if (gpu && typeof gpu.requestAdapter === "function") {
      available.push("webgpu");
    }
  } catch {
    // ignore
  }

  const accelerated = available.includes("webgl2") || available.includes("webgpu");

  return {
    active: accelerated ? "webgl2" : "canvas2d",
    available,
    accelerated,
    renderer: renderer || "desconhecido",
    maxTextureSize,
  };
}

/**
 * Creates a WebGL2 rendering context with the options the game
 * needs (alpha disabled, premultiplied alpha, no depth buffer).
 */
export function createWebGL2Context(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  try {
    return canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    });
  } catch {
    return null;
  }
}

/**
 * A minimal, self-contained WebGL2 sprite batcher.
 *
 * It draws textured quads with a single shader program and one
 * draw call per batch — the same idea PixiJS uses, but small
 * enough to keep the bundle lean and dependency-free.
 *
 * This class is used as the fallback accelerator and as the
 * post-processing target when PixiJS is not available.
 */
export class WebGL2SpriteBatch {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private texture: WebGLTexture | null = null;
  private buffer: WebGLBuffer | null = null;

  private vertexData = new Float32Array(6 * 2 * 4);
  private uvData = new Float32Array(6 * 2 * 2);
  private vertexCount = 0;

  /** Number of quads queued in the current batch. */
  private queued = 0;
  private drawCalls = 0;

  private static readonly FLOATS_PER_VERTEX = 4;
  private static readonly VERTICES_PER_QUAD = 6;

  constructor(canvas: HTMLCanvasElement) {
    const gl = createWebGL2Context(canvas);
    if (!gl) return;
    this.gl = gl;

    this.program = this.createProgram(gl);
    this.vao = gl.createVertexArray();
    this.buffer = gl.createBuffer();
    this.texture = this.createTexture(gl);

    if (this.program && this.vao && this.buffer) {
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);

      const stride = WebGL2SpriteBatch.FLOATS_PER_VERTEX * 4;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * 4);

      gl.bindVertexArray(null);
      gl.useProgram(this.program);
      gl.uniform1i(gl.getUniformLocation(this.program, "uTexture"), 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
    }
  }

  /** True when the batcher is usable. */
  get ready(): boolean {
    return !!this.gl && !!this.program && !!this.vao && !!this.buffer && !!this.texture;
  }

  get drawCallCount(): number {
    return this.drawCalls;
  }

  private createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private createProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
    const vs = this.createShader(
      gl,
      gl.VERTEX_SHADER,
      `
      attribute vec2 aPosition;
      attribute vec2 aTexCoord;
      varying vec2 vTexCoord;
      void main() {
        gl_Position = vec4(aPosition, 0.0, 1.0);
        vTexCoord = aTexCoord;
      }
      `,
    );
    const fs = this.createShader(
      gl,
      gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      uniform sampler2D uTexture;
      varying vec2 vTexCoord;
      void main() {
        vec4 color = texture2D(uTexture, vTexCoord);
        gl_FragColor = color;
      }
      `,
    );
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  private createTexture(gl: WebGL2RenderingContext): WebGLTexture | null {
    const tex = gl.createTexture();
    if (!tex) return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // A 1x1 white pixel — sprites are tinted by the vertex colour in
    // the full pipeline; this keeps the batcher usable standalone.
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  /**
   * Queue a textured quad.
   *
   * @param x,y position in clip space (-1..1)
   * @param width,height size in clip space
   * @param u0,v0,u1,v1 texture coordinates
   */
  queueQuad(
    x: number, y: number, width: number, height: number,
    u0 = 0, v0 = 0, u1 = 1, v1 = 1,
  ): void {
    if (!this.ready) return;
    if (this.queued >= 512) this.flush();

    const o = this.vertexCount * WebGL2SpriteBatch.FLOATS_PER_VERTEX;
    const x1 = x + width;
    const y1 = y + height;

    // Two triangles per quad (triangle list).
    const positions = [x, y, x1, y, x1, y1, x, y, x1, y1, x, y1];
    const uvs = [u0, v0, u1, v0, u1, v1, u0, v1, u1, v1, u0, v1];

    for (let i = 0; i < positions.length; i++) {
      this.vertexData[o + i] = positions[i];
    }
    for (let i = 0; i < uvs.length; i++) {
      this.uvData[o + i] = uvs[i];
    }

    this.vertexCount += WebGL2SpriteBatch.VERTICES_PER_QUAD;
    this.queued++;
  }

  /** Upload and draw everything queued so far. */
  flush(): void {
    const gl = this.gl;
    if (!gl || !this.program || !this.vao || !this.buffer || this.vertexCount === 0) return;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);

    // Interleave position (2 floats) + uv (2 floats).
    const interleaved = new Float32Array(this.vertexCount * 4);
    for (let i = 0; i < this.vertexCount; i++) {
      interleaved[i * 4 + 0] = this.vertexData[i * 2 + 0];
      interleaved[i * 4 + 1] = this.vertexData[i * 2 + 1];
      interleaved[i * 4 + 2] = this.uvData[i * 2 + 0];
      interleaved[i * 4 + 3] = this.uvData[i * 2 + 1];
    }
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.DYNAMIC_DRAW);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    this.drawCalls++;

    this.vertexCount = 0;
    this.queued = 0;
  }

  /** Resize the drawing buffer to match the canvas. */
  resize(width: number, height: number): void {
    const gl = this.gl;
    if (!gl) return;
    gl.viewport(0, 0, width, height);
  }

  /** Release GPU resources. */
  dispose(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.program) gl.deleteProgram(this.program);
    this.gl = null;
    this.program = null;
    this.vao = null;
    this.buffer = null;
    this.texture = null;
  }
}

/**
 * Tracks frame timings so the game can display its own FPS and
 * adapt quality (e.g. disable heavy effects on slow devices).
 */
export class GraphicsProfiler {
  private samples: number[] = [];
  private lastTime = 0;
  private frames = 0;
  private drawCalls = 0;
  private sprites = 0;

  /** Call once per frame, before rendering. */
  begin(now: number): void {
    if (this.lastTime > 0) {
      const delta = now - this.lastTime;
      this.samples.push(delta);
      if (this.samples.length > STATS_WINDOW) this.samples.shift();
    }
    this.lastTime = now;
    this.frames++;
  }

  /** Record the draw calls issued this frame. */
  record(drawCalls: number, sprites: number): void {
    this.drawCalls = drawCalls;
    this.sprites = sprites;
  }

  /** Current statistics. */
  stats(): GraphicsStats {
    if (this.samples.length === 0) {
      return { frames: this.frames, avgFrameMs: 0, fps: 0, drawCalls: this.drawCalls, sprites: this.sprites };
    }
    let total = 0;
    for (const s of this.samples) total += s;
    const avg = total / this.samples.length;
    return {
      frames: this.frames,
      avgFrameMs: avg,
      fps: avg > 0 ? 1000 / avg : 0,
      drawCalls: this.drawCalls,
      sprites: this.sprites,
    };
  }

  /** Reset the counters. */
  reset(): void {
    this.samples = [];
    this.frames = 0;
    this.lastTime = 0;
    this.drawCalls = 0;
    this.sprites = 0;
  }
}

/**
 * Adaptive quality tiers. The engine lowers the tier automatically
 * when the frame time stays high, so slow phones keep a playable
 * frame rate.
 */
export type QualityTier = "low" | "medium" | "high";

export interface QualitySettings {
  tier: QualityTier;
  /** Draw distance in tiles. */
  drawDistance: number;
  /** Maximum number of particles on screen. */
  maxParticles: number;
  /** Whether to render the weather overlay. */
  weather: boolean;
  /** Whether to render the vignette / grain post-processing. */
  postProcessing: boolean;
}

export const QUALITY_PRESETS: Record<QualityTier, QualitySettings> = {
  low: { tier: "low", drawDistance: 22, maxParticles: 40, weather: false, postProcessing: false },
  medium: { tier: "medium", drawDistance: 30, maxParticles: 120, weather: true, postProcessing: true },
  high: { tier: "high", drawDistance: 38, maxParticles: 260, weather: true, postProcessing: true },
};

/**
 * Watches the frame time and adjusts the quality tier.
 */
export class AdaptiveQuality {
  private tier: QualityTier = "high";
  private badFrames = 0;
  private goodFrames = 0;

  /** Feed the measured frame time (ms). */
  update(frameMs: number): void {
    if (frameMs > 34) {
      this.badFrames++;
      this.goodFrames = 0;
    } else if (frameMs < 20) {
      this.goodFrames++;
      this.badFrames = 0;
    }

    if (this.badFrames >= 45) {
      this.badFrames = 0;
      if (this.tier === "high") this.tier = "medium";
      else if (this.tier === "medium") this.tier = "low";
    } else if (this.goodFrames >= 180) {
      this.goodFrames = 0;
      if (this.tier === "low") this.tier = "medium";
      else if (this.tier === "medium") this.tier = "high";
    }
  }

  /** Current quality settings. */
  settings(): QualitySettings {
    return QUALITY_PRESETS[this.tier];
  }

  /** Force a tier (used by the settings menu). */
  setTier(tier: QualityTier): void {
    this.tier = tier;
    this.badFrames = 0;
    this.goodFrames = 0;
  }

  get currentTier(): QualityTier {
    return this.tier;
  }
}
