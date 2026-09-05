import { describe, expect, it } from 'vitest';
import { DEFAULT_RIDER, GEAR, protectionFor, sanitizeRider, SLOTS } from './gear';

describe('protectionFor', () => {
  it('is 0 with no gear and 100 with the best item in every slot', () => {
    const naked = structuredClone(DEFAULT_RIDER);
    for (const s of SLOTS) naked.gear[s] = null;
    expect(protectionFor(naked).total).toBe(0);
    expect(protectionFor(naked).exposed.length).toBeGreaterThan(0);

    const full = structuredClone(DEFAULT_RIDER);
    for (const s of SLOTS) {
      const best = GEAR.filter((g) => g.slot === s).sort(
        (a, b) =>
          Object.values(b.covers).reduce((x, y) => x + y, 0) -
          Object.values(a.covers).reduce((x, y) => x + y, 0),
      )[0];
      full.gear[s] = best?.id ?? null;
    }
    const p = protectionFor(full);
    expect(p.total).toBeLessThanOrEqual(100);
    expect(p.total).toBeGreaterThanOrEqual(90);
  });

  it('never exceeds 100', () => {
    expect(protectionFor(DEFAULT_RIDER).total).toBeLessThanOrEqual(100);
  });
});

describe('sanitizeRider', () => {
  it('repairs garbage input', () => {
    const r = sanitizeRider({ body: 'octopus', gear: { helmet: 'nope' } });
    expect(['male', 'female']).toContain(r.body);
    expect(r.gear.helmet === null || typeof r.gear.helmet === 'string').toBe(true);
  });
});
