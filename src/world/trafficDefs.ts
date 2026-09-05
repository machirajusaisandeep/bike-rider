import type { SceneId } from './scenes';
import type { HazardKind, VehicleKind } from './vehicles';

export interface TrafficDef {
  /** 0 = empty road, 1 = normal, 1.5 = Bengaluru at 6 pm. */
  density: number;
  /** Weighted mix of vehicle kinds. */
  vehicles: Partial<Record<VehicleKind, number>>;
  /** Expected hazards per kilometre per kind. */
  hazards: Partial<Record<HazardKind, number>>;
}

export const TRAFFIC_BY_SCENE: Record<SceneId, TrafficDef> = {
  munnar: {
    density: 0.8,
    vehicles: { hatch: 4, suv: 3, auto: 2, bus: 2, truck: 1, scooter: 2 },
    hazards: { pothole: 2.5, cow: 0.6, goat: 1.2, breaker: 1.0, puddle: 0.6 },
  },
  ladakh: {
    density: 0.55,
    vehicles: { truck: 4, suv: 3, tanker: 2, scooter: 0.5, bus: 0.5 },
    hazards: { rock: 3.0, pothole: 3.5, barrel: 1.0, cow: 0.2 },
  },
  wayanad: {
    density: 0.85,
    vehicles: { hatch: 3, suv: 2, auto: 3, bus: 2, truck: 2, scooter: 2 },
    hazards: { puddle: 3.5, pothole: 3.0, cow: 0.8, breaker: 1.2, goat: 0.6 },
  },
  ooty: {
    density: 0.9,
    vehicles: { hatch: 4, suv: 3, auto: 2, bus: 3, truck: 1, scooter: 2 },
    hazards: { cow: 1.4, breaker: 1.8, pothole: 1.5, goat: 1.0 },
  },
  varkala: {
    density: 0.75,
    vehicles: { auto: 4, scooter: 4, hatch: 3, suv: 1, bus: 1 },
    hazards: { breaker: 2.0, cow: 0.8, goat: 1.0, pothole: 1.2 },
  },
  bengaluru: {
    density: 1.4,
    vehicles: { hatch: 5, auto: 5, scooter: 6, suv: 3, bus: 3, truck: 1, tanker: 0.5 },
    hazards: { pothole: 4.0, breaker: 1.5, barrel: 1.5, cow: 0.5 },
  },
};
