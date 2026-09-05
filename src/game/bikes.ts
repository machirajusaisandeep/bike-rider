/**
 * Playable bikes. Public builds use original procedural silhouettes (family + paint). Local
 * RE GLBs, when fetched, are an optional visual swap and are never shipped.
 *
 * Profile ids `scram`, `classic350`, `adv450` and `twin650` are stable so existing saves
 * keep working. New bikes get their own ids.
 */
import { BIKE, GEAR_THRESHOLDS_KMH } from '../core/config';

export type BikeFamily = 'scram' | 'heritage' | 'roadster' | 'cruiser' | 'adventure' | 'cafe';
export type BikeCategory = 'scrambler' | 'heritage' | 'roadster' | 'cruiser' | 'adventure' | 'sport';
export type BikeEngine = 'single' | 'twin';

export interface BikeChassis {
  wheelbase: number;
  frontWheelRadius: number;
  rearWheelRadius: number;
  maxSpeed: number;
  accel: number;
  engine: BikeEngine;
  gears: 5 | 6;
  seat: { y: number; z: number };
}

export interface BikeDef {
  id: string;
  name: string;
  category: BikeCategory;
  family: BikeFamily;
  blurb: string;
  price: number;
  paint: string;
  accent: string;
  chassis: BikeChassis;
  tune: { power: number; brakes: number; grip: number; offroad: number };
  /** Gitignored GLB relative to site base; ignored when VITE_PUBLIC_BUILD is set. */
  localModel?: string;
}

export const DEFAULT_CHASSIS: BikeChassis = {
  wheelbase: BIKE.wheelbase,
  frontWheelRadius: BIKE.frontWheelRadius,
  rearWheelRadius: BIKE.rearWheelRadius,
  maxSpeed: BIKE.maxSpeed,
  accel: BIKE.accel,
  engine: 'single',
  gears: 5,
  seat: { y: -0.13, z: 0.4 },
};

const chassis = (partial: Partial<BikeChassis> = {}): BikeChassis => ({
  ...DEFAULT_CHASSIS,
  ...partial,
  seat: { ...DEFAULT_CHASSIS.seat, ...partial.seat },
});

/** 5-speed thresholds in km/h, scaled to a bike's top speed. 6-speed inserts an extra step. */
export function gearThresholdsKmh(c: BikeChassis): number[] {
  const scale = c.maxSpeed / DEFAULT_CHASSIS.maxSpeed;
  const base = c.gears === 6 ? [0, 16, 32, 50, 70, 95] : [...GEAR_THRESHOLDS_KMH];
  return base.map((k) => k * scale);
}

export const CATEGORY_LABEL: Record<BikeCategory, string> = {
  scrambler: 'Scrambler',
  heritage: 'Heritage',
  roadster: 'Roadster',
  cruiser: 'Cruiser',
  adventure: 'Adventure',
  sport: 'Pure sport',
};

export const CATEGORY_ORDER: BikeCategory[] = [
  'scrambler',
  'heritage',
  'roadster',
  'cruiser',
  'adventure',
  'sport',
];

