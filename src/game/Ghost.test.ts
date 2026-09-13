import { describe, expect, it } from 'vitest';
import { ghostTimeAtZ } from './Ghost';

function pack(samples: [number, number, number, number, number, number][]): Float32Array {
  const d = new Float32Array(samples.length * 6);
  samples.forEach((s, i) => {
    d.set(s, i * 6);
  });
  return d;
}

describe('ghostTimeAtZ', () => {
  it('interpolates time at a known z', () => {
    const d = pack([
      [0, 0, 0, 0, 0, 0],
      [2, 0, 0, -20, 0, 0],
      [4, 0, 0, -40, 0, 0],
    ]);
    expect(ghostTimeAtZ(d, -10)).toBeCloseTo(1);
    expect(ghostTimeAtZ(d, -30)).toBeCloseTo(3);
  });

  it('returns null outside the span', () => {
    const d = pack([
      [0, 0, 0, 0, 0, 0],
      [1, 0, 0, -10, 0, 0],
    ]);
    expect(ghostTimeAtZ(d, 50)).toBeNull();
  });
});
