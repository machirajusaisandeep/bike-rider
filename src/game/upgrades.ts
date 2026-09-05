import type { Profile, UpgradeKey } from '../core/profile';
import { BIKES, bikeById, type BikeDef } from './bikes';

export type { BikeDef, BikeChassis, BikeFamily, BikeCategory } from './bikes';
export { BIKES, BIKE_BY_ID, bikeById, resolveBikeId, CATEGORY_LABEL, CATEGORY_ORDER } from './bikes';

/**
 * Coins → bike tuning. Effects are multipliers applied to BikePhysics.tune, so the arcade feel
 * in config.ts stays the single source of truth and upgrades scale it.
 */
export interface UpgradeDef {
  key: UpgradeKey;
  name: string;
  desc: string;
  /** Cost per level (index 0 = level 1). */
  costs: number[];
  /** Multiplier gained per level. */
  perLevel: number;
  stat: string;
}

export const UPGRADES: UpgradeDef[] = [
  {
    key: 'power',
    name: 'Engine',
    desc: 'Bigger bore, freer exhaust. Faster acceleration.',
    costs: [200, 450, 800, 1300, 2000],
    perLevel: 0.08,
    stat: 'acceleration',
  },
  {
    key: 'brakes',
    name: 'Brakes',
    desc: 'Sintered pads and a braided line. Stop shorter.',
    costs: [150, 350, 650, 1100, 1700],
    perLevel: 0.09,
    stat: 'braking',
  },
  {
    key: 'tyres',
    name: 'Tyres',
    desc: 'Stickier dual-purpose rubber. More grip everywhere.',
    costs: [200, 450, 800, 1300, 2000],
    perLevel: 0.06,
    stat: 'grip',
  },
  {
    key: 'suspension',
    name: 'Suspension',
    desc: 'Longer travel, better damping. Faster on gravel and dirt.',
    costs: [180, 400, 750, 1200, 1800],
    perLevel: 0.1,
    stat: 'off-road speed',
  },
];

export const MAX_LEVEL = 5;

export function upgradeCost(def: UpgradeDef, currentLevel: number): number | null {
  return currentLevel >= MAX_LEVEL ? null : (def.costs[currentLevel] ?? null);
}

/** Final tuning for the profile's current bike + upgrade levels. */
export function tuneFor(p: Profile): {
  power: number;
  brakes: number;
  grip: number;
  offroad: number;
} {
  const bike = bikeById(p.bike);
  const lvl = (k: UpgradeKey) => Math.max(0, Math.min(MAX_LEVEL, p.upgrades[k] ?? 0));
  const per = (k: UpgradeKey) => UPGRADES.find((u) => u.key === k)!.perLevel;
  return {
    power: bike.tune.power * (1 + lvl('power') * per('power')),
    brakes: bike.tune.brakes * (1 + lvl('brakes') * per('brakes')),
    grip: bike.tune.grip * (1 + lvl('tyres') * per('tyres')),
    offroad: bike.tune.offroad * (1 + lvl('suspension') * per('suspension')),
  };
}

export function canBuyUpgrade(p: Profile, key: UpgradeKey): { ok: boolean; cost: number | null } {
  const def = UPGRADES.find((u) => u.key === key)!;
  const cost = upgradeCost(def, p.upgrades[key] ?? 0);
  return { ok: cost !== null && p.coins >= cost, cost };
}

/** Mutates the profile. Returns false when unaffordable / maxed. */
export function buyUpgrade(p: Profile, key: UpgradeKey): boolean {
  const { ok, cost } = canBuyUpgrade(p, key);
  if (!ok || cost === null) return false;
  p.coins -= cost;
  p.upgrades[key] = (p.upgrades[key] ?? 0) + 1;
  return true;
}

export function bikeState(_p: Profile, _b: BikeDef): 'owned' | 'locked' | 'buyable' | 'poor' {
  return 'owned';
}

/** Select a bike. Every catalog entry is available; no coins or missions required. */
export function selectBike(p: Profile, id: string): boolean {
  const b = BIKES.find((x) => x.id === id) ?? null;
  if (!b) return false;
  if (!p.bikes.includes(id)) p.bikes.push(id);
  p.bike = id;
  return true;
}

export function buyBike(p: Profile, id: string): boolean {
  return selectBike(p, id);
}