export const BIKES: BikeDef[] = [
  {
    id: 'scram',
    name: 'Scram 440',
    category: 'scrambler',
    family: 'scram',
    blurb: 'The all-rounder you started on. Balanced, forgiving, happy on gravel.',
    price: 0,
    paint: '#f2f2f2',
    accent: '#ff5a1f',
    chassis: chassis(),
    tune: { power: 1, brakes: 1, grip: 1, offroad: 1 },
    localModel: 'models/scram411.glb',
  },
  {
    id: 'hunter350',
    name: 'Hunter 350',
    category: 'roadster',
    family: 'roadster',
    blurb: 'Flat bars and a short wheelbase. The city bike.',
    price: 0,
    paint: '#c45c26',
    accent: '#1a1a1a',
    chassis: chassis({
      wheelbase: 1.37,
      frontWheelRadius: 0.33,
      rearWheelRadius: 0.33,
      maxSpeed: 31,
      accel: 6.2,
      seat: { y: -0.1, z: 0.38 },
    }),
    tune: { power: 1, brakes: 1.02, grip: 1.08, offroad: 0.82 },
    localModel: 'models/hunter350.glb',
  },
  {
    id: 'classic350',
    name: 'Classic 350',
    category: 'heritage',
    family: 'heritage',
    blurb: 'Thump and chrome. Slower, but plants itself in corners.',
    price: 0,
    paint: '#2a4d3a',
    accent: '#d8b45a',
    chassis: chassis({
      wheelbase: 1.39,
      frontWheelRadius: 0.34,
      rearWheelRadius: 0.325,
      maxSpeed: 30,
      accel: 5.7,
      seat: { y: -0.08, z: 0.42 },
    }),
    tune: { power: 0.96, brakes: 1.05, grip: 1.12, offroad: 0.85 },
    localModel: 'models/classic350.glb',
  },
  {
    id: 'meteor350',
    name: 'Meteor 350',
    category: 'cruiser',
    family: 'cruiser',
    blurb: 'Low seat, long days. Built for the highway cruise.',
    price: 0,
    paint: '#1b3a5a',
    accent: '#c9a227',
    chassis: chassis({
      wheelbase: 1.4,
      frontWheelRadius: 0.34,
      rearWheelRadius: 0.34,
      maxSpeed: 31,
      accel: 5.8,
      seat: { y: -0.18, z: 0.46 },
    }),
    tune: { power: 0.98, brakes: 1.02, grip: 1.06, offroad: 0.78 },
    localModel: 'models/meteor350.glb',
  },
  {
    id: 'bullet350',
    name: 'Bullet 350',
    category: 'heritage',
    family: 'heritage',
    blurb: 'The original thumper. Heavy, honest, unhurried.',
    price: 0,
    paint: '#3a2a1a',
    accent: '#c4b08a',
    chassis: chassis({
      wheelbase: 1.39,
      frontWheelRadius: 0.34,
      rearWheelRadius: 0.325,
      maxSpeed: 29.5,
      accel: 5.5,
      seat: { y: -0.08, z: 0.44 },
    }),
    tune: { power: 0.94, brakes: 1.0, grip: 1.1, offroad: 0.88 },
    localModel: 'models/bullet350.glb',
  },
  {
    id: 'goan350',
    name: 'Goan Classic 350',
    category: 'heritage',
    family: 'heritage',
    blurb: 'Coastal colours, same heartbeat. At home on the cliff road.',
    price: 0,
    paint: '#d9c4a0',
    accent: '#2a6b6b',
    chassis: chassis({
      wheelbase: 1.39,
      frontWheelRadius: 0.34,
      rearWheelRadius: 0.325,
      maxSpeed: 30,
      accel: 5.7,
      seat: { y: -0.08, z: 0.42 },
    }),
    tune: { power: 0.96, brakes: 1.04, grip: 1.1, offroad: 0.9 },
    localModel: 'models/goan350.glb',
  },
  {
    id: 'guerrilla450',
    name: 'Guerrilla 450',
    category: 'roadster',
    family: 'roadster',
    blurb: 'Liquid-cooled punch in a street stance. Bengaluru weapon.',
    price: 0,
    paint: '#c81e1e',
    accent: '#111111',
    chassis: chassis({
      wheelbase: 1.44,
      frontWheelRadius: 0.33,
      rearWheelRadius: 0.33,
      maxSpeed: 36,
      accel: 7.2,
      gears: 6,
      seat: { y: -0.11, z: 0.36 },
    }),
    tune: { power: 1.06, brakes: 1.08, grip: 1.05, offroad: 0.9 },
    localModel: 'models/guerrilla450.glb',
  },
  {
    id: 'adv450',
    name: 'Himalayan 450',
    category: 'adventure',
    family: 'adventure',
    blurb: 'Long travel, big tank. Built for Ladakh.',
    price: 0,
    paint: '#c9cfd6',
    accent: '#1f6f8b',
    chassis: chassis({
      wheelbase: 1.51,
      frontWheelRadius: 0.38,
      rearWheelRadius: 0.34,
      maxSpeed: 35,
      accel: 6.8,
      gears: 6,
      seat: { y: -0.02, z: 0.38 },
    }),
    tune: { power: 1.04, brakes: 1.05, grip: 1.0, offroad: 1.35 },
    localModel: 'models/himalayan450.glb',
  },
  {
    id: 'twin650',
    name: 'Interceptor 650',
    category: 'roadster',
    family: 'cafe',
    blurb: 'Two cylinders and a long wheelbase. The fastest thing here.',
    price: 0,
    paint: '#1a1a1a',
    accent: '#ffb428',
    chassis: chassis({
      wheelbase: 1.4,
      frontWheelRadius: 0.33,
      rearWheelRadius: 0.33,
      maxSpeed: 38,
      accel: 7.8,
      engine: 'twin',
      gears: 6,
      seat: { y: -0.12, z: 0.4 },
    }),
    tune: { power: 1.08, brakes: 1.1, grip: 1.05, offroad: 0.8 },
    localModel: 'models/interceptor650.glb',
  },
  {
    id: 'gt650',
    name: 'Continental GT 650',
    category: 'sport',
    family: 'cafe',
    blurb: 'Clip-ons, hump tank, rearsets. The cafe racer.',
    price: 0,
    paint: '#8b1e2d',
    accent: '#d8b45a',
    chassis: chassis({
      wheelbase: 1.4,
      frontWheelRadius: 0.33,
      rearWheelRadius: 0.33,
      maxSpeed: 38,
      accel: 8.0,
      engine: 'twin',
      gears: 6,
      seat: { y: -0.14, z: 0.34 },
    }),
    tune: { power: 1.1, brakes: 1.12, grip: 1.12, offroad: 0.7 },
    localModel: 'models/gt650.glb',
  },
  {
    id: 'shotgun650',
    name: 'Shotgun 650',
    category: 'roadster',
    family: 'roadster',
    blurb: 'Bobber stance, twin heart. Loud in the right places.',
    price: 0,
    paint: '#5c4033',
    accent: '#e8d5a3',
    chassis: chassis({
      wheelbase: 1.46,
      frontWheelRadius: 0.34,
      rearWheelRadius: 0.355,
      maxSpeed: 37,
      accel: 7.6,
      engine: 'twin',
      gears: 6,
      seat: { y: -0.2, z: 0.48 },
    }),
    tune: { power: 1.06, brakes: 1.08, grip: 1.02, offroad: 0.85 },
    localModel: 'models/shotgun650.glb',
  },
  {
    id: 'supermeteor650',
    name: 'Super Meteor 650',
    category: 'cruiser',
    family: 'cruiser',
    blurb: 'The long-haul twin. Stable, fast, unbothered.',
    price: 0,
    paint: '#1c2430',
    accent: '#b87333',
    chassis: chassis({
      wheelbase: 1.5,
      frontWheelRadius: 0.34,
      rearWheelRadius: 0.355,
      maxSpeed: 36.5,
      accel: 7.2,
      engine: 'twin',
      gears: 6,
      seat: { y: -0.22, z: 0.5 },
    }),
    tune: { power: 1.05, brakes: 1.08, grip: 1.04, offroad: 0.72 },
    localModel: 'models/supermeteor650.glb',
  },
  {
    id: 'classic650',
    name: 'Classic 650',
    category: 'heritage',
    family: 'heritage',
    blurb: 'The classic silhouette with a twin. Touring manners, chrome.',
    price: 0,
    paint: '#1e3a2f',
    accent: '#c9a227',
    chassis: chassis({
      wheelbase: 1.47,
      frontWheelRadius: 0.34,
      rearWheelRadius: 0.33,
      maxSpeed: 36,
      accel: 7.0,
      engine: 'twin',
      gears: 6,
      seat: { y: -0.08, z: 0.44 },
    }),
    tune: { power: 1.04, brakes: 1.08, grip: 1.08, offroad: 0.82 },
    localModel: 'models/classic650.glb',
  },
  {
    id: 'bullet650',
    name: 'Bullet 650',
    category: 'heritage',
    family: 'heritage',
    blurb: 'Single-minded, now with two cylinders. The legend, bigger.',
    price: 0,
    paint: '#2b2118',
    accent: '#a67c52',
    chassis: chassis({
      wheelbase: 1.48,
      frontWheelRadius: 0.34,
      rearWheelRadius: 0.33,
      maxSpeed: 35.5,
      accel: 6.8,
      engine: 'twin',
      gears: 6,
      seat: { y: -0.08, z: 0.46 },
    }),
    tune: { power: 1.02, brakes: 1.05, grip: 1.1, offroad: 0.85 },
    localModel: 'models/bullet650.glb',
  },
  {
    id: 'bear650',
    name: 'Bear 650',
    category: 'scrambler',
    family: 'scram',
    blurb: 'Twin scrambler. Knobbies, a beak of attitude, and grin.',
    price: 0,
    paint: '#e8e0d4',
    accent: '#3d5a3a',
    chassis: chassis({
      wheelbase: 1.46,
      frontWheelRadius: 0.355,
      rearWheelRadius: 0.34,
      maxSpeed: 36,
      accel: 7.4,
      engine: 'twin',
      gears: 6,
      seat: { y: -0.1, z: 0.4 },
    }),
    tune: { power: 1.06, brakes: 1.08, grip: 1.02, offroad: 1.15 },
    localModel: 'models/bear650.glb',
  },
];

/** Old / shorthand ids → catalog id. */
export const BIKE_ALIASES: Record<string, string> = {
  scram411: 'scram',
  classic: 'classic350',
  himalayan: 'adv450',
  himalayan450: 'adv450',
  interceptor: 'twin650',
  interceptor650: 'twin650',
};

export const BIKE_BY_ID: Record<string, BikeDef> = Object.fromEntries(BIKES.map((b) => [b.id, b]));

export function resolveBikeId(id: string | undefined | null): string {
  if (!id) return 'scram';
  return BIKE_ALIASES[id] ?? id;
}

export function bikeById(id: string | undefined | null): BikeDef {
  const resolved = resolveBikeId(id);
  return BIKE_BY_ID[resolved] ?? BIKES[0]!;
}

export function bikesInCategory(cat: BikeCategory): BikeDef[] {
  return BIKES.filter((b) => b.category === cat);
}
