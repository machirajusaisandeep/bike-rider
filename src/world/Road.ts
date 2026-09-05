import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import type { HeightField } from './heights';
import { seededRandom } from './roadPath';
import type { SceneDef } from './scenes';
import {
  asphaltTexture,
  cityAsphaltTexture,
  dustyAsphaltTexture,
  gravelTexture,
  sandTexture,
  signTexture,
} from './textures';

const SEGMENTS = 16;
const TILE = 40;
const TILES = 20;
const POSTS_PER_TILE = 2;

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);

interface Tile {
  index: number;
  slot: number;
  asphalt: Mesh;
  shoulder: Mesh;
  sign: Object3D;
}

/**
 * Endless road following the scene's centreline and elevation profile. A fixed pool of tiles is
 * recycled ahead of the rider; marker posts and route signs are instanced.
 */
export class Road {
  readonly group = new Group();
  private tiles = new Map<number, Tile>();
  private pool: Tile[] = [];
  private asphaltMat: MeshStandardMaterial;
  private shoulderMat: MeshStandardMaterial;
  private posts: InstancedMesh;
  private currentIndex = NaN;
  private signMats: MeshStandardMaterial[];

  constructor(
    private hf: HeightField,
    def: SceneDef,
  ) {
    const tex = def.city
      ? cityAsphaltTexture()
      : def.road.dusty
        ? dustyAsphaltTexture()
        : asphaltTexture();
    this.asphaltMat = new MeshStandardMaterial({
      map: tex,
      roughness: def.id === 'wayanad' ? 0.55 : 0.9,
      metalness: 0,
    });
    const shoulderTex = def.water ? sandTexture() : gravelTexture();
    this.shoulderMat = new MeshStandardMaterial({ map: shoulderTex, roughness: 1, metalness: 0 });
    this.signMats = def.road.signs.map(
      (l) => new MeshStandardMaterial({ map: signTexture(l), roughness: 0.6, metalness: 0.1 }),
    );

    this.posts = new InstancedMesh(
      new BoxGeometry(0.12, 1, 0.12),
      new MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.7 }),
      TILES * POSTS_PER_TILE,
    );
    this.posts.castShadow = true;
    this.posts.frustumCulled = false;
    this.group.add(this.posts);
    for (let slot = 0; slot < TILES; slot++) this.pool.push(this.createTile(slot));
  }

  private createTile(slot: number): Tile {
    const mk = (mat: MeshStandardMaterial) => {
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
      this.group.add(mesh);
      return mesh;
    };
    const asphalt = mk(this.asphaltMat);
    const shoulder = mk(this.shoulderMat);
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
    return { index: -1, slot, asphalt, shoulder, sign };
  }

  update(bikeZ: number): void {
    const idx = Math.floor(-bikeZ / TILE);
    if (idx === this.currentIndex) return;
    this.currentIndex = idx;
    const first = idx - 3;
    const last = first + TILES - 1;
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
    this.posts.instanceMatrix.needsUpdate = true;
  }

  private buildTile(tile: Tile, k: number): void {
    tile.index = k;
    const z0 = -k * TILE;
    const path = this.hf.path;
    const halfW = path.width / 2;
    const halfG = halfW + path.shoulder;
    this.writeRibbon(tile.asphalt, z0, halfW, TILE / 8, 0.05);
    this.writeRibbon(tile.shoulder, z0, halfG, TILE / 6, 0.02);

    for (let i = 0; i < POSTS_PER_TILE; i++) {
      const id = tile.slot * POSTS_PER_TILE + i;
      const z = z0 - (i + 0.5) * (TILE / POSTS_PER_TILE);
      const side = k % 2 === 0 ? 1 : -1;
      const x = path.centerX(z) + side * (halfG + 0.4);
      _p.set(x, this.hf.height(x, z) + 0.55, z);
      _q.setFromAxisAngle(_up, path.heading(z));
      _s.set(1, 1.1, 1);
      this.posts.setMatrixAt(id, _m.compose(_p, _q, _s));
    }
    const hasSign = k % 5 === 2;
    tile.sign.visible = hasSign;
    if (hasSign) {
      const rnd = seededRandom(k);
      const z = z0 - TILE * 0.5;
      const x = path.centerX(z) + (halfG + 1.6);
      tile.sign.position.set(x, this.hf.height(x, z), z);
      tile.sign.rotation.y = path.heading(z) + Math.PI * 0.03;
      (tile.sign.children[1] as Mesh).material =
        this.signMats[Math.floor(rnd() * this.signMats.length)]!;
    }
  }

  private writeRibbon(mesh: Mesh, z0: number, halfW: number, vRepeat: number, lift: number): void {
    const geo = mesh.geometry;
    const pos = geo.attributes.position as BufferAttribute;
    const nor = geo.attributes.normal as BufferAttribute;
    const uv = geo.attributes.uv as BufferAttribute;
    const path = this.hf.path;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const z = z0 - t * TILE;
      const cx = path.centerX(z);
      const slope = path.slope(z);
      const nx = 1 / Math.sqrt(1 + slope * slope);
      const nz = -slope * nx;
      const y = path.elevation(z) + lift;
      const a = i * 2;
      pos.setXYZ(a, cx - halfW * nx, y, z - halfW * nz);
      pos.setXYZ(a + 1, cx + halfW * nx, y, z + halfW * nz);
      // approximate normal from the elevation gradient
      const dy = (path.elevation(z - 1) - path.elevation(z + 1)) / 2;
      const len = Math.hypot(dy, 1);
      nor.setXYZ(a, 0, 1 / len, dy / len);
      nor.setXYZ(a + 1, 0, 1 / len, dy / len);
      uv.setXY(a, 0, t * vRepeat);
      uv.setXY(a + 1, 1, t * vRepeat);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    uv.needsUpdate = true;
    geo.computeBoundingSphere();
  }

  dispose(): void {
    for (const t of [...this.tiles.values(), ...this.pool]) {
      t.asphalt.geometry.dispose();
      t.shoulder.geometry.dispose();
    }
    this.asphaltMat.map?.dispose();
    this.asphaltMat.dispose();
    this.shoulderMat.map?.dispose();
    this.shoulderMat.dispose();
    this.signMats.forEach((m) => {
      m.map?.dispose();
      m.dispose();
    });
    this.group.removeFromParent();
  }
}
