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

const YELLOW = 0xffd84d;
const DARK = 0x33373b;
const STEEL = 0x6f7984;
const CAT = 0xf2b01e; // construction-equipment yellow
const COVERALL = 0x2f3a52; // worker trousers
const SKIN = 0xd9a066;
const HIVIS = 0xff7a1a; // hi-vis vest

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

  // Trousers / legs.
  const legs = colored(new THREE.CylinderGeometry(0.32, 0.36, 0.45, 9), COVERALL);
  legs.translate(0, 0.23, 0);
  parts.push(legs);

  // Hi-vis torso.
  const torso = colored(new THREE.CylinderGeometry(0.3, 0.33, 0.46, 9), HIVIS);
  torso.translate(0, 0.68, 0);
  parts.push(torso);
  // Reflective band.
  const band = colored(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 9), 0xf2f2f2);
  band.translate(0, 0.66, 0);
  parts.push(band);

  // Head + hard hat.
  const head = colored(new THREE.SphereGeometry(0.2, 9, 7), SKIN);
  head.translate(0, 1.02, 0);
  parts.push(head);
  const hat = colored(
    new THREE.SphereGeometry(0.24, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    YELLOW,
  );
  hat.translate(0, 1.08, 0);
  parts.push(hat);
  const brim = box(0.46, 0.05, 0.2, YELLOW);
  brim.translate(0, 1.06, 0.16);
  parts.push(brim);

  return merge(parts);
}

function buildExcavator(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Crawler tracks.
  for (const sx of [-0.55, 0.55]) {
    const track = box(0.36, 0.34, 1.6, DARK);
    track.translate(sx, 0.17, 0);
    parts.push(track);
  }
  const beltL = box(0.4, 0.1, 1.62, 0x1c1f22);
  beltL.translate(-0.55, 0.34, 0);
  parts.push(beltL);
  const beltR = box(0.4, 0.1, 1.62, 0x1c1f22);
  beltR.translate(0.55, 0.34, 0);
  parts.push(beltR);

  // Slewing house + cab (CAT yellow).
  const base = box(1.0, 0.26, 1.0, CAT);
  base.translate(0, 0.47, -0.05);
  parts.push(base);
  const house = box(0.95, 0.55, 0.85, CAT);
  house.translate(0, 0.85, -0.25);
  parts.push(house);
  const cab = box(0.55, 0.5, 0.55, 0x2b3340);
  cab.translate(0, 0.85, 0.35);
  parts.push(cab);
  const counter = box(0.95, 0.4, 0.3, DARK);
  counter.translate(0, 0.7, -0.7);
  parts.push(counter);

  // Boom → stick → bucket reaching forward.
  const boom = box(0.2, 0.2, 1.05, CAT);
  boom.rotateX(-0.95);
  boom.translate(0, 0.95, 0.6);
  parts.push(boom);
  const stick = box(0.16, 0.16, 0.8, CAT);
  stick.rotateX(0.55);
  stick.translate(0, 0.6, 1.15);
  parts.push(stick);
  const bucket = colored(new THREE.CylinderGeometry(0.28, 0.18, 0.34, 6, 1, false, 0, Math.PI), DARK);
  bucket.rotateZ(Math.PI / 2);
  bucket.translate(0, 0.3, 1.4);
  parts.push(bucket);

  return merge(parts);
}

function buildCrane(): THREE.BufferGeometry {
  // A mobile (truck-mounted) crane.
  const parts: THREE.BufferGeometry[] = [];

  // Carrier chassis + wheels.
  const chassis = box(0.95, 0.32, 2.1, DARK);
  chassis.translate(0, 0.4, 0);
  parts.push(chassis);
  for (const sx of [-0.55, 0.55]) {
    for (const sz of [-0.7, 0, 0.7]) {
      const wheel = colored(new THREE.CylinderGeometry(0.26, 0.26, 0.16, 8), 0x15171a);
      wheel.rotateZ(Math.PI / 2);
      wheel.translate(sx, 0.26, sz);
      parts.push(wheel);
    }
  }
  // Driver cab up front.
  const cab = box(0.85, 0.5, 0.6, CAT);
  cab.translate(0, 0.85, 0.78);
  parts.push(cab);
  const windscreen = box(0.7, 0.32, 0.08, 0x2b3340);
  windscreen.translate(0, 0.92, 1.08);
  parts.push(windscreen);

  // Slewing deck + outriggers.
  const deck = box(1.0, 0.34, 1.1, CAT);
  deck.translate(0, 0.78, -0.35);
  parts.push(deck);
  for (const sx of [-0.62, 0.62]) {
    for (const sz of [-0.75, 0.1] as const) {
      const pad = box(0.18, 0.16, 0.18, STEEL);
      pad.translate(sx, 0.1, sz);
      parts.push(pad);
    }
  }
  // Telescoping boom angled up over the rear.
  const boom = box(0.26, 0.26, 2.5, CAT);
  boom.rotateX(0.7);
  boom.translate(0, 1.55, -0.5);
  parts.push(boom);
  const boom2 = box(0.18, 0.18, 1.4, STEEL);
  boom2.rotateX(0.7);
  boom2.translate(0, 2.35, 0.45);
  parts.push(boom2);
  // Hook block hanging from the boom tip.
  const line = box(0.04, 0.7, 0.04, DARK);
  line.translate(0, 2.5, 1.05);
  parts.push(line);
  const hook = box(0.16, 0.2, 0.16, DARK);
  hook.translate(0, 2.1, 1.05);
  parts.push(hook);

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
