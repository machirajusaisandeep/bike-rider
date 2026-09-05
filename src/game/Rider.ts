import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { GEAR_BY_ID, type GearItem, type RiderConfig } from './gear';

/**
 * Low-poly rider seated on the bike, built from capsules. `apply()` rebuilds the figure for a
 * body type + gear loadout; gear is drawn as extra shells (helmet, jacket sleeves, armour cups,
 * gloves, knee guards, boots) so what you picked in the menu is what rides.
 *
 * Coordinates are bike-local: forward -Z, seat around y 0.8, bars at (±0.33, 1.07, -0.42).
 */
export class Rider {
  readonly root = new Group();
  private parts = new Group();
  private head = new Group();
  private leftHand = new Group();
  private rightHand = new Group();
  private materials: Material[] = [];
  private config: RiderConfig | null = null;

  constructor() {
    this.root.add(this.parts);
    this.root.name = 'rider';
  }

  apply(cfg: RiderConfig): void {
    this.config = cfg;
    this.parts.clear();
    this.materials.forEach((m) => m.dispose());
    this.materials = [];
    this.head = new Group();
    this.leftHand = new Group();
    this.rightHand = new Group();

    const female = cfg.body === 'female';
    const S = female ? 0.95 : 1; // overall stature
    const shoulderW = female ? 0.36 : 0.43;
    const hipW = female ? 0.34 : 0.32;

    const helmet = pick(cfg.gear.helmet);
    const jacket = pick(cfg.gear.jacket);
    const gloves = pick(cfg.gear.gloves);
    const elbow = pick(cfg.gear.elbow);
    const knee = pick(cfg.gear.knee);
    const boots = pick(cfg.gear.boots);

    const skin = this.mat(female ? 0xc8916a : 0x9a6a48, 0.75);
    const hairMat = this.mat(0x1d1410, 0.85);
    const denim = this.mat(0x2b3a5a, 0.95);
    const shirt = this.mat(female ? 0xd8dfe8 : 0xe8e3d6, 0.9);
    const sleeveMat = jacket ? this.mat(jacket.color, jacket.style === 'mesh' ? 0.95 : 0.7) : skin;
    const torsoMat = jacket ? this.mat(jacket.color, jacket.style === 'mesh' ? 0.95 : 0.7) : shirt;
    const accentMat = jacket ? this.mat(jacket.accent ?? '#8a8f99', 0.6) : shirt;

    // --- key joints -----------------------------------------------------------------------
    const pelvis = new Vector3(0, 0.9 * S + 0.02, 0.42);
    const shoulder = new Vector3(0, 1.42 * S, 0.2);
    const headC = new Vector3(0, 1.62 * S, 0.12);
    const hip = (s: number) => new Vector3(s * hipW * 0.45, 0.87 * S, 0.4);
    const kneeP = (s: number) => new Vector3(s * 0.2, 0.74, -0.02);
    const ankle = (s: number) => new Vector3(s * 0.24, 0.4, 0.14);
    const shoulderP = (s: number) => new Vector3(s * shoulderW * 0.5, 1.4 * S, 0.22);
    const elbowP = (s: number) => new Vector3(s * 0.31, 1.2 * S, -0.06);
    const handP = (s: number) => new Vector3(s * 0.33, 1.08, -0.4);

    // --- torso + pelvis -------------------------------------------------------------------
    this.parts.add(capsule(pelvis, shoulder, female ? 0.13 : 0.15, torsoMat, 0.9, 1.15));
    const hips = new Mesh(new SphereGeometry(hipW * 0.5, 12, 8), denim);
    hips.scale.set(1, 0.7, 0.85);
    hips.position.copy(pelvis).add(new Vector3(0, -0.02, 0.02));
    this.parts.add(hips);
    if (jacket) {
      // collar + front zip / chest panel
      const collar = new Mesh(new CylinderGeometry(0.1, 0.12, 0.06, 12, 1, true), accentMat);
      collar.position.copy(shoulder).add(new Vector3(0, 0.05, -0.02));
      this.parts.add(collar);
      const panel = new Mesh(new BoxGeometry(0.16, 0.34, 0.03), accentMat);
      panel.position
        .copy(pelvis)
        .lerp(shoulder, 0.55)
        .add(new Vector3(0, 0, -0.15));
      panel.rotation.x = -0.25;
      this.parts.add(panel);
      if (jacket.style !== 'mesh') {
        // shoulder cups
        for (const s of [-1, 1]) {
          const cup = new Mesh(new SphereGeometry(0.075, 10, 8), accentMat);
          cup.position.copy(shoulderP(s)).add(new Vector3(s * 0.01, 0.03, 0));
          cup.scale.set(1.1, 0.7, 1);
          this.parts.add(cup);
        }
      }
      if (jacket.style === 'adventure') {
        // back protector hump
        const back = new Mesh(new BoxGeometry(0.22, 0.3, 0.06), accentMat);
        back.position
          .copy(pelvis)
          .lerp(shoulder, 0.6)
          .add(new Vector3(0, 0, 0.16));
        back.rotation.x = -0.25;
        this.parts.add(back);
      }
    } else if (female) {
      // ponytail visible without helmet, and also under an open-face lid
    }

    // --- head + hair + helmet -------------------------------------------------------------
    this.head.position.copy(headC);
    this.parts.add(this.head);
    const skull = new Mesh(new SphereGeometry(0.105, 16, 12), skin);
    skull.scale.set(0.92, 1.05, 1);
    this.head.add(skull);
    const neck = capsule(
      shoulder.clone().add(new Vector3(0, 0.02, 0)),
      headC.clone().add(new Vector3(0, -0.06, 0)),
      0.05,
      skin,
    );
    this.parts.add(neck);
    const hairVisible = !helmet || helmet.style === 'open';
    if (hairVisible) {
      const hair = new Mesh(
        new SphereGeometry(0.11, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        hairMat,
      );
      hair.position.y = 0.015;
      hair.scale.set(0.95, 1, 1.02);
      this.head.add(hair);
      if (female) {
        const tail = capsule(new Vector3(0, 0.0, 0.1), new Vector3(0, -0.22, 0.2), 0.035, hairMat);
        this.head.add(tail);
      }
    }
    if (helmet) {
      const shell = this.mat(helmet.color, 0.35, 0.1);
      const accent = this.mat(helmet.accent ?? '#1a1b1e', 0.3);
      if (helmet.style === 'full') {
        const h = new Mesh(new SphereGeometry(0.15, 20, 14), shell);
        h.scale.set(0.95, 1.05, 1.08);
        h.position.y = 0.01;
        this.head.add(h);
        const chin = new Mesh(new BoxGeometry(0.2, 0.09, 0.12), shell);
        chin.position.set(0, -0.08, -0.1);
        this.head.add(chin);
        const visor = new Mesh(
          new SphereGeometry(
            0.152,
            20,
            10,
            Math.PI * 1.2,
            Math.PI * 0.6,
            Math.PI * 0.32,
            Math.PI * 0.22,
          ),
          this.mat(0x111318, 0.15, 0.3),
        );
        visor.position.y = 0.01;
        visor.scale.set(0.97, 1.05, 1.1);
        this.head.add(visor);
        const stripe = new Mesh(new BoxGeometry(0.03, 0.16, 0.2), accent);
        stripe.position.set(0, 0.1, 0.02);
        this.head.add(stripe);
      } else {
        // open face: shell with the front-lower quarter removed, plus a peak
        const h = new Mesh(
          new SphereGeometry(0.148, 20, 14, Math.PI * 0.5, Math.PI * 2, 0, Math.PI * 0.62),
          shell,
        );
        h.scale.set(0.95, 1.05, 1.05);
        h.position.y = 0.015;
        this.head.add(h);
        const back = new Mesh(
          new SphereGeometry(
            0.148,
            20,
            14,
            Math.PI * 1.05,
            Math.PI * 0.9,
            Math.PI * 0.6,
            Math.PI * 0.28,
          ),
          shell,
        );
        back.scale.copy(h.scale);
        back.position.y = 0.015;
        this.head.add(back);
        const peak = new Mesh(new BoxGeometry(0.22, 0.015, 0.1), accent);
        peak.position.set(0, 0.06, -0.16);
        peak.rotation.x = 0.35;
        this.head.add(peak);
        const stripe = new Mesh(new BoxGeometry(0.03, 0.02, 0.24), accent);
        stripe.position.set(0, 0.16, 0.0);
        this.head.add(stripe);
        // goggles / glasses
        const glasses = new Mesh(new BoxGeometry(0.16, 0.035, 0.03), this.mat(0x111318, 0.2, 0.4));
        glasses.position.set(0, 0.02, -0.1);
        this.head.add(glasses);
      }
    }

    // --- arms -------------------------------------------------------------------------------
    for (const s of [-1, 1] as const) {
      const sh = shoulderP(s);
      const el = elbowP(s);
      const hd = handP(s);
      this.parts.add(capsule(sh, el, 0.055, sleeveMat));
      this.parts.add(capsule(el, hd, 0.047, sleeveMat));
      if (elbow || (jacket && jacket.style !== 'mesh')) {
        const cupMat = elbow ? this.mat(elbow.color, 0.5) : accentMat;
        const cup = new Mesh(new SphereGeometry(0.068, 10, 8), cupMat);
        cup.position.copy(el).add(new Vector3(s * 0.02, 0.01, -0.01));
        cup.scale.set(0.9, 1.1, 1);
        this.parts.add(cup);
      }
      const hand = s < 0 ? this.leftHand : this.rightHand;
      hand.position.copy(hd);
      this.parts.add(hand);
      const handMat = gloves ? this.mat(gloves.color, 0.7) : skin;
      const palm = new Mesh(new SphereGeometry(0.045, 10, 8), handMat);
      palm.scale.set(1, 0.8, 1.2);
      hand.add(palm);
      if (gloves) {
        const knuckle = new Mesh(
          new BoxGeometry(0.05, 0.02, 0.05),
          this.mat(gloves.accent ?? gloves.color, 0.4),
        );
        knuckle.position.set(0, 0.035, -0.01);
        hand.add(knuckle);
        if (gloves.style === 'gauntlet') {
          const cuff = capsule(
            hd.clone().sub(hand.position),
            el.clone().lerp(hd, 0.75).sub(hand.position),
            0.055,
            handMat,
          );
          hand.add(cuff);
        }
      }
    }

    // --- legs -------------------------------------------------------------------------------
    for (const s of [-1, 1] as const) {
      const hp = hip(s);
      const kn = kneeP(s);
      const an = ankle(s);
      this.parts.add(capsule(hp, kn, 0.085, denim));
      this.parts.add(capsule(kn, an, 0.062, denim));
      if (knee) {
        const kMat = this.mat(knee.color, knee.style === 'shell' ? 0.35 : 0.9);
        const pad = new Mesh(new SphereGeometry(0.095, 12, 8), kMat);
        pad.position.copy(kn).add(new Vector3(s * 0.005, 0.0, -0.03));
        pad.scale.set(0.95, knee.style === 'shell' ? 1.25 : 1.0, 1);
        this.parts.add(pad);
        if (knee.style === 'shell') {
          const shin = capsule(
            kn.clone().add(new Vector3(0, -0.06, -0.05)),
            an.clone().add(new Vector3(0, 0.05, -0.05)),
            0.055,
            kMat,
          );
          this.parts.add(shin);
          const strap = new Mesh(
            new BoxGeometry(0.02, 0.05, 0.19),
            this.mat(knee.accent ?? '#ff5a1f', 0.5),
          );
          strap.position.copy(kn).add(new Vector3(s * 0.09, 0.0, -0.02));
          this.parts.add(strap);
        }
      }
      // footwear
      const footMat = this.mat(boots?.color ?? '#3a3a3a', 0.8);
      const foot = new Mesh(new BoxGeometry(0.1, 0.075, 0.26), footMat);
      foot.position.copy(an).add(new Vector3(0, -0.05, -0.06));
      this.parts.add(foot);
      if (boots) {
        const height = boots.style === 'tall' ? 0.36 : boots.style === 'ankle' ? 0.16 : 0.08;
        const shaft = new Mesh(new CylinderGeometry(0.068, 0.075, height, 12), footMat);
        shaft.position.copy(an).add(new Vector3(0, height / 2 - 0.04, 0));
        this.parts.add(shaft);
        if (boots.accent) {
          const trim = new Mesh(new BoxGeometry(0.104, 0.02, 0.27), this.mat(boots.accent, 0.5));
          trim.position.copy(foot.position).add(new Vector3(0, -0.03, 0));
          this.parts.add(trim);
        }
      }
    }

    this.parts.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
    });
  }

  /** Subtle life: head follows steering, hands stay on the bars. */
  update(steerAngle: number, dt: number): void {
    const target = -steerAngle * 0.6;
    this.head.rotation.y += (target - this.head.rotation.y) * Math.min(1, 6 * dt);
  }

  get current(): RiderConfig | null {
    return this.config;
  }

  private mat(color: number | string, roughness: number, metalness = 0): MeshStandardMaterial {
    const m = new MeshStandardMaterial({ color: new Color(color), roughness, metalness });
    this.materials.push(m);
    return m;
  }
}

function pick(id: string | null): GearItem | null {
  return id ? (GEAR_BY_ID[id] ?? null) : null;
}

const _y = new Vector3(0, 1, 0);

/** Capsule between two points: cylinder plus end spheres; optional radius taper. */
function capsule(a: Vector3, b: Vector3, r: number, mat: Material, ra = 1, rb = 1): Group {
  const g = new Group();
  const len = a.distanceTo(b);
  const cyl = new Mesh(new CylinderGeometry(r * rb, r * ra, len, 12, 1), mat);
  cyl.position.copy(a).lerp(b, 0.5);
  cyl.quaternion.setFromUnitVectors(_y, b.clone().sub(a).normalize());
  g.add(cyl);
  const sa = new Mesh(new SphereGeometry(r * ra, 12, 8), mat);
  sa.position.copy(a);
  const sb = new Mesh(new SphereGeometry(r * rb, 12, 8), mat);
  sb.position.copy(b);
  g.add(sa, sb);
  return g;
}
