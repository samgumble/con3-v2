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
}

/** Marks a controllable unit and its movement profile. */
export interface Unit {
  kind: UnitKind;
  /** Ground speed in world units per second. */
  speed: number;
  /** Collision/selection radius in world units. */
  radius: number;
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

export type BuildingKind = "hq" | "trailer" | "depot" | "workshop";

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

/** Player resource pools. */
export interface Economy {
  funds: number;
  materials: number;
  laborUsed: number;
  laborCap: number;
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
  ResourceNode: "ResourceNode",
  Harvester: "Harvester",
} as const;
