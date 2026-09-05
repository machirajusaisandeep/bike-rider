import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Material,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Quality } from '../core/settings';
import type { HeightField } from './heights';
import { seededRandom } from './roadPath';
import type { SceneDef, VegLayer, VegType } from './scenes';
import { grassBillboardTexture } from './textures';

const TILE = 40;
const TILES_BEHIND = 2;
const TILES_AHEAD = 14;

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);
const _c = new Color();

const QUALITY_SCALE: Record<Quality, number> = { low: 0.4, medium: 0.7, high: 1 };

interface LayerRuntime {
  layer: VegLayer;
  perTile: number;
  mesh: InstancedMesh;
  /** whether to tint instances */
  tint?: (rnd: () => number) => Color;
}

/**
 * Biome vegetation and roadside props as InstancedMeshes. Each 40 m tile owns a fixed slot range
 * per layer; tiles are re-seeded deterministically as the rider moves so the world is stable.
 */
export class Vegetation {
  readonly group = new Group();
  private layers: LayerRuntime[] = [];
  private tileCount = TILES_BEHIND + TILES_AHEAD + 1;
  private lastIndex = NaN;
  private slots = new Map<number, number>(); // tile index -> slot
  private freeSlots: number[] = [];
  private geometries: BufferGeometry[] = [];
  private materials: Material[] = [];

  constructor(
    private hf: HeightField,
    private def: SceneDef,
    quality: Quality,
  ) {
    const qs = QUALITY_SCALE[quality];
    for (let s = 0; s < this.tileCount; s++) this.freeSlots.push(s);
    for (const layer of def.vegetation) {
      const perTile = Math.max(1, Math.round(layer.perTile * qs));
      const built = buildGeometry(layer.type);
      const mesh = new InstancedMesh(built.geometry, built.material, perTile * this.tileCount);
      mesh.castShadow = built.castShadow;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.count = perTile * this.tileCount;
      // hide everything initially
      _m.makeScale(0, 0, 0);
      for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, _m);
      this.group.add(mesh);
      this.geometries.push(built.geometry);
      this.materials.push(built.material);
      this.layers.push({ layer, perTile, mesh, tint: built.tint });
    }
  }

  update(bikeZ: number): void {
    const idx = Math.floor(-bikeZ / TILE);
    if (idx === this.lastIndex) return;
    this.lastIndex = idx;
    const first = idx - TILES_BEHIND;
    const last = idx + TILES_AHEAD;
    for (const [k, slot] of this.slots) {
      if (k < first || k > last) {
        this.slots.delete(k);
        this.freeSlots.push(slot);
      }
    }
    for (let k = first; k <= last; k++) {
      if (this.slots.has(k)) continue;
      const slot = this.freeSlots.pop();
      if (slot === undefined) break;
      this.slots.set(k, slot);
      this.fillTile(k, slot);
    }
    for (const l of this.layers) {
      l.mesh.instanceMatrix.needsUpdate = true;
      if (l.mesh.instanceColor) l.mesh.instanceColor.needsUpdate = true;
    }
  }

  private fillTile(k: number, slot: number): void {
    const z0 = -k * TILE;
    const path = this.hf.path;
    const edge = path.width / 2 + path.shoulder;
    for (let li = 0; li < this.layers.length; li++) {
      const L = this.layers[li]!;
      const rnd = seededRandom(k * 131 + li * 7 + 1);
      const layer = L.layer;
      const isTea = layer.type === 'tea';
      for (let i = 0; i < L.perTile; i++) {
        const id = slot * L.perTile + i;
        let placed = false;
        // a few attempts to satisfy the height/slope constraints
        for (let attempt = 0; attempt < 3 && !placed; attempt++) {
          let z: number;
          let lat: number;
          if (isTea) {
            // contour rows: fixed lateral spacing, jittered along the row
            const rows = Math.max(1, Math.floor((layer.maxDist - layer.minDist) / 1.6));
            const row = i % rows;
            const side = (Math.floor(i / rows) % 2 === 0 ? 1 : -1) * (layer.side ?? 1);
            lat = side * (layer.minDist + row * 1.6 + rnd() * 0.3);
            z = z0 - rnd() * TILE;
          } else {
            const side = layer.side ?? (rnd() < 0.5 ? -1 : 1);
            const dist = layer.minDist + Math.pow(rnd(), 0.8) * (layer.maxDist - layer.minDist);
            lat = side * (edge + dist);
            z = z0 - rnd() * TILE;
          }
          const x = path.centerX(z) + lat;
          const h = this.hf.height(x, z);
          if (layer.minHeight !== undefined && h < layer.minHeight) continue;
          if (layer.maxHeight !== undefined && h > layer.maxHeight) continue;
          if (this.def.water && h < this.def.water.level + 1.5) continue;
          if (layer.maxSlope !== undefined && this.hf.slope(x, z) > layer.maxSlope) continue;
          const sc = layer.scale ? layer.scale[0] + rnd() * (layer.scale[1] - layer.scale[0]) : 1;
          const sink = layer.type === 'rock' || layer.type === 'boulder' ? 0.35 : 0.18;
          _p.set(x, h - sink * sc, z);
          const yaw =
            layer.type === 'shack' || layer.type === 'stupa'
              ? path.heading(z) + (rnd() - 0.5) * 0.2
              : rnd() * Math.PI * 2;
          _q.setFromAxisAngle(_up, yaw);
          _s.set(sc, sc * (0.9 + rnd() * 0.2), sc);
          L.mesh.setMatrixAt(id, _m.compose(_p, _q, _s));
          if (L.tint) L.mesh.setColorAt(id, L.tint(rnd));
          placed = true;
        }
        if (!placed) L.mesh.setMatrixAt(id, _m.makeScale(0, 0, 0));
      }
    }
  }

  dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.group.removeFromParent();
  }
}

