import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RtsCamera } from "./rts-camera";
import { buildUnitGeometries } from "./unit-models";
import {
  buildBuildingMesh,
  buildDepositMesh,
  buildMegaprojectMesh,
  megaStageKey,
  STOCK_SLOTS,
} from "./building-models";
import { buildSiteDecor } from "./site-decor";
import { ParticleFX } from "./particles";

/** Minimal render description of a unit (decoupled from the sim package). */
export interface RenderUnit {
  id: number;
  x: number;
  z: number;
  rot: number;
  kind: string;
  radius: number;
  selected: boolean;
  carrying?: number; // materials being hauled (shows a load on the unit)
  /** What the unit is doing: 'idle'|'move'|'gather'|'build'|'mega'. Drives the
   * work animation — a stationary 'build'/'mega' unit is heaving into a job. */
  task?: string;
}

/** Static map obstacle to render (rock pile or material stockpile). */
export interface RenderObstacle {
  x: number;
  z: number;
  radius: number;
  kind: "rocks" | "stockpile";
}

/** Render description of a building. */
export interface RenderBuilding {
  id: number;
  x: number;
  z: number;
  rot: number;
  kind: string;
  radius: number;
  progress: number; // 0..1, 1 = complete
  selected: boolean;
  /** For the HQ megaproject: current phase (0..totalPhases). */
  megaPhase?: number;
  /** Progress within the current phase (0..1) — drives floor-by-floor visuals. */
  megaFrac?: number;
  /** Drop-off stockpile: materials banked here + capacity (drives the stack). */
  stock?: number;
  stockCap?: number;
}

/** Render description of a resource deposit. */
export interface RenderNode {
  id: number;
  x: number;
  z: number;
  radius: number;
  amount: number;
  maxAmount: number;
}

interface BuildingVisual {
  group: THREE.Group;
  ring: THREE.Mesh;
  stageKey: string;
  crane?: THREE.Object3D; // the HQ tower crane (slews while animating)
}

interface NodeVisual {
  group: THREE.Group;
  seen: boolean;
}

/** Per-unit interpolation state. Meshes are instanced, not per-entity. */
interface UnitVisual {
  kind: string;
  radius: number;
  prevX: number;
  prevZ: number;
  prevRot: number;
  curX: number;
  curZ: number;
  curRot: number;
  selected: boolean;
  carrying: number;
  task: string;
  /** Stable per-unit visual variation so a crowd isn't identical clones. */
  tint: THREE.Color;
  scaleVar: number;
  seen: boolean;
}

/** Max instances allocated per InstancedMesh. Plenty for an RTS skirmish. */
const UNIT_CAP = 2048;

const WHITE = new THREE.Color(0xffffff);

/** Small deterministic RNG so obstacle decoration is stable across reloads. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Free the GPU resources of a discarded mesh group (geometries + materials). */
function disposeGroup(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) for (const m of mat) m.dispose();
    else if (mat) (mat as THREE.Material).dispose();
  });
}

/**
 * Stable per-unit visual variation derived from the entity id — a subtle colour
 * tint (multiplied over the vertex colours via instanceColor) + a small size
 * factor — so a crowd of the same kind doesn't look like identical clones.
 */
/** Cheap value noise (smooth) for terrain tinting + undulation — render only. */
function thash(x: number, z: number): number {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = thash(xi, zi);
  const b = thash(xi + 1, zi);
  const c = thash(xi, zi + 1);
  const d = thash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, z: number): number {
  return vnoise(x, z) * 0.6 + vnoise(x * 2.3 + 5, z * 2.3 - 3) * 0.28 + vnoise(x * 5.1 - 2, z * 5.1 + 4) * 0.12;
}

function unitVariation(id: number): { tint: THREE.Color; scale: number } {
  let h = (id * 2654435761) >>> 0;
  const a = (h & 0xff) / 255;
  h >>>= 8;
  const b = (h & 0xff) / 255;
  h >>>= 8;
  const c = (h & 0xff) / 255;
  const bright = 0.84 + a * 0.22; // 0.84..1.06
  const warm = (b - 0.5) * 0.12; // ±0.06 warm/cool shift
  const cl = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
  return {
    tint: new THREE.Color(cl(bright * (1 + warm)), cl(bright), cl(bright * (1 - warm))),
    scale: 0.92 + c * 0.15, // 0.92..1.07
  };
}

/**
 * Owns the Three.js scene and renders interpolated unit state. Units of each
 * kind share one InstancedMesh (single draw call), so the renderer scales to
 * hundreds of units. The sim runs at a fixed tick; `onTick()` records a new
 * snapshot and `render(alpha)` draws the smoothed in-between frame.
 */
