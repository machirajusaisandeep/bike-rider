import { describe, expect, it } from 'vitest';
import { hornMagnitude, hornReaction, hornTargets } from './horn';

describe('hornReaction', () => {
  it('scares livestock, flinches two-wheelers, brakes cars, blinks heavies', () => {
    expect(hornReaction('cow')).toBe('scare');
    expect(hornReaction('goat')).toBe('scare');
    expect(hornReaction('scooter')).toBe('flinch');
    expect(hornReaction('hatch')).toBe('brake');
    expect(hornReaction('bus')).toBe('blink');
    expect(hornReaction('pier')).toBe('none');
  });
});

describe('hornTargets', () => {
  const bikeZ = 0;
  const obs = [
    { id: 1, kind: 'cow', z: -10 },
    { id: 2, kind: 'hatch', z: -5 },
    { id: 3, kind: 'bus', z: -40 },
    { id: 4, kind: 'pier', z: -8 },
    { id: 5, kind: 'cow', z: 8 },
  ];
  it('only returns reacting obstacles ahead within range', () => {
    const t = hornTargets(obs, bikeZ, 18);
    expect(t.map((x) => x.id).sort()).toEqual([1, 2]);
    expect(t.find((x) => x.id === 1)?.reaction).toBe('scare');
    expect(t.find((x) => x.id === 2)?.reaction).toBe('brake');
  });
});

describe('hornMagnitude', () => {
  it('is stable and in 0.55..1', () => {
    expect(hornMagnitude(7)).toBe(hornMagnitude(7));
    expect(hornMagnitude(1)).toBeGreaterThanOrEqual(0.55);
    expect(hornMagnitude(1)).toBeLessThanOrEqual(1);
  });
});
