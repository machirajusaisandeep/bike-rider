import {
  BufferGeometry,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { TRAFFIC } from '../core/config';
import type { Quality } from '../core/settings';
import { stdMat } from './geo';
import type { HeightField } from './heights';
import { seededRandom } from './roadPath';
import type { SceneDef } from './scenes';
import { TRAFFIC_BY_SCENE, type TrafficDef } from './trafficDefs';
import {
  buildHazard,
  buildVehicle,
  HAZARD_SPECS,
  VEHICLE_SPECS,
  type HazardKind,
  type HazardSpec,
  type VehicleKind,
  type VehicleSpec,
} from './vehicles';

const TILE = 40;
const HAZARD_TILES_AHEAD = 8;
const HAZARD_TILES_BEHIND = 1;
const MAX_HAZARDS_PER_KIND = 24;
const QUALITY_SCALE: Record<Quality, number> = { low: 0.6, medium: 0.85, high: 1 };

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3(1, 1, 1);
const _up = new Vector3(0, 1, 0);
const _hidden = new Matrix4().makeScale(0, 0, 0);

/** Anything the bike can touch, expressed in road space (lateral offset, z). */
export interface Obstacle {
  id: number;
  type: 'vehicle' | 'hazard';
  kind: VehicleKind | HazardKind;
  label: string;
  lat: number;
  z: number;
  halfW: number;
  halfL: number;
  /** Signed speed along -Z (positive = travelling with the rider), m/s. */
  speed: number;
  effect: 'solid' | 'bump' | 'slick';
  /** Bookkeeping for near misses / one-shot bumps. */
  passed: boolean;
  bumped: boolean;
}

interface Vehicle extends Obstacle {
  type: 'vehicle';
  spec: VehicleSpec;
  dir: 1 | -1; // 1 = same way as the rider, -1 = oncoming
  laneLat: number;
  cruise: number;
  wanderPhase: number;
  instance: number;
  alive: boolean;
}

interface Hazard extends Obstacle {
  type: 'hazard';
  spec: HazardSpec;
  tile: number;
}

interface Pool {
  mesh: InstancedMesh;
  geometry: BufferGeometry;
  material: Material;
  free: number[];
}

export interface Contact {
  obstacle: Obstacle;
  /** Closing speed in km/h. */
  relativeKmh: number;
  /** +1 if the obstacle is to the rider's right, -1 left. */
  side: 1 | -1;
}

export interface NearMiss {
  obstacle: Obstacle;
  gap: number;
  oncoming: boolean;
}

/**
 * Moving traffic plus static hazards for one scene. Everything is deterministic for a given
 * `seed`, so daily challenges and share links reproduce the same road.
 *
 * Coordinates: the road runs towards -Z. Lateral > 0 is the rider's right. India drives on the
 * left, so same-direction lanes have negative lateral and oncoming lanes positive.
 */
export class Traffic {
  readonly group = new Group();
  private def: TrafficDef;
  private vehicles: Vehicle[] = [];
  private hazards: Hazard[] = [];
  private vehiclePools = new Map<VehicleKind, Pool>();
  private hazardPools = new Map<HazardKind, Pool>();
  private rnd: () => number;
  private nextId = 1;
  private lastTile = NaN;
  private hazardTiles = new Set<number>();
  private lanesPerDir: number;
  private laneLats: { same: number[]; oncoming: number[] };
  private targetCount = 0;
  private density = 1;
  private qualityScale = 1;
  private lastBikeZ = 0;
  enabled = true;

  constructor(
    private hf: HeightField,
    private scene: SceneDef,
    private seed: number,
    quality: Quality,
    density = 1,
  ) {
    this.def = TRAFFIC_BY_SCENE[scene.id];
    this.rnd = seededRandom(seed);
    this.qualityScale = QUALITY_SCALE[quality];
    const w = scene.road.width;
    this.lanesPerDir = w >= 9 ? 2 : 1;
    const half = w / 2;
    const lanes = (sign: 1 | -1) =>
      this.lanesPerDir === 1
        ? [sign * half * TRAFFIC.laneFraction]
        : [sign * half * 0.25, sign * half * 0.72];
    this.laneLats = { same: lanes(-1), oncoming: lanes(1) };
    this.setDensity(density);

    // Vehicle pools: capacity per kind sized to the whole target count so any mix fits.
    const paintRnd = seededRandom(seed ^ 0x51ed);
    for (const kind of Object.keys(this.def.vehicles) as VehicleKind[]) {
      const geometry = buildVehicle(kind, paintRnd);
      const material = stdMat({ roughness: 0.6, metalness: 0.15 });
      const cap = Math.max(4, Math.ceil(this.targetCount * 0.6));
      this.vehiclePools.set(kind, this.makePool(geometry, material, cap, true));
    }
    for (const kind of Object.keys(this.def.hazards) as HazardKind[]) {
      const geometry = buildHazard(kind, scene.road.width + 0.4);
      const material = stdMat({ roughness: kind === 'puddle' ? 0.15 : 0.9, metalness: 0 });
      const cast = kind !== 'pothole' && kind !== 'puddle' && kind !== 'breaker';
      this.hazardPools.set(kind, this.makePool(geometry, material, MAX_HAZARDS_PER_KIND, cast));
    }
  }

  private makePool(geometry: BufferGeometry, material: Material, cap: number, cast: boolean): Pool {
    const mesh = new InstancedMesh(geometry, material, cap);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = cap;
    for (let i = 0; i < cap; i++) mesh.setMatrixAt(i, _hidden);
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
    const free: number[] = [];
    for (let i = cap - 1; i >= 0; i--) free.push(i);
    return { mesh, geometry, material, free };
  }

  setDensity(d: number): void {
    this.density = d;
    this.targetCount = Math.round(
      TRAFFIC.perDirection * 2 * this.def.density * d * this.qualityScale * this.lanesPerDir,
    );
  }

  /** Clears all traffic and reseeds. Used on run start / retry. */
  reset(bikeZ: number, seed = this.seed): void {
    this.seed = seed;
    this.rnd = seededRandom(seed);
    for (const v of this.vehicles) this.release(this.vehiclePools.get(v.kind as VehicleKind)!, v.instance);
    this.vehicles = [];
    for (const h of this.hazards) this.release(this.hazardPools.get(h.kind as HazardKind)!, h.id);
    this.hazards = [];
    this.hazardTiles.clear();
    this.lastTile = NaN;
    this.lastBikeZ = bikeZ;
    this.update(0, bikeZ, 0);
  }

  private release(pool: Pool, instance: number): void {
    pool.mesh.setMatrixAt(instance, _hidden);
    pool.mesh.instanceMatrix.needsUpdate = true;
    pool.free.push(instance);
  }

  update(dt: number, bikeZ: number, bikeSpeed: number): void {
    this.lastBikeZ = bikeZ;
    if (!this.enabled) return;
    this.updateHazards(bikeZ);
    // --- despawn --------------------------------------------------------------------------
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i]!;
      const behind = v.z - bikeZ; // positive when the vehicle is behind the rider
      const farAhead = bikeZ - v.z > TRAFFIC.spawnAhead + 140;
      if (behind > TRAFFIC.despawnBehind || farAhead) {
        this.release(this.vehiclePools.get(v.kind as VehicleKind)!, v.instance);
        this.vehicles.splice(i, 1);
      }
    }
    // --- spawn ----------------------------------------------------------------------------
    let guard = 0;
    while (this.vehicles.length < this.targetCount && guard++ < 8) {
      if (!this.spawn(bikeZ, bikeSpeed)) break;
    }
    // --- move -----------------------------------------------------------------------------
    if (dt > 0) {
      const path = this.hf.path;
      for (const v of this.vehicles) {
        // Car-following inside the lane.
        let speed = v.cruise;
        for (const o of this.vehicles) {
          if (o === v || o.dir !== v.dir || o.laneLat !== v.laneLat) continue;
          const gap = v.dir === 1 ? v.z - o.z : o.z - v.z; // positive when o is ahead of v
          if (gap > 0 && gap < o.halfL + v.halfL + 6 + v.cruise * 1.2) {
            speed = Math.min(speed, o.cruise * 0.98);
          }
        }
        v.speed = speed * v.dir;
        v.z -= speed * dt * v.dir;
        // Trucks and buses drift over the centre line now and then.
        v.wanderPhase += dt * 0.35;
        const wander = Math.max(0, Math.sin(v.wanderPhase) - (1 - v.spec.wander)) * 1.6;
        v.lat = v.laneLat + (v.dir === 1 ? wander : -wander);
        this.place(v, path.heading(v.z) + (v.dir === -1 ? Math.PI : 0));
      }
    }
  }

  private spawn(bikeZ: number, bikeSpeed: number): boolean {
    const dir: 1 | -1 = this.rnd() < 0.5 ? 1 : -1;
    const kind = this.pickKind();
    const pool = this.vehiclePools.get(kind)!;
    if (pool.free.length === 0) return false;
    const spec = VEHICLE_SPECS[kind];
    const lanes = dir === 1 ? this.laneLats.same : this.laneLats.oncoming;
    const laneLat = lanes[Math.floor(this.rnd() * lanes.length)]!;
    const [lo, hi] = spec.speedKmh;
    const cruise = ((lo + this.rnd() * (hi - lo)) / 3.6) * (this.scene.city ? 0.85 : 1);
    // Ahead of the rider, spread out so the road never presents a wall.
    let z = bikeZ - (TRAFFIC.spawnAhead + this.rnd() * 160);
    // Same-direction traffic slower than the rider is what gets overtaken; make sure a fast
    // rider is not spawning cars onto their own front wheel.
    if (dir === 1 && bikeSpeed > cruise) z -= 40;
    for (let tries = 0; tries < 6; tries++) {
      const clash = this.vehicles.some(
        (o) => o.laneLat === laneLat && o.dir === dir && Math.abs(o.z - z) < o.halfL + spec.halfL + 18,
      );
      if (!clash) break;
      z -= 30;
    }
    const v: Vehicle = {
      id: this.nextId++,
      type: 'vehicle',
      kind,
      label: spec.label,
      spec,
      dir,
      laneLat,
      lat: laneLat,
      z,
      halfW: spec.halfW,
      halfL: spec.halfL,
      speed: cruise * dir,
      cruise,
      effect: 'solid',
      wanderPhase: this.rnd() * Math.PI * 2,
      instance: pool.free.pop()!,
      alive: true,
      passed: false,
      bumped: false,
    };
    this.vehicles.push(v);
    this.place(v, this.hf.path.heading(z) + (dir === -1 ? Math.PI : 0));
    return true;
  }

  private pickKind(): VehicleKind {
    const entries = Object.entries(this.def.vehicles) as [VehicleKind, number][];
    const total = entries.reduce((a, [, w]) => a + w, 0);
    let r = this.rnd() * total;
    for (const [k, w] of entries) {
      r -= w;
      if (r <= 0) return k;
    }
    return entries[0]![0];
  }

  private place(v: Vehicle, yaw: number): void {
    const pool = this.vehiclePools.get(v.kind as VehicleKind)!;
    const x = this.hf.path.centerX(v.z) + v.lat;
    _p.set(x, this.hf.height(x, v.z) + 0.03, v.z);
    _q.setFromAxisAngle(_up, yaw);
    pool.mesh.setMatrixAt(v.instance, _m.compose(_p, _q, _s));
    pool.mesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------------------ hazards ---
  private updateHazards(bikeZ: number): void {
    const idx = Math.floor(-bikeZ / TILE);
    if (idx === this.lastTile) return;
    this.lastTile = idx;
    const first = idx - HAZARD_TILES_BEHIND;
    const last = idx + HAZARD_TILES_AHEAD;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i]!;
      if (h.tile < first || h.tile > last) {
        this.release(this.hazardPools.get(h.kind as HazardKind)!, h.id);
        this.hazards.splice(i, 1);
        this.hazardTiles.delete(h.tile);
      }
    }
    for (let k = Math.max(1, first); k <= last; k++) {
      if (this.hazardTiles.has(k)) continue;
      this.hazardTiles.add(k);
      this.fillHazardTile(k);
    }
  }

  private fillHazardTile(k: number): void {
    const rnd = seededRandom(k * 977 + (this.seed % 100000) * 13 + 5);
    const path = this.hf.path;
    const half = this.scene.road.width / 2;
    const kmPerTile = TILE / 1000;
    for (const [kind, perKm] of Object.entries(this.def.hazards) as [HazardKind, number][]) {
      const expected = perKm * kmPerTile * Math.max(0.4, this.density);
      // Poisson-ish: at most 2 of a kind per tile.
      let n = 0;
      if (rnd() < expected) n++;
      if (rnd() < expected * 0.35) n++;
      for (let i = 0; i < n; i++) {
        const pool = this.hazardPools.get(kind)!;
        if (pool.free.length === 0) break;
        const spec = HAZARD_SPECS[kind];
        const z = -k * TILE - rnd() * TILE;
        let lat: number;
        if (spec.placement === 'road') lat = 0;
        else if (spec.placement === 'edge')
          lat = (rnd() < 0.5 ? -1 : 1) * (half - spec.halfW - 0.1 + rnd() * 0.6);
        else lat = (rnd() - 0.5) * 2 * (half - spec.halfW - 0.2);
        const id = pool.free.pop()!;
        const h: Hazard = {
          id,
          type: 'hazard',
          kind,
          label: spec.label,
          spec,
          tile: k,
          lat,
          z,
          halfW: spec.placement === 'road' ? half + 0.5 : spec.halfW,
          halfL: spec.halfL,
          speed: 0,
          effect: spec.effect,
          passed: false,
          bumped: false,
        };
        this.hazards.push(h);
        const x = path.centerX(z) + lat;
        const yaw =
          spec.placement === 'road' ? path.heading(z) : kind === 'cow' || kind === 'goat'
            ? path.heading(z) + (rnd() - 0.5) * 1.6
            : rnd() * Math.PI * 2;
        _p.set(x, this.hf.height(x, z), z);
        _q.setFromAxisAngle(_up, yaw);
        pool.mesh.setMatrixAt(id, _m.compose(_p, _q, _s));
        pool.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  // ------------------------------------------------------------------------------ queries ---

  /**
   * Overlap test between the bike box (road space) and every obstacle. Returns all contacts
   * this step; the game decides what each one means.
   */
  contacts(bikeLat: number, bikeZ: number, bikeSpeed: number, out: Contact[] = []): Contact[] {
    out.length = 0;
    if (!this.enabled) return out;
    const hw = TRAFFIC.bikeRadius;
    const hl = TRAFFIC.bikeLength / 2;
    const test = (o: Obstacle) => {
      if (Math.abs(o.z - bikeZ) > o.halfL + hl) return;
      const dLat = bikeLat - o.lat;
      if (Math.abs(dLat) > o.halfW + hw) return;
      const rel = Math.abs(bikeSpeed - o.speed);
      out.push({ obstacle: o, relativeKmh: rel * 3.6, side: dLat < 0 ? 1 : -1 });
    };
    for (const v of this.vehicles) test(v);
    for (const h of this.hazards) test(h);
    return out;
  }

  /**
   * Fires once per obstacle when the rider's centre passes it. `gap` is the clearance between
   * the two boxes; negative means they overlapped (a hit, not a near miss).
   */
  nearMisses(bikeLat: number, bikeZ: number, out: NearMiss[] = []): NearMiss[] {
    out.length = 0;
    if (!this.enabled) return out;
    const check = (o: Obstacle, oncoming: boolean) => {
      if (o.passed) return;
      if (bikeZ <= o.z) {
        o.passed = true;
        if (o.effect !== 'solid') return;
        const gap = Math.abs(bikeLat - o.lat) - (o.halfW + TRAFFIC.bikeRadius);
        out.push({ obstacle: o, gap, oncoming });
      }
    };
    for (const v of this.vehicles) check(v, v.dir === -1);
    for (const h of this.hazards) check(h, false);
    return out;
  }

  /** Nudges a vehicle sideways after a hit so the rider is not stuck inside it. */
  shove(o: Obstacle, side: 1 | -1, metres: number): void {
    if (o.type !== 'vehicle') return;
    o.lat += side * metres;
  }

  get count(): number {
    return this.vehicles.length;
  }

  get bikeZ(): number {
    return this.lastBikeZ;
  }

  dispose(): void {
    for (const p of [...this.vehiclePools.values(), ...this.hazardPools.values()]) {
      p.geometry.dispose();
      p.material.dispose();
    }
    this.group.removeFromParent();
  }
}
