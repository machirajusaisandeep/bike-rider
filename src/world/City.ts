import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PointLight,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { HeightField } from './heights';
import { seededRandom } from './roadPath';
import type { SceneDef } from './scenes';
import { facadeTexture } from './textures';

const TILE = 40;
const TILES_BEHIND = 2;
const TILES_AHEAD = 12;
const BUILDINGS_PER_TILE = 10;
const LAMPS_PER_TILE = 2;

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);
const _c = new Color();

/** Bengaluru ring-road blocks: instanced towers with lit windows, lampposts, footpath kerbs. */
export class City {
  readonly group = new Group();
  private buildings: InstancedMesh;
  private lamps: InstancedMesh;
  private lampHeads: InstancedMesh;
  private kerbs: InstancedMesh;
  private facadeMat: MeshStandardMaterial;
  private lampMat: MeshStandardMaterial;
  private tileCount = TILES_BEHIND + TILES_AHEAD + 1;
  private slots = new Map<number, number>();
  private free: number[] = [];
  private lastIndex = NaN;
  private nearLights: PointLight[] = [];

  constructor(
    private hf: HeightField,
    private def: SceneDef,
  ) {
    for (let s = 0; s < this.tileCount; s++) this.free.push(s);
    this.facadeMat = new MeshStandardMaterial({
      map: facadeTexture(false),
      emissiveMap: facadeTexture(true),
      emissive: new Color(0xffffff),
      emissiveIntensity: 0,
      roughness: 0.55,
      metalness: 0.2,
    });
    const box = new BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    this.buildings = new InstancedMesh(box, this.facadeMat, BUILDINGS_PER_TILE * this.tileCount);
    this.buildings.castShadow = true;
    this.buildings.receiveShadow = true;
    this.buildings.frustumCulled = false;

    const pole = new CylinderGeometry(0.06, 0.09, 9, 8);
    pole.translate(0, 4.5, 0);
    this.lamps = new InstancedMesh(
      pole,
      new MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6, metalness: 0.6 }),
      LAMPS_PER_TILE * this.tileCount,
    );
    this.lampMat = new MeshStandardMaterial({
      color: 0xfff1c8,
      emissive: new Color(0xffd9a0),
      emissiveIntensity: 0,
      roughness: 0.4,
    });
    const head = new SphereGeometry(0.28, 10, 8);
    head.scale(1.6, 0.6, 1);
    head.translate(1.2, 9, 0);
    this.lampHeads = new InstancedMesh(head, this.lampMat, LAMPS_PER_TILE * this.tileCount);
    const kerb = new BoxGeometry(2.4, 0.25, TILE);
    kerb.translate(0, 0.125, -TILE / 2);
    this.kerbs = new InstancedMesh(
      kerb,
      new MeshStandardMaterial({ color: 0x9a968c, roughness: 0.95 }),
      2 * this.tileCount,
    );
    this.kerbs.receiveShadow = true;
    for (const im of [this.buildings, this.lamps, this.lampHeads, this.kerbs]) {
      im.frustumCulled = false;
      _m.makeScale(0, 0, 0);
      for (let i = 0; i < im.count; i++) im.setMatrixAt(i, _m);
      this.group.add(im);
    }
    // A handful of real point lights near the rider for the lamps to pool light at night.
    for (let i = 0; i < 6; i++) {
      const l = new PointLight(0xffd9a0, 0, 26, 1.8);
      l.visible = false;
      this.nearLights.push(l);
      this.group.add(l);
    }
  }

  setNight(night: boolean, dusk: boolean): void {
    this.facadeMat.emissiveIntensity = night ? 1.6 : dusk ? 0.9 : 0;
    this.lampMat.emissiveIntensity = night ? 4 : dusk ? 2 : 0;
    const on = night || dusk;
    this.nearLights.forEach((l) => {
      l.visible = on;
      l.intensity = night ? 60 : 25;
    });
  }

  update(bikeZ: number): void {
    const idx = Math.floor(-bikeZ / TILE);
    if (idx !== this.lastIndex) {
      this.lastIndex = idx;
      const first = idx - TILES_BEHIND;
      const last = idx + TILES_AHEAD;
      for (const [k, slot] of this.slots) {
        if (k < first || k > last) {
          this.slots.delete(k);
          this.free.push(slot);
        }
      }
      for (let k = first; k <= last; k++) {
        if (this.slots.has(k)) continue;
        const slot = this.free.pop();
        if (slot === undefined) break;
        this.slots.set(k, slot);
        this.fill(k, slot);
      }
      for (const im of [this.buildings, this.lamps, this.lampHeads, this.kerbs]) {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    }
    // Move the pooled lights to the nearest lampposts ahead.
    const path = this.hf.path;
    const edge = path.width / 2 + path.shoulder;
    for (let i = 0; i < this.nearLights.length; i++) {
      const z =
        -Math.floor(-bikeZ / (TILE / LAMPS_PER_TILE)) * (TILE / LAMPS_PER_TILE) -
        (i >> 1) * (TILE / LAMPS_PER_TILE) +
        10;
      const side = i % 2 === 0 ? -1 : 1;
      const x = path.centerX(z) + side * (edge + 0.6) + side * -1.2;
      this.nearLights[i]!.position.set(x, this.hf.height(x, z) + 8.6, z);
    }
  }

  private fill(k: number, slot: number): void {
    const rnd = seededRandom(k * 977 + 5);
    const path = this.hf.path;
    const edge = path.width / 2 + path.shoulder;
    const z0 = -k * TILE;
    const city = this.def.city!;
    // Buildings in rows on both sides
    for (let i = 0; i < BUILDINGS_PER_TILE; i++) {
      const id = slot * BUILDINGS_PER_TILE + i;
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2) % city.rows;
      const depth = 10 + rnd() * 8;
      const width = 9 + rnd() * 12;
      const setback = edge + 7 + row * 24 + rnd() * 4;
      const z =
        z0 -
        (Math.floor(i / (2 * city.rows)) + rnd()) *
          (TILE / Math.max(1, Math.floor(BUILDINGS_PER_TILE / (2 * city.rows))));
      const x = path.centerX(z) + side * (setback + depth / 2);
      const floors =
        city.minFloors + Math.floor(Math.pow(rnd(), 1.6) * (city.maxFloors - city.minFloors));
      const h = floors * 3.2;
      const y = this.hf.height(x, z) - 0.3;
      _p.set(x, y, z);
      _q.setFromAxisAngle(_up, path.heading(z) + (rnd() - 0.5) * 0.06);
      _s.set(width, h, depth);
      this.buildings.setMatrixAt(id, _m.compose(_p, _q, _s));
      const glass = rnd() < 0.35;
      _c.setHSL(glass ? 0.55 : 0.08, glass ? 0.25 : 0.12, glass ? 0.55 : 0.55 + rnd() * 0.3);
      this.buildings.setColorAt(id, _c);
    }
    // Lampposts alternate sides, arms over the road
    for (let i = 0; i < LAMPS_PER_TILE; i++) {
      const id = slot * LAMPS_PER_TILE + i;
      const z = z0 - (i + 0.5) * (TILE / LAMPS_PER_TILE);
      const side = (k + i) % 2 === 0 ? -1 : 1;
      const x = path.centerX(z) + side * (edge + 0.6);
      _p.set(x, this.hf.height(x, z), z);
      _q.setFromAxisAngle(_up, path.heading(z) + (side === 1 ? Math.PI : 0));
      _s.set(1, 1, 1);
      this.lamps.setMatrixAt(id, _m.compose(_p, _q, _s));
      this.lampHeads.setMatrixAt(id, _m);
    }
    // Kerbs
    for (let i = 0; i < 2; i++) {
      const id = slot * 2 + i;
      const side = i === 0 ? -1 : 1;
      const x = path.centerX(z0 - TILE / 2) + side * (edge + 1.2);
      _p.set(x, this.hf.height(x, z0 - TILE / 2), z0);
      _q.setFromAxisAngle(_up, path.heading(z0 - TILE / 2));
      _s.set(1, 1, 1.02);
      this.kerbs.setMatrixAt(id, _m.compose(_p, _q, _s));
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.facadeMat.map?.dispose();
    this.facadeMat.emissiveMap?.dispose();
    this.facadeMat.dispose();
    this.lampMat.dispose();
  }
}
