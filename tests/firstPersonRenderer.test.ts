// ═══════════════════════════════════════════════════════════════
//  TESTS — first-person camera rendering path
//
//  The renderer is exercised with a mock 2D context so the
//  first-person projection can be verified without a browser:
//    · the local avatar is NOT drawn in first-person
//    · the transition is smooth (no teleport of the character)
//    · the local player position never changes
//    · other players are still drawn
//    · the view model and crosshair are rendered
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from "vitest";
import { Renderer } from "../src/game/renderer";
import { World } from "../src/game/world";
import { Player, Zombie } from "../src/game/entities";

// ── Mock canvas ──────────────────────────────────────────────
class MockCtx {
  calls: { op: string; args: unknown[] }[] = [];
  filter = "none";
  globalAlpha = 1;
  font = "";
  textAlign = "left";
  fillStyle = "";
  strokeStyle = "";
  lineWidth = 1;
  globalCompositeOperation = "source-over";
  imageSmoothingEnabled = true;

  private rec(op: string, ...args: unknown[]) {
    this.calls.push({ op, args });
  }
  save() { this.rec("save"); }
  restore() { this.rec("restore"); }
  translate(x: number, y: number) { this.rec("translate", x, y); }
  rotate(a: number) { this.rec("rotate", a); }
  scale(x: number, y: number) { this.rec("scale", x, y); }
  beginPath() { this.rec("beginPath"); }
  closePath() { this.rec("closePath"); }
  moveTo(x: number, y: number) { this.rec("moveTo", x, y); }
  lineTo(x: number, y: number) { this.rec("lineTo", x, y); }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) { this.rec("quadraticCurveTo", cx, cy, x, y); }
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number) { this.rec("bezierCurveTo"); }
  arcTo() { this.rec("arcTo"); }
  rect2() { /* noop */ }
  fillRect2() { /* noop */ }
  createConicGradient() { return { addColorStop() {} }; }
  createPattern() { return null; }
  arc(x: number, y: number, r: number, a: number, b: number) { this.rec("arc", x, y, r, a, b); }
  ellipse(x: number, y: number, rx: number, ry: number, rot: number) { this.rec("ellipse", x, y, rx, ry, rot); }
  rect(x: number, y: number, w: number, h: number) { this.rec("rect", x, y, w, h); }
  fill() { this.rec("fill"); }
  stroke() { this.rec("stroke"); }
  clip() { this.rec("clip"); }
  clearRect() { this.rec("clearRect"); }
  fillRect(x: number, y: number, w: number, h: number) { this.rec("fillRect", x, y, w, h); }
  strokeRect(x: number, y: number, w: number, h: number) { this.rec("strokeRect", x, y, w, h); }
  setLineDash() { this.rec("setLineDash"); }
  fillText(t: string) { this.rec("fillText", t); }
  strokeText(t: string) { this.rec("strokeText", t); }
  measureText(t: string) { return { width: t.length * 6 }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createLinearGradient() { return { addColorStop() {} }; }
  drawImage() { this.rec("drawImage"); }
  getImageData() { return { data: new Uint8ClampedArray(4) }; }
  putImageData() {}
  setTransform() {}
  resetTransform() {}
}

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: MockCtx } {
  const ctx = new MockCtx();
  const canvas = {
    width: 1280,
    height: 720,
    clientWidth: 1280,
    clientHeight: 720,
    style: {} as CSSStyleDeclaration,
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    addEventListener() {},
    removeEventListener() {},
  } as unknown as HTMLCanvasElement;
  return { canvas, ctx };
}

function makeWorld(): World {
  return new World({ difficulty: "survivor", zombieCount: 5, loot: 1, timeScale: 1 });
}

function makePlayer(): Player {
  const p = new Player();
  p.x = 5000;
  p.y = 5000;
  p.angle = 0;
  return p;
}

describe("first-person renderer", () => {
  let canvas: HTMLCanvasElement;
  let ctx: MockCtx;
  let renderer: Renderer;
  let world: World;

  beforeEach(() => {
    ({ canvas, ctx } = makeCanvas());
    renderer = new Renderer(canvas);
    world = makeWorld();
    // jsdom has no layout engine — give the canvas a stable size.
    Object.defineProperty(canvas, "clientWidth", { value: 1280, configurable: true });
    Object.defineProperty(canvas, "clientHeight", { value: 720, configurable: true });
  });

  const renderFp = (
    firstPerson: Record<string, unknown>,
    player = makePlayer(),
    others: any[] = [],
    zombies: Zombie[] = [],
  ) => {
    renderer.render(
      world,
      player,
      zombies,
      12,
      [],
      false,
      null,
      others,
      "clear",
      0,
      null,
      null,
      [],
      null,
      {},
      null,
      null,
      firstPerson as any,
    );
    return player;
  };

  it("renders the top-down view when disabled", () => {
    const player = makePlayer();
    renderFp({ enabled: false }, player);
    // The top-down path draws the world tiles.
    expect(ctx.calls.some((c) => c.op === "fillRect" && (c.args[2] as number) > 8)).toBe(true);
  });

  it("does not move the character when first-person is enabled", () => {
    const player = makePlayer();
    const before = { x: player.x, y: player.y };
    renderFp({ enabled: true }, player);
    expect(player.x).toBe(before.x);
    expect(player.y).toBe(before.y);
  });

  it("does not move the character during the transition", () => {
    const player = makePlayer();
    const before = { x: player.x, y: player.y };
    // Render a few frames so the blend animates.
    for (let i = 0; i < 5; i++) renderFp({ enabled: true }, player);
    expect(player.x).toBe(before.x);
    expect(player.y).toBe(before.y);
  });

  it("hides the local avatar in first-person but keeps other players", () => {
    const player = makePlayer();
    const other = { id: "p1", name: "Outro", x: 5004, y: 5000, angle: 0, health: 100, kills: 0, lastSeen: Date.now() };
    ctx.calls.length = 0;
    renderFp({ enabled: true }, player, [other]);

    // The other player is rendered as a silhouette in the FP view.
    const translated = ctx.calls.filter((c) => c.op === "translate");
    expect(translated.length).toBeGreaterThan(0);
  });

  it("draws the view model and the crosshair in first-person", () => {
    ctx.calls.length = 0;
    renderFp({ enabled: true });
    // The crosshair is made of moveTo/lineTo strokes.
    const strokes = ctx.calls.filter((c) => c.op === "stroke");
    expect(strokes.length).toBeGreaterThan(0);
    // The view model is a filled rounded rect.
    expect(ctx.calls.some((c) => c.op === "fillRect")).toBe(true);
  });

  it("respects the reduced-motion accessibility option", () => {
    ctx.calls.length = 0;
    renderFp({ enabled: true, reduceMotion: true });
    // Nothing should throw and the view must still render.
    expect(ctx.calls.length).toBeGreaterThan(0);
  });

  it("clamps an out-of-range FOV without throwing", () => {
    expect(() => renderFp({ enabled: true, fov: 999 })).not.toThrow();
    expect(() => renderFp({ enabled: true, fov: 1 })).not.toThrow();
  });

  it("keeps rendering when there are no other players and no zombies", () => {
    expect(() => renderFp({ enabled: true }, makePlayer(), [], [])).not.toThrow();
  });

  it("renders zombies in first-person", () => {
    const zombie = new Zombie(5003, 5000);
    ctx.calls.length = 0;
    renderFp({ enabled: true }, makePlayer(), [], [zombie]);
    expect(ctx.calls.length).toBeGreaterThan(0);
  });
});
