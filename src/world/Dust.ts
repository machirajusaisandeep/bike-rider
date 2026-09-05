import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';

const VERT = /* glsl */ `
attribute float aLife;
attribute float aSize;
varying float vLife;
uniform float uPixelRatio;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * (1.0 + (1.0 - aLife) * 1.5) * uPixelRatio * (220.0 / max(1.0, -mv.z));
}`;

const FRAG = /* glsl */ `
varying float vLife;
uniform vec3 uColor;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  float a = smoothstep(0.5, 0.05, d) * vLife * 0.35;
  gl_FragColor = vec4(uColor, a);
}`;

/** Lightweight dust/gravel spray kicked up behind the rear wheel. */
export class Dust {
  readonly points: Points;
  private readonly count = 120;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private next = 0;
  private geo: BufferGeometry;
  private mat: ShaderMaterial;
  private emitAcc = 0;

  constructor(pixelRatio: number) {
    this.pos = new Float32Array(this.count * 3);
    this.vel = new Float32Array(this.count * 3);
    this.life = new Float32Array(this.count);
    this.size = new Float32Array(this.count).fill(8);
    this.geo = new BufferGeometry();
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aLife', new BufferAttribute(this.life, 1));
    this.geo.setAttribute('aSize', new BufferAttribute(this.size, 1));
    this.mat = new ShaderMaterial({
      uniforms: { uColor: { value: new Color(0xb9a98c) }, uPixelRatio: { value: pixelRatio } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  setColor(hex: number): void {
    (this.mat.uniforms.uColor!.value as Color).setHex(hex);
  }

  setPixelRatio(pr: number): void {
    this.mat.uniforms.uPixelRatio!.value = pr;
  }

  /**
   * @param origin rear tyre contact point (world)
   * @param back   unit vector pointing backwards from the bike
   * @param rate   particles per second
   */
  update(dt: number, origin: Vector3, back: Vector3, speed: number, rate: number): void {
    this.emitAcc += rate * dt;
    while (this.emitAcc >= 1) {
      this.emitAcc -= 1;
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      this.pos[i * 3] = origin.x + (Math.random() - 0.5) * 0.25;
      this.pos[i * 3 + 1] = origin.y + 0.05;
      this.pos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.25;
      const spread = 0.8;
      this.vel[i * 3] = back.x * speed * 0.25 + (Math.random() - 0.5) * spread;
      this.vel[i * 3 + 1] = 0.8 + Math.random() * 1.4;
      this.vel[i * 3 + 2] = back.z * speed * 0.25 + (Math.random() - 0.5) * spread;
      this.life[i] = 1;
      this.size[i] = 6 + Math.random() * 8;
    }
    for (let i = 0; i < this.count; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i] = Math.max(0, this.life[i]! - dt * 1.4);
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1]! - 1.2 * dt;
      this.pos[i * 3] = this.pos[i * 3]! + this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1] = Math.max(0.02, this.pos[i * 3 + 1]! + this.vel[i * 3 + 1]! * dt);
      this.pos[i * 3 + 2] = this.pos[i * 3 + 2]! + this.vel[i * 3 + 2]! * dt;
    }
    (this.geo.attributes.position as BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aLife as BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as BufferAttribute).needsUpdate = true;
  }
}
