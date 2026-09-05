import { BoxGeometry, BufferGeometry, CylinderGeometry, SphereGeometry } from 'three';
import { colorize, merge, place } from './geo';
import type { SceneId } from './scenes';

/**
 * Procedural Indian road users. Every vehicle is one merged, vertex-coloured geometry that
 * faces -Z (the direction of travel) with its base on y = 0. Lamp glass is flagged so it can
 * glow at night (see geo.vehicleMat).
 *
 * Dimensions are metres and matter for gameplay: halfW / halfL are the collision box.
 */
export type VehicleKind =
  | 'auto'
  | 'hatch'
  | 'suv'
  | 'truck'
  | 'bus'
  | 'tanker'
  | 'scooter'
  | 'bike'
  | 'tempo';

export interface VehicleSpec {
  kind: VehicleKind;
  halfW: number;
  halfL: number;
  /** Cruising speed range, km/h. */
  speedKmh: [number, number];
  /** How often trucks and buses wander over the centre line (0..1). */
  wander: number;
  /** Heavy vehicles brake for bends and swing wide through them. */
  heavy?: boolean;
  /** Two-wheelers filter through gaps. */
  twoWheeler?: boolean;
  label: string;
}

export const VEHICLE_SPECS: Record<VehicleKind, VehicleSpec> = {
  auto: { kind: 'auto', halfW: 0.72, halfL: 1.4, speedKmh: [28, 45], wander: 0.25, label: 'Auto' },
  hatch: {
    kind: 'hatch',
    halfW: 0.85,
    halfL: 1.9,
    speedKmh: [45, 70],
    wander: 0.05,
    label: 'Hatchback',
  },
  suv: { kind: 'suv', halfW: 0.95, halfL: 2.3, speedKmh: [55, 80], wander: 0.1, label: 'SUV' },
  truck: {
    kind: 'truck',
    halfW: 1.22,
    halfL: 3.7,
    speedKmh: [32, 52],
    wander: 0.35,
    heavy: true,
    label: 'Truck',
  },
  bus: {
    kind: 'bus',
    halfW: 1.25,
    halfL: 5.2,
    speedKmh: [38, 58],
    wander: 0.3,
    heavy: true,
    label: 'Bus',
  },
  tanker: {
    kind: 'tanker',
    halfW: 1.22,
    halfL: 4.6,
    speedKmh: [30, 48],
    wander: 0.25,
    heavy: true,
    label: 'Tanker',
  },
  scooter: {
    kind: 'scooter',
    halfW: 0.4,
    halfL: 0.95,
    speedKmh: [30, 55],
    wander: 0.4,
    twoWheeler: true,
    label: 'Scooter',
  },
  bike: {
    kind: 'bike',
    halfW: 0.42,
    halfL: 1.05,
    speedKmh: [40, 72],
    wander: 0.45,
    twoWheeler: true,
    label: 'Motorcycle',
  },
  tempo: {
    kind: 'tempo',
    halfW: 0.8,
    halfL: 1.9,
    speedKmh: [30, 50],
    wander: 0.2,
    label: 'Tempo',
  },
};

const wheel = (x: number, z: number, r = 0.32, w = 0.22): BufferGeometry =>
  place(colorize(new CylinderGeometry(r, r, w, 10), 0x1a1a1a), x, r, z, 1, 0, 0, Math.PI / 2);

const box = (
  w: number,
  h: number,
  d: number,
  hex: number,
  x: number,
  y: number,
  z: number,
  variance = 0.06,
): BufferGeometry => place(colorize(new BoxGeometry(w, h, d), hex, variance), x, y, z);

/** Lamp glass: flagged emissive. */
const lamp = (w: number, h: number, hex: number, x: number, y: number, z: number): BufferGeometry =>
  place(colorize(new BoxGeometry(w, h, 0.06), hex, 0, 1), x, y, z);

const HEAD = 0xffe7b0;
const TAIL = 0xd42020;
const GLASS = 0x8fb8cc;

