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
const SENSE = 4.5; // how far ahead a unit senses other units
const SEEK = 1.3; // weight of the goal-seeking force (kept above avoidance)
const NEIGHBOR_AVOID = 1.5; // strength of predictive neighbour avoidance
const PREDICT_TAU = 1.6; // seconds of look-ahead for closest-approach prediction
const AVOID_MARGIN = 0.5; // desired extra spacing beyond touching radii
const HARD_REPEL = 1.2; // close-range positional push so units never stack
const AVOID_MAX = 1.2; // cap on avoidance — kept below SEEK so units always advance
const OBST_BUFFER = 2; // extra reach when sensing obstacles
const OBST_AWAY = 1.3;
const OBST_TANGENT = 1.1;
const ARRIVE_MID = 0.6; // waypoint reached radius (mid-path, steering cuts corners)
const ARRIVE_FINAL = 0.12; // tighter radius for the final destination
const ACCEL = 0.25; // velocity smoothing per tick — inertia that kills jitter
const ARRIVE_SLOW = 2.5; // ease speed to zero within this distance of the final goal
const SLOW_ON_AVOID = 0.45; // ease speed in congestion so units negotiate, not barge
const STOP_SPEED2 = 0.04; // below this squared speed, hold heading (don't spin)

// Stuck handling.
const STUCK_LIMIT = 55; // ticks of no progress before replanning (~2.75s)
const PROGRESS_EPS = 0.2; // distance-to-goal improvement that counts as progress
const GIVE_UP_DIST = 3.2; // near a crowded goal this close, just stop
const MAX_REPLANS = 3; // after this many replans without arriving, give up

interface VelInfo {
  vx: number;
  vz: number;
  mover: boolean;
}

/**
 * Walk units along their PathFollow waypoints with local steering. Each mover
 * seeks its current waypoint, then blends in avoidance forces so it veers
 * *around* nearby units and obstacles instead of colliding head-on.
 *
 * Neighbour avoidance is **predictive**: a unit projects its and its
 * neighbour's velocity forward to the closest point of approach and steers to
 * miss it, so crews flow around each other early and smoothly instead of
 * shuffling once they're already touching. It's **reciprocal** — when both
 * units are moving each does ~60% of the dodge (they don't over-correct) — and
 * units **ease off the throttle in congestion** so they negotiate tight spots.
 *
 * Determinism: positions are read from start-of-tick transforms (writes are
 * double-buffered into `next`) and velocities from a start-of-tick snapshot, so
 * the result is independent of iteration order.
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

  // Hash of ALL units for neighbour sensing + a velocity snapshot so predictive
  // avoidance reads consistent start-of-tick velocities (movers update theirs
  // in place below, which would otherwise make the result order-dependent).
  const hash = new SpatialHash(SENSE);
  const vel = new Map<number, VelInfo>();
  for (const e of world.query(C.Transform, C.Unit)) {
    const t = world.get<Transform>(e, C.Transform)!;
    hash.insert(e, t.x, t.z);
    const pf = world.get<PathFollow>(e, C.PathFollow);
    vel.set(e, { vx: pf?.vx ?? 0, vz: pf?.vz ?? 0, mover: !!pf });
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

    // Predictive avoidance of other units.
    hash.forNeighbors(t.x, t.z, (j) => {
      if (j === e) return;
      const tj = world.get<Transform>(j, C.Transform)!;
      const rx = tj.x - t.x;
      const rz = tj.z - t.z;
      const dist = Math.hypot(rx, rz);
      if (dist <= 1e-4 || dist > SENSE) return;
      const uj = world.get<Unit>(j, C.Unit)!;
      const vj = vel.get(j)!;
      const combined = u.radius + uj.radius + AVOID_MARGIN;

      // Reciprocity: a moving neighbour will dodge too, so share the work; an
      // idle neighbour won't move, so this unit does all of it.
      const share = vj.mover ? 0.6 : 1;

      // Project to the closest point of approach. relPos (rx,rz) is the
      // neighbour relative to us, so relVel must be the neighbour's velocity
      // relative to us too (neighbour − self) for the frames to match.
      const relvx = vj.vx - p.vx;
      const relvz = vj.vz - p.vz;
      const rv2 = relvx * relvx + relvz * relvz;
      let tcpa = 0;
      if (rv2 > 1e-5) tcpa = clamp(-(rx * relvx + rz * relvz) / rv2, 0, PREDICT_TAU);
      const fx = rx + relvx * tcpa;
      const fz = rz + relvz * tcpa;
      const fdist = Math.hypot(fx, fz) || 1e-3;

      if (fdist < combined) {
        // Sooner + closer predicted approach ⇒ stronger, earlier reaction.
        const urge = clamp01(1 - fdist / combined) * (1 - 0.4 * (tcpa / PREDICT_TAU));
        const inv = 1 / fdist;
        const awayx = -fx * inv;
        const awayz = -fz * inv;
        const side = sidestep(dx, dz, rx, rz);
        const tanx = dz * side;
        const tanz = -dx * side;
        ax += (awayx * 0.7 + tanx * 0.95) * urge * NEIGHBOR_AVOID * share;
        az += (awayz * 0.7 + tanz * 0.95) * urge * NEIGHBOR_AVOID * share;
      }

      // Close-range positional push so units never stack while negotiating.
      if (dist < combined) {
        const o = (combined - dist) / combined;
        ax += (-rx / dist) * o * HARD_REPEL * share;
        az += (-rz / dist) * o * HARD_REPEL * share;
      }
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

    // Clamp total avoidance so the goal-seeking force always has the final say.
    let alen = Math.hypot(ax, az);
    if (alen > AVOID_MAX) {
      ax = (ax / alen) * AVOID_MAX;
      az = (az / alen) * AVOID_MAX;
      alen = AVOID_MAX;
    }
    const congestion = clamp01(alen / AVOID_MAX);

    // Target speed eases near the FINAL waypoint (settle, don't orbit) and in
    // congestion (negotiate the crowd instead of barging through it).
    const speed = u.speed * speedMul;
    let targetSpeed = speed;
    if (p.index === p.waypoints.length - 1) {
      const distWp = Math.hypot(wp.x - t.x, wp.z - t.z);
      targetSpeed = Math.min(speed, speed * (distWp / ARRIVE_SLOW));
    }
    targetSpeed *= 1 - SLOW_ON_AVOID * congestion;

    // Desired velocity = seek-biased + avoidance, scaled to the target speed.
    let dvx = dx * SEEK + ax;
    let dvz = dz * SEEK + az;
    const dvlen = Math.hypot(dvx, dvz) || 1;
    dvx = (dvx / dvlen) * targetSpeed;
    dvz = (dvz / dvlen) * targetSpeed;

    // Smooth toward the desired velocity (inertia). Heading can't snap 180° in
    // one tick when neighbours jostle — the key fix for steering jitter.
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
 * units meeting don't both pick the same way — because the perpendicular is
 * taken relative to each unit's own heading, two opposed units resolve to
 * opposite world sides and pass cleanly.
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
