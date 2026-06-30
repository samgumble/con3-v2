import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Procedural low-poly construction equipment. Each unit kind is built from a
 * handful of boxed/cylinder/sphere parts, each tinted via a per-vertex color,
 * then merged into ONE geometry so it can be rendered with a single
 * InstancedMesh (one draw call for hundreds of units). Models face +Z (forward)
 * and render at 1:1 scale, so keep overall dimensions roughly constant.
 *
 * These are good-looking placeholders; dropping in real glTF assets later just
 * means swapping the geometry returned here.
 */

const YELLOW = 0xffd84d;
const DARK = 0x33373b;
const STEEL = 0x6f7984;
const CAT = 0xf2b01e; // construction-equipment yellow
const CAT_DK = 0xc8901a; // shaded CAT yellow
const COVERALL = 0x2f3a52; // worker trousers
const SKIN = 0xd9a066;
const HIVIS = 0xff7a1a; // hi-vis vest
const HIVIS_DK = 0xe06410; // shaded hi-vis (sleeves)
const REFLECT = 0xf4f4f4; // reflective tape
const GLASS = 0x73b2e0; // cab glazing
const AMBER = 0xffb020; // beacon
const RUBBER = 0x16181b;

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

function cyl(rt: number, rb: number, h: number, hex: number, seg = 8): THREE.BufferGeometry {
  return colored(new THREE.CylinderGeometry(rt, rb, h, seg), hex);
}

function buildWorker(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Boots + two legs.
  for (const sx of [-0.15, 0.15]) {
    const boot = box(0.21, 0.13, 0.34, DARK);
    boot.translate(sx, 0.065, 0.04);
    parts.push(boot);
    const leg = cyl(0.13, 0.15, 0.4, COVERALL, 7);
    leg.translate(sx, 0.33, 0);
    parts.push(leg);
  }

  // Tool belt, then a hi-vis torso that flares to the shoulders.
  const belt = cyl(0.3, 0.3, 0.1, DARK, 10);
  belt.translate(0, 0.55, 0);
  parts.push(belt);
  const torso = cyl(0.33, 0.28, 0.46, HIVIS, 10);
  torso.translate(0, 0.79, 0);
  parts.push(torso);
  const shoulders = cyl(0.34, 0.32, 0.16, HIVIS, 10);
  shoulders.translate(0, 1.0, 0);
  parts.push(shoulders);

  // Reflective tape: a waist band + two vertical braces up the front.
  const band = cyl(0.335, 0.335, 0.07, REFLECT, 10);
  band.translate(0, 0.73, 0);
  parts.push(band);
  for (const sx of [-0.13, 0.13]) {
    const brace = box(0.06, 0.42, 0.04, REFLECT);
    brace.translate(sx, 0.82, 0.3);
    parts.push(brace);
  }

  // Arms (hi-vis sleeves) hanging slightly out, with skin hands.
  for (const sx of [-1, 1]) {
    const arm = box(0.13, 0.38, 0.15, HIVIS_DK);
    arm.rotateZ(sx * 0.14);
    arm.translate(sx * 0.41, 0.79, 0.02);
    parts.push(arm);
    const hand = colored(new THREE.SphereGeometry(0.08, 6, 5), SKIN);
    hand.translate(sx * 0.46, 0.58, 0.03);
    parts.push(hand);
  }

  // Head + hard hat (dome, brim and a centre crest).
  const head = colored(new THREE.SphereGeometry(0.17, 10, 8), SKIN);
  head.translate(0, 1.14, 0);
  parts.push(head);
  const hat = colored(new THREE.SphereGeometry(0.21, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), YELLOW);
  hat.translate(0, 1.17, 0);
  parts.push(hat);
  const brim = box(0.4, 0.05, 0.18, YELLOW);
  brim.translate(0, 1.18, 0.13);
  parts.push(brim);
  const crest = box(0.05, 0.1, 0.34, CAT_DK);
  crest.translate(0, 1.27, 0);
  parts.push(crest);

  return merge(parts);
}

