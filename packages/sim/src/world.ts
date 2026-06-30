import { World, type Entity } from "@con3/ecs";
import {
  C,
  type Selectable,
  type Transform,
  type Unit,
  type UnitKind,
} from "./components";
import { movementSystem } from "./systems/movement";

/** Fixed simulation rate. The renderer interpolates between ticks. */
export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE; // seconds per tick

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

/**
 * Owns the ECS world and advances it one fixed tick at a time.
 * Rendering reads state via `snapshot()`; it never mutates the sim.
 */
export class GameSim {
  readonly world = new World();
  tick = 0;

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

  /** Order the given entities to move to a world point. */
  commandMove(entities: Iterable<Entity>, x: number, z: number): void {
    // Spread destinations slightly so units don't stack on one point.
    const list = [...entities];
    const ring = Math.max(0, Math.ceil(Math.sqrt(list.length)) - 1) * 0.9;
    list.forEach((e, i) => {
      if (!this.world.has(e, C.Unit)) return;
      const angle = (i / Math.max(1, list.length)) * Math.PI * 2;
      const ox = Math.cos(angle) * ring;
      const oz = Math.sin(angle) * ring;
      this.world.add(e, C.MoveTarget, { x: x + ox, z: z + oz });
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
}
