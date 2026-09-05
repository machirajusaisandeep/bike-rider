import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import type { HeightField } from './heights';
import { clamp, fbm, smoothstep } from './noise';
import type { SceneDef } from './scenes';

interface Chunk {
  mesh: Mesh;
  ix: number;
  iz: number;
  level: 0 | 1;
}

const NEAR_SIZE = 160;
const NEAR_RES = 64;
const NEAR_RX = 2; // chunks each side in x
const NEAR_BEHIND = 1;
const NEAR_AHEAD = 4;
const FAR_SIZE = 640;
const FAR_RES = 40;
const FAR_R = 3;

/**
 * Two-level recycled heightfield: detailed chunks around the rider and coarse chunks out to the
 * horizon. Vertex colours carry the biome (grass / tea / rock / snow / sand).
 */
export class Terrain {
  readonly group = new Group();
  private near = new Map<string, Chunk>();
  private far = new Map<string, Chunk>();
  private nearPool: Chunk[] = [];
  private farPool: Chunk[] = [];
  private mat: MeshStandardMaterial;
  private cols: Record<'low' | 'mid' | 'high' | 'cliff' | 'snow' | 'sand', Color>;
  private lastKey = '';

  constructor(
    private hf: HeightField,
    private def: SceneDef,
  ) {
    this.mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    const p = def.terrain.palette;
    this.cols = {
      low: new Color(p.low),
      mid: new Color(p.mid),
      high: new Color(p.high),
      cliff: new Color(p.cliff),
      snow: new Color(p.snow ?? '#eef1f4'),
      sand: new Color(p.sand ?? p.low),
    };
    const nearCount = (NEAR_RX * 2 + 1) * (NEAR_BEHIND + NEAR_AHEAD + 1);
    for (let i = 0; i < nearCount; i++) this.nearPool.push(this.makeChunk(NEAR_RES, 0));
    const farCount = (FAR_R * 2 + 1) * (FAR_R * 2 + 1);
    for (let i = 0; i < farCount; i++) this.farPool.push(this.makeChunk(FAR_RES, 1));
  }

