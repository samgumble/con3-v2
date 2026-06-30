import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Procedural low-poly building meshes. Each kind has a finished form and a
 * generic "under construction" form (foundation slab + rising structure +
 * scaffolding) selected by `progress` (0..1, 1 = complete).
 */

const WHITE = 0xe6e9ee;
const STEEL = 0x9aa3ab;
const DARK = 0x33373b;
const ORANGE = 0xf2622a;
const BLUE = 0x3f7bd6;
const YELLOW = 0xffd84d;
const CONCRETE = 0xb8b2a6;
const GLASS = 0x77b1dd; // window glazing
const TIMBER = 0xb07a43; // timber stacks / retaining boards
const RUST = 0xa65f38; // oil drums, weathered steel
const TIRE = 0x1c1f22; // tyres / rubber
const CATY = 0xf5b51a; // machine yellow (deeper than safety yellow)

function mat(color: number, rough = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true });
}

function box(
  w: number,
  h: number,
  d: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(
  rt: number,
  rb: number,
  h: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  seg = 10,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const HEIGHT: Record<string, number> = {
  hq: 2.6,
  trailer: 1.1,
  depot: 2.2,
  workshop: 2.4,
  permitOffice: 2.8,
  craneYard: 2.0,
};

function buildFinished(kind: string, r: number): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case "hq": {
      g.add(box(r * 1.8, 2.4, r * 1.6, WHITE, 0, 1.2, 0));
      g.add(box(r * 1.9, 0.25, r * 1.7, DARK, 0, 2.45, 0)); // roof
      g.add(box(r * 1.82, 0.35, r * 1.62, ORANGE, 0, 0.7, 0)); // hi-vis band
      g.add(box(0.5, 0.7, 0.5, YELLOW, 0, 2.9, 0)); // rooftop marker
      const door = box(0.7, 1.1, 0.1, DARK, 0, 0.55, r * 0.81);
      g.add(door);
      break;
    }
    case "trailer": {
      // Stacked modular site-accommodation cabins (worker housing).
      const cabin = (cy: number, w: number, d: number, body: number) => {
        g.add(box(w, 0.95, d, body, 0, cy, 0));
        g.add(box(w + 0.05, 0.16, d + 0.05, BLUE, 0, cy - 0.32, 0)); // skirt stripe
        g.add(box(w + 0.06, 0.12, d + 0.06, BLUE, 0, cy + 0.5, 0)); // eave trim
        for (let i = -1; i <= 1; i++) {
          g.add(box(0.46, 0.42, 0.06, GLASS, i * w * 0.27, cy + 0.05, d / 2)); // windows
        }
      };
      g.add(box(r * 2.0, 0.22, r * 1.05, DARK, 0, 0.13, 0)); // chassis skids
      cabin(0.72, r * 2.3, r * 1.25, WHITE); // lower unit
      cabin(1.7, r * 2.1, r * 1.15, 0xf0f2f5); // upper unit (inset, lighter)
      g.add(box(r * 2.15, 0.12, r * 1.2, DARK, 0, 2.22, 0)); // roof cap
      g.add(box(0.5, 0.34, 0.6, STEEL, r * 0.6, 2.45, -r * 0.2)); // rooftop AC unit
      // External staircase up to the upper unit (−X end).
      for (let s = 0; s < 4; s++) {
        g.add(box(0.5, 0.12, 0.42, DARK, -r * 1.2, 0.42 + s * 0.3, -r * 0.4 + s * 0.22));
      }
      g.add(box(0.05, 0.9, 1.3, YELLOW, -r * 1.0, 1.7, 0)); // handrail
      g.add(box(0.7, 0.85, 0.1, DARK, r * 0.45, 1.07, r * 0.61)); // door
      break;
    }
    case "depot": {
      // Open steel canopy sheltering stacked site materials (storage yard).
      const post = (x: number, z: number) => box(0.2, 2.1, 0.2, STEEL, x, 1.05, z);
      for (const sx of [-r * 0.85, r * 0.85]) for (const sz of [-r * 0.85, r * 0.85]) g.add(post(sx, sz));
      g.add(box(r * 2.15, 0.18, r * 2.15, ORANGE, 0, 2.2, 0)); // canopy roof
      g.add(box(r * 2.2, 0.1, 0.18, YELLOW, 0, 2.33, 0)); // ridge cap
      g.add(box(r * 1.7, 0.1, 0.1, STEEL, 0, 1.85, -r * 0.85)); // cross-brace
      // Timber retaining bay (two low walls).
      g.add(box(r * 1.9, 0.5, 0.14, TIMBER, 0, 0.25, -r * 0.78));
      g.add(box(0.14, 0.5, r * 1.7, TIMBER, -r * 0.78, 0.25, 0));
      // Timber stack.
      for (let i = 0; i < 3; i++) g.add(box(0.8, 0.18, r * 1.2, TIMBER, -r * 0.4, 0.35 + i * 0.2, r * 0.1));
      // Pallet of blocks/sacks.
      g.add(box(0.72, 0.12, 0.72, TIMBER, r * 0.55, 0.18, -r * 0.25));
      g.add(box(0.6, 0.42, 0.6, CONCRETE, r * 0.55, 0.45, -r * 0.25));
      // Pipe bundle (run front-to-back under the canopy).
      for (const [pz, py] of [[-0.18, 0], [0.18, 0], [0, 0.3]] as const) {
        const p = cyl(0.15, 0.15, r * 1.5, STEEL, r * 0.5, 0.32 + py, r * 0.45 + pz, 8);
        p.rotation.x = Math.PI / 2;
        g.add(p);
      }
      break;
    }
    case "fieldOffice": {
      // Wide site trailer with blue trim, a porch, and a sign board.
      g.add(box(r * 2.1, 1.0, r * 1.2, WHITE, 0, 0.65, 0));
      g.add(box(r * 2.15, 0.16, r * 1.25, BLUE, 0, 1.2, 0)); // roof trim
      g.add(box(r * 2.12, 0.22, r * 1.22, BLUE, 0, 0.5, 0)); // side stripe
      g.add(box(r * 1.9, 0.25, r * 1.0, DARK, 0, 0.2, 0)); // chassis
      g.add(box(0.7, 0.9, 0.12, DARK, r * 0.5, 0.6, r * 0.61)); // door
      g.add(box(0.12, 1.3, 0.12, DARK, -r * 0.9, 0.65, r * 0.8)); // sign post
      g.add(box(1.1, 0.55, 0.08, YELLOW, -r * 0.9, 1.25, r * 0.85)); // sign board
      break;
    }
    case "permitOffice": {
      // Civic permit office: columned portico, blue roof, flag, sign board.
      g.add(box(r * 1.5, 2.4, r * 1.3, WHITE, 0, 1.4, 0)); // main block
      g.add(box(r * 1.62, 0.28, r * 1.42, BLUE, 0, 2.74, 0)); // roof
      g.add(box(r * 1.52, 0.4, r * 1.32, CONCRETE, 0, 0.4, 0)); // plinth
      // Window grid (2 rows × 3) on the facade.
      for (let row = 0; row < 2; row++) for (let col = -1; col <= 1; col++) {
        g.add(box(0.4, 0.5, 0.06, GLASS, col * r * 0.4, 1.35 + row * 0.7, r * 0.66));
      }
      // Portico: four columns + entablature out front (+Z).
      const colZ = r * 0.95;
      for (const cx of [-r * 0.6, -r * 0.2, r * 0.2, r * 0.6]) g.add(cyl(0.13, 0.15, 1.9, WHITE, cx, 0.95, colZ, 10));
      g.add(box(r * 1.5, 0.28, 0.3, WHITE, 0, 2.05, colZ)); // architrave
      g.add(box(r * 1.5, 0.34, 0.34, BLUE, 0, 2.34, colZ)); // pediment band
      // Entrance steps.
      for (let s = 0; s < 3; s++) g.add(box(r * 1.1 - s * 0.3, 0.14, 0.4, CONCRETE, 0, 0.14 + s * 0.14, colZ + 0.5 - s * 0.12));
      g.add(box(0.7, 1.1, 0.1, DARK, 0, 0.75, r * 0.66)); // door
      // Flag pole + flag.
      g.add(cyl(0.05, 0.05, 2.6, STEEL, -r * 0.9, 1.5, -r * 0.3, 6));
      g.add(box(0.5, 0.32, 0.05, BLUE, -r * 0.9 + 0.27, 2.6, -r * 0.3));
      // "PERMITS" sign board.
      g.add(box(0.12, 1.2, 0.12, DARK, r * 0.9, 0.6, r * 1.2));
      g.add(box(1.0, 0.55, 0.1, YELLOW, r * 0.9, 1.35, r * 1.25));
      break;
    }
    case "craneYard": {
      // Heavy-equipment yard that assembles tower cranes.
      g.add(box(r * 1.95, 0.4, r * 1.95, STEEL, 0, 0.2, 0)); // concrete pad
      g.add(box(r * 1.95, 0.06, 0.3, YELLOW, 0, 0.43, r * 0.85)); // hazard-stripe edge
      // Compact lattice tower crane on the pad.
      const bx = r * 0.35;
      const bz = -r * 0.25;
      g.add(box(1.0, 0.4, 1.0, STEEL, bx, 0.45, bz)); // ballast
      const mh = 5.0;
      const segs = 5;
      for (let i = 0; i < segs; i++) g.add(box(0.34, mh / segs - 0.1, 0.34, YELLOW, bx, 0.65 + (i + 0.5) * (mh / segs), bz));
      const ty = 0.65 + mh;
      g.add(box(0.62, 0.55, 0.62, YELLOW, bx, ty, bz)); // slewing unit
      g.add(box(0.5, 0.45, 0.55, DARK, bx + 0.1, ty + 0.45, bz + 0.4)); // operator cab
      g.add(box(4.6, 0.18, 0.28, YELLOW, bx + 1.9, ty + 0.45, bz)); // working jib
      g.add(box(1.6, 0.18, 0.28, YELLOW, bx - 0.9, ty + 0.45, bz)); // counter-jib
      g.add(box(0.6, 0.7, 0.6, DARK, bx - 1.65, ty + 0.3, bz)); // counterweight
      g.add(box(0.04, 1.8, 0.04, DARK, bx + 3.4, ty - 0.45, bz)); // hook line
      g.add(box(0.26, 0.3, 0.26, DARK, bx + 3.4, ty - 1.45, bz)); // hook block
      // Spare lattice mast sections stacked on the ground.
      for (let i = 0; i < 3; i++) g.add(box(0.55, 0.5, 1.7, CATY, -r * 0.95, 0.5, -r * 0.55 - i * 0.62));
      // Counterweight blocks.
      for (let i = 0; i < 2; i++) g.add(box(1.0, 0.4, 0.7, DARK, -r * 1.1, 0.6 + i * 0.42, r * 0.75));
      // Shipping container of rigging gear.
      g.add(box(r * 0.95, 0.8, r * 0.6, BLUE, r * 0.75, 0.6, r * 0.95));
      g.add(box(r * 0.97, 0.06, r * 0.62, DARK, r * 0.75, 1.0, r * 0.95));
      break;
    }
    default: {
      // Equipment workshop/garage — services & builds excavators. CAT-yellow theme.
      g.add(box(r * 1.9, 1.9, r * 1.7, STEEL, 0, 0.95, 0)); // shed body
      // Gable roof (two pitched panels) + ridge beam.
      const roofL = box(r * 1.15, 0.14, r * 1.85, DARK, -r * 0.5, 2.12, 0);
      roofL.rotation.z = 0.42;
      g.add(roofL);
      const roofR = box(r * 1.15, 0.14, r * 1.85, DARK, r * 0.5, 2.12, 0);
      roofR.rotation.z = -0.42;
      g.add(roofR);
      g.add(box(0.16, 0.16, r * 1.9, YELLOW, 0, 2.52, 0)); // ridge beam
      g.add(box(r * 1.94, 0.22, r * 1.74, YELLOW, 0, 1.75, 0)); // hi-vis hazard band
      // Two roll-up bay doors on +Z, with slat lines.
      for (const dx of [-r * 0.5, r * 0.5]) {
        g.add(box(r * 0.72, 1.3, 0.1, CATY, dx, 0.75, r * 0.86));
        for (let i = 0; i < 4; i++) g.add(box(r * 0.72, 0.04, 0.12, DARK, dx, 0.35 + i * 0.32, r * 0.87));
      }
      g.add(cyl(0.18, 0.2, 0.7, STEEL, r * 0.6, 2.7, -r * 0.4, 8)); // roof vent/flue
      // Yard clutter: oil drums + a tyre stack beside the shed.
      g.add(cyl(0.3, 0.3, 0.7, RUST, -r * 1.3, 0.35, r * 0.4, 10));
      g.add(cyl(0.3, 0.3, 0.7, BLUE, -r * 1.3, 0.35, -r * 0.15, 10));
      for (let i = 0; i < 3; i++) g.add(cyl(0.42, 0.42, 0.2, TIRE, r * 1.25, 0.12 + i * 0.2, r * 0.5, 12));
    }
  }
  return g;
}