const PAINT = {
  hatch: [0xd8d8d8, 0xb8232a, 0x2a3f8f, 0x2b2b2b, 0xe5e2d3, 0x7f8c9a, 0x9a9a9a, 0xf0f0f0],
  suv: [0x2b2b2b, 0xf0f0f0, 0x6b1f1f, 0x37474f, 0xd8d8d8],
  truck: [0xd9822b, 0x2f7d4a, 0x3559a8, 0xb03a2e, 0xe0a100],
  truckPanel: [0xf2c200, 0x2a9ad8, 0xe0652a, 0xf0efe8],
};

/** State-transport liveries and auto canopies by region. */
const REGION: Record<
  SceneId,
  { bus: [number, number][]; autoHood: number; taxi: boolean }
> = {
  // Kerala KSRTC: red with a yellow band; a few white "Swift" units.
  munnar: { bus: [[0xb8232a, 0xe0a100], [0xb8232a, 0xe0a100], [0xf3f3f3, 0x2a9ad8]], autoHood: 0x1a1a1a, taxi: false },
  wayanad: { bus: [[0xb8232a, 0xe0a100], [0xb8232a, 0xe0a100], [0xf3f3f3, 0x2a9ad8]], autoHood: 0x1a1a1a, taxi: false },
  varkala: { bus: [[0xb8232a, 0xe0a100], [0xf3f3f3, 0x2a9ad8]], autoHood: 0x1a1a1a, taxi: false },
  // Tamil Nadu TNSTC: green over cream, some brown town buses.
  ooty: { bus: [[0x2f7d4a, 0xe9e2c8], [0x2f7d4a, 0xe9e2c8], [0x7a5a3a, 0xe9e2c8]], autoHood: 0x1a1a1a, taxi: false },
  // Ladakh: white JKSRTC / HRTC with a blue or green band.
  ladakh: { bus: [[0xf3f3f3, 0x1f6f8b], [0xf3f3f3, 0x2f7d4a]], autoHood: 0x2a4b3f, taxi: false },
  // BMTC: blue-white ordinary buses and the purple Vajra Volvos.
  bengaluru: { bus: [[0x1f6f8b, 0xf3f3f3], [0x1f6f8b, 0xf3f3f3], [0x5a3f9c, 0xf3f3f3], [0x2f7d4a, 0xf3f3f3]], autoHood: 0x1a1a1a, taxi: true },
};

function pick<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)]!;
}

