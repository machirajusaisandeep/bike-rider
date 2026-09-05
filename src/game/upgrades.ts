import type { Profile, UpgradeKey } from '../core/profile';

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

export interface BikeDef {
  id: string;
  name: string;
  blurb: string;
  price: number;
  /** Hex paint for the procedural bike's tank and body. */
  paint: string;
  accent: string;
  /** Base tuning before upgrades. */
  tune: { power: number; brakes: number; grip: number; offroad: number };
  /** Unlock id required (from missions), if any. */
  requires?: string;
}

/**
 * Original, non-licensed bikes. The stock bike keeps the White Flame look; the others are
 * generic archetypes so the public build never ships a manufacturer's trade dress.
 */
export const BIKES: BikeDef[] = [
  {
    id: 'scram',
    name: 'Scrambler 411',
    blurb: 'The all-rounder you started on. Balanced, forgiving, happy on gravel.',
    price: 0,
    paint: '#f2f2f2',
    accent: '#ff5a1f',
    tune: { power: 1, brakes: 1, grip: 1, offroad: 1 },
  },
  {
    id: 'classic350',
    name: 'Retro 350',
    blurb: 'Thump and chrome. Slower, but plants itself in corners.',
    price: 1500,
    paint: '#2a4d3a',
    accent: '#d8b45a',
    tune: { power: 0.88, brakes: 1.05, grip: 1.12, offroad: 0.85 },
  },
  {
    id: 'adv450',
    name: 'Adventure 450',
    blurb: 'Long travel, big tank. Built for Ladakh.',
    price: 3500,
    paint: '#c9cfd6',
    accent: '#1f6f8b',
    tune: { power: 1.08, brakes: 1.05, grip: 1.0, offroad: 1.35 },
  },
  {
    id: 'twin650',
    name: 'Twin 650',
    blurb: 'Two cylinders and a long wheelbase. The fastest thing here.',
    price: 6000,
    paint: '#1a1a1a',
    accent: '#ffb428',
    tune: { power: 1.3, brakes: 1.1, grip: 1.05, offroad: 0.8 },
    requires: 'bike:twin650',
  },
];

export const BIKE_BY_ID: Record<string, BikeDef> = Object.fromEntries(BIKES.map((b) => [b.id, b]));

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
  const bike = BIKE_BY_ID[p.bike] ?? BIKES[0]!;
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

export function bikeState(p: Profile, b: BikeDef): 'owned' | 'locked' | 'buyable' | 'poor' {
  if (p.bikes.includes(b.id)) return 'owned';
  if (b.requires && !p.unlocks.includes(b.requires)) return 'locked';
  return p.coins >= b.price ? 'buyable' : 'poor';
}

export function buyBike(p: Profile, id: string): boolean {
  const b = BIKE_BY_ID[id];
  if (!b || bikeState(p, b) !== 'buyable') return false;
  p.coins -= b.price;
  p.bikes.push(id);
  p.bike = id;
  return true;
}
