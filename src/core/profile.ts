import type { SceneId } from '../world/scenes';
import type { GameMode } from '../game/Run';

/**
 * Everything the player has earned, kept in localStorage. Separate from Settings (preferences)
 * so a settings reset never wipes progress.
 */
export interface BestEntry {
  score: number;
  distanceM: number;
  topKmh: number;
  nearMisses: number;
  bestCombo: number;
  at: number; // epoch ms
  seed: number;
}

export type UpgradeKey = 'power' | 'brakes' | 'tyres' | 'suspension';

export interface Profile {
  handle: string;
  coins: number;
  totalRuns: number;
  totalDistanceM: number;
  bests: Partial<Record<SceneId, BestEntry>>;
  daily: {
    /** YYYYMMDD of the last daily played. */
    lastDay: number;
    streak: number;
    best: Partial<Record<number, BestEntry>>;
  };
  upgrades: Record<UpgradeKey, number>;
  bikes: string[];
  bike: string;
  missionsDone: string[];
  routesDone: string[];
  unlocks: string[];
  onboarded: boolean;
}

const KEY = 'bike-rider.profile.v1';

export const DEFAULT_PROFILE: Profile = {
  handle: '',
  coins: 0,
  totalRuns: 0,
  totalDistanceM: 0,
  bests: {},
  daily: { lastDay: 0, streak: 0, best: {} },
  upgrades: { power: 0, brakes: 0, tyres: 0, suspension: 0 },
  bikes: ['scram'],
  bike: 'scram',
  missionsDone: [],
  routesDone: [],
  unlocks: [],
  onboarded: false,
};

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_PROFILE);
    const p = JSON.parse(raw) as Partial<Profile>;
    const out: Profile = {
      ...structuredClone(DEFAULT_PROFILE),
      ...p,
      daily: { ...DEFAULT_PROFILE.daily, ...(p.daily ?? {}) },
      upgrades: { ...DEFAULT_PROFILE.upgrades, ...(p.upgrades ?? {}) },
    };
    if (!Array.isArray(out.bikes) || out.bikes.length === 0) out.bikes = ['scram'];
    if (!out.bikes.includes(out.bike)) out.bike = out.bikes[0]!;
    return out;
  } catch {
    return structuredClone(DEFAULT_PROFILE);
  }
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export interface RunRecord {
  mode: GameMode;
  scene: SceneId;
  seed: number;
  dayKey?: number;
  score: number;
  distanceM: number;
  topKmh: number;
  nearMisses: number;
  bestCombo: number;
}

/** Records a finished run. Returns whether it is a new personal best for its board. */
export function recordRun(p: Profile, r: RunRecord): { newBest: boolean; coins: number } {
  p.totalRuns++;
  p.totalDistanceM += r.distanceM;
  const coins = Math.floor(r.score / 100);
  p.coins += coins;
  const entry: BestEntry = {
    score: r.score,
    distanceM: r.distanceM,
    topKmh: r.topKmh,
    nearMisses: r.nearMisses,
    bestCombo: r.bestCombo,
    at: Date.now(),
    seed: r.seed,
  };
  let newBest = false;
  if (r.mode === 'daily' && r.dayKey) {
    const prev = p.daily.best[r.dayKey];
    if (!prev || r.score > prev.score) {
      p.daily.best[r.dayKey] = entry;
      newBest = true;
    }
    if (p.daily.lastDay !== r.dayKey) {
      p.daily.streak = isYesterday(p.daily.lastDay, r.dayKey) ? p.daily.streak + 1 : 1;
      p.daily.lastDay = r.dayKey;
    }
    // Keep the map small.
    const keys = Object.keys(p.daily.best)
      .map(Number)
      .sort((a, b) => b - a);
    for (const k of keys.slice(30)) delete p.daily.best[k];
  } else if (r.mode !== 'free') {
    const prev = p.bests[r.scene];
    if (!prev || r.score > prev.score) {
      p.bests[r.scene] = entry;
      newBest = true;
    }
  }
  saveProfile(p);
  return { newBest, coins };
}

function isYesterday(prevKey: number, todayKey: number): boolean {
  if (!prevKey) return false;
  const d = (k: number) =>
    new Date(Math.floor(k / 10000), Math.floor((k % 10000) / 100) - 1, k % 100);
  const diff = (d(todayKey).getTime() - d(prevKey).getTime()) / 86400000;
  return Math.round(diff) === 1;
}
