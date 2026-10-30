// ============================================================
//  WORLD PROBE — deterministic, read-only mirror of the client
//  world generator.
//
//  The client world (src/game/world.ts) is a pure function of
//  (seed, x, y). To let the SERVER decide whether a spawn point
//  is safe (terrain, collision, fences, houses, water) without
//  trusting the client, we mirror the exact same deterministic
//  generator here.
//
//  If the client world generator changes, this file MUST be
//  updated in lock-step. `server/worldProbe.test.mjs` asserts
//  that the two implementations agree on a sample of tiles.
//
//  Chunk = 32x32, seed = 42, roads every 60/30 tiles, houses
//  generated per 30x30 city block with fences and a gate.
// ============================================================

export const WORLD_SIZE = 9999;
export const CHUNK_SIZE = 32;
export const WORLD_SEED = 42;

/** Deterministic hash — must match src/game/world.ts exactly. */
export function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
  h = (h ^ (h >> 13)) * 1103515245;
  h = (h ^ (h >> 16)) * 2654435769;
  return ((h ^ (h >> 13)) >>> 0) / 4294967296;
}

/** Deterministic integer hash — must match src/game/world.ts exactly. */
export function hashInt(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
  h = (h ^ (h >> 13)) * 1103515245;
  h = (h ^ (h >> 16)) * 2654435769;
  return (h ^ (h >> 13)) >>> 0;
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < WORLD_SIZE && y < WORLD_SIZE;
}

/** Biome determination — mirrors World.getBiome. */
export function getBiome(wx, wy, seed = WORLD_SEED) {
  const scale1 = 0.007;
  const scale2 = 0.023;
  const v1 = hash(Math.floor(wx * scale1), Math.floor(wy * scale1), seed);
  const v2 = hash(Math.floor(wx * scale2), Math.floor(wy * scale2), seed + 999);
  const v3 = hash(Math.floor(wx * 0.031), Math.floor(wy * 0.031), seed + 555);
  const combined = v1 * 0.65 + v2 * 0.35;

  const edgeDist = Math.min(wx, wy, WORLD_SIZE - wx, WORLD_SIZE - wy);
  if (edgeDist < 40) return "forest";

  const waterScale = 0.04;
  const waterHash = hash(Math.floor(wx * waterScale), Math.floor(wy * waterScale), seed + 1234);
  if (waterHash > 0.82 && waterHash < 0.87) return "water";

  const ruinScale = 0.015;
  const ruinHash = hash(Math.floor(wx * ruinScale), Math.floor(wy * ruinScale), seed + 2345);
  if (ruinHash > 0.88 && ruinHash < 0.92) return "ruin";

  const parkHash = hash(Math.floor(wx * 0.02), Math.floor(wy * 0.02), seed + 3456);
  if (parkHash > 0.92 && parkHash < 0.95) return "park";

  const debrisHash = hash(Math.floor(wx * 0.03), Math.floor(wy * 0.03), seed + 4567);
  if (debrisHash > 0.95 && debrisHash < 0.97) return "debris";

  if (combined < 0.28) return "forest";
  if (combined > 0.72 && v3 > 0.6) return "rubble";
  return "grass";
}

/** Block layout — mirrors World.getBlockLayout. */
function getBlockLayout(bx, by, count, maxW, maxH, seed = WORLD_SEED) {
  const results = [];
  if (count <= 2) {
    const w1 = 7 + (hashInt(bx, by, seed + 100) % 5);
    const h1 = 6 + (hashInt(bx, by, seed + 101) % 4);
    const w2 = 7 + (hashInt(bx, by, seed + 102) % 5);
    const h2 = 6 + (hashInt(bx, by, seed + 103) % 4);
    results.push({ x: 1, y: 2, w: w1, h: h1 });
    results.push({ x: w1 + 4, y: 2, w: w2, h: h2 });
  } else if (count === 3) {
    const w1 = 7 + (hashInt(bx, by, seed + 200) % 4);
    const h1 = 5 + (hashInt(bx, by, seed + 201) % 4);
    const w2 = 7 + (hashInt(bx, by, seed + 202) % 4);
    const h2 = 5 + (hashInt(bx, by, seed + 203) % 4);
    const w3 = 9 + (hashInt(bx, by, seed + 204) % 5);
    const h3 = 5 + (hashInt(bx, by, seed + 205) % 4);
    results.push({ x: 1, y: 1, w: w1, h: h1 });
    results.push({ x: w1 + 3, y: 1, w: w2, h: h2 });
    results.push({ x: 3, y: Math.max(h1, h2) + 3, w: w3, h: h3 });
  } else if (count === 4) {
    const gapX = 3;
    const gapY = 3;
    const cellW = Math.floor((maxW - gapX) / 2);
    const cellH = Math.floor((maxH - gapY) / 2);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const w = 6 + (hashInt(bx * 4 + r, by * 4 + c, seed + 300 + r * 2 + c) % 4);
        const h = 5 + (hashInt(bx * 4 + r, by * 4 + c, seed + 310 + r * 2 + c) % 3);
        results.push({
          x: c * (cellW + gapX) + 1,
          y: r * (cellH + gapY) + 1,
          w: Math.min(w, cellW - 1),
          h: Math.min(h, cellH - 1),
        });
      }
    }
  } else {
    const w = 7 + (hashInt(bx, by, seed + 400) % 3);
    const h = 5 + (hashInt(bx, by, seed + 401) % 3);
    results.push({ x: 1, y: 1, w, h });
    results.push({ x: w + 3, y: 1, w: w - 1, h });
    results.push({ x: 1, y: h + 3, w, h: h - 1 });
    results.push({ x: w + 3, y: h + 3, w: w - 1, h: h - 1 });
    results.push({
      x: Math.floor(maxW / 2) - 4,
      y: (h + 3) * 2,
      w: 8,
      h: Math.min(h, maxH - (h + 3) * 2 - 1),
    });
  }
  return results.filter((r) => r.x + r.w < maxW && r.y + r.h < maxH && r.w > 3 && r.h > 3);
}

