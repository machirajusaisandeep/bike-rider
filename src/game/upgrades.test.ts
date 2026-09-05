import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, type Profile } from '../core/profile';
import { BIKES, bikeById, resolveBikeId } from './bikes';
import { bikeState, buyUpgrade, MAX_LEVEL, selectBike, tuneFor, UPGRADES } from './upgrades';

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

  it('every catalog bike is selectable with no coins or unlocks', () => {
    const p = prof(0);
    for (const b of BIKES) {
      expect(bikeState(p, b)).toBe('owned');
      expect(selectBike(p, b.id)).toBe(true);
      expect(p.bike).toBe(b.id);
    }
  });
});

describe('bike catalog', () => {
  it('has unique ids and a free starter', () => {
    const ids = BIKES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(bikeById('scram').price).toBe(0);
    expect(bikeById('scram').name).toBe('Scram 440');
  });

  it('keeps legacy profile ids', () => {
    expect(bikeById('classic350').name).toBe('Classic 350');
    expect(bikeById('adv450').name).toBe('Himalayan 450');
    expect(bikeById('twin650').name).toBe('Interceptor 650');
    expect(resolveBikeId('himalayan450')).toBe('adv450');
    expect(resolveBikeId('scram411')).toBe('scram');
  });

  it('650 twins stay within 15% of the starter top speed', () => {
    const cap = bikeById('scram').chassis.maxSpeed * 1.15;
    for (const b of BIKES.filter((x) => x.chassis.engine === 'twin')) {
      expect(b.chassis.maxSpeed).toBeLessThanOrEqual(cap + 1e-6);
    }
  });

  it('unknown id falls back to the starter', () => {
    expect(bikeById('nope').id).toBe('scram');
  });

  it('every bike is free', () => {
    expect(BIKES.every((b) => b.price === 0)).toBe(true);
  });
});