function buildUnderConstruction(kind: string, r: number, progress: number): THREE.Group {
  const g = new THREE.Group();
  const full = HEIGHT[kind] ?? 2;

  // Foundation slab.
  g.add(box(r * 1.9, 0.2, r * 1.9, CONCRETE, 0, 0.1, 0));

  // Rising structure, scaled by progress.
  const h = Math.max(0.1, progress) * full;
  const shell = box(r * 1.5, h, r * 1.5, progress > 0.6 ? WHITE : CONCRETE, 0, 0.2 + h / 2, 0);
  g.add(shell);

  // Scaffolding poles at the corners (full height) + a rail.
  const c = r * 0.95;
  const pole = (x: number, z: number) => box(0.1, full + 0.4, 0.1, YELLOW, x, (full + 0.4) / 2, z);
  for (const sx of [-c, c]) for (const sz of [-c, c]) g.add(pole(sx, sz));
  g.add(box(r * 2.0, 0.08, 0.08, YELLOW, 0, full * 0.7, c));
  g.add(box(r * 2.0, 0.08, 0.08, YELLOW, 0, full * 0.7, -c));
  return g;
}

/** Build the mesh for a building given its construction progress. */
export function buildBuildingMesh(kind: string, radius: number, progress: number): THREE.Group {
  return progress >= 1
    ? buildFinished(kind, radius)
    : buildUnderConstruction(kind, radius, progress);
}

