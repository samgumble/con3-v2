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
const YELLOW = 0xf5b51a;
const BLUE = 0x3f7bd6;
const LAMP = 0xfff1c0;

function mat(color: number, rough = 0.92): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true });
}

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rt: number, rb: number, h: number, color: number, seg = 10): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
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
  const H = 0.62; // cone height
  const R = 0.17; // cone base radius
  const yBase = 0.06; // top of the square base slab

  // Square base slab.
  const base = box(0.42, 0.06, 0.42, DARK);
  base.position.y = 0.03;
  g.add(base);

  // Orange cone body sitting on the base.
  const body = new THREE.Mesh(new THREE.ConeGeometry(R, H, 14), mat(ORANGE));
  body.position.y = yBase + H / 2;
  body.castShadow = true;
  g.add(body);

  // White reflective band — a short frustum that hugs the cone's taper and
  // protrudes just slightly, so it wraps the cone instead of flaring out.
  const f1 = 0.24;
  const f2 = 0.42;
  const proud = 0.012;
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(R * (1 - f2) + proud, R * (1 - f1) + proud, (f2 - f1) * H, 14),
    mat(WHITE),
  );
  band.position.y = yBase + ((f1 + f2) / 2) * H;
  g.add(band);
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
  const stripe = box(2.64, 0.18, 1.42, YELLOW); // hi-vis hazard band
  stripe.position.y = 0.85;
  g.add(stripe);
  const rubble = box(2.2, 0.4, 1.1, 0x6b5d4f);
  rubble.position.y = 1.05;
  g.add(rubble);
  for (const sx of [-1.0, 1.0]) {
    const lug = box(0.1, 0.22, 0.18, DARK); // lifting lugs
    lug.position.set(sx, 0.98, 0.62);
    g.add(lug);
  }
  return g;
}

