import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  MeshStandardMaterial,
  PointLight,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { colorize, merge, place, stdMat } from './geo';
import type { HeightField } from './heights';
import { seededRandom } from './roadPath';
import type { SceneDef } from './scenes';
import { concreteTexture, facadeTexture } from './textures';
import { METRO_PIER_Z } from './trafficDefs';
import { buildVehicle, type VehicleKind } from './vehicles';

const TILE = 40;
const TILES_BEHIND = 2;
const TILES_AHEAD = 12;
const BUILDINGS_PER_TILE = 10;
const LAMPS_PER_TILE = 2;
const KERBS_PER_TILE = 4;
const WALL_SEG = 8;
const WALLS_PER_TILE = (TILE / WALL_SEG) * 2;
const ROOF_PER_TILE = BUILDINGS_PER_TILE * 2;
const DECKS_PER_TILE = 2;
const PARKED_KINDS: VehicleKind[] = ['hatch', 'auto', 'bike'];
const PARKED_PER_TILE = 2;
export const METRO_DECK_Y = 10.6;

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);
const _c = new Color();
const _hidden = new Matrix4().makeScale(0, 0, 0);

/**
 * Bengaluru ring-road blocks: glass tech parks and plastered apartment blocks with rooftop
 * clutter, compound walls, kerbs and footpaths, lampposts, parked vehicles on the service road
 * and the Namma Metro viaduct marching down the median.
 */
export class City {
  readonly group = new Group();
  private glass: InstancedMesh;
  private flats: InstancedMesh;
  private roof: InstancedMesh;
  private walls: InstancedMesh;
  private lamps: InstancedMesh;
  private lampHeads: InstancedMesh;
  private kerbs: InstancedMesh;
  private decks: InstancedMesh | null = null;
  private caps: InstancedMesh | null = null;
  private parked: InstancedMesh[] = [];
  private glassMat: MeshStandardMaterial;
  private flatsMat: MeshStandardMaterial;
  private lampMat: MeshStandardMaterial;
  private tileCount = TILES_BEHIND + TILES_AHEAD + 1;
  private slots = new Map<number, number>();
  private free: number[] = [];
  private lastIndex = NaN;
  private nearLights: PointLight[] = [];
  private all: InstancedMesh[] = [];
  private disposables: { dispose(): void }[] = [];

