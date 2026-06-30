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

const HEIGHT: Record<string, number> = { hq: 2.6, trailer: 1.1, depot: 2.2, workshop: 2.4 };

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

/** A material deposit mound, scaled by how much remains. */
export function buildDepositMesh(radius: number): THREE.Group {
  const g = new THREE.Group();
  const mound = new THREE.Mesh(
    new THREE.ConeGeometry(radius, radius * 1.1, 7),
    mat(0xb9a06a, 1),
  );
  mound.position.y = radius * 0.55;
  mound.castShadow = true;
  mound.receiveShadow = true;
  g.add(mound);
  // A couple of darker chunks for texture.
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 0.4, 0), mat(0x8d8377, 1));
  rock.position.set(radius * 0.4, radius * 0.3, -radius * 0.3);
  rock.castShadow = true;
  g.add(rock);
  return g;
}
