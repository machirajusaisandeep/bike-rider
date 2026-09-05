import { BoxGeometry, BufferGeometry, CylinderGeometry, SphereGeometry } from 'three';
import { colorize, merge, place } from './geo';

/**
 * Procedural Indian road users. Every vehicle is one merged, vertex-coloured geometry that
 * faces -Z (the direction of travel) with its base on y = 0.
 *
 * Dimensions are metres and matter for gameplay: halfW / halfL are the collision box.
 */
export type VehicleKind = 'auto' | 'hatch' | 'suv' | 'truck' | 'bus' | 'tanker' | 'scooter';

export interface VehicleSpec {
  kind: VehicleKind;
  halfW: number;
  halfL: number;
  /** Cruising speed range, km/h. */
  speedKmh: [number, number];
  /** How often trucks and buses wander over the centre line (0..1). */
  wander: number;
  label: string;
}

export const VEHICLE_SPECS: Record<VehicleKind, VehicleSpec> = {
  auto: { kind: 'auto', halfW: 0.72, halfL: 1.35, speedKmh: [28, 45], wander: 0.2, label: 'Auto' },
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
    halfL: 3.6,
    speedKmh: [32, 52],
    wander: 0.35,
    label: 'Truck',
  },
  bus: { kind: 'bus', halfW: 1.25, halfL: 5.2, speedKmh: [38, 58], wander: 0.3, label: 'Bus' },
  tanker: {
    kind: 'tanker',
    halfW: 1.22,
    halfL: 4.6,
    speedKmh: [30, 48],
    wander: 0.25,
    label: 'Tanker',
  },
  scooter: {
    kind: 'scooter',
    halfW: 0.4,
    halfL: 0.95,
    speedKmh: [30, 55],
    wander: 0.4,
    label: 'Scooter',
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

const PAINT = {
  hatch: [0xd8d8d8, 0xb8232a, 0x2a3f8f, 0x2b2b2b, 0xe5e2d3, 0x7f8c9a],
  suv: [0x2b2b2b, 0xf0f0f0, 0x6b1f1f, 0x37474f],
  truck: [0xd9822b, 0x2f7d4a, 0x3559a8, 0xb03a2e],
  bus: [0xc8102e, 0x1f6f8b, 0xe0a100, 0xf3f3f3],
};

function pick<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)]!;
}

