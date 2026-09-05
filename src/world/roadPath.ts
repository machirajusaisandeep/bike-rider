/**
 * The route is an analytic curve so every system (tiles, props, surface tests, reset) can
 * ask "where is the road at z?" without sharing state. The road runs towards -Z.
 */
export function roadCenterX(z: number): number {
  return 14 * Math.sin(z * 0.011) + 7 * Math.sin(z * 0.0043 + 1.7) + 3 * Math.sin(z * 0.027 + 0.4);
}

/** dx/dz of the centreline. */
export function roadSlope(z: number): number {
  return (
    14 * 0.011 * Math.cos(z * 0.011) +
    7 * 0.0043 * Math.cos(z * 0.0043 + 1.7) +
    3 * 0.027 * Math.cos(z * 0.027 + 0.4)
  );
}

/** Heading (yaw) that points a bike down the road at z, in this game's convention. */
export function roadHeading(z: number): number {
  // forward = (-sin h, 0, -cos h); travelling to -Z with dx = -slope per unit distance.
  return Math.atan(roadSlope(z));
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
