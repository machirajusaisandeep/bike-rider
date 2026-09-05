import { describe, expect, it } from 'vitest';
import { RoadPath } from './roadPath';
import { SCENES } from './scenes';

describe('RoadPath', () => {
  it('is deterministic and continuous for every scene', () => {
    for (const def of SCENES) {
      const a = new RoadPath(def);
      const b = new RoadPath(def);
      for (let z = 0; z > -4000; z -= 37) {
        expect(a.centerX(z)).toBe(b.centerX(z));
        // continuity: a metre of road never jumps more than the slope allows
        const dx = Math.abs(a.centerX(z) - a.centerX(z - 1));
        expect(dx).toBeLessThan(2);
      }
    }
  });

  it('lateral is zero on the centreline', () => {
    const p = new RoadPath(SCENES[0]!);
    for (let z = 0; z > -1000; z -= 100) {
      expect(Math.abs(p.lateral(p.centerX(z), z))).toBeLessThan(1e-9);
    }
  });
});
