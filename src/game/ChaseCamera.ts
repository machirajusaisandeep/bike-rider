import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

export interface CameraFocus {
  /** World point to look at. */
  target: Vector3;
  distance: number;
  height: number;
  /** Yaw of the camera around the target (rad, 0 = looking towards -Z). */
  yaw: number;
  /** Shift the target left on screen so the subject sits on the right side (metres). */
  sideOffset: number;
  /** Drop the look-at point (m) so the subject sits higher in the frame — room for a bottom UI. */
  screenLift?: number;
  /** Override FOV while focused. Defaults to 40. */
  fov?: number;
}
import { CAMERA } from '../core/config';
import type { CameraMode } from '../core/settings';
import type { BikePhysics } from './BikePhysics';

const _target = new Vector3();
const _desired = new Vector3();
const _look = new Vector3();
const _right = new Vector3();

export const CAMERA_MODES: CameraMode[] = ['chase', 'cockpit', 'cinematic'];

export const CAMERA_LABELS: Record<CameraMode, string> = {
  chase: 'Chase',
  cockpit: 'Cockpit',
  cinematic: 'Cinematic',
};

export class ChaseCamera {
  mode: CameraMode = 'chase';
  private pos = new Vector3(0, 3, 8);
  private lookAt = new Vector3();
  private orbit = 0;
  private shake = 0;
  private kickAmt = 0;
  private snap = true;
  /** Tight orbit around the rider for the gear screen. */
  private closeUp = false;
  /** Fixed framing (character screen). Overrides every mode while set. */
  private focus: CameraFocus | null = null;
  /** Terrain sampler so the camera never dips below the ground. */
  heightAt: (x: number, z: number) => number = () => 0;

  constructor(readonly camera: PerspectiveCamera) {}

  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.snap = true;
  }

  setCloseUp(on: boolean): void {
    this.closeUp = on;
  }

  setFocus(f: CameraFocus | null): void {
    // Entering focus from free camera: jump straight there instead of easing across the scene.
    if (f && !this.focus) this.snap = true;
    if (!f && this.focus) this.snap = true;
    this.focus = f;
  }

  cycle(): CameraMode {
    const i = CAMERA_MODES.indexOf(this.mode);
    this.setMode(CAMERA_MODES[(i + 1) % CAMERA_MODES.length]!);
    return this.mode;
  }

  /** Force the camera to jump to its ideal spot next frame (after reset). */
  resetSmoothing(): void {
    this.snap = true;
  }

  /** Impact shake, 0..1. Decays on its own. */
  kick(amount: number): void {
    this.kickAmt = Math.min(1.5, this.kickAmt + amount);
  }

  update(dt: number, bike: BikePhysics, roughness: number, elapsed: number): void {
    const cam = this.camera;
    const fwd = bike.forward;
    _right.set(-fwd.z, 0, fwd.x);
    const ratio = bike.speedRatio;

    if (this.focus) {
      const f = this.focus;
      const dir = new Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw));
      const rightV = new Vector3(dir.z, 0, -dir.x);
      _desired.copy(f.target).addScaledVector(dir, f.distance);
      _desired.y = f.target.y + f.height;
      _target.copy(f.target).addScaledVector(rightV, -f.sideOffset);
      _target.y -= f.screenLift ?? 0;
      const lag = 6;
      this.pos.lerp(_desired, Math.min(1, lag * dt));
      this.lookAt.lerp(_target, Math.min(1, lag * dt));
      if (this.snap) {
        this.pos.copy(_desired);
        this.lookAt.copy(_target);
        this.snap = false;
      }
      cam.position.copy(this.pos);
      cam.lookAt(this.lookAt);
      const fov = f.fov ?? 40;
      if (Math.abs(cam.fov - fov) > 0.01) {
        cam.fov = MathUtils.lerp(cam.fov, fov, Math.min(1, 3 * dt));
        cam.updateProjectionMatrix();
      }
      return;
    }

    switch (this.mode) {
      case 'chase': {
        const dist = CAMERA.chaseDistance + ratio * 1.6;
        _desired.copy(bike.position).addScaledVector(fwd, -dist);
        _desired.y = bike.position.y + CAMERA.chaseHeight + ratio * 0.35;
        // Slide the camera to the outside of the turn so the lean reads nicely.
        _desired.addScaledVector(_right, bike.lean * 0.9);
        _target.copy(bike.position).addScaledVector(fwd, CAMERA.chaseLookAhead + ratio * 4);
        _target.y = bike.position.y + 0.85;
        break;
      }
      case 'cockpit': {
        _desired.copy(bike.position).addScaledVector(fwd, -0.25);
        _desired.y = bike.position.y + 1.38;
        _desired.addScaledVector(_right, bike.lean * 0.25);
        _target.copy(bike.position).addScaledVector(fwd, 12);
        _target.y = bike.position.y + 0.9 + ratio * 0.5 - Math.sin(bike.pitch) * 6;
        break;
      }
      case 'cinematic': {
        this.orbit += dt * (this.closeUp ? 0.18 : 0.22 + ratio * 0.15);
        const r = this.closeUp
          ? 3.4 + Math.sin(elapsed * 0.31) * 0.3
          : 6.5 + Math.sin(elapsed * 0.31) * 1.2;
        _desired.set(
          bike.position.x + Math.cos(this.orbit) * r,
          bike.position.y +
            (this.closeUp
              ? 1.45 + Math.sin(elapsed * 0.47) * 0.15
              : 1.2 + (Math.sin(elapsed * 0.47) * 0.5 + 0.5) * 1.6),
          bike.position.z + Math.sin(this.orbit) * r,
        );
        _target.copy(bike.position).addScaledVector(fwd, this.closeUp ? 0.1 : 1.2);
        _target.y = bike.position.y + (this.closeUp ? 1.05 : 0.7);
        break;
      }
    }

    // Never let the camera sink into the terrain.
    const groundY = this.heightAt(_desired.x, _desired.z) + (this.mode === 'cockpit' ? 0.4 : 1.1);
    if (_desired.y < groundY) _desired.y = groundY;

    if (this.snap) {
      this.pos.copy(_desired);
      this.lookAt.copy(_target);
      this.snap = false;
    } else {
      const lag = this.mode === 'cinematic' ? 2.5 : CAMERA.followLag + ratio * 2;
      this.pos.lerp(_desired, Math.min(1, lag * dt));
      this.lookAt.lerp(_target, Math.min(1, CAMERA.lookLag * dt));
    }

    // Rough surface / engine vibration shake
    this.shake = MathUtils.lerp(this.shake, roughness, Math.min(1, 6 * dt));
    this.kickAmt = Math.max(0, this.kickAmt - dt * 2.2);
    const s =
      this.shake * (this.mode === 'cockpit' ? 0.05 : 0.03) +
      this.kickAmt * this.kickAmt * (this.mode === 'cockpit' ? 0.25 : 0.18);
    const t = elapsed * 37;
    cam.position.set(
      this.pos.x + Math.sin(t * 1.3) * s,
      this.pos.y + Math.sin(t * 1.7 + 1.3) * s,
      this.pos.z + Math.cos(t * 1.1) * s,
    );
    _look.copy(this.lookAt);
    cam.lookAt(_look);

    // Speed-based FOV, subtle roll with the lean in cockpit view.
    const fov = CAMERA.baseFov + ratio * CAMERA.fovSpeedGain;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = MathUtils.lerp(cam.fov, fov, Math.min(1, 3 * dt));
      cam.updateProjectionMatrix();
    }
    if (this.mode === 'cockpit') cam.rotateZ(bike.lean * 0.6);
  }
}
