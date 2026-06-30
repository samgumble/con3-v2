import type { Entity, World } from "@con3/ecs";
import {
  type Building,
  C,
  type Economy,
  type MegaBuilder,
  type MegaProject,
  type PathFollow,
  type Stockpile,
  type Transform,
  type Unit,
} from "../components";
import type { NavGrid } from "../grid";
import { findPath } from "../pathfind";

const REACH = 1.6; // slack beyond summed radii to count as "arrived"

export interface PhaseDef {
  name: string;
  materials: number; // materials this phase consumes
  effort: number; // effort-seconds this phase requires
  fundsReward: number; // Funds paid out on completion (progress payment)
  requiresCrane?: boolean; // tall phases need a Crane on-site to advance
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

/** Nearest completed stockpile building that still has materials, or 0. */
function nearestStock(world: World, x: number, z: number): Entity {
  let best = 0;
  let bestD = Infinity;
  for (const e of world.query(C.Stockpile, C.Transform, C.Building)) {
    if (world.has(e, C.Construction)) continue;
    if (world.get<Stockpile>(e, C.Stockpile)!.amount <= 0) continue;
    const t = world.get<Transform>(e, C.Transform)!;
    const d = (t.x - x) ** 2 + (t.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/**
 * Advance the HQ megaproject as a physical supply line. Each assigned crew
 * either (a) carries a load it already has to the HQ, (b) when the phase still
 * needs materials and the unit can haul, fetches a load from the nearest
 * stockpile (Field Office / Depot) and brings it back, or (c) otherwise stands
 * on-site and adds build effort. A phase completes once both its material and
 * effort targets are met; the tall phases need a crane on-site for effort to
 * accrue (cranes can't haul, so workers/excavators must keep them supplied).
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
  const phase = phases[mp.phaseIndex];

  let effortPower = 0;
  let cranes = 0;
  const needMat = mp.phaseMaterials < phase.materials;

  for (const e of world.query(C.MegaBuilder, C.Transform, C.Unit)) {
    const t = world.get<Transform>(e, C.Transform)!;
    const u = world.get<Unit>(e, C.Unit)!;
    const mb = world.get<MegaBuilder>(e, C.MegaBuilder)!;
    const atHQ = Math.hypot(ht.x - t.x, ht.z - t.z) <= hb.radius + u.radius + REACH;

    // (a) Carrying a load → deliver it to the HQ site.
    if (mb.carrying > 0) {
      if (atHQ) {
        world.remove(e, C.PathFollow);
        mp.phaseMaterials = Math.min(phase.materials, mp.phaseMaterials + mb.carrying);
        mb.carrying = 0;
        mb.srcId = 0;
      } else if (!world.has(e, C.PathFollow)) {
        setPath(world, grid, e, ht.x, ht.z);
      }
      continue;
    }

    // (b) Phase still wants materials and this unit can haul → fetch a load.
    if (needMat && u.carry > 0) {
      // Keep heading to the chosen stockpile while it still has materials.
      let src =
        mb.srcId &&
        world.isAlive(mb.srcId) &&
        (world.get<Stockpile>(mb.srcId, C.Stockpile)?.amount ?? 0) > 0
          ? mb.srcId
          : 0;
      if (!src) src = nearestStock(world, t.x, t.z);
      if (src) {
        mb.srcId = src;
        const st = world.get<Transform>(src, C.Transform)!;
        const sb = world.get<Building>(src, C.Building)!;
        if (Math.hypot(st.x - t.x, st.z - t.z) <= sb.radius + u.radius + REACH) {
          world.remove(e, C.PathFollow);
          const sp = world.get<Stockpile>(src, C.Stockpile)!;
          const load = Math.min(u.carry, sp.amount);
          sp.amount -= load;
          mb.carrying = load;
          mb.srcId = 0;
        } else if (!world.has(e, C.PathFollow)) {
          setPath(world, grid, e, st.x, st.z);
        }
        continue;
      }
      // Nothing left to haul → fall through and build what we can.
    }

    // (c) Build: stand on-site and add effort.
    mb.srcId = 0;
    if (atHQ) {
      world.remove(e, C.PathFollow);
      effortPower += u.megaEffort;
      if (u.kind === "crane") cranes++;
    } else if (!world.has(e, C.PathFollow)) {
      setPath(world, grid, e, ht.x, ht.z);
    }
  }

  // Effort accrues unless a tall phase still lacks a crane on-site.
  if (!(phase.requiresCrane && cranes === 0)) {
    mp.phaseEffort += effortPower * dt;
  }

  if (mp.phaseEffort >= phase.effort && mp.phaseMaterials >= phase.materials) {
    economy.funds += phase.fundsReward; // progress payment
    mp.phaseIndex++;
    mp.phaseEffort = 0;
    mp.phaseMaterials = 0;
    if (mp.phaseIndex >= phases.length) {
      mp.complete = true;
      onWin();
    }
  }
}