// ---- HQ megaproject: a floor-by-floor high-rise -------------------------

const HQ_FLOORS = 14; // storeys in the finished tower
const HQ_FH = 1.25; // floor-to-floor height
const HQ_BASE_Y = 0.95; // first-floor level (top of the podium)
const GLASS_LIT = 0x9cc4ec; // brighter glazing once a floor is fitted out
const REBAR = 0xb5763a;
const MULLION = 0x70757d;
const SPANDREL = 0x363b42;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function ramp(x: number, a: number, b: number): number {
  return clamp01((x - a) / (b - a));
}

export interface MegaState {
  structFloors: number; // storeys of steel frame erected
  slabFloors: number; // storeys with poured decks
  glazedFloors: number; // storeys clad in curtain wall
  litFloors: number; // storeys fitted out (lights on)
  coreFloors: number; // core height in storeys
  roof: boolean;
  parapet: boolean;
  crown: boolean; // rooftop plant / antennae
  spire: boolean;
  complete: boolean;
  structActive: boolean; // a storey is mid-erection (rebar + formwork)
  glazeActive: boolean; // a storey is mid-glazing (cradle + partial glass)
}

/**
 * Map (phase, sub-phase fraction) → the tower's discrete construction state so
 * the frame, decks and glazing each rise one storey at a time. Structure leads,
 * decks follow a few floors behind, and glass is installed last (never ahead of
 * the frame that carries it).
 */
