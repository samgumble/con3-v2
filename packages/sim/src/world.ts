import { World, type Entity } from "@con3/ecs";
import {
  type Builder,
  type Building,
  type BuildingKind,
  C,
  type Collider,
  type Construction,
  type Economy,
  type Harvester,
  type Obstacle,
  type Owner,
  type PathFollow,
  type ResourceNode,
  type Selectable,
  type Transform,
  type Unit,
  type UnitKind,
} from "./components";
import { NavGrid } from "./grid";
import { findPath } from "./pathfind";
import { movementSystem } from "./systems/movement";
import { separationSystem } from "./systems/avoidance";
import { harvestSystem } from "./systems/harvest";
import { constructionSystem } from "./systems/construction";

/** Fixed simulation rate. The renderer interpolates between ticks. */
export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE; // seconds per tick

/** Half-extent of the playable area in world units. */
export const MAP_HALF = 60;

const SPEED: Record<UnitKind, number> = { worker: 4, excavator: 2.5, crane: 1.5 };
const RADIUS: Record<UnitKind, number> = { worker: 0.5, excavator: 0.8, crane: 1.0 };

export interface BuildingDef {
  radius: number;
  buildTime: number; // seconds of construction effort
  costFunds: number;
  costMaterials: number;
  dropOff: boolean; // accepts harvested materials
  providesLabor: number; // adds to labor cap when complete
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  hq: { radius: 2.6, buildTime: 0, costFunds: 0, costMaterials: 0, dropOff: true, providesLabor: 10 },
  trailer: { radius: 1.7, buildTime: 8, costFunds: 0, costMaterials: 60, dropOff: false, providesLabor: 8 },
  depot: { radius: 1.9, buildTime: 8, costFunds: 0, costMaterials: 80, dropOff: true, providesLabor: 0 },
  workshop: { radius: 2.2, buildTime: 12, costFunds: 120, costMaterials: 120, dropOff: false, providesLabor: 0 },
};

const HARVEST_KINDS: ReadonlySet<UnitKind> = new Set<UnitKind>(["worker", "excavator"]);

/**
 * Owns the ECS world, the navigation grid, the player economy, and advances the
 * sim one fixed tick at a time. Rendering reads state via the snapshot methods.
 */
export class GameSim {
  readonly world = new World();
  readonly grid = NavGrid.centered(MAP_HALF, 2);
  readonly obstacles: Obstacle[] = [];
  readonly economy: Economy = { funds: 500, materials: 0, laborUsed: 0, laborCap: 0 };
  tick = 0;

  constructor() {
    this.spawnObstacles();
    this.spawnBuilding("hq", 0, 16, true);
    this.spawnDeposits();
  }

  private spawnObstacles(): void {
    const defs: Obstacle[] = [
      { x: -2, z: -4, radius: 4.5, kind: "rocks" },
      { x: -12, z: -3, radius: 3.5, kind: "rocks" },
      { x: 8, z: -5, radius: 3.5, kind: "rocks" },
      { x: 16, z: -2, radius: 3, kind: "rocks" },
      { x: -22, z: -6, radius: 3, kind: "rocks" },
      { x: 24, z: 4, radius: 3, kind: "rocks" },
    ];
    for (const o of defs) {
      this.obstacles.push(o);
      this.grid.blockCircle(o.x, o.z, o.radius);
    }
  }

  private spawnDeposits(): void {
    const defs = [
      { x: -22, z: 22, amount: 600 },
      { x: 20, z: 24, amount: 600 },
      { x: -32, z: -8, amount: 500 },
      { x: 32, z: -6, amount: 500 },
    ];
    for (const d of defs) this.spawnDeposit(d.x, d.z, d.amount);
  }

  spawnDeposit(x: number, z: number, amount: number): Entity {
    const e = this.world.create();
    const radius = 1.7;
    this.world.add<Transform>(e, C.Transform, { x, z, rot: 0 });
    this.world.add<ResourceNode>(e, C.ResourceNode, { amount, maxAmount: amount, radius });
    this.grid.blockCircle(x, z, radius);
    return e;
  }

  spawnBuilding(kind: BuildingKind, x: number, z: number, completed: boolean): Entity {
    const def = BUILDINGS[kind];
    const e = this.world.create();
    this.world.add<Transform>(e, C.Transform, { x, z, rot: 0 });
    this.world.add<Owner>(e, C.Owner, { player: 0 });
    this.world.add<Building>(e, C.Building, { kind, radius: def.radius });
    this.world.add<Selectable>(e, C.Selectable, { selected: false });
    if (completed) {
      this.completeBuilding(e);
    } else {
      this.world.add<Construction>(e, C.Construction, { progress: 0, buildTime: def.buildTime });
    }
    this.grid.blockCircle(x, z, def.radius);
    return e;
  }

