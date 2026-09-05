import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Quaternion,
  SRGBColorSpace,
  SphereGeometry,
  SpotLight,
  TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BIKE } from '../core/config';

/**
 * A Royal Enfield Scram 411 "White Flame"-inspired bike built from primitives.
 *
 * Why procedural: Royal Enfield's own 3D asset is not licensed for reuse, so this is an
 * original approximation of the silhouette (19"/17" dual-purpose wheels, round headlight
 * with mini cowl, single-cylinder engine, upswept exhaust, flat single seat, white tank with
 * a flame graphic). Swap it for a licensed GLB via `loadExternalBike` when available.
 *
 * Hierarchy: root(yaw/pos) > lean(roll) > { steerPivot > { fork, bars, frontWheel }, rearWheel, body }
 */
export class Bike {
  readonly root = new Group();
  readonly lean = new Group();
  readonly steerPivot = new Group();
  readonly frontWheel = new Group();
  readonly rearWheel = new Group();
  readonly headlight: SpotLight;
  readonly tailLight: PointLight;
  private headlightMat: MeshStandardMaterial;
  private baseSteerQuat = new Quaternion();
  private tailMat: MeshStandardMaterial;

  constructor() {
    this.root.add(this.lean);
    this.lean.add(this.steerPivot, this.rearWheel);

    const M = createMaterials();
    this.headlightMat = M.headlightGlass;
    this.tailMat = M.tailGlass;

    // --- Key points (metres). Bike faces -Z. -------------------------------------
    const R = new Vector3(0, BIKE.rearWheelRadius, BIKE.wheelbase / 2); // rear axle
    const F = new Vector3(0, BIKE.frontWheelRadius, -BIKE.wheelbase / 2); // front axle
    const HEAD = new Vector3(0, 0.98, -0.42); // steering head
    const forkDir = F.clone().sub(HEAD).normalize();
    const forkLen = F.distanceTo(HEAD);

    // --- Wheels --------------------------------------------------------------------
    this.rearWheel.add(buildWheel(BIKE.rearWheelRadius, 0.125, M));
    this.rearWheel.position.copy(R);

    const front = buildWheel(BIKE.frontWheelRadius, 0.1, M);
    this.frontWheel.add(front);

    // --- Steering assembly (pivot at head, rotates about the fork axis) -----------
    this.steerPivot.position.copy(HEAD);
    // Align the pivot's local Y with the fork axis so the wheel rotates about the true steering axis.
    this.steerPivot.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), forkDir);
    this.baseSteerQuat.copy(this.steerPivot.quaternion);
    const steerLocal = new Group();
    // Undo the tilt for children so we can place parts in world-ish local coords.
    steerLocal.quaternion.copy(this.steerPivot.quaternion).invert();
    this.steerPivot.add(steerLocal);

    const frontLocal = F.clone().sub(HEAD);
    this.frontWheel.position.copy(frontLocal);
    steerLocal.add(this.frontWheel);

    // Fork legs: upper stanchions + lower sliders + rubber gaiters, offset ±0.095 from centre.
    for (const side of [-1, 1]) {
      const off = new Vector3(side * 0.095, 0, 0);
      const top = off.clone().add(new Vector3(0, 0.12, -0.03));
      const mid = off.clone().addScaledVector(forkDir, forkLen * 0.42);
      const bottom = off.clone().add(frontLocal);
      steerLocal.add(tube(top, mid, 0.022, M.blackGloss)); // stanchion
      steerLocal.add(tube(mid, bottom, 0.028, M.blackMatte)); // slider
      // gaiter
      const gaiterA = off.clone().addScaledVector(forkDir, forkLen * 0.18);
      const gaiterB = off.clone().addScaledVector(forkDir, forkLen * 0.4);
      const gaiter = tube(gaiterA, gaiterB, 0.036, M.rubber);
      steerLocal.add(gaiter);
      // fork bottom clamp
      const clamp = new Mesh(new CylinderGeometry(0.04, 0.04, 0.06, 12), M.blackMatte);
      clamp.position.copy(bottom);
      clamp.rotation.z = Math.PI / 2;
      steerLocal.add(clamp);
    }
    // Triple clamps
    for (const y of [0.0, 0.11]) {
      const tc = new Mesh(new BoxGeometry(0.24, 0.035, 0.09), M.blackMatte);
      tc.position.set(0, y, -0.02);
      steerLocal.add(tc);
    }
    // Handlebar: gentle rise + pull-back, built from segments.
    const barPts = [
      new Vector3(-0.39, 0.2, 0.02),
      new Vector3(-0.28, 0.2, -0.02),
      new Vector3(-0.1, 0.17, -0.03),
      new Vector3(0.1, 0.17, -0.03),
      new Vector3(0.28, 0.2, -0.02),
      new Vector3(0.39, 0.2, 0.02),
    ];
    for (let i = 0; i < barPts.length - 1; i++) {
      steerLocal.add(tube(barPts[i]!, barPts[i + 1]!, 0.014, M.blackGloss));
    }
    // Risers
    steerLocal.add(
      tube(new Vector3(-0.06, 0.11, -0.02), new Vector3(-0.06, 0.17, -0.03), 0.014, M.blackMatte),
    );
    steerLocal.add(
      tube(new Vector3(0.06, 0.11, -0.02), new Vector3(0.06, 0.17, -0.03), 0.014, M.blackMatte),
    );
    // Grips & levers
    for (const side of [-1, 1]) {
      const grip = new Mesh(new CylinderGeometry(0.02, 0.02, 0.13, 12), M.rubber);
      grip.position.set(side * 0.34, 0.2, 0.01);
      grip.rotation.z = Math.PI / 2;
      steerLocal.add(grip);
      const lever = tube(
        new Vector3(side * 0.24, 0.2, -0.02),
        new Vector3(side * 0.36, 0.19, -0.1),
        0.006,
        M.aluminium,
      );
      steerLocal.add(lever);
      // Mirrors
      const stalkTop = new Vector3(side * 0.33, 0.44, 0.05);
      steerLocal.add(tube(new Vector3(side * 0.27, 0.2, -0.01), stalkTop, 0.008, M.blackGloss));
      const mirror = new Mesh(new CylinderGeometry(0.055, 0.055, 0.015, 20), M.blackGloss);
      mirror.position.copy(stalkTop).add(new Vector3(side * 0.03, 0.02, 0.01));
      mirror.rotation.x = Math.PI / 2;
      mirror.rotation.z = side * 0.35;
      steerLocal.add(mirror);
      const glass = new Mesh(new CylinderGeometry(0.048, 0.048, 0.004, 20), M.mirrorGlass);
      glass.position.copy(mirror.position).add(new Vector3(0, 0, 0.009));
      glass.rotation.copy(mirror.rotation);
      steerLocal.add(glass);
    }
    // Small digital instrument pod
    const pod = new Mesh(new CylinderGeometry(0.06, 0.06, 0.035, 20), M.blackMatte);
    pod.position.set(0, 0.2, -0.09);
    pod.rotation.x = Math.PI / 2 - 0.5;
    steerLocal.add(pod);
    const podFace = new Mesh(new CylinderGeometry(0.05, 0.05, 0.004, 20), M.screen);
    podFace.position.set(0, 0.209, -0.106);
    podFace.rotation.copy(pod.rotation);
    steerLocal.add(podFace);

    // Headlight: round unit with black shell and a mini cowl / fly screen.
    const shell = new Mesh(new CylinderGeometry(0.1, 0.085, 0.1, 28), M.blackGloss);
    shell.position.set(0, -0.02, -0.19);
    shell.rotation.x = Math.PI / 2;
    steerLocal.add(shell);
    const lens = new Mesh(new CylinderGeometry(0.088, 0.088, 0.012, 28), M.headlightGlass);
    lens.position.set(0, -0.02, -0.245);
    lens.rotation.x = Math.PI / 2;
    steerLocal.add(lens);
    const ring = new Mesh(new TorusGeometry(0.094, 0.008, 10, 36), M.aluminium);
    ring.position.copy(lens.position);
    steerLocal.add(ring);
    const cowl = new Mesh(new BoxGeometry(0.26, 0.11, 0.02), M.whitePaint);
    cowl.position.set(0, 0.11, -0.2);
    cowl.rotation.x = -0.45;
    steerLocal.add(cowl);
    // Headlight spot
    this.headlight = new SpotLight(0xfff1d6, 0, 28, 0.55, 0.5, 1.2);
    this.headlight.position.set(0, -0.02, -0.25);
    const hlTarget = new Object3D();
    hlTarget.position.set(0, -0.6, -6);
    steerLocal.add(hlTarget);
    this.headlight.target = hlTarget;
    steerLocal.add(this.headlight);

    // Front fender: short, hugging the tyre (Scram style), mounted to fork sliders.
    const fFender = new Mesh(
      new TorusGeometry(BIKE.frontWheelRadius + 0.055, 0.075, 8, 28, Math.PI * 0.72),
      M.blackMatte,
    );
    fFender.scale.set(1, 1, 1.15);
    fFender.position.copy(frontLocal);
    fFender.rotation.y = Math.PI / 2;
    fFender.rotation.x = 0.44;
    steerLocal.add(fFender);
    // Front brake disc + caliper
    const fDisc = new Mesh(new CylinderGeometry(0.15, 0.15, 0.006, 32), M.disc);
    fDisc.position.copy(frontLocal).add(new Vector3(-0.07, 0, 0));
    fDisc.rotation.z = Math.PI / 2;
    steerLocal.add(fDisc);
    const caliper = new Mesh(new BoxGeometry(0.035, 0.09, 0.06), M.blackGloss);
    caliper.position.copy(frontLocal).add(new Vector3(-0.085, 0.09, 0.06));
    steerLocal.add(caliper);

    // --- Body (non-steering) -------------------------------------------------------
    const body = new Group();
    this.lean.add(body);

    // Frame: half-duplex split cradle, approximated.
    const frame = M.blackGloss;
    const tankFront = new Vector3(0, 0.9, -0.38);
    const seatFront = new Vector3(0, 0.78, 0.15);
    const seatRear = new Vector3(0, 0.76, 0.86);
    const swingPivot = new Vector3(0, 0.42, 0.26);
    const engineFront = new Vector3(0, 0.3, -0.28);
    body.add(tube(HEAD, tankFront, 0.024, frame));
    body.add(tube(tankFront, seatFront, 0.024, frame)); // backbone under tank
    body.add(tube(HEAD.clone().add(new Vector3(0, -0.05, 0)), engineFront, 0.024, frame)); // downtube
    for (const side of [-1, 1]) {
      const s = new Vector3(side * 0.1, 0, 0);
      body.add(tube(seatFront.clone().add(s), seatRear.clone().add(s), 0.018, frame)); // subframe rails
      body.add(tube(seatFront.clone().add(s), swingPivot.clone().add(s), 0.02, frame)); // seat down tubes
      body.add(tube(swingPivot.clone().add(s), engineFront.clone().add(s), 0.02, frame)); // cradle
      body.add(
        tube(
          seatRear.clone().add(s),
          swingPivot
            .clone()
            .add(s)
            .add(new Vector3(0, 0.02, 0.08)),
          0.016,
          frame,
        ),
      ); // rear stays
      // Swingarm
      body.add(
        tube(
          swingPivot.clone().add(s),
          R.clone().add(new Vector3(side * 0.1, 0, 0)),
          0.024,
          M.blackMatte,
        ),
      );
      // Footpegs
      const peg = new Mesh(new CylinderGeometry(0.014, 0.014, 0.11, 10), M.rubber);
      peg.position.set(side * 0.24, 0.34, 0.16);
      peg.rotation.z = Math.PI / 2;
      body.add(peg);
      body.add(
        tube(
          new Vector3(side * 0.12, 0.38, 0.14),
          new Vector3(side * 0.2, 0.34, 0.16),
          0.012,
          M.blackMatte,
        ),
      );
    }

    // Engine: single cylinder, slightly forward-canted barrel with cooling fins.
    const crank = new Mesh(new RoundedBoxGeometry(0.3, 0.26, 0.42, 3, 0.04), M.engine);
    crank.position.set(0, 0.38, 0.02);
    body.add(crank);
    const sideCover = new Mesh(new CylinderGeometry(0.11, 0.11, 0.05, 24), M.engineDark);
    sideCover.position.set(0.16, 0.38, 0.06);
    sideCover.rotation.z = Math.PI / 2;
    body.add(sideCover);
    const clutchCover = new Mesh(new CylinderGeometry(0.12, 0.12, 0.05, 24), M.engineDark);
    clutchCover.position.set(-0.16, 0.38, 0.06);
    clutchCover.rotation.z = Math.PI / 2;
    body.add(clutchCover);
    const barrel = new Group();
    barrel.position.set(0, 0.5, -0.12);
    barrel.rotation.x = -0.22;
    body.add(barrel);
    const cyl = new Mesh(new CylinderGeometry(0.085, 0.09, 0.16, 20), M.engineDark);
    cyl.position.y = 0.08;
    barrel.add(cyl);
    for (let i = 0; i < 5; i++) {
      const fin = new Mesh(new CylinderGeometry(0.115, 0.115, 0.008, 20), M.engine);
      fin.position.y = 0.03 + i * 0.03;
      barrel.add(fin);
    }
    const head = new Mesh(new RoundedBoxGeometry(0.22, 0.12, 0.2, 2, 0.02), M.engine);
    head.position.y = 0.2;
    barrel.add(head);
    const camCover = new Mesh(new RoundedBoxGeometry(0.16, 0.05, 0.14, 2, 0.02), M.engineDark);
    camCover.position.y = 0.27;
    barrel.add(camCover);
    // Skid plate
    const skid = new Mesh(new BoxGeometry(0.3, 0.02, 0.5), M.aluminium);
    skid.position.set(0, 0.235, -0.02);
    skid.rotation.x = 0.1;
    body.add(skid);

    // Exhaust: header out of the head on the right, sweeping back into an upswept muffler.
    const ex = M.steel;
    const exPts = [
      new Vector3(0.06, 0.7, -0.22),
      new Vector3(0.17, 0.6, -0.36),
      new Vector3(0.2, 0.36, -0.32),
      new Vector3(0.21, 0.28, -0.05),
      new Vector3(0.22, 0.3, 0.3),
      new Vector3(0.22, 0.46, 0.46),
    ];
    for (let i = 0; i < exPts.length - 1; i++) body.add(tube(exPts[i]!, exPts[i + 1]!, 0.021, ex));
    const muffler = new Mesh(new CylinderGeometry(0.045, 0.052, 0.55, 20), M.blackGloss);
    muffler.position.set(0.225, 0.56, 0.72);
    muffler.rotation.x = Math.PI / 2 - 0.36;
    body.add(muffler);
    const tip = new Mesh(new CylinderGeometry(0.048, 0.04, 0.05, 20), M.steel);
    tip.position.set(0.225, 0.66, 0.98);
    tip.rotation.x = Math.PI / 2 - 0.36;
    body.add(tip);
    const shield = new Mesh(new BoxGeometry(0.03, 0.1, 0.3), M.blackMatte);
    shield.position.set(0.27, 0.6, 0.66);
    shield.rotation.x = -0.36;
    body.add(shield);

    // Rear mono-shock
    const shockTop = new Vector3(0.05, 0.72, 0.36);
    const shockBottom = new Vector3(0.05, 0.42, 0.36);
    body.add(tube(shockTop, shockBottom, 0.018, M.aluminium));
    const spring = new Mesh(new CylinderGeometry(0.038, 0.038, 0.2, 14, 1, true), M.spring);
    spring.position.copy(shockTop).lerp(shockBottom, 0.5);
    body.add(spring);

    // Fuel tank: White Flame livery on the sides, white top with a black knee stripe.
    const tank = new Mesh(new RoundedBoxGeometry(0.4, 0.3, 0.6, 4, 0.1), [
      M.tankSide, // +x
      M.tankSide, // -x
      M.tankTop, // +y
      M.whitePaint, // -y
      M.whitePaint, // +z
      M.whitePaint, // -z
    ]);
    tank.position.set(0, 0.86, -0.13);
    tank.rotation.x = 0.1;
    tank.scale.set(1, 1, 1);
    body.add(tank);
    const tankCap = new Mesh(new CylinderGeometry(0.045, 0.045, 0.02, 20), M.aluminium);
    tankCap.position.set(0, 1.015, -0.24);
    tankCap.rotation.x = 0.1;
    body.add(tankCap);
    // Side panels (black) under the seat
    for (const side of [-1, 1]) {
      const panel = new Mesh(new RoundedBoxGeometry(0.03, 0.18, 0.34, 2, 0.015), M.blackMatte);
      panel.position.set(side * 0.16, 0.66, 0.36);
      body.add(panel);
      const badge = new Mesh(new BoxGeometry(0.004, 0.05, 0.16), M.flameAccent);
      badge.position.set(side * 0.178, 0.68, 0.34);
      body.add(badge);
    }

    // Seat: flat, single piece, slight scoop.
    const seat = new Mesh(new RoundedBoxGeometry(0.31, 0.09, 0.72, 3, 0.04), M.seat);
    seat.position.set(0, 0.8, 0.5);
    body.add(seat);
    const seatBase = new Mesh(new BoxGeometry(0.28, 0.03, 0.66), M.blackMatte);
    seatBase.position.set(0, 0.755, 0.5);
    body.add(seatBase);
    // Grab rail
    body.add(tube(new Vector3(0.16, 0.8, 0.86), new Vector3(0.16, 0.84, 0.96), 0.01, M.blackGloss));
    body.add(
      tube(new Vector3(-0.16, 0.8, 0.86), new Vector3(-0.16, 0.84, 0.96), 0.01, M.blackGloss),
    );
    body.add(
      tube(new Vector3(-0.16, 0.84, 0.96), new Vector3(0.16, 0.84, 0.96), 0.01, M.blackGloss),
    );

    // Rear fender, tail light, plate
    const rFender = new Mesh(
      new TorusGeometry(BIKE.rearWheelRadius + 0.075, 0.08, 8, 28, Math.PI * 0.62),
      M.blackMatte,
    );
    rFender.scale.set(1, 1, 1.15);
    rFender.position.copy(R);
    rFender.rotation.y = Math.PI / 2;
    rFender.rotation.x = 1.05;
    body.add(rFender);
    const tailArm = new Mesh(new BoxGeometry(0.1, 0.03, 0.26), M.blackMatte);
    tailArm.position.set(0, 0.72, 1.02);
    tailArm.rotation.x = 0.35;
    body.add(tailArm);
    const tail = new Mesh(new RoundedBoxGeometry(0.12, 0.06, 0.05, 2, 0.015), M.tailGlass);
    tail.position.set(0, 0.7, 1.13);
    body.add(tail);
    this.tailLight = new PointLight(0xff2a1a, 0, 2.5, 2);
    this.tailLight.position.set(0, 0.7, 1.2);
    body.add(this.tailLight);
    const plate = new Mesh(new BoxGeometry(0.2, 0.1, 0.006), M.whitePaint);
    plate.position.set(0, 0.6, 1.16);
    plate.rotation.x = -0.25;
    body.add(plate);
    for (const side of [-1, 1]) {
      const ind = new Mesh(new SphereGeometry(0.02, 10, 10), M.indicator);
      ind.position.set(side * 0.13, 0.66, 1.1);
      body.add(ind);
      const indF = new Mesh(new SphereGeometry(0.02, 10, 10), M.indicator);
      indF.position.set(side * 0.16, 0.16, -0.16);
      steerLocal.add(indF);
    }

    // Chain + sprockets (left side)
    const sprocket = new Mesh(new CylinderGeometry(0.1, 0.1, 0.01, 24), M.disc);
    sprocket.position.copy(R).add(new Vector3(-0.12, 0, 0));
    sprocket.rotation.z = Math.PI / 2;
    body.add(sprocket);
    const chainTop = tube(
      new Vector3(-0.12, R.y + 0.1, R.z),
      new Vector3(-0.12, 0.47, 0.12),
      0.008,
      M.blackGloss,
    );
    const chainBottom = tube(
      new Vector3(-0.12, R.y - 0.1, R.z),
      new Vector3(-0.12, 0.35, 0.12),
      0.008,
      M.blackGloss,
    );
    body.add(chainTop, chainBottom);
    const rDisc = new Mesh(new CylinderGeometry(0.11, 0.11, 0.006, 32), M.disc);
    rDisc.position.copy(R).add(new Vector3(0.09, 0, 0));
    rDisc.rotation.z = Math.PI / 2;
    body.add(rDisc);

    this.root.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
    });
  }

  /** Steering angle in radians. Positive = right. */
  setSteer(angle: number): void {
    // Base fork tilt, then rotate about the local fork axis.
    this.steerPivot.quaternion.copy(this.baseSteerQuat);
    _q.setFromAxisAngle(_yAxis, -angle);
    this.steerPivot.quaternion.multiply(_q);
  }

  setLean(roll: number): void {
    this.lean.rotation.z = roll;
  }

  spin(distance: number): void {
    this.frontWheel.rotation.x -= distance / BIKE.frontWheelRadius;
    this.rearWheel.rotation.x -= distance / BIKE.rearWheelRadius;
  }

  setLights(on: boolean, braking: boolean): void {
    this.headlight.intensity = on ? 90 : 0;
    this.headlightMat.emissiveIntensity = on ? 3.5 : 0.7;
    this.tailLight.intensity = braking ? 4 : on ? 1.2 : 0;
    this.tailMat.emissiveIntensity = braking ? 4 : on ? 1.6 : 0.5;
  }
}

