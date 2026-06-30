import * as THREE from "three";

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

/** A fixed tower crane that stands beside the HQ during construction. */
function buildTowerCrane(): THREE.Group {
  const g = new THREE.Group();
  g.name = "towerCrane";
  const mastH = 12.5;
  g.add(box(1.3, 0.5, 1.3, STEEL, 0, 0.25, 0)); // ballast base
  // Lattice mast (segments for a built-up look).
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const y = 0.5 + (i + 0.5) * (mastH / segs);
    g.add(box(0.42, mastH / segs - 0.12, 0.42, YELLOW, 0, y, 0));
  }
  const topY = 0.5 + mastH;
  g.add(box(0.78, 0.7, 0.78, YELLOW, 0, topY + 0.1, 0)); // slewing unit
  g.add(box(0.55, 0.5, 0.6, 0x2b3340, 0.1, topY + 0.55, 0.45)); // operator cab
  // Working jib reaching out +X over the building, with an A-frame apex.
  g.add(box(8.2, 0.22, 0.34, YELLOW, 3.6, topY + 0.6, 0));
  g.add(box(0.2, 1.5, 0.2, YELLOW, 0, topY + 1.35, 0)); // apex post
  // Counter-jib + counterweight (−X).
  g.add(box(2.6, 0.22, 0.34, YELLOW, -1.5, topY + 0.6, 0));
  g.add(box(0.9, 1.0, 0.9, 0x33373b, -2.7, topY + 0.35, 0)); // counterweight
  // Trolley hook line + block over the building.
  g.add(box(0.05, 3.2, 0.05, 0x33373b, 6.0, topY - 1.0, 0));
  g.add(box(0.32, 0.34, 0.32, 0x33373b, 6.0, topY - 2.7, 0));
  return g;
}

/**
 * The HQ megaproject, rendered at its current construction phase (0..12). It
 * grows from a cleared lot through excavation, foundation, a rising clad tower,
 * and finally a topped-out building with a sign. A tower crane stands alongside
 * while it's under construction.
 */
export function buildMegaprojectMesh(phase: number, radius: number): THREE.Group {
  const g = new THREE.Group();
  const W = radius * 1.45; // tower footprint
  g.add(box(radius * 1.95, 0.3, radius * 1.95, CONCRETE, 0, 0.15, 0)); // site pad

  // Ground works (phases 0–2): pit + survey stakes / piles.
  if (phase <= 2) {
    if (phase >= 1) g.add(box(W, 0.28, W, 0x2a2622, 0, 0.18, 0)); // excavation pit
    const piles = phase >= 2;
    const n = piles ? 9 : 4;
    const ph = piles ? 1.5 : 0.6;
    const col = piles ? STEEL : YELLOW;
    for (let i = 0; i < n; i++) {
      const ax = ((i % 3) - 1) * W * 0.34;
      const az = (Math.floor(i / 3) - 1) * W * 0.34;
      g.add(box(0.13, ph, 0.13, col, ax, ph / 2 + 0.25, az));
    }
    return g;
  }

  // Foundation slab (phase ≥ 3).
  g.add(box(W * 1.05, 0.4, W * 1.05, CONCRETE, 0, 0.45, 0));
  if (phase === 3) return g;

  // Substructure perimeter walls (phase ≥ 4).
  if (phase >= 4) {
    g.add(box(W, 0.9, 0.2, STEEL, 0, 0.9, W / 2));
    g.add(box(W, 0.9, 0.2, STEEL, 0, 0.9, -W / 2));
    g.add(box(0.2, 0.9, W, STEEL, W / 2, 0.9, 0));
    g.add(box(0.2, 0.9, W, STEEL, -W / 2, 0.9, 0));
  }
  if (phase === 4) return g;

  // Real construction flow: the full structural frame tops out FIRST, then
  // floor slabs, then glass/cladding is installed bottom-to-top — never glass
  // ahead of structure.
  const FLOORS = 7;
  const FH = 1.4;
  const baseY = 0.65;
  const c = W * 0.45;
  const topY = baseY + FLOORS * FH;

  // Superstructure (phase ≥ 5): full-height structural columns top out.
  if (phase >= 5) {
    for (let f = 0; f < FLOORS; f++) {
      const y = baseY + f * FH;
      for (const cx of [-c, c]) for (const cz of [-c, c]) g.add(box(0.2, FH, 0.2, STEEL, cx, y + FH / 2, cz));
    }
  }

  // Floor slabs (phase ≥ 6): decks poured at every level.
  if (phase >= 6) {
    for (let f = 0; f < FLOORS; f++) g.add(box(W, 0.16, W, CONCRETE, 0, baseY + f * FH, 0));
  }

  // Cladding climbs the finished frame: lower half during Façade (7), full by
  // Roofing (8); windows light up brighter at Fit-out (10+).
  const cladColor = phase >= 10 ? 0x9cc4ec : 0x6fa8d8;
  const cladFloors = phase >= 8 ? FLOORS : phase === 7 ? Math.ceil(FLOORS / 2) : 0;
  for (let f = 0; f < cladFloors; f++) {
    const y = baseY + f * FH + FH / 2;
    g.add(box(W * 0.95, FH * 0.9, 0.08, cladColor, 0, y, W / 2));
    g.add(box(W * 0.95, FH * 0.9, 0.08, cladColor, 0, y, -W / 2));
    g.add(box(0.08, FH * 0.9, W * 0.95, cladColor, W / 2, y, 0));
    g.add(box(0.08, FH * 0.9, W * 0.95, cladColor, -W / 2, y, 0));
  }

  if (phase >= 8) g.add(box(W * 1.05, 0.24, W * 1.05, DARK, 0, topY + 0.1, 0)); // roof
  if (phase >= 9) {
    g.add(box(0.8, 0.5, 0.8, STEEL, W * 0.2, topY + 0.45, W * 0.2)); // rooftop MEP
    g.add(box(0.6, 0.4, 0.6, STEEL, -W * 0.25, topY + 0.4, -W * 0.1));
  }
  if (phase >= 12) {
    g.add(box(0.2, 1.5, 0.2, STEEL, 0, topY + 0.95, 0)); // spire
    g.add(box(W * 0.7, 0.55, 0.1, YELLOW, 0, topY - 0.5, W * 0.52)); // rooftop sign
  }

  // Tower crane stands alongside while under construction (gone at handover).
  if (phase >= 1 && phase < 12) {
    const crane = buildTowerCrane();
    crane.position.set(-(radius + 1.1), 0, radius * 0.2);
    g.add(crane);
  }
  return g;
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
