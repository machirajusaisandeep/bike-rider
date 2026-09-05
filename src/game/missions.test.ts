import { describe, expect, it } from 'vitest';
import { freshStats } from './Run';
import {
  evaluateMission,
  MISSION_BY_ID,
  MISSIONS,
  missionAvailable,
  type MissionLive,
} from './missions';

const live = (o: Partial<MissionLive> = {}): MissionLive => ({
  score: 0,
  brakeTaps: 0,
  noBrakeM: 0,
  cleanM: 0,
  parcels: 0,
  currentCombo: 0,
  ...o,
});

describe('missions data', () => {
  it('has unique ids and 8 per scene', () => {
    const ids = new Set(MISSIONS.map((m) => m.id));
    expect(ids.size).toBe(MISSIONS.length);
    const perScene = new Map<string, number>();
    for (const m of MISSIONS) perScene.set(m.scene, (perScene.get(m.scene) ?? 0) + 1);
    for (const n of perScene.values()) expect(n).toBe(8);
  });

  it('time trials all carry a limit', () => {
    for (const m of MISSIONS.filter((m) => m.type === 'timeTrial'))
      expect(m.limitS).toBeGreaterThan(0);
  });
});

describe('evaluateMission', () => {
  it('distance completes at target', () => {
    const s = freshStats();
    s.distanceM = 1500;
    const r = evaluateMission(MISSION_BY_ID['munnar-1']!, s, live());
    expect(r.done).toBe(true);
    expect(r.progress).toBe(1);
  });

  it('time trial fails once the clock runs out', () => {
    const m = MISSION_BY_ID['munnar-6']!;
    const s = freshStats();
    s.distanceM = 1000;
    s.durationS = 120;
    const r = evaluateMission(m, s, live());
    expect(r.done).toBe(false);
    expect(r.failed).toBe(true);
    s.distanceM = 2500;
    s.durationS = 100;
    expect(evaluateMission(m, s, live()).done).toBe(true);
  });

  it('noBrake uses the live counter', () => {
    const m = MISSION_BY_ID['munnar-3']!;
    expect(evaluateMission(m, freshStats(), live({ noBrakeM: 799 })).done).toBe(false);
    expect(evaluateMission(m, freshStats(), live({ noBrakeM: 800 })).done).toBe(true);
  });

  it('tier gating needs two completions of the previous tier', () => {
    const t2 = MISSION_BY_ID['munnar-3']!;
    expect(missionAvailable(t2, [])).toBe(false);
    expect(missionAvailable(t2, ['munnar-1'])).toBe(false);
    expect(missionAvailable(t2, ['munnar-1', 'munnar-2'])).toBe(true);
  });
});