const _q = new Quaternion();
const _yAxis = new Vector3(0, 1, 0);

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function tube(a: Vector3, b: Vector3, radius: number, mat: Material): Mesh {
  const len = a.distanceTo(b);
  const geo = new CylinderGeometry(radius, radius, len, 10, 1);
  const m = new Mesh(geo, mat);
  m.position.copy(a).lerp(b, 0.5);
  const dir = b.clone().sub(a).normalize();
  m.quaternion.setFromUnitVectors(_yAxis, dir);
  return m;
}

function buildWheel(radius: number, width: number, M: Materials): Group {
  const g = new Group();
  const tyreThickness = 0.075;
  const rimRadius = radius - tyreThickness;
  const tyre = new Mesh(
    new TorusGeometry(radius - tyreThickness / 2, tyreThickness, 14, 40),
    M.tyre,
  );
  tyre.scale.set(1, 1, width / (tyreThickness * 2));
  tyre.rotation.y = Math.PI / 2;
  g.add(tyre);
  // Knobby tread blocks
  const blocks = 26;
  for (let i = 0; i < blocks; i++) {
    const a = (i / blocks) * Math.PI * 2;
    const blk = new Mesh(new BoxGeometry(width * 0.9, 0.018, 0.045), M.tyre);
    blk.position.set(0, Math.cos(a) * (radius + 0.006), Math.sin(a) * (radius + 0.006));
    blk.rotation.x = a;
    g.add(blk);
  }
  const rim = new Mesh(new CylinderGeometry(rimRadius, rimRadius, width * 0.7, 32, 1, true), M.rim);
  rim.rotation.z = Math.PI / 2;
  g.add(rim);
  const hub = new Mesh(new CylinderGeometry(0.055, 0.055, width * 1.3, 18), M.aluminium);
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  // Spokes: two crossed sets, offset to each rim edge.
  const spokes = 18;
  for (let s = 0; s < spokes; s++) {
    const a = (s / spokes) * Math.PI * 2;
    for (const side of [-1, 1]) {
      const from = new Vector3(side * width * 0.3, Math.cos(a) * 0.05, Math.sin(a) * 0.05);
      const twist = a + side * 0.35;
      const to = new Vector3(
        side * width * 0.3,
        Math.cos(twist) * rimRadius,
        Math.sin(twist) * rimRadius,
      );
      g.add(tube(from, to, 0.0035, M.spoke));
    }
  }
  return g;
}

