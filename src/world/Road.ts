import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { ROAD } from '../core/config';
import { roadCenterX, roadSlope, seededRandom } from './roadPath';
import { asphaltTexture, gravelTexture, signTexture } from './textures';

const SEGMENTS = 12;
const TREES_PER_TILE = 7;
const ROCKS_PER_TILE = 4;
const POSTS_PER_TILE = 2;

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);
const _c = new Color();

interface Tile {
  index: number;
  slot: number;
  asphalt: Mesh;
  gravel: Mesh;
  sign: Object3D;
}

/**
 * Endless road: a fixed pool of tiles is recycled ahead of the rider. Roadside props live in
 * InstancedMeshes, each tile owning a fixed range of instance slots.
 */
export class Road {
  readonly group = new Group();
  private tiles = new Map<number, Tile>();
  private pool: Tile[] = [];
  private asphaltMat: MeshStandardMaterial;
  private gravelMat: MeshStandardMaterial;
  private crowns: InstancedMesh;
  private trunks: InstancedMesh;
  private rocks: InstancedMesh;
  private posts: InstancedMesh;
  private currentIndex = Number.NaN;
  private signLabels = ['RIDGE TRAIL', 'SCRAM PASS', 'KM 411', 'DUST VALLEY', 'HIGH LINE'];
  private signMats: MeshStandardMaterial[];

