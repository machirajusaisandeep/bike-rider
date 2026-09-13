import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RIDER,
  FACES,
  GEAR,
  HAIR,
  HAIR_OUT,
  MORPH_NAMES,
  protectionFor,
  riderForBody,
  sanitizeRider,
  SLOTS,
} from './gear';

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

describe('rider presets', () => {
  it('only use morph targets the GLB exports', () => {
    for (const body of ['male', 'female'] as const) {
      expect(FACES[body].length).toBeGreaterThanOrEqual(8);
      for (const f of FACES[body]) {
        for (const [name, w] of Object.entries(f.morphs)) {
          expect(MORPH_NAMES).toContain(name);
          expect(Math.abs(w)).toBeLessThanOrEqual(1);
        }
      }
      expect(HAIR[body].length).toBeGreaterThan(0);
    }
    for (const h of HAIR_OUT) expect([...HAIR.male, ...HAIR.female]).toContain(h);
  });
});

describe('sanitizeRider accents', () => {
  it('defaults kajal per body and keeps bindi / earrings female-only', () => {
    expect(sanitizeRider({}).kajal).toBe(false);
    expect(sanitizeRider({ body: 'female' }).kajal).toBe(true);
    const male = sanitizeRider({ body: 'male', bindi: 'red', earrings: 'jhumka' });
    expect(male.bindi).toBe('none');
    expect(male.earrings).toBe('none');
    const female = sanitizeRider({
      body: 'female',
      bindi: 'red',
      earrings: 'jhumka',
      kajal: false,
    });
    expect(female.bindi).toBe('red');
    expect(female.earrings).toBe('jhumka');
    expect(female.kajal).toBe(false);
  });

  it('falls back for removed hair colours and unknown turban colours', () => {
    const r = sanitizeRider({ hairColor: 'blonde', turbanColor: 'pink', hair: 'nope' });
    expect(r.hairColor).toBe('black');
    expect(r.turbanColor).toBe('saffron');
    expect(r.hair).toBe(HAIR.male[0]);
  });

  it('resets accents when switching body', () => {
    const f = riderForBody(sanitizeRider({ body: 'female', bindi: 'red' }), 'male');
    expect(f.bindi).toBe('none');
    expect(f.kajal).toBe(false);
    expect(riderForBody(DEFAULT_RIDER, 'female').kajal).toBe(true);
  });
});
