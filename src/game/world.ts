// ============================================================
//  WORLD - Infinite-feel 9999x9999 procedural Knox County
//  Uses chunk-based lazy generation so only nearby tiles exist
//  in memory. A seeded hash determines tile types, houses,
//  roads, trees and forests deterministically.
// ============================================================

import { randomLoot } from "./items";
import type { House, SandboxOptions, TileKind } from "./types";

export const WORLD_SIZE = 9999;
export const TILE = 42;

// Chunk = 32x32 tiles. Only chunks near the player are alive.
const CHUNK_SIZE = 32;
const CHUNK_COUNT = Math.ceil(WORLD_SIZE / CHUNK_SIZE); // 313 chunks per axis
const LOAD_RADIUS = 3; // load 7x7 chunks around player = 224x224 tiles

// ============================================================
//  Deterministic hash (fast, seedable, no randomness needed)
// ============================================================
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
  h = (h ^ (h >> 13)) * 1103515245;
  h = (h ^ (h >> 16)) * 2654435769;
  return ((h ^ (h >> 13)) >>> 0) / 4294967296; // 0..1
}

function hashInt(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
  h = (h ^ (h >> 13)) * 1103515245;
  h = (h ^ (h >> 16)) * 2654435769;
  return (h ^ (h >> 13)) >>> 0;
}

// ============================================================
//  Chunk data structure
// ============================================================
interface Chunk {
  cx: number;
  cy: number;
  tiles: TileKind[];       // CHUNK_SIZE * CHUNK_SIZE flat array
  houses: House[];
  trees: { x: number; y: number; r: number }[];
  generated: boolean;
}

// ============================================================
//  Main World class
// ============================================================
export class World {
  private chunks = new Map<string, Chunk>();
  private cutTreeKeys = new Set<string>();
  private seed: number;
  private lootMultiplier: number;

  constructor(options: SandboxOptions) {
    this.seed = 42;
    this.lootMultiplier = options.loot;
  }

  // --- Public API (used by renderer and engine) ---

