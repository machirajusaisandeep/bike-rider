import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { colorize, merge, place } from './geo';
import type { HeightField } from './heights';
import { seededRandom } from './roadPath';
import type { SceneDef } from './scenes';
import {
  asphaltTexture,
  cityAsphaltTexture,
  decalTexture,
  dustyAsphaltTexture,
  gravelTexture,
  parapetTexture,
  sandTexture,
  serviceAsphaltTexture,
  signTexture,
  stoneWallTexture,
  wetGhatAsphaltTexture,
  type DecalKind,
} from './textures';

const SEGMENTS = 16;
const TILE = 40;
const TILES = 20;
const POSTS_PER_TILE = 2;
const WALL_SEG = 8;
const WALLS_PER_TILE = TILE / WALL_SEG;
const BLOCKS_PER_TILE = 10;
const DECAL_KINDS: DecalKind[] = ['patch', 'cracks', 'oil'];

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _s = new Vector3();
const _n = new Vector3();
const _up = new Vector3(0, 1, 0);
const _hidden = new Matrix4().makeScale(0, 0, 0);

interface Tile {
  index: number;
  slot: number;
  asphalt: Mesh;
  shoulder: Mesh;
  service: Mesh[];
  sign: Object3D;
}

/**
 * World-space grime for the tarmac: broad tonal blotches at two scales plus dirt creeping in
 * from the verges. Decouples the look from the 16 m texture repeat so long straights stop
 * reading as a tiled pattern.
 */
