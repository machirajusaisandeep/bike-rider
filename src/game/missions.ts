import type { SceneId } from '../world/scenes';
import type { RunStats } from './Run';

/**
 * Data-driven missions. Each is evaluated from the run's stats plus a few live counters the
 * game tracks (`MissionLive`). Pure, so the summary screen and the mission list agree.
 */
export type MissionType =
  | 'distance' // ride N metres
  | 'nearMisses' // N near misses in one run
  | 'noBrake' // ride N metres without touching the brake
  | 'timeTrial' // reach N metres within `limitS` seconds
  | 'topSpeed' // hit N km/h
  | 'survive' // stay alive N seconds
  | 'combo' // reach a ×N combo
  | 'score' // score N points
  | 'deliver' // pass N parcel checkpoints (every 400 m)
  | 'clean'; // ride N metres without any hit

export interface Mission {
  id: string;
  scene: SceneId;
  tier: 1 | 2 | 3;
  title: string;
  desc: string;
  type: MissionType;
  target: number;
  /** For timeTrial. */
  limitS?: number;
  reward: number;
  /** Profile unlock id granted on completion, e.g. 'weather:rain'. */
  unlocks?: string;
}

/** Live counters the game maintains during a mission run. */
export interface MissionLive {
  score: number;
  brakeTaps: number;
  /** Metres ridden since the last brake tap. */
  noBrakeM: number;
  /** Metres ridden since the last hit. */
  cleanM: number;
  parcels: number;
  currentCombo: number;
}

export const PARCEL_INTERVAL_M = 400;

export interface MissionProgress {
  /** 0..1 */
  progress: number;
  done: boolean;
  /** Mission can no longer be completed in this run (time trial expired, etc). */
  failed: boolean;
  label: string;
}

export function evaluateMission(m: Mission, s: RunStats, live: MissionLive): MissionProgress {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  switch (m.type) {
    case 'distance': {
      const p = clamp01(s.distanceM / m.target);
      return {
        progress: p,
        done: p >= 1,
        failed: false,
        label: `${(s.distanceM / 1000).toFixed(1)} / ${(m.target / 1000).toFixed(1)} km`,
      };
    }
    case 'nearMisses': {
      const p = clamp01(s.nearMisses / m.target);
      return {
        progress: p,
        done: p >= 1,
        failed: false,
        label: `${s.nearMisses} / ${m.target} near misses`,
      };
    }
    case 'noBrake': {
      const p = clamp01(live.noBrakeM / m.target);
      return {
        progress: p,
        done: p >= 1,
        failed: false,
        label: `${Math.round(live.noBrakeM)} / ${m.target} m no brakes`,
      };
    }
    case 'clean': {
      const p = clamp01(live.cleanM / m.target);
      return {
        progress: p,
        done: p >= 1,
        failed: false,
        label: `${Math.round(live.cleanM)} / ${m.target} m clean`,
      };
    }
    case 'timeTrial': {
      const p = clamp01(s.distanceM / m.target);
      const left = Math.max(0, (m.limitS ?? 0) - s.durationS);
      const done = p >= 1 && s.durationS <= (m.limitS ?? Infinity);
      return {
        progress: p,
        done,
        failed: !done && left <= 0,
        label: `${(s.distanceM / 1000).toFixed(2)} / ${(m.target / 1000).toFixed(1)} km · ${Math.ceil(left)} s left`,
      };
    }
    case 'topSpeed': {
      const p = clamp01(s.topKmh / m.target);
      return {
        progress: p,
        done: p >= 1,
        failed: false,
        label: `${Math.round(s.topKmh)} / ${m.target} km/h`,
      };
    }
    case 'survive': {
      const p = clamp01(s.durationS / m.target);
      return {
        progress: p,
        done: p >= 1,
        failed: false,
        label: `${Math.floor(s.durationS)} / ${m.target} s`,
      };
    }
    case 'combo': {
      const best = Math.max(s.bestCombo, live.currentCombo);
      const p = clamp01(best / m.target);
      return { progress: p, done: p >= 1, failed: false, label: `×${best} / ×${m.target} combo` };
    }
    case 'score': {
      const p = clamp01(live.score / m.target);
      return {
        progress: p,
        done: p >= 1,
        failed: false,
        label: `${Math.round(live.score).toLocaleString('en-IN')} / ${m.target.toLocaleString('en-IN')} pts`,
      };
    }
    case 'deliver': {
      const p = clamp01(live.parcels / m.target);
      return {
        progress: p,
        done: p >= 1,
        failed: false,
        label: `${live.parcels} / ${m.target} parcels`,
      };
    }
  }
}