export function megaBuildState(phase: number, frac: number): MegaState {
  const complete = phase >= 12;
  const cp = complete ? 12 : phase + clamp01(frac);
  const structProg = complete ? 1 : ramp(cp, 5.0, 6.3);
  const slabProg = complete ? 1 : ramp(cp, 5.35, 6.7);
  const coreProg = complete ? 1 : ramp(cp, 4.85, 6.1);
  const glazeProg = complete ? 1 : ramp(cp, 7.0, 8.25);
  const litProg = complete ? 1 : ramp(cp, 10.0, 11.2);
  const structFloors = Math.round(HQ_FLOORS * structProg);
  const glazedFloors = Math.round(HQ_FLOORS * glazeProg);
  return {
    structFloors,
    slabFloors: Math.round(HQ_FLOORS * slabProg),
    glazedFloors,
    litFloors: Math.round(HQ_FLOORS * litProg),
    coreFloors: Math.round((HQ_FLOORS + 1) * coreProg),
    roof: complete || cp >= 8.0,
    parapet: complete || cp >= 8.3,
    crown: complete || cp >= 9.0,
    spire: complete || cp >= 11.4,
    complete,
    structActive: !complete && structProg > 0 && structFloors < HQ_FLOORS,
    glazeActive: !complete && glazeProg > 0 && glazedFloors < HQ_FLOORS,
  };
}

/** Discrete render key — the HQ mesh only rebuilds when this changes (per storey). */
export function megaStageKey(phase: number, frac: number): string {
  if (phase < 5) return `g${phase}.${Math.floor(clamp01(frac) * 3)}`;
  const s = megaBuildState(phase, frac);
  return (
    `s${s.structFloors}.${s.slabFloors}.${s.glazedFloors}.${s.litFloors}.${s.coreFloors}` +
    `.${s.roof ? 1 : 0}${s.parapet ? 1 : 0}${s.crown ? 1 : 0}${s.spire ? 1 : 0}` +
    `.${s.structActive ? 1 : 0}${s.glazeActive ? 1 : 0}`
  );
}

/** Four perimeter ring beams at height y. */
function ringBeams(g: THREE.Group, fw: number, y: number): void {
  const len = fw * 2 + 0.2;
  g.add(box(len, 0.16, 0.16, DARK, 0, y, fw));
  g.add(box(len, 0.16, 0.16, DARK, 0, y, -fw));
  g.add(box(0.16, 0.16, len, DARK, fw, y, 0));
  g.add(box(0.16, 0.16, len, DARK, -fw, y, 0));
}

