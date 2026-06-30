import * as THREE from "three";
import { RtsCamera } from "./rts-camera";

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

interface Visual {
  group: THREE.Group;
  ring: THREE.Mesh;
  prevX: number;
  prevZ: number;
  prevRot: number;
  curX: number;
  curZ: number;
  curRot: number;
  seen: boolean;
}

const KIND_COLOR: Record<string, number> = {
  worker: 0xffc24b, // hi-vis amber
  excavator: 0xf25c2a,
  crane: 0xffd34e,
};

/**
 * Owns the Three.js scene and renders interpolated unit state. The sim runs at
 * a fixed tick; `onTick()` records a new snapshot and `render(alpha)` draws the
 * smoothed in-between frame.
 */
export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cameraCtl: RtsCamera;

  private readonly visuals = new Map<number, Visual>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

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
    this.scene.fog = new THREE.Fog(0x1b2129, 80, 180);

    this.buildLighting();
    this.buildGround();

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
    // Dirt-lot ground plane.
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x6b5d4f,
      roughness: 1,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Site survey grid overlay.
    const grid = new THREE.GridHelper(140, 70, 0x3a4654, 0x2a323c);
    (grid.material as THREE.Material).opacity = 0.35;
    (grid.material as THREE.Material).transparent = true;
    grid.position.y = 0.01;
    this.scene.add(grid);
  }

  /** Build static obstacle meshes once. Call after construction. */
  setObstacles(obstacles: RenderObstacle[]): void {
    for (const o of obstacles) this.scene.add(this.buildObstacle(o));
  }

  private buildObstacle(o: RenderObstacle): THREE.Group {
    const group = new THREE.Group();
    group.position.set(o.x, 0, o.z);
    const rand = mulberry32(Math.floor((o.x + 1000) * 73856093) ^ Math.floor((o.z + 1000) * 19349663));

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
      // Stockpile: stacked material crates/bags.
      const colors = [0xc9a14a, 0x9fa6ad, 0xb5651d];
      const count = 5 + Math.floor(rand() * 4);
      for (let i = 0; i < count; i++) {
        const s = 0.8 + rand() * 0.7;
        const crate = new THREE.Mesh(
          new THREE.BoxGeometry(s, s * 0.7, s),
          new THREE.MeshStandardMaterial({
            color: colors[Math.floor(rand() * colors.length)],
            roughness: 0.85,
            flatShading: true,
          }),
        );
        const a = rand() * Math.PI * 2;
        const dr = rand() * o.radius * 0.6;
        crate.position.set(Math.cos(a) * dr, (s * 0.7) / 2 + (rand() < 0.3 ? s * 0.7 : 0), Math.sin(a) * dr);
        crate.rotation.y = rand() * Math.PI;
        crate.castShadow = true;
        crate.receiveShadow = true;
        group.add(crate);
      }
    }
    return group;
  }

  private buildUnitVisual(u: RenderUnit): Visual {
    const group = new THREE.Group();

    const color = KIND_COLOR[u.kind] ?? 0xcccccc;
    const bodyHeight = u.radius * 1.8;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(u.radius * 0.7, u.radius * 0.9, bodyHeight, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1 }),
    );
    body.position.y = bodyHeight / 2;
    body.castShadow = true;
    group.add(body);

    // A little "hard hat" cap so units read as construction crew.
    const hat = new THREE.Mesh(
      new THREE.SphereGeometry(u.radius * 0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xffe14d, roughness: 0.5 }),
    );
    hat.position.y = bodyHeight + 0.02;
    hat.castShadow = true;
    group.add(hat);

    // Direction nub so facing is visible.
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, u.radius * 0.8),
      new THREE.MeshStandardMaterial({ color: 0x222222 }),
    );
    nose.position.set(0, bodyHeight * 0.6, u.radius * 0.8);
    group.add(nose);

    // Selection ring on the ground.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(u.radius * 1.1, u.radius * 1.35, 24),
      new THREE.MeshBasicMaterial({
        color: 0x53ff7a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    ring.visible = false;
    group.add(ring);

    this.scene.add(group);
    return {
      group,
      ring,
      prevX: u.x,
      prevZ: u.z,
      prevRot: u.rot,
      curX: u.x,
      curZ: u.z,
      curRot: u.rot,
      seen: true,
    };
  }

  /** Record a fresh sim snapshot. Shifts current → previous for interpolation. */
  onTick(units: RenderUnit[]): void {
    for (const v of this.visuals.values()) v.seen = false;

    for (const u of units) {
      let v = this.visuals.get(u.id);
      if (!v) {
        v = this.buildUnitVisual(u);
        this.visuals.set(u.id, v);
      } else {
        v.prevX = v.curX;
        v.prevZ = v.curZ;
        v.prevRot = v.curRot;
        v.curX = u.x;
        v.curZ = u.z;
        v.curRot = u.rot;
      }
      v.ring.visible = u.selected;
      v.seen = true;
    }

    for (const [id, v] of this.visuals) {
      if (!v.seen) {
        this.scene.remove(v.group);
        this.visuals.delete(id);
      }
    }
  }

  /** Draw an interpolated frame. `alpha` is the fraction into the current tick. */
  render(alpha: number, dt: number, pointer?: { x: number; y: number; w: number; h: number }): void {
    this.cameraCtl.update(dt, pointer);

    for (const v of this.visuals.values()) {
      v.group.position.x = v.prevX + (v.curX - v.prevX) * alpha;
      v.group.position.z = v.prevZ + (v.curZ - v.prevZ) * alpha;
      v.group.rotation.y = lerpAngle(v.prevRot, v.curRot, alpha);
    }

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
