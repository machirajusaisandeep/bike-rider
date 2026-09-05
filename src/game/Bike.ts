import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
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
  Texture,
  TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BIKE } from '../core/config';
import type { BikeDef, BikeEngine, BikeFamily } from './bikes';

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
  /** Inverse-tilted frame under steerPivot: children are placed in upright bike coordinates. */
  readonly steerLocal = new Group();
  /** Non-steering procedural body parts. */
  readonly body = new Group();
  /** True once a licensed/external GLB replaced the procedural meshes. */
  external = false;
  private headlightMat: MeshStandardMaterial;
  private mats!: Materials;
  private baseSteerQuat = new Quaternion();
  private tailMat: MeshStandardMaterial;
  private frontRadius = BIKE.frontWheelRadius as number;
  private rearRadius = BIKE.rearWheelRadius as number;
  /** Family-specific add-ons parented to the body (cleared on family change). */
  private extras = new Group();
  /** Family-specific add-ons on the steering assembly. */
  private steerExtras = new Group();

  constructor() {
    this.root.add(this.lean);
    this.lean.add(this.steerPivot, this.rearWheel);

    const M = createMaterials();
    this.mats = M;
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
    const steerLocal = this.steerLocal;
    // Undo the tilt for children so we can place parts in world-ish local coords.
    steerLocal.quaternion.copy(this.steerPivot.quaternion).invert();
    this.steerPivot.add(steerLocal);
    steerLocal.add(this.steerExtras);

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
    const body = this.body;
    this.lean.add(body);
    body.add(this.extras);

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
    tank.name = 'tank';
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
    this.frontWheel.rotation.x -= distance / this.frontRadius;
    this.rearWheel.rotation.x -= distance / this.rearRadius;
  }

  /**
   * Apply a catalog bike's look: wheel scale, paint, tank wordmark and family extras.
   * Drops any grafted RE GLB so every bike is visually distinct in the garage.
   */
  setLook(def: BikeDef): void {
    this.unloadExternal();
    this.frontRadius = def.chassis.frontWheelRadius;
    this.rearRadius = def.chassis.rearWheelRadius;
    this.frontWheel.scale.setScalar(def.chassis.frontWheelRadius / BIKE.frontWheelRadius);
    this.rearWheel.scale.setScalar(def.chassis.rearWheelRadius / BIKE.rearWheelRadius);
    this.setPaint(def.paint, def.accent);
    this.setTankLabel(def.name);
    this.setFamily(def.family, def.chassis.engine);
  }

  /** Restore the procedural bike after `loadExternalBike` grafted a GLB. */
  unloadExternal(): void {
    if (!this.external) return;
    const grafted: Object3D[] = [];
    this.lean.children.forEach((c) => {
      if (c !== this.steerPivot && c !== this.rearWheel && c !== this.body) grafted.push(c);
    });
    for (const c of grafted) this.lean.remove(c);
    this.body.traverse((o) => {
      if ((o as Mesh).isMesh) o.visible = true;
    });
    this.steerLocal.traverse((o) => {
      if ((o as Mesh).isMesh) o.visible = true;
    });
    if (this.frontWheel.children.length === 0)
      this.frontWheel.add(buildWheel(BIKE.frontWheelRadius, 0.1, this.mats));
    if (this.rearWheel.children.length === 0)
      this.rearWheel.add(buildWheel(BIKE.rearWheelRadius, 0.125, this.mats));
    this.external = false;
  }

  /**
   * Repaint the procedural bike (garage bikes). Tank textures keep their flame graphic and are
   * tinted by the paint colour; the external RE model is left untouched.
   */
  setPaint(paint: string, accent: string): void {
    if (this.external) return;
    const M = this.mats;
    M.whitePaint.color.set(paint);
    M.tankSide.color.set(paint);
    M.tankTop.color.set(paint);
    M.flameAccent.color.set(accent);
  }

  private setTankLabel(name: string): void {
    const side = paintTankSide(name);
    const top = paintTankTop();
    this.mats.tankSide.map?.dispose();
    this.mats.tankTop.map?.dispose();
    this.mats.tankSide.map = side;
    this.mats.tankTop.map = top;
    this.mats.tankSide.needsUpdate = true;
    this.mats.tankTop.needsUpdate = true;
  }

  private setFamily(family: BikeFamily, engine: BikeEngine): void {
    this.extras.clear();
    this.steerExtras.clear();
    const M = this.mats;
    const tank = this.body.getObjectByName('tank');
    if (tank) {
      if (family === 'heritage') tank.scale.set(1.08, 1.18, 0.82);
      else if (family === 'cruiser') tank.scale.set(1.18, 0.88, 1.15);
      else if (family === 'cafe') tank.scale.set(0.88, 0.82, 1.18);
      else if (family === 'adventure') tank.scale.set(1.2, 1.08, 1.05);
      else if (family === 'roadster') tank.scale.set(0.92, 0.92, 0.95);
      else tank.scale.set(1, 1, 1);
    }

    if (family === 'adventure') {
      const beak = new Mesh(new BoxGeometry(0.26, 0.07, 0.32), M.blackMatte);
      beak.position.set(0, 0.04, -0.34);
      beak.rotation.x = 0.35;
      this.steerExtras.add(beak);
      const screen = new Mesh(new BoxGeometry(0.28, 0.16, 0.02), M.blackGloss);
      screen.position.set(0, 0.22, -0.22);
      screen.rotation.x = -0.35;
      this.steerExtras.add(screen);
      for (const side of [-1, 1]) {
        const bar = new Mesh(new CylinderGeometry(0.012, 0.012, 0.42, 8), M.blackMatte);
        bar.position.set(side * 0.22, 0.42, 0.08);
        bar.rotation.x = 0.4;
        this.extras.add(bar);
      }
    }

    if (family === 'heritage') {
      const shockTop = new Vector3(-0.08, 0.72, 0.5);
      const shockBottom = new Vector3(-0.08, 0.42, 0.62);
      this.extras.add(tube(shockTop, shockBottom, 0.016, M.aluminium));
      const spring = new Mesh(new CylinderGeometry(0.032, 0.032, 0.22, 12, 1, true), M.spring);
      spring.position.copy(shockTop).lerp(shockBottom, 0.5);
      this.extras.add(spring);
      const shockTopR = new Vector3(0.08, 0.72, 0.5);
      const shockBottomR = new Vector3(0.08, 0.42, 0.62);
      this.extras.add(tube(shockTopR, shockBottomR, 0.016, M.aluminium));
    }

    if (family === 'cruiser') {
      const fender = new Mesh(new BoxGeometry(0.34, 0.06, 0.5), M.whitePaint);
      fender.position.set(0, 0.62, 0.72);
      this.extras.add(fender);
    }

    if (family === 'cafe') {
      for (const side of [-1, 1]) {
        const clip = new Mesh(new CylinderGeometry(0.012, 0.012, 0.18, 8), M.blackGloss);
        clip.position.set(side * 0.22, 0.12, -0.04);
        clip.rotation.z = side * 0.7;
        clip.rotation.x = 0.5;
        this.steerExtras.add(clip);
      }
    }

    if (engine === 'twin' || family === 'cafe') {
      const muffler = new Mesh(new CylinderGeometry(0.042, 0.05, 0.5, 16), M.blackGloss);
      muffler.position.set(-0.225, 0.52, 0.7);
      muffler.rotation.x = Math.PI / 2 - 0.28;
      this.extras.add(muffler);
      const tip = new Mesh(new CylinderGeometry(0.046, 0.038, 0.05, 16), M.steel);
      tip.position.set(-0.225, 0.6, 0.94);
      tip.rotation.x = Math.PI / 2 - 0.28;
      this.extras.add(tip);
    }

    this.extras.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
    });
    this.steerExtras.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
    });
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
  const sideTex = paintTankSide('SCRAM 440');
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
function paintTankSide(label = 'SCRAM 440'): CanvasTexture {
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
  ctx.fillText(label.toUpperCase().slice(0, 14), w * 0.58, h * 0.5);

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
// External model (e.g. Royal Enfield's own Scram 411 GLB fetched locally via `npm run fetch-model`)
// ---------------------------------------------------------------------------------------------

export interface ExternalBikeOptions {
  /** Directory containing the Draco decoder (draco_wasm_wrapper.js + draco_decoder.wasm). */
  dracoPath: string;
  /** Recolour the tank texture from Graphite Red to the White Flame scheme. */
  whiteFlame?: boolean;
  onProgress?: (fraction: number) => void;
}

const _box = new Box3();
const _v = new Vector3();

/**
 * Load a GLB and graft it into the bike hierarchy so steering, wheel spin and lean keep working.
 *
 * Assumptions (true for the Royal Enfield quick-start model, checked in the scratch analysis):
 *   - front of the bike points to -X, up is +Y, width is Z; units are millimetres
 *   - both wheels may share single meshes named like "wheels" / "*rim*": these are split by
 *     triangle centroid into front and rear halves so each can spin about its own axle
 * Nothing else about the node layout is assumed: fork, bars, headlight and mirrors are picked
 * by their position relative to the front axle, not by name.
 */
export async function loadExternalBike(
  url: string,
  bike: Bike,
  opts: ExternalBikeOptions,
): Promise<void> {
  const draco = new DRACOLoader();
  draco.setDecoderPath(opts.dracoPath);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync(url, (e) => {
    if (opts.onProgress && e.total) opts.onProgress(e.loaded / e.total);
  });
  draco.dispose();
  const model = gltf.scene;

  // --- normalise orientation + units --------------------------------------------------------
  const container = new Group();
  container.rotation.y = -Math.PI / 2; // model -X (front) -> our -Z
  container.add(model);
  container.updateMatrixWorld(true);
  _box.setFromObject(container);
  const size = _box.getSize(_v.clone());
  const length = Math.max(size.x, size.z);
  // Real bike is ~2.16 m long plus mirrors; use the wheelbase later for the exact fit.
  const s0 = 2.25 / length;
  container.scale.setScalar(s0);
  container.updateMatrixWorld(true);

  // --- collect meshes and split shared wheel meshes -----------------------------------------
  const meshes: Mesh[] = [];
  model.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });
  const wheelParts: Mesh[] = [];
  for (const m of meshes) {
    m.castShadow = true;
    m.receiveShadow = false;
    m.frustumCulled = false;
    if (!/wheel|rim|tyre|tire|spoke/i.test(m.name)) continue;
    _box.setFromObject(m);
    const span = _box.max.z - _box.min.z;
    if (span > 1.2) {
      // spans both axles -> split at the midpoint
      const midZ = (_box.min.z + _box.max.z) / 2;
      const [front, rear] = splitMeshAlongWorldZ(m, midZ);
      m.parent!.add(front, rear);
      m.parent!.remove(m);
      wheelParts.push(front, rear);
    } else {
      wheelParts.push(m);
    }
  }
  container.updateMatrixWorld(true);

  // --- find the axles ----------------------------------------------------------------------
  const frontBox = new Box3();
  const rearBox = new Box3();
  _box.setFromObject(container);
  const centreZ = (_box.min.z + _box.max.z) / 2;
  const frontWheelMeshes: Mesh[] = [];
  const rearWheelMeshes: Mesh[] = [];
  for (const m of wheelParts) {
    const b = new Box3().setFromObject(m);
    const c = b.getCenter(new Vector3());
    if (c.z < centreZ) {
      frontBox.union(b);
      frontWheelMeshes.push(m);
    } else {
      rearBox.union(b);
      rearWheelMeshes.push(m);
    }
  }
  const F = frontBox.getCenter(new Vector3());
  const R = rearBox.getCenter(new Vector3());
  const wheelbase = R.z - F.z;
  console.info(
    `[bike] external model: length ${length.toFixed(2)} wheelbase ${wheelbase.toFixed(3)} (x${s0.toFixed(3)})`,
  );
  // Rescale so the wheelbase matches the physics config exactly, then re-measure.
  const s1 = (s0 * BIKE.wheelbase) / wheelbase;
  container.scale.setScalar(s1);
  container.updateMatrixWorld(true);
  frontBox.makeEmpty();
  rearBox.makeEmpty();
  for (const m of frontWheelMeshes) frontBox.union(new Box3().setFromObject(m));
  for (const m of rearWheelMeshes) rearBox.union(new Box3().setFromObject(m));
  frontBox.getCenter(F);
  rearBox.getCenter(R);
  const groundY = Math.min(frontBox.min.y, rearBox.min.y);
  // Put the axle midpoint on the origin and the tyres on the ground.
  container.position.set(-(F.x + R.x) / 2, -groundY, -(F.z + R.z) / 2);
  container.updateMatrixWorld(true);
  F.add(container.position);
  R.add(container.position);

  // --- hide the procedural bike, keep lights -------------------------------------------------
  bike.body.traverse((o) => {
    if ((o as Mesh).isMesh) o.visible = false;
  });
  bike.steerLocal.traverse((o) => {
    if ((o as Mesh).isMesh) o.visible = false;
  });
  bike.frontWheel.clear();
  bike.rearWheel.clear();

  // --- rig: pivots at the axles, fork assembly under the steering pivot ----------------------
  // Everything below uses world-space boxes, so rig with the bike at the origin, upright,
  // wheels straight. The game re-syncs root / lean / steer from physics right after.
  bike.root.position.set(0, 0, 0);
  bike.root.quaternion.identity();
  bike.lean.rotation.set(0, 0, 0);
  bike.setSteer(0);
  bike.frontWheel.rotation.set(0, 0, 0);
  bike.rearWheel.rotation.set(0, 0, 0);
  bike.lean.add(container);
  bike.root.updateMatrixWorld(true);
  // Steering head: a point on the fork axis above the front axle.
  bike.steerPivot.position.set(0, F.y + 0.6, F.z + 0.3);
  bike.root.updateMatrixWorld(true);
  bike.frontWheel.position.copy(bike.steerLocal.worldToLocal(F.clone()));
  bike.rearWheel.position.copy(R);
  bike.root.updateMatrixWorld(true);
  for (const m of frontWheelMeshes) bike.frontWheel.attach(m);
  for (const m of rearWheelMeshes) bike.rearWheel.attach(m);

  const headZ = F.z + 0.32; // behind this we are in tank / frame territory
  const barY = F.y + 0.7;
  const remaining: Mesh[] = [];
  model.traverse((o) => {
    if ((o as Mesh).isMesh) remaining.push(o as Mesh);
  });
  for (const m of remaining) {
    const b = new Box3().setFromObject(m);
    const c = b.getCenter(new Vector3());
    const isFork = c.z < headZ && c.y < barY;
    const isBars = c.y >= barY && c.z < F.z + 0.58;
    if (isFork || isBars) bike.steerLocal.attach(m);
  }
  // Headlight beam origin roughly at the lamp.
  bike.headlight.position.set(0, F.y + 0.6, F.z + 0.05);

  // --- materials --------------------------------------------------------------------------
  if (opts.whiteFlame) {
    const done = new Set<Texture>();
    for (const m of remaining) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const std = mat as MeshStandardMaterial;
        if (!std.map || !/tank/i.test(std.name) || done.has(std.map)) continue;
        std.map = swapRedAndWhite(std.map);
        done.add(std.map);
        std.needsUpdate = true;
      }
    }
  }
  bike.external = true;
}

