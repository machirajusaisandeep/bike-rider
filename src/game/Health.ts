import { HEALTH } from '../core/config';

export interface HitResult {
  /** 0..1 fraction of full health removed. */
  damage: number;
  /** Run-ending crash. */
  fatal: boolean;
  /** Impact strong enough to slide, but survivable. */
  heavy: boolean;
  /** Below the harmless threshold: just a wobble. */
  wobble: boolean;
  hpAfter: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Damage from an impact at `relativeKmh` for a rider with `protection` (0..100).
 * Full gear removes HEALTH.gearMitigation of the damage. Pure function so it is testable and
 * the summary screen can explain the crash.
 */
export function damageFor(relativeKmh: number, protection: number): number {
  const t = clamp(
    (Math.abs(relativeKmh) - HEALTH.harmlessKmh) / (HEALTH.fatalKmh - HEALTH.harmlessKmh),
    0,
    1.5,
  );
  const raw = t * t * 0.6 + t * 0.4; // gentle at low speed, steep at high speed
  const mitigation = (HEALTH.gearMitigation * clamp(protection, 0, 100)) / 100;
  return clamp(raw * (1 - mitigation), 0, 1.5);
}

/**
 * Rider health for one run. Health is 0..1; the protection score only changes how much each
 * impact takes off, which is what makes the gear screen a real choice.
 */
export class Health {
  hp = 1;
  private grace = 0;
  hits = 0;

  reset(): void {
    this.hp = 1;
    this.grace = 0;
    this.hits = 0;
  }

  tick(dt: number): void {
    if (this.grace > 0) this.grace -= dt;
  }

  get invulnerable(): boolean {
    return this.grace > 0;
  }

  /** Returns null while in the post-hit grace window. */
  hit(relativeKmh: number, protection: number): HitResult | null {
    if (this.grace > 0) return null;
    const damage = damageFor(relativeKmh, protection);
    const wobble = Math.abs(relativeKmh) < HEALTH.harmlessKmh;
    if (!wobble) {
      this.hits++;
      this.hp = clamp(this.hp - damage, 0, 1);
      this.grace = HEALTH.graceS;
    }
    const fatal = !wobble && (damage >= HEALTH.fatalDamage || this.hp <= 0.0001);
    return { damage, fatal, heavy: !wobble && damage >= 0.15, wobble, hpAfter: this.hp };
  }
}