/** Builds one vehicle. `rnd` picks paint so each pooled kind looks varied per scene. */
export function buildVehicle(
  kind: VehicleKind,
  rnd: () => number = Math.random,
  scene: SceneId = 'munnar',
): BufferGeometry {
  const region = REGION[scene];
  switch (kind) {
    case 'auto': {
      const yellow = 0xf2c200;
      const hood = region.autoHood;
      const parts = [
        box(1.3, 0.45, 2.2, yellow, 0, 0.5, 0.1), // floor / lower body
        box(1.3, 0.85, 1.55, hood, 0, 1.25, 0.3, 0.02), // canopy
        box(1.26, 0.5, 0.06, GLASS, 0, 1.3, -0.55, 0), // windscreen
        box(0.04, 0.7, 1.55, yellow, -0.66, 0.95, 0.3, 0.02), // side panels (open above)
        box(0.04, 0.7, 1.55, yellow, 0.66, 0.95, 0.3, 0.02),
        box(0.5, 0.55, 0.8, yellow, 0, 0.7, -0.95), // nose / front fender
        box(0.5, 0.25, 0.3, hood, 0, 1.05, -0.75, 0.02), // dash
        box(0.42, 0.06, 0.4, 0x1a1a1a, 0, 1.08, -0.6, 0), // handlebar
        box(1.0, 0.45, 0.35, 0x2a2a2a, 0, 0.75, 0.55, 0.02), // bench seat
        box(0.55, 0.12, 0.04, 0xe9e7df, 0, 0.5, 1.2, 0), // number plate
        lamp(0.26, 0.2, HEAD, 0, 0.9, -1.36),
        lamp(0.16, 0.1, TAIL, -0.5, 0.65, 1.2),
        lamp(0.16, 0.1, TAIL, 0.5, 0.65, 1.2),
        wheel(0, -0.95, 0.26, 0.14),
        wheel(-0.55, 0.65, 0.26, 0.14),
        wheel(0.55, 0.65, 0.26, 0.14),
        // driver
        box(0.4, 0.5, 0.3, pick([0x8a7a5a, 0xe9e2d2, 0x445566], rnd), 0, 1.15, -0.25, 0.1),
        place(colorize(new SphereGeometry(0.13, 8, 6), 0x7a5a3a), 0, 1.55, -0.25),
      ];
      return merge(parts);
    }
    case 'scooter': {
      const paint = pick([0xd83b3b, 0xf0f0f0, 0x2a5fd8, 0x111111, 0x9a9a9a, 0xe0a100], rnd);
      const parts = [
        box(0.42, 0.4, 1.0, paint, 0, 0.55, 0.15),
        box(0.3, 0.3, 0.5, paint, 0, 0.7, -0.55),
        box(0.5, 0.06, 0.12, 0x1a1a1a, 0, 0.98, -0.6),
        box(0.4, 0.12, 0.5, 0x2a2a2a, 0, 0.8, 0.25), // seat
        box(0.36, 0.5, 0.06, 0x1a1a1a, 0, 0.65, -0.72, 0), // front apron
        lamp(0.16, 0.14, HEAD, 0, 0.9, -0.8),
        lamp(0.14, 0.08, TAIL, 0, 0.72, 0.68),
        wheel(0, -0.7, 0.24, 0.1),
        wheel(0, 0.6, 0.24, 0.1),
        // rider
        box(0.42, 0.55, 0.32, pick([0x445566, 0xd8d8d0, 0x8a3a3a, 0x2f5b8f], rnd), 0, 1.15, 0.2, 0.1),
        box(0.12, 0.45, 0.14, 0x2b3a5a, -0.18, 0.75, 0.05, 0.05), // legs
        box(0.12, 0.45, 0.14, 0x2b3a5a, 0.18, 0.75, 0.05, 0.05),
        place(colorize(new SphereGeometry(0.16, 8, 6), pick([0x111111, 0xdddddd, 0xd83b3b], rnd)), 0, 1.6, 0.18),
      ];
      return merge(parts);
    }
    case 'bike': {
      // Commuter motorcycle: tank, long seat, rider leaning forward, mirrors.
      const paint = pick([0x111111, 0xb8232a, 0x2a5fd8, 0x9a9a9a, 0x2f7d4a], rnd);
      const parts = [
        box(0.3, 0.28, 1.2, 0x2a2a2a, 0, 0.55, 0.1, 0.05), // frame / engine block
        box(0.4, 0.3, 0.55, paint, 0, 0.82, -0.25, 0.05), // tank
        box(0.38, 0.12, 0.7, 0x1a1a1a, 0, 0.82, 0.45), // seat
        box(0.55, 0.05, 0.06, 0x1a1a1a, 0, 0.98, -0.72, 0), // bars
        box(0.06, 0.28, 0.06, 0x555555, -0.28, 1.1, -0.72, 0), // mirror stalks
        box(0.06, 0.28, 0.06, 0x555555, 0.28, 1.1, -0.72, 0),
        box(0.08, 0.7, 0.1, 0x9a9a9a, 0, 0.45, -0.8, 0), // fork
        lamp(0.2, 0.18, HEAD, 0, 0.88, -0.86),
        lamp(0.14, 0.08, TAIL, 0, 0.78, 0.86),
        wheel(0, -0.78, 0.3, 0.1),
        wheel(0, 0.7, 0.3, 0.12),
        // rider
        box(0.42, 0.5, 0.34, pick([0x445566, 0xd8d8d0, 0x8a3a3a, 0x2f5b8f, 0x111111], rnd), 0, 1.15, 0.15, 0.1),
        box(0.12, 0.45, 0.14, 0x2b3a5a, -0.2, 0.7, 0.1, 0.05),
        box(0.12, 0.45, 0.14, 0x2b3a5a, 0.2, 0.7, 0.1, 0.05),
        place(colorize(new SphereGeometry(0.16, 8, 6), pick([0x111111, 0xdddddd, 0xd83b3b, 0xe0a100], rnd)), 0, 1.58, 0.0),
      ];
      return merge(parts);
    }
    case 'hatch': {
      const taxi = region.taxi && rnd() < 0.3;
      const paint = taxi ? 0xf0f0f0 : pick(PAINT.hatch, rnd);
      const parts = [
        box(1.7, 0.55, 3.8, paint, 0, 0.6, 0),
        box(1.55, 0.6, 2.0, paint, 0, 1.15, 0.2),
        box(1.58, 0.42, 1.85, GLASS, 0, 1.2, 0.2, 0), // glass band
        box(1.58, 0.05, 2.0, paint, 0, 1.45, 0.2, 0), // roof lip
        box(1.72, 0.12, 0.2, 0x1a1a1a, 0, 0.35, -1.9, 0), // bumper
        box(1.72, 0.12, 0.2, 0x1a1a1a, 0, 0.35, 1.9, 0),
        box(0.5, 0.12, 0.03, 0xe9e7df, 0, 0.55, -1.92, 0), // plates
        box(0.5, 0.12, 0.03, taxi ? 0xf2c200 : 0xe9e7df, 0, 0.6, 1.92, 0),
        box(0.16, 0.1, 0.1, paint, -0.9, 1.05, -0.65, 0), // mirrors
        box(0.16, 0.1, 0.1, paint, 0.9, 1.05, -0.65, 0),
        lamp(0.35, 0.14, HEAD, -0.55, 0.75, -1.92),
        lamp(0.35, 0.14, HEAD, 0.55, 0.75, -1.92),
        lamp(0.35, 0.12, TAIL, -0.55, 0.8, 1.92),
        lamp(0.35, 0.12, TAIL, 0.55, 0.8, 1.92),
        wheel(-0.8, -1.2),
        wheel(0.8, -1.2),
        wheel(-0.8, 1.25),
        wheel(0.8, 1.25),
      ];
      if (taxi) parts.push(box(0.5, 0.18, 0.3, 0xf2c200, 0, 1.55, -0.2, 0)); // roof sign
      return merge(parts);
    }
    case 'suv': {
      const paint = pick(PAINT.suv, rnd);
      const parts = [
        box(1.9, 0.8, 4.6, paint, 0, 0.85, 0),
        box(1.8, 0.7, 2.9, paint, 0, 1.6, 0.3),
        box(1.82, 0.48, 2.75, GLASS, 0, 1.65, 0.3, 0),
        box(1.8, 0.05, 2.9, paint, 0, 1.95, 0.3, 0),
        box(0.08, 0.08, 2.4, 0x3a3a3a, -0.7, 2.02, 0.3, 0), // roof rails
        box(0.08, 0.08, 2.4, 0x3a3a3a, 0.7, 2.02, 0.3, 0),
        box(1.9, 0.14, 0.2, 0x1a1a1a, 0, 0.45, -2.3, 0),
        box(1.9, 0.14, 0.2, 0x1a1a1a, 0, 0.45, 2.3, 0),
        box(0.18, 0.12, 0.12, paint, -1.0, 1.4, -0.9, 0),
        box(0.18, 0.12, 0.12, paint, 1.0, 1.4, -0.9, 0),
        box(0.5, 0.12, 0.03, 0xe9e7df, 0, 0.7, -2.32, 0),
        lamp(0.4, 0.16, HEAD, -0.6, 1.0, -2.32),
        lamp(0.4, 0.16, HEAD, 0.6, 1.0, -2.32),
        lamp(0.4, 0.14, TAIL, -0.6, 1.05, 2.32),
        lamp(0.4, 0.14, TAIL, 0.6, 1.05, 2.32),
        wheel(-0.9, -1.5, 0.4, 0.26),
        wheel(0.9, -1.5, 0.4, 0.26),
        wheel(-0.9, 1.5, 0.4, 0.26),
        wheel(0.9, 1.5, 0.4, 0.26),
      ];
      return merge(parts);
    }
    case 'truck': {
      const paint = pick(PAINT.truck, rnd);
      const panel = pick(PAINT.truckPanel, rnd);
      const parts = [
        // tall painted cab with a sun visor, bull bar and roof marker board
        box(2.3, 1.7, 2.0, paint, 0, 1.65, -2.6),
        box(2.2, 0.8, 0.1, GLASS, 0, 2.0, -3.62, 0),
        box(2.4, 0.12, 0.6, panel, 0, 2.5, -3.7, 0.03), // visor
        box(2.4, 0.5, 0.3, 0x1a1a1a, 0, 0.6, -3.55, 0),
        box(2.4, 0.08, 0.08, 0x9a9a9a, 0, 1.15, -3.68, 0), // bull bar
        box(2.4, 0.08, 0.08, 0x9a9a9a, 0, 0.95, -3.68, 0),
        box(2.2, 0.25, 0.08, panel, 0, 2.62, -3.6, 0.02), // marker board
        // load bed with wooden sides, painted panel stripe and a tarp
        box(2.4, 0.3, 5.0, 0x3a2a1a, 0, 0.95, 0.9, 0.1),
        box(2.4, 1.3, 5.0, 0xc9a86a, 0, 1.75, 0.9, 0.12),
        box(2.44, 0.3, 5.02, panel, 0, 1.4, 0.9, 0.03), // painted stripe
        box(2.2, 0.55, 4.6, pick([0x2f5b8f, 0x8a8a8a, 0x2a6b3f, 0xd9822b], rnd), 0, 2.68, 0.9, 0.05),
        box(2.3, 0.45, 0.06, 0xf0efe8, 0, 2.2, 3.42, 0.02), // tail board (HORN OK PLEASE)
        box(0.5, 0.12, 0.03, 0xe9e7df, 0, 0.9, -3.72, 0),
        lamp(0.45, 0.2, HEAD, -0.8, 1.05, -3.72),
        lamp(0.45, 0.2, HEAD, 0.8, 1.05, -3.72),
        lamp(0.45, 0.16, TAIL, -0.8, 1.15, 3.44),
        lamp(0.45, 0.16, TAIL, 0.8, 1.15, 3.44),
        wheel(-1.0, -2.6, 0.5, 0.3),
        wheel(1.0, -2.6, 0.5, 0.3),
        wheel(-1.0, 1.6, 0.5, 0.3),
        wheel(1.0, 1.6, 0.5, 0.3),
        wheel(-1.0, 2.7, 0.5, 0.3),
        wheel(1.0, 2.7, 0.5, 0.3),
      ];
      return merge(parts);
    }
    case 'bus': {
      const [paint, band] = pick(region.bus, rnd);
      const parts = [
        box(2.5, 2.3, 10.4, paint, 0, 1.75, 0),
        box(2.52, 0.35, 10.42, band, 0, 1.55, 0, 0.02), // livery band
        box(2.4, 1.2, 0.1, GLASS, 0, 2.2, -5.22, 0), // windscreen
        box(2.4, 1.0, 0.1, GLASS, 0, 2.2, 5.22, 0), // rear glass
        box(2.5, 0.4, 0.3, 0x1a1a1a, 0, 0.55, -5.2, 0),
        box(2.5, 0.4, 0.3, 0x1a1a1a, 0, 0.55, 5.2, 0),
        box(2.4, 0.25, 10.0, 0xd8d8d0, 0, 3.02, 0, 0.03), // roof rack strip
        box(1.6, 0.3, 0.06, 0xf6f6e8, 0, 2.95, -5.24, 0), // destination board
        box(0.5, 0.12, 0.03, 0xe9e7df, 0, 0.9, -5.36, 0),
        lamp(0.5, 0.22, HEAD, -0.85, 1.05, -5.3),
        lamp(0.5, 0.22, HEAD, 0.85, 1.05, -5.3),
        lamp(0.5, 0.18, TAIL, -0.85, 1.2, 5.3),
        lamp(0.5, 0.18, TAIL, 0.85, 1.2, 5.3),
        wheel(-1.05, -3.6, 0.52, 0.32),
        wheel(1.05, -3.6, 0.52, 0.32),
        wheel(-1.05, 3.4, 0.52, 0.32),
        wheel(1.05, 3.4, 0.52, 0.32),
      ];
      // side windows with pillars between them
      for (let i = 0; i < 7; i++) {
        const z = -4.2 + i * 1.35;
        parts.push(box(2.54, 0.75, 1.05, GLASS, 0, 2.25, z, 0));
      }
      parts.push(box(2.54, 0.75, 0.9, 0x1a1a1a, 0, 2.25, -4.9, 0)); // door
      return merge(parts);
    }
    case 'tanker': {
      const cabPaint = pick([0xd9822b, 0xf0f0f0, 0x2f7d4a, 0x3559a8], rnd);
      const parts = [
        box(2.3, 1.7, 2.0, cabPaint, 0, 1.65, -3.6),
        box(2.2, 0.8, 0.1, GLASS, 0, 2.0, -4.62, 0),
        box(2.4, 0.12, 0.6, 0xf2c200, 0, 2.5, -4.7, 0.03),
        box(2.4, 0.5, 0.3, 0x1a1a1a, 0, 0.6, -4.55, 0),
        box(2.4, 0.3, 6.6, 0x2a2a2a, 0, 0.95, 0.9, 0.1), // chassis
        place(
          colorize(new CylinderGeometry(1.05, 1.05, 6.4, 14), pick([0xe8e8e8, 0xd8d8d8, 0xe0a100], rnd), 0.05),
          0,
          2.0,
          0.9,
          1,
          Math.PI / 2,
        ),
        box(2.14, 0.3, 6.42, 0xc02020, 0, 2.0, 0.9, 0), // hazard band
        box(0.9, 0.3, 1.2, 0xc02020, 0, 3.1, 0.9, 0), // top hatch
        box(0.3, 1.6, 0.3, 0x9a9a9a, -0.9, 1.9, 4.0, 0), // rear ladder
        lamp(0.45, 0.2, HEAD, -0.8, 1.05, -4.7),
        lamp(0.45, 0.2, HEAD, 0.8, 1.05, -4.7),
        lamp(0.45, 0.16, TAIL, -0.8, 1.15, 4.22),
        lamp(0.45, 0.16, TAIL, 0.8, 1.15, 4.22),
        wheel(-1.0, -3.6, 0.5, 0.3),
        wheel(1.0, -3.6, 0.5, 0.3),
        wheel(-1.0, 2.6, 0.5, 0.3),
        wheel(1.0, 2.6, 0.5, 0.3),
        wheel(-1.0, 3.7, 0.5, 0.3),
        wheel(1.0, 3.7, 0.5, 0.3),
      ];
      return merge(parts);
    }
    case 'tempo': {
      // Tata Ace style mini truck: stubby cab, open bed stacked with goods under a tarp.
      const paint = pick([0xf0f0f0, 0x2a5fd8, 0xf0f0f0, 0xe0a100], rnd);
      const parts = [
        box(1.55, 1.3, 1.4, paint, 0, 1.15, -1.1),
        box(1.5, 0.6, 0.08, GLASS, 0, 1.4, -1.8, 0),
        box(1.6, 0.35, 0.2, 0x1a1a1a, 0, 0.45, -1.78, 0),
        box(1.6, 0.25, 2.3, 0x2a2a2a, 0, 0.7, 0.55, 0.05), // bed floor
        box(1.6, 0.5, 2.3, 0x3a5fa8, 0, 1.05, 0.55, 0.1), // bed sides
        box(1.4, 0.7, 1.9, pick([0x8a7a5a, 0x2f7d4a, 0xd9822b], rnd), 0, 1.6, 0.55, 0.1), // load
        box(1.5, 0.08, 2.0, pick([0x2a5fd8, 0xe0652a], rnd), 0, 1.98, 0.55, 0.05), // tarp
        lamp(0.3, 0.14, HEAD, -0.5, 0.85, -1.82),
        lamp(0.3, 0.14, HEAD, 0.5, 0.85, -1.82),
        lamp(0.3, 0.12, TAIL, -0.55, 0.85, 1.72),
        lamp(0.3, 0.12, TAIL, 0.55, 0.85, 1.72),
        wheel(-0.7, -1.1, 0.3, 0.18),
        wheel(0.7, -1.1, 0.3, 0.18),
        wheel(-0.7, 1.1, 0.3, 0.18),
        wheel(0.7, 1.1, 0.3, 0.18),
      ];
      return merge(parts);
    }
  }
}

