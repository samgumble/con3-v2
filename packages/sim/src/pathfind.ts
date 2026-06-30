import type { NavGrid } from "./grid";

/** Min-heap keyed by f-score for the A* open set. */
class MinHeap {
  private nodes: number[] = []; // tile indices
  private prio: number[] = []; // parallel f-scores

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, priority: number): void {
    this.nodes.push(node);
    this.prio.push(priority);
    let i = this.nodes.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.nodes[0];
    const lastNode = this.nodes.pop()!;
    const lastPrio = this.prio.pop()!;
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode;
      this.prio[0] = lastPrio;
      this.siftDown(0);
    }
    return top;
  }

  private siftDown(i: number): void {
    const n = this.nodes.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let smallest = i;
      if (l < n && this.prio[l] < this.prio[smallest]) smallest = l;
      if (r < n && this.prio[r] < this.prio[smallest]) smallest = r;
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    [this.nodes[a], this.nodes[b]] = [this.nodes[b], this.nodes[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
  }
}

const SQRT2 = Math.SQRT2;

// 8-connected neighbors: 4 orthogonal (cost 1) then 4 diagonal (cost √2).
const NEIGHBORS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/** Octile distance heuristic (admissible for 8-connected grids). */
function octile(dx: number, dy: number): number {
  dx = Math.abs(dx);
  dy = Math.abs(dy);
  return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
}

/**
 * A* from a world start to a world goal. Returns world-space waypoints (tile
 * centers, with the exact goal appended), or null if unreachable. If the goal
 * tile is blocked, routes to the nearest free tile instead.
 */
export function findPath(
  grid: NavGrid,
  sx: number,
  sz: number,
  gx: number,
  gz: number,
): { x: number; z: number }[] | null {
  const start = grid.worldToTileClamped(sx, sz);
  let goal = grid.worldToTileClamped(gx, gz);

  if (grid.isBlocked(goal.tx, goal.ty)) {
    const free = grid.nearestFree(goal.tx, goal.ty);
    if (!free) return null;
    goal = free;
  }

  const W = grid.width;
  const N = W * grid.height;
  const startIdx = grid.index(start.tx, start.ty);
  const goalIdx = grid.index(goal.tx, goal.ty);

  if (startIdx === goalIdx) return [{ x: gx, z: gz }];

  const gScore = new Float32Array(N).fill(Infinity);
  const cameFrom = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open = new MinHeap();

  gScore[startIdx] = 0;
  open.push(startIdx, octile(start.tx - goal.tx, start.ty - goal.ty));

  while (open.size > 0) {
    const current = open.pop();
    if (current === goalIdx) return reconstruct(grid, cameFrom, current, gx, gz);
    if (closed[current]) continue;
    closed[current] = 1;

    const cx = current % W;
    const cy = (current / W) | 0;

    for (const [dx, dy, cost] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (grid.isBlocked(nx, ny)) continue;
      // No corner cutting: a diagonal move needs both orthogonal cells free.
      if (dx !== 0 && dy !== 0) {
        if (grid.isBlocked(cx + dx, cy) || grid.isBlocked(cx, cy + dy)) continue;
      }
      const nIdx = ny * W + nx;
      if (closed[nIdx]) continue;
      const tentative = gScore[current] + cost;
      if (tentative < gScore[nIdx]) {
        gScore[nIdx] = tentative;
        cameFrom[nIdx] = current;
        open.push(nIdx, tentative + octile(nx - goal.tx, ny - goal.ty));
      }
    }
  }

  return null;
}

function reconstruct(
  grid: NavGrid,
  cameFrom: Int32Array,
  goalIdx: number,
  gx: number,
  gz: number,
): { x: number; z: number }[] {
  const W = grid.width;
  const tiles: number[] = [];
  let cur = goalIdx;
  while (cur !== -1) {
    tiles.push(cur);
    cur = cameFrom[cur];
  }
  tiles.reverse();

  // Convert to world centers, dropping the start tile (units are already there).
  const path: { x: number; z: number }[] = [];
  for (let i = 1; i < tiles.length; i++) {
    const tx = tiles[i] % W;
    const ty = (tiles[i] / W) | 0;
    path.push(grid.tileToWorld(tx, ty));
  }
  // Replace the final tile center with the exact requested point.
  if (path.length > 0) path[path.length - 1] = { x: gx, z: gz };
  else path.push({ x: gx, z: gz });
  return path;
}
