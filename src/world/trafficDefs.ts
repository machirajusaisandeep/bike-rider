import type { SceneId } from './scenes';
import type { HazardKind, VehicleKind } from './vehicles';

export interface TrafficDef {
  /** 0 = empty road, 1 = normal, 1.5+ = Bengaluru at 6 pm. */
  density: number;
  /** Weighted mix of vehicle kinds. */
  vehicles: Partial<Record<VehicleKind, number>>;
  /** Expected hazards per kilometre per kind. */
  hazards: Partial<Record<HazardKind, number>>;
  /** Lane changes per vehicle per second where there are two lanes per direction. */
  laneChange: number;
  /** Two-wheelers squeeze past slower traffic instead of queueing behind it. */
  filter: boolean;
}

/** Metro pier offsets inside a 40 m tile; City draws the deck to match. */
export const METRO_PIER_Z = [10, 30];

export const TRAFFIC_BY_SCENE: Record<SceneId, TrafficDef> = {
  munnar: {
    density: 0.8,
    vehicles: { hatch: 4, suv: 3, auto: 2, bus: 2, truck: 1, scooter: 2, bike: 2, tempo: 1 },
    hazards: { pothole: 2.5, cow: 0.6, goat: 1.2, breaker: 1.0, puddle: 0.6 },
    laneChange: 0,
    filter: true,
  },
  ladakh: {
    density: 0.55,
    vehicles: { truck: 4, suv: 3, tanker: 2, bike: 2, bus: 0.5, tempo: 0.5 },
    hazards: { rock: 3.0, pothole: 3.5, barrel: 1.0, cow: 0.2 },
    laneChange: 0,
    filter: true,
  },
  wayanad: {
    density: 0.85,
    vehicles: { hatch: 3, suv: 2, auto: 3, bus: 2, truck: 2, scooter: 2, bike: 2, tempo: 1 },
    hazards: { puddle: 3.5, pothole: 3.0, cow: 0.8, breaker: 1.2, goat: 0.6 },
    laneChange: 0,
    filter: true,
  },
  ooty: {
    density: 0.9,
    vehicles: { hatch: 4, suv: 3, auto: 2, bus: 3, truck: 1, scooter: 2, bike: 1, tempo: 1 },
    hazards: { cow: 1.4, breaker: 1.8, pothole: 1.5, goat: 1.0 },
    laneChange: 0,
    filter: true,
  },
  varkala: {
    density: 0.75,
    vehicles: { auto: 4, scooter: 4, bike: 2, hatch: 3, suv: 1, bus: 1, tempo: 1 },
    hazards: { breaker: 2.0, cow: 0.8, goat: 1.0, pothole: 1.2 },
    laneChange: 0,
    filter: true,
  },
  bengaluru: {
    density: 1.9,
    vehicles: {
      hatch: 5,
      auto: 5,
      scooter: 6,
      bike: 5,
      suv: 3,
      bus: 3,
      tempo: 2,
      truck: 1,
      tanker: 0.5,
    },
    hazards: { pothole: 4.5, breaker: 1.2, barrel: 2.0, cow: 0.6, pier: 1 },
    laneChange: 0.14,
    filter: true,
  },
};
