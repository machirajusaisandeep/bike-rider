import type { SceneDef } from './scenes';

/**
 * The route is an analytic curve so every system (tiles, props, surface tests, reset, terrain)
 * can ask "where is the road at z?" without sharing state. The road runs towards -Z.
 */
export class RoadPath {
  readonly width: number;
  readonly shoulder: number;
  private k: number;
  private elevAmp: number;
  private elevK: number;

  constructor(def: SceneDef) {
    this.k = def.road.curviness;
    this.width = def.road.width;
    this.shoulder = def.road.shoulder;
    this.elevAmp = def.road.elevation.amplitude;
    this.elevK = (Math.PI * 2) / def.road.elevation.wavelength;
  }

  centerX(z: number): number {
    return (
      this.k *
      (14 * Math.sin(z * 0.011) + 7 * Math.sin(z * 0.0043 + 1.7) + 3 * Math.sin(z * 0.027 + 0.4))
    );
  }

  /** dx/dz of the centreline. */
  slope(z: number): number {
    return (
      this.k *
      (14 * 0.011 * Math.cos(z * 0.011) +
        7 * 0.0043 * Math.cos(z * 0.0043 + 1.7) +
        3 * 0.027 * Math.cos(z * 0.027 + 0.4))
    );
  }

  /** Heading (yaw) that points a bike down the road at z. */
  heading(z: number): number {
    return Math.atan(this.slope(z));
  }

  /** Elevation of the road surface along the route. */
  elevation(z: number): number {
    const k = this.elevK;
    return (
      this.elevAmp *
      (0.6 * Math.sin(z * k + 0.8) +
        0.3 * Math.sin(z * k * 2.3 + 2.1) +
        0.1 * Math.sin(z * k * 5.1))
    );
  }

  /** Lateral distance from the centreline (positive = right of travel direction). */
  lateral(x: number, z: number): number {
    return x - this.centerX(z);
  }
}

/** Deterministic per-tile randomness. */
export function seededRandom(seed: number): () => number {
  let t = (seed * 0x9e3779b1) >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
