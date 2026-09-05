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
  width: 7.5,
  shoulder: 2.2,
  /** Length of a single recyclable road tile (m). */
  tileLength: 40,
  /** Number of tiles kept alive around the rider. */
  tileCount: 18,
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
 * Optional external bike model. Set to a URL (e.g. '/models/scram411.glb') to load a
 * licensed GLTF/GLB instead of the built-in procedural model. See README for the
 * expected node naming so wheels and steering still animate.
 */
export const EXTERNAL_BIKE_MODEL: string | null = null;
