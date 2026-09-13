import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';

const MAX = 120;
const QUAD = 6; // two triangles

/**
 * Recycled asphalt skid marks under the rear tyre. Hidden on Low by the caller (rate = 0).
 */
export class Skids {
  readonly mesh: Mesh;
  private pos: Float32Array;
  private alpha: Float32Array;
  private life: Float32Array;
  private next = 0;
  private acc = 0;
  private geo: BufferGeometry;
  private last = new Vector3();
  private hasLast = false;

  constructor() {
    this.pos = new Float32Array(MAX * QUAD * 3);
    this.alpha = new Float32Array(MAX * QUAD);
    this.life = new Float32Array(MAX);
    this.geo = new BufferGeometry();
    const pa = new BufferAttribute(this.pos, 3);
    pa.setUsage(DynamicDrawUsage);
    const aa = new BufferAttribute(this.alpha, 1);
    aa.setUsage(DynamicDrawUsage);
    this.geo.setAttribute('position', pa);
    this.geo.setAttribute('aAlpha', aa);
    const mat = new MeshBasicMaterial({
      color: 0x1a1a1a,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float aAlpha;\nvarying float vA;',
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = aAlpha;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vA;')
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          'vec4 diffuseColor = vec4( diffuse, opacity * vA );',
        );
    };
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  clear(): void {
    this.life.fill(0);
    this.alpha.fill(0);
    this.hasLast = false;
    (this.geo.attributes.aAlpha as BufferAttribute).needsUpdate = true;
  }

  /**
   * @param origin rear contact
   * @param right  unit right of the bike
   * @param rate   marks per second; 0 = just age existing
   */
  update(dt: number, origin: Vector3, right: Vector3, rate: number): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      const a = Math.max(0, this.life[i]! / 2.4);
      const o = i * QUAD;
      for (let k = 0; k < QUAD; k++) this.alpha[o + k] = a;
    }
    if (rate > 0) {
      this.acc += dt * rate;
      while (this.acc >= 1) {
        this.acc -= 1;
        this.stamp(origin, right);
      }
    } else this.hasLast = false;
    (this.geo.attributes.position as BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aAlpha as BufferAttribute).needsUpdate = true;
  }

  private stamp(origin: Vector3, right: Vector3): void {
    const w = 0.09;
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.life[i] = 2.4;
    const prev = this.hasLast ? this.last : origin;
    const ax = prev.x - right.x * w;
    const az = prev.z - right.z * w;
    const bx = prev.x + right.x * w;
    const bz = prev.z + right.z * w;
    const cx = origin.x - right.x * w;
    const cz = origin.z - right.z * w;
    const dx = origin.x + right.x * w;
    const dz = origin.z + right.z * w;
    const y = origin.y + 0.025;
    const o = i * QUAD * 3;
    const set = (k: number, x: number, z: number) => {
      this.pos[o + k * 3] = x;
      this.pos[o + k * 3 + 1] = y;
      this.pos[o + k * 3 + 2] = z;
    };
    set(0, ax, az);
    set(1, bx, bz);
    set(2, dx, dz);
    set(3, ax, az);
    set(4, dx, dz);
    set(5, cx, cz);
    this.last.copy(origin);
    this.hasLast = true;
  }
}
