/** Deterministic 2D value noise + fBm. Cheap enough for terrain chunks on the main thread. */

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export function valueNoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = fade(xf);
  const v = fade(yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1; // -1..1
}

export interface FbmOptions {
  octaves?: number;
  lacunarity?: number;
  gain?: number;
  seed?: number;
  /** Ridged multifractal: sharp crests, good for high mountains. */
  ridge?: boolean;
}

export function fbm(x: number, y: number, o: FbmOptions = {}): number {
  const octaves = o.octaves ?? 5;
  const lac = o.lacunarity ?? 2.02;
  const gain = o.gain ?? 0.5;
  const seed = o.seed ?? 0;
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    let n = valueNoise(x * freq, y * freq, seed + i * 31);
    if (o.ridge) n = 1 - Math.abs(n); // 0..1 with ridges
    sum += n * amp;
    norm += amp;
    amp *= gain;
    freq *= lac;
  }
  return sum / norm; // ridge: 0..1, otherwise -1..1
}

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
