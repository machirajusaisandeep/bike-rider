import { fbm, lerp, smoothstep } from './noise';
import type { RoadPath } from './roadPath';
import type { SceneDef } from './scenes';

/**
 * One height function for everything: terrain chunks, road ribbon, vegetation placement and the
 * bike itself all sample this, so they always agree.
 */
export class HeightField {
  private seed: number;
  constructor(
    readonly def: SceneDef,
    readonly path: RoadPath,
  ) {
    this.seed = def.id.length * 17 + def.id.charCodeAt(0);
  }

  /** Raw landscape ignoring the road cut. */
  terrain(x: number, z: number): number {
    const t = this.def.terrain;
    const cx = this.path.centerX(z);
    const lat = x - cx;
    let h = 0;
    // Local relief
    const n = fbm(x / t.wavelength, z / t.wavelength, {
      octaves: t.octaves,
      ridge: t.ridge,
      seed: this.seed,
    });
    h += (t.ridge ? n - 0.5 : n * 0.5) * 2 * t.amplitude;
    // Big mountains further from the road so the route itself stays rideable.
    if (t.mountains.amplitude > 0) {
      const m = fbm(x / t.mountains.wavelength, z / t.mountains.wavelength, {
        octaves: 4,
        ridge: true,
        seed: this.seed + 7,
      });
      const far = smoothstep(160, 620, Math.abs(lat));
      h += (m - 0.35) * t.mountains.amplitude * far;
    }
    // Hillside: one side rises, the other falls away (cut-and-fill mountain road).
    if (t.hillside !== 0) {
      // Saturating slope: rises ~hillside m per m near the road, levels off ~300 m out.
      const s = Math.sign(lat) * 300 * Math.tanh(Math.abs(lat) / 300) * t.hillside;
      h += s * (0.7 + 0.3 * Math.sin(z * 0.004));
    }
    // Sea: a laterite lip, a near-vertical cliff face, a flat beach strip, then the sea floor.
    const w = this.def.water;
    if (w) {
      const d = w.side * lat;
      const cliffW = 10;
      const drop = smoothstep(w.shore, w.shore + cliffW, d);
      const lip = smoothstep(w.shore - 12, w.shore, d) * 1.4;
      const beachY = w.level + 1.6 - Math.max(0, d - (w.shore + cliffW + w.beach)) * 0.09;
      h = lerp(h + lip, beachY, drop);
    }
    return h + this.path.elevation(z);
  }

  /** Final height with the road bench cut in. */
  height(x: number, z: number): number {
    const lat = Math.abs(x - this.path.centerX(z));
    const half = this.path.width / 2 + this.path.shoulder;
    const roadY = this.path.elevation(z);
    if (lat <= half) return roadY;
    const t = smoothstep(half, half + 26, lat);
    return lerp(roadY, this.terrain(x, z), t);
  }

  /** Surface normal-ish slope magnitude (rise/run). */
  slope(x: number, z: number): number {
    const e = 1.5;
    const dx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    const dz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  }
}