  constructor() {
    const asphaltTex = asphaltTexture();
    const gravelTex = gravelTexture();
    this.asphaltMat = new MeshStandardMaterial({ map: asphaltTex, roughness: 0.92, metalness: 0 });
    this.gravelMat = new MeshStandardMaterial({ map: gravelTex, roughness: 1, metalness: 0 });
    this.signMats = this.signLabels.map(
      (l) => new MeshStandardMaterial({ map: signTexture(l), roughness: 0.6, metalness: 0.1 }),
    );

    const total = ROAD.tileCount;
    this.crowns = new InstancedMesh(
      new ConeGeometry(1, 1, 7),
      new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
      total * TREES_PER_TILE,
    );
    this.trunks = new InstancedMesh(
      new CylinderGeometry(0.12, 0.18, 1, 6),
      new MeshStandardMaterial({ color: 0x4a3526, roughness: 0.95 }),
      total * TREES_PER_TILE,
    );
    this.rocks = new InstancedMesh(
      new DodecahedronGeometry(1, 0),
      new MeshStandardMaterial({ color: 0x8b8680, roughness: 0.95, flatShading: true }),
      total * ROCKS_PER_TILE,
    );
    this.posts = new InstancedMesh(
      new BoxGeometry(0.12, 1, 0.12),
      new MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.7 }),
      total * POSTS_PER_TILE,
    );
    for (const im of [this.crowns, this.trunks, this.rocks, this.posts]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.group.add(im);
    }

    for (let slot = 0; slot < total; slot++) this.pool.push(this.createTile(slot));
  }

  private createTile(slot: number): Tile {
    const mk = (mat: MeshStandardMaterial, y: number) => {
      const geo = new BufferGeometry();
      const verts = (SEGMENTS + 1) * 2;
      geo.setAttribute('position', new BufferAttribute(new Float32Array(verts * 3), 3));
      geo.setAttribute('normal', new BufferAttribute(new Float32Array(verts * 3), 3));
      geo.setAttribute('uv', new BufferAttribute(new Float32Array(verts * 2), 2));
      const idx: number[] = [];
      for (let i = 0; i < SEGMENTS; i++) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      geo.setIndex(idx);
      const mesh = new Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.position.y = y;
      this.group.add(mesh);
      return mesh;
    };
    const asphalt = mk(this.asphaltMat, 0.02);
    const gravel = mk(this.gravelMat, 0.008);

    // Sign: post + board (one per tile, hidden unless the tile wants one)
    const sign = new Group();
    const post = new Mesh(
      new CylinderGeometry(0.05, 0.05, 2.6, 8),
      new MeshStandardMaterial({ color: 0x2a2a2a }),
    );
    post.position.y = 1.3;
    post.castShadow = true;
    const board = new Mesh(
      new BoxGeometry(2.2, 1.1, 0.06),
      this.signMats[slot % this.signMats.length]!,
    );
    board.position.y = 2.6;
    board.castShadow = true;
    sign.add(post, board);
    sign.visible = false;
    this.group.add(sign);

    return { index: -1, slot, asphalt, gravel, sign };
  }

  /** Recycle tiles so the pool is centred slightly ahead of the rider. */
  update(bikeZ: number): void {
    const L = ROAD.tileLength;
    const idx = Math.floor(-bikeZ / L);
    if (idx === this.currentIndex) return;
    this.currentIndex = idx;
    const behind = 3;
    const first = idx - behind;
    const last = first + ROAD.tileCount - 1;
    // Release tiles out of range
    for (const [k, tile] of this.tiles) {
      if (k < first || k > last) {
        this.tiles.delete(k);
        this.pool.push(tile);
      }
    }
    for (let k = first; k <= last; k++) {
      if (this.tiles.has(k)) continue;
      const tile = this.pool.pop();
      if (!tile) break;
      this.buildTile(tile, k);
      this.tiles.set(k, tile);
    }
    this.crowns.instanceMatrix.needsUpdate = true;
    this.trunks.instanceMatrix.needsUpdate = true;
    this.rocks.instanceMatrix.needsUpdate = true;
    this.posts.instanceMatrix.needsUpdate = true;
    if (this.crowns.instanceColor) this.crowns.instanceColor.needsUpdate = true;
  }

  private buildTile(tile: Tile, k: number): void {
    tile.index = k;
    const L = ROAD.tileLength;
    const z0 = -k * L; // tile start (nearer the rider)
    const halfW = ROAD.width / 2;
    const halfG = halfW + ROAD.shoulder;
    this.writeRibbon(tile.asphalt, z0, L, halfW, L / 8);
    this.writeRibbon(tile.gravel, z0, L, halfG, L / 6);

    const rnd = seededRandom(k + 1);
    const slotBase = tile.slot;

    // Trees
    for (let i = 0; i < TREES_PER_TILE; i++) {
      const id = slotBase * TREES_PER_TILE + i;
      const z = z0 - rnd() * L;
      const side = rnd() < 0.5 ? -1 : 1;
      const dist = halfG + 4 + rnd() * 24;
      const x = roadCenterX(z) + side * dist;
      const h = 3 + rnd() * 5;
      const r = 1 + rnd() * 1.4;
      _p.set(x, 1.2 + h / 2, z);
      _q.setFromAxisAngle(_up, rnd() * Math.PI);
      _s.set(r, h, r);
      this.crowns.setMatrixAt(id, _m.compose(_p, _q, _s));
      _c.setHSL(0.26 + rnd() * 0.08, 0.35 + rnd() * 0.25, 0.22 + rnd() * 0.14);
      this.crowns.setColorAt(id, _c);
      _p.set(x, 0.7, z);
      _s.set(1, 1.5, 1);
      this.trunks.setMatrixAt(id, _m.compose(_p, _q, _s));
    }
    // Rocks
    for (let i = 0; i < ROCKS_PER_TILE; i++) {
      const id = slotBase * ROCKS_PER_TILE + i;
      const z = z0 - rnd() * L;
      const side = rnd() < 0.5 ? -1 : 1;
      const x = roadCenterX(z) + side * (halfG + 1.5 + rnd() * 18);
      const s = 0.3 + rnd() * 0.9;
      _p.set(x, s * 0.4, z);
      _q.setFromAxisAngle(_up, rnd() * Math.PI);
      _s.set(s * (0.8 + rnd() * 0.6), s * 0.7, s);
      this.rocks.setMatrixAt(id, _m.compose(_p, _q, _s));
    }
    // Edge marker posts, both sides, at fixed spacing
    for (let i = 0; i < POSTS_PER_TILE; i++) {
      const id = slotBase * POSTS_PER_TILE + i;
      const z = z0 - (i + 0.5) * (L / POSTS_PER_TILE);
      const side = k % 2 === 0 ? 1 : -1;
      const x = roadCenterX(z) + side * (halfG + 0.4);
      _p.set(x, 0.55, z);
      _q.setFromAxisAngle(_up, Math.atan(roadSlope(z)));
      _s.set(1, 1.1, 1);
      this.posts.setMatrixAt(id, _m.compose(_p, _q, _s));
    }
    // Sign every 5th tile
    const hasSign = k % 5 === 2;
    tile.sign.visible = hasSign;
    if (hasSign) {
      const z = z0 - L * 0.5;
      const x = roadCenterX(z) + (halfG + 1.6);
      tile.sign.position.set(x, 0, z);
      tile.sign.rotation.y = Math.atan(roadSlope(z)) + Math.PI * 0.03;
      (tile.sign.children[1] as Mesh).material =
        this.signMats[((k / 5) % this.signMats.length) | 0]!;
    }
  }

  private writeRibbon(mesh: Mesh, z0: number, L: number, halfW: number, vRepeat: number): void {
    const geo = mesh.geometry;
    const pos = geo.attributes.position as BufferAttribute;
    const nor = geo.attributes.normal as BufferAttribute;
    const uv = geo.attributes.uv as BufferAttribute;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const z = z0 - t * L;
      const cx = roadCenterX(z);
      // Keep width constant on curves by offsetting perpendicular to the tangent.
      const slope = roadSlope(z);
      const nx = 1 / Math.sqrt(1 + slope * slope);
      const nz = -slope * nx; // perpendicular to the forward direction (-slope, -1)
      const a = i * 2;
      pos.setXYZ(a, cx - halfW * nx, 0, z - halfW * nz);
      pos.setXYZ(a + 1, cx + halfW * nx, 0, z + halfW * nz);
      nor.setXYZ(a, 0, 1, 0);
      nor.setXYZ(a + 1, 0, 1, 0);
      uv.setXY(a, 0, t * vRepeat);
      uv.setXY(a + 1, 1, t * vRepeat);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    uv.needsUpdate = true;
    geo.computeBoundingSphere();
  }
}
