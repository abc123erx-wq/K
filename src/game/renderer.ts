import type { House, Item, Mood, OnlinePlayer } from "./types";
import { TILE, WORLD_SIZE, World } from "./world";
import type { BossGui, Player, Zombie } from "./entities";
import { ZOMBIE_OUTFITS } from "./entities";

const tileColors: Record<string, string> = {
  grass: "#263321",
  forest: "#172417",
  road: "#242424",
  house: "#3a342b",
  fence: "#4d4032",
  ruin: "#2a2520",
  water: "#1a2535",
  debris: "#2d2d20",
  rubble: "#3a3028",
  bunker: "#202520",
  park: "#2a3828",
};

// Zombie visual variation palettes (fallback if outfit is missing)
const zombieShirtColors = ["#3a4a34", "#4a3a34", "#343a4a", "#4a4a34"];
const zombiePantsColors = ["#28322a", "#322828", "#282832", "#323228"];
const zombieSkinColors = ["#7a8a6a", "#6d7d5f", "#8a9a72", "#92997a"];

/** Visual FX state pushed by the engine's admin flags. */
export interface AdminFx {
  filter: string;
  zoom: number;
  shake: number;
  flashColor: string | null;
  flashAlpha: number;
  bigHead: boolean;
  drunk: boolean;
  xray: boolean;
}

const DEFAULT_FX: AdminFx = {
  filter: "normal", zoom: 1, shake: 0,
  flashColor: null, flashAlpha: 0,
  bigHead: false, drunk: false, xray: false,
};

/**
 * First-person camera configuration.
 *
 * Purely visual: it changes where the camera sits and how the
 * scene is projected. It never touches hitboxes, reach, speed,
 * accuracy or any gameplay rule.
 */
export interface FirstPersonConfig {
  enabled: boolean;
  /** Horizontal field of view in degrees. */
  fov: number;
  /** Camera height above the player's feet, in tiles. */
  eyeHeight: number;
  /** Multiplier applied to the look/aim sensitivity. */
  sensitivity: number;
  /** When true, camera bob / shake smoothing is reduced. */
  reduceMotion: boolean;
}

export const DEFAULT_FIRST_PERSON_CONFIG: FirstPersonConfig = {
  enabled: false,
  fov: 75,
  eyeHeight: 1.05,
  sensitivity: 1,
  reduceMotion: false,
};