/** A full curtain-wall storey: spandrel band + vision glass + mullions, 4 faces. */
function curtainWall(g: THREE.Group, f: number, gw: number, fh: number, baseY: number, lit: boolean): void {
  const y = baseY + f * fh;
  const cy = y + fh / 2;
  const glass = lit ? GLASS_LIT : GLASS;
  const span = gw * 2 * 0.98;
  const spH = fh * 0.26;
  const visH = fh * 0.64;
  const visCy = y + spH + visH / 2;
  const faces: { px: number; pz: number; h: boolean }[] = [
    { px: 0, pz: gw, h: true },
    { px: 0, pz: -gw, h: true },
    { px: gw, pz: 0, h: false },
    { px: -gw, pz: 0, h: false },
  ];
  for (const fc of faces) {
    if (fc.h) {
      g.add(box(span, spH, 0.07, SPANDREL, fc.px, y + spH / 2 + 0.02, fc.pz));
      g.add(box(span * 0.99, visH, 0.05, glass, fc.px, visCy, fc.pz));
      for (const m of [-0.5, 0.5]) g.add(box(0.05, fh * 0.92, 0.08, MULLION, m * span * 0.5, cy, fc.pz));
    } else {
      g.add(box(0.07, spH, span, SPANDREL, fc.px, y + spH / 2 + 0.02, fc.pz));
      g.add(box(0.05, visH, span * 0.99, glass, fc.px, visCy, fc.pz));
      for (const m of [-0.5, 0.5]) g.add(box(0.08, fh * 0.92, 0.05, MULLION, fc.px, cy, m * span * 0.5));
    }
  }
}

/** The storey under glazing: glass on two faces + a mast-climbing cradle. */
function curtainWallPartial(g: THREE.Group, f: number, gw: number, fh: number, baseY: number): void {
  const y = baseY + f * fh;
  const visCy = y + fh * 0.55;
  g.add(box(gw * 2 * 0.98, fh * 0.6, 0.05, GLASS, 0, visCy, gw)); // +Z glazed
  g.add(box(0.05, fh * 0.6, gw * 1.2, GLASS, gw, visCy, gw * 0.4)); // part of +X
  g.add(box(gw * 0.9, 0.12, 0.5, CATY, 0, y + 0.1, -gw - 0.2)); // cradle platform
  g.add(box(0.06, fh, 0.06, STEEL, -gw * 0.4, y + fh / 2, -gw - 0.2));
  g.add(box(0.06, fh, 0.06, STEEL, gw * 0.4, y + fh / 2, -gw - 0.2));
}

function parapetWall(g: THREE.Group, sh: number, topY: number): void {
  const h = 0.5;
  g.add(box(sh * 2, h, 0.12, STEEL, 0, topY + 0.3, sh));
  g.add(box(sh * 2, h, 0.12, STEEL, 0, topY + 0.3, -sh));
  g.add(box(0.12, h, sh * 2, STEEL, sh, topY + 0.3, 0));
  g.add(box(0.12, h, sh * 2, STEEL, -sh, topY + 0.3, 0));
}

function rooftopPlant(g: THREE.Group, sh: number, topY: number): void {
  const y = topY + 0.45;
  g.add(box(1.3, 0.7, 1.0, STEEL, sh * 0.4, y, sh * 0.3)); // air-handling unit
  g.add(box(0.9, 0.6, 0.9, STEEL, -sh * 0.45, y, -sh * 0.2)); // chiller
  g.add(cyl(0.5, 0.5, 0.9, WHITE, -sh * 0.3, y + 0.1, sh * 0.45, 12)); // water tank
  g.add(box(0.7, 0.8, 0.7, 0x4a4f57, sh * 0.5, y + 0.05, -sh * 0.45)); // lift overrun
  g.add(cyl(0.03, 0.03, 1.3, STEEL, sh * 0.15, topY + 1.1, -sh * 0.4, 5)); // antenna
}

/** External rack-and-pinion construction hoist climbing the +X face. */
function constructionHoist(g: THREE.Group, s: MegaState, sh: number, fh: number, baseY: number): void {
  if (s.complete) return;
  const topF = Math.min(HQ_FLOORS, Math.max(s.structFloors, s.glazedFloors) + 1);
  if (topF <= 0) return;
  const h = topF * fh;
  const x = sh + 0.45;
  const z = -sh * 0.4;
  g.add(box(0.5, h, 0.5, YELLOW, x, baseY + h / 2, z)); // hoist mast
  const carF = Math.min(topF, s.glazedFloors + 1);
  g.add(box(0.75, 0.9, 0.75, 0x2b3340, x, baseY + carF * fh - fh / 2, z)); // car
}

