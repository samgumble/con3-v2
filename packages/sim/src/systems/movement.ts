import type { World } from "@con3/ecs";
import { C, type PathFollow, type Transform, type Unit } from "../components";

/**
 * Walk every unit along its PathFollow waypoints at its speed. Consumes
 * waypoints as they're reached (possibly several per tick) and drops the
 * PathFollow component on arrival. Deterministic given component data + dt.
 */
export function movementSystem(world: World, dt: number): void {
  for (const e of world.query(C.Transform, C.Unit, C.PathFollow)) {
    const t = world.get<Transform>(e, C.Transform)!;
    const u = world.get<Unit>(e, C.Unit)!;
    const p = world.get<PathFollow>(e, C.PathFollow)!;

    let budget = u.speed * dt; // distance the unit can travel this tick

    while (budget > 0) {
      if (p.index >= p.waypoints.length) {
        world.remove(e, C.PathFollow);
        break;
      }
      const wp = p.waypoints[p.index];
      const dx = wp.x - t.x;
      const dz = wp.z - t.z;
      const dist = Math.hypot(dx, dz);
      const isFinal = p.index === p.waypoints.length - 1;
      const arrive = isFinal ? 0.04 : 0.12;

      if (dist <= arrive) {
        p.index++;
        if (p.index >= p.waypoints.length) {
          world.remove(e, C.PathFollow);
          break;
        }
        continue;
      }

      const stepDist = Math.min(dist, budget);
      t.x += (dx / dist) * stepDist;
      t.z += (dz / dist) * stepDist;
      t.rot = Math.atan2(dx, dz);
      budget -= stepDist;
    }
  }
}
