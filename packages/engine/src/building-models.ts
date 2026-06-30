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
      g.add(box(r * 2.3, 1.0, r * 1.2, WHITE, 0, 0.7, 0));
      g.add(box(r * 2.35, 0.18, r * 1.25, BLUE, 0, 1.25, 0)); // roof trim
      g.add(box(r * 2.32, 0.22, r * 1.22, BLUE, 0, 0.55, 0)); // side stripe
      g.add(box(r * 2.0, 0.25, r * 0.9, DARK, 0, 0.2, 0)); // chassis
      break;
    }
    case "depot": {
      // Open shed: four posts + roof.
      const post = (x: number, z: number) => box(0.22, 2.0, 0.22, STEEL, x, 1.0, z);
      g.add(post(-r * 0.8, -r * 0.8));
      g.add(post(r * 0.8, -r * 0.8));
      g.add(post(-r * 0.8, r * 0.8));
      g.add(post(r * 0.8, r * 0.8));
      g.add(box(r * 2.0, 0.22, r * 2.0, ORANGE, 0, 2.1, 0)); // roof
      g.add(box(r * 1.1, 0.6, r * 1.1, YELLOW, 0, 0.3, 0)); // stacked materials
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
      // Civic tower: tall narrow office with a blue roof + a sign board.
      g.add(box(r * 1.4, 2.8, r * 1.4, WHITE, 0, 1.4, 0));
      g.add(box(r * 1.5, 0.3, r * 1.5, BLUE, 0, 2.9, 0)); // roof
      g.add(box(r * 1.42, 0.5, r * 1.42, BLUE, 0, 0.5, 0)); // base band
      // Sign post + board out front.
      g.add(box(0.12, 1.4, 0.12, DARK, 0, 0.7, r * 1.1));
      g.add(box(0.9, 0.6, 0.1, YELLOW, 0, 1.5, r * 1.15)); // permit board
      break;
    }
    case "craneYard": {
      // Industrial pad with a tall tower-crane structure.
      g.add(box(r * 1.9, 0.4, r * 1.9, STEEL, 0, 0.2, 0)); // concrete pad
      g.add(box(r * 0.7, 0.6, r * 0.7, ORANGE, -r * 0.5, 0.5, -r * 0.5)); // equipment shed
      // Tower crane.
      g.add(box(0.3, 3.4, 0.3, YELLOW, r * 0.4, 1.9, r * 0.4)); // mast
      g.add(box(0.22, 0.2, 3.0, YELLOW, r * 0.4, 3.6, r * 0.4 + 0.9)); // jib
      g.add(box(0.4, 0.4, 0.8, DARK, r * 0.4, 3.6, r * 0.4 - 0.9)); // counterweight
      break;
    }
    default: {
      // workshop: garage box with a roll-up door on +Z.
      g.add(box(r * 1.9, 2.0, r * 1.7, STEEL, 0, 1.0, 0));
      g.add(box(r * 2.0, 0.3, r * 1.8, DARK, 0, 2.1, 0));
      g.add(box(r * 1.1, 1.3, 0.12, ORANGE, 0, 0.75, r * 0.86)); // door
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

/**
 * The HQ megaproject, rendered at its current construction phase (0..12). It
 * grows from a cleared lot through excavation, foundation, a rising clad tower,
 * and finally a topped-out building with a sign.
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
