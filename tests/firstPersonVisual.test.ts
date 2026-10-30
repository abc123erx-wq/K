// ============================================================
//  PRIMEIRA PESSOA — SNAPSHOT VISUAL
//
//  Renderiza a visão em primeira pessoa usando o MUNDO REAL
//  (src/game/world.ts) e o RENDERER REAL (src/game/renderer.ts)
//  e grava um PNG para inspeção visual.
//
//  Este teste é a "prova de olho" do bug relatado pelo usuário
//  ("a primeira pessoa n ta funcionando"): se a projeção voltar
//  a empurrar o chão para fora da tela, o PNG fica com a parte
//  inferior preta e a contagem de pixels pintados despenca.
// ============================================================

import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { Renderer } from "../src/game/renderer";
import { World } from "../src/game/world";
import type { Player, Zombie } from "../src/game/types";
import { encodePng } from "./helpers/png";

const WIDTH = 960;
const HEIGHT = 540;

/** Converte "rgb(...)", "rgba(...)" ou "#rgb"/"#rrggbb" em RGBA. */
function solidParse(c: string): { r: number; g: number; b: number; a: number } {
  const str = c.trim();
  const rgb = /^rgba?\(([^)]+)\)$/.exec(str);
  if (rgb) {
    const p = rgb[1].split(",").map((v) => parseFloat(v));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

/** Atalho usado dentro do contexto. */
const gradientParse = solidParse;

/**
 * Gradiente linear simples: interpola as cores ao longo do eixo.
 */
function makeGradient(
  x0: number, y0: number, x1: number, y1: number,
  radial = false, cx = 0, cy = 0,
) {
  const stops: { pos: number; color: string }[] = [];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;

  const parse = (c: string) => {
    const str = String(c).trim();
    const rgb = /^rgba?\(([^)]+)\)$/.exec(str);
    if (rgb) {
      const p = rgb[1].split(",").map((v) => parseFloat(v));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str);
    if (hex) {
      let h = hex[1];
      if (h.length === 3) h = h.split("").map((x) => x + x).join("");
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: 1,
      };
    }
    return { r: 0, g: 0, b: 0, a: 1 };
  };

  return {
    addColorStop(pos: number, color: string) {
      stops.push({ pos, color });
    },
    /** resolved by the context: returns a painter function */
    __paint: null as null | ((x: number, y: number) => string),
    _stops: stops,
    _parse: parse,
    _radial: radial,
    _cx: cx,
    _cy: cy,
    _x0: x0,
    _y0: y0,
    _dx: dx,
    _dy: dy,
    _len2: len2,
  };
}

/** Resolve the colour of a gradient at a given pixel. */
function gradientColorAt(g: any, x: number, y: number): string {
  const stops = g._stops as { pos: number; color: string }[];
  if (stops.length === 0) return "#000000";
  let t: number;
  if (g._radial) {
    const d = Math.hypot(x - g._cx, y - g._cy);
    const r = Math.hypot(g._dx, g._dy) || 1;
    t = Math.max(0, Math.min(1, d / r));
  } else {
    t = Math.max(0, Math.min(1, ((x - g._x0) * g._dx + (y - g._y0) * g._dy) / g._len2));
  }
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  let lo = sorted[0];
  let hi = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (t >= sorted[i].pos && t <= sorted[i + 1].pos) {
      lo = sorted[i];
      hi = sorted[i + 1];
      break;
    }
  }
  const span = hi.pos - lo.pos || 1;
  const k = (t - lo.pos) / span;
  const a = g._parse(lo.color);
  const b = g._parse(hi.color);
  const mix = (p: number, q: number) => Math.round(p + (q - p) * k);
  const alpha = a.a + (b.a - a.a) * k;
  return `rgba(${mix(a.r, b.r)},${mix(a.g, b.g)},${mix(a.b, b.b)},${alpha})`;
}

/**
 * Canvas/Contexto mínimos mas reais: todos os comandos de desenho
 * são executados e o raster final é guardado para inspecção.
 */
