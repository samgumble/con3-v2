import type { World } from "@con3/ecs";
import {
  C,
  type Collider,
  type PathFollow,
  type Transform,
  type Unit,
} from "../components";
import type { NavGrid } from "../grid";
import { findPath } from "../pathfind";
import { SpatialHash } from "../spatial-hash";

// Steering tuning.
const SENSE = 4; // how far ahead a unit senses other units
const SEEK = 1.3; // weight of the goal-seeking force (kept above avoidance)
const AVOID_AWAY = 0.9; // repulsion strength from neighbors
const AVOID_TANGENT = 0.8; // sidestep-around strength for neighbors
const AVOID_MAX = 1.4; // cap on total avoidance so seek is never fully overridden
const OBST_BUFFER = 2; // extra reach when sensing obstacles
const OBST_AWAY = 1.3;
const OBST_TANGENT = 1.0;
const ARRIVE_MID = 0.6; // waypoint reached radius (mid-path, steering cuts corners)
const ARRIVE_FINAL = 0.12; // tighter radius for the final destination
const ACCEL = 0.22; // velocity smoothing per tick — inertia that kills jitter
const ARRIVE_SLOW = 2.5; // ease speed to zero within this distance of the final goal
const STOP_SPEED2 = 0.04; // below this squared speed, hold heading (don't spin)

// Stuck handling.
const STUCK_LIMIT = 50; // ticks of no progress before replanning (~2.5s)
const PROGRESS_EPS = 0.2; // distance-to-goal improvement that counts as progress
const GIVE_UP_DIST = 4; // near a crowded goal this close, just stop
const MAX_REPLANS = 2; // after this many replans without arriving, give up

/**
 * Walk units along their PathFollow waypoints with local steering. Each mover
 * seeks its current waypoint, then blends in avoidance forces so it veers
 * *around* nearby units and obstacles instead of colliding head-on. Positions
 * are double-buffered: every mover reads start-of-tick neighbor positions, so
 * results are independent of iteration order (deterministic).
 */
