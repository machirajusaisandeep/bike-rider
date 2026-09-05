import { Vector3 } from 'three';
import { BIKE } from '../core/config';
import type { InputState } from '../core/Input';
import { DEFAULT_CHASSIS, gearThresholdsKmh, type BikeChassis } from './bikes';

export type Surface = 'asphalt' | 'gravel' | 'off' | 'wet';

const SURFACE_GRIP: Record<Surface, number> = { asphalt: 1, gravel: 0.72, off: 0.5, wet: 0.7 };

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
  /** nose-up pitch (rad) from the terrain under the wheels */
  pitch = 0;
  /** Terrain height sampler; set by the world. */
  heightAt: (x: number, z: number) => number = () => 0;
  /** Lowside slide after a fatal crash: no control, heavy friction, bike on its side. */
  crashed = false;
  /** Multipliers from bike upgrades (1 = stock). */
  tune = { power: 1, brakes: 1, grip: 1, offroad: 1 };
  /** Selected bike's chassis. Defaults to the starter Scram. */
  chassis: BikeChassis = { ...DEFAULT_CHASSIS, seat: { ...DEFAULT_CHASSIS.seat } };

  readonly forward = new Vector3(0, 0, -1);

  setChassis(c: BikeChassis): void {
    this.chassis = { ...c, seat: { ...c.seat } };
  }

  reset(x: number, z: number, heading = 0): void {
    this.position.set(x, 0, z);
    this.heading = heading;
    this.pitch = 0;
    this.speed = 0;
    this.steerAngle = 0;
    this.lean = 0;
    this.yawRate = 0;
    this.crashed = false;
    this.updateForward();
    this.position.y = this.heightAt(x, z);
  }

  /**
   * Non-fatal impact: lose speed, get kicked away from the obstacle (`side` = +1 obstacle on the
   * right) and wobble. `severity` 0..1 scales everything.
   */
  impulse(side: 1 | -1, severity: number): void {
    const s = clamp(severity, 0, 1);
    this.speed *= 1 - 0.55 * s;
    // yaw away from the obstacle; heading increases turn left (heading 0 faces -Z)
    this.heading += side * (0.08 + 0.22 * s);
    this.yawRate = side * 1.5 * s;
    this.lean = -side * 0.35 * s;
    this.updateForward();
  }

  /** Fatal crash: start the lowside slide in the current direction of travel. */
  crash(side: 1 | -1 = 1): void {
    this.crashed = true;
    this.steerAngle = 0;
    this.leanTarget = side * 1.35;
  }
  private leanTarget = 0;

  get speedKmh(): number {
    return Math.abs(this.speed) * 3.6;
  }

  get speedRatio(): number {
    return clamp(Math.abs(this.speed) / this.chassis.maxSpeed, 0, 1);
  }

  private get gearThresholds(): number[] {
    return gearThresholdsKmh(this.chassis);
  }

  /** 1..N, or 0 for neutral/reverse */
  get gear(): number {
    if (this.speed < -0.3) return -1;
    const kmh = this.speedKmh;
    if (kmh < 1) return 0;
    const th = this.gearThresholds;
    let g = 1;
    for (let i = 1; i < th.length; i++) {
      if (kmh >= th[i]!) g = i + 1;
    }
    return g;
  }

  /** Fake tachometer 0..1 that saws through the gears. */
  get rpm(): number {
    const g = this.gear;
    if (g <= 0) return 0.12;
    const th = this.gearThresholds;
    const lo = th[g - 1] ?? 0;
    const hi = th[g] ?? this.chassis.maxSpeed * 3.6;
    const t = clamp((this.speedKmh - lo) / (hi - lo), 0, 1);
    return 0.22 + t * 0.7;
  }

  update(dt: number, input: InputState): void {
    if (this.crashed) {
      this.updateCrash(dt);
      return;
    }
    const grip =
      SURFACE_GRIP[this.surface] *
      (this.surface === 'asphalt' ? 1 : this.tune.offroad) *
      this.tune.grip;
    const v = this.speed;
    const absV = Math.abs(v);
    const ratio = this.speedRatio;

    // --- longitudinal -----------------------------------------------------------
    let a = 0;
    if (input.throttle > 0 && v > -0.2) {
      // Power tails off approaching top speed.
      a +=
        input.throttle *
        this.chassis.accel *
        this.tune.power *
        (1 - 0.55 * ratio * ratio) *
        (0.6 + 0.4 * grip);
    }
    const reversing = input.brake > 0 && v <= 0.25 && input.throttle === 0;
    if (input.brake > 0) {
      if (v > 0.25) a -= BIKE.brakeDecel * this.tune.brakes * input.brake * (0.55 + 0.45 * grip);
      else if (reversing) a -= BIKE.reverseAccel; // creep backwards
    }
    if (input.handbrake && absV > 0.05) {
      a -= Math.sign(v) * BIKE.brakeDecel * 1.15 * (0.5 + 0.5 * grip);
    }
    // Gravity along the slope: climbs cost speed, descents give it back (softened for arcade feel).
    a -= BIKE.gravity * Math.sin(this.pitch) * 0.55;
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
      this.chassis.maxSpeed *
        (this.surface === 'off' ? 0.35 : this.surface === 'gravel' ? 0.75 : 1),
    );
    if (Math.abs(nv) < 0.02 && input.throttle === 0 && input.brake === 0) nv = 0;
    this.speed = nv;

    // --- steering ----------------------------------------------------------------
    // Limit steering so lateral acceleration stays under the grip budget: a_lat = v^2 * tan(d) / L.
    const latMax =
      BIKE.gravity * (BIKE.latGripLow + (BIKE.latGripHigh - BIKE.latGripLow) * smoothstep(ratio));
    const v2 = Math.max(0.25, this.speed * this.speed);
    const maxSteer = Math.min(
      BIKE.steerMaxLow,
      Math.atan((latMax * this.chassis.wheelbase) / v2),
    );
    const targetSteer = input.steer * maxSteer;
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, BIKE.steerResponse * dt);

    const effectiveV = this.speed;
    let yawRate = -(effectiveV / this.chassis.wheelbase) * Math.tan(this.steerAngle);
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
    // Elevation + pitch from the terrain sampled at the wheel contact points.
    const half = this.chassis.wheelbase / 2;
    const fx = this.position.x + this.forward.x * half;
    const fz = this.position.z + this.forward.z * half;
    const rx = this.position.x - this.forward.x * half;
    const rz = this.position.z - this.forward.z * half;
    const hf = this.heightAt(fx, fz);
    const hr = this.heightAt(rx, rz);
    this.position.y = (hf + hr) / 2;
    const targetPitch = Math.atan2(hf - hr, this.chassis.wheelbase);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, 10 * dt);
  }

  private updateCrash(dt: number): void {
    // Sliding metal on tarmac: ~0.6 g, more on gravel.
    const mu = this.surface === 'asphalt' ? 6 : 9;
    const absV = Math.abs(this.speed);
    const nv = Math.max(0, absV - mu * dt) * Math.sign(this.speed || 1);
    this.speed = Math.abs(nv) < 0.05 ? 0 : nv;
    this.lean += (this.leanTarget - this.lean) * Math.min(1, 9 * dt);
    this.yawRate *= Math.max(0, 1 - 3 * dt);
    this.heading += this.yawRate * dt;
    this.updateForward();
    const dist = this.speed * dt;
    this.frameDistance = dist;
    this.position.addScaledVector(this.forward, dist);
    this.position.y = this.heightAt(this.position.x, this.position.z);
  }

  private updateForward(): void {
    this.forward.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  }
}
