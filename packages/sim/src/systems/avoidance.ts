import type { World } from "@con3/ecs";
import { C, type Transform, type Unit } from "../components";

/** Cell size for the neighbor hash — a bit larger than the biggest unit. */
const CELL = 2.5;

function key(cx: number, cy: number): number {
  // Pack two smallish signed cell coords into one number key.
  return (cx + 4096) * 100000 + (cy + 4096);
}

/**
 * Separate overlapping units by pushing pairs apart along their connecting
 * axis. Uses a uniform spatial hash so it stays near-linear with unit count.
 * Iterates entities in id order and resolves each pair once (j > i) for
 * deterministic results.
 */
export function avoidanceSystem(world: World): void {
  const units = world.query(C.Transform, C.Unit).sort((a, b) => a - b);
  if (units.length < 2) return;

  const tf: Transform[] = [];
  const rad: number[] = [];
  const buckets = new Map<number, number[]>();

  for (let i = 0; i < units.length; i++) {
    const e = units[i];
    const t = world.get<Transform>(e, C.Transform)!;
    const u = world.get<Unit>(e, C.Unit)!;
    tf.push(t);
    rad.push(u.radius);
    const cx = Math.floor(t.x / CELL);
    const cy = Math.floor(t.z / CELL);
    const k = key(cx, cy);
    const b = buckets.get(k);
    if (b) b.push(i);
    else buckets.set(k, [i]);
  }

  for (let i = 0; i < units.length; i++) {
    const ti = tf[i];
    const cx = Math.floor(ti.x / CELL);
    const cy = Math.floor(ti.z / CELL);

    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const b = buckets.get(key(cx + ox, cy + oy));
        if (!b) continue;
        for (const j of b) {
          if (j <= i) continue; // resolve each pair once
          const tj = tf[j];
          let dx = tj.x - ti.x;
          let dz = tj.z - ti.z;
          const minDist = rad[i] + rad[j];
          let d2 = dx * dx + dz * dz;
          if (d2 >= minDist * minDist) continue;

          let dist = Math.sqrt(d2);
          if (dist < 1e-4) {
            // Exactly overlapping: nudge apart deterministically.
            dx = (i % 2 === 0 ? 1 : -1) * 0.01;
            dz = 0.01;
            dist = Math.hypot(dx, dz);
          }
          const overlap = minDist - dist;
          const pushX = (dx / dist) * overlap * 0.5;
          const pushZ = (dz / dist) * overlap * 0.5;
          ti.x -= pushX;
          ti.z -= pushZ;
          tj.x += pushX;
          tj.z += pushZ;
        }
      }
    }
  }
}
