import { describe, expect, it } from 'vitest';
import { Governor, _test } from './governor';

describe('governor helpers', () => {
  it('median ignores a single spike', () => {
    expect(_test.median([16, 16, 16, 80, 16])).toBe(16);
  });
  it('maps frame time to a tier', () => {
    expect(_test.wantFromMs(16)).toBe('high');
    expect(_test.wantFromMs(24)).toBe('medium');
    expect(_test.wantFromMs(40)).toBe('low');
  });
});

describe('Governor', () => {
  it('does not demote on one slow frame', () => {
    const g = new Governor('high');
    expect(g.sample(16)).toBeNull();
    expect(g.sample(80)).toBeNull();
    expect(g.current).toBe('high');
  });

  it('demotes after enough slow frames', () => {
    const g = new Governor('high');
    for (let i = 0; i < 80; i++) g.sample(40);
    expect(g.current).toBe('low');
  });

  it('promotes only after a long stretch of fast frames', () => {
    const g = new Governor('low');
    for (let i = 0; i < 20; i++) g.sample(16);
    expect(g.current).toBe('low');
    for (let i = 0; i < 120; i++) g.sample(16);
    expect(g.current).toBe('high');
  });
});
