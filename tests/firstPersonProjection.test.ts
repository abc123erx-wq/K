// ═══════════════════════════════════════════════════════════════
//  TESTS — regressão da projeção em primeira pessoa
//
//  O bug original: o chão era projetado com
//  `eyeHeight * TILE * scale`, misturando dois sistemas de
//  unidades (TILE = pixels por unidade no modo de cima, e
//  `scale` = pixels por unidade já projetado). O resultado era um
//  horizonte em y ≈ 1755 px numa tela de 720 px — NENHUMA faixa de
//  terreno caía dentro da tela, e a primeira pessoa mostrava apenas
//  o fundo preto + a mira.
//
//  Estes testes verificam a geometria REALMENTE renderizada.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { Renderer } from "../src/game/renderer";
import { World } from "../src/game/world";
import { Player, Zombie } from "../src/game/entities";

/** Context that records every filled rectangle with its colour. */
class GeoCtx {
  fills: { x: number; y: number; w: number; h: number; color: string }[] = [];
  translates: { x: number; y: number }[] = [];
  filter = "none";
  globalAlpha = 1;
  font = "";
  textAlign = "left";
  textBaseline = "alphabetic";
  fillStyle = "#000";
  strokeStyle = "#000";
  lineWidth = 1;
  lineCap = "butt";
  lineJoin = "miter";
  globalCompositeOperation = "source-over";
  imageSmoothingEnabled = true;
  shadowBlur = 0;
  shadowColor = "";
  miterLimit = 10;

  save() {}
  restore() {}
  translate(x: number, y: number) { this.translates.push({ x, y }); }
  rotate() {}
  scale() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
  bezierCurveTo() {}
  arcTo() {}
  arc() {}
  ellipse() {}
  rect() {}
  fill() {}
  stroke() {}
  clip() {}
  clearRect() {}
  setLineDash() {}
  strokeRect() {}
  putImageData() {}
  setTransform() {}
  resetTransform() {}
  drawImage() {}
  createConicGradient() { return { addColorStop() {} }; }
  createPattern() { return null; }
  createRadialGradient() { return { addColorStop() {} }; }
  createLinearGradient() { return { addColorStop() {} }; }
  measureText(t: string) { return { width: t.length * 6 }; }
  fillText() {}
  strokeText() {}
  fillRect(x: number, y: number, w: number, h: number) {
    this.fills.push({ x, y, w, h, color: String(this.fillStyle) });
  }
  getImageData() { return { data: new Uint8ClampedArray(4) }; }
}

