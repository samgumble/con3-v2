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
  type MegaBuilder,
  type MegaProject,
  type Obstacle,
  type Owner,
  type PathFollow,
  type Producer,
  type ResourceNode,
  type Selectable,
  type Stockpile,
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
import { megaprojectSystem, type PhaseDef } from "./systems/megaproject";

/** Fixed simulation rate. The renderer interpolates between ticks. */
export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE; // seconds per tick

/** Half-extent of the playable area in world units. */
export const MAP_HALF = 60;


export interface BuildingDef {
  radius: number;
  buildTime: number; // seconds of construction effort
  costFunds: number;
  costMaterials: number;
  dropOff: boolean; // accepts harvested materials
  providesLabor: number; // adds to labor cap when complete
  providesStorage: number; // adds to materials storage cap when complete
  trains: UnitKind[]; // unit kinds this building can produce
  tier: number; // license tier required to build
  permitsPerSec: number; // permits generated while complete
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  // The HQ is the central megaproject (built phase-by-phase), not an operations
  // building — it has no drop-off/training; the Field Office covers those.
  hq: { radius: 3.6, buildTime: 0, costFunds: 0, costMaterials: 0, dropOff: false, providesLabor: 0, providesStorage: 0, trains: [], tier: 0, permitsPerSec: 0 },
  // Ops base: drop-off, trains workers, base labor + base storage.
  fieldOffice: { radius: 2.2, buildTime: 0, costFunds: 0, costMaterials: 0, dropOff: true, providesLabor: 16, providesStorage: 100, trains: ["worker"], tier: 0, permitsPerSec: 0 },
  // Housing: raises the labor cap so you can field more units.
  trailer: { radius: 1.7, buildTime: 8, costFunds: 0, costMaterials: 60, dropOff: false, providesLabor: 10, providesStorage: 0, trains: [], tier: 0, permitsPerSec: 0 },
  // Storage yard: big materials cap + a forward drop-off near the deposits.
  depot: { radius: 1.9, buildTime: 8, costFunds: 0, costMaterials: 70, dropOff: true, providesLabor: 0, providesStorage: 220, trains: [], tier: 0, permitsPerSec: 0 },
  // Generates permits for the tech tree.
  permitOffice: { radius: 2.0, buildTime: 10, costFunds: 100, costMaterials: 80, dropOff: false, providesLabor: 0, providesStorage: 0, trains: [], tier: 0, permitsPerSec: 0.7 },
  // Trains excavators (material specialists).
  workshop: { radius: 2.2, buildTime: 12, costFunds: 120, costMaterials: 120, dropOff: false, providesLabor: 0, providesStorage: 0, trains: ["excavator"], tier: 1, permitsPerSec: 0 },
  // Batches concrete: trains concrete trucks (required to pour the tall HQ phases).
  cementFactory: { radius: 2.4, buildTime: 16, costFunds: 220, costMaterials: 180, dropOff: false, providesLabor: 0, providesStorage: 0, trains: ["concreteTruck"], tier: 2, permitsPerSec: 0 },
};

/**
 * The HQ megaproject's construction phases. Each consumes materials + worker
 * effort, pays a Funds progress-payment on completion, and the tall structural
 * phases require a Concrete Truck on-site to pour.
 */
export const PHASES: PhaseDef[] = [
  { name: "Site Prep", materials: 20, effort: 6, fundsReward: 40 },
  { name: "Excavation", materials: 30, effort: 8, fundsReward: 60 },
  { name: "Piling", materials: 45, effort: 10, fundsReward: 90 },
  { name: "Foundation", materials: 60, effort: 12, fundsReward: 130 },
  { name: "Substructure", materials: 75, effort: 14, fundsReward: 160 },
  { name: "Superstructure", materials: 95, effort: 18, fundsReward: 220, requiresConcrete: true },
  { name: "Floor Slabs", materials: 110, effort: 20, fundsReward: 240, requiresConcrete: true },
  { name: "Façade & Cladding", materials: 120, effort: 20, fundsReward: 260, requiresConcrete: true },
  { name: "Roofing", materials: 90, effort: 16, fundsReward: 220, requiresConcrete: true },
  { name: "MEP & Services", materials: 80, effort: 18, fundsReward: 200 },
  { name: "Interior Fit-out", materials: 70, effort: 16, fundsReward: 200 },
  { name: "Inspection & Handover", materials: 40, effort: 12, fundsReward: 300 },
];