/** Builds one vehicle. `rnd` picks paint so each pooled kind looks varied per scene. */
export function buildVehicle(kind: VehicleKind, rnd: () => number = Math.random): BufferGeometry {
  switch (kind) {
    case 'auto': {
      const yellow = 0xf2c200;
      const parts = [
        box(1.3, 0.5, 2.3, yellow, 0, 0.55, 0), // floor + bench
        box(1.3, 0.9, 1.5, 0x2a4b3f, 0, 1.25, 0.25, 0.02), // dark green canopy
        box(1.25, 0.85, 0.06, 0x9fd3e6, 0, 1.2, -0.72, 0), // windscreen
        box(0.35, 0.5, 0.9, yellow, 0, 0.75, -0.95), // nose
        box(0.4, 0.06, 0.4, 0x1a1a1a, 0, 1.05, -0.6), // handlebar
        wheel(0, -0.95, 0.26, 0.14),
        wheel(-0.55, 0.65, 0.26, 0.14),
        wheel(0.55, 0.65, 0.26, 0.14),
        box(0.25, 0.12, 0.08, 0xffd9a0, 0, 0.85, -1.36, 0), // headlight
      ];
      return merge(parts);
    }
    case 'scooter': {
      const paint = pick([0xd83b3b, 0xf0f0f0, 0x2a5fd8, 0x111111], rnd);
      const parts = [
        box(0.42, 0.4, 1.0, paint, 0, 0.55, 0.15),
        box(0.3, 0.3, 0.5, paint, 0, 0.7, -0.55),
        box(0.5, 0.06, 0.12, 0x1a1a1a, 0, 0.98, -0.6),
        box(0.4, 0.12, 0.5, 0x2a2a2a, 0, 0.8, 0.25), // seat
        wheel(0, -0.7, 0.24, 0.1),
        wheel(0, 0.6, 0.24, 0.1),
        // rider blob
        place(colorize(new BoxGeometry(0.42, 0.55, 0.32), 0x445566, 0.1), 0, 1.15, 0.2),
        place(colorize(new SphereGeometry(0.15, 8, 6), pick([0x111111, 0xdddddd], rnd)), 0, 1.58, 0.2),
      ];
      return merge(parts);
    }
    case 'hatch': {
      const paint = pick(PAINT.hatch, rnd);
      const parts = [
        box(1.7, 0.55, 3.8, paint, 0, 0.6, 0),
        box(1.55, 0.6, 2.0, paint, 0, 1.15, 0.2),
        box(1.5, 0.5, 1.9, 0x9fd3e6, 0, 1.15, 0.2, 0), // glass band slightly inset
        box(1.72, 0.12, 0.2, 0x1a1a1a, 0, 0.35, -1.9, 0), // bumper
        box(0.35, 0.14, 0.06, 0xffe7b0, -0.55, 0.75, -1.92, 0),
        box(0.35, 0.14, 0.06, 0xffe7b0, 0.55, 0.75, -1.92, 0),
        box(0.35, 0.12, 0.06, 0xd42020, -0.55, 0.8, 1.92, 0),
        box(0.35, 0.12, 0.06, 0xd42020, 0.55, 0.8, 1.92, 0),
        wheel(-0.8, -1.2),
        wheel(0.8, -1.2),
        wheel(-0.8, 1.25),
        wheel(0.8, 1.25),
      ];
      return merge(parts);
    }
    case 'suv': {
      const paint = pick(PAINT.suv, rnd);
      const parts = [
        box(1.9, 0.8, 4.6, paint, 0, 0.85, 0),
        box(1.8, 0.7, 2.9, paint, 0, 1.6, 0.3),
        box(1.75, 0.55, 2.8, 0x8fc2d8, 0, 1.6, 0.3, 0),
        box(1.9, 0.14, 0.2, 0x1a1a1a, 0, 0.45, -2.3, 0),
        box(0.4, 0.16, 0.06, 0xffe7b0, -0.6, 1.0, -2.32, 0),
        box(0.4, 0.16, 0.06, 0xffe7b0, 0.6, 1.0, -2.32, 0),
        box(0.4, 0.14, 0.06, 0xd42020, -0.6, 1.05, 2.32, 0),
        box(0.4, 0.14, 0.06, 0xd42020, 0.6, 1.05, 2.32, 0),
        wheel(-0.9, -1.5, 0.4, 0.26),
        wheel(0.9, -1.5, 0.4, 0.26),
        wheel(-0.9, 1.5, 0.4, 0.26),
        wheel(0.9, 1.5, 0.4, 0.26),
      ];
      return merge(parts);
    }
    case 'truck': {
      const paint = pick(PAINT.truck, rnd);
      const parts = [
        // cab
        box(2.3, 1.5, 2.0, paint, 0, 1.55, -2.6),
        box(2.2, 0.8, 0.1, 0x9fd3e6, 0, 1.9, -3.62, 0),
        box(2.4, 0.5, 0.3, 0x1a1a1a, 0, 0.6, -3.55, 0),
        // load bed with wooden sides and a tarp
        box(2.4, 0.3, 5.0, 0x3a2a1a, 0, 0.95, 0.9, 0.1),
        box(2.4, 1.3, 5.0, 0xc9a86a, 0, 1.75, 0.9, 0.12),
        box(2.2, 0.5, 4.6, pick([0x2f5b8f, 0x8a8a8a, 0x2a6b3f], rnd), 0, 2.65, 0.9, 0.05),
        box(0.45, 0.2, 0.06, 0xffe7b0, -0.8, 1.05, -3.7, 0),
        box(0.45, 0.2, 0.06, 0xffe7b0, 0.8, 1.05, -3.7, 0),
        box(0.45, 0.16, 0.06, 0xd42020, -0.8, 1.15, 3.42, 0),
        box(0.45, 0.16, 0.06, 0xd42020, 0.8, 1.15, 3.42, 0),
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
      const paint = pick(PAINT.bus, rnd);
      const parts = [
        box(2.5, 2.2, 10.4, paint, 0, 1.75, 0),
        box(2.52, 0.75, 9.6, 0x9fd3e6, 0, 2.15, 0.2, 0), // window band
        box(2.4, 1.2, 0.1, 0x9fd3e6, 0, 2.2, -5.22, 0), // windscreen
        box(2.5, 0.4, 0.3, 0x1a1a1a, 0, 0.55, -5.2, 0),
        box(2.4, 0.25, 10.0, 0xf0f0f0, 0, 2.95, 0, 0), // roof rack strip
        box(0.5, 0.22, 0.06, 0xffe7b0, -0.85, 1.05, -5.3, 0),
        box(0.5, 0.22, 0.06, 0xffe7b0, 0.85, 1.05, -5.3, 0),
        box(0.5, 0.18, 0.06, 0xd42020, -0.85, 1.2, 5.24, 0),
        box(0.5, 0.18, 0.06, 0xd42020, 0.85, 1.2, 5.24, 0),
        wheel(-1.05, -3.6, 0.52, 0.32),
        wheel(1.05, -3.6, 0.52, 0.32),
        wheel(-1.05, 3.4, 0.52, 0.32),
        wheel(1.05, 3.4, 0.52, 0.32),
      ];
      return merge(parts);
    }
    case 'tanker': {
      const parts = [
        box(2.3, 1.5, 2.0, pick([0xd9822b, 0xf0f0f0, 0x2f7d4a], rnd), 0, 1.55, -3.6),
        box(2.2, 0.8, 0.1, 0x9fd3e6, 0, 1.9, -4.62, 0),
        box(2.4, 0.5, 0.3, 0x1a1a1a, 0, 0.6, -4.55, 0),
        box(2.4, 0.3, 6.6, 0x2a2a2a, 0, 0.95, 0.9, 0.1), // chassis
        place(
          colorize(new CylinderGeometry(1.05, 1.05, 6.4, 14), 0xe8e8e8, 0.05),
          0,
          2.0,
          0.9,
          1,
          Math.PI / 2,
        ),
        box(0.9, 0.3, 1.2, 0xc02020, 0, 3.1, 0.9, 0), // top hatch
        box(0.45, 0.2, 0.06, 0xffe7b0, -0.8, 1.05, -4.7, 0),
        box(0.45, 0.2, 0.06, 0xffe7b0, 0.8, 1.05, -4.7, 0),
        wheel(-1.0, -3.6, 0.5, 0.3),
        wheel(1.0, -3.6, 0.5, 0.3),
        wheel(-1.0, 2.6, 0.5, 0.3),
        wheel(1.0, 2.6, 0.5, 0.3),
        wheel(-1.0, 3.7, 0.5, 0.3),
        wheel(1.0, 3.7, 0.5, 0.3),
      ];
      return merge(parts);
    }
  }
}

// --------------------------------------------------------------------------------- hazards ---

export type HazardKind = 'cow' | 'pothole' | 'breaker' | 'rock' | 'puddle' | 'barrel' | 'goat';

export type HazardEffect = 'solid' | 'bump' | 'slick';

export interface HazardSpec {
  kind: HazardKind;
  halfW: number;
  halfL: number;
  effect: HazardEffect;
  /** Where it sits: 'lane' = random lane, 'road' = spans the road, 'edge' = shoulder side. */
  placement: 'lane' | 'road' | 'edge';
  label: string;
}

export const HAZARD_SPECS: Record<HazardKind, HazardSpec> = {
  cow: { kind: 'cow', halfW: 0.5, halfL: 1.1, effect: 'solid', placement: 'lane', label: 'Cow' },
  goat: { kind: 'goat', halfW: 0.3, halfL: 0.55, effect: 'solid', placement: 'edge', label: 'Goat' },
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
  }
}