interface Materials {
  blackMatte: MeshStandardMaterial;
  blackGloss: MeshStandardMaterial;
  rubber: MeshStandardMaterial;
  tyre: MeshStandardMaterial;
  rim: MeshStandardMaterial;
  spoke: MeshStandardMaterial;
  aluminium: MeshStandardMaterial;
  steel: MeshStandardMaterial;
  engine: MeshStandardMaterial;
  engineDark: MeshStandardMaterial;
  disc: MeshStandardMaterial;
  spring: MeshStandardMaterial;
  seat: MeshStandardMaterial;
  whitePaint: MeshStandardMaterial;
  tankSide: MeshStandardMaterial;
  tankTop: MeshStandardMaterial;
  flameAccent: MeshStandardMaterial;
  headlightGlass: MeshStandardMaterial;
  tailGlass: MeshStandardMaterial;
  indicator: MeshStandardMaterial;
  mirrorGlass: MeshStandardMaterial;
  screen: MeshStandardMaterial;
}

function createMaterials(): Materials {
  const std = (
    c: number,
    roughness: number,
    metalness: number,
    extra: Partial<MeshStandardMaterial> = {},
  ) => new MeshStandardMaterial({ color: c, roughness, metalness, ...extra });
  const sideTex = paintTankSide();
  const topTex = paintTankTop();
  return {
    blackMatte: std(0x141517, 0.85, 0.2),
    blackGloss: std(0x0d0e10, 0.32, 0.55),
    rubber: std(0x1b1b1b, 0.95, 0),
    tyre: std(0x111213, 0.92, 0.02),
    rim: std(0x161819, 0.45, 0.7),
    spoke: std(0xb8bcc0, 0.4, 0.9),
    aluminium: std(0xc6c9cc, 0.38, 0.9),
    steel: std(0x9fa4a8, 0.28, 1),
    engine: std(0x8c9095, 0.55, 0.85),
    engineDark: std(0x2a2c2f, 0.6, 0.6),
    disc: std(0x6c7075, 0.4, 0.95),
    spring: std(0xc21f1f, 0.5, 0.5),
    seat: std(0x1a1a1c, 0.9, 0),
    whitePaint: std(0xf4f4f2, 0.28, 0.15),
    tankSide: new MeshStandardMaterial({ map: sideTex, roughness: 0.24, metalness: 0.12 }),
    tankTop: new MeshStandardMaterial({ map: topTex, roughness: 0.24, metalness: 0.12 }),
    flameAccent: std(0xff5a1f, 0.4, 0.2),
    headlightGlass: std(0xfff6e5, 0.15, 0.1, {
      emissive: new Color(0xffe9c4),
      emissiveIntensity: 0.7,
    }),
    tailGlass: std(0xd81a1a, 0.2, 0.1, { emissive: new Color(0xff2a1a), emissiveIntensity: 0.5 }),
    indicator: std(0xffb020, 0.3, 0.1, { emissive: new Color(0xff9a00), emissiveIntensity: 0.3 }),
    mirrorGlass: std(0xe8f0ff, 0.05, 1),
    screen: std(0x0a1a2a, 0.2, 0.3, { emissive: new Color(0x1e6cff), emissiveIntensity: 0.6 }),
  };
}