export interface UnitDef {
  costFunds: number;
  trainTime: number; // seconds to produce
  labor: number; // labor cap consumed
  tier: number; // license tier required to train
  speed: number;
  radius: number;
  carry: number; // materials per haul (0 = no gathering)
  gatherTime: number;
  buildPower: number; // support-building construction multiplier
  megaEffort: number; // HQ megaproject effort multiplier
  canGather: boolean;
}

export const UNITS: Record<UnitKind, UnitDef> = {
  // Cheap, fast, flexible baseline.
  worker: { costFunds: 50, trainTime: 4, labor: 1, tier: 0, speed: 4, radius: 0.5, carry: 8, gatherTime: 1.6, buildPower: 1, megaEffort: 1, canGather: true },
  // Material specialist: big hauls + fast mining, decent builder.
  excavator: { costFunds: 120, trainTime: 7, labor: 2, tier: 1, speed: 2.6, radius: 0.8, carry: 24, gatherTime: 1.0, buildPower: 1.4, megaEffort: 1.4, canGather: true },
  // Concrete specialist: pours huge structural effort, REQUIRED for the tall HQ
  // phases. Delivers ready-mix (doesn't fetch raw materials).
  concreteTruck: { costFunds: 200, trainTime: 9, labor: 3, tier: 2, speed: 1.6, radius: 1.0, carry: 0, gatherTime: 0, buildPower: 2.5, megaEffort: 3, canGather: false },
};

/** License tiers. Index 0 is the starting tier; cost is to REACH that tier. */
export interface LicenseTier {
  name: string;
  upgradeFunds: number;
  upgradePermits: number;
}

export const LICENSE_TIERS: LicenseTier[] = [
  { name: "Residential", upgradeFunds: 0, upgradePermits: 0 },
  { name: "Commercial", upgradeFunds: 200, upgradePermits: 12 },
  { name: "Industrial", upgradeFunds: 400, upgradePermits: 28 },
  { name: "Skyscraper", upgradeFunds: 800, upgradePermits: 55 },
];

/** Base permit trickle so progress is possible even without a Permit Office. */
const BASE_PERMIT_RATE = 0.15;

/** Each deposit slowly restocks toward its max so the site never runs dry —
 *  gathering may get slower, but it can never permanently dead-end. */
const DEPOSIT_REGEN = 1.0; // materials/sec per deposit

/** A "month" between progress payments — a slow retainer that keeps Funds
 *  growing even when a phase is blocked, so the player never hard-locks. The
 *  payment grows as the HQ advances (a bigger draw on a bigger project). */
const GAME_MONTH = 50; // seconds per payment
const MONTHLY_BASE = 40; // funds paid at phase 0
const MONTHLY_PER_PHASE = 6; // extra funds per completed HQ phase

/** Site generators (rendered by the engine at these spots) — solid colliders so
 *  crews walk around them instead of through them. */
const GENERATORS: Collider[] = [
  { x: -19, z: 19, radius: 1.2 },
  { x: 22, z: 8, radius: 1.2 },
];

/** Global effect modifiers, altered by active hazards. */
interface Mods {
  speed: number; // worker movement multiplier
  gatherYield: number; // materials-per-deposit multiplier
  buildAllowed: boolean; // construction progresses
  produceAllowed: boolean; // unit production progresses
  harvestAllowed: boolean; // gathering runs
}