// --------------------------------------------------------------------------------- hazards ---

export type HazardKind =
  | 'cow'
  | 'pothole'
  | 'breaker'
  | 'rock'
  | 'puddle'
  | 'barrel'
  | 'goat'
  | 'pier';

export type HazardEffect = 'solid' | 'bump' | 'slick';

export interface HazardSpec {
  kind: HazardKind;
  halfW: number;
  halfL: number;
  effect: HazardEffect;
  /**
   * Where it sits: 'lane' = random lane, 'road' = spans the road, 'edge' = shoulder side,
   * 'median' = fixed positions on the centre line (metro piers).
   */
  placement: 'lane' | 'road' | 'edge' | 'median';
  label: string;
}

export const HAZARD_SPECS: Record<HazardKind, HazardSpec> = {
  cow: { kind: 'cow', halfW: 0.5, halfL: 1.1, effect: 'solid', placement: 'lane', label: 'Cow' },
  goat: {
    kind: 'goat',
    halfW: 0.3,
    halfL: 0.55,
    effect: 'solid',
    placement: 'edge',
    label: 'Goat',
  },
  rock: { kind: 'rock', halfW: 0.6, halfL: 0.6, effect: 'solid', placement: 'lane', label: 'Rock' },
  barrel: {
    kind: 'barrel',
    halfW: 0.35,
    halfL: 0.35,
    effect: 'solid',
    placement: 'edge',
    label: 'Barrel',
  },
  pothole: {
    kind: 'pothole',
    halfW: 0.6,
    halfL: 0.7,
    effect: 'bump',
    placement: 'lane',
    label: 'Pothole',
  },
  breaker: {
    kind: 'breaker',
    halfW: 99,
    halfL: 0.45,
    effect: 'bump',
    placement: 'road',
    label: 'Speed breaker',
  },
  puddle: {
    kind: 'puddle',
    halfW: 1.4,
    halfL: 2.2,
    effect: 'slick',
    placement: 'lane',
    label: 'Puddle',
  },
  pier: {
    kind: 'pier',
    halfW: 0.95,
    halfL: 0.95,
    effect: 'solid',
    placement: 'median',
    label: 'Metro pier',
  },
};