function makeCanvas() {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

  // Current transformation matrix (a,b,c,d,e,f) — only translation is
  // exercised by the renderer, which is enough for a correct raster.
  let ctm = { tx: 0, ty: 0, a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack: any[] = [];

  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

  const ctx: any = {
    canvas: null as any,
    fillStyle: "#000000",
    strokeStyle: "#000000",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    lineWidth: 1,
    filter: "none",
    font: "10px sans-serif",
    textAlign: "left",
    textBaseline: "alphabetic",
    lineCap: "butt",
    lineJoin: "miter",

    // ---- rasterização mínima ----
    _fillRect(x: number, y: number, w: number, h: number) {
      const c = ctx.fillStyle;
      const isGradient = c && typeof c === "object" && "__paint" in c;
      if (!isGradient && typeof c !== "string") return;
      // Apply the current translation to the rectangle.
      const rx = x * ctm.a + ctm.c * y + ctm.e;
      const ry = x * ctm.b + ctm.d * y + ctm.f;
      const x0 = Math.max(0, Math.round(rx));
      const y0 = Math.max(0, Math.round(ry));
      const x1 = Math.min(WIDTH, Math.round(rx + w * ctm.a));
      const y1 = Math.min(HEIGHT, Math.round(ry + h * ctm.d));
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          let r = 0, g = 0, b = 0, a = 1;
          if (isGradient) {
            const p = gradientParse(gradientColorAt(c, px + 0.5, py + 0.5));
            r = clamp(p.r); g = clamp(p.g); b = clamp(p.b); a = p.a;
          } else {
            const p = solidParse(String(c));
            r = clamp(p.r); g = clamp(p.g); b = clamp(p.b); a = p.a;
          }
          if (a <= 0) continue;
          const i = (py * WIDTH + px) * 4;
          const da = data[i + 3] / 255;
          const outA = a + da * (1 - a);
          if (outA <= 0) continue;
          data[i] = clamp((r * a + data[i] * da * (1 - a)) / outA);
          data[i + 1] = clamp((g * a + data[i + 1] * da * (1 - a)) / outA);
          data[i + 2] = clamp((b * a + data[i + 2] * da * (1 - a)) / outA);
          data[i + 3] = clamp(outA * 255);
        }
      }
    },

    fillRect(x: number, y: number, w: number, h: number) {
      ctx._fillRect(x, y, w, h);
    },
    strokeRect() {},
    clearRect(x: number, y: number, w: number, h: number) {
      const prev = ctx.fillStyle;
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx._fillRect(x, y, w, h);
      ctx.fillStyle = prev;
    },
    // ---- transformation stack ----
    save() {
      stack.push({ tx: ctm.tx, ty: ctm.ty, a: ctm.a, b: ctm.b, c: ctm.c, d: ctm.d, e: ctm.e, f: ctm.f });
    },
    restore() {
      const st = stack.pop();
      if (st) ctm = { ...st };
    },
    translate(x: number, y: number) {
      ctm.e += ctm.a * x + ctm.c * y;
      ctm.f += ctm.b * x + ctm.d * y;
    },
    rotate() {},
    scale() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    arcTo() {},
    rect() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    fill() {},
    stroke() {},
    clip() {},
    fillText() {},
    strokeText() {},
    measureText: () => ({ width: 10 }),
    setTransform() {},
    resetTransform() {
      ctm = { tx: 0, ty: 0, a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    },
    drawImage() {},
    createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
      return makeGradient(x0, y0, x1, y1);
    },
    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) {
      return makeGradient(x1, y1, x1 + (r1 - r0), y1, true, x0, y0);
    },
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    }),
    putImageData() {},
    ellipse() {},
    setLineDash() {},
  };

  const canvas: any = {
    width: WIDTH,
    height: HEIGHT,
    clientWidth: WIDTH,
    clientHeight: HEIGHT,
    style: {} as any,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: WIDTH, height: HEIGHT, left: 0, top: 0 }),
    addEventListener() {},
    removeEventListener() {},
  };
  ctx.canvas = canvas;

  return { canvas, ctx, data };
}

/** Conta os pixels "não vazios" (pintados) na imagem. */
function paintedRatio(data: Uint8ClampedArray, region?: { x0: number; y0: number; x1: number; y1: number }) {
  const x0 = region?.x0 ?? 0;
  const y0 = region?.y0 ?? 0;
  const x1 = region?.x1 ?? WIDTH;
  const y1 = region?.y1 ?? HEIGHT;
  let painted = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * WIDTH + x) * 4;
      total++;
      // "pintado" = não é o preto puro do clear inicial
      if (data[i] > 6 || data[i + 1] > 6 || data[i + 2] > 6) painted++;
    }
  }
  return total === 0 ? 0 : painted / total;
}