/**
 * Generate the 32x32 tile grid for a chunk.
 * Mirrors World.generateChunk (terrain + roads + houses + fences).
 */
function generateChunkTiles(cx, cy, seed = WORLD_SEED) {
  const baseX = cx * CHUNK_SIZE;
  const baseY = cy * CHUNK_SIZE;
  const tiles = new Array(CHUNK_SIZE * CHUNK_SIZE).fill("grass");

  // Step 1 — terrain
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      tiles[ly * CHUNK_SIZE + lx] = getBiome(baseX + lx, baseY + ly, seed);
    }
  }

  // Step 2 — roads
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = baseX + lx;
      const wy = baseY + ly;
      if (wy % 60 >= 0 && wy % 60 < 4) {
        tiles[ly * CHUNK_SIZE + lx] = "road";
        continue;
      }
      if (wx % 60 >= 0 && wx % 60 < 4) {
        tiles[ly * CHUNK_SIZE + lx] = "road";
        continue;
      }
      const tile = tiles[ly * CHUNK_SIZE + lx];
      if (tile !== "forest") {
        if (wy % 30 < 2) {
          tiles[ly * CHUNK_SIZE + lx] = "road";
          continue;
        }
        if (wx % 30 < 2) {
          tiles[ly * CHUNK_SIZE + lx] = "road";
          continue;
        }
      }
    }
  }

  // Step 3 — houses (tiles + fences + gate)
  const blockSize = 30;
  const startBlockX = Math.floor(baseX / blockSize);
  const startBlockY = Math.floor(baseY / blockSize);
  const endBlockX = Math.floor((baseX + CHUNK_SIZE - 1) / blockSize);
  const endBlockY = Math.floor((baseY + CHUNK_SIZE - 1) / blockSize);

  const paintFenceLine = (fx, fy, fw, fh) => {
    for (let ty = fy; ty < fy + fh; ty++) {
      for (let tx = fx; tx < fx + fw; tx++) {
        const lx = tx - baseX;
        const ly = ty - baseY;
        if (lx >= 0 && ly >= 0 && lx < CHUNK_SIZE && ly < CHUNK_SIZE) {
          const current = tiles[ly * CHUNK_SIZE + lx];
          if (current !== "house" && current !== "road") {
            tiles[ly * CHUNK_SIZE + lx] = "fence";
          }
        }
      }
    }
  };
  const paintTile = (tx, ty, tile) => {
    const lx = tx - baseX;
    const ly = ty - baseY;
    if (lx >= 0 && ly >= 0 && lx < CHUNK_SIZE && ly < CHUNK_SIZE) {
      tiles[ly * CHUNK_SIZE + lx] = tile;
    }
  };

  for (let by = startBlockY; by <= endBlockY; by++) {
    for (let bx = startBlockX; bx <= endBlockX; bx++) {
      const blockWorldX = bx * 30 + 4;
      const blockWorldY = by * 30 + 4;
      const centerBiome = getBiome(blockWorldX + 12, blockWorldY + 12, seed);
      if (centerBiome === "forest") continue;

      const blockSeed = hashInt(bx, by, seed + 7777);
      const houseCount = 2 + (blockSeed % 4);
      const layouts = getBlockLayout(bx, by, houseCount, 24, 24, seed);

      for (let i = 0; i < layouts.length; i++) {
        const layout = layouts[i];
        const hx = blockWorldX + layout.x;
        const hy = blockWorldY + layout.y;
        const hw = layout.w;
        const hh = layout.h;
        if (hx < 0 || hy < 0 || hx + hw >= WORLD_SIZE || hy + hh >= WORLD_SIZE) continue;
        if (hx < baseX || hx >= baseX + CHUNK_SIZE || hy < baseY || hy >= baseY + CHUNK_SIZE) continue;

        for (let ty = hy; ty < hy + hh; ty++) {
          for (let tx = hx; tx < hx + hw; tx++) {
            const lx = tx - baseX;
            const ly = ty - baseY;
            if (lx >= 0 && ly >= 0 && lx < CHUNK_SIZE && ly < CHUNK_SIZE) {
              tiles[ly * CHUNK_SIZE + lx] = "house";
            }
          }
        }

        const doorSide = hashInt(bx * 31 + by * 17, i, seed + 3333) % 4;
        let doorX = hx + Math.floor(hw / 2);
        let doorY = hy + hh;
        if (doorSide === 1) { doorX = hx + Math.floor(hw / 2); doorY = hy - 1; }
        else if (doorSide === 2) { doorX = hx - 1; doorY = hy + Math.floor(hh / 2); }
        else if (doorSide === 3) { doorX = hx + hw; doorY = hy + Math.floor(hh / 2); }

        paintFenceLine(hx - 1, hy - 1, hw + 2, 1);
        paintFenceLine(hx - 1, hy + hh, hw + 2, 1);
        paintFenceLine(hx - 1, hy - 1, 1, hh + 2);
        paintFenceLine(hx + hw, hy - 1, 1, hh + 2);
        paintTile(doorX, doorY, "grass");
      }
    }
  }

  return tiles;
}

