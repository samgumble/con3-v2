import * as THREE from "three";

/**
 * Static, cosmetic construction-site dressing: a perimeter hoarding/chain-link
 * fence with an entrance gate, plus scattered props (cones, barriers, pallets,
 * pipes, a skip, port-a-loos, a site sign). Purely visual — no collision.
 */

const ORANGE = 0xf2622a;
const CONCRETE = 0xbdb6a8;
const STEEL = 0x8a929b;
const DARK = 0x2a2d31;
const WHITE = 0xe6e6e6;
const RUST = 0xa65f38;
const WOOD = 0xb07a43;

function mat(color: number, rough = 0.92): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true });
}

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Orange-and-white traffic cone. */
function cone(): THREE.Group {
  const g = new THREE.Group();
  const base = box(0.5, 0.06, 0.5, DARK);
  base.position.y = 0.03;
  g.add(base);
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 8), mat(ORANGE));
  body.position.y = 0.32;
  body.castShadow = true;
  g.add(body);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.1, 8), mat(WHITE));
  stripe.position.y = 0.32;
  g.add(stripe);
  return g;
}

/** Concrete jersey barrier with a hi-vis stripe. */
function jerseyBarrier(): THREE.Group {
  const g = new THREE.Group();
  const lower = box(1.8, 0.4, 0.5, CONCRETE);
  lower.position.y = 0.2;
  g.add(lower);
  const upper = box(1.8, 0.4, 0.26, CONCRETE);
  upper.position.y = 0.6;
  g.add(upper);
  const stripe = box(1.82, 0.12, 0.28, ORANGE);
  stripe.position.y = 0.5;
  g.add(stripe);
  return g;
}

/** A wooden pallet stacked with material bags/blocks. */
function pallet(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const base = box(1.3, 0.12, 1.0, WOOD);
  base.position.y = 0.06;
  g.add(base);
  const cols = [0xc9a14a, 0x9fa6ad, 0xb5651d, CONCRETE];
  const rows = 1 + Math.floor(rand() * 2);
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < 4; i++) {
      const b = box(0.55, 0.28, 0.42, cols[Math.floor(rand() * cols.length)]);
      b.position.set(((i % 2) - 0.5) * 0.6, 0.12 + 0.28 / 2 + r * 0.28, (Math.floor(i / 2) - 0.5) * 0.46);
      g.add(b);
    }
  }
  return g;
}

/** A neat stack of large pipes. */
function pipeStack(): THREE.Group {
  const g = new THREE.Group();
  const pm = mat(STEEL);
  const make = (x: number, y: number) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 2.2, 10), pm);
    p.rotation.z = Math.PI / 2;
    p.position.set(x, y, 0);
    p.castShadow = true;
    g.add(p);
  };
  make(-0.34, 0.32);
  make(0.34, 0.32);
  make(0, 0.32 + 0.55);
  return g;
}

/** Builder's skip / dumpster. */
function skip(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 1.4), mat(RUST));
  body.position.y = 0.55;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // angled end
  const end = box(0.4, 1.2, 1.4, RUST);
  end.position.set(1.4, 0.7, 0);
  end.rotation.z = 0.3;
  g.add(end);
  const rubble = box(2.2, 0.4, 1.1, 0x6b5d4f);
  rubble.position.y = 1.05;
  g.add(rubble);
  return g;
}

/** A row of portable toilets. */
function portaloos(): THREE.Group {
  const g = new THREE.Group();
  const cols = [0x3f7bd6, 0x4caf6a, 0x3f7bd6];
  for (let i = 0; i < 3; i++) {
    const u = box(0.8, 1.6, 0.8, cols[i]);
    u.position.set(i * 0.9, 0.8, 0);
    g.add(u);
    const roof = box(0.86, 0.1, 0.86, WHITE);
    roof.position.set(i * 0.9, 1.62, 0);
    g.add(roof);
  }
  return g;
}