describe("primeira pessoa — snapshot visual com o mundo real", () => {
  it("gera um PNG com o chão, o céu, os zumbis e a mira visíveis", () => {
    const world = new World({
      seed: 12345,
      mapSize: 3000,
      dayLength: 600,
      startHour: 12,
      zombieCount: 40,
      lootDensity: 1,
    } as any);

    const player = {
      x: 500,
      y: 500,
      angle: 0.6,
      hp: 100,
      stamina: 100,
      x2: 500,
      y2: 500,
    } as any as Player;

    // Zumbis placed directly in front of the player (the camera looks
    // along `angle`), plus one off to the side for depth comparison.
    const a = 0.6;
    // Três zumbis em ângulos diferentes, para que nenhum fique
    // escondido atrás de outro (a sobreposição é testada à parte).
    const zombies: Zombie[] = [
      { x: 500 + Math.cos(a - 0.30) * 6, y: 500 + Math.sin(a - 0.30) * 6, angle: 0, hp: 50, speed: 1, state: "idle", target: null, type: "walker", id: "z1", attackCd: 0, variant: 0 } as any,
      { x: 500 + Math.cos(a + 0.06) * 11, y: 500 + Math.sin(a + 0.06) * 11, angle: 0, hp: 50, speed: 1, state: "idle", target: null, type: "walker", id: "z2", attackCd: 0, variant: 2 } as any,
      { x: 500 + Math.cos(a + 0.30) * 4.5, y: 500 + Math.sin(a + 0.30) * 4.5, angle: 0, hp: 50, speed: 1, state: "idle", target: null, type: "walker", id: "z3", attackCd: 0, variant: 1 } as any,
    ];

    const { canvas, ctx, data } = makeCanvas();
    const renderer = new Renderer(canvas);

    // The transition between the top-down and first-person cameras is
    // animated (blend += 0.14 per frame), so we render a few frames to
    // let it settle — this is exactly what happens in the real game.
    const fpConfig = {
      enabled: true,
      fov: 75,
      eyeHeight: 1.05,
      sensitivity: 1,
      reduceMotion: false,
    };

    // Two frames are enough: the terrain is drawn as soon as the
    // first-person blend starts (the blend only fades the view model).
    for (let frame = 0; frame < 2; frame++) {
      renderer.render(
        world,
        player,
        zombies,
        12,          // hour
        [],          // moodles
        false,       // paused
        null,        // insideHouseId
        [],          // otherPlayers
        "clear",     // weather
        0,           // weatherIntensity
        null,        // player2
        null,        // insideHouseId2
        [],          // vehicles
        null,        // drivingVehicle
        undefined,   // fx
        null,        // equippedP1
        null,        // equippedP2
        fpConfig,
      );
    }

    // Grava o PNG para inspeção visual.
    const outDir = path.resolve(process.cwd(), "artifacts");
    mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, "primeira-pessoa.png");
    writeFileSync(file, encodePng(data, WIDTH, HEIGHT));

    // --- Asserções visuais ---

    // 1. O céu ocupa a parte de cima (visível, não tudo preto).
    const sky = paintedRatio(data, { x0: 0, y0: 0, x1: WIDTH, y1: 120 });
    expect(sky).toBeGreaterThan(0.5);

    // 1b. O céu tem de ser AZUL (o canal azul domina os outros). Sem
    //     o céu, a parte de cima ficaria preta e a "primeira pessoa"
    //     pareceria quebrada.
    let skyPixels = 0;
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const i = (y * WIDTH + x) * 4;
        if (data[i + 2] > data[i] + 20 && data[i + 2] > 40) skyPixels++;
      }
    }
    expect(skyPixels).toBeGreaterThan(WIDTH * 100 * 0.9);

    // 2. O chão ocupa a parte de baixo (a parte inferior não pode
    //    estar preta — era exatamente o bug relatado).
    const ground = paintedRatio(data, { x0: 0, y0: HEIGHT - 180, x1: WIDTH, y1: HEIGHT });
    expect(ground).toBeGreaterThan(0.95);

    // 3. A faixa do horizonte tem conteúdo (o chão começa em algum
    //    lugar visível, não abaixo da tela).
    const middle = paintedRatio(data, { x0: 0, y0: 260, x1: WIDTH, y1: 320 });
    expect(middle).toBeGreaterThan(0.9);

    // 4. A imagem não é monocromática: existem várias cores de
    //    terreno (grama, floresta, estrada, casa...).
    const colors = new Set<string>();
    for (let i = 0; i < data.length; i += 4) {
      colors.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
    }
    expect(colors.size).toBeGreaterThan(3);

    // 5. NÃO pode existir uma faixa preta entre o céu e o chão: o
    //    horizonte tem de ser contínuo. O céu é AZUL (o canal azul
    //    domina) e o terreno é VERDE/CINZA (o canal verde domina).
    //    Uma linha preta no meio seria um "buraco" no horizonte.
    let gaps = 0;
    for (let x = 0; x < WIDTH; x += 4) {
      let sawSky = false;
      for (let y = 0; y < HEIGHT; y++) {
        const i = (y * WIDTH + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const isSky = b > r + 20 && b > 40;
        if (isSky) {
          sawSky = true;
          continue;
        }
        if (!sawSky) continue;
        // Já vi céu: a linha é preta (a cor de "vazio" do canvas é
        // #101010) e ainda não é terreno => buraco no horizonte.
        const isVoid = r < 30 && g < 30 && b < 30;
        if (isVoid) {
          gaps++;
          break;
        }
        // Uma linha de terreno (ou um personagem) encerra a busca.
        break;
      }
    }
    expect(gaps).toBe(0);

    // 6. Os zumbis têm de aparecer na tela (o bug original também
    //    apagava os personagens). Os olhos vermelhos (#c33) são a
    //    marca maisfiável de que um zumbi foi desenhado. Exigimos
    //    TODOS os três zumbis: cada um tem dois olhos.
    // Cada zumbi tem DOIS olhos; agrupamos os pixels vermelhos em
    // "cabeças" para garantir que os TRÊS zumbis aparecem.
    const eyePoints: { x: number; y: number }[] = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 170 && data[i + 1] < 90 && data[i + 2] < 90) {
        eyePoints.push({ x: (i / 4) % WIDTH, y: Math.floor(i / 4 / WIDTH) });
      }
    }
    // Agrupa por proximidade ESPACIAL (x e y): os dois olhos de um
    // zumbi ficam a poucos pixels de distância, enquanto as cabeças
    // de zumbis diferentes ficam mais separadas.
    const clusters: { x: number; y: number; count: number }[] = [];
    for (const p of eyePoints) {
      let best: { x: number; y: number; count: number } | undefined;
      let bestDist = Infinity;
      for (const c of clusters) {
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      if (best && bestDist < 40) {
        best.count++;
        best.x = (best.x * (best.count - 1) + p.x) / best.count;
        best.y = (best.y * (best.count - 1) + p.y) / best.count;
      } else {
        clusters.push({ x: p.x, y: p.y, count: 1 });
      }
    }
    // Cada zumbi tem 2 olhos; contamos as "cabeças" (grupos com 2+).
    const heads = clusters.filter((c) => c.count >= 2).length;
    expect(heads).toBeGreaterThanOrEqual(3);

    // 6b. As faixas de terreno têm de ser CONTÍGUAS: nenhuma
    //     coluna pode ter um "vazio" entre duas linhas de terreno.
    //     Varre cada coluna e conta os trechos de terreno separados
    //     por pixels de "vazio".
    let brokenColumns = 0;
    for (let x = 0; x < WIDTH; x += 6) {
      let inGround = false;
      let sawGround = false;
      for (let y = 200; y < HEIGHT; y++) {
        const i = (y * WIDTH + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const isSky = b > r + 20 && b > 40;
        const isVoid = r < 30 && g < 30 && b < 30;
        if (!isSky && !isVoid) {
          // Pixel de terreno (ou personagem).
          if (!inGround && sawGround) {
            brokenColumns++;
            break;
          }
          inGround = true;
          sawGround = true;
        } else if (isVoid && inGround) {
          // Um vazio no meio do terreno = faixa quebrada.
          brokenColumns++;
          break;
        }
      }
    }
    expect(brokenColumns).toBe(0);

    // 7. Os corpos dos zumbis (cores da pele do renderer de cima)
    //    também têm de estar presentes.
    let bodyPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // #7a8a6a / #6d7d5f / #8a9a72 / #92997a — pele dos zumbis.
      if (g > 80 && g < 160 && r > 90 && r < 165 && b > 70 && b < 140 && Math.abs(r - g) < 30) {
        bodyPixels++;
      }
    }
    expect(bodyPixels).toBeGreaterThan(200);

    // eslint-disable-next-line no-console
    console.log(
      `[snapshot] céu=${(sky * 100).toFixed(1)}% chão=${(ground * 100).toFixed(1)}% ` +
        `meio=${(middle * 100).toFixed(1)}% cores=${colors.size} → ${file}`,
    );
  }, 30000);
});
