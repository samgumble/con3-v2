import { World, type Entity } from "@con3/ecs";
import {
  C,
  type PathFollow,
  type Selectable,
  type Transform,
  type Unit,
  type UnitKind,
} from "./components";
import { NavGrid } from "./grid";
import { findPath } from "./pathfind";
import { movementSystem } from "./systems/movement";
import { avoidanceSystem } from "./systems/avoidance";

/** Fixed simulation rate. The renderer interpolates between ticks. */
export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE; // seconds per tick

/** Half-extent of the playable area in world units. */
export const MAP_HALF = 60;

const SPEED: Record<UnitKind, number> = {
  worker: 4,
  excavator: 2.5,
  crane: 1.5,
};

const RADIUS: Record<UnitKind, number> = {
  worker: 0.5,
  excavator: 0.8,
  crane: 1.0,
};

export interface Obstacle {
  x: number;
  z: number;
  radius: number;
  kind: "rocks" | "stockpile";
}

/**
 * Owns the ECS world, the navigation grid, and advances the sim one fixed tick
 * at a time. Rendering reads state via the snapshot methods; it never mutates.
 */
export class GameSim {
  readonly world = new World();
  readonly grid = NavGrid.centered(MAP_HALF, 2);
  readonly obstacles: Obstacle[] = [];
  tick = 0;

  constructor() {
    this.spawnObstacles();
  }

  /** Scatter rock piles into a rough barrier so pathfinding has to route. */
  private spawnObstacles(): void {
    const defs: Obstacle[] = [
      { x: -2, z: -4, radius: 4.5, kind: "rocks" },
      { x: -12, z: -3, radius: 3.5, kind: "rocks" },
      { x: 8, z: -5, radius: 3.5, kind: "rocks" },
      { x: 16, z: -2, radius: 3, kind: "rocks" },
      { x: -22, z: -6, radius: 3, kind: "rocks" },
      { x: 24, z: 6, radius: 3.5, kind: "stockpile" },
      { x: -26, z: 8, radius: 3, kind: "stockpile" },
    ];
    for (const o of defs) {
      this.obstacles.push(o);
      this.grid.blockCircle(o.x, o.z, o.radius);
    }
  }

  spawnUnit(x: number, z: number, kind: UnitKind = "worker"): Entity {
    const e = this.world.create();
    this.world.add<Transform>(e, C.Transform, { x, z, rot: 0 });
    this.world.add<Unit>(e, C.Unit, {
      kind,
      speed: SPEED[kind],
      radius: RADIUS[kind],
    });
    this.world.add<Selectable>(e, C.Selectable, { selected: false });
    return e;
  }

  /** Order entities to move to a world point, pathing around obstacles. */
  commandMove(entities: Iterable<Entity>, x: number, z: number): void {
    const list = [...entities].filter((e) => this.world.has(e, C.Unit));
    // Spread destinations on a ring so the group fans out instead of stacking.
    const ring = Math.max(0, Math.ceil(Math.sqrt(list.length)) - 1) * 1.1;
    list.forEach((e, i) => {
      const t = this.world.get<Transform>(e, C.Transform)!;
      const angle = (i / Math.max(1, list.length)) * Math.PI * 2;
      const tx = x + Math.cos(angle) * ring;
      const tz = z + Math.sin(angle) * ring;
      const path = findPath(this.grid, t.x, t.z, tx, tz);
      if (path) {
        this.world.add<PathFollow>(e, C.PathFollow, { waypoints: path, index: 0 });
      }
    });
  }

  setSelected(entities: Set<Entity>): void {
    for (const e of this.world.query(C.Selectable)) {
      const s = this.world.get<Selectable>(e, C.Selectable)!;
      s.selected = entities.has(e);
    }
  }

  selectedEntities(): Entity[] {
    return this.world
      .query(C.Selectable)
      .filter((e) => this.world.get<Selectable>(e, C.Selectable)!.selected);
  }

  /** Advance exactly one fixed tick. */
  step(): void {
    movementSystem(this.world, TICK_DT);
    avoidanceSystem(this.world);
    this.tick++;
  }

  /** Read-only view of unit state for the renderer. */
  snapshot(): UnitSnapshot[] {
    const out: UnitSnapshot[] = [];
    for (const e of this.world.query(C.Transform, C.Unit)) {
      const t = this.world.get<Transform>(e, C.Transform)!;
      const u = this.world.get<Unit>(e, C.Unit)!;
      const s = this.world.get<Selectable>(e, C.Selectable);
      out.push({
        id: e,
        x: t.x,
        z: t.z,
        rot: t.rot,
        kind: u.kind,
        radius: u.radius,
        selected: s?.selected ?? false,
        moving: this.world.has(e, C.PathFollow),
      });
    }
    return out;
  }
}

export interface UnitSnapshot {
  id: Entity;
  x: number;
  z: number;
  rot: number;
  kind: UnitKind;
  radius: number;
  selected: boolean;
  moving: boolean;
}
