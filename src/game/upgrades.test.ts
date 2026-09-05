import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, type Profile } from '../core/profile';
import { bikeState, buyBike, buyUpgrade, BIKES, MAX_LEVEL, tuneFor, UPGRADES } from './upgrades';

const prof = (coins = 0): Profile => ({ ...structuredClone(DEFAULT_PROFILE), coins });

describe('upgrades', () => {
  it('stock bike with no upgrades is 1.0 everywhere', () => {
    expect(tuneFor(prof())).toEqual({ power: 1, brakes: 1, grip: 1, offroad: 1 });
  });

  it('buying raises the level, spends coins and changes tune', () => {
    const p = prof(1000);
    expect(buyUpgrade(p, 'power')).toBe(true);
    expect(p.upgrades.power).toBe(1);
    expect(p.coins).toBe(800);
    expect(tuneFor(p).power).toBeCloseTo(1.08);
    expect(buyUpgrade(p, 'power')).toBe(true); // 450
    expect(buyUpgrade(p, 'power')).toBe(false); // 800 > 350 left
  });

  it('caps at MAX_LEVEL', () => {
    const p = prof(1e6);
    for (let i = 0; i < 10; i++) buyUpgrade(p, 'brakes');
    expect(p.upgrades.brakes).toBe(MAX_LEVEL);
    expect(UPGRADES.every((u) => u.costs.length === MAX_LEVEL)).toBe(true);
  });

  it('bikes: locked needs an unlock, poor needs coins', () => {
    const p = prof(100);
    expect(bikeState(p, BIKES[1]!)).toBe('poor');
    expect(bikeState(p, BIKES[3]!)).toBe('locked');
    p.coins = 10000;
    expect(bikeState(p, BIKES[3]!)).toBe('locked');
    p.unlocks.push('bike:twin650');
    expect(bikeState(p, BIKES[3]!)).toBe('buyable');
    expect(buyBike(p, 'twin650')).toBe(true);
    expect(p.bike).toBe('twin650');
    expect(bikeState(p, BIKES[3]!)).toBe('owned');
  });
});