function buildExcavator(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Crawler tracks with belts + a couple of road wheels each side.
  for (const sx of [-0.55, 0.55]) {
    const track = box(0.36, 0.34, 1.6, DARK);
    track.translate(sx, 0.17, 0);
    parts.push(track);
    const belt = box(0.4, 0.1, 1.62, RUBBER);
    belt.translate(sx, 0.34, 0);
    parts.push(belt);
    for (const sz of [-0.5, 0.5]) {
      const wheel = cyl(0.13, 0.13, 0.42, STEEL, 8);
      wheel.rotateZ(Math.PI / 2);
      wheel.translate(sx, 0.14, sz);
      parts.push(wheel);
    }
  }

  // Slewing house, glazed cab + counterweight.
  const base = box(1.0, 0.26, 1.0, CAT);
  base.translate(0, 0.47, -0.05);
  parts.push(base);
  const house = box(0.95, 0.55, 0.85, CAT);
  house.translate(0, 0.85, -0.25);
  parts.push(house);
  const cab = box(0.55, 0.5, 0.55, DARK);
  cab.translate(0, 0.85, 0.35);
  parts.push(cab);
  const glass = box(0.5, 0.34, 0.06, GLASS);
  glass.translate(0, 0.9, 0.63);
  parts.push(glass);
  const counter = box(0.95, 0.42, 0.32, DARK);
  counter.translate(0, 0.68, -0.72);
  parts.push(counter);
  // Exhaust stack + an amber beacon + a side handrail.
  const stack = cyl(0.06, 0.07, 0.28, DARK, 6);
  stack.translate(0.3, 1.2, -0.4);
  parts.push(stack);
  const beacon = box(0.1, 0.1, 0.1, AMBER);
  beacon.translate(-0.2, 1.16, 0.3);
  parts.push(beacon);
  const rail = box(0.04, 0.04, 0.7, STEEL);
  rail.translate(0.49, 1.0, -0.25);
  parts.push(rail);

  // Boom → stick → bucket, with hydraulic rams alongside.
  const boom = box(0.2, 0.2, 1.05, CAT);
  boom.rotateX(-0.95);
  boom.translate(0, 0.95, 0.6);
  parts.push(boom);
  const ram1 = cyl(0.05, 0.05, 0.7, STEEL, 6);
  ram1.rotateX(-0.6);
  ram1.translate(0, 1.0, 0.35);
  parts.push(ram1);
  const stick = box(0.16, 0.16, 0.8, CAT);
  stick.rotateX(0.55);
  stick.translate(0, 0.6, 1.15);
  parts.push(stick);
  const ram2 = cyl(0.04, 0.04, 0.5, STEEL, 6);
  ram2.rotateX(-0.2);
  ram2.translate(0, 0.95, 1.0);
  parts.push(ram2);
  const bucket = colored(new THREE.CylinderGeometry(0.28, 0.18, 0.34, 6, 1, false, 0, Math.PI), DARK);
  bucket.rotateZ(Math.PI / 2);
  bucket.translate(0, 0.3, 1.4);
  parts.push(bucket);
  // Bucket teeth.
  for (const tx of [-0.1, 0, 0.1]) {
    const tooth = box(0.06, 0.05, 0.12, 0xb9b3a6);
    tooth.translate(tx, 0.18, 1.56);
    parts.push(tooth);
  }

  return merge(parts);
}

function buildCrane(): THREE.BufferGeometry {
  // A mobile (truck-mounted) crane.
  const parts: THREE.BufferGeometry[] = [];

  // Carrier chassis + six wheels.
  const chassis = box(0.95, 0.32, 2.1, DARK);
  chassis.translate(0, 0.4, 0);
  parts.push(chassis);
  for (const sx of [-0.55, 0.55]) {
    for (const sz of [-0.7, 0, 0.7]) {
      const wheel = cyl(0.26, 0.26, 0.16, RUBBER, 9);
      wheel.rotateZ(Math.PI / 2);
      wheel.translate(sx, 0.26, sz);
      parts.push(wheel);
      const hub = cyl(0.1, 0.1, 0.18, STEEL, 6);
      hub.rotateZ(Math.PI / 2);
      hub.translate(sx, 0.26, sz);
      parts.push(hub);
    }
  }
  // Glazed driver cab up front.
  const cab = box(0.85, 0.5, 0.6, CAT);
  cab.translate(0, 0.85, 0.78);
  parts.push(cab);
  const windscreen = box(0.74, 0.34, 0.06, GLASS);
  windscreen.translate(0, 0.92, 1.06);
  parts.push(windscreen);
  const beacon = box(0.12, 0.1, 0.12, AMBER);
  beacon.translate(0.28, 1.13, 0.78);
  parts.push(beacon);

  // Slewing deck with a winch drum + counterweight.
  const deck = box(1.0, 0.34, 1.1, CAT);
  deck.translate(0, 0.78, -0.35);
  parts.push(deck);
  const cweight = box(0.92, 0.4, 0.28, DARK);
  cweight.translate(0, 0.74, -0.82);
  parts.push(cweight);
  const drum = cyl(0.16, 0.16, 0.5, STEEL, 8);
  drum.rotateZ(Math.PI / 2);
  drum.translate(0, 1.0, -0.45);
  parts.push(drum);
  // Outriggers: a beam + an angled leg + a foot pad at each corner.
  for (const sx of [-0.62, 0.62]) {
    for (const sz of [-0.7, 0.2] as const) {
      const beam = box(0.16, 0.12, 0.16, STEEL);
      beam.translate(sx * 0.85, 0.6, sz);
      parts.push(beam);
      const leg = box(0.1, 0.4, 0.1, STEEL);
      leg.translate(sx, 0.3, sz);
      parts.push(leg);
      const pad = cyl(0.16, 0.2, 0.1, DARK, 8);
      pad.translate(sx, 0.06, sz);
      parts.push(pad);
    }
  }

  // Telescoping boom (two segments) angled up over the rear, with a hook block.
  const boom = box(0.26, 0.26, 2.4, CAT);
  boom.rotateX(0.7);
  boom.translate(0, 1.5, -0.45);
  parts.push(boom);
  const boom2 = box(0.18, 0.18, 1.6, CAT_DK);
  boom2.rotateX(0.7);
  boom2.translate(0, 2.35, 0.5);
  parts.push(boom2);
  const tip = box(0.2, 0.16, 0.18, STEEL);
  tip.translate(0, 3.05, 1.05);
  parts.push(tip);
  const line = box(0.04, 0.8, 0.04, DARK);
  line.translate(0, 2.62, 1.05);
  parts.push(line);
  const hook = box(0.16, 0.22, 0.16, STEEL);
  hook.translate(0, 2.15, 1.05);
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
