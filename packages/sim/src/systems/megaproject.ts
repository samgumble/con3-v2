import type { Entity, World } from "@con3/ecs";
import {
  type Building,
  C,
  type Economy,
  type MegaProject,
  type PathFollow,
  type Transform,
  type Unit,
} from "../components";
import type { NavGrid } from "../grid";
import { findPath } from "../pathfind";

const REACH = 1.5; // slack beyond summed radii to count as "on-site"
const MAT_DELIVERY_PER_CREW = 6; // materials/sec drawn from the yard per crew

export interface PhaseDef {
  name: string;
  materials: number; // materials this phase consumes
  effort: number; // worker-seconds this phase requires
}

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
      vx: 0,
      vz: 0,
    });
  }
}

/**
 * Advance the central megaproject (the HQ). Assigned MegaBuilders walk to the
 * site; on-site crews supply effort (worker-seconds) while the project draws
 * materials from the yard stockpile. A phase completes once both its material
 * and effort targets are met; finishing the last phase wins the game.
 */
export function megaprojectSystem(
  world: World,
  grid: NavGrid,
  economy: Economy,
  phases: PhaseDef[],
  dt: number,
  onWin: () => void,
): void {
  let hq = 0;
  for (const e of world.query(C.MegaProject, C.Transform, C.Building)) {
    hq = e;
    break;
  }
  if (!hq) return;

  const mp = world.get<MegaProject>(hq, C.MegaProject)!;
  if (mp.complete) return;

  const ht = world.get<Transform>(hq, C.Transform)!;
  const hb = world.get<Building>(hq, C.Building)!;

  // Route builders to the site and count those on-site.
  let crews = 0;
  for (const e of world.query(C.MegaBuilder, C.Transform, C.Unit)) {
    const t = world.get<Transform>(e, C.Transform)!;
    const u = world.get<Unit>(e, C.Unit)!;
    const dist = Math.hypot(ht.x - t.x, ht.z - t.z);
    if (dist <= hb.radius + u.radius + REACH) {
      world.remove(e, C.PathFollow); // stop and work
      crews++;
    } else if (!world.has(e, C.PathFollow)) {
      setPath(world, grid, e, ht.x, ht.z);
    }
  }
  if (crews === 0) return;

  const phase = phases[mp.phaseIndex];
  mp.phaseEffort += crews * dt;

  const need = phase.materials - mp.phaseMaterials;
  if (need > 0 && economy.materials > 0) {
    const take = Math.min(need, economy.materials, MAT_DELIVERY_PER_CREW * crews * dt);
    economy.materials -= take;
    mp.phaseMaterials += take;
  }

  if (mp.phaseEffort >= phase.effort && mp.phaseMaterials >= phase.materials) {
    mp.phaseIndex++;
    mp.phaseEffort = 0;
    mp.phaseMaterials = 0;
    if (mp.phaseIndex >= phases.length) {
      mp.complete = true;
      onWin();
    }
  }
}