  /** Finish a building: register drop-off, grant labor cap. */
  completeBuilding(e: Entity): void {
    const b = this.world.get<Building>(e, C.Building)!;
    const def = BUILDINGS[b.kind];
    this.world.remove(e, C.Construction);
    if (def.dropOff) this.world.add(e, C.DropOff, {});
    this.economy.laborCap += def.providesLabor;
  }

  spawnUnit(x: number, z: number, kind: UnitKind = "worker"): Entity {
    const e = this.world.create();
    this.world.add<Transform>(e, C.Transform, { x, z, rot: 0 });
    this.world.add<Unit>(e, C.Unit, { kind, speed: SPEED[kind], radius: RADIUS[kind] });
    this.world.add<Selectable>(e, C.Selectable, { selected: false });
    this.world.add<Owner>(e, C.Owner, { player: 0 });
    return e;
  }

  /** Order entities to move to a world point, pathing around obstacles. */
  commandMove(entities: Iterable<Entity>, x: number, z: number): void {
    const list = [...entities].filter((e) => this.world.has(e, C.Unit));
    const ring = Math.max(0, Math.ceil(Math.sqrt(list.length)) - 1) * 1.1;
    list.forEach((e, i) => {
      this.world.remove(e, C.Harvester); // a manual move cancels harvesting
      const t = this.world.get<Transform>(e, C.Transform)!;
      const angle = (i / Math.max(1, list.length)) * Math.PI * 2;
      const tx = x + Math.cos(angle) * ring;
      const tz = z + Math.sin(angle) * ring;
      const path = findPath(this.grid, t.x, t.z, tx, tz);
      if (path) {
        this.world.add<PathFollow>(e, C.PathFollow, {
          waypoints: path,
          index: 0,
          goalX: tx,
          goalZ: tz,
          stuckTicks: 0,
          bestDist: Infinity,
          replans: 0,
        });
      }
    });
  }

  /** Assign capable units to harvest a deposit. */
  assignHarvest(entities: Iterable<Entity>, nodeId: Entity): void {
    if (!this.world.isAlive(nodeId)) return;
    for (const e of entities) {
      const u = this.world.get<Unit>(e, C.Unit);
      if (!u || !HARVEST_KINDS.has(u.kind)) continue;
      this.world.remove(e, C.PathFollow);
      this.world.add<Harvester>(e, C.Harvester, {
        state: "toNode",
        nodeId,
        dropId: 0,
        carrying: 0,
        capacity: 8,
        timer: 0,
      });
    }
  }

  /** Whether a building of `kind` fits at (x, z) without overlapping anything. */
  canPlaceAt(kind: BuildingKind, x: number, z: number): boolean {
    const r = BUILDINGS[kind].radius;
    if (Math.abs(x) > MAP_HALF - r || Math.abs(z) > MAP_HALF - r) return false;
    for (const c of this.colliders()) {
      const gap = r + c.radius + 0.4;
      if ((c.x - x) ** 2 + (c.z - z) ** 2 < gap * gap) return false;
    }
    return true;
  }

  affordable(kind: BuildingKind): boolean {
    const def = BUILDINGS[kind];
    return this.economy.funds >= def.costFunds && this.economy.materials >= def.costMaterials;
  }

  /**
   * Place a blueprint if it fits and is affordable, deduct its cost, and assign
   * the given units to build it. Returns the new entity, or 0 on failure.
   */
  placeBuilding(
    kind: BuildingKind,
    x: number,
    z: number,
    builders: Iterable<Entity>,
  ): Entity {
    if (!this.affordable(kind) || !this.canPlaceAt(kind, x, z)) return 0;
    const def = BUILDINGS[kind];
    this.economy.funds -= def.costFunds;
    this.economy.materials -= def.costMaterials;
    const e = this.spawnBuilding(kind, x, z, false);
    for (const b of builders) {
      const u = this.world.get<Unit>(b, C.Unit);
      if (!u || !HARVEST_KINDS.has(u.kind)) continue; // workers/excavators build
      this.world.remove(b, C.Harvester);
      this.world.remove(b, C.PathFollow);
      this.world.add<Builder>(b, C.Builder, { targetId: e });
    }
    return e;
  }

  /** Resource node whose footprint contains (x, z), or 0. */
  nodeAt(x: number, z: number): Entity {
    for (const e of this.world.query(C.ResourceNode, C.Transform)) {
      const t = this.world.get<Transform>(e, C.Transform)!;
      const n = this.world.get<ResourceNode>(e, C.ResourceNode)!;
      if ((t.x - x) ** 2 + (t.z - z) ** 2 <= (n.radius + 0.8) ** 2) return e;
    }
    return 0;
  }

  /** Building whose footprint contains (x, z), or 0. */
  buildingAt(x: number, z: number): Entity {
    for (const e of this.world.query(C.Building, C.Transform)) {
      const t = this.world.get<Transform>(e, C.Transform)!;
      const b = this.world.get<Building>(e, C.Building)!;
      if ((t.x - x) ** 2 + (t.z - z) ** 2 <= (b.radius + 0.8) ** 2) return e;
    }
    return 0;
  }