// ---------------------------------------------------------------------------------------------
// Geometry builders: each returns ONE merged geometry with vertex colours + one material.
// ---------------------------------------------------------------------------------------------

interface Built {
  geometry: BufferGeometry;
  material: Material;
  castShadow: boolean;
  tint?: (rnd: () => number) => Color;
}

function colorize(geo: BufferGeometry, hex: number | string, variance = 0): BufferGeometry {
  const c = new Color(hex);
  const n = geo.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = 1 + (Math.random() - 0.5) * variance;
    arr[i * 3] = c.r * v;
    arr[i * 3 + 1] = c.g * v;
    arr[i * 3 + 2] = c.b * v;
  }
  geo.setAttribute(
    'color',
    new (Object.getPrototypeOf(geo.attributes.position!).constructor)(arr, 3),
  );
  return geo;
}

function place(
  geo: BufferGeometry,
  x: number,
  y: number,
  z: number,
  s = 1,
  rx = 0,
  ry = 0,
  rz = 0,
): BufferGeometry {
  geo.scale(s, s, s);
  geo.rotateX(rx);
  geo.rotateY(ry);
  geo.rotateZ(rz);
  geo.translate(x, y, z);
  return geo;
}

/** mergeGeometries needs every part indexed or every part non-indexed; normalise to non-indexed. */
function merge(parts: BufferGeometry[]): BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = mergeGeometries(flat, false);
  if (!out) throw new Error('Vegetation: geometry merge failed');
  out.computeBoundingSphere();
  return out;
}

function stdMat(extra: Partial<MeshStandardMaterial> = {}): MeshStandardMaterial {
  return new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, ...extra });
}

function canopyBlob(
  r: number,
  hex: number,
  x: number,
  y: number,
  z: number,
  squash = 0.8,
): BufferGeometry {
  const g = new IcosahedronGeometry(r, 1);
  // roughen
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.85 + Math.random() * 0.3;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * squash, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return place(colorize(g, hex, 0.25), x, y, z);
}

