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

export const C = {
  Transform: "Transform",
  PathFollow: "PathFollow",
  Unit: "Unit",
  Selectable: "Selectable",
} as const;
