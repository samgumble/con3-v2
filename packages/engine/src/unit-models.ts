import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Procedural low-poly construction equipment. Each unit kind is built from a
 * handful of boxed/cylinder parts, each tinted via a per-vertex color, then
 * merged into ONE geometry so it can be rendered with a single InstancedMesh
 * (one draw call for hundreds of units). Models face +Z (forward).
 *
 * These are good-looking placeholders; dropping in real glTF assets later just
 * means swapping the geometry returned here (see loadUnitGeometries in the
 * asset pipeline once .glb files are added).
 */

const AMBER = 0xffb53b;
const YELLOW = 0xffd84d;
const ORANGE = 0xf2622a;
const DARK = 0x33373b;
const STEEL = 0x6f7984;

/** Tag a geometry's vertices with a flat color so merged parts stay distinct. */
function colored(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

function box(w: number, h: number, d: number, hex: number): THREE.BufferGeometry {
  return colored(new THREE.BoxGeometry(w, h, d), hex);
}

function buildWorker(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const body = colored(new THREE.CylinderGeometry(0.3, 0.42, 0.85, 10), AMBER);
  body.translate(0, 0.45, 0);
  parts.push(body);

  // Hi-vis vest band.
  const vest = box(0.62, 0.22, 0.62, ORANGE);
  vest.translate(0, 0.5, 0);
  parts.push(vest);

  // Hard hat (hemisphere).
  const hat = colored(
    new THREE.SphereGeometry(0.34, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    YELLOW,
  );
  hat.translate(0, 0.88, 0);
  parts.push(hat);

  // Facing marker.
  const face = box(0.14, 0.14, 0.28, DARK);
  face.translate(0, 0.6, 0.4);
  parts.push(face);

  return merge(parts);
}

function buildExcavator(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const trackL = box(0.34, 0.32, 1.5, DARK);
  trackL.translate(-0.55, 0.16, 0);
  parts.push(trackL);
  const trackR = box(0.34, 0.32, 1.5, DARK);
  trackR.translate(0.55, 0.16, 0);
  parts.push(trackR);

  const base = box(0.95, 0.22, 0.95, STEEL);
  base.translate(0, 0.43, -0.05);
  parts.push(base);

  const cab = box(0.8, 0.55, 0.8, ORANGE);
  cab.translate(0, 0.8, -0.18);
  parts.push(cab);

  // Boom + stick reaching forward.
  const boom = box(0.18, 0.18, 1.0, YELLOW);
  boom.rotateX(-0.95);
  boom.translate(0, 0.85, 0.55);
  parts.push(boom);

  const stick = box(0.15, 0.15, 0.72, YELLOW);
  stick.rotateX(0.5);
  stick.translate(0, 0.52, 1.05);
  parts.push(stick);

  const bucket = box(0.3, 0.28, 0.3, DARK);
  bucket.translate(0, 0.28, 1.3);
  parts.push(bucket);

  return merge(parts);
}

function buildCrane(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const base = box(1.1, 0.3, 1.1, STEEL);
  base.translate(0, 0.15, 0);
  parts.push(base);

  const cab = box(0.7, 0.5, 0.7, YELLOW);
  cab.translate(0, 0.55, -0.1);
  parts.push(cab);

  // Lattice mast.
  const mast = box(0.28, 2.3, 0.28, YELLOW);
  mast.translate(0, 1.65, 0);
  parts.push(mast);

  // Jib reaching forward + counter-jib with weight.
  const jib = box(0.18, 0.16, 2.6, YELLOW);
  jib.translate(0, 2.78, 0.95);
  parts.push(jib);

  const counter = box(0.34, 0.34, 0.7, DARK);
  counter.translate(0, 2.78, -0.7);
  parts.push(counter);

  // Hook line.
  const line = box(0.05, 0.7, 0.05, DARK);
  line.translate(0, 2.4, 1.9);
  parts.push(line);

  return merge(parts);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error("Failed to merge unit geometry parts");
  return merged;
}

/** Build the merged geometry for each unit kind, sized to its unit radius. */
export function buildUnitGeometries(): Record<string, THREE.BufferGeometry> {
  return {
    worker: buildWorker(),
    excavator: buildExcavator(),
    crane: buildCrane(),
  };
}
