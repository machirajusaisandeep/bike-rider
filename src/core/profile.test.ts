import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE, recordRun, type Profile } from './profile';

// localStorage shim for node
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const base = (): Profile => structuredClone(DEFAULT_PROFILE);

describe('recordRun', () => {
  beforeEach(() => store.clear());

  it('tracks bests per scene and pays coins', () => {
    const p = base();
    const a = recordRun(p, {
      mode: 'ride',
      scene: 'munnar',
      seed: 1,
      score: 1234,
      distanceM: 900,
      topKmh: 100,
      nearMisses: 3,
      bestCombo: 2,
    });
    expect(a.newBest).toBe(true);
    expect(a.coins).toBe(12);
    const b = recordRun(p, {
      mode: 'ride',
      scene: 'munnar',
      seed: 2,
      score: 1000,
      distanceM: 900,
      topKmh: 100,
      nearMisses: 3,
      bestCombo: 2,
    });
    expect(b.newBest).toBe(false);
    expect(p.bests.munnar?.score).toBe(1234);
    expect(p.totalRuns).toBe(2);
  });

  it('counts daily streaks on consecutive days only', () => {
    const p = base();
    const run = (dayKey: number) =>
      recordRun(p, {
        mode: 'daily',
        scene: 'ooty',
        seed: 5,
        dayKey,
        score: 10,
        distanceM: 10,
        topKmh: 10,
        nearMisses: 0,
        bestCombo: 0,
      });
    run(20260905);
    expect(p.daily.streak).toBe(1);
    run(20260906);
    expect(p.daily.streak).toBe(2);
    run(20260906); // same day again
    expect(p.daily.streak).toBe(2);
    run(20260910);
    expect(p.daily.streak).toBe(1);
  });

  it('free rides never set a best', () => {
    const p = base();
    const r = recordRun(p, {
      mode: 'free',
      scene: 'ooty',
      seed: 5,
      score: 0,
      distanceM: 500,
      topKmh: 80,
      nearMisses: 0,
      bestCombo: 0,
    });
    expect(r.newBest).toBe(false);
    expect(p.bests.ooty).toBeUndefined();
  });
});