function addRoadGrime(mat: MeshStandardMaterial, edge: Color, edgeStrength: number): void {
  mat.customProgramCacheKey = () => 'road-grime';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uEdgeColor = { value: edge };
    shader.uniforms.uEdgeStrength = { value: edgeStrength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoadWorld;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvRoadWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vRoadWorld;
uniform vec3 uEdgeColor;
uniform float uEdgeStrength;
float rgHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float rgNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rgHash(i), rgHash(i + vec2(1.0, 0.0)), f.x), mix(rgHash(i + vec2(0.0, 1.0)), rgHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  float g1 = rgNoise(vRoadWorld.xz * 0.045);
  float g2 = rgNoise(vRoadWorld.xz * 0.011 + 3.7);
  float grime = 1.0 + (g1 - 0.5) * 0.16 + (g2 - 0.5) * 0.24;
  float e = 1.0 - smoothstep(0.0, 0.12, min(vMapUv.x, 1.0 - vMapUv.x));
  e *= 0.5 + 0.5 * rgNoise(vRoadWorld.xz * vec2(0.35, 0.09));
  diffuseColor.rgb = mix(diffuseColor.rgb * grime, uEdgeColor, e * uEdgeStrength);
}`,
      );
  };
}

/**
 * Endless road following the scene's centreline and elevation profile. A fixed pool of tiles is
 * recycled ahead of the rider. Everything else along the verge (decals, marker posts, walls,
 * parapets, poles, milestones, signs) is instanced and re-seeded per tile.
 */
export class Road {
  readonly group = new Group();
  private tiles = new Map<number, Tile>();
  private pool: Tile[] = [];
  private asphaltMat: MeshStandardMaterial;
  private shoulderMat: MeshStandardMaterial;
  private serviceMat: MeshStandardMaterial | null = null;
  private posts: InstancedMesh;
  private decals: InstancedMesh[] = [];
  private walls: InstancedMesh | null = null;
  private parapet: InstancedMesh | null = null;
  private poles: InstancedMesh | null = null;
  private milestones: InstancedMesh | null = null;
  private currentIndex = NaN;
  private signMats: MeshStandardMaterial[];
  private dryRoughness: number;
  private wet = false;
  private disposables: { dispose(): void }[] = [];
  private uphill: 1 | -1;

  constructor(
    private hf: HeightField,
    private def: SceneDef,
  ) {
    const r = def.road;
    const tex = def.city
      ? cityAsphaltTexture()
      : r.dusty
        ? dustyAsphaltTexture()
        : r.wet
          ? wetGhatAsphaltTexture()
          : asphaltTexture();
    this.dryRoughness = r.wet ? 0.5 : r.dusty ? 0.95 : 0.88;
    this.asphaltMat = new MeshStandardMaterial({
      map: tex,
      roughness: this.dryRoughness,
      metalness: 0,
    });
    const edgeTint = new Color(
      r.wet ? 0x3f5230 : r.dusty ? 0x9c8a6a : def.water ? 0x8a6a48 : 0x6e5f48,
    );
    addRoadGrime(this.asphaltMat, edgeTint, def.city ? 0.2 : 0.45);
    const shoulderTex = def.water ? sandTexture() : gravelTexture();
    this.shoulderMat = new MeshStandardMaterial({ map: shoulderTex, roughness: 1, metalness: 0 });
    if (def.city) {
      this.shoulderMat.color.set(0x8c8880); // kerbside concrete rather than gravel
    }
    if (r.service) {
      this.serviceMat = new MeshStandardMaterial({
        map: serviceAsphaltTexture(),
        roughness: 0.95,
        metalness: 0,
      });
      addRoadGrime(this.serviceMat, new Color(0x7a6a52), 0.5);
      this.disposables.push(this.serviceMat, this.serviceMat.map!);
    }
    this.signMats = r.signs.map(
      (l) =>
        new MeshStandardMaterial({ map: signTexture(l, r.signStyle), roughness: 0.6, metalness: 0.1 }),
    );
    this.uphill = def.terrain.hillside >= 0 ? 1 : -1;

    this.posts = new InstancedMesh(
      new BoxGeometry(0.12, 1, 0.12),
      new MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.7 }),
      TILES * POSTS_PER_TILE,
    );
    this.posts.castShadow = true;
    this.posts.frustumCulled = false;
    this.group.add(this.posts);

    // Wear decals: flat alpha quads a hair above the tarmac.
    if (r.decals > 0) {
      const plane = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      for (const kind of DECAL_KINDS) {
        const mat = new MeshStandardMaterial({
          map: decalTexture(kind),
          transparent: true,
          opacity: kind === 'cracks' ? 0.7 : 0.85,
          depthWrite: false,
          roughness: kind === 'oil' ? 0.35 : 0.95,
          metalness: 0,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
          side: DoubleSide,
        });
        const im = new InstancedMesh(plane, mat, TILES * r.decals);
        im.frustumCulled = false;
        im.receiveShadow = true;
        im.renderOrder = 1;
        this.hideAll(im);
        this.group.add(im);
        this.decals.push(im);
        this.disposables.push(mat, mat.map!);
      }
      this.disposables.push(plane);
    }

    if (r.walls) {
      const geo = new BoxGeometry(WALL_SEG, 1, 0.6);
      geo.translate(0, 0.5, 0);
      scaleUV(geo, WALL_SEG / 2.2, 1);
      const tex = stoneWallTexture(r.wet ? [96, 98, 84] : [116, 108, 96]);
      const mat = new MeshStandardMaterial({ map: tex, roughness: 0.95 });
      this.walls = new InstancedMesh(geo, mat, TILES * WALLS_PER_TILE);
      this.walls.castShadow = true;
      this.walls.receiveShadow = true;
      this.walls.frustumCulled = false;
      this.hideAll(this.walls);
      this.group.add(this.walls);
      this.disposables.push(geo, mat, tex);
    }
    if (r.parapet) {
      const blocks = r.parapet === 'blocks';
      const geo = blocks ? new BoxGeometry(0.6, 0.5, 0.6) : new BoxGeometry(WALL_SEG, 0.55, 0.35);
      geo.translate(0, blocks ? 0.25 : 0.275, 0);
      if (!blocks) scaleUV(geo, 4, 1);
      const tex = parapetTexture();
      const mat = new MeshStandardMaterial({ map: tex, roughness: 0.9 });
      this.parapet = new InstancedMesh(
        geo,
        mat,
        TILES * (blocks ? BLOCKS_PER_TILE : WALLS_PER_TILE),
      );
      this.parapet.castShadow = true;
      this.parapet.frustumCulled = false;
      this.hideAll(this.parapet);
      this.group.add(this.parapet);
      this.disposables.push(geo, mat, tex);
    }
    if (r.poles && !def.city) {
      const geo = merge([
        place(colorize(new CylinderGeometry(0.09, 0.14, 8.5, 7), 0x9a9891, 0.15), 0, 4.25, 0),
        place(colorize(new BoxGeometry(1.4, 0.1, 0.1), 0x3a3a3a), 0, 7.9, 0),
        place(colorize(new BoxGeometry(1.0, 0.1, 0.1), 0x3a3a3a), 0, 8.35, 0),
        place(colorize(new BoxGeometry(0.06, 0.18, 0.06), 0xd8d8d0), -0.6, 8.0, 0),
        place(colorize(new BoxGeometry(0.06, 0.18, 0.06), 0xd8d8d0), 0.6, 8.0, 0),
      ]);
      const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
      this.poles = new InstancedMesh(geo, mat, TILES);
      this.poles.castShadow = true;
      this.poles.frustumCulled = false;
      this.hideAll(this.poles);
      this.group.add(this.poles);
      this.disposables.push(geo, mat);
    }
    if (r.milestones) {
      const top = new CylinderGeometry(0.19, 0.19, 0.3, 10, 1, false, 0, Math.PI);
      top.rotateZ(Math.PI / 2);
      top.rotateY(Math.PI / 2);
      const geo = merge([
        place(colorize(new BoxGeometry(0.38, 0.5, 0.3), 0xe9e7df, 0.05), 0, 0.25, 0),
        place(colorize(top, 0xe6b41e, 0.05), 0, 0.5, 0),
        place(colorize(new BoxGeometry(0.3, 0.16, 0.02), 0x1c1c1c), 0, 0.3, -0.16),
      ]);
      const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
      this.milestones = new InstancedMesh(geo, mat, TILES);
      this.milestones.castShadow = true;
      this.milestones.frustumCulled = false;
      this.hideAll(this.milestones);
      this.group.add(this.milestones);
      this.disposables.push(geo, mat);
    }
    for (let slot = 0; slot < TILES; slot++) this.pool.push(this.createTile(slot));
  }

  private hideAll(im: InstancedMesh): void {
    for (let i = 0; i < im.count; i++) im.setMatrixAt(i, _hidden);
    im.instanceMatrix.needsUpdate = true;
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
    const service = this.serviceMat ? [mk(this.serviceMat), mk(this.serviceMat)] : [];
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
    return { index: -1, slot, asphalt, shoulder, service, sign };
  }

  /** Rain: darker, glossier tarmac that mirrors the sky. */
  setWet(on: boolean): void {
    if (on === this.wet) return;
    this.wet = on;
    this.asphaltMat.roughness = on ? 0.38 : this.dryRoughness;
    this.asphaltMat.metalness = on ? 0.04 : 0;
    this.asphaltMat.color.setScalar(on ? 0.55 : 1);
    this.shoulderMat.color.setScalar(on ? 0.7 : this.def.city ? 0.55 : 1);
    if (this.serviceMat) this.serviceMat.color.setScalar(on ? 0.6 : 1);
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
    for (const d of this.decals) d.instanceMatrix.needsUpdate = true;
    for (const im of [this.walls, this.parapet, this.poles, this.milestones])
      if (im) im.instanceMatrix.needsUpdate = true;
  }

  private buildTile(tile: Tile, k: number): void {
    tile.index = k;
    const z0 = -k * TILE;
    const path = this.hf.path;
    const halfW = path.width / 2;
    const halfG = halfW + path.shoulder;
    const rnd = seededRandom(k * 7919 + 17);
    this.writeRibbon(tile.asphalt, z0, 0, halfW, TILE / 16, 0.05);
    this.writeRibbon(tile.shoulder, z0, 0, halfG, TILE / 6, 0.02);
    if (tile.service.length) {
      const off = halfG + 2.4 + 3.2;
      this.writeRibbon(tile.service[0]!, z0, -off, 3.2, TILE / 8, 0.04, true);
      this.writeRibbon(tile.service[1]!, z0, off, 3.2, TILE / 8, 0.04, true);
    }

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

    // --- wear decals -----------------------------------------------------------------------
    if (this.decals.length) {
      const per = this.def.road.decals;
      // reset this tile's slots on every kind, then fill the chosen ones
      for (const im of this.decals)
        for (let i = 0; i < per; i++) im.setMatrixAt(tile.slot * per + i, _hidden);
      for (let i = 0; i < per; i++) {
        const kindIdx = Math.floor(rnd() * this.decals.length);
        const im = this.decals[kindIdx]!;
        const z = z0 - rnd() * TILE;
        const lat = (rnd() - 0.5) * 2 * (halfW - 1.0);
        const size = kindIdx === 1 ? 1.4 + rnd() * 1.4 : 1.0 + rnd() * 1.6;
        const x = path.centerX(z) + lat;
        this.roadFrame(z, path.heading(z) + rnd() * Math.PI * 2);
        _p.set(x, path.elevation(z) + 0.075, z);
        _s.set(size * (0.8 + rnd() * 0.5), 1, size);
        im.setMatrixAt(tile.slot * per + i, _m.compose(_p, _q, _s));
      }
    }

    // --- retaining walls (uphill) and parapets (downhill) -----------------------------------
    if (this.walls) {
      for (let i = 0; i < WALLS_PER_TILE; i++) {
        const id = tile.slot * WALLS_PER_TILE + i;
        const z = z0 - (i + 0.5) * WALL_SEG;
        const x = path.centerX(z) + this.uphill * (halfG + 0.5);
        const cut = this.hf.terrain(x + this.uphill * 5, z) - path.elevation(z);
        if (cut < 0.9) {
          this.walls.setMatrixAt(id, _hidden);
          continue;
        }
        const hgt = Math.min(3.4, Math.max(1.0, cut * 0.75 + rnd() * 0.3));
        _p.set(x, path.elevation(z) - 0.25, z);
        _q.setFromAxisAngle(_up, path.heading(z) + Math.PI / 2);
        _s.set(1, hgt, 1);
        this.walls.setMatrixAt(id, _m.compose(_p, _q, _s));
      }
    }
    if (this.parapet) {
      const blocks = this.def.road.parapet === 'blocks';
      const per = blocks ? BLOCKS_PER_TILE : WALLS_PER_TILE;
      const step = TILE / per;
      const down = -this.uphill as 1 | -1;
      for (let i = 0; i < per; i++) {
        const id = tile.slot * per + i;
        const z = z0 - (i + 0.5) * step;
        const x = path.centerX(z) + down * (halfG + 0.35);
        const fall = path.elevation(z) - this.hf.terrain(x + down * 7, z);
        if (fall < 1.6 || (blocks && rnd() < 0.15)) {
          this.parapet.setMatrixAt(id, _hidden);
          continue;
        }
        _p.set(x, path.elevation(z) - 0.05, z);
        _q.setFromAxisAngle(_up, path.heading(z) + Math.PI / 2 + (blocks ? (rnd() - 0.5) * 0.3 : 0));
        _s.set(1, 1, 1);
        this.parapet.setMatrixAt(id, _m.compose(_p, _q, _s));
      }
    }

    // --- poles and milestones (left verge, India drives on the left) ----------------------
    if (this.poles) {
      const z = z0 - 12 - rnd() * 6;
      const x = path.centerX(z) - (halfG + 1.3);
      _p.set(x, this.hf.height(x, z) - 0.2, z);
      _q.setFromAxisAngle(_up, path.heading(z) + (rnd() - 0.5) * 0.1);
      _s.set(1, 0.95 + rnd() * 0.1, 1);
      this.poles.setMatrixAt(tile.slot, _m.compose(_p, _q, _s));
    }
    if (this.milestones) {
      if (k % 2 === 0) {
        const z = z0 - 30;
        const x = path.centerX(z) - (halfG + 0.5);
        _p.set(x, this.hf.height(x, z), z);
        _q.setFromAxisAngle(_up, path.heading(z) - Math.PI / 2);
        _s.set(1, 1, 1);
        this.milestones.setMatrixAt(tile.slot, _m.compose(_p, _q, _s));
      } else this.milestones.setMatrixAt(tile.slot, _hidden);
    }

    const hasSign = k % 4 === 2;
    tile.sign.visible = hasSign;
    if (hasSign) {
      const z = z0 - TILE * 0.5;
      const x = path.centerX(z) + (halfG + 1.6);
      tile.sign.position.set(x, this.hf.height(x, z), z);
      tile.sign.rotation.y = path.heading(z) + Math.PI * 0.03;
      (tile.sign.children[1] as Mesh).material =
        this.signMats[Math.floor(rnd() * this.signMats.length)]!;
    }
  }

  /** Quaternion aligning +Y to the road surface normal at z, then yawed. Result in _q. */
  private roadFrame(z: number, yaw: number): void {
    const path = this.hf.path;
    const dy = (path.elevation(z - 1) - path.elevation(z + 1)) / 2;
    _n.set(0, 1, dy).normalize();
    _q.setFromUnitVectors(_up, _n);
    _q2.setFromAxisAngle(_up, yaw);
    _q.multiply(_q2);
  }

  private writeRibbon(
    mesh: Mesh,
    z0: number,
    offset: number,
    halfW: number,
    vRepeat: number,
    lift: number,
    followGround = false,
  ): void {
    const geo = mesh.geometry;
    const pos = geo.attributes.position as BufferAttribute;
    const nor = geo.attributes.normal as BufferAttribute;
    const uv = geo.attributes.uv as BufferAttribute;
    const path = this.hf.path;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const z = z0 - t * TILE;
      const cx = path.centerX(z) + offset;
      const slope = path.slope(z);
      const nx = 1 / Math.sqrt(1 + slope * slope);
      const nz = -slope * nx;
      const a = i * 2;
      const xl = cx - halfW * nx;
      const xr = cx + halfW * nx;
      const yl = (followGround ? this.hf.height(xl, z - halfW * nz) : path.elevation(z)) + lift;
      const yr = (followGround ? this.hf.height(xr, z + halfW * nz) : path.elevation(z)) + lift;
      pos.setXYZ(a, xl, yl, z - halfW * nz);
      pos.setXYZ(a + 1, xr, yr, z + halfW * nz);
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
      t.service.forEach((s) => s.geometry.dispose());
    }
    this.asphaltMat.map?.dispose();
    this.asphaltMat.dispose();
    this.shoulderMat.map?.dispose();
    this.shoulderMat.dispose();
    this.signMats.forEach((m) => {
      m.map?.dispose();
      m.dispose();
    });
    this.disposables.forEach((d) => d.dispose());
    this.group.removeFromParent();
  }
}

/** Multiply a geometry's UVs so a tiling texture repeats across a stretched box. */
function scaleUV(geo: BufferGeometry, u: number, v: number): void {
  const uv = geo.attributes.uv as BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
  uv.needsUpdate = true;
}