/** Hazard geometry, base at y = 0. `roadWidth` sizes road-spanning ones. */
export function buildHazard(kind: HazardKind, roadWidth: number): BufferGeometry {
  switch (kind) {
    case 'cow': {
      const hide = Math.random() < 0.5 ? 0xf1ece0 : 0x8b6a4a;
      const parts = [
        box(0.9, 0.75, 1.7, hide, 0, 0.95, 0.1, 0.08),
        box(0.42, 0.45, 0.6, hide, 0, 1.25, -1.05, 0.08), // head
        box(0.5, 0.35, 0.25, 0x333333, 0, 1.05, -1.3, 0.02), // muzzle
        box(0.08, 0.3, 0.08, 0xdddddd, -0.25, 1.6, -1.05, 0),
        box(0.08, 0.3, 0.08, 0xdddddd, 0.25, 1.6, -1.05, 0),
        box(0.18, 0.6, 0.18, hide, -0.3, 0.3, -0.55, 0.05),
        box(0.18, 0.6, 0.18, hide, 0.3, 0.3, -0.55, 0.05),
        box(0.18, 0.6, 0.18, hide, -0.3, 0.3, 0.7, 0.05),
        box(0.18, 0.6, 0.18, hide, 0.3, 0.3, 0.7, 0.05),
        box(0.06, 0.5, 0.06, 0x444444, 0, 0.95, 1.0, 0), // tail
        box(0.3, 0.25, 0.4, hide, 0, 1.4, 0.3, 0.08), // hump
      ];
      return merge(parts);
    }
    case 'goat': {
      const parts = [
        box(0.45, 0.4, 0.9, 0xe9e2d2, 0, 0.55, 0, 0.1),
        box(0.25, 0.3, 0.35, 0xe9e2d2, 0, 0.75, -0.55, 0.1),
        box(0.1, 0.4, 0.1, 0x555555, -0.15, 0.2, -0.3, 0),
        box(0.1, 0.4, 0.1, 0x555555, 0.15, 0.2, -0.3, 0),
        box(0.1, 0.4, 0.1, 0x555555, -0.15, 0.2, 0.3, 0),
        box(0.1, 0.4, 0.1, 0x555555, 0.15, 0.2, 0.3, 0),
      ];
      return merge(parts);
    }
    case 'rock': {
      const g = new SphereGeometry(0.62, 7, 5);
      const pos = g.attributes.position!;
      for (let i = 0; i < pos.count; i++) {
        const k = 0.8 + Math.random() * 0.4;
        pos.setXYZ(i, pos.getX(i) * k, Math.max(-0.1, pos.getY(i) * k * 0.7), pos.getZ(i) * k);
      }
      g.computeVertexNormals();
      return merge([place(colorize(g, 0x6e6558, 0.2), 0, 0.35, 0)]);
    }
    case 'barrel': {
      return merge([
        place(colorize(new CylinderGeometry(0.33, 0.33, 0.95, 12), 0xe0652a, 0.05), 0, 0.48, 0),
        place(colorize(new CylinderGeometry(0.34, 0.34, 0.12, 12), 0xf5f5f5, 0), 0, 0.5, 0),
      ]);
    }
    case 'pothole': {
      // Flat dark disc sitting a hair above the asphalt so it reads without z-fighting.
      return merge([
        place(colorize(new CylinderGeometry(0.62, 0.62, 0.02, 12), 0x141414, 0.1), 0, 0.055, 0),
        place(colorize(new CylinderGeometry(0.75, 0.75, 0.012, 12), 0x3a3631, 0.15), 0, 0.05, 0),
      ]);
    }
    case 'breaker': {
      const w = roadWidth;
      const stripes: BufferGeometry[] = [];
      const n = Math.max(4, Math.round(w / 0.6));
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (i + 0.5) * (w / n);
        stripes.push(
          place(
            colorize(new BoxGeometry(w / n, 0.12, 0.9), i % 2 === 0 ? 0xf2c200 : 0x1a1a1a, 0.02),
            x,
            0.11,
            0,
          ),
        );
      }
      return merge(stripes);
    }
    case 'puddle': {
      return merge([
        place(colorize(new CylinderGeometry(1.4, 1.4, 0.014, 16), 0x3b4a52, 0.05), 0, 0.055, 0, 1),
      ]);
    }
    case 'pier': {
      // Metro pier: plinth, tapered column, striped safety collar; the cap/deck live in City.
      return merge([
        place(colorize(new BoxGeometry(2.6, 0.5, 2.6), 0x8e8a82, 0.1), 0, 0.25, 0),
        place(colorize(new CylinderGeometry(0.85, 1.0, 10.2, 12), 0x9c9890, 0.12), 0, 5.6, 0),
        place(colorize(new CylinderGeometry(1.02, 1.02, 0.4, 12), 0xe0652a, 0.02), 0, 1.2, 0),
        place(colorize(new CylinderGeometry(1.02, 1.02, 0.4, 12), 0xf0efe8, 0.02), 0, 1.6, 0),
        place(colorize(new CylinderGeometry(1.02, 1.02, 0.4, 12), 0xe0652a, 0.02), 0, 2.0, 0),
      ]);
    }
  }
}
