import type { SceneId } from '../world/scenes';
import { SCENES } from '../world/scenes';

/** Seeds are positive 31-bit integers so they survive URLs and JSON without surprises. */
export type Seed = number;

export function randomSeed(): Seed {
  return (Math.floor(Math.random() * 0x7fffffff) || 1) >>> 0;
}

/** Local calendar day as YYYYMMDD. Everyone in the same timezone shares a daily. */
export function todayKey(d = new Date()): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Deterministic daily seed: the same for everyone on the same day. */
export function dailySeed(dayKey = todayKey()): Seed {
  // xorshift-style scramble so consecutive days do not produce near-identical layouts
  let x = (dayKey ^ 0x5bd1e995) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) % 0x7fffffff || 1;
}

/** Rotates through the scenes one per day so the daily has a fixed road. */
export function dailyScene(dayKey = todayKey()): SceneId {
  const days = Math.floor(dayKey / 100) * 31 + (dayKey % 100);
  return SCENES[days % SCENES.length]!.id;
}

export function parseSeed(raw: string | null): Seed | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 0x7fffffff || Math.floor(n) !== n) return null;
  return n;
}
