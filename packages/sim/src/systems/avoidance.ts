import type { World } from "@con3/ecs";
import { C, type Collider, type Transform, type Unit } from "../components";
import { SpatialHash } from "../spatial-hash";

const CELL = 3;
const SEP_ITERS = 2; // relaxation passes to resolve dense multi-unit pileups

/**
 * Safety net after steering: resolve any residual overlaps and push units out
 * of obstacles so nothing ever ends up stacked or clipping into a rock.
 *
 * Overlap resolution is mobility-weighted — a moving unit gives way fully to an
 * idle one (idle units act as anchors), so crews flow *around* stationary units
 * rather than shoving them across the map.
 */
export function separationSystem(world: World, obstacles: readonly Collider[]): void {
  const units = world.query(C.Transform, C.Unit).sort((a, b) => a - b);
  if (units.length === 0) return;

  const hash = new SpatialHash(CELL);
  const transforms = new Map<number, Transform>();
  for (const e of units) {
    const t = world.get<Transform>(e, C.Transform)!;
    transforms.set(e, t);
    hash.insert(e, t.x, t.z);
  }

  // Unit-unit de-overlap, each pair handled once (j > i). A couple of
  // relaxation passes resolve chains of overlaps in dense crowds.
  for (let iter = 0; iter < SEP_ITERS; iter++) {
    for (const e of units) {
      const ti = transforms.get(e)!;
      const ui = world.get<Unit>(e, C.Unit)!;
      const moverI = world.has(e, C.PathFollow);

      hash.forNeighbors(ti.x, ti.z, (j) => {
        if (j <= e) return;
        const tj = transforms.get(j)!;
        const uj = world.get<Unit>(j, C.Unit)!;

        let rx = tj.x - ti.x;
        let rz = tj.z - ti.z;
        const minDist = ui.radius + uj.radius;
        const d2 = rx * rx + rz * rz;
        if (d2 >= minDist * minDist) return;

        let dist = Math.sqrt(d2);
        if (dist < 1e-4) {
          // Exactly coincident: nudge apart deterministically.
          rx = (e % 2 === 0 ? 1 : -1) * 0.01;
          rz = 0.01;
          dist = Math.hypot(rx, rz);
        }
        const overlap = minDist - dist;
        const nx = rx / dist;
        const nz = rz / dist;

        // Split the correction by mobility: movers yield to idle anchors.
        const moverJ = world.has(j, C.PathFollow);
        let wi = 0.5;
        let wj = 0.5;
        if (moverI && !moverJ) {
          wi = 1;
          wj = 0;
        } else if (!moverI && moverJ) {
          wi = 0;
          wj = 1;
        }
        ti.x -= nx * overlap * wi;
        ti.z -= nz * overlap * wi;
        tj.x += nx * overlap * wj;
        tj.z += nz * overlap * wj;
      });
    }
  }

  // Push any unit overlapping an obstacle straight back out (exact circle).
  for (const e of units) {
    const t = transforms.get(e)!;
    const u = world.get<Unit>(e, C.Unit)!;
    for (const o of obstacles) {
      const rx = t.x - o.x;
      const rz = t.z - o.z;
      const minDist = o.radius + u.radius;
      const d2 = rx * rx + rz * rz;
      if (d2 >= minDist * minDist) continue;
      const dist = Math.sqrt(d2) || 1e-4;
      const push = minDist - dist;
      t.x += (rx / dist) * push;
      t.z += (rz / dist) * push;
    }
  }
}