function defaultMods(): Mods {
  return { speed: 1, gatherYield: 1, buildAllowed: true, produceAllowed: true, harvestAllowed: true };
}

export type HazardKind = "rain" | "osha" | "shortage" | "strike";

export interface HazardDef {
  kind: HazardKind;
  name: string;
  desc: string;
  duration: number; // seconds
  mods: Partial<Mods>;
}

export const HAZARDS: HazardDef[] = [
  { kind: "rain", name: "Rainstorm", desc: "Crews slowed, construction halted", duration: 18, mods: { speed: 0.55, buildAllowed: false } },
  { kind: "osha", name: "OSHA Inspection", desc: "Unit production halted", duration: 14, mods: { produceAllowed: false } },
  { kind: "shortage", name: "Material Shortage", desc: "Deposits yield halved", duration: 20, mods: { gatherYield: 0.5 } },
  { kind: "strike", name: "Labor Strike", desc: "Workers stop gathering", duration: 16, mods: { harvestAllowed: false } },
];

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


/**
 * Owns the ECS world, the navigation grid, the player economy, and advances the
 * sim one fixed tick at a time. Rendering reads state via the snapshot methods.
 */
export class GameSim {
  readonly world = new World();
  readonly grid = NavGrid.centered(MAP_HALF, 2);
  readonly obstacles: Obstacle[] = [];
  readonly economy: Economy = {
    funds: 500,
    materials: 0,
    materialsCap: 0,
    laborUsed: 0,
    laborCap: 0,
    permits: 0,
    tier: 0,
  };
  tick = 0;
  /** Set true when the megaproject (HQ) is fully built. */
  won = false;

  // Hazard state.
  private mods: Mods = defaultMods();
  private activeHazard: { def: HazardDef; timeLeft: number } | null = null;
  private readonly rng = mulberry32(0x9e3779b9);
  private nextHazardIn = 45 + this.rng() * 30; // first event ~45–75s in

  // Finance: a slow monthly progress payment so Funds never dead-end.
  private monthTimer = GAME_MONTH;
  /** Amount of the most recent monthly payment (for the HUD toast). */
  lastPayment = 0;
  /** Count of payments made — the HUD watches this to fire a notification. */
  paymentsCount = 0;

  constructor() {
    this.spawnObstacles();
    this.spawnBuilding("fieldOffice", -14, 17, true); // operations base
    this.spawnMegaproject(0, 16); // the HQ — the win objective
    this.spawnDeposits();
  }

  /** Place the central HQ megaproject at phase 0. */
  spawnMegaproject(x: number, z: number): Entity {
    const def = BUILDINGS.hq;
    const e = this.world.create();
    this.world.add<Transform>(e, C.Transform, { x, z, rot: 0 });
    this.world.add<Owner>(e, C.Owner, { player: 0 });
    this.world.add<Building>(e, C.Building, { kind: "hq", radius: def.radius });
    this.world.add<Selectable>(e, C.Selectable, { selected: false });
    this.world.add<MegaProject>(e, C.MegaProject, {
      phaseIndex: 0,
      phaseMaterials: 0,
      phaseEffort: 0,
      complete: false,
    });
    this.grid.blockCircle(x, z, def.radius);
    return e;
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
    // Generators block the grid too (so A* routes around them).
    for (const gnr of GENERATORS) this.grid.blockCircle(gnr.x, gnr.z, gnr.radius);
  }

