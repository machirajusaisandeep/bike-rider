import { describe, expect, it } from 'vitest';
import { COMBO_MULT, nearMissPoints, plausibleScore, Scoring } from './Scoring';
import { damageFor, Health } from './Health';
import { HEALTH } from '../core/config';

describe('Scoring', () => {
  it('accrues distance with the surface multiplier', () => {
    const s = new Scoring();
    s.update(1 / 120, 10, 60, 'asphalt', false, 0);
    expect(s.score).toBeCloseTo(10);
    s.update(1 / 120, 10, 60, 'gravel', false, 0);
    expect(s.score).toBeCloseTo(23);
  });

  it('chains near misses into a combo and resets on braking', () => {
    const s = new Scoring();
    const a = s.nearMiss(80);
    expect(a.points).toBe(nearMissPoints(80, 0));
    expect(s.combo).toBe(1);
    const b = s.nearMiss(80);
    expect(b.points).toBe(Math.round((100 + 160) * COMBO_MULT[1]!));
    expect(s.combo).toBe(2);
    s.update(0.1, 0, 80, 'asphalt', true, 0);
    expect(s.combo).toBe(0);
    expect(s.bestCombo).toBe(2);
  });

  it('expires the combo after the window', () => {
    const s = new Scoring();
    s.nearMiss(70);
    for (let i = 0; i < 50; i++) s.update(0.1, 0, 70, 'asphalt', false, 0);
    expect(s.combo).toBe(0);
  });

  it('awards a clean corner only without braking', () => {
    const s = new Scoring();
    for (let i = 0; i < 120; i++) s.update(1 / 100, 0, 70, 'asphalt', false, 0.5);
    const bonus = s.update(1 / 100, 0, 70, 'asphalt', false, 0);
    expect(bonus?.kind).toBe('corner');
    expect(s.corners).toBe(1);

    const t = new Scoring();
    for (let i = 0; i < 120; i++) t.update(1 / 100, 0, 70, 'asphalt', i === 50, 0.5);
    t.update(1 / 100, 0, 70, 'asphalt', false, 0);
    expect(t.corners).toBe(0);
  });

  it('pays speed bonus per second above the threshold', () => {
    const s = new Scoring();
    for (let i = 0; i < 310; i++) s.update(1 / 100, 0, 110, 'asphalt', false, 0);
    expect(s.speedSeconds).toBeCloseTo(3.1, 1);
    expect(s.bonusPoints).toBe(60);
  });
});

describe('plausibleScore', () => {
  it('accepts a normal run and rejects nonsense', () => {
    expect(plausibleScore(4200, 2500, 95)).toBe(true);
    expect(plausibleScore(5285, 810, 36)).toBe(true);
    expect(plausibleScore(1e9, 2500, 95)).toBe(false);
    expect(plausibleScore(100, 100000, 10)).toBe(false);
    expect(plausibleScore(-1, 10, 10)).toBe(false);
    expect(plausibleScore(NaN, 10, 10)).toBe(false);
  });
});

describe('Health', () => {
  it('protection reduces damage', () => {
    const bare = damageFor(60, 0);
    const full = damageFor(60, 100);
    expect(full).toBeLessThan(bare);
    expect(full).toBeCloseTo(bare * (1 - HEALTH.gearMitigation), 5);
  });

  it('harmless taps do not cost health', () => {
    const h = new Health();
    const r = h.hit(5, 0)!;
    expect(r.wobble).toBe(true);
    expect(h.hp).toBe(1);
  });

  it('an unprotected rider dies on a fast hit, a protected one survives it', () => {
    const naked = new Health();
    expect(naked.hit(95, 0)!.fatal).toBe(true);
    const geared = new Health();
    const r = geared.hit(95, 100)!;
    expect(r.fatal).toBe(false);
    expect(geared.hp).toBeGreaterThan(0);
  });

  it('ignores hits during the grace window', () => {
    const h = new Health();
    h.hit(50, 50);
    expect(h.hit(50, 50)).toBeNull();
    h.tick(HEALTH.graceS + 0.01);
    expect(h.hit(50, 50)).not.toBeNull();
  });
});