/** Translucent perimeter safety screens on the top two working storeys. */
function safetyScreens(g: THREE.Group, s: MegaState, fw: number, fh: number, baseY: number): void {
  if (s.complete || s.structFloors === 0) return;
  const screen = new THREE.MeshStandardMaterial({
    color: 0xc7ccd2,
    transparent: true,
    opacity: 0.26,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const w = fw * 2 + 0.36;
  const planeH = fh * 0.96;
  for (let f = Math.max(0, s.structFloors - 2); f < s.structFloors; f++) {
    const y = baseY + f * fh + fh / 2;
    const add = (x: number, z: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, planeH), screen);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      g.add(m);
    };
    add(0, fw + 0.18, 0);
    add(0, -fw - 0.18, Math.PI);
    add(fw + 0.18, 0, Math.PI / 2);
    add(-fw - 0.18, 0, -Math.PI / 2);
  }
}

/** Tower crane that climbs as the frame rises — mast tops out above the work. */
function buildClimbingCrane(workY: number): THREE.Group {
  const g = new THREE.Group();
  g.name = "towerCrane";
  const mastTop = Math.max(4, workY) + 2.2;
  g.add(box(1.3, 0.5, 1.3, STEEL, 0, 0.25, 0)); // ballast base
  const segs = Math.max(2, Math.round(mastTop / 1.9));
  for (let i = 0; i < segs; i++) {
    g.add(box(0.42, mastTop / segs - 0.14, 0.42, YELLOW, 0, 0.5 + (i + 0.5) * (mastTop / segs), 0));
  }
  const ty = 0.5 + mastTop;
  g.add(box(0.8, 0.7, 0.8, YELLOW, 0, ty + 0.1, 0)); // slewing unit
  g.add(box(0.55, 0.5, 0.62, 0x2b3340, 0.1, ty + 0.55, 0.45)); // operator cab
  g.add(box(9.5, 0.22, 0.34, YELLOW, 4.3, ty + 0.6, 0)); // working jib
  g.add(box(0.2, 1.6, 0.2, YELLOW, 0, ty + 1.45, 0)); // apex post
  g.add(box(3.0, 0.22, 0.34, YELLOW, -1.7, ty + 0.6, 0)); // counter-jib
  g.add(box(1.0, 1.0, 0.9, 0x33373b, -3.0, ty + 0.35, 0)); // counterweight
  g.add(box(0.05, 3.4, 0.05, 0x33373b, 6.6, ty - 1.2, 0)); // hoist line
  g.add(box(0.34, 0.36, 0.34, 0x33373b, 6.6, ty - 3.0, 0)); // hook block
  return g;
}

/**
 * Collapse the hundreds of static boxes/cylinders into one merged mesh per
 * colour (≈10 draw calls instead of ~350) so the detailed tower stays cheap to
 * render and to shadow. The slewing tower crane and the translucent safety
 * screens are re-parented unchanged (they must stay separate / animatable).
 */
function mergeStatic(group: THREE.Group): THREE.Group {
  const out = new THREE.Group();
  const byColor = new Map<number, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  for (const child of [...group.children]) {
    const mesh = child as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial | undefined;
    if (child.name === "towerCrane" || !mesh.isMesh || !material || material.transparent) {
      out.add(child); // re-parent crane + transparent screens as-is
      continue;
    }
    mesh.updateMatrix();
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrix);
    const key = material.color.getHex();
    let bucket = byColor.get(key);
    if (!bucket) byColor.set(key, (bucket = { mat: material, geos: [] }));
    bucket.geos.push(geo);
  }
  for (const { mat, geos } of byColor.values()) {
    const merged = mergeGeometries(geos, false);
    for (const gg of geos) gg.dispose();
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    out.add(m);
  }
  return out;
}

/**
 * The HQ megaproject, rendered storey-by-storey from its phase + sub-phase
 * fraction. Groundworks (phases 0–4) give way to a rising steel frame, decks
 * poured a few floors behind, a curtain wall that climbs one storey at a time,
 * then roof plant, a crown and a spire — with a climbing tower crane, external
 * hoist and safety screens while it's live.
 */
