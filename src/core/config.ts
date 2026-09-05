/**
 * Central tuning knobs. Everything gameplay-related lives here so the feel can be
 * adjusted without hunting through systems.
 */
export const BIKE = {
  /** Scram 411 wheelbase is ~1455 mm. */
  wheelbase: 1.455,
  frontWheelRadius: 0.355, // 19" dual-purpose tyre
  rearWheelRadius: 0.33, // 17" dual-purpose tyre
  /** Top speed of a real Scram 411 is roughly 120 km/h. */
  maxSpeed: 34, // m/s (~122 km/h)
  maxReverseSpeed: 3.5,
  accel: 6.5, // m/s^2 at standstill
  brakeDecel: 13,
  engineBrake: 1.2,
  rollingDrag: 0.35,
  aeroDrag: 0.0028,
  reverseAccel: 3.2,
  /** Max steering angle (rad) at walking pace. At speed it is limited by lateral grip. */
  steerMaxLow: 0.5,
  /** Max lateral acceleration in g at standstill and at top speed (arcade: > 1 g is fine). */
  latGripLow: 0.85,
  latGripHigh: 1.45,
  steerResponse: 7, // how fast the front wheel reaches the target angle
  leanMax: 0.6, // rad
  leanResponse: 5,
  gravity: 9.81,
} as const;

export const ROAD = {
  /** Length of a single recyclable road tile (m); reset snaps to tile boundaries. */
  tileLength: 40,
  /** How far off the asphalt the ride is still "on route". */
  offRouteDistance: 22,
} as const;

export const CAMERA = {
  baseFov: 58,
  fovSpeedGain: 14,
  chaseDistance: 4.9,
  chaseHeight: 1.85,
  chaseLookAhead: 3,
  followLag: 4.5,
  lookLag: 8,
} as const;

/** Speed thresholds (km/h) for the simulated gearbox. */
export const GEAR_THRESHOLDS_KMH = [0, 18, 38, 60, 85] as const;

/**
 * Optional external bike model, relative to the site base. `npm run fetch-model` places Royal
 * Enfield's Scram 411 GLB here for local use (it is gitignored, see README). If the file is
 * missing the game silently keeps the built-in procedural bike.
 */
export const EXTERNAL_BIKE_MODEL: string | null = import.meta.env.VITE_PUBLIC_BUILD
  ? null
  : 'models/scram411.glb';
export const DRACO_DECODER_PATH = 'draco/';
/** Recolour the model's Graphite Red tank texture to the White Flame scheme. */
export const WHITE_FLAME_RECOLOUR = true;

/** Traffic, hazards and scoring tuning. */
export const TRAFFIC = {
  /** Lane centre offset from the road centreline as a fraction of half the road width. */
  laneFraction: 0.5,
  /** Vehicles spawn this far ahead of the rider (m) and are recycled this far behind. */
  spawnAhead: 260,
  despawnBehind: 40,
  /** Base vehicles alive per direction at density 1. */
  perDirection: 5,
  /** A near miss is passing inside this lateral gap (m) at or above this speed (km/h). */
  nearMissGap: 1.25,
  nearMissMinKmh: 55,
  /** Bike collision capsule in road space. */
  bikeRadius: 0.42,
  bikeLength: 2.1,
} as const;

export const HEALTH = {
  /** Impacts below this relative speed (km/h) are harmless wobbles. */
  harmlessKmh: 14,
  /** Relative speed (km/h) at which an unprotected rider takes full damage. */
  fatalKmh: 95,
  /** Fraction of damage that full (100/100) gear removes. */
  gearMitigation: 0.75,
  /** Damage above this ends the run outright regardless of remaining health. */
  fatalDamage: 0.92,
  /** Seconds of invulnerability after a hit so one crash does not double count. */
  graceS: 1.2,
} as const;
