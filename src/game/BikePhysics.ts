import { Vector3 } from 'three';
import { BIKE, GEAR_THRESHOLDS_KMH } from '../core/config';
import type { InputState } from '../core/Input';

export type Surface = 'asphalt' | 'gravel' | 'off';

const SURFACE_GRIP: Record<Surface, number> = { asphalt: 1, gravel: 0.72, off: 0.5 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smoothstep = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/**
 * Arcade bicycle-model handling. Not a physics sim: the goal is a bike that feels planted,
 * leans into corners and never spins out, while still respecting speed-dependent steering.
 *
 * Conventions: the bike faces -Z at heading 0. Positive steer = right.
 */
export class BikePhysics {
  readonly position = new Vector3(0, 0, 0);
  heading = 0; // yaw, radians
  speed = 0; // m/s, signed
  steerAngle = 0; // rad, front wheel
  lean = 0; // rad, roll (negative = leaning right)
  yawRate = 0;
  surface: Surface = 'asphalt';
  /** distance travelled this frame, for wheel spin */
  frameDistance = 0;

  readonly forward = new Vector3(0, 0, -1);

  reset(x: number, z: number, heading = 0): void {
    this.position.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steerAngle = 0;
    this.lean = 0;
    this.yawRate = 0;
    this.updateForward();
  }

  get speedKmh(): number {
    return Math.abs(this.speed) * 3.6;
  }

  get speedRatio(): number {
    return clamp(Math.abs(this.speed) / BIKE.maxSpeed, 0, 1);
  }

  /** 1..5, or 0 for neutral/reverse */
  get gear(): number {
    if (this.speed < -0.3) return -1;
    const kmh = this.speedKmh;
    if (kmh < 1) return 0;
    let g = 1;
    for (let i = 1; i < GEAR_THRESHOLDS_KMH.length; i++) {
      if (kmh >= GEAR_THRESHOLDS_KMH[i]!) g = i + 1;
    }
    return g;
  }

  /** Fake tachometer 0..1 that saws through the gears. */
  get rpm(): number {
    const g = this.gear;
    if (g <= 0) return 0.12;
    const lo = GEAR_THRESHOLDS_KMH[g - 1] ?? 0;
    const hi = GEAR_THRESHOLDS_KMH[g] ?? BIKE.maxSpeed * 3.6;
    const t = clamp((this.speedKmh - lo) / (hi - lo), 0, 1);
    return 0.22 + t * 0.7;
  }

  update(dt: number, input: InputState): void {
    const grip = SURFACE_GRIP[this.surface];
    const v = this.speed;
    const absV = Math.abs(v);
    const ratio = this.speedRatio;

    // --- longitudinal -----------------------------------------------------------
    let a = 0;
    if (input.throttle > 0 && v > -0.2) {
      // Power tails off approaching top speed.
      a += input.throttle * BIKE.accel * (1 - 0.55 * ratio * ratio) * (0.6 + 0.4 * grip);
    }
    const reversing = input.brake > 0 && v <= 0.25 && input.throttle === 0;
    if (input.brake > 0) {
      if (v > 0.25) a -= BIKE.brakeDecel * input.brake * (0.55 + 0.45 * grip);
      else if (reversing) a -= BIKE.reverseAccel; // creep backwards
    }
    if (input.handbrake && absV > 0.05) {
      a -= Math.sign(v) * BIKE.brakeDecel * 1.15 * (0.5 + 0.5 * grip);
    }
    // Drag: rolling + aero + engine braking when coasting. Off-road adds heavy rolling loss.
    const rolling =
      BIKE.rollingDrag * (this.surface === 'asphalt' ? 1 : this.surface === 'gravel' ? 2.2 : 5);
    if (absV > 0.01) {
      a -= Math.sign(v) * rolling;
      a -= BIKE.aeroDrag * v * absV;
      if (input.throttle === 0 && !reversing) a -= Math.sign(v) * BIKE.engineBrake;
    }

    let nv = v + a * dt;
    // Prevent drag/braking from pushing through zero.
    if ((v > 0 && nv < 0 && input.brake === 0) || (v < 0 && nv > 0 && input.throttle === 0)) nv = 0;
    if (input.handbrake && Math.sign(nv) !== Math.sign(v)) nv = 0;
    nv = clamp(
      nv,
      -BIKE.maxReverseSpeed,
      BIKE.maxSpeed * (this.surface === 'off' ? 0.35 : this.surface === 'gravel' ? 0.75 : 1),
    );
    if (Math.abs(nv) < 0.02 && input.throttle === 0 && input.brake === 0) nv = 0;
    this.speed = nv;

    // --- steering ----------------------------------------------------------------
    // Limit steering so lateral acceleration stays under the grip budget: a_lat = v^2 * tan(d) / L.
    const latMax =
      BIKE.gravity * (BIKE.latGripLow + (BIKE.latGripHigh - BIKE.latGripLow) * smoothstep(ratio));
    const v2 = Math.max(0.25, this.speed * this.speed);
    const maxSteer = Math.min(BIKE.steerMaxLow, Math.atan((latMax * BIKE.wheelbase) / v2));
    const targetSteer = input.steer * maxSteer;
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, BIKE.steerResponse * dt);

    const effectiveV = this.speed;
    let yawRate = -(effectiveV / BIKE.wheelbase) * Math.tan(this.steerAngle);
    yawRate *= 0.8 + 0.2 * grip;
    yawRate = clamp(yawRate, -2.2, 2.2);
    this.yawRate = yawRate;
    this.heading += yawRate * dt;

    // --- lean --------------------------------------------------------------------
    // Lean balances centripetal acceleration; add a little extra so it reads well.
    const targetLean = clamp(
      Math.atan((effectiveV * yawRate) / BIKE.gravity) * 1.1,
      -BIKE.leanMax,
      BIKE.leanMax,
    );
    this.lean += (targetLean - this.lean) * Math.min(1, BIKE.leanResponse * dt);

    // --- integrate ---------------------------------------------------------------
    this.updateForward();
    const dist = this.speed * dt;
    this.frameDistance = dist;
    this.position.addScaledVector(this.forward, dist);
  }

  private updateForward(): void {
    this.forward.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  }
}