// Chunk cache — generation is pure, so caching is safe.
const chunkCache = new Map();

function getChunkTiles(cx, cy) {
  const key = `${cx},${cy}`;
  let tiles = chunkCache.get(key);
  if (!tiles) {
    tiles = generateChunkTiles(cx, cy);
    if (chunkCache.size > 4096) chunkCache.clear();
    chunkCache.set(key, tiles);
  }
  return tiles;
}

/**
 * Tile kind at a world position.
 * Mirrors World.tileAt, including the "gate" override that turns
 * the door tile of a house into grass.
 */
export function tileAt(x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!inBounds(tx, ty)) return "fence";
  const tiles = getChunkTiles(Math.floor(tx / CHUNK_SIZE), Math.floor(ty / CHUNK_SIZE));
  const lx = tx - Math.floor(tx / CHUNK_SIZE) * CHUNK_SIZE;
  const ly = ty - Math.floor(ty / CHUNK_SIZE) * CHUNK_SIZE;
  if (isGateAt(tx, ty)) return "grass";
  return tiles[ly * CHUNK_SIZE + lx];
}

/**
 * Is there a house gate at this tile?
 * Mirrors World.isGateAt by recomputing the deterministic door
 * positions of the blocks that could own a house here.
 */
export function isGateAt(tx, ty) {
  const blockSize = 30;
  const startBlockX = Math.floor(tx / blockSize);
  const startBlockY = Math.floor(ty / blockSize);
  const endBlockX = Math.floor((tx + 1) / blockSize);
  const endBlockY = Math.floor((ty + 1) / blockSize);

  for (let by = startBlockY; by <= endBlockY; by++) {
    for (let bx = startBlockX; bx <= endBlockX; bx++) {
      const blockWorldX = bx * 30 + 4;
      const blockWorldY = by * 30 + 4;
      if (getBiome(blockWorldX + 12, blockWorldY + 12) === "forest") continue;
      const houseCount = 2 + (hashInt(bx, by, WORLD_SEED + 7777) % 4);
      const layouts = getBlockLayout(bx, by, houseCount, 24, 24);
      for (let i = 0; i < layouts.length; i++) {
        const layout = layouts[i];
        const hx = blockWorldX + layout.x;
        const hy = blockWorldY + layout.y;
        const hw = layout.w;
        const hh = layout.h;
        if (hx < 0 || hy < 0 || hx + hw >= WORLD_SIZE || hy + hh >= WORLD_SIZE) continue;
        const doorSide = hashInt(bx * 31 + by * 17, i, WORLD_SEED + 3333) % 4;
        let doorX = hx + Math.floor(hw / 2);
        let doorY = hy + hh;
        if (doorSide === 1) { doorX = hx + Math.floor(hw / 2); doorY = hy - 1; }
        else if (doorSide === 2) { doorX = hx - 1; doorY = hy + Math.floor(hh / 2); }
        else if (doorSide === 3) { doorX = hx + hw; doorY = hy + Math.floor(hh / 2); }
        if (Math.abs(tx - doorX) <= 1 && Math.abs(ty - doorY) <= 1) return true;
      }
    }
  }
  return false;
}

/** Mirrors World.isBlocked. */
export function isBlocked(x, y) {
  const tile = tileAt(x, y);
  return tile === "fence" || tile === "water" || !inBounds(Math.floor(x), Math.floor(y));
}

export const worldProbe = { tileAt, isBlocked, isGateAt, getBiome, hash, hashInt };
export default worldProbe;