const M = (
  scene: SceneId,
  n: number,
  tier: 1 | 2 | 3,
  type: MissionType,
  target: number,
  title: string,
  desc: string,
  reward: number,
  extra: Partial<Mission> = {},
): Mission => ({ id: `${scene}-${n}`, scene, tier, type, target, title, desc, reward, ...extra });

export const MISSIONS: Mission[] = [
  // ---- Munnar
  M('munnar', 1, 1, 'distance', 1500, 'Tea run', 'Ride 1.5 km through the estates.', 150),
  M('munnar', 2, 1, 'nearMisses', 5, 'Estate traffic', 'Five near misses in one run.', 200),
  M(
    'munnar',
    3,
    2,
    'noBrake',
    800,
    'Trust the tyres',
    'Ride 800 m without touching the brake.',
    300,
  ),
  M(
    'munnar',
    4,
    2,
    'deliver',
    3,
    'Tea to Top Station',
    'Deliver 3 parcels along the hill road.',
    350,
  ),
  M('munnar', 5, 2, 'combo', 3, 'Threading the needle', 'Chain a ×3 near-miss combo.', 350),
  M('munnar', 6, 3, 'timeTrial', 2500, 'Mattupetty sprint', 'Cover 2.5 km in under 110 s.', 600, {
    limitS: 110,
  }),
  M('munnar', 7, 3, 'clean', 2000, 'Not a scratch', '2 km without a single hit.', 600, {
    unlocks: 'weather:fog',
  }),
  M('munnar', 8, 3, 'score', 8000, 'Estate legend', 'Score 8,000 in one run.', 900, {
    unlocks: 'bike:shotgun650',
  }),
  // ---- Ladakh
  M('ladakh', 1, 1, 'distance', 2000, 'Thin air', 'Ride 2 km of high desert.', 150),
  M('ladakh', 2, 1, 'topSpeed', 100, 'Open road', 'Hit 100 km/h on the plateau.', 200),
  M('ladakh', 3, 2, 'survive', 90, 'Convoy dodger', 'Stay alive 90 s among the army trucks.', 300),
  M('ladakh', 4, 2, 'clean', 1500, 'Rock garden', '1.5 km without hitting a rock.', 350),
  M('ladakh', 5, 2, 'nearMisses', 8, 'Tanker tango', 'Eight near misses in one run.', 400),
  M('ladakh', 6, 3, 'timeTrial', 3000, 'Reach Khardung La', 'Cover 3 km in under 130 s.', 650, {
    limitS: 130,
  }),
  M('ladakh', 7, 3, 'deliver', 4, 'Supplies for Nubra', 'Deliver 4 parcels up the pass.', 650, {
    unlocks: 'weather:snow',
  }),
  M('ladakh', 8, 3, 'score', 10000, 'Roof of the world', 'Score 10,000 in one run.', 1000, {
    unlocks: 'bike:supermeteor650',
  }),
  // ---- Wayanad
  M('wayanad', 1, 1, 'distance', 1500, 'Into the ghat', 'Ride 1.5 km of rainforest road.', 150),
  M('wayanad', 2, 1, 'survive', 60, 'Monsoon minute', 'Survive 60 s of puddles and potholes.', 200),
  M(
    'wayanad',
    3,
    2,
    'noBrake',
    600,
    'Wet and brave',
    '600 m without braking on a slick road.',
    300,
  ),
  M('wayanad', 4, 2, 'nearMisses', 6, 'Bus stop bravado', 'Six near misses in one run.', 350),
  M('wayanad', 5, 2, 'deliver', 3, 'Spice run', 'Deliver 3 parcels through the ghat.', 350),
  M('wayanad', 6, 3, 'clean', 1800, 'Dry socks', '1.8 km without a hit.', 600, {
    unlocks: 'weather:rain',
  }),
  M('wayanad', 7, 3, 'combo', 4, 'Hairpin heaven', 'Chain a ×4 combo.', 650, {
    unlocks: 'bike:bear650',
  }),
  M('wayanad', 8, 3, 'score', 8000, 'Ghat ghost', 'Score 8,000 in one run.', 900, {
    unlocks: 'bike:classic650',
  }),
  // ---- Ooty
  M('ooty', 1, 1, 'distance', 1500, 'Pine air', 'Ride 1.5 km of hill station road.', 150),
  M('ooty', 2, 1, 'nearMisses', 5, 'Cow country', 'Five near misses in one run.', 200),
  M('ooty', 3, 2, 'topSpeed', 105, 'Downhill dash', 'Hit 105 km/h.', 300),
  M('ooty', 4, 2, 'deliver', 3, 'Chocolate delivery', 'Deliver 3 parcels to town.', 350),
  M('ooty', 5, 2, 'clean', 1500, 'Breaker respect', '1.5 km with no hits.', 350),
  M('ooty', 6, 3, 'timeTrial', 2500, '36 hairpins', 'Cover 2.5 km in under 105 s.', 650, {
    limitS: 105,
    unlocks: 'bike:bullet650',
  }),
  M('ooty', 7, 3, 'combo', 4, 'Bus weaver', 'Chain a ×4 combo.', 650),
  M('ooty', 8, 3, 'score', 9000, 'Queen of hills', 'Score 9,000 in one run.', 900, {
    unlocks: 'bike:gt650',
  }),
  // ---- Varkala
  M('varkala', 1, 1, 'distance', 1200, 'Cliff cruise', 'Ride 1.2 km along the cliff.', 150),
  M('varkala', 2, 1, 'noBrake', 500, 'Sea breeze', '500 m without braking.', 200),
  M('varkala', 3, 2, 'nearMisses', 6, 'Auto alley', 'Six near misses in one run.', 300),
  M('varkala', 4, 2, 'survive', 75, 'Sunset survivor', 'Stay alive 75 s.', 300),
  M('varkala', 5, 2, 'deliver', 3, 'Fish to the shacks', 'Deliver 3 parcels along the cliff.', 350),
  M('varkala', 6, 3, 'clean', 1500, 'No sand in the chain', '1.5 km with no hits.', 600),
  M('varkala', 7, 3, 'timeTrial', 2000, 'Beat the tide', 'Cover 2 km in under 85 s.', 650, {
    limitS: 85,
  }),
  M('varkala', 8, 3, 'score', 7500, 'Cliff king', 'Score 7,500 in one run.', 900, {
    unlocks: 'bike:goan350',
  }),
  // ---- Bengaluru
  M('bengaluru', 1, 1, 'distance', 1500, 'Ring road', 'Ride 1.5 km of city traffic.', 150),
  M('bengaluru', 2, 1, 'nearMisses', 8, 'Signal jumper', 'Eight near misses in one run.', 250),
  M('bengaluru', 3, 2, 'deliver', 3, 'Dabba delivery', 'Deliver 3 parcels across town.', 350),
  M('bengaluru', 4, 2, 'survive', 90, 'Peak hour', 'Survive 90 s at 6 pm.', 350),
  M('bengaluru', 5, 2, 'combo', 4, 'Lane splitter', 'Chain a ×4 combo.', 400),
  M('bengaluru', 6, 3, 'clean', 1500, 'Pothole prophet', '1.5 km without a hit.', 600, {
    unlocks: 'bike:guerrilla450',
  }),
  M('bengaluru', 7, 3, 'timeTrial', 3000, 'Airport run', 'Cover 3 km in under 125 s.', 700, {
    limitS: 125,
  }),
  M('bengaluru', 8, 3, 'score', 12000, 'Namma legend', 'Score 12,000 in one run.', 1200, {
    unlocks: 'bike:twin650',
  }),
];

export const MISSION_BY_ID: Record<string, Mission> = Object.fromEntries(
  MISSIONS.map((m) => [m.id, m]),
);

export function missionsFor(scene: SceneId): Mission[] {
  return MISSIONS.filter((m) => m.scene === scene);
}

/** A tier unlocks when the previous tier of that scene has at least 2 completions. */
export function missionAvailable(m: Mission, done: string[]): boolean {
  if (m.tier === 1) return true;
  const prevDone = missionsFor(m.scene).filter((x) => x.tier === m.tier - 1 && done.includes(x.id));
  return prevDone.length >= 2;
}