  /** Assign units to help build an in-progress blueprint. */
  assignBuild(entities: Iterable<Entity>, buildingId: Entity): boolean {
    if (!this.world.isAlive(buildingId) || !this.world.has(buildingId, C.Construction)) {
      return false;
    }
    let any = false;
    for (const e of entities) {
      const u = this.world.get<Unit>(e, C.Unit);
      if (!u || !HARVEST_KINDS.has(u.kind)) continue;
      this.world.remove(e, C.Harvester);
      this.world.remove(e, C.PathFollow);
      this.world.add<Builder>(e, C.Builder, { targetId: buildingId });
      any = true;
    }
    return any;
  }

  setSelected(entities: Set<Entity>): void {
    for (const e of this.world.query(C.Selectable)) {
      this.world.get<Selectable>(e, C.Selectable)!.selected = entities.has(e);
    }
  }

  selectedEntities(): Entity[] {
    return this.world
      .query(C.Selectable)
      .filter((e) => this.world.get<Selectable>(e, C.Selectable)!.selected);
  }

  /** Rebuild the avoidance collider list (rocks + buildings + deposits). */
  private colliders(): Collider[] {
    const list: Collider[] = [...this.obstacles];
    for (const e of this.world.query(C.Building, C.Transform)) {
      const t = this.world.get<Transform>(e, C.Transform)!;
      const b = this.world.get<Building>(e, C.Building)!;
      list.push({ x: t.x, z: t.z, radius: b.radius });
    }
    for (const e of this.world.query(C.ResourceNode, C.Transform)) {
      const t = this.world.get<Transform>(e, C.Transform)!;
      const n = this.world.get<ResourceNode>(e, C.ResourceNode)!;
      list.push({ x: t.x, z: t.z, radius: n.radius });
    }
    return list;
  }

  /** Advance exactly one fixed tick. */
  step(): void {
    const colliders = this.colliders();
    movementSystem(this.world, this.grid, colliders, TICK_DT);
    separationSystem(this.world, colliders);
    harvestSystem(this.world, this.grid, this.economy, TICK_DT);
    constructionSystem(this.world, this.grid, TICK_DT, (e) => this.completeBuilding(e));
    this.economy.laborUsed = this.world.query(C.Unit).length;
    this.tick++;
  }

  snapshot(): UnitSnapshot[] {
    const out: UnitSnapshot[] = [];
    for (const e of this.world.query(C.Transform, C.Unit)) {
      const t = this.world.get<Transform>(e, C.Transform)!;
      const u = this.world.get<Unit>(e, C.Unit)!;
      const s = this.world.get<Selectable>(e, C.Selectable);
      const h = this.world.get<Harvester>(e, C.Harvester);
      out.push({
        id: e,
        x: t.x,
        z: t.z,
        rot: t.rot,
        kind: u.kind,
        radius: u.radius,
        selected: s?.selected ?? false,
        moving: this.world.has(e, C.PathFollow),
        carrying: h?.carrying ?? 0,
      });
    }
    return out;
  }

  buildingSnapshot(): BuildingSnapshot[] {
    const out: BuildingSnapshot[] = [];
    for (const e of this.world.query(C.Building, C.Transform)) {
      const t = this.world.get<Transform>(e, C.Transform)!;
      const b = this.world.get<Building>(e, C.Building)!;
      const c = this.world.get<Construction>(e, C.Construction);
      const s = this.world.get<Selectable>(e, C.Selectable);
      out.push({
        id: e,
        x: t.x,
        z: t.z,
        rot: t.rot,
        kind: b.kind,
        radius: b.radius,
        progress: c ? c.progress : 1,
        selected: s?.selected ?? false,
      });
    }
    return out;
  }

  nodeSnapshot(): NodeSnapshot[] {
    const out: NodeSnapshot[] = [];
    for (const e of this.world.query(C.ResourceNode, C.Transform)) {
      const t = this.world.get<Transform>(e, C.Transform)!;
      const n = this.world.get<ResourceNode>(e, C.ResourceNode)!;
      out.push({ id: e, x: t.x, z: t.z, radius: n.radius, amount: n.amount, maxAmount: n.maxAmount });
    }
    return out;
  }
}

export interface UnitSnapshot {
  id: Entity;
  x: number;
  z: number;
  rot: number;
  kind: UnitKind;
  radius: number;
  selected: boolean;
  moving: boolean;
  carrying: number;
}

export interface BuildingSnapshot {
  id: Entity;
  x: number;
  z: number;
  rot: number;
  kind: BuildingKind;
  radius: number;
  progress: number;
  selected: boolean;
}

export interface NodeSnapshot {
  id: Entity;
  x: number;
  z: number;
  radius: number;
  amount: number;
  maxAmount: number;
}