  private spawnDeposits(): void {
    const defs = [
      { x: -22, z: 22, amount: 800 },
      { x: 20, z: 24, amount: 800 },
      { x: -32, z: -8, amount: 700 },
      { x: 32, z: -6, amount: 700 },
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
    if (def.trains.length > 0) {
      this.world.add<Producer>(e, C.Producer, { trains: def.trains, queue: [], progress: 0 });
    }
    if (completed) {
      this.completeBuilding(e);
    } else {
      this.world.add<Construction>(e, C.Construction, { progress: 0, buildTime: def.buildTime });
    }
    this.grid.blockCircle(x, z, def.radius);
    return e;
  }

  /** Finish a building: register drop-off, grant labor + storage cap. */
  completeBuilding(e: Entity): void {
    const b = this.world.get<Building>(e, C.Building)!;
    const def = BUILDINGS[b.kind];
    this.world.remove(e, C.Construction);
    if (def.dropOff) {
      this.world.add(e, C.DropOff, {});
      // A drop-off banks materials on-site in its own visible stockpile.
      this.world.add<Stockpile>(e, C.Stockpile, { amount: 0, capacity: def.providesStorage });
    }
    this.economy.laborCap += def.providesLabor;
  }

  spawnUnit(x: number, z: number, kind: UnitKind = "worker"): Entity {
    const def = UNITS[kind];
    const e = this.world.create();
    this.world.add<Transform>(e, C.Transform, { x, z, rot: 0 });
    this.world.add<Unit>(e, C.Unit, {
      kind,
      speed: def.speed,
      radius: def.radius,
      carry: def.carry,
      gatherTime: def.gatherTime,
      buildPower: def.buildPower,
      megaEffort: def.megaEffort,
      canGather: def.canGather,
    });
    this.world.add<Selectable>(e, C.Selectable, { selected: false });
    this.world.add<Owner>(e, C.Owner, { player: 0 });
    return e;
  }

  /** Order entities to move to a world point, pathing around obstacles. */
  commandMove(entities: Iterable<Entity>, x: number, z: number): void {
    const list = [...entities].filter((e) => this.world.has(e, C.Unit));
    // Spread the group over an even disc (phyllotaxis / sunflower packing) so a
    // large order doesn't crowd a single thin ring around the target — each unit
    // gets its own slot, which keeps the destination from gridlocking.
    const SPACING = 1.4;
    const GOLDEN = 2.399963229728653; // golden angle (radians)
    list.forEach((e, i) => {
      this.world.remove(e, C.Harvester); // a manual move cancels harvesting
      const t = this.world.get<Transform>(e, C.Transform)!;
      const r = list.length > 1 ? SPACING * Math.sqrt(i) : 0;
      const angle = i * GOLDEN;
      const tx = x + Math.cos(angle) * r;
      const tz = z + Math.sin(angle) * r;
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
          vx: 0,
          vz: 0,
        });
      }
    });
  }

  /** Assign gather-capable units to harvest a deposit (concrete trucks can't gather). */
  assignHarvest(entities: Iterable<Entity>, nodeId: Entity): void {
    if (!this.world.isAlive(nodeId)) return;
    for (const e of entities) {
      const u = this.world.get<Unit>(e, C.Unit);
      if (!u || !u.canGather) continue;
      this.world.remove(e, C.Builder);
      this.world.remove(e, C.MegaBuilder);
      this.world.remove(e, C.PathFollow);
      this.world.add<Harvester>(e, C.Harvester, {
        state: "toNode",
        nodeId,
        dropId: 0,
        carrying: 0,
        capacity: u.carry,
        timer: 0,
      });
    }
  }

  /** Units with no current task (idle). */
  idleWorkers(): Entity[] {
    return this.world.query(C.Unit).filter(
      (e) =>
        !this.world.has(e, C.Harvester) &&
        !this.world.has(e, C.Builder) &&
        !this.world.has(e, C.MegaBuilder) &&
        !this.world.has(e, C.PathFollow),
    );
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

  /** Draw `n` materials from the stockpiles — the field office (base) first,
   *  then depots (fullest first). Returns the amount actually taken. */
  private spendMaterials(n: number): number {
    let need = n;
    const piles = this.world
      .query(C.Stockpile, C.Building)
      .map((e) => ({
        sp: this.world.get<Stockpile>(e, C.Stockpile)!,
        base: this.world.get<Building>(e, C.Building)!.kind === "fieldOffice",
      }))
      .sort((a, b) => (a.base !== b.base ? (a.base ? -1 : 1) : b.sp.amount - a.sp.amount));
    for (const { sp } of piles) {
      if (need <= 0) break;
      const take = Math.min(sp.amount, need);
      sp.amount -= take;
      need -= take;
    }
    this.economy.materials = Math.max(0, this.economy.materials - (n - need));
    return n - need;
  }

  /** Whether the current license tier unlocks this building. */
  buildingUnlocked(kind: BuildingKind): boolean {
    return this.economy.tier >= BUILDINGS[kind].tier;
  }

  /** Whether the current license tier unlocks training this unit. */
  unitUnlocked(kind: UnitKind): boolean {
    return this.economy.tier >= UNITS[kind].tier;
  }

  /** Next license tier and its cost, or null if already maxed. */
  nextLicense(): { name: string; funds: number; permits: number } | null {
    const next = this.economy.tier + 1;
    if (next >= LICENSE_TIERS.length) return null;
    const t = LICENSE_TIERS[next];
    return { name: t.name, funds: t.upgradeFunds, permits: t.upgradePermits };
  }

  licenseName(): string {
    return LICENSE_TIERS[this.economy.tier].name;
  }

  /** Spend funds + permits to advance to the next license tier. */
  upgradeLicense(): boolean {
    const next = this.economy.tier + 1;
    if (next >= LICENSE_TIERS.length) return false;
    const t = LICENSE_TIERS[next];
    if (this.economy.funds < t.upgradeFunds || this.economy.permits < t.upgradePermits) {
      return false;
    }
    this.economy.funds -= t.upgradeFunds;
    this.economy.permits -= t.upgradePermits;
    this.economy.tier = next;
    return true;
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
    if (!this.buildingUnlocked(kind) || !this.affordable(kind) || !this.canPlaceAt(kind, x, z)) {
      return 0;
    }
    const def = BUILDINGS[kind];
    this.economy.funds -= def.costFunds;
    this.spendMaterials(def.costMaterials);
    const e = this.spawnBuilding(kind, x, z, false);
    for (const b of builders) {
      if (!this.world.has(b, C.Unit)) continue; // any unit can build
      this.world.remove(b, C.Harvester);
      this.world.remove(b, C.MegaBuilder);
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

  /** Total labor reserved by units already alive plus everything queued. */
  private reservedLabor(): number {
    let total = 0;
    for (const e of this.world.query(C.Unit)) {
      total += UNITS[this.world.get<Unit>(e, C.Unit)!.kind].labor;
    }
    for (const e of this.world.query(C.Producer)) {
      for (const k of this.world.get<Producer>(e, C.Producer)!.queue) total += UNITS[k].labor;
    }
    return total;
  }

  /**
   * Queue a unit for production at a completed building that can train it.
   * Charges funds up front and checks the labor cap. Returns true on success.
   */
  trainUnit(kind: UnitKind): boolean {
    const def = UNITS[kind];
    if (!this.unitUnlocked(kind)) return false;
    if (this.economy.funds < def.costFunds) return false;
    if (this.reservedLabor() + def.labor > this.economy.laborCap) return false;
    for (const e of this.world.query(C.Producer, C.Building)) {
      if (this.world.has(e, C.Construction)) continue; // must be completed
      const p = this.world.get<Producer>(e, C.Producer)!;
      if (!p.trains.includes(kind)) continue;
      this.economy.funds -= def.costFunds;
      p.queue.push(kind);
      return true;
    }
    return false;
  }

  /** Tick the hazard scheduler: run the active hazard or count down to the next. */
  private advanceHazards(dt: number): void {
    if (this.activeHazard) {
      this.activeHazard.timeLeft -= dt;
      if (this.activeHazard.timeLeft <= 0) {
        this.activeHazard = null;
        this.mods = defaultMods();
        this.nextHazardIn = 35 + this.rng() * 40; // 35–75s between events
      }
    } else {
      this.nextHazardIn -= dt;
      if (this.nextHazardIn <= 0) {
        const def = HAZARDS[Math.floor(this.rng() * HAZARDS.length)];
        this.activeHazard = { def, timeLeft: def.duration };
        this.mods = { ...defaultMods(), ...def.mods };
      }
    }
  }

  /** Active hazard for the HUD, or null. */
  hazardStatus(): { kind: HazardKind; name: string; desc: string; timeLeft: number } | null {
    if (!this.activeHazard) return null;
    const d = this.activeHazard.def;
    return { kind: d.kind, name: d.name, desc: d.desc, timeLeft: Math.ceil(this.activeHazard.timeLeft) };
  }

  /** Advance production queues; spawn finished units beside their building. */
  private advanceProduction(dt: number): void {
    if (!this.mods.produceAllowed) return; // e.g. OSHA inspection
    for (const e of this.world.query(C.Producer, C.Transform)) {
      if (this.world.has(e, C.Construction)) continue;
      const p = this.world.get<Producer>(e, C.Producer)!;
      if (p.queue.length === 0) continue;
      const kind = p.queue[0];
      p.progress += dt / UNITS[kind].trainTime;
      if (p.progress >= 1) {
        p.progress = 0;
        p.queue.shift();
        const t = this.world.get<Transform>(e, C.Transform)!;
        const b = this.world.get<Building>(e, C.Building)!;
        // Spawn just south of the building, on the nearest free tile.
        const t0 = this.grid.worldToTileClamped(t.x, t.z - b.radius - 1.2);
        const free = this.grid.nearestFree(t0.tx, t0.ty);
        const spot = free
          ? this.grid.tileToWorld(free.tx, free.ty)
          : { x: t.x, z: t.z - b.radius - 1.2 };
        this.spawnUnit(spot.x, spot.z, kind);
      }
    }
  }

  /** Production status of the first producer that trains `kind` (for the HUD). */
  productionStatus(kind: UnitKind): { queue: number; progress: number } {
    for (const e of this.world.query(C.Producer, C.Building)) {
      if (this.world.has(e, C.Construction)) continue;
      const p = this.world.get<Producer>(e, C.Producer)!;
      if (!p.trains.includes(kind)) continue;
      return { queue: p.queue.length, progress: p.queue.length > 0 ? p.progress : 0 };
    }
    return { queue: 0, progress: 0 };
  }

  /** Assign units to help build an in-progress blueprint. */
  assignBuild(entities: Iterable<Entity>, buildingId: Entity): boolean {
    if (!this.world.isAlive(buildingId) || !this.world.has(buildingId, C.Construction)) {
      return false;
    }
    let any = false;
    for (const e of entities) {
      if (!this.world.has(e, C.Unit)) continue; // any unit can build
      this.world.remove(e, C.Harvester);
      this.world.remove(e, C.MegaBuilder);
      this.world.remove(e, C.PathFollow);
      this.world.add<Builder>(e, C.Builder, { targetId: buildingId });
      any = true;
    }
    return any;
  }

  /** Assign units to work the central megaproject (the HQ). Any unit can help. */
  assignMegaBuild(entities: Iterable<Entity>): boolean {
    let any = false;
    for (const e of entities) {
      if (!this.world.has(e, C.Unit)) continue;
      this.world.remove(e, C.Harvester);
      this.world.remove(e, C.Builder);
      this.world.remove(e, C.PathFollow);
      this.world.add<MegaBuilder>(e, C.MegaBuilder, { carrying: 0, srcId: 0 });
      any = true;
    }
    return any;
  }

  /** The HQ entity (megaproject), or 0. */
  hqEntity(): Entity {
    for (const e of this.world.query(C.MegaProject)) return e;
    return 0;
  }

  /** Megaproject status for the HUD. */
  megaprojectStatus(): {
    phaseIndex: number;
    totalPhases: number;
    phaseName: string;
    materials: number;
    materialsReq: number;
    effort: number;
    effortReq: number;
    overall: number;
    crews: number;
    complete: boolean;
    needsConcrete: boolean; // current phase needs a concrete truck and none is on-site
  } | null {
    const hq = this.hqEntity();
    if (!hq) return null;
    const mp = this.world.get<MegaProject>(hq, C.MegaProject)!;
    const done = mp.complete;
    const phase = done ? PHASES[PHASES.length - 1] : PHASES[mp.phaseIndex];
    const phaseFrac = done
      ? 1
      : Math.min(mp.phaseMaterials / phase.materials, mp.phaseEffort / phase.effort);
    let crews = 0;
    let trucks = 0;
    for (const e of this.world.query(C.MegaBuilder, C.Unit)) {
      crews++;
      if (this.world.get<Unit>(e, C.Unit)!.kind === "concreteTruck") trucks++;
    }
    return {
      phaseIndex: done ? PHASES.length : mp.phaseIndex,
      totalPhases: PHASES.length,
      phaseName: done ? "Complete" : phase.name,
      materials: Math.floor(mp.phaseMaterials),
      materialsReq: phase.materials,
      effort: Math.floor(mp.phaseEffort),
      effortReq: phase.effort,
      overall: (mp.phaseIndex + (done ? 0 : phaseFrac)) / PHASES.length,
      crews,
      complete: done,
      needsConcrete: !done && phase.requiresConcrete === true && trucks === 0,
    };
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
    const list: Collider[] = [...this.obstacles, ...GENERATORS];
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
    this.advanceHazards(TICK_DT);
    const colliders = this.colliders();
    movementSystem(this.world, this.grid, colliders, TICK_DT, this.mods.speed);
    separationSystem(this.world, colliders);
    harvestSystem(this.world, this.grid, TICK_DT, {
      allowed: this.mods.harvestAllowed,
      yieldMul: this.mods.gatherYield,
    });
    constructionSystem(
      this.world,
      this.grid,
      TICK_DT,
      (e) => this.completeBuilding(e),
      this.mods.buildAllowed,
    );
    if (this.mods.buildAllowed) {
      megaprojectSystem(this.world, this.grid, this.economy, PHASES, TICK_DT, () => {
        this.won = true;
      });
    }
    this.advanceProduction(TICK_DT);

    // Permits trickle in from a base rate plus completed Permit Offices.
    let permitRate = BASE_PERMIT_RATE;
    for (const e of this.world.query(C.Building)) {
      if (this.world.has(e, C.Construction)) continue;
      permitRate += BUILDINGS[this.world.get<Building>(e, C.Building)!.kind].permitsPerSec;
    }
    this.economy.permits += permitRate * TICK_DT;

    // Deposits slowly restock so the site can never run permanently dry.
    for (const e of this.world.query(C.ResourceNode)) {
      const n = this.world.get<ResourceNode>(e, C.ResourceNode)!;
      if (n.amount < n.maxAmount) {
        n.amount = Math.min(n.maxAmount, n.amount + DEPOSIT_REGEN * TICK_DT);
      }
    }

    // Monthly progress payment: a slow retainer so Funds keep growing even when
    // a phase is blocked — the player can always work toward the next upgrade /
    // concrete truck and never gets permanently stuck.
    this.monthTimer -= TICK_DT;
    if (this.monthTimer <= 0) {
      this.monthTimer += GAME_MONTH;
      this.lastPayment = MONTHLY_BASE + MONTHLY_PER_PHASE * this.megaPhase();
      this.economy.funds += this.lastPayment;
      this.paymentsCount++;
    }

    // Materials live in per-building stockpiles; the economy total + cap are
    // derived from them (drives the HUD + build-cost affordability).
    let mat = 0;
    let cap = 0;
    for (const e of this.world.query(C.Stockpile)) {
      const sp = this.world.get<Stockpile>(e, C.Stockpile)!;
      mat += sp.amount;
      cap += sp.capacity;
    }
    this.economy.materials = mat;
    this.economy.materialsCap = cap;

    let labor = 0;
    for (const e of this.world.query(C.Unit)) labor += UNITS[this.world.get<Unit>(e, C.Unit)!.kind].labor;
    this.economy.laborUsed = labor;
    this.tick++;
  }

  /** Current HQ phase index (0-based), or 0 if there is no megaproject. */
  private megaPhase(): number {
    for (const e of this.world.query(C.MegaProject)) {
      return this.world.get<MegaProject>(e, C.MegaProject)!.phaseIndex;
    }
    return 0;
  }

  /** Progress-payment status for the HUD: seconds to the next draw, the amount
   *  it will pay, and a monotonic count the HUD uses to toast when one lands. */
  financeStatus(): { nextIn: number; amount: number; count: number } {
    return {
      nextIn: Math.max(0, Math.ceil(this.monthTimer)),
      amount: MONTHLY_BASE + MONTHLY_PER_PHASE * this.megaPhase(),
      count: this.paymentsCount,
    };
  }

  snapshot(): UnitSnapshot[] {
    const out: UnitSnapshot[] = [];
    for (const e of this.world.query(C.Transform, C.Unit)) {
      const t = this.world.get<Transform>(e, C.Transform)!;
      const u = this.world.get<Unit>(e, C.Unit)!;
      const s = this.world.get<Selectable>(e, C.Selectable);
      const h = this.world.get<Harvester>(e, C.Harvester);
      const mb = this.world.get<MegaBuilder>(e, C.MegaBuilder);
      let task: UnitSnapshot["task"] = "idle";
      if (mb) task = "mega";
      else if (this.world.has(e, C.Builder)) task = "build";
      else if (h) task = "gather";
      else if (this.world.has(e, C.PathFollow)) task = "move";
      out.push({
        id: e,
        x: t.x,
        z: t.z,
        rot: t.rot,
        kind: u.kind,
        radius: u.radius,
        selected: s?.selected ?? false,
        moving: this.world.has(e, C.PathFollow),
        carrying: h?.carrying ?? mb?.carrying ?? 0,
        task,
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
      const mp = this.world.get<MegaProject>(e, C.MegaProject);
      const sp = this.world.get<Stockpile>(e, C.Stockpile);
      out.push({
        id: e,
        x: t.x,
        z: t.z,
        rot: t.rot,
        kind: b.kind,
        radius: b.radius,
        progress: c ? c.progress : 1,
        selected: s?.selected ?? false,
        megaPhase: mp ? (mp.complete ? PHASES.length : mp.phaseIndex) : undefined,
        megaTotal: mp ? PHASES.length : undefined,
        megaFrac: mp
          ? mp.complete
            ? 1
            : Math.min(
                mp.phaseMaterials / PHASES[mp.phaseIndex].materials,
                mp.phaseEffort / PHASES[mp.phaseIndex].effort,
              )
          : undefined,
        stock: sp ? sp.amount : undefined,
        stockCap: sp ? sp.capacity : undefined,
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
  task: "idle" | "move" | "gather" | "build" | "mega";
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
  /** For the HQ megaproject: current phase index (0..totalPhases). */
  megaPhase?: number;
  megaTotal?: number;
  /** Progress within the current phase (0..1) — drives floor-by-floor visuals. */
  megaFrac?: number;
  /** For drop-off buildings: materials banked here + capacity (visible stack). */
  stock?: number;
  stockCap?: number;
}

export interface NodeSnapshot {
  id: Entity;
  x: number;
  z: number;
  radius: number;
  amount: number;
  maxAmount: number;
}
