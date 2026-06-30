import * as THREE from "three";

/**
 * Lightweight pooled GPU particle system: soft round points with per-particle
 * position, velocity, colour, size, and alpha. Used for dust, sparks, and
 * confetti. One pool wraps a ring buffer so spawning never allocates.
 */

const VERT = /* glsl */ `
attribute vec3 pcolor;
attribute float psize;
attribute float palpha;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = pcolor;
  vAlpha = palpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, psize * uScale / max(0.5, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = dot(c, c);
  if (d > 0.25) discard;
  gl_FragColor = vec4(vColor, vAlpha * (1.0 - d * 4.0));
}`;

export class ParticleFX {
  readonly points: THREE.Points;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly siz: Float32Array;
  private readonly alp: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private cursor = 0;

  constructor(
    private readonly n: number,
    blending: THREE.Blending,
    private readonly gravity: number,
    pixelRatio: number,
  ) {
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.siz = new Float32Array(n);
    this.alp = new Float32Array(n);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("pcolor", new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute("psize", new THREE.BufferAttribute(this.siz, 1));
    this.geo.setAttribute("palpha", new THREE.BufferAttribute(this.alp, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending,
      uniforms: { uScale: { value: 520 * pixelRatio } },
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    size: number, r: number, g: number, b: number, life: number,
  ): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.siz[i] = size;
    this.alp[i] = 1;
    this.life[i] = life;
    this.maxLife[i] = life;
  }

  /** Radial burst of `count` particles from a point. */
  burst(
    x: number, y: number, z: number,
    count: number, spread: number, up: number,
    size: number, r: number, g: number, b: number, life: number,
  ): void {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * spread;
      this.spawn(
        x, y, z,
        Math.cos(a) * sp, up * (0.4 + Math.random()), Math.sin(a) * sp,
        size * (0.6 + Math.random() * 0.7), r, g, b, life * (0.6 + Math.random() * 0.6),
      );
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.gravity * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alp[i] = this.life[i] > 0 ? this.life[i] / this.maxLife[i] : 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.palpha.needsUpdate = true;
    this.geo.attributes.pcolor.needsUpdate = true;
    this.geo.attributes.psize.needsUpdate = true;
  }
}
