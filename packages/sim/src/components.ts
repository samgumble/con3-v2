/**
 * Component data definitions for the Con3 simulation.
 *
 * Components are plain data. Positions live on the XZ ground plane (Y is up in
 * the renderer). `C` holds the string keys used with the ECS World so we get
 * autocomplete and avoid typos.
 */

/** Position + facing on the ground plane. */
export interface Transform {
  x: number;
  z: number;
  /** Facing angle in radians (atan2 of movement direction). */
  rot: number;
}

/** A sequence of world-space waypoints the unit walks in order. */
export interface PathFollow {
  waypoints: { x: number; z: number }[];
  /** Index of the waypoint currently being walked toward. */
  index: number;
  /** Final destination, kept for replanning if the unit gets pushed off-path. */
  goalX: number;
  goalZ: number;
  /** Ticks elapsed without getting closer to the goal (stuck detection). */
  stuckTicks: number;
  /** Closest distance-to-goal achieved so far. */
  bestDist: number;
  /** How many times the path has been replanned (give up after too many). */
  replans: number;
  /** Smoothed velocity (steering inertia) so heading can't snap each tick. */
  vx: number;
  vz: number;
}

/** Marks a controllable unit, its movement profile, and its work abilities. */
export interface Unit {
  kind: UnitKind;
  /** Ground speed in world units per second. */
  speed: number;
  /** Collision/selection radius in world units. */
  radius: number;
  /** Materials carried per haul trip (0 = cannot gather). */
  carry: number;
  /** Seconds to fill up at a deposit. */
  gatherTime: number;
  /** Effort multiplier when constructing support buildings. */
  buildPower: number;
  /** Effort multiplier when working the HQ megaproject. */
  megaEffort: number;
  /** Whether this unit can gather from deposits. */
  canGather: boolean;
}

/** Selection state for player-controlled entities. */
export interface Selectable {
  selected: boolean;
}

export type UnitKind = "worker" | "excavator" | "crane";

/** Anything circular that units steer around (rocks, buildings, deposits). */
export interface Collider {
  x: number;
  z: number;
  radius: number;
}

/** Static decorative obstacle on the map (a kind of collider). */
export interface Obstacle extends Collider {
  kind: "rocks" | "stockpile";
}

/** Which player owns an entity (0 = human; AI players added later). */
export interface Owner {
  player: number;
}

export type BuildingKind =
  | "hq"
  | "fieldOffice"
  | "trailer"
  | "depot"
  | "permitOffice"
  | "workshop"
  | "craneYard";

/** A placed structure. Footprint radius is used for collision + placement. */
export interface Building {
  kind: BuildingKind;
  radius: number;
}

/** Present while a building is under construction (0..1 progress). */
export interface Construction {
  progress: number;
  /** Total worker-seconds of effort to finish. */
  buildTime: number;
}

/** Marks a (completed) building where harvested materials can be dropped off. */
export interface DropOff {
  empty?: never;
}

/** Materials banked at a drop-off building — they accumulate visibly on site
 *  and must be hauled to the HQ by an assigned crew (not teleported). */
export interface Stockpile {
  amount: number;
  capacity: number;
}

/** A material deposit that workers mine. */
export interface ResourceNode {
  amount: number;
  maxAmount: number;
  radius: number;
}

export type HarvestState = "toNode" | "mining" | "toDrop" | "unloading" | "idle";

/** Drives a worker through the gather → haul → deposit cycle. */
export interface Harvester {
  state: HarvestState;
  nodeId: number; // assigned resource node entity (0 = none)
  dropId: number; // chosen drop-off building entity (0 = none)
  carrying: number;
  capacity: number;
  timer: number; // counts down during mining/unloading
}

/** Assigns a unit to construct a building blueprint. */
export interface Builder {
  targetId: number; // building entity under construction
}

/**
 * The central megaproject (the HQ). Advances through many construction phases;
 * completing the last one wins the game. Each phase consumes delivered
 * materials and accumulated worker effort.
 */
export interface MegaProject {
  phaseIndex: number;
  /** Materials delivered toward the current phase. */
  phaseMaterials: number;
  /** Worker-seconds accumulated on the current phase. */
  phaseEffort: number;
  /** True once the final phase completes. */
  complete: boolean;
}

/** A unit assigned to the HQ: it hauls materials from a stockpile to the site,
 *  then contributes build effort while on-site. */
export interface MegaBuilder {
  /** Materials currently carried toward the HQ (0 = not hauling). */
  carrying: number;
  /** Stockpile building currently being fetched from (0 = none). */
  srcId: number;
}

/** A building that trains units from a queue. */
export interface Producer {
  /** Unit kinds this building can train. */
  trains: UnitKind[];
  /** Queued unit kinds awaiting production. */
  queue: UnitKind[];
  /** Progress on the front queue item, 0..1. */
  progress: number;
}

/** Player resource pools and tech state. */
export interface Economy {
  funds: number;
  materials: number;
  /** Storage cap on materials (raised by the Field Office + Depots). */
  materialsCap: number;
  laborUsed: number;
  laborCap: number;
  /** Tech-gate currency earned over time / from Permit Offices. */
  permits: number;
  /** License tier index: 0 Residential, 1 Commercial, 2 Industrial, 3 Skyscraper. */
  tier: number;
}

export const C = {
  Transform: "Transform",
  PathFollow: "PathFollow",
  Unit: "Unit",
  Selectable: "Selectable",
  Owner: "Owner",
  Building: "Building",
  Construction: "Construction",
  DropOff: "DropOff",
  Stockpile: "Stockpile",
  ResourceNode: "ResourceNode",
  Harvester: "Harvester",
  Builder: "Builder",
  Producer: "Producer",
  MegaProject: "MegaProject",
  MegaBuilder: "MegaBuilder",
} as const;