export function buildMegaprojectMesh(phase: number, frac: number, radius: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(radius * 2.05, 0.3, radius * 2.05, CONCRETE, 0, 0.15, 0)); // site pad

  const s = megaBuildState(phase, frac);

  // Groundworks (phases 0–4): excavation, piling, foundation, substructure.
  if (phase < 5) {
    buildGroundworks(g, phase, frac, radius);
    if (phase >= 1) {
      const crane = buildClimbingCrane(3);
      crane.position.set(-(radius + 1.4), 0, radius * 0.1);
      g.add(crane);
    }
    return mergeStatic(g);
  }

  const fw = radius * 0.86; // column-ring half-extent
  const sh = fw + 0.3; // slab half-extent (decks oversail the frame)
  const fh = HQ_FH;
  const baseY = HQ_BASE_Y;

  // Foundation + podium + ground-floor slab.
  g.add(box(sh * 2.2, 0.4, sh * 2.2, CONCRETE, 0, 0.4, 0));
  g.add(box(sh * 2.08, 0.7, sh * 2.08, 0x9a958c, 0, 0.78, 0));
  g.add(box(sh * 2, 0.18, sh * 2, CONCRETE, 0, baseY, 0));

  // Central core, rising ahead of the floors.
  const coreH = s.coreFloors * fh;
  if (coreH > 0) {
    const ch = radius * 0.3;
    g.add(box(ch * 2, coreH, ch * 2, 0xbcb6ab, 0, baseY + coreH / 2, 0));
    for (let f = 1; f <= s.coreFloors; f++) {
      g.add(box(ch * 2 + 0.04, 0.05, ch * 2 + 0.04, 0x8d877c, 0, baseY + f * fh, 0));
    }
  }

  // Column grid: 8 around the perimeter (corners + edge midpoints).
  const cols: [number, number][] = [];
  for (const cx of [-fw, 0, fw]) for (const cz of [-fw, 0, fw]) {
    if (cx !== 0 || cz !== 0) cols.push([cx, cz]);
  }

  // Steel frame + ring beams, storey by storey.
  if (s.structFloors > 0) ringBeams(g, fw, baseY);
  for (let f = 0; f < s.structFloors; f++) {
    const y = baseY + f * fh;
    for (const [cx, cz] of cols) g.add(box(0.2, fh, 0.2, STEEL, cx, y + fh / 2, cz));
    ringBeams(g, fw, y + fh);
  }

  // Poured decks (follow the frame a few storeys behind).
  for (let f = 1; f <= s.slabFloors; f++) {
    g.add(box(sh * 2, 0.14, sh * 2, CONCRETE, 0, baseY + f * fh, 0));
  }

  // The storey under erection: rebar starter bars + a formwork deck.
  if (s.structActive) {
    const y = baseY + s.structFloors * fh;
    for (const [cx, cz] of cols) {
      for (const ox of [-0.05, 0.05]) for (const oz of [-0.05, 0.05]) {
        g.add(box(0.03, fh * 0.55, 0.03, REBAR, cx + ox, y + fh * 0.28, cz + oz));
      }
    }
    g.add(box(sh * 2 * 0.96, 0.08, sh * 2 * 0.96, TIMBER, 0, y + 0.04, 0));
  }

  // Curtain wall, climbing storey-by-storey (always behind the frame).
  for (let f = 0; f < s.glazedFloors; f++) curtainWall(g, f, sh, fh, baseY, f < s.litFloors);
  if (s.glazeActive && s.glazedFloors < s.structFloors) curtainWallPartial(g, s.glazedFloors, sh, fh, baseY);

  // Roof, parapet, plant, spire + sign.
  const topY = baseY + HQ_FLOORS * fh;
  if (s.roof) g.add(box(sh * 2 * 1.04, 0.22, sh * 2 * 1.04, DARK, 0, topY + 0.11, 0));
  if (s.parapet) parapetWall(g, sh * 1.02, topY);
  if (s.crown) rooftopPlant(g, sh, topY);
  if (s.spire) {
    g.add(cyl(0.06, 0.1, 2.6, STEEL, 0, topY + 1.6, 0, 6));
    g.add(box(0.22, 0.22, 0.22, ORANGE, 0, topY + 3.0, 0)); // aircraft beacon
    g.add(box(sh * 1.5, 0.55, 0.1, YELLOW, 0, topY - 0.7, sh * 1.02)); // rooftop sign
  }

  // Live-site logistics: climbing crane, external hoist, safety screens.
  if (!s.complete) {
    const workY = baseY + (s.structActive ? s.structFloors + 1 : s.structFloors) * fh;
    const crane = buildClimbingCrane(workY);
    crane.position.set(-(radius + 1.4), 0, radius * 0.1);
    g.add(crane);
  }
  constructionHoist(g, s, sh, fh, baseY);
  safetyScreens(g, s, fw, fh, baseY);

  return mergeStatic(g);
}

