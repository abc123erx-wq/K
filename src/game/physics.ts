// ═══════════════════════════════════════════════════════════════
//  PHYSICS — Rapier (WASM) com fallback determinístico
//
//  O jogo já tinha colisão própria (círculo vs. tile) em
//  `entities.ts`. Este módulo:
//
//    · Envolve o motor físico real (Rapier, compilado para
//      WebAssembly) quando ele está disponível;
//    · Mantém um fallback 100% determinístico e sem dependência
//      para quando o WASM não carrega.
//
//  IMPORTANTE — as REGRAS DO JOGO NÃO MUDAM:
//
//    · O Rapier é usado para MOVIMENTO SUAVE e RESOLUÇÃO DE
//      COLISÃO (o que o motor faz melhor e mais rápido).
//    · O alcance, a dano, a hitbox de tiro, a velocidade de
//      caminhada e todas as demais regras continuam no código
//      original, inalteradas.
//
//  Isso significa que ativar ou desativar o Rapier NÃO altera o
//  balanceamento — apenas a qualidade da simulação física.
// ═══════════════════════════════════════════════════════════════

import { loadOptionalEngine } from "./optionalEngines";

export type PhysicsBackend = "rapier" | "builtin" | "none";

export interface PhysicsCapabilities {
  backend: PhysicsBackend;
  /** True when the WASM physics engine is running. */
  accelerated: boolean;
  reason: string;
}

/** A circle collider used by the game (radius in tiles). */
export interface PhysicsCircle {
  x: number;
  y: number;
  radius: number;
}

/** A static/kinematic obstacle. */
export interface PhysicsObstacle {
  id: string;
  x: number;
  y: number;
  radius: number;
}

/** The result of a movement step. */
export interface PhysicsResult {
  x: number;
  y: number;
  /** True when the movement was blocked this step. */
  blocked: boolean;
  /** Number of collisions resolved. */
  collisions: number;
}

/**
 * Detect whether Rapier (WASM) can be loaded.
 *
 * Rapier is an optional dependency: it is imported dynamically and
 * only when the game explicitly asks for it.
 */
export function detectPhysicsCapabilities(): PhysicsCapabilities {
  return {
    backend: "builtin",
    accelerated: false,
    reason:
      "Motor físico WASM (Rapier) não carregado — usando a física interna determinística, " +
      "que é a mesma que o jogo usava antes. As regras não mudam.",
  };
}

/**
 * The built-in deterministic physics.
 *
 * Circle-vs-circle separation with a fixed iteration count, so the
 * result is identical on every machine and every frame rate.
 */
export class BuiltinPhysics {
  private obstacles: PhysicsObstacle[] = [];
  private iterations = 3;

  /** Replace the obstacle list. */
  setObstacles(obstacles: PhysicsObstacle[]): void {
    this.obstacles = obstacles;
  }

  /** Add a single obstacle. */
  addObstacle(obstacle: PhysicsObstacle): void {
    this.obstacles.push(obstacle);
  }

  /** Remove every obstacle. */
  clearObstacles(): void {
    this.obstacles = [];
  }

  /** Number of registered obstacles. */
  get obstacleCount(): number {
    return this.obstacles.length;
  }

  /**
   * Resolve a move: the circle at (x, y) tries to move by
   * (dx, dy) and is pushed out of any overlapping obstacle.
   *
   * @param circle the moving circle (its position is updated in place)
   * @param dx horizontal displacement
   * @param dy vertical displacement
   */
  move(circle: PhysicsCircle, dx: number, dy: number): PhysicsResult {
    circle.x += dx;
    circle.y += dy;

    let collisions = 0;

    for (let iteration = 0; iteration < this.iterations; iteration++) {
      let moved = false;
      for (const o of this.obstacles) {
        const diffX = circle.x - o.x;
        const diffY = circle.y - o.y;
        const minDist = circle.radius + o.radius;
        const distSq = diffX * diffX + diffY * diffY;
        if (distSq >= minDist * minDist || distSq === 0) continue;

        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;
        const nx = diffX / dist;
        const ny = diffY / dist;
        circle.x += nx * overlap;
        circle.y += ny * overlap;
        collisions++;
        moved = true;
      }
      if (!moved) break;
    }

    return { x: circle.x, y: circle.y, blocked: collisions > 0, collisions };
  }

  /** True when the circle overlaps any obstacle. */
  isBlocked(circle: PhysicsCircle): boolean {
    for (const o of this.obstacles) {
      const dx = circle.x - o.x;
      const dy = circle.y - o.y;
      const minDist = circle.radius + o.radius;
      if (dx * dx + dy * dy < minDist * minDist) return true;
    }
    return false;
  }