export function movementSystem(
  world: World,
  grid: NavGrid,
  obstacles: readonly Collider[],
  dt: number,
  speedMul = 1,
): void {
  const movers = world.query(C.Transform, C.Unit, C.PathFollow).sort((a, b) => a - b);
  if (movers.length === 0) return;

  // Hash of ALL units for neighbor sensing (uses start-of-tick positions).
  const hash = new SpatialHash(SENSE);
  for (const e of world.query(C.Transform, C.Unit)) {
    const t = world.get<Transform>(e, C.Transform)!;
    hash.insert(e, t.x, t.z);
  }

  const next: { e: number; x: number; z: number; rot: number }[] = [];

  for (const e of movers) {
    const t = world.get<Transform>(e, C.Transform)!;
    const u = world.get<Unit>(e, C.Unit)!;
    const p = world.get<PathFollow>(e, C.PathFollow)!;

    // Skip past any waypoints already reached.
    let wp = p.waypoints[p.index];
    while (wp) {
      const d = Math.hypot(wp.x - t.x, wp.z - t.z);
      const isFinal = p.index === p.waypoints.length - 1;
      if (d <= (isFinal ? ARRIVE_FINAL : ARRIVE_MID)) {
        p.index++;
        wp = p.waypoints[p.index];
      } else break;
    }
    if (!wp) {
      world.remove(e, C.PathFollow);
      continue;
    }

    // Desired (seek) direction toward the waypoint.
    let dx = wp.x - t.x;
    let dz = wp.z - t.z;
    const dlen = Math.hypot(dx, dz) || 1;
    dx /= dlen;
    dz /= dlen;

    let ax = 0;
    let az = 0;

    // Avoid other units: repel + steer to the side to go around.
    hash.forNeighbors(t.x, t.z, (j) => {
      if (j === e) return;
      const tj = world.get<Transform>(j, C.Transform)!;
      const uj = world.get<Unit>(j, C.Unit)!;
      const rx = tj.x - t.x;
      const rz = tj.z - t.z;
      const dist = Math.hypot(rx, rz);
      if (dist <= 1e-4 || dist > SENSE) return;
      const ahead = (rx * dx + rz * dz) / dist; // cosine to neighbor
      if (ahead < -0.3) return; // behind us — ignore
      const combined = u.radius + uj.radius;
      const w = clamp01(1 - (dist - combined) / SENSE);
      ax -= (rx / dist) * w * AVOID_AWAY;
      az -= (rz / dist) * w * AVOID_AWAY;
      const side = sidestep(dx, dz, rx, rz);
      ax += dz * side * w * AVOID_TANGENT;
      az += -dx * side * w * AVOID_TANGENT;
    });

    // Avoid static obstacles (in addition to the A* path already routing).
    for (const o of obstacles) {
      const rx = o.x - t.x;
      const rz = o.z - t.z;
      const dist = Math.hypot(rx, rz);
      const skin = o.radius + u.radius;
      if (dist <= 1e-4 || dist > skin + OBST_BUFFER) continue;
      if ((rx * dx + rz * dz) / dist < 0) continue; // obstacle is behind
      const w = clamp01(1 - (dist - skin) / OBST_BUFFER);
      ax -= (rx / dist) * w * OBST_AWAY;
      az -= (rz / dist) * w * OBST_AWAY;
      const side = sidestep(dx, dz, rx, rz);
      ax += dz * side * w * OBST_TANGENT;
      az += -dx * side * w * OBST_TANGENT;
    }

    // Clamp total avoidance so the goal-seeking force always has a say.
    const alen = Math.hypot(ax, az);
    if (alen > AVOID_MAX) {
      ax = (ax / alen) * AVOID_MAX;
      az = (az / alen) * AVOID_MAX;
    }

    // Target speed eases to zero near the FINAL waypoint so units settle into
    // place instead of overshooting and orbiting the destination.
    const speed = u.speed * speedMul;
    let targetSpeed = speed;
    if (p.index === p.waypoints.length - 1) {
      const distWp = Math.hypot(wp.x - t.x, wp.z - t.z);
      targetSpeed = Math.min(speed, speed * (distWp / ARRIVE_SLOW));
    }

    // Desired velocity = seek-biased + avoidance, scaled to the target speed.
    let dvx = dx * SEEK + ax;
    let dvz = dz * SEEK + az;
    const dvlen = Math.hypot(dvx, dvz) || 1;
    dvx = (dvx / dvlen) * targetSpeed;
    dvz = (dvz / dvlen) * targetSpeed;

    // Smooth toward the desired velocity (inertia). This is the key fix for
    // jitter: heading can't snap 180° in one tick when neighbors jostle.
    p.vx += (dvx - p.vx) * ACCEL;
    p.vz += (dvz - p.vz) * ACCEL;

    const minX = grid.originX + u.radius;
    const maxX = grid.originX + grid.width * grid.cellSize - u.radius;
    const minZ = grid.originZ + u.radius;
    const maxZ = grid.originZ + grid.height * grid.cellSize - u.radius;
    const nx = clamp(t.x + p.vx * dt, minX, maxX);
    const nz = clamp(t.z + p.vz * dt, minZ, maxZ);
    const speed2 = p.vx * p.vx + p.vz * p.vz;
    const rot = speed2 > STOP_SPEED2 ? Math.atan2(p.vx, p.vz) : t.rot;

    // Stuck detection: if we haven't gotten closer to the goal in a while, the
    // unit was likely shoved off-path — replan from where it actually is, or
    // give up if it's already crowding the destination.
    const distGoal = Math.hypot(p.goalX - nx, p.goalZ - nz);
    if (distGoal < p.bestDist - PROGRESS_EPS) {
      p.bestDist = distGoal;
      p.stuckTicks = 0;
    } else {
      p.stuckTicks++;
    }
    if (p.stuckTicks > STUCK_LIMIT) {
      const replan =
        distGoal >= GIVE_UP_DIST && p.replans < MAX_REPLANS
          ? findPath(grid, nx, nz, p.goalX, p.goalZ)
          : null;
      if (replan && replan.length > 0) {
        p.waypoints = replan;
        p.index = 0;
        p.stuckTicks = 0;
        p.bestDist = distGoal;
        p.replans++;
      } else {
        // Close enough, or out of replan attempts: stop here.
        world.remove(e, C.PathFollow);
      }
    }

    next.push({ e, x: nx, z: nz, rot });
  }

  for (const np of next) {
    const t = world.get<Transform>(np.e, C.Transform)!;
    t.x = np.x;
    t.z = np.z;
    t.rot = np.rot;
  }
}

/**
 * Pick which side (+1/-1) to steer around something at relative (rx, rz),
 * given heading (dx, dz). Near head-on, default to a consistent side so two
 * units meeting don't both pick the same way.
 */
function sidestep(dx: number, dz: number, rx: number, rz: number): number {
  const cross = dx * rz - dz * rx;
  if (Math.abs(cross) < 0.2) return 1;
  return cross > 0 ? -1 : 1;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
