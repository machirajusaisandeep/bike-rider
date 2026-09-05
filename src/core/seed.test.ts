import { describe, expect, it } from 'vitest';
import { dailyScene, dailySeed, parseSeed, randomSeed, todayKey } from './seed';
import { seededRandom } from '../world/roadPath';

describe('seededRandom', () => {
  it('is deterministic for the same seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });
  it('differs between seeds and stays in [0,1)', () => {
    const a = seededRandom(1);
    const b = seededRandom(2);
    let same = 0;
    for (let i = 0; i < 50; i++) {
      const x = a();
      const y = b();
      if (x === y) same++;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(same).toBeLessThan(3);
  });
});

describe('daily seed', () => {
  it('maps a day key to a stable seed', () => {
    expect(dailySeed(20260905)).toBe(dailySeed(20260905));
    expect(dailySeed(20260905)).not.toBe(dailySeed(20260906));
    expect(dailySeed(20260905)).toBeGreaterThan(0);
  });
  it('rotates scenes day to day', () => {
    const a = dailyScene(20260905);
    const b = dailyScene(20260906);
    expect(a).not.toBe(b);
  });
  it('todayKey formats YYYYMMDD', () => {
    expect(todayKey(new Date(2026, 8, 5))).toBe(20260905);
  });
});

describe('parseSeed', () => {
  it('accepts positive integers only', () => {
    expect(parseSeed('123')).toBe(123);
    expect(parseSeed('0')).toBeNull();
    expect(parseSeed('-4')).toBeNull();
    expect(parseSeed('1.5')).toBeNull();
    expect(parseSeed('abc')).toBeNull();
    expect(parseSeed(null)).toBeNull();
  });
  it('randomSeed is in range', () => {
    for (let i = 0; i < 20; i++) {
      const s = randomSeed();
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(0x7fffffff);
    }
  });
});