  private makeChunk(res: number, level: 0 | 1): Chunk {
    const n = (res + 1) * (res + 1);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(n * 3), 3));
    const idx: number[] = [];
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const a = j * (res + 1) + i;
        const b = a + 1;
        const c = a + res + 1;
        const d = c + 1;
        // counter-clockwise seen from above (+Y): a -> b (+x) -> c (-z)
        idx.push(a, b, c, b, d, c);
      }
    }
    geo.setIndex(idx);
    const mesh = new Mesh(geo, this.mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = true;
    mesh.visible = false;
    this.group.add(mesh);
    return { mesh, ix: NaN, iz: NaN, level };
  }

  update(bikePos: Vector3): void {
    const nx = Math.floor(bikePos.x / NEAR_SIZE);
    const nz = Math.floor(-bikePos.z / NEAR_SIZE);
    const fx = Math.floor(bikePos.x / FAR_SIZE);
    const fz = Math.floor(-bikePos.z / FAR_SIZE);
    const key = `${nx},${nz},${fx},${fz}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.recycle(
      this.near,
      this.nearPool,
      NEAR_SIZE,
      NEAR_RES,
      nx - NEAR_RX,
      nx + NEAR_RX,
      nz - NEAR_BEHIND,
      nz + NEAR_AHEAD,
      0,
    );
    this.recycle(
      this.far,
      this.farPool,
      FAR_SIZE,
      FAR_RES,
      fx - FAR_R,
      fx + FAR_R,
      fz - FAR_R,
      fz + FAR_R,
      1,
      {
        x0: (nx - NEAR_RX) * NEAR_SIZE,
        x1: (nx + NEAR_RX + 1) * NEAR_SIZE,
        z0: (nz - NEAR_BEHIND) * NEAR_SIZE,
        z1: (nz + NEAR_AHEAD + 1) * NEAR_SIZE,
      },
    );
  }

  private recycle(
    live: Map<string, Chunk>,
    pool: Chunk[],
    size: number,
    res: number,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    level: 0 | 1,
    skipInside?: { x0: number; x1: number; z0: number; z1: number },
  ): void {
    for (const [k, c] of live) {
      if (c.ix < x0 || c.ix > x1 || c.iz < z0 || c.iz > z1) {
        live.delete(k);
        c.mesh.visible = false;
        pool.push(c);
      }
    }
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        const k = `${ix},${iz}`;
        if (live.has(k)) continue;
        if (skipInside) {
          // far chunk fully hidden under the near grid -> skip
          const cx0 = ix * size;
          const cx1 = cx0 + size;
          const cz0 = iz * size;
          const cz1 = cz0 + size;
          if (
            cx0 >= skipInside.x0 &&
            cx1 <= skipInside.x1 &&
            cz0 >= skipInside.z0 &&
            cz1 <= skipInside.z1
          )
            continue;
        }
        const c = pool.pop();
        if (!c) return;
        this.build(c, ix, iz, size, res, level);
        live.set(k, c);
      }
    }
  }

  private build(c: Chunk, ix: number, iz: number, size: number, res: number, level: 0 | 1): void {
    c.ix = ix;
    c.iz = iz;
    const geo = c.mesh.geometry;
    const pos = geo.attributes.position as BufferAttribute;
    const col = geo.attributes.color as BufferAttribute;
    const x0 = ix * size;
    const z0 = -iz * size; // iz grows towards -Z
    const step = size / res;
    const t = this.def.terrain;
    const water = this.def.water;
    const yOff = level === 1 ? -1.6 : 0; // far level tucks under the near level
    const c0 = new Color();
    let k = 0;
    for (let j = 0; j <= res; j++) {
      for (let i = 0; i <= res; i++) {
        const x = x0 + i * step;
        const z = z0 - j * step;
        const h = this.hf.height(x, z);
        pos.setXYZ(k, x, h + yOff, z);
        // colour by height band, slope and a little noise
        const e = level === 1 ? 6 : 2;
        const sx = (this.hf.height(x + e, z) - this.hf.height(x - e, z)) / (2 * e);
        const sz = (this.hf.height(x, z + e) - this.hf.height(x, z - e)) / (2 * e);
        const slope = Math.hypot(sx, sz);
        const n = fbm(x * 0.02, z * 0.02, { octaves: 2, seed: 99 }) * 0.5 + 0.5;
        const rel = h - this.hf.path.elevation(z);
        const band = clamp((rel + 20) / 120 + n * 0.25, 0, 1);
        c0.copy(this.cols.low).lerp(this.cols.mid, smoothstep(0.15, 0.5, band));
        c0.lerp(this.cols.high, smoothstep(0.5, 0.95, band));
        const cliff = smoothstep(t.cliffSlope * 0.7, t.cliffSlope * 1.3, slope);
        c0.lerp(this.cols.cliff, cliff);
        if (t.snowLine !== undefined) {
          const snow = smoothstep(t.snowLine, t.snowLine + 60 + n * 40, h) * (1 - cliff * 0.7);
          c0.lerp(this.cols.snow, snow);
        }
        if (water) {
          const sand = smoothstep(water.level + 10, water.level - 2, h);
          c0.lerp(this.cols.sand, sand);
        }
        // micro variation: broad patches plus fine speckle so featureless slopes still read depth
        const fine = fbm(x * 0.13, z * 0.13, { octaves: 2, seed: 7 }) * 0.5 + 0.5;
        const v = (0.9 + n * 0.16) * (0.9 + fine * 0.2);
        col.setXYZ(k, c0.r * v, c0.g * v, c0.b * v);
        k++;
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    c.mesh.visible = true;
  }

  dispose(): void {
    for (const c of [
      ...this.near.values(),
      ...this.far.values(),
      ...this.nearPool,
      ...this.farPool,
    ])
      c.mesh.geometry.dispose();
    this.mat.dispose();
    this.group.removeFromParent();
  }
}