function buildGeometry(type: VegType): Built {
  switch (type) {
    case 'broadleaf': {
      const trunk = place(
        colorize(new CylinderGeometry(0.18, 0.32, 4.2, 7), 0x4b3a2a, 0.2),
        0,
        2.1,
        0,
      );
      const parts = [trunk];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        parts.push(
          canopyBlob(
            1.9 + Math.random() * 0.6,
            0x2f6b25,
            Math.cos(a) * 1.4,
            5.2 + Math.random() * 0.8,
            Math.sin(a) * 1.4,
            0.75,
          ),
        );
      }
      parts.push(canopyBlob(2.2, 0x3a7a2c, 0, 6.6, 0, 0.7));
      return {
        geometry: merge(parts),
        material: stdMat({ flatShading: true }),
        castShadow: true,
        tint: greenTint(0.03, 0.08),
      };
    }
    case 'raintree': {
      const trunk = place(
        colorize(new CylinderGeometry(0.25, 0.45, 5, 8), 0x5a4a3a, 0.2),
        0,
        2.5,
        0,
      );
      const parts = [trunk];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        parts.push(
          canopyBlob(
            3.2,
            0x4a7f30,
            Math.cos(a) * 3.6,
            7 + Math.random() * 0.6,
            Math.sin(a) * 3.6,
            0.45,
          ),
        );
      }
      parts.push(canopyBlob(3.6, 0x527f34, 0, 7.6, 0, 0.45));
      return {
        geometry: merge(parts),
        material: stdMat({ flatShading: true }),
        castShadow: true,
        tint: greenTint(0.02, 0.06),
      };
    }
    case 'pine': {
      const trunk = place(
        colorize(new CylinderGeometry(0.12, 0.28, 5, 7), 0x4a3526, 0.2),
        0,
        2.5,
        0,
      );
      const parts = [trunk];
      for (let i = 0; i < 4; i++) {
        const r = 2.4 - i * 0.5;
        parts.push(
          place(colorize(new ConeGeometry(r, 2.6, 8), 0x2c5a2a, 0.2), 0, 3.6 + i * 1.5, 0),
        );
      }
      return {
        geometry: merge(parts),
        material: stdMat({ flatShading: true }),
        castShadow: true,
        tint: greenTint(0.02, 0.05),
      };
    }
    case 'eucalyptus': {
      const trunk = place(
        colorize(new CylinderGeometry(0.14, 0.3, 11, 7), 0xc9bfae, 0.25),
        0,
        5.5,
        0,
      );
      const parts = [
        trunk,
        place(
          colorize(new CylinderGeometry(0.08, 0.14, 4, 6), 0xbfb4a3, 0.2),
          0.7,
          9.5,
          0.3,
          1,
          0,
          0,
          -0.35,
        ),
      ];
      for (let i = 0; i < 4; i++) {
        parts.push(
          canopyBlob(
            1.4 + Math.random() * 0.5,
            0x6f9a4a,
            (Math.random() - 0.5) * 2.4,
            10.5 + Math.random() * 2,
            (Math.random() - 0.5) * 2.4,
            0.9,
          ),
        );
      }
      return {
        geometry: merge(parts),
        material: stdMat({ flatShading: true }),
        castShadow: true,
        tint: greenTint(0.02, 0.06),
      };
    }
    case 'palm': {
      const parts: BufferGeometry[] = [];
      // curved trunk from stacked segments
      const segs = 7;
      let x = 0;
      let y = 0;
      let lean = 0.12;
      for (let i = 0; i < segs; i++) {
        const h = 1.3;
        const seg = colorize(
          new CylinderGeometry(0.16 - i * 0.008, 0.19 - i * 0.008, h, 7),
          0x8a7455,
          0.3,
        );
        place(seg, x, y + h / 2, 0, 1, 0, 0, -lean);
        parts.push(seg);
        x += Math.sin(lean) * h;
        y += Math.cos(lean) * h;
        lean += 0.03;
      }
      // fronds: tapered flattened boxes drooping outward
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
        const frond = colorize(new ConeGeometry(0.55, 3.6, 4), 0x3f8a2e, 0.25);
        frond.scale(1, 1, 0.22);
        frond.rotateX(Math.PI / 2 + 0.35 + Math.random() * 0.25); // point outward and droop
        frond.rotateY(a);
        frond.translate(x + Math.cos(a) * 0.4, y + 0.2, Math.sin(a) * 0.4);
        parts.push(frond);
      }
      // coconuts
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2;
        parts.push(
          place(
            colorize(new SphereGeometry(0.14, 6, 5), 0x6f5a2a),
            x + Math.cos(a) * 0.3,
            y - 0.2,
            Math.sin(a) * 0.3,
          ),
        );
      }
      return {
        geometry: merge(parts),
        material: stdMat({ flatShading: true }),
        castShadow: true,
        tint: greenTint(0.02, 0.06),
      };
    }
    case 'tea': {
      const bush = colorize(new SphereGeometry(0.7, 7, 5), 0x4f8a2a, 0.22);
      bush.scale(1, 0.55, 1);
      bush.translate(0, 0.3, 0);
      return {
        geometry: bush,
        material: stdMat({ flatShading: true }),
        castShadow: false,
        tint: greenTint(0.04, 0.1),
      };
    }
    case 'shrub':
    case 'grass': {
      const tex = grassBillboardTexture(type === 'shrub');
      const size = type === 'shrub' ? 1.6 : 1.1;
      const a = new PlaneGeometry(size, size);
      a.translate(0, size / 2, 0);
      const b = a.clone().rotateY(Math.PI / 2);
      const c = a.clone().rotateY(Math.PI / 4);
      const d = a.clone().rotateY(-Math.PI / 4);
      const geo = merge([a, b, c, d]);
      const mat = new MeshStandardMaterial({
        map: tex,
        alphaTest: 0.45,
        side: DoubleSide,
        roughness: 1,
        metalness: 0,
        color: 0xffffff,
      });
      return { geometry: geo, material: mat, castShadow: false, tint: greenTint(0.02, 0.12) };
    }
    case 'rock': {
      const g = colorize(new DodecahedronGeometry(0.6, 0), 0x8b8680, 0.25);
      g.scale(1.2, 0.7, 1);
      g.translate(0, 0.25, 0);
      return {
        geometry: g,
        material: stdMat({ flatShading: true, roughness: 0.95 }),
        castShadow: true,
      };
    }
    case 'boulder': {
      const g = colorize(new DodecahedronGeometry(1.3, 1), 0x8a7a66, 0.3);
      const pos = g.attributes.position!;
      for (let i = 0; i < pos.count; i++) {
        const k = 0.8 + Math.random() * 0.4;
        pos.setXYZ(i, pos.getX(i) * k * 1.3, pos.getY(i) * k * 0.8, pos.getZ(i) * k);
      }
      g.computeVertexNormals();
      g.translate(0, 0.6, 0);
      return {
        geometry: g,
        material: stdMat({ flatShading: true, roughness: 0.95 }),
        castShadow: true,
      };
    }
    case 'stupa': {
      // Ladakhi chorten: stepped white base, dome, spire, gold finial
      const parts = [
        place(colorize(new BoxGeometry(2.2, 0.5, 2.2), 0xeeeae2), 0, 0.25, 0),
        place(colorize(new BoxGeometry(1.7, 0.5, 1.7), 0xeeeae2), 0, 0.75, 0),
        place(colorize(new BoxGeometry(1.3, 0.5, 1.3), 0xeeeae2), 0, 1.25, 0),
        place(colorize(new SphereGeometry(0.75, 12, 8), 0xf2efe8), 0, 2.1, 0),
        place(colorize(new BoxGeometry(0.7, 0.4, 0.7), 0xb03a2a), 0, 2.95, 0),
        place(colorize(new ConeGeometry(0.34, 1.6, 8), 0xd6a53a), 0, 3.9, 0),
        place(colorize(new SphereGeometry(0.16, 8, 6), 0xd6a53a), 0, 4.8, 0),
      ];
      return { geometry: merge(parts), material: stdMat({ roughness: 0.7 }), castShadow: true };
    }
    case 'shack': {
      // Cliff cafe: painted walls, thatched/tin sloping roof, posts
      const wall = 0xd9a24a + Math.floor(Math.random() * 3) * 0x101010;
      const parts = [
        place(colorize(new BoxGeometry(6, 2.6, 4.2), wall, 0.1), 0, 1.3, 0),
        place(colorize(new BoxGeometry(6.8, 0.25, 5.2), 0x6e5a3d, 0.2), 0, 2.75, 0, 1, 0.12),
        place(colorize(new BoxGeometry(0.16, 2.6, 0.16), 0x5a4630), 2.9, 1.3, 2.4),
        place(colorize(new BoxGeometry(0.16, 2.6, 0.16), 0x5a4630), -2.9, 1.3, 2.4),
        place(colorize(new BoxGeometry(6.4, 0.16, 2.2), 0x8e7355, 0.1), 0, 2.55, 3.2, 1, 0.2),
        place(colorize(new BoxGeometry(1.2, 1.4, 0.1), 0x2c3a4a), 1.2, 1.3, 2.12),
        place(colorize(new BoxGeometry(1.2, 1.4, 0.1), 0x2c3a4a), -1.4, 1.3, 2.12),
      ];
      return { geometry: merge(parts), material: stdMat({ roughness: 0.85 }), castShadow: true };
    }
  }
}

function greenTint(hueJitter: number, lightJitter: number) {
  return (rnd: () => number) =>
    _c.setHSL(
      0.28 + (rnd() - 0.5) * hueJitter * 2,
      0.45 + (rnd() - 0.5) * 0.2,
      0.45 + (rnd() - 0.5) * lightJitter * 2,
    );
}
