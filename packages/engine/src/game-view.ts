import * as THREE from "three";
import { RtsCamera } from "./rts-camera";
import { buildUnitGeometries } from "./unit-models";
import { buildBuildingMesh, buildDepositMesh, buildMegaprojectMesh } from "./building-models";

/** Minimal render description of a unit (decoupled from the sim package). */
export interface RenderUnit {
  id: number;
  x: number;
  z: number;
  rot: number;
  kind: string;
  radius: number;
  selected: boolean;
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
  seen: boolean;
}

/** Max instances allocated per InstancedMesh. Plenty for an RTS skirmish. */
const UNIT_CAP = 2048;

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
  private readonly buildings = new Map<number, BuildingVisual>();
  private readonly nodes = new Map<number, NodeVisual>();
  private ghost: { group: THREE.Group; mats: THREE.MeshStandardMaterial[] } | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // Reusable scratch objects to avoid per-frame allocation.
  private readonly m4 = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
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
    container.appendChild(this.renderer.domElement);

    this.cameraCtl = new RtsCamera(w / h, this.renderer.domElement);

    this.scene.background = new THREE.Color(0x1b2129);
    this.scene.fog = new THREE.Fog(0x1b2129, 90, 200);

    this.buildLighting();
    this.buildGround();
    this.buildUnitMeshes();
    this.ringMesh = this.buildRingMesh();

    window.addEventListener("resize", () => this.resize());
  }

  private buildLighting(): void {
    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x40362a, 0.65);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2dd, 1.1);
    sun.position.set(40, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 70;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    this.scene.add(sun);
  }

  private buildGround(): void {
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x6b5d4f, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(140, 70, 0x3a4654, 0x2a323c);
    (grid.material as THREE.Material).opacity = 0.35;
    (grid.material as THREE.Material).transparent = true;
    grid.position.y = 0.01;
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
      const stageKey = isMega
        ? `mega:${b.megaPhase}`
        : b.progress >= 1
          ? `${b.kind}:done`
          : `${b.kind}:${Math.floor(b.progress * 3)}`;
      let v = this.buildings.get(b.id);
      if (!v || v.stageKey !== stageKey) {
        if (v) this.scene.remove(v.group);
        const group = isMega
          ? buildMegaprojectMesh(b.megaPhase!, b.radius)
          : buildBuildingMesh(b.kind, b.radius, b.progress);
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
        v = { group, ring, stageKey };
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
        this.buildings.delete(id);
      }
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

    const counters = new Map<string, number>();
    for (const kind of this.kindMeshes.keys()) counters.set(kind, 0);
    let ringCount = 0;

    for (const v of this.visuals.values()) {
      const x = v.prevX + (v.curX - v.prevX) * alpha;
      const z = v.prevZ + (v.curZ - v.prevZ) * alpha;
      const rot = lerpAngle(v.prevRot, v.curRot, alpha);

      const mesh = this.kindMeshes.get(v.kind);
      if (mesh) {
        const idx = counters.get(v.kind)!;
        this.quat.setFromAxisAngle(this.up, rot);
        this.pos.set(x, 0, z);
        this.m4.compose(this.pos, this.quat, this.unitScale);
        mesh.setMatrixAt(idx, this.m4);
        counters.set(v.kind, idx + 1);
      }

      if (v.selected) {
        this.quat.identity();
        this.pos.set(x, 0.02, z);
        this.ringScale.set(v.radius, 1, v.radius);
        this.m4.compose(this.pos, this.quat, this.ringScale);
        this.ringMesh.setMatrixAt(ringCount++, this.m4);
      }
    }

    for (const [kind, mesh] of this.kindMeshes) {
      mesh.count = counters.get(kind)!;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.ringMesh.count = ringCount;
    this.ringMesh.instanceMatrix.needsUpdate = true;

    this.renderer.render(this.scene, this.cameraCtl.camera);
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
    this.cameraCtl.setAspect(w / h);
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
