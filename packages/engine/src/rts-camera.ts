import * as THREE from "three";

/**
 * Classic RTS camera: looks down at a focus point on the ground from a fixed
 * pitch. Pans across the XZ plane (WASD / arrows / edge scroll), zooms with the
 * wheel, and rotates yaw with Q/E. Keeps gameplay readable — no free-fly.
 */
export class RtsCamera {
  readonly camera: THREE.PerspectiveCamera;

  /** Point on the ground the camera looks at. */
  private target = new THREE.Vector3(0, 0, 0);
  private yaw = 0;
  private readonly pitch = THREE.MathUtils.degToRad(55);
  private distance = 28;

  private readonly minDistance = 10;
  private readonly maxDistance = 70;
  private readonly panSpeed = 22; // world units / second at base zoom
  private readonly rotateSpeed = 1.6; // radians / second

  private readonly keys = new Set<string>();
  private readonly bounds = 60; // half-extent of the playable area
  private shakeAmt = 0;

  constructor(
    aspect: number,
    private readonly dom: HTMLElement,
  ) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 2000);
    this.attach();
    this.apply();
  }

  private attach(): void {
    window.addEventListener("keydown", (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    this.dom.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const factor = Math.exp(e.deltaY * 0.001);
        this.distance = THREE.MathUtils.clamp(
          this.distance * factor,
          this.minDistance,
          this.maxDistance,
        );
        this.apply();
      },
      { passive: false },
    );
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Recenter the camera's focus on a world ground point. */
  focusOn(x: number, z: number): void {
    this.target.x = THREE.MathUtils.clamp(x, -this.bounds, this.bounds);
    this.target.z = THREE.MathUtils.clamp(z, -this.bounds, this.bounds);
    this.apply();
  }

  /** Current ground point the camera is looking at. */
  get focusX(): number {
    return this.target.x;
  }
  get focusZ(): number {
    return this.target.z;
  }

  /** Kick a transient camera shake (e.g. a lightning strike). */
  shake(amount: number): void {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  /** Advance camera from input. Call once per rendered frame. */
  update(dt: number, pointer?: { x: number; y: number; w: number; h: number }): void {
    let fx = 0;
    let fz = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) fz -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) fz += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) fx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) fx += 1;

    // Edge scrolling when the pointer hugs a screen border.
    if (pointer) {
      const m = 24;
      if (pointer.x < m) fx -= 1;
      else if (pointer.x > pointer.w - m) fx += 1;
      if (pointer.y < m) fz -= 1;
      else if (pointer.y > pointer.h - m) fz += 1;
    }

    if (this.keys.has("q")) this.yaw -= this.rotateSpeed * dt;
    if (this.keys.has("e")) this.yaw += this.rotateSpeed * dt;

    // Decaying camera shake (e.g. from a lightning strike).
    if (this.shakeAmt > 0.001) {
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 3);
    }

    if (fx !== 0 || fz !== 0) {
      const len = Math.hypot(fx, fz) || 1;
      fx /= len;
      fz /= len;
      // Pan along the camera's own ground axes, scaled by zoom so it feels
      // consistent. forward = (-sin, -cos), right = (cos, -sin); fz<0 is forward
      // (W) and fx>0 is right (D). Deriving from these keeps pan correct at
      // every yaw (the previous formula inverted near ±90°).
      const speed = this.panSpeed * (this.distance / 28) * dt;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      this.target.x += (fx * cos + fz * sin) * speed;
      this.target.z += (fz * cos - fx * sin) * speed;
      this.target.x = THREE.MathUtils.clamp(this.target.x, -this.bounds, this.bounds);
      this.target.z = THREE.MathUtils.clamp(this.target.z, -this.bounds, this.bounds);
    }

    this.apply();
  }

  /** Recompute camera position from target / yaw / pitch / distance. */
  private apply(): void {
    const horiz = Math.cos(this.pitch) * this.distance;
    const vert = Math.sin(this.pitch) * this.distance;
    const offX = Math.sin(this.yaw) * horiz;
    const offZ = Math.cos(this.yaw) * horiz;
    const sh = this.shakeAmt;
    this.camera.position.set(
      this.target.x + offX + (sh > 0 ? (Math.random() - 0.5) * sh : 0),
      this.target.y + vert + (sh > 0 ? (Math.random() - 0.5) * sh : 0),
      this.target.z + offZ + (sh > 0 ? (Math.random() - 0.5) * sh : 0),
    );
    this.camera.lookAt(this.target);
  }
}
