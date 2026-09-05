import { Color, Light, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { Bike } from './Bike';
import type { BikePhysics } from './BikePhysics';

/**
 * Ghost = your best run on this board, replayed as a translucent bike. Recorded at 10 Hz as
 * flat float samples [t, x, y, z, heading, lean]; a 3-minute run is ~43 KB as base64, which
 * fits comfortably in localStorage per board.
 */
const STRIDE = 6;
const RATE_HZ = 10;
const MAX_SAMPLES = 10 * 60 * RATE_HZ; // 10 minutes

export class GhostRecorder {
  private buf = new Float32Array(MAX_SAMPLES * STRIDE);
  private n = 0;
  private nextT = 0;

  reset(): void {
    this.n = 0;
    this.nextT = 0;
  }

  sample(t: number, p: BikePhysics): void {
    if (t < this.nextT || this.n >= MAX_SAMPLES) return;
    this.nextT = t + 1 / RATE_HZ;
    const o = this.n * STRIDE;
    this.buf[o] = t;
    this.buf[o + 1] = p.position.x;
    this.buf[o + 2] = p.position.y;
    this.buf[o + 3] = p.position.z;
    this.buf[o + 4] = p.heading;
    this.buf[o + 5] = p.lean;
    this.n++;
  }

  get samples(): number {
    return this.n;
  }

  /** Base64 of the raw float samples. */
  serialize(): string {
    const bytes = new Uint8Array(this.buf.buffer, 0, this.n * STRIDE * 4);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
}

export function deserializeGhost(b64: string): Float32Array | null {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.length % (STRIDE * 4) !== 0) return null;
    return new Float32Array(bytes.buffer);
  } catch {
    return null;
  }
}

const GHOST_TINT = new Color(0x6fd3ff);

export class GhostRider {
  readonly bike = new Bike();
  private data: Float32Array | null = null;
  private cursor = 0;

  constructor() {
    const root: Object3D = this.bike.root;
    root.traverse((o) => {
      if ((o as Light).isLight) {
        (o as Light).intensity = 0;
        o.visible = false;
      }
      const m = o as Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const cloned = mats.map((mat) => {
        const c = (mat as MeshStandardMaterial).clone();
        c.transparent = true;
        c.opacity = 0.32;
        c.depthWrite = false;
        if ((c as MeshStandardMaterial).color) {
          (c as MeshStandardMaterial).color.lerp(GHOST_TINT, 0.55);
        }
        if ((c as MeshStandardMaterial).emissive) {
          (c as MeshStandardMaterial).emissive.copy(GHOST_TINT).multiplyScalar(0.25);
        }
        return c;
      });
      m.material = Array.isArray(m.material) ? cloned : cloned[0]!;
      m.castShadow = false;
      m.receiveShadow = false;
    });
    this.bike.setLights(false, false);
    root.visible = false;
  }

  load(data: Float32Array | null): void {
    this.data = data && data.length >= STRIDE * 2 ? data : null;
    this.cursor = 0;
    this.bike.root.visible = false;
  }

  get active(): boolean {
    return !!this.data;
  }

  /** Move the ghost to time `t` (seconds since the run's GO). */
  update(t: number): void {
    const d = this.data;
    if (!d) return;
    const count = d.length / STRIDE;
    // advance cursor
    while (this.cursor < count - 2 && d[(this.cursor + 1) * STRIDE]! <= t) this.cursor++;
    while (this.cursor > 0 && d[this.cursor * STRIDE]! > t) this.cursor--;
    const a = this.cursor * STRIDE;
    const b = Math.min(count - 1, this.cursor + 1) * STRIDE;
    const ta = d[a]!;
    const tb = d[b]!;
    if (t > tb + 0.5) {
      // ghost finished (crashed or run ended): fade out by hiding
      this.bike.root.visible = false;
      return;
    }
    const k = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 0;
    const lerp = (i: number) => d[a + i]! + (d[b + i]! - d[a + i]!) * k;
    let ha = d[a + 4]!;
    let hb = d[b + 4]!;
    // shortest-arc heading interpolation
    if (hb - ha > Math.PI) hb -= Math.PI * 2;
    else if (ha - hb > Math.PI) ha -= Math.PI * 2;
    const r = this.bike.root;
    r.visible = t >= ta - 0.01;
    r.position.set(lerp(1), lerp(2), lerp(3));
    r.rotation.order = 'YXZ';
    r.rotation.y = ha + (hb - ha) * k;
    this.bike.setLean(lerp(5));
  }

  hide(): void {
    this.bike.root.visible = false;
  }
}

// ------------------------------------------------------------------------------ storage ---
const KEY = 'bike-rider.ghosts.v1';

interface StoredGhost {
  score: number;
  seed: number;
  data: string;
}

function loadAll(): Record<string, StoredGhost> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, StoredGhost>;
  } catch {
    return {};
  }
}

export function loadGhost(board: string): { score: number; data: Float32Array } | null {
  const g = loadAll()[board];
  if (!g) return null;
  const data = deserializeGhost(g.data);
  return data ? { score: g.score, data } : null;
}

export function saveGhost(board: string, score: number, seed: number, rec: GhostRecorder): void {
  if (rec.samples < 10) return;
  try {
    const all = loadAll();
    all[board] = { score, seed, data: rec.serialize() };
    // keep at most 12 boards
    const keys = Object.keys(all);
    if (keys.length > 12) for (const k of keys.slice(0, keys.length - 12)) delete all[k];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* quota: skip */
  }
}