/** Maximum camera pull-back when the view would clip into geometry. */
const FP_MAX_PULLBACK = 0.55;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  camera = { x: 0, y: 0 };
  mouse = { x: 0, y: 0 };
  private fx: AdminFx = DEFAULT_FX;
  private equippedP1: Item | null = null;
  private equippedP2: Item | null = null;
  /** First-person camera configuration (visual only). */
  private fp: FirstPersonConfig = { ...DEFAULT_FIRST_PERSON_CONFIG };
  /** Smoothed transition factor 0 = top-down, 1 = first-person. */
  private fpBlend = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D not available");
    this.ctx = context;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    // OPTIMIZATION: Use 1.0 ratio for weak mobile devices instead of 2.0+
    const isWeak = window.innerWidth < 800 || /Android|iPhone|iPad/i.test(navigator.userAgent);
    const ratio = isWeak ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    
    const w = rect.width;
    const h = rect.height;
    this.canvas.width = w * ratio;
    this.canvas.height = h * ratio;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    
    // Disable smoothing for performance and "pixel art" look on low res
    this.ctx.imageSmoothingEnabled = false;
  }

  screenToWorld(x: number, y: number) {
    return { x: (x + this.camera.x) / TILE, y: (y + this.camera.y) / TILE };
  }

  render(world: World, player: Player, zombies: Zombie[], hour: number, moodles: Mood[], paused: boolean, insideHouseId: string | null, otherPlayers: OnlinePlayer[], weather: "clear" | "rain" | "fog" | "storm" = "clear", weatherIntensity = 0, player2?: Player | null, insideHouseId2?: string | null, vehicles: { x: number; y: number; angle: number; color: string; accentColor?: string; width?: number; height?: number; name: string; type?: string; fuel?: number; durability?: number; speed?: number }[] = [], drivingVehicle?: { name: string; emoji: string; fuel: number; maxFuel: number; durability: number; maxDur: number; speed: number; rarity: string } | null, fx?: Partial<AdminFx>, equippedP1?: Item | null, equippedP2?: Item | null, firstPerson?: Partial<FirstPersonConfig>) {
    const isWeak = this.canvas.width < 1000;
    const ctx = this.ctx;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const isCoop = player2 && player2.stats.health > 0;
    this.vehiclesToDraw = vehicles;
    this.fx = { ...DEFAULT_FX, ...(fx ?? {}) };
    this.equippedP1 = equippedP1 ?? null;
    this.equippedP2 = equippedP2 ?? null;
    this.fp = { ...DEFAULT_FIRST_PERSON_CONFIG, ...(firstPerson ?? {}) };
    const F = this.fx;

    // Smooth transition between the top-down and first-person
    // perspectives. The transition never teleports the character:
    // only the camera projection changes.
    const fpTarget = this.fp.enabled ? 1 : 0;
    if (Math.abs(this.fpBlend - fpTarget) > 0.001) {
      this.fpBlend += (fpTarget - this.fpBlend) * 0.14;
    } else {
      this.fpBlend = fpTarget;
    }

    // Admin camera shake + drunk wobble
    let shx = 0, shy = 0, rot = 0;
    if (F.shake > 0.01) {
      shx = (Math.random() - 0.5) * F.shake * 18;
      shy = (Math.random() - 0.5) * F.shake * 18;
    }
    if (F.drunk) {
      const t = performance.now() * 0.001;
      shx += Math.sin(t * 1.6) * 14;
      shy += Math.cos(t * 1.2) * 10;
      rot = Math.sin(t * 0.9) * 0.03;
    }
    // Reduced-motion accessibility: damp bob / shake in FP mode.
    if (this.fpBlend > 0 && this.fp.reduceMotion) {
      shx *= 0.25;
      shy *= 0.25;
      rot *= 0.25;
    }

    // Full clear
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#101010";
    ctx.fillRect(0, 0, width, height);

    const cssFilter = this.cssFilterFor(F.filter);

    if (isCoop) {
      // ==================== SPLIT SCREEN ====================
      const halfH = Math.floor(height / 2);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, halfH);
      ctx.clip();
      this.camera.x = player.x * TILE - width / 2 + shx;
      this.camera.y = player.y * TILE - halfH / 2 + shy;
      this.drawScene(world, player, zombies, hour, paused, insideHouseId, otherPlayers, player2);
      ctx.fillStyle = "rgba(74,92,69,0.7)";
      ctx.fillRect(0, 0, 32, 16);
      ctx.fillStyle = "#4a5c45";
      ctx.font = "700 9px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText("P1", 16, 12);
      ctx.restore();

      ctx.strokeStyle = "rgba(74,92,69,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, halfH);
      ctx.lineTo(width, halfH);
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, halfH, width, halfH);
      ctx.clip();
      ctx.translate(0, halfH);
      this.camera.x = player2.x * TILE - width / 2 + shx;
      this.camera.y = player2.y * TILE - halfH / 2 + shy;
      this.drawScene(world, player2, zombies, hour, paused, insideHouseId2 ?? null, otherPlayers, player);
      ctx.fillStyle = "rgba(217,107,58,0.7)";
      ctx.fillRect(0, 0, 32, 16);
      ctx.fillStyle = "#d96b3a";
      ctx.font = "700 9px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText("P2", 16, 12);
      ctx.restore();

      this.drawWeather(hour, moodles, weather, weatherIntensity, isWeak);
      if (!isWeak) this.drawMinimap(world, player, zombies, otherPlayers, player2);
      if (drivingVehicle) this.drawFirstPersonDashboard(drivingVehicle, player.angle);
      if (paused) this.drawPause();
    } else {
      // ==================== SINGLE PLAYER ====================
      if (this.fpBlend > 0.001) {
        // ---------- FIRST-PERSON (or transition into it) ----------
        this.renderFirstPerson(
          world, player, zombies, hour, moodles,
          otherPlayers, cssFilter, shx, shy, rot, isWeak, weather,
          weatherIntensity,
        );
      } else {
        // ---------- TOP-DOWN (default perspective) ----------
        this.camera.x = player.x * TILE - width / 2 + shx;
        this.camera.y = player.y * TILE - height / 2 + shy;

        ctx.save();
        if (rot !== 0 || F.zoom !== 1) {
          ctx.translate(width / 2, height / 2);
          if (rot !== 0) ctx.rotate(rot);
          if (F.zoom !== 1) ctx.scale(F.zoom, F.zoom);
          ctx.translate(-width / 2, -height / 2);
        }
        if (cssFilter) ctx.filter = cssFilter;
        // skipLight=true: lighting is applied below (once) with the weak-device guard
        this.drawScene(world, player, zombies, hour, paused, insideHouseId, otherPlayers, null, true);
        ctx.filter = "none";
        ctx.restore();

        if (!isWeak) this.applyLight(hour, player);
        if (!isWeak && moodles.some((m) => m.kind === "panicked")) this.drawVignette("rgba(92, 18, 18, 0.24)");
        this.drawWeather(hour, moodles, weather, weatherIntensity, isWeak);
        this.drawFilterOverlay(F.filter, width, height);
        if (!isWeak) this.drawMinimap(world, player, zombies, otherPlayers, null);
      }

      if (drivingVehicle) this.drawFirstPersonDashboard(drivingVehicle, player.angle);
      if (paused) this.drawPause();
    }

    // Admin screen flash
    if (F.flashAlpha > 0.01 && F.flashColor) {
      ctx.globalAlpha = Math.min(1, F.flashAlpha);
      ctx.fillStyle = F.flashColor;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
  }

  // ============================================================
  //  FIRST-PERSON CAMERA
  //
  //  The world is authored top-down, so the first-person view is
  //  produced with a "column projection": the scene is sampled in
  //  vertical slices in front of the camera and each slice is
  //  drawn with a perspective scale (1/depth). This yields a
  //  readable, action-style first-person framing that follows the
  //  existing look/aim controls exactly (the camera direction IS
  //  the player's aim angle — no extra input, no gameplay change).
  //
  //  Everything here is purely cosmetic:
  //    · the character's position never changes
  //    · the local avatar model is hidden in FP (other players
  //      still see the normal avatar)
  //    · hitboxes, reach, speed and accuracy are untouched
  // ============================================================

  /** How many depth slices the projection uses (perf/quality knob). */
  private static readonly FP_SLICES = 44;
  /** How many world units ahead the projection reaches. */
  private static readonly FP_FAR = 26;

  /**
   * Resolve the camera position for the first-person view.
   *
   * The camera sits at the player's head height and is pulled back
   * when the forward probe would clip into a wall, so the view
   * never ends up inside geometry.
   */
  private resolveFirstPersonCamera(player: Player, world: World): { x: number; y: number } {
    const fx = Math.cos(player.angle);
    const fy = Math.sin(player.angle);
    let pullback = 0;
    // Probe forward in small steps and stop at the first blocked one.
    for (let d = 0.1; d <= FP_MAX_PULLBACK; d += 0.05) {
      if (world.isBlocked(player.x + fx * d, player.y + fy * d)) break;
      pullback = d;
    }
    return {
      x: player.x - fx * pullback,
      y: player.y - fy * pullback,
    };
  }

  /** Render the first-person view. */
  private renderFirstPerson(
    world: World,
    player: Player,
    zombies: Zombie[],
    hour: number,
    moodles: Mood[],
    otherPlayers: OnlinePlayer[],
    cssFilter: string,
    shx: number,
    shy: number,
    rot: number,
    isWeak: boolean,
    weather: "clear" | "rain" | "fog" | "storm",
    weatherIntensity: number,
  ) {
    const ctx = this.ctx;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const blend = this.fpBlend;

    const cam = this.resolveFirstPersonCamera(player, world);
    const dirX = Math.cos(player.angle);
    const dirY = Math.sin(player.angle);
    // Right-hand vector of the view direction.
    const rightX = -dirY;
    const rightY = dirX;

    // Horizon sits slightly below the vertical centre for a grounded
    // first-person feel; the eye height shifts it up a little.
    const horizon = height * 0.52 - (this.fp.eyeHeight - 1) * height * 0.06;

    // Vertical field of view derived from the horizontal FOV.
    const aspect = width / Math.max(1, height);
    const vFov = 2 * Math.atan(Math.tan((this.fp.fov * Math.PI) / 360) / Math.max(0.35, aspect));
    const focal = (height / 2) / Math.max(0.08, Math.tan(vFov / 2));

    // Camera shake is applied as a small view offset.
    const camX = cam.x + (shx / TILE) * 0.6;
    const camY = cam.y + (shy / TILE) * 0.6;

    // The camera transform maps world space into screen space.
    const project = (wx: number, wy: number): { sx: number; sy: number; depth: number } => {
      const dx = wx - camX;
      const dy = wy - camY;
      const depth = dx * dirX + dy * dirY;       // distance along the view axis
      const lateral = dx * rightX + dy * rightY; // distance to the right
      if (depth <= 0.12) return { sx: 0, sy: 0, depth };
      const scale = focal / depth;
      return {
        sx: width / 2 + lateral * scale,
        // Ground point of a world coordinate at the given depth.
        //
        // `scale` already converts WORLD UNITS to pixels
        // (focal is px per world-unit at depth 1), so the eye height
        // must be expressed in world units — multiplying by TILE here
        // would mix two unit systems and push the ground far below
        // the viewport, leaving the screen empty.
        sy: horizon + this.fp.eyeHeight * scale,
        depth,
      };
    };

    // ---- Ground plane ------------------------------------------------
    // Draw the terrain as depth-ordered horizontal bands so nearer
    // ground covers farther ground (painter's algorithm).
    const bandCount = Renderer.FP_SLICES;
    const maxDepth = Renderer.FP_FAR;

    ctx.save();
    if (rot !== 0) {
      ctx.translate(width / 2, height / 2);
      ctx.rotate(rot);
      ctx.translate(-width / 2, -height / 2);
    }
    if (cssFilter) ctx.filter = cssFilter;

    // Sort actors by distance so the closest ones draw last.
    type Actor = { x: number; y: number; kind: "zombie" | "player"; ref: any };
    const actors: Actor[] = [];
    for (const z of zombies) {
      const d = (z.x - camX) * dirX + (z.y - camY) * dirY;
      if (d > 0.3 && d < maxDepth) actors.push({ x: z.x, y: z.y, kind: "zombie", ref: z });
    }
    for (const op of otherPlayers) {
      const d = (op.x - camX) * dirX + (op.y - camY) * dirY;
      if (d > 0.3 && d < maxDepth) actors.push({ x: op.x, y: op.y, kind: "player", ref: op });
    }
    actors.sort((a, b) => {
      const da = (a.x - camX) * dirX + (a.y - camY) * dirY;
      const db = (b.x - camX) * dirX + (b.y - camY) * dirY;
      return db - da; // far first
    });

    // ---- Sky ---------------------------------------------------------
    // Without this the area above the horizon stays pure black, which
    // reads as "the game is broken" rather than as an outdoor view.
    this.drawFirstPersonSky(hour, horizon, width, height);

    // Draw the ground in bands from FAR to NEAR (painter's algorithm:
    // the closest band must be painted last so it covers the others).
    //
    // The bands use a geometric depth progression: with a linear one
    // the far half of the world is squeezed into a couple of pixels
    // and the near half covers the whole screen. A geometric series
    // spends the same number of pixels on every distance, which is
    // what makes the ground readable.
    //
    // Band 0 starts exactly at the horizon so the sky and the ground
    // meet seamlessly (there is no black gap in between).
    const minDepth = 0.35;
    const depthRatio = Math.pow(maxDepth / minDepth, 1 / bandCount);

    for (let band = 0; band < bandCount; band++) {
      // Far edge of the band (farther away => smaller depth).
      const farDepth = maxDepth / Math.pow(depthRatio, band);
      // Near edge of the band (closer => larger depth).
      const nearDepth = maxDepth / Math.pow(depthRatio, band + 1);
      if (nearDepth <= minDepth * 0.5) continue;

      const scale = focal / nearDepth;      // px per world unit at the near edge

      // Screen Y of the ground at the near edge (lower on the screen).
      const y = horizon + this.fp.eyeHeight * scale;
      // Screen Y at the far edge (higher on the screen). For the
      // farthest band this is the horizon itself.
      const nextY = band === 0
        ? horizon
        : horizon + this.fp.eyeHeight * (focal / farDepth);
      if (nextY > y) continue;
      const bandHeight = Math.max(1, y - nextY);

      // ---- Per-column inverse projection ----------------------------
      // For every screen column we compute the exact world position it
      // looks at (inverse of the perspective projection) and read the
      // tile there. A fixed grid of samples would smear a single tile
      // across many columns, which produced vertical stripes in the
      // distance.
      const bandDepth = Math.max(0.01, nearDepth - farDepth);
      // A far band covers many pixels but corresponds to a thin slice
      // of the world; sampling several rows and keeping the closest hit
      // keeps the distant ground stable (same idea as a mipmap).
      const rowSamples = bandDepth > 1.2 ? 3 : bandDepth > 0.5 ? 2 : 1;

      // The tile lookup is cached per world tile so that neighbouring
      // columns pointing at the same tile do not repeat the lookup.
      let lastTileKey = "";
      let lastColor = "";

      for (let x = 0; x < width; x++) {
        // Lateral offset (in world units) seen by this screen column.
        const lateral = (x - width / 2) / scale;
        let color: string | null = null;

        for (let r = 0; r < rowSamples && color === null; r++) {
          // Sample from the near edge of the band backwards.
          const rowDepth = nearDepth - (bandDepth * (r + 0.5)) / rowSamples;
          const wx = camX + dirX * rowDepth + rightX * lateral;
          const wy = camY + dirY * rowDepth + rightY * lateral;
          const tx = Math.floor(wx);
          const ty = Math.floor(wy);
          if (!world.inBounds(tx, ty)) continue;

          const key = `${tx},${ty}`;
          if (key === lastTileKey) {
            color = lastColor;
            continue;
          }
          const tile = world.tileAt(wx, wy);
          color = this.firstPersonTileColor(tile);
          lastTileKey = key;
          lastColor = color;
        }

        if (!color) continue;
        ctx.fillStyle = color;
        // Overlap by one pixel so consecutive bands do not leave
        // hairline seams where the fillRect rounding falls short.
        ctx.fillRect(x, nextY - 1, 1, bandHeight + 2);
      }

    }

    // ---- Actors --------------------------------------------------------
    // The actors are drawn AFTER the terrain (not inside the band loop)
    // so that an actor standing exactly on a band border is never
    // skipped. They are sorted far -> near, so the closest one is
    // painted last and correctly overlaps the ones behind it.
    for (const actor of actors) {
      const d = (actor.x - camX) * dirX + (actor.y - camY) * dirY;
      if (d <= 0.12) continue;
      const p = project(actor.x, actor.y);
      if (p.sx < -300 || p.sx > width + 300) continue;
      // A humanoid is ~1.7 world units tall; `actorScale` already
      // converts world units to pixels, so TILE must NOT be applied
      // here (that would mix unit systems and blow the sprite up).
      const actorScale = focal / d;
      const actorHeightPx = 1.7 * actorScale;
      ctx.save();
      ctx.translate(p.sx, p.sy);
      if (actor.kind === "zombie") {
        this.drawFirstPersonZombie(actor.ref, actorHeightPx);
      } else {
        this.drawFirstPersonOtherPlayer(actor.ref, actorHeightPx);
      }
      ctx.restore();
    }
    ctx.filter = "none";
    ctx.restore();

    // ---- Local avatar -------------------------------------------------
    // In first-person the local character is not drawn (it would
    // block the view). Other players still see the normal avatar.

    // ---- Lighting / atmosphere ---------------------------------------
    if (!isWeak) this.applyFirstPersonLight(hour);
    if (!isWeak && moodles.some((m) => m.kind === "panicked")) this.drawVignette("rgba(92, 18, 18, 0.24)");
    this.drawWeather(hour, moodles, weather, weatherIntensity, isWeak);

    // ---- View model (weapon + hands) ----------------------------------
    this.drawFirstPersonViewModel(player, blend);

    // ---- Crosshair ----------------------------------------------------
    this.drawFirstPersonCrosshair(player);
  }

  /**
   * Paints the sky above the horizon for the first-person view.
   * The gradient follows the time of day so night stays dark and
   * dawn/dusk keep a warm tone, matching the top-down lighting.
   */
  private drawFirstPersonSky(hour: number, horizon: number, width: number, height: number) {
    const ctx = this.ctx;
    const top = this.skyColor(hour, 0);
    const bottom = this.skyColor(hour, 1);
    const grad = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, Math.max(0, horizon));

    // A low sun/moon glow near the horizon line.
    const glow = this.sunGlowColor(hour);
    if (glow) {
      const g2 = ctx.createLinearGradient(0, horizon - height * 0.22, 0, horizon);
      g2.addColorStop(0, "rgba(0,0,0,0)");
      g2.addColorStop(1, glow);
      ctx.fillStyle = g2;
      ctx.fillRect(0, horizon - height * 0.22, width, height * 0.22);
    }
  }

  /** Sky gradient colour for a given time of day and stop (0 = top, 1 = horizon). */
  private skyColor(hour: number, stop: number): string {
    // 0 = midnight, 6 = dawn, 12 = noon, 18 = dusk, 24 = midnight.
    const h = ((hour % 24) + 24) % 24;
    let top: [number, number, number];
    let bottom: [number, number, number];

    if (h >= 20 || h < 5) {
      top = [8, 10, 20];
      bottom = [16, 18, 30];
    } else if (h < 8) {
      // dawn
      top = [26, 32, 58];
      bottom = [92, 62, 52];
    } else if (h < 17) {
      top = [46, 66, 96];
      bottom = [128, 142, 152];
    } else if (h < 20) {
      // dusk
      top = [34, 40, 66];
      bottom = [110, 68, 48];
    } else {
      top = [10, 12, 24];
      bottom = [18, 20, 32];
    }

    const lerp = (a: number, b: number) => Math.round(a + (b - a) * stop);
    return `rgb(${lerp(top[0], bottom[0])},${lerp(top[1], bottom[1])},${lerp(top[2], bottom[2])})`;
  }

  /** Warm glow near the horizon during dawn/dusk, empty otherwise. */
  private sunGlowColor(hour: number): string {
    const h = ((hour % 24) + 24) % 24;
    if (h >= 5 && h < 9) return "rgba(214, 142, 88, 0.35)";
    if (h >= 16 && h < 20) return "rgba(206, 110, 66, 0.32)";
    return "";
  }

  /** Tile colour used by the first-person ground projection. */
  private firstPersonTileColor(tile: string): string {
    switch (tile) {
      case "grass": return "#33422a";
      case "forest": return "#1f2f1d";
      case "road": return "#333333";
      case "house": return "#4a4136";
      case "fence": return "#5d4d3c";
      case "ruin": return "#3a3229";
      case "water": return "#223048";
      case "debris": return "#3c3c2a";
      case "rubble": return "#4c3f34";
      case "bunker": return "#2b3129";
      case "park": return "#374a34";
      default: return "#2b3229";
    }
  }

  /** Night/dusk lighting for the first-person view. */
  private applyFirstPersonLight(hour: number) {
    const ctx = this.ctx;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const night = hour < 6 || hour > 20;
    const dusk = hour < 8 || hour > 18;
    const alpha = night ? 0.58 : dusk ? 0.26 : 0.06;
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillRect(0, 0, width, height);
  }

  /** Zombie silhouette as seen from the first-person camera. */
  private drawFirstPersonZombie(zombie: any, heightPx: number) {
    const ctx = this.ctx;
    // The zombie variant drives subtle colour differences so the
    // silhouettes stay readable and varied.
    const variant = typeof zombie?.variant === "number" ? zombie.variant % 4 : 0;
    const w = Math.max(2, heightPx * 0.42);
    const h = Math.max(4, heightPx);
    // Same palette as the top-down view (zombieSkinColors) so the
    // silhouette stays readable against the ground.
    ctx.fillStyle = zombieSkinColors[variant] ?? "#7a8a6a";
    ctx.fillRect(-w / 2, -h, w, h);
    ctx.fillStyle = ["#4a5c45", "#54483c", "#3f5448", "#4b4553"][variant] ?? "#4a5c45";
    ctx.fillRect(-w / 2 - w * 0.12, -h * 0.62, w * 1.24, h * 0.62);
    ctx.fillStyle = "#a3b48c";
    ctx.beginPath();
    ctx.ellipse(0, -h - h * 0.05, w * 0.34, h * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c33";
    ctx.fillRect(-w * 0.14, -h - h * 0.07, w * 0.08, h * 0.025);
    ctx.fillRect(w * 0.06, -h - h * 0.07, w * 0.08, h * 0.025);
  }

  /** Another player as seen from the first-person camera. */
  private drawFirstPersonOtherPlayer(op: any, heightPx: number) {
    const ctx = this.ctx;
    // Other players keep their normal appearance; only the local
    // avatar is hidden in first-person.
    const health = typeof op?.health === "number" ? op.health : 100;
    const hurt = health < 35;
    const w = Math.max(2, heightPx * 0.4);
    const h = Math.max(4, heightPx);
    ctx.fillStyle = hurt ? "#4a2f28" : "#2c3528";
    ctx.fillRect(-w / 2, -h, w, h);
    ctx.fillStyle = hurt ? "#7a4a3a" : "#4a5c45";
    ctx.fillRect(-w / 2 - w * 0.1, -h * 0.66, w * 1.2, h * 0.66);
    ctx.fillStyle = "#dbc8a6";
    ctx.beginPath();
    ctx.ellipse(0, -h - h * 0.05, w * 0.3, h * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Draw the first-person view model (the player's hands and the
   * equipped weapon). Fades in with the FP transition.
   */
  private drawFirstPersonViewModel(player: Player, blend: number) {
    const ctx = this.ctx;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const item = this.equippedP1;

    const bob = this.fp.reduceMotion ? 0 : Math.sin(player.walkCycle) * (player.moving ? 6 : 0);
    const baseX = width * 0.72;
    const baseY = height - 46 + bob;
    const recoil = player.attackAnim * 16;

    ctx.save();
    ctx.globalAlpha = Math.min(1, blend);
    ctx.translate(baseX, baseY + recoil);

    // Forearm
    ctx.fillStyle = "#4a5c45";
    this.roundRect(-14, 6, 30, 46, 6);
    ctx.fill();
    // Hand
    ctx.fillStyle = "#dbc8a6";
    this.roundRect(-8, -2, 26, 18, 6);
    ctx.fill();

    if (item && item.weapon) {
      const firearm = item.weapon.mode === "firearm";
      ctx.fillStyle = firearm ? "#2a2a2a" : "#5a4a2a";
      if (firearm) {
        this.roundRect(-30, -14, 78, 13, 3);
        ctx.fill();
        ctx.fillStyle = "#1a1a1a";
        this.roundRect(-40, -10, 20, 8, 2);
        ctx.fill();
      } else {
        ctx.fillRect(-70, -5, 86, 6);
        ctx.fillStyle = "#3a2a1a";
        this.roundRect(-56, -2, 22, 10, 3);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /**
   * Crosshair for the first-person view.
   *
   * It sits at the vanishing point of the view direction, so it
   * always matches where the existing aim/attack code points.
   */
  private drawFirstPersonCrosshair(_player: Player) {
    const ctx = this.ctx;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const horizon = height * 0.52 - (this.fp.eyeHeight - 1) * height * 0.06;

    ctx.strokeStyle = "rgba(216, 119, 73, 0.75)";
    ctx.lineWidth = 1.5;
    const cx = width / 2;
    const cy = horizon;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy); ctx.lineTo(cx - 3, cy);
    ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 9, cy);
    ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy - 3);
    ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 9);
    ctx.stroke();
    ctx.fillStyle = "rgba(216, 119, 73, 0.9)";
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
  }

  /** CSS filter string for full-screen render filters. */
  private cssFilterFor(filter: string): string {
    switch (filter) {
      case "noir": return "grayscale(1) contrast(1.25) brightness(0.95)";
      case "sepia": return "sepia(0.9)";
      case "thermal": return "sepia(1) saturate(4) hue-rotate(-35deg) contrast(1.1)";
      case "nightvision": return "brightness(1.35) saturate(2.5) hue-rotate(75deg)";
      case "xray": return "invert(0.92)";
      case "invert": return "invert(1)";
      case "vaporwave": return "saturate(2.2) hue-rotate(265deg) contrast(1.05)";
      case "cyberpunk": return "saturate(1.9) hue-rotate(160deg) contrast(1.15)";
      case "disco": return `saturate(2.6) hue-rotate(${Math.round((performance.now() * 0.25) % 360)}deg)`;
      case "matrix": return "saturate(1.6) hue-rotate(85deg) brightness(0.9) contrast(1.2)";
      default: return "";
    }
  }

  /** Extra per-filter overlays (scanlines, matrix rain...). */
  private drawFilterOverlay(filter: string, width: number, height: number) {
    const ctx = this.ctx;
    if (filter === "crt") {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 2);
      ctx.fillStyle = "rgba(120,255,180,0.04)";
      ctx.fillRect(0, 0, width, height);
    } else if (filter === "matrix") {
      ctx.fillStyle = "rgba(0,255,110,0.16)";
      ctx.font = "10px monospace";
      const t = performance.now() * 0.05;
      for (let i = 0; i < 40; i++) {
        const x = (i * 97) % width;
        const y = ((i * 211 + t * (0.6 + (i % 5) * 0.3)) % (height + 120)) - 60;
        ctx.fillText(String.fromCharCode(0x30a0 + ((i * 7 + Math.floor(t)) % 96)), x, y);
      }
    }
  }

  /** Draw all world elements within the current camera (may be clipped) */
  private vehiclesToDraw: { x: number; y: number; angle: number; color: string; accentColor?: string; width?: number; height?: number; name: string; type?: string; fuel?: number; durability?: number; speed?: number }[] = [];

  private drawScene(world: World, primaryPlayer: Player, zombies: Zombie[], hour: number, _paused: boolean, insideHouseId: string | null, otherPlayers: OnlinePlayer[], otherLocalPlayer: Player | null, skipLight = false) {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    const startX = Math.max(0, Math.floor(this.camera.x / TILE) - 1);
    const startY = Math.max(0, Math.floor(this.camera.y / TILE) - 1);
    const endX = Math.min(WORLD_SIZE - 1, Math.ceil((this.camera.x + width) / TILE) + 1);
    const endY = Math.min(WORLD_SIZE - 1, Math.ceil((this.camera.y + height) / TILE) + 1);
    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        this.drawTile(x, y, world.tileAt(x, y));
      }
    }

    const houses = world.houses;
    for (const house of houses) {
      if (this.houseOnScreen(house.x, house.y, house.w, house.h, width, height)) {
        this.drawHouse(house, house.id === insideHouseId);
      }
    }
    const trees = world.trees;
    for (const tree of trees) {
      if (this.onScreen(tree.x, tree.y, width, height)) {
        this.drawTree(tree.x, tree.y, tree.r);
      }
    }

    for (const op of otherPlayers) {
      if (this.onScreen(op.x, op.y, width, height)) {
        this.drawOtherPlayer(op);
      }
    }

    // Draw vehicles
    for (const veh of this.vehiclesToDraw) {
      if (this.onScreen(veh.x, veh.y, width, height)) {
        this.drawVehicle(veh);
      }
    }

    const nearZombies = zombies.filter((z) => this.onScreen(z.x, z.y, width, height));
    const actors: { actor: any; pNum?: 1 | 2 }[] = nearZombies.map(z => ({ actor: z }));
    if (primaryPlayer.stats.health > 0) actors.push({ actor: primaryPlayer, pNum: 1 });
    if (otherLocalPlayer && otherLocalPlayer.stats.health > 0) actors.push({ actor: otherLocalPlayer, pNum: 2 });
    const sorted = actors.sort((a, b) => a.actor.y - b.actor.y);
    for (const item of sorted) {
      if (item.pNum) this.drawPlayer(item.actor, item.pNum);
      else this.drawZombie(item.actor);
    }

    this.drawAimLine(primaryPlayer, 1);
    if (!skipLight) this.applyLight(hour, primaryPlayer);
  }

  /** Draw dropped items lying on the ground */
  drawGroundItems(items: { id: string; name: string; qty: number; x: number; y: number; type: string; rarity?: string }[], playerX: number, playerY: number) {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const pulse = 0.5 + Math.sin(performance.now() * 0.004) * 0.5;

    for (const g of items) {
      if (!this.onScreen(g.x, g.y, w, h)) continue;
      const sx = g.x * TILE - this.camera.x;
      const sy = g.y * TILE - this.camera.y;

      const rarityColor =
        g.rarity === "Lendário" ? "#e0b02a" :
        g.rarity === "Épico" ? "#a35ad9" :
        g.rarity === "Raro" ? "#3a7ad9" :
        g.rarity === "Incomum" ? "#4a9c45" : "#8a8a8a";

      // Glow halo
      ctx.fillStyle = `rgba(${g.rarity === "Lendário" ? "224,176,42" : "180,180,180"},${0.10 + pulse * 0.12})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 15, 0, Math.PI * 2);
      ctx.fill();

      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.ellipse(sx + 2, sy + 5, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Crate/bag body
      ctx.fillStyle = "#3a3128";
      this.roundRect(sx - 7, sy - 8, 14, 12, 2);
      ctx.fillStyle = rarityColor;
      ctx.fillRect(sx - 7, sy - 3, 14, 2.5);
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - 7, sy - 8, 14, 12);

      // Show label when close
      const dist = Math.hypot(g.x - playerX, g.y - playerY);
      if (dist < 4) {
        const label = g.qty > 1 ? `${g.name} x${g.qty}` : g.name;
        ctx.font = "700 9px 'Courier New', monospace";
        ctx.textAlign = "center";
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = "rgba(8,8,8,0.85)";
        ctx.fillRect(sx - tw / 2 - 4, sy - 26, tw + 8, 13);
        ctx.strokeStyle = rarityColor;
        ctx.strokeRect(sx - tw / 2 - 4, sy - 26, tw + 8, 13);
        ctx.fillStyle = rarityColor;
        ctx.fillText(label, sx, sy - 16);

        if (dist < 2.2) {
          ctx.fillStyle = "#4aff4a";
          ctx.font = "700 8px 'Courier New', monospace";
          ctx.fillText("[H] Pegar", sx, sy + 18);
        }
      }
    }
  }

  /** Draw boss GUI */
  drawBossGui(boss: BossGui) {
    const ctx = this.ctx;
    const sx = boss.x * TILE - this.camera.x;
    const sy = boss.y * TILE - this.camera.y;

    // Boss HP bar overlay at top of screen
    const hpPct = boss.hp / boss.maxHp;
    const barW = Math.min(500, this.canvas.clientWidth * 0.6);
    const barH = 28;
    const bx = (this.canvas.clientWidth - barW) / 2;
    const by = 10;

    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(bx - 4, by - 4, barW + 8, barH + 8);
    ctx.strokeStyle = "#8a0044";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx - 4, by - 4, barW + 8, barH + 8);

    const grad = ctx.createLinearGradient(bx, by, bx + barW, by);
    grad.addColorStop(0, boss.phase === 3 ? "#440011" : "#660033");
    grad.addColorStop(1, "#cc0055");
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, barW * hpPct, barH);

    ctx.fillStyle = "#f0d0e0";
    ctx.font = "700 13px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      `☠ GUI (Phase ${boss.phase}) — ${boss.hp.toLocaleString()} / ${boss.maxHp.toLocaleString()} HP`,
      this.canvas.clientWidth / 2, by + 19
    );

    // Draw boss entity on map (only if visible)
    if (this.onScreen(boss.x, boss.y, this.canvas.clientWidth, this.canvas.clientHeight)) {
      // Shadow
      ctx.save();
      ctx.fillStyle = `rgba(80,0,40,0.5)`;
      ctx.beginPath();
      ctx.ellipse(sx + 8, sy + 18, 28 * boss.scale, 14 * boss.scale, 0, 0, Math.PI * 2);
      ctx.fill();

      // Teleport flash effect
      if (boss.teleportFlash > 0) {
        ctx.fillStyle = `rgba(255,0,128,${boss.teleportFlash * 0.6})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 60 * boss.scale, 0, Math.PI * 2);
        ctx.fill();
      }

      // Body (giant dark form)
      ctx.translate(sx, sy);
      const sway = Math.sin(boss.walkCycle * 0.7) * 3;
      ctx.fillStyle = boss.hitCooldown > 0 ? "#ff2244" : "#220011";
      ctx.beginPath();
      ctx.arc(sway, 0, 16 * boss.scale, 0, Math.PI * 2);
      ctx.fill();

      // Inner glow
      ctx.fillStyle = boss.hitCooldown > 0 ? "#ff88aa" : "#660033";
      ctx.beginPath();
      ctx.arc(sway - 2, -2, 10 * boss.scale, 0, Math.PI * 2);
      ctx.fill();

      // Eyes (white/red phase dependent)
      ctx.fillStyle = boss.phase === 3 ? "#ff0044" : "#ff4488";
      ctx.beginPath();
      ctx.arc(sway - 7 * boss.scale, -6 * boss.scale, 4 * boss.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sway + 7 * boss.scale, -6 * boss.scale, 4 * boss.scale, 0, Math.PI * 2);
      ctx.fill();

      // Crown / horns (authority symbol)
      ctx.fillStyle = "#444";
      ctx.beginPath();
      ctx.moveTo(sway - 12 * boss.scale, -14 * boss.scale);
      ctx.lineTo(sway - 8 * boss.scale, -26 * boss.scale);
      ctx.lineTo(sway - 2 * boss.scale, -18 * boss.scale);
      ctx.lineTo(sway + 2 * boss.scale, -28 * boss.scale);
      ctx.lineTo(sway + 8 * boss.scale, -18 * boss.scale);
      ctx.lineTo(sway + 12 * boss.scale, -14 * boss.scale);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      // Boss label
      ctx.fillStyle = "#cc0066";
      ctx.font = "900 14px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText("THE GUI", sx, sy - 24 * boss.scale - 12);
    }
  }

  // ============================================================
  //  Weather: rain drops + fog overlay
  // ============================================================
  private drawWeather(hour: number, _moodles: Mood[], weather: "clear" | "rain" | "fog" | "storm", intensity: number, isWeak = false) {
    const ctx = this.ctx;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const now = performance.now();

    // Rain drops
    const isRain = weather === "rain" || weather === "storm";
    if (isRain && intensity > 0) {
      const count = Math.floor((isWeak ? 40 : 200) * intensity);
      const speed = weather === "storm" ? 24 : 16;
      const wind = weather === "storm" ? 6 : 2;
      ctx.strokeStyle = `rgba(180,200,220,${0.15 + intensity * 0.2})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < count; i++) {
        const rx = ((i * 137.5 + now * speed * 0.0007) % (width + 100)) - 50;
        const ry = ((i * 211.3 + now * speed * 0.0013) % (height + 100)) - 50;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + wind, ry + 8 + intensity * 6);
        ctx.stroke();
      }
    }

    // Fog overlay
    const isFog = weather === "fog";
    if (isFog && intensity > 0) {
      ctx.fillStyle = `rgba(160,170,155,${intensity * 0.35})`;
      ctx.fillRect(0, 0, width, height);
    }

    // Night darkening with weather
    if (hour < 6 || hour > 20) {
      ctx.fillStyle = `rgba(0,0,0,0.12)`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  // ============================================================
  //  Minimap — top-left compact map
  // ============================================================
  private drawMinimap(world: World, player: Player, zombies: Zombie[], otherPlayers: OnlinePlayer[], _player2?: Player | null) {
    const ctx = this.ctx;
    const size = 140;
    const scale = 0.7; // each tile = 0.7px on minimap
    const px = size / 2;
    const py = size / 2;
    const half = size / 2;

    // Background
    ctx.fillStyle = "rgba(10,10,10,0.85)";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(74,92,69,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, size, size);

    // Draw terrain tiles around player
    const range = Math.ceil(half / scale);
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        const wx = player.x + dx;
        const wy = player.y + dy;
        if (!world.inBounds(Math.floor(wx), Math.floor(wy))) continue;
        const tile = world.tileAt(wx, wy);
        const sx = px + dx * scale;
        const sy = py + dy * scale;
        switch (tile) {
          case "grass": ctx.fillStyle = "rgba(38,51,33,0.7)"; break;
          case "forest": ctx.fillStyle = "rgba(23,36,23,0.9)"; break;
          case "road": ctx.fillStyle = "rgba(60,60,60,0.8)"; break;
          case "house": ctx.fillStyle = "rgba(100,85,65,0.8)"; break;
          case "fence": ctx.fillStyle = "rgba(120,100,70,0.5)"; break;
          default: ctx.fillStyle = "rgba(20,20,20,0.5)";
        }
        ctx.fillRect(sx, sy, Math.ceil(scale), Math.ceil(scale));
      }
    }

    // Zombies as red dots
    for (const z of zombies) {
      const dx = z.x - player.x;
      const dy = z.y - player.y;
      if (Math.abs(dx) > range || Math.abs(dy) > range) continue;
      const sx = px + dx * scale;
      const sy = py + dy * scale;
      ctx.fillStyle = z.state === "chase" ? "rgba(200,40,30,0.9)" : "rgba(140,80,60,0.7)";
      ctx.fillRect(sx - 1, sy - 1, 2.5, 2.5);
    }

    // Other players as blue dots
    for (const op of otherPlayers) {
      const dx = op.x - player.x;
      const dy = op.y - player.y;
      if (Math.abs(dx) > range || Math.abs(dy) > range) continue;
      const sx = px + dx * scale;
      const sy = py + dy * scale;
      ctx.fillStyle = "rgba(60,140,220,0.9)";
      ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
    }

    // Player as green dot in center
    ctx.fillStyle = "#4aff4a";
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(74,255,74,0.5)";
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawTile(x: number, y: number, kind: string) {
    const sx = x * TILE - this.camera.x;
    const sy = y * TILE - this.camera.y;
    const ctx = this.ctx;
    ctx.fillStyle = tileColors[kind] || "#263321";
    ctx.fillRect(sx, sy, TILE + 1, TILE + 1);

    // Water shimmer
    if (kind === "water") {
      const shimmer = Math.sin(performance.now() * 0.003 + x + y) * 0.15;
      ctx.fillStyle = `rgba(40,80,120,${0.15 + shimmer})`;
      ctx.fillRect(sx, sy, TILE, TILE);
    }
    // Ruin details
    if (kind === "ruin") {
      ctx.fillStyle = "rgba(60,50,35,0.4)";
      ctx.fillRect(sx + 5, sy + 5, 15, 12);
      ctx.fillRect(sx + 22, sy + 15, 10, 10);
      ctx.fillStyle = "rgba(100,80,50,0.3)";
      ctx.fillRect(sx + 8, sy + 20, 8, 8);
    }
    // Rubble details
    if (kind === "rubble") {
      ctx.fillStyle = "rgba(80,65,45,0.3)";
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(sx + ((x * 11 + y * 7 + i * 13) % 30), sy + ((x * 3 + y * 17 + i * 19) % 30), 6, 5);
      }
    }
    // Debris
    if (kind === "debris") {
      ctx.fillStyle = "rgba(90,85,55,0.35)";
      ctx.fillRect(sx + 3, sy + 3, 8, 5);
      ctx.fillRect(sx + 18, sy + 10, 10, 4);
      ctx.fillRect(sx + 8, sy + 25, 12, 6);
    }
    // Bunker
    if (kind === "bunker") {
      ctx.fillStyle = "rgba(30,40,30,0.5)";
      ctx.fillRect(sx + 4, sy + 4, TILE - 8, TILE - 8);
      ctx.strokeStyle = "rgba(74,92,69,0.4)";
      ctx.strokeRect(sx + 4, sy + 4, TILE - 8, TILE - 8);
    }
    // Park grass detail
    if (kind === "park") {
      ctx.fillStyle = "rgba(100,130,90,0.12)";
      ctx.fillRect(sx + ((x * 17 + y * 9) % 28), sy + ((x * 3 + y * 19) % 28), 6, 3);
      ctx.fillRect(sx + ((x * 7 + y * 29) % 28) + 12, sy + ((x * 13 + y * 11) % 28) + 10, 5, 2);
    }

    ctx.strokeStyle = kind === "road" ? "#303030" : "rgba(0,0,0,0.2)";
    ctx.strokeRect(sx, sy, TILE, TILE);
  }

  private drawHouse(house: House, inside: boolean) {
    const { x, y, w, h, barricaded } = house;
    const sx = x * TILE - this.camera.x;
    const sy = y * TILE - this.camera.y;
    const ctx = this.ctx;
    // Flat 2D top-down house. When inside, roof is removed and rooms are visible.
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(sx + 6, sy + 6, w * TILE, h * TILE);
    ctx.fillStyle = inside ? "#2b251d" : "#302c25";
    ctx.fillRect(sx, sy, w * TILE, h * TILE);
    ctx.strokeStyle = inside ? "#5a4a38" : "#1a1713";
    ctx.lineWidth = inside ? 5 : 3;
    ctx.strokeRect(sx, sy, w * TILE, h * TILE);
    if (inside) {
      ctx.strokeStyle = "rgba(15,12,10,0.65)";
      ctx.lineWidth = 2;
      for (let i = 2; i < w; i += 3) {
        ctx.beginPath();
        ctx.moveTo(sx + i * TILE, sy + TILE);
        ctx.lineTo(sx + i * TILE, sy + h * TILE - TILE);
        ctx.stroke();
      }
      ctx.fillStyle = "#1c1712";
      ctx.fillRect(sx + TILE, sy + TILE, TILE * 1.4, TILE * 0.8);
      ctx.fillRect(sx + w * TILE - TILE * 2.3, sy + h * TILE - TILE * 1.6, TILE * 1.3, TILE * 0.75);
    } else {
      ctx.fillStyle = "#3f372d";
      ctx.fillRect(sx + 4, sy + 4, w * TILE - 8, h * TILE - 8);
    }
    const doorSx = house.door.x * TILE - this.camera.x;
    const doorSy = house.door.y * TILE - this.camera.y;
    ctx.fillStyle = "rgba(74,92,69,0.85)";
    ctx.fillRect(doorSx - 18, doorSy - 18, 36, 36);
    ctx.strokeStyle = "#9fb08e";
    ctx.lineWidth = 2;
    ctx.strokeRect(doorSx - 18, doorSy - 18, 36, 36);
    ctx.fillStyle = "#111111";
    ctx.font = "700 10px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText("F", doorSx, doorSy + 3);
    ctx.fillStyle = barricaded ? "#5b3b24" : "#161616";
    ctx.fillRect(doorSx - 8, doorSy - 8, 16, 16);
    ctx.fillStyle = "#1b271b";
    if (!inside) for (let i = 1; i < w; i += 3) ctx.fillRect(sx + i * TILE, sy + 12, 18, 18);
  }

  private drawTree(x: number, y: number, r: number) {
    const sx = x * TILE - this.camera.x;
    const sy = y * TILE - this.camera.y;
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.ellipse(sx + 7, sy + 12, 18 * r, 9 * r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#31281d";
    ctx.fillRect(sx - 3, sy - 7, 6, 20);
    ctx.fillStyle = "#203b20";
    ctx.beginPath();
    ctx.arc(sx, sy - 14, 22 * r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#162b17";
    ctx.beginPath();
    ctx.arc(sx + 10, sy - 4, 15 * r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ============================================================
  //  PLAYER — articulated humanoid
  // ============================================================
  private drawPlayer(player: Player, pNum: 1 | 2 = 1) {
    const sx = player.x * TILE - this.camera.x;
    const sy = player.y * TILE - this.camera.y;
    const ctx = this.ctx;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + 12, 18, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    const legSwing = Math.sin(player.walkCycle) * 0.55;
    const armSwing = Math.sin(player.walkCycle + Math.PI * 0.15) * 0.5;
    const attackSwing = player.attackAnim * 1.4;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(player.angle);

    const hurt = player.hurtCooldown > 0;
    const skinColor = hurt ? "#c4594a" : "#dbc8a6";
    const skinDark = hurt ? "#9e3a2d" : "#c4a880";
    const shirtColor = pNum === 1 ? "#4a5c45" : "#d96b3a";
    const pantsColor = pNum === 1 ? "#2c3528" : "#3c2a1a";
    const bootsColor = "#1a1510";
    const hairColor = pNum === 1 ? "#3a2a1a" : "#1a1a1a";

    // P1 / P2 Marker above head
    ctx.save();
    ctx.rotate(-player.angle);
    ctx.fillStyle = pNum === 1 ? "#4a5c45" : "#d96b3a";
    ctx.font = "900 11px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(`P${pNum}`, 0, -26);
    ctx.restore();

    // Legs
    ctx.save();
    ctx.save();
    ctx.translate(-4, 6);
    ctx.rotate(legSwing);
    ctx.fillStyle = pantsColor;
    this.roundRect(-3, 0, 6, 14, 2);
    ctx.fillStyle = bootsColor;
    this.roundRect(-3, 12, 7, 6, 2);
    ctx.restore();
    ctx.save();
    ctx.translate(4, 6);
    ctx.rotate(-legSwing);
    ctx.fillStyle = pantsColor;
    this.roundRect(-3, 0, 6, 14, 2);
    ctx.fillStyle = bootsColor;
    this.roundRect(-3, 12, 7, 6, 2);
    ctx.restore();
    ctx.restore();

    // Torso
    ctx.fillStyle = shirtColor;
    this.roundRect(-8, -10, 16, 18, 3);
    ctx.fillStyle = "#3a4a36";
    this.roundRect(-5, -10, 10, 4, 1);
    ctx.fillStyle = "#2a1d12";
    ctx.fillRect(-8, 6, 16, 3);

    // Hands, arm pose and grip now adapt to the equipped weapon.
    const equipped = pNum === 1 ? this.equippedP1 : this.equippedP2;
    this.drawPlayerHandsAndWeapon(equipped, shirtColor, skinColor, armSwing, attackSwing);

    // Head
    ctx.save();
    ctx.translate(0, -15);
    if (this.fx.bigHead) ctx.scale(1.9, 1.9);
    ctx.fillStyle = skinDark;
    ctx.fillRect(-3, 2, 6, 5);
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.ellipse(0, -3, 8, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    ctx.ellipse(0, -7, 8.5, 6, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skinDark;
    ctx.beginPath();
    ctx.ellipse(8, -2, 2.5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.ellipse(4, -3, 1.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  /**
   * Draws anatomically different hand/grip poses per weapon family.
   * Local +X is the aim direction after the player's body rotation.
   */
  private drawPlayerHandsAndWeapon(item: Item | null, shirtColor: string, skinColor: string, armSwing: number, attackSwing: number) {
    const ctx = this.ctx;
    const name = item?.name.toLowerCase() ?? "";
    const tags = item?.tags ?? [];
    const firearm = item?.weapon?.mode === "firearm";
    const has = (value: string) => tags.some((tag) => tag.toLowerCase().includes(value)) || name.includes(value);
    const shotgun = has("shotgun") || has("12g") || has("escopeta") || has("espingarda");
    const rifle = has("rifle") || has("carbine") || has("fuzil") || has("sniper") || has("m16") || has("ak-");
    const smg = has("smg") || has("submetralhadora") || has("mp5") || has("uzi") || has("vector");
    const bow = has("bow") || has("crossbow") || has("arco") || has("besta");
    const pistol = firearm && !shotgun && !rifle && !smg && !bow;
    const axe = has("axe") || has("machado") || has("machadinha") || has("hatchet");
    const spear = has("spear") || has("lança") || has("polearm") || has("garfo");
    const knife = has("knife") || has("faca") || has("blade") || has("canivete") || has("bisturi");
    const heavy = has("bat") || has("taco") || has("hammer") || has("marreta") || has("blunt") || has("cajado") || has("pipe") || has("cano");

    const arm = (shoulderX: number, shoulderY: number, elbowX: number, elbowY: number, handX: number, handY: number, fist = false) => {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = shirtColor;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(shoulderX, shoulderY);
      ctx.lineTo(elbowX, elbowY);
      ctx.stroke();
      ctx.strokeStyle = skinColor;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(elbowX, elbowY);
      ctx.lineTo(handX, handY);
      ctx.stroke();
      ctx.fillStyle = skinColor;
      ctx.beginPath();
      ctx.arc(handX, handY, fist ? 4 : 3.2, 0, Math.PI * 2);
      ctx.fill();
      if (fist) {
        ctx.strokeStyle = "rgba(70,45,30,0.38)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(handX + 1, handY - 3);
        ctx.lineTo(handX + 1, handY + 3);
        ctx.stroke();
      }
    };

    // Bare hands: both fists are raised in a defensive boxing stance.
    if (!item?.weapon) {
      arm(-5, -7, 2, -8 - armSwing * 2, 10, -6, true);
      arm(-5, 7, 2, 8 + armSwing * 2, 10, 6, true);
      return;
    }

    // Handguns/revolvers: both hands lock around one compact grip.
    if (pistol) {
      const recoil = attackSwing * 2.2;
      arm(-5, -6, 3, -4, 13 - recoil, -1);
      arm(-5, 6, 3, 4, 12 - recoil, 1.5);
      ctx.fillStyle = "#17191c";
      this.roundRect(11 - recoil, -3.5, 15, 6.5, 1.5);
      ctx.fillStyle = "#363b40";
      ctx.fillRect(16 - recoil, -2.3, 12, 3.7);
      ctx.fillStyle = "#151515";
      ctx.save();
      ctx.translate(14 - recoil, 1);
      ctx.rotate(0.42);
      this.roundRect(-2, 0, 5, 10, 1.5);
      ctx.restore();
      return;
    }

    // Bows: left arm holds the frame forward, right hand draws the string.
    if (bow) {
      const draw = Math.max(0, 5 - attackSwing * 3);
      arm(-4, -6, 7, -5, 20, -3);
      arm(-4, 6, 2, 5, 7 + draw, 2);
      ctx.strokeStyle = "#7a5330";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(21, 0, 14, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.strokeStyle = "#d2cab0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(21, -14);
      ctx.lineTo(7 + draw, 2);
      ctx.lineTo(21, 14);
      ctx.stroke();
      ctx.strokeStyle = "#9b7a48";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(7 + draw, 2);
      ctx.lineTo(34, 0);
      ctx.stroke();
      return;
    }

    // Rifles, shotguns and SMGs: support hand moves to the foregrip.
    if (firearm) {
      const recoil = attackSwing * 2.5;
      const compact = smg;
      const frontHand = compact ? 17 : 21;
      arm(-5, -7, 5, -5, frontHand - recoil, -3);
      arm(-5, 7, 2, 6, 10 - recoil, 2);
      // Stock against shoulder.
      ctx.fillStyle = shotgun ? "#6a4528" : "#272b2e";
      this.roundRect(1 - recoil, -3.8, 12, 7.6, 2);
      // Receiver.
      ctx.fillStyle = "#15181a";
      this.roundRect(10 - recoil, -4.5, compact ? 14 : 18, 9, 2);
      ctx.fillStyle = "#484f54";
      ctx.fillRect(13 - recoil, -3, compact ? 10 : 15, 3);
      // Barrel.
      ctx.fillStyle = "#202326";
      ctx.fillRect((compact ? 23 : 27) - recoil, -2, compact ? 10 : shotgun ? 18 : 24, 4);
      ctx.fillStyle = "#0d0f10";
      ctx.fillRect((compact ? 32 : shotgun ? 44 : 49) - recoil, -2.7, 4, 5.4);
      // Pistol grip and magazine.
      ctx.save();
      ctx.translate(12 - recoil, 3);
      ctx.rotate(0.4);
      ctx.fillStyle = "#111";
      this.roundRect(-2, 0, 5, 9, 1.5);
      ctx.restore();
      if (!shotgun) {
        ctx.save();
        ctx.translate(20 - recoil, 4);
        ctx.rotate(compact ? 0.05 : 0.18);
        ctx.fillStyle = "#252a2d";
        this.roundRect(-3, 0, 7, compact ? 9 : 13, 1.5);
        ctx.restore();
      } else {
        ctx.fillStyle = "#815735";
        this.roundRect(24 - recoil, -3.2, 12, 6.4, 2);
      }
      return;
    }

    // Melee weapons share a swing transform, but hand spacing/grip differs.
    ctx.save();
    ctx.rotate(-attackSwing * 0.72);

    if (knife) {
      // One hand grips close to the blade; off-hand stays raised as a guard.
      arm(-5, -6, 3, -7 + armSwing, 11, -4, true);
      arm(-5, 6, 3, 5, 13, 2);
      ctx.fillStyle = "#2b2118";
      this.roundRect(10, 0, 8, 4, 1);
      ctx.fillStyle = "#b8bec0";
      ctx.beginPath();
      ctx.moveTo(17, -1.5);
      ctx.lineTo(31, 1);
      ctx.lineTo(17, 3.5);
      ctx.closePath();
      ctx.fill();
    } else if (axe) {
      // Axe: hands are separated along the long handle for leverage.
      arm(-5, -7, 2, -5, 15, -2);
      arm(-5, 7, 1, 6, 8, 3);
      ctx.strokeStyle = "#70492b";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(6, 3);
      ctx.lineTo(35, -1);
      ctx.stroke();
      ctx.fillStyle = "#8b9295";
      ctx.beginPath();
      ctx.moveTo(30, -9);
      ctx.lineTo(39, -7);
      ctx.lineTo(38, 6);
      ctx.lineTo(31, 5);
      ctx.closePath();
      ctx.fill();
    } else if (spear) {
      // Spear: hands spread far apart and shaft projects well beyond reach.
      arm(-5, -7, 4, -5, 18, -3);
      arm(-5, 7, 1, 6, 9, 3);
      ctx.strokeStyle = "#725033";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(4, 3);
      ctx.lineTo(46, -3);
      ctx.stroke();
      ctx.fillStyle = "#aeb6b8";
      ctx.beginPath();
      ctx.moveTo(44, -7);
      ctx.lineTo(55, -4);
      ctx.lineTo(45, 1);
      ctx.closePath();
      ctx.fill();
    } else if (heavy) {
      // Bats, hammers and blunt weapons use a tight two-handed grip.
      arm(-5, -7, 2, -4, 12, -2);
      arm(-5, 7, 1, 5, 8, 3);
      ctx.strokeStyle = name.includes("metal") || name.includes("pipe") || name.includes("cano") ? "#656d70" : "#6b4528";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(5, 3);
      ctx.lineTo(37, -2);
      ctx.stroke();
      if (name.includes("hammer") || name.includes("marreta")) {
        ctx.fillStyle = "#555c60";
        this.roundRect(32, -8, 12, 11, 2);
      }
    } else {
      // Generic one-handed item/tool.
      arm(-5, -7, 2, -7 - armSwing, 9, -5, true);
      arm(-5, 7, 3, 5, 13, 2);
      ctx.fillStyle = "#555d60";
      this.roundRect(12, 0, 18, 5, 1.5);
    }
    ctx.restore();
  }

  // ============================================================
  //  OTHER ONLINE PLAYER — blue tint survivor
  // ============================================================
  private drawVehicle(veh: { x: number; y: number; angle: number; color: string; accentColor?: string; width?: number; height?: number; name: string; type?: string; fuel?: number; durability?: number; speed?: number }) {
    const sx = veh.x * TILE - this.camera.x;
    const sy = veh.y * TILE - this.camera.y;
    const ctx = this.ctx;
    const w = (veh.width ?? 2) * TILE;
    const h = (veh.height ?? 4) * TILE;
    const isBike = w <= TILE * 1.2;
    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(sx + 5, sy + 7, h * 0.52, w * 0.55, veh.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(veh.angle);

    if (isBike) {
      ctx.strokeStyle = "#090909";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(-h * 0.38, 0, w * 0.34, 0, Math.PI * 2);
      ctx.arc(h * 0.38, 0, w * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = veh.color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-h * 0.25, 0);
      ctx.lineTo(h * 0.25, 0);
      ctx.stroke();
      ctx.fillStyle = veh.accentColor ?? veh.color;
      this.roundRect(-h * 0.12, -w * 0.28, h * 0.28, w * 0.56, 3);
      ctx.restore();
      ctx.fillStyle = "rgba(217,107,58,0.9)";
      ctx.font = "700 9px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`[V] ${veh.name}`, sx, sy - Math.max(w, h) / 2 - 8);
      return;
    }

    // Body base
    ctx.fillStyle = veh.color;
    this.roundRect(-h / 2, -w / 2, h, w, 8);
    ctx.fillStyle = veh.accentColor ?? "rgba(0,0,0,0.28)";
    this.roundRect(-h * 0.40, -w * 0.38, h * 0.80, w * 0.76, 6);
    ctx.fillStyle = veh.color;
    this.roundRect(h * 0.18, -w * 0.42, h * 0.25, w * 0.84, 5);
    this.roundRect(-h * 0.43, -w * 0.38, h * 0.22, w * 0.76, 4);
    // Windows
    ctx.fillStyle = "rgba(24,40,58,0.88)";
    this.roundRect(-h * 0.10, -w * 0.35, h * 0.22, w * 0.70, 5);
    ctx.fillStyle = "rgba(14,25,40,0.92)";
    this.roundRect(-h * 0.20, -w * 0.32, h * 0.09, w * 0.64, 3);
    this.roundRect(h * 0.12, -w * 0.30, h * 0.08, w * 0.60, 3);
    // Wheels
    ctx.fillStyle = "#070707";
    const ww = w * 0.18;
    const wh = h * 0.18;
    this.roundRect(-h * 0.35, -w * 0.59, wh, ww, 3);
    this.roundRect(h * 0.18, -w * 0.59, wh, ww, 3);
    this.roundRect(-h * 0.35, w * 0.41, wh, ww, 3);
    this.roundRect(h * 0.18, w * 0.41, wh, ww, 3);
    // Lights
    ctx.fillStyle = "#ffe88a";
    ctx.fillRect(h / 2 - 5, -w * 0.33, 4, w * 0.18);
    ctx.fillRect(h / 2 - 5, w * 0.15, 4, w * 0.18);
    ctx.fillStyle = "#9b1c15";
    ctx.fillRect(-h / 2 + 2, -w * 0.33, 4, w * 0.18);
    ctx.fillRect(-h / 2 + 2, w * 0.15, 4, w * 0.18);
    if ((veh.durability ?? 100) < 45) {
      ctx.strokeStyle = "rgba(220,220,180,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-h * 0.1, -w * 0.33);
      ctx.lineTo(h * 0.12, w * 0.18);
      ctx.stroke();
    }
    // Border
    ctx.strokeStyle = "#0d0d0d";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-h / 2, -w / 2, h, w);
    ctx.restore();
    // Name
    ctx.fillStyle = "rgba(217,107,58,0.9)";
    ctx.font = "700 9px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(`[V] ${veh.name}`, sx, sy - Math.max(w, h) / 2 - 8);
  }

  private drawFirstPersonDashboard(vehicle: { name: string; emoji: string; fuel: number; maxFuel: number; durability: number; maxDur: number; speed: number; rarity: string }, steeringAngle: number) {
    const ctx = this.ctx;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const dashH = Math.min(190, height * 0.34);
    const y = height - dashH;

    // Windshield dark gradient and dashboard.
    const cabin = ctx.createLinearGradient(0, y, 0, height);
    cabin.addColorStop(0, "rgba(5,5,5,0.02)");
    cabin.addColorStop(0.34, "rgba(8,8,8,0.80)");
    cabin.addColorStop(1, "rgba(0,0,0,0.98)");
    ctx.fillStyle = cabin;
    ctx.fillRect(0, y, width, dashH);
    ctx.fillStyle = "#151515";
    this.roundRect(width * 0.08, y + dashH * 0.34, width * 0.84, dashH * 0.56, 18);
    ctx.fillStyle = "#242424";
    this.roundRect(width * 0.12, y + dashH * 0.40, width * 0.76, dashH * 0.28, 12);

    // Steering wheel.
    const cx = width * 0.50;
    const cy = height - dashH * 0.26;
    const r = Math.min(64, width * 0.16);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(steeringAngle * 0.35);
    ctx.strokeStyle = "#050505";
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#090909";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-r * 0.82, -r * 0.18);
    ctx.moveTo(0, 0);
    ctx.lineTo(r * 0.82, -r * 0.18);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, r * 0.9);
    ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Gauges.
    const gaugeY = y + dashH * 0.50;
    this.drawGauge(width * 0.30, gaugeY, 38, Math.min(1, vehicle.speed / 18), "SPD", `${Math.round(vehicle.speed * 10)}`);
    this.drawGauge(width * 0.70, gaugeY, 38, vehicle.fuel / Math.max(1, vehicle.maxFuel), "FUEL", `${Math.round(vehicle.fuel)}`);

    // Vehicle info panel.
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    this.roundRect(width * 0.33, y + 12, width * 0.34, 44, 8);
    ctx.fillStyle = "#d96b3a";
    ctx.font = "900 13px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${vehicle.emoji} ${vehicle.name}`, width / 2, y + 31);
    ctx.fillStyle = vehicle.durability / Math.max(1, vehicle.maxDur) < 0.35 ? "#e14b3b" : "#7f936f";
    ctx.font = "700 10px 'Courier New', monospace";
    ctx.fillText(`DUR ${Math.round(vehicle.durability)}% | ${vehicle.rarity}`, width / 2, y + 47);
  }

  private drawGauge(x: number, y: number, r: number, value: number, label: string, text: string) {
    const ctx = this.ctx;
    const clamped = Math.max(0, Math.min(1, value));
    ctx.fillStyle = "#080808";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI * 0.78, Math.PI * 2.22);
    ctx.stroke();
    ctx.strokeStyle = clamped < 0.2 ? "#e14b3b" : "#d96b3a";
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI * 0.78, Math.PI * (0.78 + 1.44 * clamped));
    ctx.stroke();
    ctx.fillStyle = "#d7c9a7";
    ctx.font = "900 13px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(text, x, y + 3);
    ctx.fillStyle = "#777";
    ctx.font = "700 8px 'Courier New', monospace";
    ctx.fillText(label, x, y + 18);
  }

  private drawOtherPlayer(op: OnlinePlayer) {
    const sx = op.x * TILE - this.camera.x;
    const sy = op.y * TILE - this.camera.y;
    const ctx = this.ctx;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + 12, 18, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    const skinColor = "#dbc8a6";
    const skinDark = "#c4a880";
    const shirtColor = "#3a5a6c"; // blue shirt to distinguish
    const pantsColor = "#2c3528";
    const bootsColor = "#1a1510";
    const hairColor = "#3a2a1a";

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(op.angle);

    // Legs
    ctx.save();
    ctx.save();
    ctx.translate(-4, 6);
    ctx.rotate(0);
    ctx.fillStyle = pantsColor;
    this.roundRect(-3, 0, 6, 14, 2);
    ctx.fillStyle = bootsColor;
    this.roundRect(-3, 12, 7, 6, 2);
    ctx.restore();
    ctx.save();
    ctx.translate(4, 6);
    ctx.rotate(0);
    ctx.fillStyle = pantsColor;
    this.roundRect(-3, 0, 6, 14, 2);
    ctx.fillStyle = bootsColor;
    this.roundRect(-3, 12, 7, 6, 2);
    ctx.restore();
    ctx.restore();

    // Torso
    ctx.fillStyle = shirtColor;
    this.roundRect(-8, -10, 16, 18, 3);
    ctx.fillStyle = "#2a4a5c";
    this.roundRect(-5, -10, 10, 4, 1);
    ctx.fillStyle = "#2a1d12";
    ctx.fillRect(-8, 6, 16, 3);

    // Arms
    ctx.save();
    ctx.translate(-9, -6);
    ctx.fillStyle = shirtColor;
    this.roundRect(-3, 0, 6, 11, 2);
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(0, 13, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(9, -6);
    ctx.fillStyle = shirtColor;
    this.roundRect(-3, 0, 6, 11, 2);
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(0, 13, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Head
    ctx.save();
    ctx.translate(0, -15);
    ctx.fillStyle = skinDark;
    ctx.fillRect(-3, 2, 6, 5);
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.ellipse(0, -3, 8, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    ctx.ellipse(0, -7, 8.5, 6, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // Name tag with background
    ctx.font = "700 9px 'Courier New', monospace";
    ctx.textAlign = "center";
    const nameWidth = ctx.measureText(op.name).width;
    ctx.fillStyle = "rgba(10,10,10,0.75)";
    ctx.fillRect(sx - nameWidth / 2 - 4, sy - 36, nameWidth + 8, 14);
    ctx.strokeStyle = "rgba(58,90,108,0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - nameWidth / 2 - 4, sy - 36, nameWidth + 8, 14);
    ctx.fillStyle = "#5a8aaa";
    ctx.fillText(op.name, sx, sy - 26);

    // Health bar above name
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(sx - 16, sy - 38, 32, 4);
    ctx.fillStyle = op.health > 60 ? "#4a5c45" : op.health > 30 ? "#8a6a2a" : "#b0412d";
    ctx.fillRect(sx - 16, sy - 38, 32 * (op.health / 100), 4);

    // Kill count
    if (op.kills > 0) {
      ctx.fillStyle = "rgba(217,107,58,0.8)";
      ctx.font = "700 8px 'Courier New', monospace";
      ctx.fillText(`${op.kills} kills`, sx, sy - 42);
    }
  }

  // ============================================================
  //  ZOMBIE — articulated humanoid, torn, grim
  // ============================================================
  private drawZombie(zombie: Zombie) {
    const sx = zombie.x * TILE - this.camera.x;
    const sy = zombie.y * TILE - this.camera.y;
    const ctx = this.ctx;

    const actorScale = zombie.scale ?? 1;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + 12, 16 * actorScale, 8 * actorScale, 0, 0, Math.PI * 2);
    ctx.fill();

    const legSwing = Math.sin(zombie.walkCycle) * 0.4;
    const armSwing = Math.sin(zombie.walkCycle * 0.9 + 0.4) * 0.35;
    const lurch = Math.sin(zombie.walkCycle * 0.6) * 0.1;
    const v = zombie.variant % zombieSkinColors.length;
    const outfit = ZOMBIE_OUTFITS[(zombie.outfit ?? 0) % ZOMBIE_OUTFITS.length];
    const skinColor = outfit?.skin ?? zombieSkinColors[v];
    const shirtColor = outfit?.shirt ?? zombieShirtColors[v];
    const shirtAlt = outfit?.shirtAlt ?? shirtColor;
    const pantsColor = outfit?.pants ?? zombiePantsColors[v];
    const shoeColor = outfit?.shoes ?? "#3a3a28";
    const hairColor = outfit?.hair ?? "#241c14";
    const chasing = zombie.state === "chase";

    // Admin dance bounce
    const dancing = zombie.danceUntil > performance.now();
    const bounce = dancing ? Math.abs(Math.sin(performance.now() * 0.012 + zombie.x)) * 7 : 0;

    ctx.save();
    ctx.translate(sx, sy - bounce);
    ctx.rotate(zombie.faceAngle + lurch + (dancing ? Math.sin(performance.now() * 0.01 + zombie.y) * 0.25 : 0));
    ctx.scale(actorScale, actorScale);

    // Legs
    ctx.save();
    ctx.save();
    ctx.translate(-3.5, 6);
    ctx.rotate(legSwing * 0.8);
    ctx.fillStyle = pantsColor;
    this.roundRect(-2.5, 0, 5, 13, 2);
    ctx.fillStyle = shoeColor;
    this.roundRect(-2.5, 11, 6, 5, 1);
    ctx.restore();
    ctx.save();
    ctx.translate(3.5, 6);
    ctx.rotate(-legSwing * 0.8);
    ctx.fillStyle = pantsColor;
    this.roundRect(-2.5, 0, 5, 13, 2);
    ctx.fillStyle = shoeColor;
    this.roundRect(-2.5, 11, 6, 5, 1);
    ctx.restore();
    ctx.restore();

    // Torso
    ctx.fillStyle = shirtColor;
    this.roundRect(-7, -9, 14, 17, 3);
    // Shading down the side gives the shirt volume
    ctx.fillStyle = shirtAlt;
    this.roundRect(1.5, -9, 5.5, 17, 3);

    // Accessories worn over the torso
    const acc = outfit?.accessory ?? "none";
    const accColor = outfit?.accessoryColor ?? "#000";
    if (acc === "vest") {
      ctx.fillStyle = accColor;
      this.roundRect(-7.5, -8, 4, 15, 2);
      this.roundRect(3.5, -8, 4, 15, 2);
    } else if (acc === "apron") {
      ctx.fillStyle = accColor;
      this.roundRect(-5, -6, 10, 14, 2);
    } else if (acc === "tie") {
      ctx.fillStyle = accColor;
      this.roundRect(-1.2, -8, 2.4, 10, 1);
    } else if (acc === "collar") {
      ctx.fillStyle = accColor;
      this.roundRect(-3, -9, 6, 2.4, 1);
    } else if (acc === "badge") {
      ctx.fillStyle = accColor;
      this.roundRect(-5.5, -6, 3, 3, 1);
    } else if (acc === "backpack") {
      ctx.fillStyle = accColor;
      this.roundRect(-8.5, -6, 3.5, 12, 2);
    } else if (acc === "scarf") {
      ctx.fillStyle = accColor;
      this.roundRect(-6, -10, 12, 3, 1.5);
    }

    // Exposed rotting flesh through torn clothes
    ctx.fillStyle = skinColor;
    ctx.fillRect(-4, -2, 3, 5);
    ctx.fillRect(2, 3, 4, 3);

    // Blood stains on outfits marked as bloody
    if (outfit?.bloody) {
      ctx.fillStyle = "rgba(110, 18, 14, 0.45)";
      ctx.beginPath();
      ctx.arc(-3, -4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(3.5, 4, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (chasing) {
      ctx.fillStyle = "rgba(120, 20, 15, 0.55)";
      ctx.beginPath();
      ctx.arc(-2, 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Left arm
    ctx.save();
    ctx.translate(-8, -5);
    ctx.rotate(-armSwing + 0.3);
    ctx.fillStyle = shirtColor;
    this.roundRect(-2.5, 0, 5, 10, 2);
    ctx.fillStyle = skinColor;
    this.roundRect(-2, 9, 4, 7, 2);
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(0, 17, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = skinColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-2, 19); ctx.lineTo(-4, 23);
    ctx.moveTo(0, 19); ctx.lineTo(0, 24);
    ctx.moveTo(2, 19); ctx.lineTo(3, 23);
    ctx.stroke();
    ctx.restore();

    // Right arm
    ctx.save();
    ctx.translate(8, -5);
    ctx.rotate(armSwing - 0.2);
    ctx.fillStyle = shirtColor;
    this.roundRect(-2.5, 0, 5, 10, 2);
    ctx.fillStyle = skinColor;
    this.roundRect(-2, 9, 4, 7, 2);
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(0, 17, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = skinColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-2, 19); ctx.lineTo(-4, 23);
    ctx.moveTo(0, 19); ctx.lineTo(0, 24);
    ctx.moveTo(2, 19); ctx.lineTo(3, 23);
    ctx.stroke();
    ctx.restore();

    // Head
    ctx.save();
    ctx.translate(0, -14);
    if (this.fx.bigHead) ctx.scale(1.9, 1.9);
    ctx.fillStyle = skinColor;
    ctx.fillRect(-2.5, 2, 5, 5);
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.ellipse(0, -3, 7, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a12";
    ctx.beginPath();
    ctx.ellipse(-3, -4, 2.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(3, -4, 2.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (chasing) {
      ctx.fillStyle = "#cc3322";
      ctx.beginPath();
      ctx.arc(-3, -4, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(3, -4, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#2a1510";
    ctx.beginPath();
    ctx.ellipse(0, 2, 3.5, 2, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = "rgba(130, 25, 15, 0.7)";
    ctx.fillRect(-1, 3, 2, 4);

    // Hair tufts (color varies per outfit)
    ctx.strokeStyle = hairColor;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-5, -9); ctx.lineTo(-7, -14);
    ctx.moveTo(-2, -10); ctx.lineTo(-3, -15);
    ctx.moveTo(2, -10); ctx.lineTo(4, -15);
    ctx.moveTo(5, -9); ctx.lineTo(7, -13);
    ctx.stroke();

    // Headgear
    if (acc === "cap") {
      ctx.fillStyle = accColor;
      this.roundRect(-7, -11, 14, 5, 2);
      ctx.fillRect(2, -9, 7, 2.2);
    } else if (acc === "hat") {
      ctx.fillStyle = accColor;
      this.roundRect(-9, -9, 18, 2.4, 1);
      this.roundRect(-5, -14, 10, 6, 2);
    } else if (acc === "hardhat") {
      ctx.fillStyle = accColor;
      ctx.beginPath();
      ctx.ellipse(0, -8, 8, 6.5, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-9, -8.5, 18, 2);
    } else if (acc === "helmet") {
      ctx.fillStyle = accColor;
      ctx.beginPath();
      ctx.ellipse(0, -5, 8.5, 8.5, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-8.5, -5.5, 17, 2.5);
    } else if (acc === "beanie") {
      ctx.fillStyle = accColor;
      ctx.beginPath();
      ctx.ellipse(0, -7, 7.5, 6, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-7.5, -7.5, 15, 2.5);
    } else if (acc === "hood") {
      ctx.fillStyle = accColor;
      ctx.beginPath();
      ctx.ellipse(0, -4, 9.5, 9.5, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    } else if (acc === "bandana") {
      ctx.fillStyle = accColor;
      ctx.fillRect(-7.5, -9, 15, 3);
    } else if (acc === "mask") {
      ctx.fillStyle = accColor;
      this.roundRect(-5, -1, 10, 5, 1.5);
    }

    ctx.restore();

    ctx.restore();

    // Custom name tag (admin-renamed zombies)
    if (zombie.renamed && zombie.customName) {
      ctx.font = "700 10px 'Courier New', monospace";
      ctx.textAlign = "center";
      const label = zombie.customName;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(8,8,8,0.8)";
      ctx.fillRect(sx - tw / 2 - 4, sy - 34 * actorScale - bounce, tw + 8, 14);
      ctx.strokeStyle = "#ffd24a";
      ctx.strokeRect(sx - tw / 2 - 4, sy - 34 * actorScale - bounce, tw + 8, 14);
      ctx.fillStyle = "#ffd24a";
      ctx.fillText(label, sx, sy - 23 * actorScale - bounce);
    }
  }

  private drawAimLine(player: Player, _pNum: 1 | 2 = 1) {
    const sx = player.x * TILE - this.camera.x;
    const sy = player.y * TILE - this.camera.y;
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(216, 119, 73, 0.32)";
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(this.mouse.x, this.mouse.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(216, 119, 73, 0.6)";
    ctx.lineWidth = 1.5;
    const mx = this.mouse.x;
    const my = this.mouse.y;
    ctx.beginPath();
    ctx.moveTo(mx - 8, my); ctx.lineTo(mx - 3, my);
    ctx.moveTo(mx + 3, my); ctx.lineTo(mx + 8, my);
    ctx.moveTo(mx, my - 8); ctx.lineTo(mx, my - 3);
    ctx.moveTo(mx, my + 3); ctx.lineTo(mx, my + 8);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  private applyLight(hour: number, player: Player) {
    const ctx = this.ctx;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const night = hour < 6 || hour > 20;
    const dusk = hour < 8 || hour > 18;
    const alpha = night ? 0.64 : dusk ? 0.3 : 0.08;
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.fillRect(0, 0, width, height);
    if (night) {
      const px = player.x * TILE - this.camera.x;
      const py = player.y * TILE - this.camera.y;
      const gradient = ctx.createRadialGradient(px, py, 20, px, py, 220);
      gradient.addColorStop(0, "rgba(180,150,90,0.24)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  private drawVignette(color: string) {
    const ctx = this.ctx;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 80, width / 2, height / 2, Math.max(width, height) / 1.2);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, color);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  private drawPause() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    ctx.fillStyle = "#d96b3a";
    ctx.font = "700 34px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", this.canvas.clientWidth / 2, this.canvas.clientHeight / 2);
  }

  private onScreen(x: number, y: number, width: number, height: number) {
    const sx = x * TILE - this.camera.x;
    const sy = y * TILE - this.camera.y;
    return sx > -80 && sy > -80 && sx < width + 80 && sy < height + 80;
  }

  private houseOnScreen(x: number, y: number, w: number, h: number, screenW: number, screenH: number) {
    const sx = x * TILE - this.camera.x;
    const sy = y * TILE - this.camera.y;
    const ex = (x + w) * TILE - this.camera.x;
    const ey = (y + h) * TILE - this.camera.y;
    return ex > -40 && ey > -40 && sx < screenW + 40 && sy < screenH + 40;
  }

  /** Helper: draw a rounded rectangle */
  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }
}