/** Split a mesh into two meshes by triangle centroid on world Z (front < midZ). */
function splitMeshAlongWorldZ(mesh: Mesh, midZ: number): [Mesh, Mesh] {
  const geo = mesh.geometry;
  const pos = geo.attributes.position as BufferAttribute;
  const index = geo.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  const frontIdx: number[] = [];
  const rearIdx: number[] = [];
  mesh.updateMatrixWorld(true);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);
    const z = (a.z + b.z + c.z) / 3;
    (z < midZ ? frontIdx : rearIdx).push(i0, i1, i2);
  }
  const make = (idx: number[], suffix: string) => {
    const shared = new BufferGeometry();
    for (const name of Object.keys(geo.attributes))
      shared.setAttribute(name, geo.attributes[name]!);
    shared.setIndex(idx);
    // Compact into own vertex buffers so bounding boxes describe this half only.
    const g = shared.toNonIndexed();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    const m = new Mesh(g, mesh.material);
    m.name = `${mesh.name}_${suffix}`;
    m.castShadow = true;
    m.frustumCulled = false;
    m.position.copy(mesh.position);
    m.quaternion.copy(mesh.quaternion);
    m.scale.copy(mesh.scale);
    return m;
  };
  return [make(frontIdx, 'front'), make(rearIdx, 'rear')];
}

/** Graphite Red -> White Flame: red areas become white, white areas become flame red. */
function swapRedAndWhite(src: Texture): Texture {
  const img = src.image as HTMLImageElement | ImageBitmap | HTMLCanvasElement;
  const w = img.width;
  const h = img.height;
  if (!w || !h) return src;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]!;
    const g = px[i + 1]!;
    const b = px[i + 2]!;
    if (r - Math.max(g, b) > 60) {
      // red -> warm white
      px[i] = 236;
      px[i + 1] = 234;
      px[i + 2] = 230;
    } else if (r > 150 && g > 150 && b > 150) {
      // white -> White Flame red (a deep, slightly cool red on the real bike)
      px[i] = 168;
      px[i + 1] = 26;
      px[i + 2] = 34;
    }
  }
  ctx.putImageData(data, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.flipY = src.flipY;
  tex.wrapS = src.wrapS;
  tex.wrapT = src.wrapT;
  tex.repeat.copy(src.repeat);
  tex.offset.copy(src.offset);
  tex.rotation = src.rotation;
  tex.center.copy(src.center);
  tex.colorSpace = src.colorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}
