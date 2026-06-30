import type { Entity, World } from "@con3/ecs";
import {
  C,
  type Building,
  type Economy,
  type Harvester,
  type PathFollow,
  type ResourceNode,
  type Transform,
  type Unit,
} from "../components";
import type { NavGrid } from "../grid";
import { findPath } from "../pathfind";

const MINE_TIME = 1.6; // seconds to fill up at a deposit
const UNLOAD_TIME = 0.6; // seconds to deposit at a drop-off
const REACH = 1.2; // slack beyond summed radii to count as "arrived"

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

function nearestDrop(world: World, x: number, z: number): Entity {
  let best = 0;
  let bestD = Infinity;
  for (const e of world.query(C.Building, C.DropOff, C.Transform)) {
    if (world.has(e, C.Construction)) continue; // unfinished buildings can't accept
    const t = world.get<Transform>(e, C.Transform)!;
    const d = (t.x - x) ** 2 + (t.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function nearestNode(world: World, x: number, z: number): Entity {
  let best = 0;
  let bestD = Infinity;
  for (const e of world.query(C.ResourceNode, C.Transform)) {
    if (world.get<ResourceNode>(e, C.ResourceNode)!.amount <= 0) continue;
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
 * Advance each harvester through its cycle: walk to the assigned deposit, mine
 * for a beat, haul to the nearest drop-off, deposit into the economy, repeat.
 * Movement is delegated to the pathfinder/steering via PathFollow.
 */
export function harvestSystem(
  world: World,
  grid: NavGrid,
  economy: Economy,
  dt: number,
  opts: { allowed?: boolean; yieldMul?: number } = {},
): void {
  if (opts.allowed === false) return; // e.g. labor strike: gathering paused
  const yieldMul = opts.yieldMul ?? 1;
  for (const e of world.query(C.Harvester, C.Transform, C.Unit)) {
    const h = world.get<Harvester>(e, C.Harvester)!;
    const t = world.get<Transform>(e, C.Transform)!;
    const u = world.get<Unit>(e, C.Unit)!;

    switch (h.state) {
      case "idle":
        break;

      case "toNode": {
        let node = h.nodeId && world.isAlive(h.nodeId) ? h.nodeId : 0;
        if (!node) {
          node = nearestNode(world, t.x, t.z);
          h.nodeId = node;
        }
        if (!node) {
          h.state = "idle";
          break;
        }
        const nt = world.get<Transform>(node, C.Transform)!;
        const nr = world.get<ResourceNode>(node, C.ResourceNode)!;
        const dist = Math.hypot(nt.x - t.x, nt.z - t.z);
        if (dist <= nr.radius + u.radius + REACH) {
          world.remove(e, C.PathFollow);
          h.state = "mining";
          h.timer = MINE_TIME;
        } else if (!world.has(e, C.PathFollow)) {
          setPath(world, grid, e, nt.x, nt.z);
        }
        break;
      }

      case "mining": {
        const node = h.nodeId;
        if (!node || !world.isAlive(node)) {
          h.state = "toNode";
          break;
        }
        h.timer -= dt;
        if (h.timer <= 0) {
          const n = world.get<ResourceNode>(node, C.ResourceNode)!;
          const take = Math.min(h.capacity, n.amount);
          n.amount -= take;
          h.carrying = take;
          const depleted = n.amount <= 0;
          if (depleted) world.destroy(node);
          h.nodeId = depleted ? 0 : node;

          const drop = nearestDrop(world, t.x, t.z);
          h.dropId = drop;
          if (!drop) {
            h.state = "idle";
            break;
          }
          const dtf = world.get<Transform>(drop, C.Transform)!;
          h.state = "toDrop";
          setPath(world, grid, e, dtf.x, dtf.z);
        }
        break;
      }

      case "toDrop": {
        let drop = h.dropId && world.isAlive(h.dropId) ? h.dropId : 0;
        if (!drop) {
          drop = nearestDrop(world, t.x, t.z);
          h.dropId = drop;
        }
        if (!drop) {
          h.state = "idle";
          break;
        }
        const dtf = world.get<Transform>(drop, C.Transform)!;
        const db = world.get<Building>(drop, C.Building)!;
        const dist = Math.hypot(dtf.x - t.x, dtf.z - t.z);
        if (dist <= db.radius + u.radius + REACH) {
          world.remove(e, C.PathFollow);
          h.state = "unloading";
          h.timer = UNLOAD_TIME;
        } else if (!world.has(e, C.PathFollow)) {
          setPath(world, grid, e, dtf.x, dtf.z);
        }
        break;
      }

      case "unloading": {
        h.timer -= dt;
        if (h.timer <= 0) {
          economy.materials += h.carrying * yieldMul; // shortage halves yield
          h.carrying = 0;
          const node = h.nodeId && world.isAlive(h.nodeId) ? h.nodeId : nearestNode(world, t.x, t.z);
          h.nodeId = node;
          if (!node) {
            h.state = "idle";
            break;
          }
          const nt = world.get<Transform>(node, C.Transform)!;
          h.state = "toNode";
          setPath(world, grid, e, nt.x, nt.z);
        }
        break;
      }
    }
  }
}