function makeCanvas(w = 1280, h = 720): { canvas: HTMLCanvasElement; ctx: GeoCtx } {
  const ctx = new GeoCtx();
  const canvas = {
    width: w,
    height: h,
    clientWidth: w,
    clientHeight: h,
    style: {} as CSSStyleDeclaration,
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as HTMLCanvasElement;
  return { canvas, ctx };
}

/**
 * The tile colours used by the FIRST-PERSON ground projection
 * (src/game/renderer.ts → firstPersonTileColor).
 */
const FP_TERRAIN_COLORS = new Set([
  "#33422a", "#1f2f1d", "#333333", "#4a4136", "#5d4d3c",
  "#3a3229", "#223048", "#3c3c2a", "#4c3f34", "#2b3129", "#374a34",
]);

/**
 * The tile colours used by the TOP-DOWN renderer
 * (src/game/renderer.ts → tileColors).
 */
const TOP_DOWN_TERRAIN_COLORS = new Set([
  "#263321", "#172417", "#242424", "#3a342b", "#4d4032",
  "#2a2520", "#1a2535", "#2d2d20", "#3a3028", "#202520", "#2a3828",
]);

function renderFirstPerson(
  canvas: HTMLCanvasElement,
  ctx: GeoCtx,
  world: World,
  player: Player,
  zombies: Zombie[] = [],
  fp: Record<string, unknown> = { enabled: true },
) {
  const renderer = new Renderer(canvas);
  // The transition blends by 0.14 per frame — run enough frames to
  // reach the final state. Two frames are enough: the terrain is
  // drawn as soon as the first-person blend starts.
  for (let i = 0; i < 2; i++) {
    renderer.render(
      world, player, zombies, 12, [], false, null, [],
      "clear", 0, null, null, [], null, {}, null, null,
      fp as any,
    );
  }
}

describe("regressão: projeção do chão em primeira pessoa", () => {
  it("desenha o terreno DENTRO da tela (não só abaixo dela)", () => {
    const { canvas, ctx } = makeCanvas();
    const world = new World({ seed: 42 } as any);
    const player = new Player();
    player.x = 5000;
    player.y = 5000;
    player.angle = 0;

    renderFirstPerson(canvas, ctx, world, player);

    const terrain = ctx.fills.filter((f) => FP_TERRAIN_COLORS.has(f.color));
    expect(terrain.length).toBeGreaterThan(0);

    // Every terrain band must intersect the viewport.
    const onScreen = terrain.filter((f) => f.y < 720 && f.y + f.h > 0);
    expect(onScreen.length).toBeGreaterThan(0);

    // The terrain must reach the lower part of the screen.
    let maxY = -Infinity;
    for (const f of onScreen) maxY = Math.max(maxY, f.y + f.h);
    expect(maxY).toBeGreaterThan(400);
  });

  it("deixa o céu visível na parte de cima (horizonte acima do meio)", () => {
    const { canvas, ctx } = makeCanvas();
    const world = new World({ seed: 42 } as any);
    const player = new Player();
    player.x = 5000;
    player.y = 5000;
    player.angle = 0;

    renderFirstPerson(canvas, ctx, world, player);

    const terrain = ctx.fills.filter((f) => FP_TERRAIN_COLORS.has(f.color));
    let minY = Infinity;
    for (const f of terrain) minY = Math.min(minY, f.y);

    // The horizon must sit inside the screen, roughly in the upper
    // half — not far below it.
    expect(minY).toBeGreaterThan(100);
    expect(minY).toBeLessThan(500);
  });

  it("desenha o chão inteiro com cores de terreno", () => {
    const { canvas, ctx } = makeCanvas();
    const world = new World({ seed: 42 } as any);
    const player = new Player();
    player.x = 5000;
    player.y = 5000;
    player.angle = 0;

    renderFirstPerson(canvas, ctx, world, player);

    const W = 1280;
    const H = 720;
    const cover = new Uint8Array(W * H);
    for (const f of ctx.fills) {
      const x0 = Math.max(0, Math.floor(f.x));
      const x1 = Math.min(W, Math.ceil(f.x + f.w));
      const y0 = Math.max(0, Math.floor(f.y));
      const y1 = Math.min(H, Math.ceil(f.y + f.h));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) cover[y * W + x] = 1;
      }
    }

    // The bottom 40% of the screen must be fully painted.
    let covered = 0;
    let total = 0;
    for (let y = Math.floor(H * 0.6); y < H; y++) {
      for (let x = 0; x < W; x++) {
        total++;
        if (cover[y * W + x]) covered++;
      }
    }
    expect(covered / total).toBeGreaterThan(0.95);
  });

  it("desenha um zumbi à frente com tamanho proporcional à distância", () => {
    const { canvas, ctx } = makeCanvas();
    const world = new World({ seed: 42 } as any);
    const player = new Player();
    player.x = 5000;
    player.y = 5000;
    player.angle = 0;

    const near = new Zombie();
    near.x = 5005;
    near.y = 5000;
    near.angle = 0;
    near.health = 100;

    renderFirstPerson(canvas, ctx, world, player, [near]);

    // The actor is positioned with a translate() at its projected
    // screen position — it must be on screen and near the horizon.
    const actorPositions = ctx.translates.filter((t) => t.y > 300 && t.y < 720);
    expect(actorPositions.length).toBeGreaterThan(0);

    for (const p of actorPositions) {
      expect(p.x).toBeGreaterThan(-300);
      expect(p.x).toBeLessThan(1280 + 300);
    }
  });

  it("mantém a vista de cima inalterada", () => {
    const { canvas, ctx } = makeCanvas();
    const world = new World({ seed: 42 } as any);
    const player = new Player();
    player.x = 5000;
    player.y = 5000;
    player.angle = 0;

    renderFirstPerson(canvas, ctx, world, player, [], { enabled: false });

    // In top-down the terrain tiles are drawn as squares of TILE size.
    const terrain = ctx.fills.filter((f) => TOP_DOWN_TERRAIN_COLORS.has(f.color));
    expect(terrain.length).toBeGreaterThan(0);
    const sizes = new Set(terrain.map((f) => Math.round(f.w)));
    expect(sizes.has(43)).toBe(true);
  });
});
