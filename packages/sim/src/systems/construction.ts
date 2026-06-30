import type { Entity, World } from "@con3/ecs";
import {
  type Builder,
  type Building,
  C,
  type Construction,
  type PathFollow,
  type Transform,
  type Unit,
} from "../components";
import type { NavGrid } from "../grid";
import { findPath } from "../pathfind";

const REACH = 1.2;

function setPath(world: World, grid: NavGrid, e: Entity, tx: number, tz: number): void {
  const t = world.get<Transform>(e, C.Transform)!;
  const path = findPath(grid, t.x, t.z, tx, tz);
  if (path) {
    world.add<PathFollow>(e, C.PathFollow, {
      waypoints: path,
      index: 0,
      goalX: tx,
      goalZ: tz,
      stuckTicks: 0,
      bestDist: Infinity,
      replans: 0,
    });
  }
}

/**
 * Advance building construction. Each assigned builder walks to its blueprint;
 * while adjacent it contributes effort. Progress accrues at (builders·dt) /
 * buildTime, so more builders finish faster. `onComplete` is called once a
 * building reaches full progress (to register drop-offs, grant labor, etc).
 */
export function constructionSystem(
  world: World,
  grid: NavGrid,
  dt: number,
  onComplete: (e: Entity) => void,
  allowed = true,
): void {
  if (!allowed) return; // e.g. rainstorm: construction halted
  const effort = new Map<Entity, number>();

  for (const e of world.query(C.Builder, C.Transform, C.Unit)) {
    const b = world.get<Builder>(e, C.Builder)!;
    const target = b.targetId;

    // Target gone or already finished → builder is done.
    if (!world.isAlive(target) || !world.has(target, C.Construction)) {
      world.remove(e, C.Builder);
      continue;
    }

    const t = world.get<Transform>(e, C.Transform)!;
    const u = world.get<Unit>(e, C.Unit)!;
    const bt = world.get<Transform>(target, C.Transform)!;
    const bb = world.get<Building>(target, C.Building)!;
    const dist = Math.hypot(bt.x - t.x, bt.z - t.z);

    if (dist <= bb.radius + u.radius + REACH) {
      world.remove(e, C.PathFollow); // stop and work
      effort.set(target, (effort.get(target) ?? 0) + dt);
    } else if (!world.has(e, C.PathFollow)) {
      setPath(world, grid, e, bt.x, bt.z);
    }
  }

  for (const [target, secs] of effort) {
    const c = world.get<Construction>(target, C.Construction)!;
    c.progress += secs / c.buildTime;
    if (c.progress >= 1) {
      c.progress = 1;
      onComplete(target);
    }
  }
}