/** A row of portable toilets (doors, vents and handles). */
function portaloos(): THREE.Group {
  const g = new THREE.Group();
  const cols = [0x3f7bd6, 0x4caf6a, 0x3f7bd6];
  for (let i = 0; i < 3; i++) {
    const x = i * 0.9;
    const u = box(0.8, 1.6, 0.8, cols[i]);
    u.position.set(x, 0.8, 0);
    g.add(u);
    const roof = box(0.88, 0.12, 0.88, WHITE);
    roof.position.set(x, 1.63, 0);
    g.add(roof);
    const door = box(0.56, 1.2, 0.04, 0xf4f4f4);
    door.position.set(x, 0.72, 0.41);
    g.add(door);
    const vent = box(0.5, 0.12, 0.04, DARK); // top vent slats
    vent.position.set(x, 1.34, 0.41);
    g.add(vent);
    const handle = box(0.05, 0.18, 0.05, DARK);
    handle.position.set(x + 0.2, 0.78, 0.43);
    g.add(handle);
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
  const band = box(3.0, 0.35, 0.12, ORANGE); // header
  band.position.set(0, 2.45, 0);
  g.add(band);
  const footer = box(3.0, 0.24, 0.12, BLUE); // info strip
  footer.position.set(0, 1.33, 0);
  g.add(footer);
  const logo = box(0.7, 0.55, 0.13, YELLOW); // logo panel
  logo.position.set(-1.0, 1.9, 0);
  g.add(logo);
  for (let i = 0; i < 3; i++) {
    const line = box(1.4, 0.08, 0.13, 0xb7bdc4); // mock text lines
    line.position.set(0.4, 2.08 - i * 0.24, 0);
    g.add(line);
  }
  return g;
}

/** A trailer-mounted floodlight tower with a generator base + lamp heads. */
function floodlightTower(): THREE.Group {
  const g = new THREE.Group();
  const skid = box(1.2, 0.14, 0.9, DARK);
  skid.position.y = 0.07;
  g.add(skid);
  const genny = box(1.0, 0.5, 0.7, YELLOW);
  genny.position.y = 0.32;
  g.add(genny);
  const mast = cyl(0.07, 0.09, 3.4, STEEL, 8);
  mast.position.set(0, 2.2, -0.1);
  g.add(mast);
  const crossbar = box(1.7, 0.08, 0.08, DARK);
  crossbar.position.set(0, 3.85, -0.05);
  g.add(crossbar);
  for (const lx of [-0.6, -0.2, 0.2, 0.6]) {
    const lamp = box(0.3, 0.24, 0.14, DARK);
    lamp.position.set(lx, 3.95, 0.02);
    g.add(lamp);
    const glass = box(0.24, 0.17, 0.05, LAMP);
    glass.position.set(lx, 3.95, 0.1);
    g.add(glass);
  }
  return g;
}

/** A small wheeled cement mixer with a tilted drum. */
function cementMixer(): THREE.Group {
  const g = new THREE.Group();
  const frame = box(1.0, 0.16, 0.7, YELLOW);
  frame.position.y = 0.5;
  g.add(frame);
  for (const sx of [-0.5, 0.5]) {
    const w = cyl(0.26, 0.26, 0.12, DARK, 10);
    w.rotation.z = Math.PI / 2;
    w.position.set(sx, 0.26, 0.25);
    g.add(w);
  }
  const leg = box(0.1, 0.5, 0.1, STEEL);
  leg.position.set(0, 0.25, -0.32);
  g.add(leg);
  const drum = cyl(0.46, 0.3, 0.72, ORANGE, 12);
  drum.rotation.x = -0.5;
  drum.position.set(0, 0.96, -0.05);
  g.add(drum);
  const mouth = cyl(0.3, 0.34, 0.18, DARK, 12);
  mouth.rotation.x = -0.5;
  mouth.position.set(0, 1.26, 0.3);
  g.add(mouth);
  const motor = box(0.3, 0.3, 0.3, DARK);
  motor.position.set(0.52, 0.86, -0.05);
  g.add(motor);
  return g;
}

/** A cluster of oil/fuel drums. */
function drumCluster(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const cols = [BLUE, RUST, 0x2f8a4a, DARK];
  const pos: [number, number][] = [
    [0, 0],
    [0.62, 0.1],
    [0.3, 0.56],
    [-0.3, 0.42],
  ];
  for (const [px, pz] of pos) {
    const d = cyl(0.28, 0.28, 0.78, cols[Math.floor(rand() * cols.length)], 12);
    d.position.set(px, 0.39, pz);
    g.add(d);
    const ring = cyl(0.29, 0.29, 0.06, DARK, 12);
    ring.position.set(px, 0.62, pz);
    g.add(ring);
  }
  return g;
}

/** A bundle of reinforcing bar resting on timber dunnage. */
function rebarBundle(): THREE.Group {
  const g = new THREE.Group();
  for (const dz of [-0.7, 0.7]) {
    const sleeper = box(0.5, 0.16, 0.2, WOOD);
    sleeper.position.set(0, 0.08, dz);
    g.add(sleeper);
  }
  for (let i = 0; i < 7; i++) {
    const bar = cyl(0.04, 0.04, 2.4, 0x9a7b52, 6);
    bar.rotation.x = Math.PI / 2;
    const a = (i / 7) * Math.PI * 2;
    bar.position.set(Math.cos(a) * 0.13, 0.3 + Math.sin(a) * 0.13, 0);
    g.add(bar);
  }
  const strap = box(0.34, 0.34, 0.04, DARK);
  strap.position.set(0, 0.3, 0.6);
  g.add(strap);
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

  // Plant + materials scattered around the yard.
  add(floodlightTower(), 40, -32, 0.5);
  add(floodlightTower(), -12, 40, -0.3);
  add(cementMixer(), -30, 33, 0.6);
  add(drumCluster(rand), 37, 25, 0);
  add(drumCluster(rand), -40, -28, 0.4);
  add(rebarBundle(), 25, 33, 0.2);

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