/** White base with an orange/red flame graphic licking back from the front of the tank. */
function paintTankSide(): CanvasTexture {
  const w = 1024;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f4f4f2';
  ctx.fillRect(0, 0, w, h);

  // Black lower stripe (knee area)
  ctx.fillStyle = '#121213';
  ctx.fillRect(0, h * 0.82, w, h * 0.18);

  // Flames: layered tongues, outer red -> inner orange -> yellow core.
  const layers: { color: string; scale: number }[] = [
    { color: '#c8201a', scale: 1 },
    { color: '#ff5a1f', scale: 0.8 },
    { color: '#ffb428', scale: 0.55 },
  ];
  for (const layer of layers) {
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    const baseY = h * 0.78;
    ctx.moveTo(0, baseY);
    ctx.lineTo(0, h * 0.3 + (1 - layer.scale) * h * 0.25);
    const tongues = 6;
    for (let i = 0; i <= tongues; i++) {
      const t = i / tongues;
      const x = t * w * (0.62 + 0.3 * layer.scale);
      const tipY =
        baseY - h * (0.5 - t * 0.42) * layer.scale - Math.sin(t * 7.3) * h * 0.06 * layer.scale;
      const valleyY = baseY - h * (0.18 - t * 0.14) * layer.scale;
      const nx = ((i + 0.5) / tongues) * w * (0.62 + 0.3 * layer.scale);
      ctx.quadraticCurveTo(x - w * 0.02, tipY - h * 0.04, x, tipY);
      ctx.quadraticCurveTo(x + w * 0.03, valleyY, nx, valleyY);
    }
    ctx.lineTo(w * 0.95, baseY);
    ctx.closePath();
    ctx.fill();
  }
  // Pinstripe between flame base and stripe
  ctx.strokeStyle = '#ffb428';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.815);
  ctx.lineTo(w, h * 0.815);
  ctx.stroke();

  // Small wordmark
  ctx.fillStyle = '#121213';
  ctx.font = 'bold 44px "Helvetica Neue", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '6px';
  ctx.fillText('SCRAM 411', w * 0.62, h * 0.5);

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function paintTankTop(): CanvasTexture {
  const w = 512;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f4f4f2';
  ctx.fillRect(0, 0, w, h);
  // Central twin racing stripe
  ctx.fillStyle = '#121213';
  ctx.fillRect(w * 0.44, 0, w * 0.04, h);
  ctx.fillRect(w * 0.52, 0, w * 0.04, h);
  ctx.fillStyle = '#ff5a1f';
  ctx.fillRect(w * 0.485, 0, w * 0.03, h);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Optional licensed model
// ---------------------------------------------------------------------------------------------

/**
 * Load an external GLB and graft it into the bike hierarchy. Expected optional node names:
 * `FrontWheel`, `RearWheel`, `Steering` (fork + bars). Anything else is treated as body.
 * The model is auto-scaled so its wheelbase matches config.
 */
export async function loadExternalBike(url: string, bike: Bike): Promise<void> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const model = gltf.scene;
  model.traverse((o) => {
    if ((o as Mesh).isMesh) o.castShadow = true;
  });
  const front = model.getObjectByName('FrontWheel');
  const rear = model.getObjectByName('RearWheel');
  if (front && rear) {
    const fw = new Vector3();
    const rw = new Vector3();
    front.getWorldPosition(fw);
    rear.getWorldPosition(rw);
    const wb = fw.distanceTo(rw);
    if (wb > 0) model.scale.setScalar(BIKE.wheelbase / wb);
  }
  // Hide procedural parts, keep the hierarchy so animation code still works.
  bike.lean.children.forEach((c) => (c.visible = false));
  bike.lean.add(model);
  const steering = model.getObjectByName('Steering');
  if (steering) bike.steerPivot.attach(steering);
  if (front) bike.frontWheel.attach(front);
  if (rear) bike.rearWheel.attach(rear);
  bike.steerPivot.visible = true;
  bike.rearWheel.visible = true;
}