export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cameraCtl: RtsCamera;

  private readonly visuals = new Map<number, UnitVisual>();
  private readonly kindMeshes = new Map<string, THREE.InstancedMesh>();
  private readonly ringMesh: THREE.InstancedMesh;
  private readonly loadMesh: THREE.InstancedMesh;
  private readonly buildings = new Map<number, BuildingVisual>();
  private readonly nodes = new Map<number, NodeVisual>();
  private ghost: { group: THREE.Group; mats: THREE.MeshStandardMaterial[] } | null = null;
  private readonly markers: { mesh: THREE.Mesh; age: number; ttl: number }[] = [];

  // Lighting refs + weather/hazard FX.
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private ambient!: THREE.AmbientLight;
  private rain: THREE.LineSegments | null = null;
  private weather: "clear" | "rain" | "osha" | "shortage" | "strike" = "clear";
  private readonly weatherSky = new THREE.Color(0xc6b694);
  private lightningTimer = 4;
  private flash = 0;
  private composer!: EffectComposer;
  private elapsed = 0; // animation clock
  private dust!: ParticleFX;
  private sparks!: ParticleFX;
  private confetti!: ParticleFX;
  private smoke!: ParticleFX;
  private readonly smokeSources: { x: number; z: number }[] = [];
  private hqPos: THREE.Vector3 | null = null;
  private hqActive = false;
  private hqPhase = 0;
  private ambientTimer = 0;
  private buildingsInit = false;

  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // Reusable scratch objects to avoid per-frame allocation.
  private readonly m4 = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly pos = new THREE.Vector3();
  private readonly unitScale = new THREE.Vector3(1, 1, 1);
  private readonly ringScale = new THREE.Vector3(1, 1, 1);

  constructor(private readonly container: HTMLElement) {
    const w = container.clientWidth;
    const h = container.clientHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.cameraCtl = new RtsCamera(w / h, this.renderer.domElement);

    // Warm, hazy late-afternoon sky + atmospheric distance fog for depth.
    this.scene.background = new THREE.Color(0xc6b694);
    this.scene.fog = new THREE.Fog(0xc6b694, 46, 152);

    this.buildLighting();
    this.buildGround();
    this.scene.add(buildSiteDecor(60));
    this.buildUnitMeshes();
    this.ringMesh = this.buildRingMesh();
    this.loadMesh = this.buildLoadMesh();

    // Post-processing: filmic tone mapping + a soft bloom so the sun, hi-vis
    // equipment, and lightning glow.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.cameraCtl.camera));
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.55, 0.82),
    );
    this.composer.addPass(new OutputPass());

    // Particle pools: dust (soft, light gravity), sparks (additive, heavy
    // gravity, short life), confetti (additive, for victory).
    const pr = this.renderer.getPixelRatio();
    this.dust = new ParticleFX(900, THREE.NormalBlending, 1.2, pr);
    this.sparks = new ParticleFX(500, THREE.AdditiveBlending, 11, pr);
    this.confetti = new ParticleFX(500, THREE.AdditiveBlending, 5, pr);
    this.smoke = new ParticleFX(700, THREE.NormalBlending, -0.35, pr); // negative gravity = rises
    this.scene.add(this.dust.points, this.sparks.points, this.confetti.points, this.smoke.points);

    // Site diesel generators (also colliders) that puff an exhaust column.
    for (const s of [{ x: -19, z: 19 }, { x: 22, z: 8 }]) {
      this.smokeSources.push(s);
      const grp = new THREE.Group();
      grp.position.set(s.x, 0, s.z);
      const gm = (c: number, rough = 0.8) =>
        new THREE.MeshStandardMaterial({ color: c, roughness: rough, flatShading: true });
      const part = (w: number, h: number, d: number, c: number, x: number, y: number, z: number): void => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), gm(c));
        m.position.set(x, y, z);
        m.castShadow = true;
        m.receiveShadow = true;
        grp.add(m);
      };
      part(1.24, 0.16, 1.54, 0x2a2d31, 0, 0.08, 0); // skid
      part(1.0, 0.72, 1.4, 0xe0a020, 0, 0.52, 0); // yellow canopy
      part(1.06, 0.12, 1.46, 0x33373b, 0, 0.9, 0); // roof cap
      part(0.5, 0.46, 0.06, 0x1c1f22, 0, 0.52, 0.71); // control panel
      part(0.3, 0.2, 0.05, 0x4a90d9, 0, 0.58, 0.74); // gauge cluster
      part(0.06, 0.5, 1.0, 0x1c1f22, -0.52, 0.52, 0); // radiator grille
      for (let i = 0; i < 4; i++) part(0.08, 0.03, 1.0, 0x565b61, -0.54, 0.34 + i * 0.13, 0); // louvres
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.85, 8), gm(0x2a2d31));
      pipe.position.set(0.3, 1.25, -0.4); // exhaust stack (smoke rises from here)
      pipe.castShadow = true;
      grp.add(pipe);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.1, 0.1, 8), gm(0x1c1f22));
      cap.position.set(0.3, 1.72, -0.4);
      grp.add(cap);
      this.scene.add(grp);
    }

    window.addEventListener("resize", () => this.resize());
  }

  private buildLighting(): void {
    // Warm sky bounce + cool shadow fill, low ambient — golden-hour mood.
    this.hemi = new THREE.HemisphereLight(0xeadfc6, 0x8a7456, 0.72);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffe9cc, 0.14);
    this.scene.add(this.ambient);

    // Low, warm sun raking across the site → long late-afternoon shadows.
    this.sun = new THREE.DirectionalLight(0xffcd83, 1.75);
    this.sun.position.set(56, 33, 24);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = 88; // wider frustum to fit the long shadows
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 300;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
  }

  private buildRain(): void {
    const N = 3500;
    const AREA = 55;
    const TOP = 30;
    const arr = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 2 * AREA;
      const z = (Math.random() - 0.5) * 2 * AREA;
      const y = Math.random() * TOP;
      arr[i * 6] = x;
      arr[i * 6 + 1] = y;
      arr[i * 6 + 2] = z;
      arr[i * 6 + 3] = x - 0.18;
      arr[i * 6 + 4] = y - 0.75;
      arr[i * 6 + 5] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xbcccd9, transparent: true, opacity: 0.42 });
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  /** Switch the active hazard's weather/atmosphere (null = clear). */
  setWeather(kind: string | null): void {
    const w = (kind ?? "clear") as GameView["weather"];
    this.weather = w === "rain" || w === "osha" || w === "shortage" || w === "strike" ? w : "clear";

    // Distinct sky/lighting per hazard.
    const presets: Record<string, { sky: number; sun: number; hemi: number; near: number; far: number }> = {
      clear: { sky: 0xc6b694, sun: 1.75, hemi: 0.72, near: 46, far: 152 },
      rain: { sky: 0x596169, sun: 0.55, hemi: 0.6, near: 32, far: 110 },
      osha: { sky: 0xb8b08f, sun: 1.45, hemi: 0.75, near: 44, far: 145 },
      shortage: { sky: 0xc4ab78, sun: 1.55, hemi: 0.68, near: 36, far: 115 },
      strike: { sky: 0xa39a85, sun: 1.1, hemi: 0.62, near: 42, far: 140 },
    };
    const p = presets[this.weather];
    this.weatherSky.setHex(p.sky);
    (this.scene.background as THREE.Color).copy(this.weatherSky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.weatherSky);
    fog.near = p.near;
    fog.far = p.far;
    this.sun.intensity = p.sun;
    this.hemi.intensity = p.hemi;

    if (this.weather === "rain") {
      if (!this.rain) this.buildRain();
      this.rain!.visible = true;
      this.lightningTimer = 1.5 + Math.random() * 2;
    } else if (this.rain) {
      this.rain.visible = false;
    }
  }

  private updateWeather(dt: number): void {
    if (this.weather !== "rain" || !this.rain) return;

    // Animate the rain streaks falling (with a little wind slant) + recycle.
    const pos = this.rain.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const fall = 30 * dt;
    const slant = 2.5 * dt;
    for (let i = 0; i < arr.length; i += 6) {
      arr[i + 1] -= fall;
      arr[i + 4] -= fall;
      arr[i] += slant;
      arr[i + 3] += slant;
      if (arr[i + 1] < 0) {
        const nx = (Math.random() - 0.5) * 110;
        const nz = (Math.random() - 0.5) * 110;
        const ny = 30 + Math.random() * 6;
        arr[i] = nx;
        arr[i + 1] = ny;
        arr[i + 2] = nz;
        arr[i + 3] = nx - 0.18;
        arr[i + 4] = ny - 0.75;
        arr[i + 5] = nz;
      }
    }
    pos.needsUpdate = true;
    this.rain.position.set(this.cameraCtl.focusX, 0, this.cameraCtl.focusZ);

    // Lightning: occasional bright flash that lights the whole scene.
    this.lightningTimer -= dt;
    if (this.lightningTimer <= 0) {
      this.flash = Math.random() < 0.35 ? 1.5 : 1.0; // sometimes a double-bright bolt
      this.lightningTimer = 2.5 + Math.random() * 5.5;
      this.cameraCtl.shake(0.7); // thunder rattles the rig
    }
    this.flash = Math.max(0, this.flash - dt * 6);
    const f = Math.min(1, this.flash);
    (this.scene.background as THREE.Color).copy(this.weatherSky).lerp(WHITE, f * 0.85);
    this.hemi.intensity = 0.6 + f * 1.6;
    this.ambient.intensity = 0.12 + f * 0.8;
  }

  private buildGround(): void {
    const rand = mulberry32(0x3c0ffee);

    // 1. Subdivided dirt surface: vertex-coloured tonal noise (so it isn't a
    //    flat slab) + gentle berms beyond the play area for a sense of a graded
    //    lot. The central ±60 stays flat so units never float over dips.
    const SIZE = 168;
    const SEG = 84;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const light = new THREE.Color(0x91815f);
    const mid = new THREE.Color(0x73634b);
    const dark = new THREE.Color(0x5b4f3c);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const n = fbm(x * 0.05, z * 0.05);
      if (n < 0.5) tmp.copy(dark).lerp(mid, n * 2);
      else tmp.copy(mid).lerp(light, (n - 0.5) * 2);
      col[i * 3] = tmp.r;
      col[i * 3 + 1] = tmp.g;
      col[i * 3 + 2] = tmp.b;
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (edge > 60) pos.setY(i, (edge - 60) * 0.14 + fbm(x * 0.07, z * 0.07) * 1.1);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 2. Flat decals: subtle mud/gravel mottling, a few puddles, tyre ruts.
    const patchCols = [0x6b5d49, 0x77684f, 0x5f5240, 0x807257, 0x665845];
    for (let i = 0; i < 52; i++) {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(1 + rand() * 3, 9),
        new THREE.MeshStandardMaterial({ color: patchCols[Math.floor(rand() * patchCols.length)], roughness: 1 }),
      );
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rand() * Math.PI;
      m.position.set((rand() - 0.5) * 124, 0.012, (rand() - 0.5) * 124);
      m.receiveShadow = true;
      this.scene.add(m);
    }
    for (let i = 0; i < 4; i++) {
      const puddle = new THREE.Mesh(
        new THREE.CircleGeometry(0.6 + rand() * 1.2, 12),
        new THREE.MeshStandardMaterial({ color: 0x4a4538, roughness: 0.4, metalness: 0.15 }),
      );
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set((rand() - 0.5) * 80, 0.013, (rand() - 0.5) * 80);
      this.scene.add(puddle);
    }
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x534636, roughness: 1 });
    for (let i = 0; i < 8; i++) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 18 + rand() * 24), trackMat);
      strip.rotation.x = -Math.PI / 2;
      strip.rotation.z = rand() * Math.PI;
      strip.position.set((rand() - 0.5) * 100, 0.014, (rand() - 0.5) * 80);
      this.scene.add(strip);
    }

    // 3. Scattered pebbles + 4. sparse perimeter weeds (one InstancedMesh each).
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sv = new THREE.Vector3();
    const pv = new THREE.Vector3();
    const cv = new THREE.Color();

    const pebbles = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.18, 0),
      new THREE.MeshStandardMaterial({ color: 0x7a6d57, roughness: 1, flatShading: true }),
      170,
    );
    for (let i = 0; i < 170; i++) {
      const sc = 0.4 + rand() * 1.4;
      pv.set((rand() - 0.5) * 132, 0.04 * sc, (rand() - 0.5) * 132);
      e.set(rand() * 3, rand() * 3, rand() * 3);
      q.setFromEuler(e);
      sv.set(sc, sc * 0.7, sc);
      m4.compose(pv, q, sv);
      pebbles.setMatrixAt(i, m4);
      const t = 0.8 + rand() * 0.4;
      pebbles.setColorAt(i, cv.setRGB(t, t * 0.97, t * 0.92));
    }
    pebbles.instanceMatrix.needsUpdate = true;
    if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
    pebbles.castShadow = true;
    pebbles.receiveShadow = true;
    this.scene.add(pebbles);

    const weeds = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.08, 0.55, 4),
      new THREE.MeshStandardMaterial({ color: 0x5f6e36, roughness: 1, flatShading: true }),
      140,
    );
    let wc = 0;
    for (let i = 0; i < 600 && wc < 140; i++) {
      const x = (rand() - 0.5) * 150;
      const z = (rand() - 0.5) * 150;
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (edge < 46 && rand() > 0.12) continue; // mostly weeds at the churned-free perimeter
      const sc = 0.7 + rand() * 0.9;
      pv.set(x, 0.27 * sc, z);
      e.set((rand() - 0.5) * 0.3, rand() * Math.PI, (rand() - 0.5) * 0.3);
      q.setFromEuler(e);
      sv.set(sc, sc, sc);
      m4.compose(pv, q, sv);
      weeds.setMatrixAt(wc, m4);
      const g = 0.78 + rand() * 0.35;
      weeds.setColorAt(wc, cv.setRGB(g * 0.95, g, g * 0.7));
      wc++;
    }
    weeds.count = wc;
    weeds.instanceMatrix.needsUpdate = true;
    if (weeds.instanceColor) weeds.instanceColor.needsUpdate = true;
    weeds.castShadow = true;
    this.scene.add(weeds);

    // 5. Faint setting-out grid.
    const grid = new THREE.GridHelper(150, 75, 0x6f7d88, 0x5a6670);
    (grid.material as THREE.Material).opacity = 0.1;
    (grid.material as THREE.Material).transparent = true;
    grid.position.y = 0.02;
    this.scene.add(grid);
  }

  private buildUnitMeshes(): void {
    const geoms = buildUnitGeometries();
    for (const [kind, geo] of Object.entries(geoms)) {
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness: 0.7,
        metalness: 0.05,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, UNIT_CAP);
      // Per-instance colour (multiplied over the vertex colours) for crowd variety.
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(UNIT_CAP * 3).fill(1), 3);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // instances move; skip per-mesh culling
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);
      this.kindMeshes.set(kind, mesh);
    }
  }

  private buildRingMesh(): THREE.InstancedMesh {
    const ring = new THREE.RingGeometry(1.1, 1.35, 24);
    ring.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x53ff7a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.InstancedMesh(ring, mat, UNIT_CAP);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(mesh);
    return mesh;
  }

  /** Small material crate shown above units that are hauling. */
  private buildLoadMesh(): THREE.InstancedMesh {
    const geo = new THREE.BoxGeometry(0.5, 0.34, 0.5);
    const mat = new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.9, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, UNIT_CAP);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(mesh);
    return mesh;
  }

  /** Build static obstacle meshes once. Call after construction. */
  setObstacles(obstacles: RenderObstacle[]): void {
    for (const o of obstacles) this.scene.add(this.buildObstacle(o));
  }

  private buildObstacle(o: RenderObstacle): THREE.Group {
    const group = new THREE.Group();
    group.position.set(o.x, 0, o.z);
    const rand = mulberry32(
      Math.floor((o.x + 1000) * 73856093) ^ Math.floor((o.z + 1000) * 19349663),
    );

    if (o.kind === "rocks") {
      const mat = new THREE.MeshStandardMaterial({ color: 0x8d8377, roughness: 1, flatShading: true });
      const count = 4 + Math.floor(rand() * 4);
      for (let i = 0; i < count; i++) {
        const r = 0.5 + rand() * (o.radius * 0.35);
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat);
        const a = rand() * Math.PI * 2;
        const dr = rand() * o.radius * 0.7;
        rock.position.set(Math.cos(a) * dr, r * 0.55, Math.sin(a) * dr);
        rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
        rock.scale.y = 0.7 + rand() * 0.5;
        rock.castShadow = true;
        rock.receiveShadow = true;
        group.add(rock);
      }
    } else {
      const colors = [0xc9a14a, 0x9fa6ad, 0xb5651d];
      const count = 5 + Math.floor(rand() * 4);
      for (let i = 0; i < count; i++) {
        const sz = 0.8 + rand() * 0.7;
        const crate = new THREE.Mesh(
          new THREE.BoxGeometry(sz, sz * 0.7, sz),
          new THREE.MeshStandardMaterial({
            color: colors[Math.floor(rand() * colors.length)],
            roughness: 0.85,
            flatShading: true,
          }),
        );
        const a = rand() * Math.PI * 2;
        const dr = rand() * o.radius * 0.6;
        crate.position.set(
          Math.cos(a) * dr,
          (sz * 0.7) / 2 + (rand() < 0.3 ? sz * 0.7 : 0),
          Math.sin(a) * dr,
        );
        crate.rotation.y = rand() * Math.PI;
        crate.castShadow = true;
        crate.receiveShadow = true;
        group.add(crate);
      }
    }
    return group;
  }

  /** Create/update/remove building meshes to match the sim. */
  syncBuildings(list: RenderBuilding[]): void {
    const seen = new Set<number>();
    for (const b of list) {
      seen.add(b.id);
      const isMega = b.megaPhase !== undefined;
      if (isMega) this.hqPos = (this.hqPos ?? new THREE.Vector3()).set(b.x, 0, b.z);
      const stockFrac = b.stockCap && b.stockCap > 0 ? (b.stock ?? 0) / b.stockCap : 0;
      const stageKey = isMega
        ? `mega:${megaStageKey(b.megaPhase!, b.megaFrac ?? 0)}`
        : b.progress >= 1
          ? `${b.kind}:done:${Math.round(stockFrac * STOCK_SLOTS)}`
          : `${b.kind}:${Math.floor(b.progress * 3)}`;
      let v = this.buildings.get(b.id);
      if (!v || v.stageKey !== stageKey) {
        // A building completing or the HQ advancing a phase → dust/spark burst.
        if (v) {
          this.dust.burst(b.x, 1.2, b.z, isMega ? 34 : 16, 2.8, 2.4, 1.1, 0.9, 0.86, 0.78, 1.1);
          if (isMega) this.sparks.burst(b.x, 2.5, b.z, 26, 4.5, 5, 0.28, 1.0, 0.82, 0.32, 0.7);
          this.scene.remove(v.group);
          disposeGroup(v.group);
        } else if (this.buildingsInit && !isMega) {
          // A freshly-placed building blueprint kicks up a dust puff.
          this.dust.burst(b.x, 0.6, b.z, 22, b.radius + 1, 1.6, 1.1, 0.9, 0.86, 0.78, 1.0);
        }
        const group = isMega
          ? buildMegaprojectMesh(b.megaPhase!, b.megaFrac ?? 0, b.radius)
          : buildBuildingMesh(b.kind, b.radius, b.progress, stockFrac);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(b.radius * 1.05, b.radius * 1.3, 28),
          new THREE.MeshBasicMaterial({
            color: 0x53ff7a,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.05;
        group.add(ring);
        group.position.set(b.x, 0, b.z);
        group.rotation.y = b.rot;
        this.scene.add(group);
        v = { group, ring, stageKey, crane: group.getObjectByName("towerCrane") ?? undefined };
        this.buildings.set(b.id, v);
      } else {
        v.group.position.set(b.x, 0, b.z);
        v.group.rotation.y = b.rot;
      }
      v.ring.visible = b.selected;
    }
    for (const [id, v] of this.buildings) {
      if (!seen.has(id)) {
        this.scene.remove(v.group);
        disposeGroup(v.group);
        this.buildings.delete(id);
      }
    }
    this.buildingsInit = true;
  }

  /** Tell the FX layer whether crews are working the HQ, and which phase. */
  setHqWork(active: boolean, phase: number): void {
    this.hqActive = active;
    this.hqPhase = phase;
  }

  /** Celebratory confetti at the camera focus (victory). */
  celebrate(): void {
    const x = this.cameraCtl.focusX;
    const z = this.cameraCtl.focusZ;
    const cols = [
      [1, 0.85, 0.1], [1, 0.45, 0.15], [0.4, 0.8, 1], [0.5, 1, 0.4], [1, 1, 1],
    ];
    for (let i = 0; i < 260; i++) {
      const c = cols[i % cols.length];
      this.confetti.spawn(
        x + (Math.random() - 0.5) * 6, 1 + Math.random() * 2, z + (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 7, 7 + Math.random() * 8, (Math.random() - 0.5) * 7,
        0.5 + Math.random() * 0.4, c[0], c[1], c[2], 1.8 + Math.random() * 1.4,
      );
    }
  }

  /** Show a translucent placement ghost for a building of `kind`. */
  showGhost(kind: string, radius: number): void {
    this.hideGhost();
    const group = buildBuildingMesh(kind, radius, 1);
    const mats: THREE.MeshStandardMaterial[] = [];
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = new THREE.MeshStandardMaterial({
          color: 0x53ff7a,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        });
        o.material = m;
        o.castShadow = false;
        mats.push(m);
      }
    });
    // Footprint ring.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.95, radius * 1.15, 28),
      new THREE.MeshBasicMaterial({ color: 0x53ff7a, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);
    this.scene.add(group);
    this.ghost = { group, mats };
  }

  /** Move the ghost and tint it by validity. */
  updateGhost(x: number, z: number, valid: boolean): void {
    if (!this.ghost) return;
    this.ghost.group.position.set(x, 0, z);
    const color = valid ? 0x53ff7a : 0xff5340;
    for (const m of this.ghost.mats) m.color.setHex(color);
  }

  hideGhost(): void {
    if (!this.ghost) return;
    this.scene.remove(this.ghost.group);
    this.ghost = null;
  }

  /** Pulse an expanding ring on the ground to acknowledge an order. */
  pingMarker(x: number, z: number, color: number): void {
    const geo = new THREE.RingGeometry(0.45, 0.72, 24);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.position.set(x, 0.06, z);
    this.scene.add(mesh);
    this.markers.push({ mesh, age: 0, ttl: 0.55 });
  }

  private updateMarkers(dt: number): void {
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.age += dt;
      const t = m.age / m.ttl;
      if (t >= 1) {
        this.scene.remove(m.mesh);
        m.mesh.geometry.dispose();
        (m.mesh.material as THREE.Material).dispose();
        this.markers.splice(i, 1);
        continue;
      }
      const s = 0.5 + t * 2.2;
      m.mesh.scale.set(s, 1, s);
      (m.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - t);
    }
  }

  /** Create/update/remove deposit meshes; scale by remaining amount. */
  syncNodes(list: RenderNode[]): void {
    for (const v of this.nodes.values()) v.seen = false;
    for (const n of list) {
      let v = this.nodes.get(n.id);
      if (!v) {
        const group = buildDepositMesh(n.radius);
        group.position.set(n.x, 0, n.z);
        this.scene.add(group);
        v = { group, seen: true };
        this.nodes.set(n.id, v);
      }
      const fill = Math.max(0.3, n.amount / Math.max(1, n.maxAmount));
      v.group.scale.set(0.6 + 0.4 * fill, fill, 0.6 + 0.4 * fill);
      v.seen = true;
    }
    for (const [id, v] of this.nodes) {
      if (!v.seen) {
        this.scene.remove(v.group);
        this.nodes.delete(id);
      }
    }
  }

  /** Record a fresh sim snapshot. Shifts current → previous for interpolation. */
  onTick(units: RenderUnit[]): void {
    for (const v of this.visuals.values()) v.seen = false;

    for (const u of units) {
      let v = this.visuals.get(u.id);
      if (!v) {
        const vary = unitVariation(u.id);
        v = {
          kind: u.kind,
          radius: u.radius,
          prevX: u.x,
          prevZ: u.z,
          prevRot: u.rot,
          curX: u.x,
          curZ: u.z,
          curRot: u.rot,
          selected: u.selected,
          carrying: u.carrying ?? 0,
          task: u.task ?? "idle",
          tint: vary.tint,
          scaleVar: vary.scale,
          seen: true,
        };
        this.visuals.set(u.id, v);
      } else {
        v.prevX = v.curX;
        v.prevZ = v.curZ;
        v.prevRot = v.curRot;
        v.curX = u.x;
        v.curZ = u.z;
        v.curRot = u.rot;
        v.kind = u.kind;
        v.radius = u.radius;
        v.selected = u.selected;
        v.carrying = u.carrying ?? 0;
        v.task = u.task ?? "idle";
        v.seen = true;
      }
    }

    for (const [id, v] of this.visuals) {
      if (!v.seen) this.visuals.delete(id);
    }
  }

  /** Draw an interpolated frame. `alpha` is the fraction into the current tick. */
  render(
    alpha: number,
    dt: number,
    pointer?: { x: number; y: number; w: number; h: number },
  ): void {
    this.cameraCtl.update(dt, pointer);
    this.elapsed += dt;
    this.updateMarkers(dt);
    this.updateWeather(dt);
    this.dust.update(dt);
    this.sparks.update(dt);
    this.confetti.update(dt);
    this.smoke.update(dt);
    // Generators puff a rising smoke column.
    for (const s of this.smokeSources) {
      if (Math.random() < 0.55) {
        this.smoke.spawn(
          s.x + 0.3 + (Math.random() - 0.5) * 0.25, 1.45, s.z - 0.4 + (Math.random() - 0.5) * 0.25,
          (Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3,
          0.95 + Math.random() * 0.8, 0.5, 0.5, 0.52, 2.6 + Math.random() * 1.6,
        );
      }
    }

    const counters = new Map<string, number>();
    for (const kind of this.kindMeshes.keys()) counters.set(kind, 0);
    let ringCount = 0;
    let loadCount = 0;

    for (const [id, v] of this.visuals) {
      const x = v.prevX + (v.curX - v.prevX) * alpha;
      const z = v.prevZ + (v.curZ - v.prevZ) * alpha;
      const rot = lerpAngle(v.prevRot, v.curRot, alpha);
      const moving = Math.abs(v.curX - v.prevX) + Math.abs(v.curZ - v.prevZ) > 0.005;
      // A stationary unit assigned to a build/HQ job is on-site putting in effort.
      const working = !moving && (v.task === "build" || v.task === "mega");
      // workStroke: a rhythmic swing that drives the heave + debris puffs.
      const workStroke = working ? Math.sin(this.elapsed * 7.5 + id * 2.1) : 0;
      const workDown = Math.max(0, workStroke); // 0 between strokes, 1 at the strike
      // Liveliness: walkers bounce, on-the-job crews heave into it, idle units sway.
      const amp = v.kind === "worker" ? 0.07 : 0.03;
      let bob: number;
      let leanX: number;
      if (moving) {
        bob = Math.abs(Math.sin(this.elapsed * 9 + id * 1.7)) * amp;
        leanX = Math.sin(this.elapsed * 9 + id * 1.7) * 0.04;
      } else if (working) {
        // Heave forward + down on each stroke (hammer / dig), then recover.
        bob = workDown * (v.kind === "worker" ? 0.05 : 0.025);
        leanX = -workDown * (v.kind === "worker" ? 0.45 : v.kind === "excavator" ? 0.3 : 0.16);
      } else {
        bob = Math.sin(this.elapsed * 1.6 + id) * 0.012;
        leanX = 0;
      }

      const mesh = this.kindMeshes.get(v.kind);
      if (mesh) {
        const idx = counters.get(v.kind)!;
        const sv = v.kind === "worker" ? v.scaleVar : 1; // people vary in size; machines don't
        this.unitScale.set(sv, sv, sv);
        this.quat.setFromEuler(this.euler.set(leanX, rot, 0));
        this.pos.set(x, bob, z);
        this.m4.compose(this.pos, this.quat, this.unitScale);
        mesh.setMatrixAt(idx, this.m4);
        mesh.setColorAt(idx, v.tint);
        counters.set(v.kind, idx + 1);
      }

      if (v.selected) {
        this.quat.identity();
        this.pos.set(x, 0.02, z);
        this.ringScale.set(v.radius, 1, v.radius);
        this.m4.compose(this.pos, this.quat, this.ringScale);
        this.ringMesh.setMatrixAt(ringCount++, this.m4);
      }

      if (v.carrying > 0) {
        this.quat.setFromEuler(this.euler.set(0, rot, 0));
        this.pos.set(x, v.radius * 1.4 + 0.85 + bob, z);
        this.m4.compose(this.pos, this.quat, this.unitScale);
        this.loadMesh.setMatrixAt(loadCount++, this.m4);
      }

      // Kick up dust under moving units.
      if (moving && Math.random() < (v.kind === "worker" ? 0.16 : 0.3)) {
        this.dust.spawn(
          x + (Math.random() - 0.5) * 0.5, 0.1, z + (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5,
          0.7 + Math.random() * 0.6, 0.86, 0.82, 0.74, 0.6 + Math.random() * 0.4,
        );
      }

      // Effort feedback: a puff of debris on each downstroke while a crew works,
      // plus welding sparks for crews up on the HQ's structural phases.
      if (working) {
        if (workStroke > 0.8 && Math.random() < 0.5) {
          this.dust.spawn(
            x + (Math.random() - 0.5) * 0.8, 0.16, z + (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 0.5, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5,
            0.5 + Math.random() * 0.5, 0.88, 0.84, 0.76, 0.45 + Math.random() * 0.4,
          );
        }
        if (v.task === "mega" && this.hqPhase >= 5 && this.hqPhase <= 9 && Math.random() < 0.22) {
          this.sparks.burst(
            x + (Math.random() - 0.5) * 0.6, v.radius * 1.5 + 0.6, z + (Math.random() - 0.5) * 0.6,
            5, 2.2, 4, 0.2, 1.0, 0.85, 0.35, 0.4,
          );
        }
      }
    }

    for (const [kind, mesh] of this.kindMeshes) {
      mesh.count = counters.get(kind)!;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.ringMesh.count = ringCount;
    this.ringMesh.instanceMatrix.needsUpdate = true;
    this.loadMesh.count = loadCount;
    this.loadMesh.instanceMatrix.needsUpdate = true;

    // Tower cranes slowly slew while the HQ is under construction.
    for (const bv of this.buildings.values()) {
      if (bv.crane) bv.crane.rotation.y = this.elapsed * 0.12;
    }

    // Light construction haze drifting up off the HQ while crews are on it —
    // kept sparse now that each on-site worker puffs its own debris (above).
    if (this.hqActive && this.hqPos) {
      const p = this.hqPos;
      if (Math.random() < 0.5) {
        this.dust.spawn(
          p.x + (Math.random() - 0.5) * 5, 0.8 + Math.random() * 2.6, p.z + (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 0.5, 0.4 + Math.random() * 0.7, (Math.random() - 0.5) * 0.5,
          0.6 + Math.random() * 0.6, 0.9, 0.87, 0.8, 1.0 + Math.random() * 0.7,
        );
      }
      // Structural phases (5–9): welding sparks raining off the rising frame.
      if (this.hqPhase >= 5 && this.hqPhase <= 9 && Math.random() < 0.5) {
        this.sparks.burst(
          p.x + (Math.random() - 0.5) * 4, 2 + Math.random() * 6, p.z + (Math.random() - 0.5) * 4,
          7, 3.5, 5, 0.24, 1.0, 0.85, 0.35, 0.5,
        );
      }
    }

    // Drifting ambient site dust for atmosphere.
    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = 0.14;
      this.dust.spawn(
        this.cameraCtl.focusX + (Math.random() - 0.5) * 42, 0.5 + Math.random() * 5,
        this.cameraCtl.focusZ + (Math.random() - 0.5) * 42,
        (Math.random() - 0.5) * 0.35, 0.06, (Math.random() - 0.5) * 0.35,
        0.4 + Math.random() * 0.4, 0.82, 0.78, 0.7, 2 + Math.random() * 2,
      );
    }

    this.composer.render();
  }

  /** Ground point under a screen pixel, or null if it misses the plane. */
  worldFromScreen(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.cameraCtl.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
      return { x: hit.x, z: hit.z };
    }
    return null;
  }

  /** Project a world ground point to screen pixels (for box selection). */
  screenFromWorld(x: number, z: number): { x: number; y: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(x, 0, z).project(this.cameraCtl.camera);
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((-v.y + 1) / 2) * rect.height,
    };
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.cameraCtl.setAspect(w / h);
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
