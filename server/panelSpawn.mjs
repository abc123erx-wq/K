// ============================================================
//  PANEL SPAWN AUTHORITY — server-side safe placement
//
//  The client may only *ask* for an effect to appear near a
//  target player. The server decides:
//
//    · whether the target is still connected to this room
//    · whether the effect id is on the allowlist
//    · whether the room/target limits are respected
//    · whether a safe, navigable, non-clipping spot exists
//
//  There is no eval, no dynamic require, and no free-form
//  resource names: only ids from adminConfig.SPAWNABLE_EFFECTS
//  are accepted, and they map to fixed behaviours.
// ============================================================

import { LIMITS, findSpawnableEffect } from "./adminConfig.mjs";

/** Tiles that are never acceptable spawn surfaces. */
const BLOCKING_TILES = new Set(["house", "fence", "water", "rubble", "debris", "bunker"]);
/** Tiles we prefer to place on. */
const SAFE_TILES = new Set(["road", "grass", "park", "forest"]);

/**
 * Is the world coordinate walkable for an actor?
 * @param {(x:number,y:number)=>boolean} isBlocked world collision probe
 */
function isWalkable(isBlocked, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const r = 0.32;
  const d = r * 0.72;
  const probes = [
    [x, y],
    [x + r, y], [x - r, y], [x, y + r], [x, y - r],
    [x + d, y + d], [x - d, y + d], [x + d, y - d], [x - d, y - d],
  ];
  for (const [px, py] of probes) {
    if (isBlocked(px, py)) return false;
  }
  return true;
}

/**
 * Find a safe spawn position near the target.
 *
 * @param {object} opts
 * @param {{x:number,y:number}} opts.target
 * @param {(x:number,y:number)=>boolean} opts.isBlocked
 * @param {(x:number,y:number)=>string|null} opts.tileAt
 * @param {number} opts.minDistance
 * @param {number} opts.maxDistance
 * @param {number} opts.count how many entities must fit
 * @returns {{ok:true, positions:Array<{x:number,y:number}>} | {ok:false, reason:string}}
 */
export function findSafeSpawnPositions({
  target,
  isBlocked,
  tileAt,
  minDistance = 6,
  maxDistance = 12,
  count = 1,
}) {
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) {
    return { ok: false, reason: "alvo-invalido" };
  }
  if (typeof isBlocked !== "function" || typeof tileAt !== "function") {
    return { ok: false, reason: "mundo-indisponivel" };
  }

  const positions = [];
  const minSq = minDistance * minDistance;
  const maxSq = maxDistance * maxDistance;
  const attempts = 220;

  for (let i = 0; i < attempts && positions.length < count; i++) {
    // Deterministic-ish ring scan plus jitter so results are stable
    // enough to be testable while still spreading entities out.
    const ring = minDistance + ((maxDistance - minDistance) * i) / attempts;
    const angle = (i / attempts) * Math.PI * 2 * 7.13; // golden-ish spread
    const jitter = Math.sin(i * 12.9898) * 0.35;
    const dist = Math.max(minDistance, Math.min(maxDistance, ring + jitter));
    const x = target.x + Math.cos(angle) * dist;
    const y = target.y + Math.sin(angle) * dist;

    const distSq = (x - target.x) ** 2 + (y - target.y) ** 2;
    if (distSq < minSq || distSq > maxSq) continue;

    const tile = tileAt(Math.floor(x), Math.floor(y));
    if (!tile) continue;
    if (BLOCKING_TILES.has(tile)) continue;
    if (!SAFE_TILES.has(tile) && tile !== "ruin") continue;
    if (!isWalkable(isBlocked, x, y)) continue;

    // Never stack entities on the same spot.
    if (positions.some((p) => Math.hypot(p.x - x, p.y - y) < 0.8)) continue;

    positions.push({ x, y });
  }

  if (positions.length < count) {
    return { ok: false, reason: "sem-ponto-seguro" };
  }
  return { ok: true, positions };
}

/**
 * Validate a spawn request and compute the resulting positions.
 *
 * @param {object} req
 * @param {string} req.effectId
 * @param {string} req.targetId
 * @param {Map} req.players live player map
 * @param {(x:number,y:number)=>boolean} req.isBlocked
 * @param {(x:number,y:number)=>string|null} req.tileAt
 * @param {number} req.activeEffectsInRoom
 * @param {number} req.activeEffectsForTarget
 */
export function resolveSpawnRequest({
  effectId,
  targetId,
  players,
  isBlocked,
  tileAt,
  activeEffectsInRoom = 0,
  activeEffectsForTarget = 0,
}) {
  const effect = findSpawnableEffect(effectId);
  if (!effect) {
    return { ok: false, reason: "recurso-invalido" };
  }

  if (typeof targetId !== "string" || !targetId) {
    return { ok: false, reason: "alvo-invalido" };
  }

  const target = players.get(targetId);
  if (!target || target.connected === false) {
    return { ok: false, reason: "alvo-desconectado" };
  }

  if (activeEffectsInRoom >= LIMITS.MAX_ACTIVE_EFFECTS_PER_ROOM) {
    return { ok: false, reason: "limite-sala" };
  }
  if (activeEffectsForTarget >= LIMITS.MAX_ACTIVE_EFFECTS_PER_TARGET) {
    return { ok: false, reason: "limite-alvo" };
  }

  const placement = findSafeSpawnPositions({
    target: { x: target.x, y: target.y },
    isBlocked,
    tileAt,
    minDistance: effect.minDistance,
    maxDistance: effect.maxDistance,
    count: effect.count,
  });

  if (!placement.ok) {
    return { ok: false, reason: placement.reason };
  }

  return {
    ok: true,
    effectId,
    effect,
    targetId,
    targetName: target.name || "desconhecido",
    positions: placement.positions,
  };
}
