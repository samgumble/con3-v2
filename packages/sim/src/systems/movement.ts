import type { World } from "@con3/ecs";
import { C, type MoveTarget, type Transform, type Unit } from "../components";

/**
 * Move every unit that has a MoveTarget toward it at its speed.
 * Deterministic: depends only on component data and the fixed `dt`.
 */
export function movementSystem(world: World, dt: number): void {
  for (const e of world.query(C.Transform, C.Unit, C.MoveTarget)) {
    const t = world.get<Transform>(e, C.Transform)!;
    const u = world.get<Unit>(e, C.Unit)!;
    const m = world.get<MoveTarget>(e, C.MoveTarget)!;

    const dx = m.x - t.x;
    const dz = m.z - t.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.05) {
      world.remove(e, C.MoveTarget);
      continue;
    }

    const stepDist = Math.min(dist, u.speed * dt);
    t.x += (dx / dist) * stepDist;
    t.z += (dz / dist) * stepDist;
    t.rot = Math.atan2(dx, dz);
  }
}