/** Detailed groundworks (phases 0–4) before the tower rises. */
function buildGroundworks(g: THREE.Group, phase: number, frac: number, radius: number): void {
  const W = radius * 1.5;
  if (phase === 0) {
    g.add(box(W * 1.5, 0.04, W * 1.5, 0x6b6256, 0, 0.32, 0)); // setting-out grid
    for (let i = 0; i < 9; i++) {
      const ax = ((i % 3) - 1) * W * 0.55;
      const az = (Math.floor(i / 3) - 1) * W * 0.55;
      g.add(box(0.06, 0.7, 0.06, ORANGE, ax, 0.6, az)); // survey stakes
    }
    return;
  }
  // Excavation pit + timber shoring + spoil heap (phase ≥ 1).
  g.add(box(W * 1.3, 0.5, W * 1.3, 0x2a2622, 0, 0.05, 0));
  for (const [sx, sz, w, d] of [
    [0, W * 0.65, W * 1.32, 0.12],
    [0, -W * 0.65, W * 1.32, 0.12],
    [W * 0.65, 0, 0.12, W * 1.32],
    [-W * 0.65, 0, 0.12, W * 1.32],
  ] as const) {
    g.add(box(w, 0.7, d, TIMBER, sx, 0.35, sz));
  }
  g.add(cyl(0.02, W * 0.4, 0.7, 0x6b5d4f, W * 1.15, 0.35, W * 0.6, 7)); // spoil heap
  if (phase === 1) return;
  // Piling (phase ≥ 2): driven steel pile grid.
  for (let i = 0; i < 16; i++) {
    const ax = ((i % 4) - 1.5) * W * 0.34;
    const az = (Math.floor(i / 4) - 1.5) * W * 0.34;
    g.add(box(0.16, 1.6, 0.16, STEEL, ax, 0.85, az));
  }
  if (phase === 2) {
    g.add(box(0.5, 0.4, 0.8, CATY, W * 0.8, 0.4, -W * 0.3)); // piling rig base
    g.add(box(0.3, 3.6, 0.3, CATY, W * 0.8, 2.1, -W * 0.3)); // rig mast
    return;
  }
  // Foundation (phase 3): slab pour advancing across exposed rebar.
  if (phase === 3) {
    const prog = clamp01(frac);
    g.add(box(W * 1.25, 0.5, W * 1.25, 0x807a70, 0, 0.45, 0)); // blinding
    g.add(box(Math.max(0.1, W * 1.25 * prog), 0.54, W * 1.25, CONCRETE, -W * 0.625 + (W * 1.25 * prog) / 2, 0.47, 0));
    for (let i = -3; i <= 3; i++) {
      g.add(box(W * 1.2, 0.03, 0.03, REBAR, 0, 0.74, i * W * 0.18));
      g.add(box(0.03, 0.03, W * 1.2, REBAR, i * W * 0.18, 0.74, 0));
    }
    return;
  }
  // Substructure (phase 4): foundation + podium + first column starters.
  g.add(box(W * 1.25, 0.5, W * 1.25, CONCRETE, 0, 0.45, 0));
  g.add(box(W * 1.12, 0.95, W * 1.12, 0x9a958c, 0, 0.95, 0));
  const fw = radius * 0.86;
  for (const cx of [-fw, 0, fw]) for (const cz of [-fw, 0, fw]) {
    if (cx !== 0 || cz !== 0) g.add(box(0.24, 0.8, 0.24, STEEL, cx, 1.55, cz));
  }
}

/** A material stockpile (aggregate pile in a timber bay), scaled by remaining. */
export function buildDepositMesh(radius: number): THREE.Group {
  const g = new THREE.Group();

  // Timber retaining boards forming an L-shaped bay.
  const boardMat = mat(0x8a5a2b);
  const bw = radius * 2.1;
  for (let i = 0; i < 2; i++) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.5, 0.14), boardMat);
    back.position.set(0, 0.25 + i * 0.5, -radius * 0.95);
    back.castShadow = true;
    back.receiveShadow = true;
    g.add(back);
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, bw), boardMat);
    side.position.set(-radius * 0.95, 0.25 + i * 0.5, 0);
    side.castShadow = true;
    g.add(side);
  }

  // Aggregate mound (gravel/sand).
  const mound = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.95, radius * 1.05, 7), mat(0xc2a878, 1));
  mound.position.set(radius * 0.1, radius * 0.5, radius * 0.1);
  mound.castShadow = true;
  mound.receiveShadow = true;
  g.add(mound);

  // Darker aggregate chunks for texture.
  for (let i = 0; i < 3; i++) {
    const chunk = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 0.28, 0), mat(0x8d8377, 1));
    const a = (i / 3) * Math.PI * 2;
    chunk.position.set(Math.cos(a) * radius * 0.55, radius * 0.28, Math.sin(a) * radius * 0.55);
    chunk.rotation.set(i, i * 2, i);
    chunk.castShadow = true;
    g.add(chunk);
  }
  return g;
}
