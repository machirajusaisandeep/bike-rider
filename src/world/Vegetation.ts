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
/** Contour tea rows: row pitch and hedge segment length. */
const TEA_ROW = 1.6;
const TEA_SEG = 8.5;
const TEA_SEGS_PER_ROW = Math.ceil(TILE / TEA_SEG);

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
  /** tea rows: which rows are planted (others are estate paths) and the row step for quality */
  teaRows?: number[];
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
      let perTile = Math.max(1, Math.round(layer.perTile * qs));
      let teaRows: number[] | undefined;
      if (layer.type === 'tea') {
        // Continuous hedges: every row from minDist to maxDist, skipping every 6th as a path.
        // Lower quality thins to every other row rather than leaving gaps in a row.
        const rows = Math.max(1, Math.floor((layer.maxDist - layer.minDist) / TEA_ROW));
        const step = qs >= 0.9 ? 1 : 2;
        teaRows = [];
        for (let r = 0; r < rows; r += step) if (r % 6 !== 5) teaRows.push(r);
        const sides = layer.side ? 1 : 2;
        perTile = teaRows.length * sides * TEA_SEGS_PER_ROW;
      }
      const built = buildGeometry(layer.type, layer.tint);
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
      this.layers.push({ layer, perTile, mesh, tint: built.tint, teaRows });
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
    const water = this.def.water;
    for (let li = 0; li < this.layers.length; li++) {
      const L = this.layers[li]!;
      const rnd = seededRandom(k * 131 + li * 7 + 1);
      const layer = L.layer;
      const isTea = layer.type === 'tea';
      const evenly = layer.type === 'railing';
      for (let i = 0; i < L.perTile; i++) {
        const id = slot * L.perTile + i;
        let placed = false;
        // a few attempts to satisfy the height/slope constraints
        for (let attempt = 0; attempt < (isTea || evenly ? 1 : 3) && !placed; attempt++) {
          let z: number;
          let lat: number;
          if (isTea) {
            const rows = L.teaRows!;
            const seg = i % TEA_SEGS_PER_ROW;
            const rowIdx = Math.floor(i / TEA_SEGS_PER_ROW) % rows.length;
            const sideIdx = Math.floor(i / (TEA_SEGS_PER_ROW * rows.length));
            const side = layer.side ?? (sideIdx === 0 ? -1 : 1);
            lat = side * (edge + layer.minDist + rows[rowIdx]! * TEA_ROW + (rnd() - 0.5) * 0.25);
            z = z0 - (seg + 0.5) * TEA_SEG + (rnd() - 0.5) * 0.4;
          } else if (evenly) {
            const side = layer.side ?? -1;
            lat = side * (edge + layer.minDist + rnd() * (layer.maxDist - layer.minDist));
            z = z0 - (i + 0.5) * (TILE / L.perTile);
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
          // nothing grows on the beach strip or in the sea
          if (water && h < water.level + 3) continue;
          if (layer.maxSlope !== undefined && this.hf.slope(x, z) > layer.maxSlope) continue;
          const sc = layer.scale ? layer.scale[0] + rnd() * (layer.scale[1] - layer.scale[0]) : 1;
          const sink =
            layer.type === 'rock' || layer.type === 'boulder'
              ? 0.35
              : layer.type === 'tea'
                ? 0.12
                : 0.18;
          _p.set(x, h - sink * sc, z);
          // Aligned props are built with X along the road and +Z as their front, so a quarter
          // turn lines them up and the extra half turn makes right-hand-side ones face the road.
          const along = path.heading(z) + Math.PI / 2;
          const yaw =
            isTea || evenly
              ? along
              : layer.align
                ? along + (rnd() - 0.5) * 0.2 + (lat > 0 ? Math.PI : 0)
                : rnd() * Math.PI * 2;
          _q.setFromAxisAngle(_up, yaw);
          if (isTea) _s.set(sc * (0.95 + rnd() * 0.1), sc * (0.85 + rnd() * 0.3), sc);
          else _s.set(sc, sc * (0.9 + rnd() * 0.2), sc);
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

const box = (
  w: number,
  h: number,
  d: number,
  hex: number,
  x: number,
  y: number,
  z: number,
  variance = 0.06,
): BufferGeometry => place(colorize(new BoxGeometry(w, h, d), hex, variance), x, y, z);

/** mergeGeometries needs every part indexed or every part non-indexed; normalise to non-indexed. */
function merge(parts: BufferGeometry[]): BufferGeometry {
  const flat = parts.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.deleteAttribute('uv');
    return ng;
  });
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

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function buildGeometry(type: VegType, tintMode?: VegLayer['tint']): Built {
  const tintFor = (fallback: Built['tint']) =>
    tintMode === 'none' ? undefined : tintMode === 'dry' ? dryTint() : fallback;
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
        tint: tintFor(greenTint(0.03, 0.08)),
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
        tint: tintFor(greenTint(0.02, 0.06)),
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
        tint: tintFor(greenTint(0.02, 0.05)),
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
        tint: tintFor(greenTint(0.02, 0.06)),
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
        tint: tintFor(greenTint(0.02, 0.06)),
      };
    }
    case 'tea': {
      // One pruned hedge segment: an elongated lumpy blob with a flat plucking table on top.
      const g = new IcosahedronGeometry(1, 1);
      const pos = g.attributes.position!;
      for (let i = 0; i < pos.count; i++) {
        const k = 0.9 + Math.random() * 0.2;
        const y = pos.getY(i);
        pos.setXYZ(i, pos.getX(i) * k * (TEA_SEG / 2 + 0.3), Math.min(y * 0.55, 0.42) * k, pos.getZ(i) * k * 0.62);
      }
      g.computeVertexNormals();
      g.translate(0, 0.4, 0);
      return {
        geometry: colorize(g, 0x4f8a2a, 0.22),
        material: stdMat({ flatShading: true }),
        castShadow: false,
        tint: tintFor(greenTint(0.03, 0.08)),
      };
    }
    case 'shrub':
    case 'scrub':
    case 'grass': {
      const dry = type === 'scrub' || tintMode === 'dry';
      const tex = grassBillboardTexture(type !== 'grass', dry);
      const size = type === 'grass' ? 1.1 : type === 'scrub' ? 1.3 : 1.6;
      const a = new PlaneGeometry(size, size);
      a.translate(0, size / 2, 0);
      const b = a.clone().rotateY(Math.PI / 2);
      const c = a.clone().rotateY(Math.PI / 4);
      const d = a.clone().rotateY(-Math.PI / 4);
      const geo = mergeGeometries([a, b, c, d], false)!;
      const mat = new MeshStandardMaterial({
        map: tex,
        alphaTest: 0.45,
        side: DoubleSide,
        roughness: 1,
        metalness: 0,
        color: 0xffffff,
      });
      return {
        geometry: geo,
        material: mat,
        castShadow: false,
        tint: dry ? dryTint() : tintFor(greenTint(0.02, 0.12)),
      };
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
      // Ladakhi chorten: rubble plinth, stepped whitewashed base, dome, spire, gold finial,
      // a ring of mani stones and a strand of flags off the spire.
      const parts = [
        place(colorize(new BoxGeometry(3.2, 0.35, 3.2), 0x8a7f70, 0.2), 0, 0.17, 0),
        place(colorize(new BoxGeometry(2.2, 0.5, 2.2), 0xe6e1d6, 0.06), 0, 0.6, 0),
        place(colorize(new BoxGeometry(1.7, 0.5, 1.7), 0xeae5da, 0.06), 0, 1.1, 0),
        place(colorize(new BoxGeometry(1.3, 0.5, 1.3), 0xeeeae2, 0.06), 0, 1.6, 0),
        place(colorize(new SphereGeometry(0.75, 12, 8), 0xf2efe8, 0.04), 0, 2.45, 0),
        place(colorize(new BoxGeometry(0.7, 0.4, 0.7), 0xb03a2a), 0, 3.3, 0),
        place(colorize(new ConeGeometry(0.34, 1.6, 8), 0xd6a53a), 0, 4.25, 0),
        place(colorize(new SphereGeometry(0.16, 8, 6), 0xd6a53a), 0, 5.15, 0),
      ];
      // weather stain band at the foot of the whitewash
      parts.push(place(colorize(new BoxGeometry(2.24, 0.12, 2.24), 0xb9ad9a, 0.1), 0, 0.41, 0));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        parts.push(
          place(
            colorize(new DodecahedronGeometry(0.2, 0), pick([0xd9d3c6, 0x9a8f80, 0xb84a3a])),
            Math.cos(a) * 1.75,
            0.42,
            Math.sin(a) * 1.75,
          ),
        );
      }
      return { geometry: merge(parts), material: stdMat({ roughness: 0.8 }), castShadow: true };
    }
    case 'flags': {
      // Two poles with a sagging line of lungta flags in the five element colours.
      const cols = [0x2a5fd8, 0xf0efe8, 0xd83b3b, 0x2f9a4a, 0xf2c200];
      const span = 5.5;
      const parts = [
        place(colorize(new CylinderGeometry(0.04, 0.06, 2.8, 6), 0x6b5a48, 0.2), -span / 2, 1.4, 0),
        place(colorize(new CylinderGeometry(0.04, 0.06, 2.6, 6), 0x6b5a48, 0.2), span / 2, 1.3, 0),
      ];
      const n = 14;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = -span / 2 + t * span;
        const sag = 0.55 * Math.sin(t * Math.PI);
        const y = 2.65 - sag - 0.14;
        const flag = colorize(new PlaneGeometry(0.28, 0.24), cols[i % cols.length]!, 0.15);
        flag.rotateY((Math.random() - 0.5) * 0.7);
        flag.rotateZ((Math.random() - 0.5) * 0.4);
        flag.translate(x, y, (Math.random() - 0.5) * 0.08);
        parts.push(flag);
      }
      // the line itself
      parts.push(place(colorize(new BoxGeometry(span, 0.015, 0.015), 0x3a3028), 0, 2.5, 0));
      return {
        geometry: merge(parts),
        material: stdMat({ roughness: 0.9, side: DoubleSide }),
        castShadow: false,
      };
    }
    case 'mani': {
      // Mani wall: long low rubble wall topped with carved slate slabs.
      const parts = [box(3.4, 0.9, 1.0, 0x8b8072, 0.25, 0, 0.45, 0)];
      for (let i = 0; i < 9; i++) {
        const slab = colorize(new BoxGeometry(0.42, 0.34, 0.05), pick([0x5a5651, 0x6b655c, 0x4c4a48]), 0.15);
        slab.rotateX(-0.25 + Math.random() * 0.2);
        slab.rotateY((Math.random() - 0.5) * 0.4);
        slab.translate(-1.5 + i * 0.37, 1.05, (Math.random() - 0.5) * 0.5);
        parts.push(slab);
      }
      for (let i = 0; i < 4; i++) {
        parts.push(
          place(
            colorize(new DodecahedronGeometry(0.16, 0), pick([0xf0ece4, 0xc94a3a, 0xd9d3c6])),
            -1.4 + Math.random() * 2.8,
            0.98,
            (Math.random() - 0.5) * 0.6,
          ),
        );
      }
      return { geometry: merge(parts), material: stdMat({ roughness: 0.95 }), castShadow: true };
    }
    case 'shack': {
      // Cliff cafe: painted walls, sloping palm-thatch roof on posts, open front with a counter.
      const wall = pick([0xd9a24a, 0xe4c98a, 0x7fb0c8, 0xd87a5a]);
      const parts = [
        box(6, 2.6, 4.2, wall, 0, 1.3, 0, 0.1),
        place(colorize(new BoxGeometry(6.8, 0.25, 5.2), 0x7a6242, 0.25), 0, 2.75, 0, 1, 0.12),
        place(colorize(new BoxGeometry(0.16, 2.6, 0.16), 0x5a4630), 2.9, 1.3, 2.4),
        place(colorize(new BoxGeometry(0.16, 2.6, 0.16), 0x5a4630), -2.9, 1.3, 2.4),
        place(colorize(new BoxGeometry(6.4, 0.16, 2.2), 0x8e7355, 0.15), 0, 2.55, 3.2, 1, 0.2),
        box(1.2, 1.4, 0.1, 0x2c3a4a, 1.2, 1.3, 2.12, 0),
        box(1.2, 1.4, 0.1, 0x2c3a4a, -1.4, 1.3, 2.12, 0),
        box(2.6, 0.9, 0.6, 0x5a4630, -1.2, 0.45, 3.4, 0.1), // counter
        box(0.9, 0.06, 0.9, 0xf0efe8, 2.0, 0.75, 3.6, 0), // plastic table
        box(0.06, 0.75, 0.06, 0xf0efe8, 2.0, 0.37, 3.6, 0),
        // signboard
        box(2.2, 0.5, 0.05, pick([0xf2c200, 0xf0efe8, 0x2a9ad8]), 0, 2.35, 2.14, 0.02),
      ];
      return { geometry: merge(parts), material: stdMat({ roughness: 0.85 }), castShadow: true };
    }
    case 'stall': {
      // Roadside chai / coconut stall: tarp on four bamboo poles, counter, stacked goods.
      const tarp = pick([0x2a5fd8, 0xe0652a, 0x2f7d4a]);
      const parts = [
        box(2.8, 0.06, 2.2, tarp, 0, 2.15, 0, 0.08),
        box(0.06, 2.15, 0.06, 0xb9a072, -1.3, 1.07, -1.0, 0.1),
        box(0.06, 2.15, 0.06, 0xb9a072, 1.3, 1.07, -1.0, 0.1),
        box(0.06, 1.95, 0.06, 0xb9a072, -1.3, 0.97, 1.0, 0.1),
        box(0.06, 1.95, 0.06, 0xb9a072, 1.3, 0.97, 1.0, 0.1),
        box(2.4, 0.8, 0.7, 0x6b5238, 0, 0.4, 0.5, 0.15), // counter
        box(0.5, 0.35, 0.35, 0xd8d8d0, -0.7, 0.98, 0.5, 0.05), // kettle / vessel
        box(0.5, 0.25, 0.4, 0xd83b3b, 0.5, 0.92, 0.55, 0.05), // biscuit tins
        place(colorize(new SphereGeometry(0.42, 7, 5), 0x6f9a3a, 0.2), 0.9, 0.42, -0.5), // coconut pile
        place(colorize(new SphereGeometry(0.3, 6, 5), 0x8a9a3a, 0.2), 1.25, 0.3, -0.1),
        box(0.06, 0.9, 0.06, 0x5a4630, 0, 0.45, -0.9, 0), // chair
      ];
      return { geometry: merge(parts), material: stdMat({ roughness: 0.9 }), castShadow: true };
    }
    case 'hut': {
      // Estate worker house: plastered block, corrugated roof with an overhang, door, window.
      const wall = pick([0xd9c39a, 0x9fc4d8, 0xe0a6b5, 0xf0e6d2, 0xb6c9a2]);
      const roof = pick([0x8a8f96, 0x9a5a42, 0x6a6e73]);
      const parts = [
        box(4.6, 2.7, 3.8, wall, 0, 1.35, 0, 0.08),
        box(0.3, 4.6, 0.3, 0x7a6a58, 0, 0.15, 0, 0.1), // plinth
        place(colorize(new BoxGeometry(5.4, 0.12, 4.6), roof, 0.15), 0, 2.95, 0, 1, 0.16),
        box(0.9, 1.9, 0.08, 0x3a2a1e, 0.9, 0.95, 1.94, 0.05),
        box(0.9, 0.9, 0.08, 0x223344, -1.2, 1.55, 1.94, 0.05),
        box(1.0, 0.06, 1.0, 0x1f6f8b, 1.6, 3.15, -0.6, 0), // rooftop water tank base colour
        place(colorize(new CylinderGeometry(0.45, 0.45, 0.7, 10), 0x1a1a1a), 1.6, 3.5, -0.6),
        box(0.16, 0.9, 0.16, 0x6a6a6a, -1.8, 3.4, -1.4, 0), // TV antenna pole
      ];
      return { geometry: merge(parts), material: stdMat({ roughness: 0.9 }), castShadow: true };
    }
    case 'railing': {
      // White cliff-edge railing, 8 m: posts every 2 m with two rails.
      const parts: BufferGeometry[] = [];
      for (let i = 0; i <= 4; i++) parts.push(box(0.09, 1.05, 0.09, 0xe8e6df, -4 + i * 2, 0.52, 0, 0.05));
      parts.push(box(8, 0.06, 0.06, 0xe8e6df, 0, 1.0, 0, 0.05));
      parts.push(box(8, 0.06, 0.06, 0xe8e6df, 0, 0.55, 0, 0.05));
      return { geometry: merge(parts), material: stdMat({ roughness: 0.6 }), castShadow: true };
    }
    case 'busstop': {
      // BMTC shelter: blue roof on two steel posts, back panel, bench, route board.
      const parts = [
        box(4.2, 0.12, 1.8, 0x1c4f9c, 0, 2.6, 0, 0.05),
        box(0.1, 2.6, 0.1, 0x3a3d40, -1.9, 1.3, 0.7, 0),
        box(0.1, 2.6, 0.1, 0x3a3d40, 1.9, 1.3, 0.7, 0),
        box(4.0, 1.4, 0.06, 0x8fa4b8, 0, 1.7, -0.85, 0.05),
        box(4.0, 0.06, 0.45, 0x9a968c, 0, 0.5, -0.5, 0.05),
        box(0.08, 0.5, 0.4, 0x3a3d40, -1.7, 0.25, -0.5, 0),
        box(0.08, 0.5, 0.4, 0x3a3d40, 1.7, 0.25, -0.5, 0),
        box(1.4, 0.5, 0.05, 0xf2c200, 0, 2.3, 0.92, 0.02), // ad / route board
        box(2.4, 0.9, 0.04, 0xd83b3b, 0.6, 1.5, -0.83, 0.02), // poster
      ];
      return { geometry: merge(parts), material: stdMat({ roughness: 0.7 }), castShadow: true };
    }
    case 'barricade': {
      // Road-works barricade: orange/white striped boards on two A-frame legs.
      const parts: BufferGeometry[] = [];
      const w = 1.6;
      const n = 6;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (i + 0.5) * (w / n);
        parts.push(box(w / n, 0.3, 0.04, i % 2 === 0 ? 0xe0652a : 0xf0efe8, x, 0.85, 0, 0.03));
        parts.push(box(w / n, 0.3, 0.04, i % 2 === 0 ? 0xf0efe8 : 0xe0652a, x, 0.45, 0, 0.03));
      }
      for (const sx of [-1, 1]) {
        parts.push(box(0.06, 1.1, 0.06, 0x2a2a2a, sx * 0.75, 0.55, 0.22, 0));
        parts.push(box(0.06, 1.1, 0.06, 0x2a2a2a, sx * 0.75, 0.55, -0.22, 0));
      }
      return { geometry: merge(parts), material: stdMat({ roughness: 0.8 }), castShadow: true };
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

/** Ochre / grey-green tints for high-desert scrub. */
function dryTint() {
  return (rnd: () => number) =>
    _c.setHSL(0.1 + (rnd() - 0.5) * 0.06, 0.25 + (rnd() - 0.5) * 0.2, 0.42 + (rnd() - 0.5) * 0.18);
}