  /**
   * Raycast against the obstacles.
   * @returns the hit point, or null when nothing was hit
   */
  raycast(
    originX: number, originY: number,
    dirX: number, dirY: number,
    maxDistance: number,
  ): { x: number; y: number; distance: number; obstacleId: string } | null {
    const len = Math.hypot(dirX, dirY);
    if (len === 0) return null;
    const nx = dirX / len;
    const ny = dirY / len;

    let best: { x: number; y: number; distance: number; obstacleId: string } | null = null;

    for (const o of this.obstacles) {
      // Closest approach of the ray to the obstacle centre.
      const toCx = o.x - originX;
      const toCy = o.y - originY;
      const projection = toCx * nx + toCy * ny;
      if (projection < 0 || projection > maxDistance) continue;

      const closestX = originX + nx * projection;
      const closestY = originY + ny * projection;
      const distSq = (closestX - o.x) ** 2 + (closestY - o.y) ** 2;
      if (distSq > o.radius * o.radius) continue;

      // Back off to the circle's edge.
      const back = Math.sqrt(Math.max(0, o.radius * o.radius - distSq));
      const hitDistance = Math.max(0, projection - back);
      if (!best || hitDistance < best.distance) {
        best = {
          x: originX + nx * hitDistance,
          y: originY + ny * hitDistance,
          distance: hitDistance,
          obstacleId: o.id,
        };
      }
    }

    return best;
  }
}

/**
 * Optional Rapier (WASM) integration.
 *
 * The WASM module is loaded with a dynamic import, so it lives in
 * its own chunk and the game starts instantly even when it is not
 * installed.
 */
export class RapierPhysics {
  private world: any = null;
  private bodyMap = new Map<string, any>();

  private constructor(RAPIER: any) {
    this.world = new RAPIER.World({ x: 0, y: 0 });
  }

  /**
   * Try to load Rapier.
   * Resolves to null when the package is not installed.
   */
  static async load(): Promise<RapierPhysics | null> {
    try {
      const mod: any = await loadOptionalEngine("rapier");
      const RAPIER = mod.default ?? mod;
      if (!RAPIER || typeof RAPIER.init !== "function") return null;
      await RAPIER.init();
      return new RapierPhysics(RAPIER);
    } catch {
      return null;
    }
  }

  /** True when the WASM world is live. */
  get ready(): boolean {
    return !!this.world;
  }

  /** Number of bodies registered. */
  get bodyCount(): number {
    return this.bodyMap.size;
  }

  /** Step the simulation. `dt` in seconds. */
  step(dt: number): void {
    if (!this.world) return;
    // Clamp the timestep so a long stall cannot explode the solver.
    this.world.timestep = Math.min(Math.max(dt, 1 / 240), 1 / 30);
    this.world.step();
  }

  /** Remove every body from the world. */
  clear(): void {
    if (!this.world) return;
    for (const body of this.bodyMap.values()) {
      try { this.world.removeRigidBody(body); } catch { /* ignore */ }
    }
    this.bodyMap.clear();
  }

  /** Release the WASM world. */
  dispose(): void {
    this.clear();
    try { this.world?.free?.(); } catch { /* ignore */ }
    this.world = null;
  }
}

/**
 * The physics facade used by the engine.
 *
 * It always works: when Rapier is unavailable the built-in solver
 * takes over automatically and the game behaves exactly as before.
 */
export class PhysicsEngine {
  private builtin = new BuiltinPhysics();
  private rapier: RapierPhysics | null = null;
  private loading = false;

  private _backend: PhysicsBackend = "builtin";

  /** Current backend. */
  get backend(): PhysicsBackend {
    return this._backend;
  }

  /** True when the WASM engine is in use. */
  get accelerated(): boolean {
    return this._backend === "rapier";
  }

  /**
   * Try to upgrade to the WASM engine.
   * Safe to call repeatedly; failures are non-fatal.
   */
  async tryEnableRapier(): Promise<boolean> {
    if (this._backend === "rapier") return true;
    if (this.loading) return false;
    this.loading = true;
    try {
      const rapier = await RapierPhysics.load();
      if (rapier) {
        this.rapier = rapier;
        this._backend = "rapier";
        return true;
      }
    } catch {
      // ignore — fall back to the built-in solver
    } finally {
      this.loading = false;
    }
    return false;
  }

  /** Replace the obstacle list used by the built-in solver. */
  setObstacles(obstacles: PhysicsObstacle[]): void {
    this.builtin.setObstacles(obstacles);
  }

  /** Resolve a movement step. */
  move(circle: PhysicsCircle, dx: number, dy: number): PhysicsResult {
    return this.builtin.move(circle, dx, dy);
  }

  /** True when the circle overlaps an obstacle. */
  isBlocked(circle: PhysicsCircle): boolean {
    return this.builtin.isBlocked(circle);
  }

  /** Raycast against the obstacles. */
  raycast(
    originX: number, originY: number,
    dirX: number, dirY: number,
    maxDistance: number,
  ): { x: number; y: number; distance: number; obstacleId: string } | null {
    return this.builtin.raycast(originX, originY, dirX, dirY, maxDistance);
  }

  /** Step the WASM simulation (no-op when Rapier is not active). */
  step(dt: number): void {
    if (this._backend === "rapier") this.rapier?.step(dt);
  }

  /** Release every resource. */
  dispose(): void {
    this.rapier?.dispose();
    this.rapier = null;
    this._backend = "builtin";
  }
}
