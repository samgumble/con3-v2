/**
 * Uniform spatial hash for fast neighbor queries. Entities are bucketed by
 * cell; `forNeighbors` visits the 3×3 cells around a point, so the cell size
 * should be >= the largest query radius.
 */
export class SpatialHash {
  private readonly cells = new Map<number, number[]>();

  constructor(private readonly cellSize: number) {}

  private key(cx: number, cy: number): number {
    return (cx + 8192) * 65536 + (cy + 8192);
  }

  clear(): void {
    this.cells.clear();
  }

  insert(id: number, x: number, z: number): void {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(z / this.cellSize);
    const k = this.key(cx, cy);
    const bucket = this.cells.get(k);
    if (bucket) bucket.push(id);
    else this.cells.set(k, [id]);
  }

  /** Invoke `cb` for every id in the 3×3 cells surrounding (x, z). */
  forNeighbors(x: number, z: number, cb: (id: number) => void): void {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(z / this.cellSize);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const bucket = this.cells.get(this.key(cx + ox, cy + oy));
        if (bucket) for (const id of bucket) cb(id);
      }
    }
  }
}