/** Big site board at the entrance. */
function siteSign(): THREE.Group {
  const g = new THREE.Group();
  const postL = box(0.16, 2.4, 0.16, DARK);
  postL.position.set(-1.3, 1.2, 0);
  g.add(postL);
  const postR = box(0.16, 2.4, 0.16, DARK);
  postR.position.set(1.3, 1.2, 0);
  g.add(postR);
  const board = box(3.0, 1.4, 0.1, WHITE);
  board.position.set(0, 1.9, 0);
  g.add(board);
  const band = box(3.0, 0.35, 0.12, ORANGE);
  band.position.set(0, 2.45, 0);
  g.add(band);
  return g;
}

/** A run of chain-link fence between two points (posts + rails + mesh panel). */
function fenceRun(group: THREE.Group, x1: number, z1: number, x2: number, z2: number): void {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const segments = Math.round(len / 3);
  const postMat = mat(STEEL, 0.7);
  const railMat = mat(STEEL, 0.7);
  const meshMat = new THREE.MeshStandardMaterial({
    color: 0xcfd6dd,
    transparent: true,
    opacity: 0.16,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const angle = Math.atan2(dz, dx);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6), postMat);
    post.position.set(x1 + dx * t, 0.9, z1 + dz * t);
    post.castShadow = true;
    group.add(post);
  }
  // Rails + transparent mesh panel along the run.
  for (const yy of [1.55, 0.25]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), railMat);
    rail.position.set((x1 + x2) / 2, yy, (z1 + z2) / 2);
    rail.rotation.y = -angle;
    group.add(rail);
  }
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.3), meshMat);
  panel.position.set((x1 + x2) / 2, 0.9, (z1 + z2) / 2);
  panel.rotation.y = -angle + Math.PI / 2;
  group.add(panel);
}

/**
 * Build the full set of site dressing for a square site of the given half-size.
 * Fence rings the perimeter with a gate gap on the south (entrance) side.
 */
export function buildSiteDecor(half: number): THREE.Group {
  const g = new THREE.Group();
  const rand = mulberry32(0x51714);
  const f = half - 2; // fence just inside the bounds
  const gate = 5; // half-width of the entrance gap (south side)

  // Perimeter fence (north, east, west solid; south split around the gate).
  fenceRun(g, -f, -f, f, -f); // north
  fenceRun(g, f, -f, f, f); // east
  fenceRun(g, -f, f, -f, -f); // west
  fenceRun(g, -f, f, -gate, f); // south-left
  fenceRun(g, gate, f, f, f); // south-right

  // Entrance sign by the gate.
  const sign = siteSign();
  sign.position.set(gate + 4, 0, f - 0.5);
  sign.rotation.y = Math.PI;
  g.add(sign);

  // Hand-placed prop clusters (a believable, intentional yard).
  const add = (o: THREE.Object3D, x: number, z: number, ry = 0) => {
    o.position.set(x, 0, z);
    o.rotation.y = ry;
    g.add(o);
  };

  add(skip(), -34, 26, 0.4);
  add(portaloos(), -40, 22, Math.PI / 2);
  add(pipeStack(), 30, 30, 0.3);
  add(pipeStack(), 33, 30, 0.3);
  for (let i = 0; i < 5; i++) add(pallet(rand), -42 + i * 1.7, 30, rand() * 0.4);
  add(jerseyBarrier(), -8, 36, 0);
  add(jerseyBarrier(), -6, 36, 0);
  add(jerseyBarrier(), 6, 36, 0);
  add(jerseyBarrier(), 8, 36, 0);

  // Traffic cones lining a route from the gate toward the build site.
  for (let i = 0; i < 8; i++) {
    add(cone(), -3.2, f - 6 - i * 4.5);
    add(cone(), 3.2, f - 6 - i * 4.5);
  }
  // A few scattered cones + pallets for clutter.
  for (let i = 0; i < 6; i++) {
    add(cone(), (rand() - 0.5) * 70, (rand() - 0.5) * 70);
  }
  add(pallet(rand), 26, -28, 0.6);
  add(pallet(rand), 28, -26, 1.2);

  return g;
}