  /** Check if coordinates are within world bounds */
  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < WORLD_SIZE && y < WORLD_SIZE;
  }

  /** Get tile kind at world position (generates chunk if needed) */
  tileAt(x: number, y: number): TileKind {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!this.inBounds(tx, ty)) return "fence";
    const chunk = this.ensureChunk(Math.floor(tx / CHUNK_SIZE), Math.floor(ty / CHUNK_SIZE));
    const lx = tx - chunk.cx * CHUNK_SIZE;
    const ly = ty - chunk.cy * CHUNK_SIZE;
    if (this.isGateAt(tx, ty)) return "grass";
    return chunk.tiles[ly * CHUNK_SIZE + lx];
  }

  /** Is tile blocked for movement? */
  isBlocked(x: number, y: number): boolean {
    const tile = this.tileAt(x, y);
    return tile === "fence" || tile === "water" || !this.inBounds(Math.floor(x), Math.floor(y));
  }

  /** Can a zombie pass through this tile? */
  isZombieBlocked(x: number, y: number): boolean {
    const tile = this.tileAt(x, y);
    return tile === "fence" || tile === "water" || !this.inBounds(Math.floor(x), Math.floor(y));
  }

  /** Every generated house has a gate centered at its door. */
  isGateAt(x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    for (const chunk of this.chunks.values()) {
      for (const house of chunk.houses) {
        if (Math.abs(tx - house.door.x) <= 1 && Math.abs(ty - house.door.y) <= 1) return true;
      }
    }
    return false;
  }

  /** Find house at position (only searches loaded chunks) */
  houseAt(x: number, y: number): House | null {
    for (const chunk of this.chunks.values()) {
      for (const house of chunk.houses) {
        if (x >= house.x && x <= house.x + house.w && y >= house.y && y <= house.y + house.h) {
          return house;
        }
      }
    }
    return null;
  }

  /** Get all houses in loaded chunks */
  private _housesCache: House[] = [];
  private _housesCacheVersion = -1;

  get houses(): House[] {
    if (this._housesCacheVersion === this.chunks.size) return this._housesCache;
    const result: House[] = [];
    for (const chunk of this.chunks.values()) {
      result.push(...chunk.houses);
    }
    this._housesCache = result;
    this._housesCacheVersion = this.chunks.size;
    return result;
  }

  /** Get all trees in loaded chunks */
  private _treesCache: { x: number; y: number; r: number }[] = [];
  private _treesCacheVersion = -1;

  get trees(): { x: number; y: number; r: number }[] {
    if (this._treesCacheVersion === this.chunks.size) return this._treesCache;
    const result: { x: number; y: number; r: number }[] = [];
    for (const chunk of this.chunks.values()) {
      result.push(...chunk.trees);
    }
    this._treesCache = result;
    this._treesCacheVersion = this.chunks.size;
    return result;
  }

  /**
   * Load chunks around a world position and unload distant ones.
   * Called every frame from the engine.
   */
  updateLoadedChunks(px: number, py: number): void {
    const ccx = Math.floor(px / CHUNK_SIZE);
    const ccy = Math.floor(py / CHUNK_SIZE);

    // Ensure nearby chunks are generated
    for (let dy = -LOAD_RADIUS; dy <= LOAD_RADIUS; dy++) {
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
        const cx = ccx + dx;
        const cy = ccy + dy;
        if (cx >= 0 && cy >= 0 && cx < CHUNK_COUNT && cy < CHUNK_COUNT) {
          this.ensureChunk(cx, cy);
        }
      }
    }

    // Unload far chunks (keep a generous buffer)
    const UNLOAD_RADIUS = LOAD_RADIUS + 4;
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - ccx) > UNLOAD_RADIUS || Math.abs(chunk.cy - ccy) > UNLOAD_RADIUS) {
        this.chunks.delete(key);
      }
    }
  }

  /** Get the tiles array for a chunk (for the renderer) */
  getChunkTiles(cx: number, cy: number): TileKind[] | null {
    return this.chunks.get(`${cx},${cy}`)?.tiles ?? null;
  }

  /** Iterate loaded chunks for rendering */
  forEachLoadedChunk(fn: (chunk: { cx: number; cy: number; tiles: TileKind[]; houses: House[]; trees: { x: number; y: number; r: number }[] }) => void): void {
    for (const chunk of this.chunks.values()) {
      fn(chunk);
    }
  }

  /** Cut the nearest loaded tree and return how many logs it produced. */
  hasTreeNear(x: number, y: number, radius: number): boolean {
    for (const chunk of this.chunks.values()) {
      for (const tree of chunk.trees) {
        if (Math.hypot(tree.x - x, tree.y - y) < radius) return true;
      }
    }
    return false;
  }

  /** Cut the nearest loaded tree and return how many logs it produced. */
  cutNearestTree(x: number, y: number, radius: number): number {
    let bestChunk: Chunk | null = null;
    let bestIndex = -1;
    let bestDistance = Infinity;
    for (const chunk of this.chunks.values()) {
      for (let i = 0; i < chunk.trees.length; i++) {
        const tree = chunk.trees[i];
        const distance = Math.hypot(tree.x - x, tree.y - y);
        if (distance < radius && distance < bestDistance) {
          bestChunk = chunk;
          bestIndex = i;
          bestDistance = distance;
        }
      }
    }
    if (!bestChunk || bestIndex < 0) return 0;
    const [tree] = bestChunk.trees.splice(bestIndex, 1);
    this.cutTreeKeys.add(this.treeKey(tree.x, tree.y));
    return tree.r > 0.75 ? 3 : 2;
  }

  // ============================================================
  //  Chunk generation — pure deterministic from seed + position
  // ============================================================
  private ensureChunk(cx: number, cy: number): Chunk {
    const key = `${cx},${cy}`;
    let chunk = this.chunks.get(key);
    if (chunk) return chunk;

    chunk = {
      cx,
      cy,
      tiles: new Array(CHUNK_SIZE * CHUNK_SIZE).fill("grass"),
      houses: [],
      trees: [],
      generated: false,
    };
    this.chunks.set(key, chunk);
    this.generateChunk(chunk);
    return chunk;
  }

  private generateChunk(chunk: Chunk): void {
    if (chunk.generated) return;
    chunk.generated = true;

    const baseX = chunk.cx * CHUNK_SIZE;
    const baseY = chunk.cy * CHUNK_SIZE;

    // --- Step 1: Base terrain (grass / forest biome) ---
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx;
        const wy = baseY + ly;
        const biome = this.getBiome(wx, wy);
        chunk.tiles[ly * CHUNK_SIZE + lx] = biome;
      }
    }

    // --- Step 2: Roads (grid system every ~60 tiles) ---
    this.generateRoads(chunk, baseX, baseY);

    // --- Step 3: Houses in residential zones ---
    this.generateHouses(chunk, baseX, baseY);

    // --- Step 4: Trees in forest/grass zones ---
    this.generateTrees(chunk, baseX, baseY);
  }

  /** Biome determination — creates large-scale regions */
  private getBiome(wx: number, wy: number): TileKind {
    // Use multi-octave noise-like hash for natural regions
    const scale1 = 0.007;
    const scale2 = 0.023;
    const v1 = hash(Math.floor(wx * scale1), Math.floor(wy * scale1), this.seed);
    const v2 = hash(Math.floor(wx * scale2), Math.floor(wy * scale2), this.seed + 999);
    const v3 = hash(Math.floor(wx * 0.031), Math.floor(wy * 0.031), this.seed + 555);
    const combined = v1 * 0.65 + v2 * 0.35;

    // Edges of map are always forest (wilderness border)
    const edgeDist = Math.min(wx, wy, WORLD_SIZE - wx, WORLD_SIZE - wy);
    if (edgeDist < 40) return "forest";

    // Water bodies (rivers, ponds)
    const waterScale = 0.04;
    const waterHash = hash(Math.floor(wx * waterScale), Math.floor(wy * waterScale), this.seed + 1234);
    if (waterHash > 0.82 && waterHash < 0.87) return "water";

    // Ruins zone
    const ruinScale = 0.015;
    const ruinHash = hash(Math.floor(wx * ruinScale), Math.floor(wy * ruinScale), this.seed + 2345);
    if (ruinHash > 0.88 && ruinHash < 0.92) return "ruin";

    // Park areas
    const parkHash = hash(Math.floor(wx * 0.02), Math.floor(wy * 0.02), this.seed + 3456);
    if (parkHash > 0.92 && parkHash < 0.95) return "park";

    // Debris/scrapyard
    const debrisHash = hash(Math.floor(wx * 0.03), Math.floor(wy * 0.03), this.seed + 4567);
    if (debrisHash > 0.95 && debrisHash < 0.97) return "debris";

    if (combined < 0.28) return "forest";
    if (combined > 0.72 && v3 > 0.6) return "rubble";
    return "grass";
  }

  /** Road generation — consistent grid with some variety */
  private generateRoads(chunk: Chunk, baseX: number, baseY: number): void {
    // Major roads every 60 tiles, minor roads every 30
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx;
        const wy = baseY + ly;

        // Major horizontal roads
        const majorH = wy % 60;
        if (majorH >= 0 && majorH < 4) {
          chunk.tiles[ly * CHUNK_SIZE + lx] = "road";
          continue;
        }

        // Major vertical roads
        const majorV = wx % 60;
        if (majorV >= 0 && majorV < 4) {
          chunk.tiles[ly * CHUNK_SIZE + lx] = "road";
          continue;
        }

        // Minor roads every 30 tiles (only in residential zones, not forest)
        const tile = chunk.tiles[ly * CHUNK_SIZE + lx];
        if (tile !== "forest") {
          const minorH = wy % 30;
          const minorV = wx % 30;
          if (minorH >= 0 && minorH < 2) {
            chunk.tiles[ly * CHUNK_SIZE + lx] = "road";
            continue;
          }
          if (minorV >= 0 && minorV < 2) {
            chunk.tiles[ly * CHUNK_SIZE + lx] = "road";
            continue;
          }
        }
      }
    }
  }

  /** House generation — fills residential blocks */
  private generateHouses(chunk: Chunk, baseX: number, baseY: number): void {
    // We generate houses at deterministic positions within each city block.
    // A "block" is the area between roads (approx 26x26 usable space in a 30x30 grid).
    // We try to place 2-5 houses per block.

    // Find which city blocks overlap this chunk
    const blockSize = 30;
    const startBlockX = Math.floor(baseX / blockSize);
    const startBlockY = Math.floor(baseY / blockSize);
    const endBlockX = Math.floor((baseX + CHUNK_SIZE - 1) / blockSize);
    const endBlockY = Math.floor((baseY + CHUNK_SIZE - 1) / blockSize);

    for (let by = startBlockY; by <= endBlockY; by++) {
      for (let bx = startBlockX; bx <= endBlockX; bx++) {
        this.generateBlockHouses(chunk, bx, by, baseX, baseY);
      }
    }
  }

  private generateBlockHouses(chunk: Chunk, bx: number, by: number, baseX: number, baseY: number): void {
    const blockWorldX = bx * 30 + 4; // offset from road
    const blockWorldY = by * 30 + 4;
    const blockInnerW = 24; // usable space inside block
    const blockInnerH = 24;

    // Check if this block is in a forest biome (skip houses)
    const centerBiome = this.getBiome(blockWorldX + 12, blockWorldY + 12);
    if (centerBiome === "forest") return;

    // Deterministic number of houses per block (2-5)
    const blockSeed = hashInt(bx, by, this.seed + 7777);
    const houseCount = 2 + (blockSeed % 4);

    // House layout patterns — deterministic placement within block
    const layouts = this.getBlockLayout(bx, by, houseCount, blockInnerW, blockInnerH);

    for (let i = 0; i < layouts.length; i++) {
      const layout = layouts[i];
      const hx = blockWorldX + layout.x;
      const hy = blockWorldY + layout.y;
      const hw = layout.w;
      const hh = layout.h;

      // Check bounds
      if (hx < 0 || hy < 0 || hx + hw >= WORLD_SIZE || hy + hh >= WORLD_SIZE) continue;

      // Only create house if its top-left corner falls in this chunk
      // (prevents duplicate houses from adjacent chunks)
      if (hx < baseX || hx >= baseX + CHUNK_SIZE || hy < baseY || hy >= baseY + CHUNK_SIZE) continue;

      const houseId = `h-${bx}-${by}-${i}`;

      // Paint tiles
      for (let ty = hy; ty < hy + hh; ty++) {
        for (let tx = hx; tx < hx + hw; tx++) {
          const lx = tx - baseX;
          const ly = ty - baseY;
          if (lx >= 0 && lx < CHUNK_SIZE && ly >= 0 && ly < CHUNK_SIZE) {
            chunk.tiles[ly * CHUNK_SIZE + lx] = "house";
          }
        }
      }

      // Determine door position and loot
      const doorSide = hashInt(bx * 31 + by * 17, i, this.seed + 3333) % 4;
      let doorX = hx + Math.floor(hw / 2);
      let doorY = hy + hh;
      if (doorSide === 1) { doorX = hx + Math.floor(hw / 2); doorY = hy - 1; }
      else if (doorSide === 2) { doorX = hx - 1; doorY = hy + Math.floor(hh / 2); }
      else if (doorSide === 3) { doorX = hx + hw; doorY = hy + Math.floor(hh / 2); }

      // Fence around house with a small gate opening at the door.
      this.paintFenceLine(chunk, baseX, baseY, hx - 1, hy - 1, hw + 2, 1);
      this.paintFenceLine(chunk, baseX, baseY, hx - 1, hy + hh, hw + 2, 1);
      this.paintFenceLine(chunk, baseX, baseY, hx - 1, hy - 1, 1, hh + 2);
      this.paintFenceLine(chunk, baseX, baseY, hx + hw, hy - 1, 1, hh + 2);
      this.paintTile(chunk, baseX, baseY, doorX, doorY, "grass");

      const houseTypes: House["type"][] = ["house", "house", "house", "house", "house", "store", "store", "hospital", "police", "military", "school", "factory", "bunker", "ruin", "church", "gas"];
      const houseTypeRoll = hashInt(bx * 100 + i, by, this.seed + 777);
      chunk.houses.push({
        id: houseId,
        x: hx,
        y: hy,
        w: hw,
        h: hh,
        door: { x: doorX, y: doorY },
        looted: false,
        container: randomLoot(this.lootMultiplier),
        barricaded: hash(bx, by, this.seed + i + 5555) < 0.15,
        type: houseTypes[houseTypeRoll % houseTypes.length],
      });
    }
  }

  /** Generate deterministic house layouts within a block */
  private getBlockLayout(bx: number, by: number, count: number, maxW: number, maxH: number): { x: number; y: number; w: number; h: number }[] {
    const results: { x: number; y: number; w: number; h: number }[] = [];

    if (count <= 2) {
      // 2 houses side by side
      const w1 = 7 + (hashInt(bx, by, this.seed + 100) % 5);
      const h1 = 6 + (hashInt(bx, by, this.seed + 101) % 4);
      const w2 = 7 + (hashInt(bx, by, this.seed + 102) % 5);
      const h2 = 6 + (hashInt(bx, by, this.seed + 103) % 4);
      results.push({ x: 1, y: 2, w: w1, h: h1 });
      results.push({ x: w1 + 4, y: 2, w: w2, h: h2 });
    } else if (count === 3) {
      // 2 top, 1 bottom
      const w1 = 7 + (hashInt(bx, by, this.seed + 200) % 4);
      const h1 = 5 + (hashInt(bx, by, this.seed + 201) % 4);
      const w2 = 7 + (hashInt(bx, by, this.seed + 202) % 4);
      const h2 = 5 + (hashInt(bx, by, this.seed + 203) % 4);
      const w3 = 9 + (hashInt(bx, by, this.seed + 204) % 5);
      const h3 = 5 + (hashInt(bx, by, this.seed + 205) % 4);
      results.push({ x: 1, y: 1, w: w1, h: h1 });
      results.push({ x: w1 + 3, y: 1, w: w2, h: h2 });
      results.push({ x: 3, y: Math.max(h1, h2) + 3, w: w3, h: h3 });
    } else if (count === 4) {
      // 2x2 grid
      const gapX = 3;
      const gapY = 3;
      const cellW = Math.floor((maxW - gapX) / 2);
      const cellH = Math.floor((maxH - gapY) / 2);
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          const w = 6 + (hashInt(bx * 4 + r, by * 4 + c, this.seed + 300 + r * 2 + c) % 4);
          const h = 5 + (hashInt(bx * 4 + r, by * 4 + c, this.seed + 310 + r * 2 + c) % 3);
          const hw = Math.min(w, cellW - 1);
          const hh = Math.min(h, cellH - 1);
          results.push({
            x: c * (cellW + gapX) + 1,
            y: r * (cellH + gapY) + 1,
            w: hw,
            h: hh,
          });
        }
      }
    } else {
      // 5 houses — L shape
      const w = 7 + (hashInt(bx, by, this.seed + 400) % 3);
      const h = 5 + (hashInt(bx, by, this.seed + 401) % 3);
      results.push({ x: 1, y: 1, w, h });
      results.push({ x: w + 3, y: 1, w: w - 1, h });
      results.push({ x: 1, y: h + 3, w, h: h - 1 });
      results.push({ x: w + 3, y: h + 3, w: w - 1, h: h - 1 });
      results.push({ x: Math.floor(maxW / 2) - 4, y: (h + 3) * 2, w: 8, h: Math.min(h, maxH - (h + 3) * 2 - 1) });
    }

    // Filter out any that don't fit
    return results.filter((r) => r.x + r.w < maxW && r.y + r.h < maxH && r.w > 3 && r.h > 3);
  }

  private paintFenceLine(chunk: Chunk, baseX: number, baseY: number, fx: number, fy: number, fw: number, fh: number): void {
    for (let ty = fy; ty < fy + fh; ty++) {
      for (let tx = fx; tx < fx + fw; tx++) {
        const lx = tx - baseX;
        const ly = ty - baseY;
        if (lx >= 0 && lx < CHUNK_SIZE && ly >= 0 && ly < CHUNK_SIZE) {
          const current = chunk.tiles[ly * CHUNK_SIZE + lx];
          if (current !== "house" && current !== "road") {
            chunk.tiles[ly * CHUNK_SIZE + lx] = "fence";
          }
        }
      }
    }
  }

  private paintTile(chunk: Chunk, baseX: number, baseY: number, tx: number, ty: number, tile: TileKind): void {
    const lx = tx - baseX;
    const ly = ty - baseY;
    if (lx >= 0 && lx < CHUNK_SIZE && ly >= 0 && ly < CHUNK_SIZE) {
      chunk.tiles[ly * CHUNK_SIZE + lx] = tile;
    }
  }

  /** Tree generation for forest and green areas */
  private generateTrees(chunk: Chunk, baseX: number, baseY: number): void {
    // Deterministic tree placement using hash
    for (let attempt = 0; attempt < 60; attempt++) {
      const h1 = hash(chunk.cx * 100 + attempt, chunk.cy * 100, this.seed + 8888);
      const h2 = hash(chunk.cx * 100, chunk.cy * 100 + attempt, this.seed + 9999);
      const lx = h1 * CHUNK_SIZE;
      const ly = h2 * CHUNK_SIZE;
      const wx = baseX + lx;
      const wy = baseY + ly;
      const tileIdx = Math.floor(ly) * CHUNK_SIZE + Math.floor(lx);
      if (tileIdx < 0 || tileIdx >= CHUNK_SIZE * CHUNK_SIZE) continue;
      if (this.cutTreeKeys.has(this.treeKey(wx, wy))) continue;
      const tile = chunk.tiles[tileIdx];

      if (tile === "forest") {
        // Dense trees in forest
        chunk.trees.push({ x: wx, y: wy, r: 0.45 + hash(attempt, chunk.cx + chunk.cy, this.seed) * 0.5 });
      } else if (tile === "grass" && hash(attempt + 500, chunk.cx, this.seed + chunk.cy) < 0.25) {
        // Sparse trees in grass
        chunk.trees.push({ x: wx, y: wy, r: 0.4 + hash(attempt, chunk.cy, this.seed + chunk.cx) * 0.4 });
      }
    }
  }

  private treeKey(x: number, y: number) {
    return `${Math.floor(x * 10)},${Math.floor(y * 10)}`;
  }
}
