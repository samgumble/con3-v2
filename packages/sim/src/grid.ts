/**
 * Navigation grid for pathfinding. The world is a flat XZ plane; this overlays
 * a uniform tile grid where each tile is walkable or blocked. World ↔ tile
 * conversions let gameplay code stay in world units while A* runs on tiles.
 */
export interface Tile {
  tx: number;
  ty: number;
}

export class NavGrid {
  readonly blocked: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cellSize: number,
    readonly originX: number,
    readonly originZ: number,
  ) {
    this.blocked = new Uint8Array(width * height);
  }

  /** Build a grid centered on the origin spanning [-half, +half] on each axis. */
  static centered(halfExtent: number, cellSize: number): NavGrid {
    const tiles = Math.ceil((halfExtent * 2) / cellSize);
    return new NavGrid(tiles, tiles, cellSize, -halfExtent, -halfExtent);
  }

  index(tx: number, ty: number): number {
    return ty * this.width + tx;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  isBlocked(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    return this.blocked[this.index(tx, ty)] === 1;
  }

  setBlocked(tx: number, ty: number, value = true): void {
    if (this.inBounds(tx, ty)) this.blocked[this.index(tx, ty)] = value ? 1 : 0;
  }

  worldToTile(x: number, z: number): Tile {
    return {
      tx: Math.floor((x - this.originX) / this.cellSize),
      ty: Math.floor((z - this.originZ) / this.cellSize),
    };
  }

  /** Clamp a world point to the nearest in-bounds tile. */
  worldToTileClamped(x: number, z: number): Tile {
    const t = this.worldToTile(x, z);
    return {
      tx: Math.min(this.width - 1, Math.max(0, t.tx)),
      ty: Math.min(this.height - 1, Math.max(0, t.ty)),
    };
  }

  /** Center of a tile in world coordinates. */
  tileToWorld(tx: number, ty: number): { x: number; z: number } {
    return {
      x: this.originX + (tx + 0.5) * this.cellSize,
      z: this.originZ + (ty + 0.5) * this.cellSize,
    };
  }

  /** Block every tile whose center falls within `radius` of (x, z). */
  blockCircle(x: number, z: number, radius: number): void {
    const min = this.worldToTile(x - radius, z - radius);
    const max = this.worldToTile(x + radius, z + radius);
    const r2 = radius * radius;
    for (let ty = min.ty; ty <= max.ty; ty++) {
      for (let tx = min.tx; tx <= max.tx; tx++) {
        if (!this.inBounds(tx, ty)) continue;
        const c = this.tileToWorld(tx, ty);
        const dx = c.x - x;
        const dz = c.z - z;
        if (dx * dx + dz * dz <= r2) this.setBlocked(tx, ty, true);
      }
    }
  }

  /** Nearest unblocked tile to (tx, ty) via expanding ring search, or null. */
  nearestFree(tx: number, ty: number, maxRadius = 16): Tile | null {
    if (!this.isBlocked(tx, ty)) return { tx, ty };
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
          const nx = tx + dx;
          const ny = ty + dy;
          if (this.inBounds(nx, ny) && !this.isBlocked(nx, ny)) {
            return { tx: nx, ty: ny };
          }
        }
      }
    }
    return null;
  }
}