  constructor(
    private hf: HeightField,
    private def: SceneDef,
  ) {
    for (let s = 0; s < this.tileCount; s++) this.free.push(s);
    const mkFacade = (style: 'glass' | 'flats') => {
      const map = facadeTexture(false, style);
      const em = facadeTexture(true, style);
      const mat = new MeshStandardMaterial({
        map,
        emissiveMap: em,
        emissive: new Color(0xffffff),
        emissiveIntensity: 0,
        roughness: style === 'glass' ? 0.35 : 0.9,
        metalness: style === 'glass' ? 0.35 : 0.0,
      });
      this.disposables.push(map, em, mat);
      return mat;
    };
    this.glassMat = mkFacade('glass');
    this.flatsMat = mkFacade('flats');
    const box = new BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    this.glass = this.instanced(box, this.glassMat, BUILDINGS_PER_TILE, true, true);
    this.flats = this.instanced(box, this.flatsMat, BUILDINGS_PER_TILE, true, true);

    // rooftop clutter: lift room + black water tank
    const roofGeo = merge([
      place(colorize(new BoxGeometry(1, 1, 1), 0xb9b0a0, 0.15), 0, 0.5, 0),
      place(colorize(new CylinderGeometry(0.55, 0.55, 0.9, 10), 0x141414, 0.05), 1.2, 0.45, 0.4),
      place(colorize(new BoxGeometry(0.08, 1.6, 0.08), 0x555555), -0.7, 0.8, -0.6),
    ]);
    const roofMat = stdMat({ roughness: 0.9 });
    this.roof = this.instanced(roofGeo, roofMat, ROOF_PER_TILE, true, false);
    this.disposables.push(roofGeo, roofMat);

    // compound walls
    const wallGeo = new BoxGeometry(WALL_SEG, 1.9, 0.3);
    wallGeo.translate(0, 0.95, 0);
    const wallMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
    this.walls = this.instanced(wallGeo, wallMat, WALLS_PER_TILE, true, true);
    this.disposables.push(wallGeo, wallMat);

    const pole = new CylinderGeometry(0.06, 0.09, 9, 8);
    pole.translate(0, 4.5, 0);
    const poleMat = new MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6, metalness: 0.6 });
    this.lamps = this.instanced(pole, poleMat, LAMPS_PER_TILE, false, false);
    this.lampMat = new MeshStandardMaterial({
      color: 0xfff1c8,
      emissive: new Color(0xffd9a0),
      emissiveIntensity: 0,
      roughness: 0.4,
    });
    const head = new SphereGeometry(0.28, 10, 8);
    head.scale(1.6, 0.6, 1);
    head.translate(1.2, 9, 0);
    this.lampHeads = this.instanced(head, this.lampMat, LAMPS_PER_TILE, false, false);
    this.disposables.push(pole, poleMat, head, this.lampMat);

    const kerb = new BoxGeometry(2.4, 0.25, TILE);
    kerb.translate(0, 0.125, -TILE / 2);
    const kerbMat = new MeshStandardMaterial({ color: 0x9a968c, roughness: 0.95 });
    this.kerbs = this.instanced(kerb, kerbMat, KERBS_PER_TILE, false, true);
    this.disposables.push(kerb, kerbMat);

    if (def.city?.metro) {
      const concrete = concreteTexture();
      const conMat = new MeshStandardMaterial({ map: concrete, roughness: 0.9 });
      // U-girder deck with parapets, 20 m long, sitting on the pier caps
      const deckGeo = mergeBoxes([
        [9.0, 1.4, 20, 0, 0.7, 0],
        [0.35, 1.2, 20, -4.3, 2.0, 0],
        [0.35, 1.2, 20, 4.3, 2.0, 0],
      ]);
      this.decks = this.instanced(deckGeo, conMat, DECKS_PER_TILE, true, true);
      const capGeo = mergeBoxes([[8.6, 0.9, 2.4, 0, -0.45, 0]]);
      this.caps = this.instanced(capGeo, conMat, DECKS_PER_TILE, true, false);
      this.disposables.push(concrete, conMat, deckGeo, capGeo);
    }

    // parked vehicles on the service roads
    const paint = seededRandom(0x5eed);
    for (const kind of PARKED_KINDS) {
      const geo = buildVehicle(kind, paint, def.id);
      const mat = stdMat({ roughness: 0.6, metalness: 0.15 });
      this.parked.push(this.instanced(geo, mat, PARKED_PER_TILE, true, false));
      this.disposables.push(geo, mat);
    }

    // A handful of real point lights near the rider for the lamps to pool light at night.
    for (let i = 0; i < 6; i++) {
      const l = new PointLight(0xffd9a0, 0, 26, 1.8);
      l.visible = false;
      this.nearLights.push(l);
      this.group.add(l);
    }
  }

  private instanced(
    geo: BufferGeometry,
    mat: Material,
    perTile: number,
    cast: boolean,
    receive: boolean,
  ): InstancedMesh {
    const im = new InstancedMesh(geo, mat, perTile * this.tileCount);
    im.castShadow = cast;
    im.receiveShadow = receive;
    im.frustumCulled = false;
    for (let i = 0; i < im.count; i++) im.setMatrixAt(i, _hidden);
    this.group.add(im);
    this.all.push(im);
    return im;
  }

  setNight(night: boolean, dusk: boolean): void {
    this.glassMat.emissiveIntensity = night ? 1.6 : dusk ? 0.9 : 0;
    this.flatsMat.emissiveIntensity = night ? 1.3 : dusk ? 0.7 : 0;
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
      for (const im of this.all) {
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
    // beyond the kerb (2.4 m) and the service road (6.4 m) and the footpath (1.4 m)
    const frontage = edge + 2.4 + 6.4 + 1.4;

    // --- buildings in rows on both sides; glass towers favour the front row --------------
    for (let i = 0; i < BUILDINGS_PER_TILE; i++) {
      const id = slot * BUILDINGS_PER_TILE + i;
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2) % city.rows;
      const depth = 10 + rnd() * 8;
      const width = 9 + rnd() * 12;
      const setback = frontage + 2 + row * 24 + rnd() * 4;
      const z =
        z0 -
        (Math.floor(i / (2 * city.rows)) + rnd()) *
          (TILE / Math.max(1, Math.floor(BUILDINGS_PER_TILE / (2 * city.rows))));
      const x = path.centerX(z) + side * (setback + depth / 2);
      const glass = rnd() < (row === 0 ? 0.5 : 0.25);
      const floors = glass
        ? Math.max(6, city.minFloors + Math.floor(Math.pow(rnd(), 1.2) * (city.maxFloors - city.minFloors)))
        : city.minFloors + Math.floor(Math.pow(rnd(), 1.9) * (city.maxFloors - city.minFloors) * 0.7);
      const h = floors * 3.2;
      const y = this.hf.height(x, z) - 0.3;
      _p.set(x, y, z);
      _q.setFromAxisAngle(_up, path.heading(z) + (rnd() - 0.5) * 0.06);
      _s.set(width, h, depth);
      const target = glass ? this.glass : this.flats;
      const other = glass ? this.flats : this.glass;
      target.setMatrixAt(id, _m.compose(_p, _q, _s));
      other.setMatrixAt(id, _hidden);
      if (glass) _c.setHSL(0.55 + (rnd() - 0.5) * 0.08, 0.2 + rnd() * 0.2, 0.5 + rnd() * 0.15);
      else _c.setHSL(0.06 + rnd() * 0.08, 0.15 + rnd() * 0.25, 0.55 + rnd() * 0.3);
      target.setColorAt(id, _c);
      // rooftop clutter: two spots per building, mostly on the flats
      for (let r = 0; r < 2; r++) {
        const rid = slot * ROOF_PER_TILE + i * 2 + r;
        if (glass && r === 1) {
          this.roof.setMatrixAt(rid, _hidden);
          continue;
        }
        const rs = 1.4 + rnd() * 1.6;
        _p.set(
          x + (rnd() - 0.5) * (width - 4),
          y + h + 0.3,
          z + (rnd() - 0.5) * (depth - 4),
        );
        _s.set(rs, rs * (0.8 + rnd() * 0.6), rs);
        this.roof.setMatrixAt(rid, _m.compose(_p, _q, _s));
      }
    }

    // --- compound walls along the frontage, with gate gaps -------------------------------
    for (let i = 0; i < WALLS_PER_TILE; i++) {
      const id = slot * WALLS_PER_TILE + i;
      const side = i % 2 === 0 ? -1 : 1;
      const seg = Math.floor(i / 2);
      const z = z0 - (seg + 0.5) * WALL_SEG;
      if (rnd() < 0.22) {
        this.walls.setMatrixAt(id, _hidden);
        continue;
      }
      const x = path.centerX(z) + side * (frontage + 0.4);
      _p.set(x, this.hf.height(x, z) - 0.1, z);
      _q.setFromAxisAngle(_up, path.heading(z));
      _s.set(1, 0.8 + rnd() * 0.5, 1);
      this.walls.setMatrixAt(id, _m.compose(_p, _q, _s));
      _c.setHSL(0.08 + rnd() * 0.06, 0.1 + rnd() * 0.2, 0.45 + rnd() * 0.35);
      this.walls.setColorAt(id, _c);
    }

    // --- lampposts alternate sides, arms over the road ------------------------------------
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

    // --- kerbs: main-road kerb and the footpath beyond the service road -------------------
    for (let i = 0; i < KERBS_PER_TILE; i++) {
      const id = slot * KERBS_PER_TILE + i;
      const side = i % 2 === 0 ? -1 : 1;
      const outer = i >= 2;
      const off = outer ? edge + 2.4 + 6.4 + 0.7 : edge + 1.2;
      const zc = z0 - TILE / 2;
      const x = path.centerX(zc) + side * off;
      _p.set(x, this.hf.height(x, zc), z0);
      _q.setFromAxisAngle(_up, path.heading(zc));
      _s.set(outer ? 0.58 : 1, outer ? 0.8 : 1, 1.02);
      this.kerbs.setMatrixAt(id, _m.compose(_p, _q, _s));
    }

    // --- metro viaduct on the median (piers themselves are collidable hazards) ------------
    if (this.decks && this.caps) {
      for (let i = 0; i < DECKS_PER_TILE; i++) {
        const id = slot * DECKS_PER_TILE + i;
        if (k < 1) {
          this.decks.setMatrixAt(id, _hidden);
          this.caps.setMatrixAt(id, _hidden);
          continue;
        }
        const zc = z0 - METRO_PIER_Z[i]!;
        const x = path.centerX(zc);
        const y = path.elevation(zc) + METRO_DECK_Y;
        _q.setFromAxisAngle(_up, path.heading(zc));
        _s.set(1, 1, 1);
        _p.set(x, y, zc);
        this.decks.setMatrixAt(id, _m.compose(_p, _q, _s));
        this.caps.setMatrixAt(id, _m);
      }
    }

    // --- parked vehicles on the service roads --------------------------------------------
    for (let pk = 0; pk < this.parked.length; pk++) {
      const im = this.parked[pk]!;
      for (let i = 0; i < PARKED_PER_TILE; i++) {
        const id = slot * PARKED_PER_TILE + i;
        if (rnd() < 0.45) {
          im.setMatrixAt(id, _hidden);
          continue;
        }
        const side = rnd() < 0.5 ? -1 : 1;
        const z = z0 - rnd() * TILE;
        const x = path.centerX(z) + side * (edge + 2.4 + 6.4 - 1.3);
        _p.set(x, this.hf.height(x, z) + 0.03, z);
        _q.setFromAxisAngle(_up, path.heading(z) + (side === 1 ? Math.PI : 0) + (rnd() - 0.5) * 0.12);
        _s.set(1, 1, 1);
        im.setMatrixAt(id, _m.compose(_p, _q, _s));
      }
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.disposables.forEach((d) => d.dispose());
  }
}

/** Merge axis-aligned boxes [w, h, d, x, y, z] into one geometry with box UVs kept. */
function mergeBoxes(spec: [number, number, number, number, number, number][]): BufferGeometry {
  const parts = spec.map(([w, h, d, x, y, z]) => {
    const g = new BoxGeometry(w, h, d);
    g.translate(x, y, z);
    // scale UVs so the concrete texture tiles by metres rather than stretching
    const uv = g.attributes.uv as BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (Math.max(w, d) / 2.5), uv.getY(i) * (h / 2.5));
    return g.toNonIndexed();
  });
  const out = merge(parts);
  return out;
}
