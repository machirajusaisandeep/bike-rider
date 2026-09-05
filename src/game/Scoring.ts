import type { Surface } from './BikePhysics';

/**
 * Pure scoring model for a run. No DOM, no three.js, so it is unit-tested directly.
 *
 *   score = distance_m × surfaceMult
 *         + Σ nearMiss × (100 + 2 × speedKmh) × comboMult
 *         + seconds above SPEED_BONUS_KMH × 20
 *         + clean-corner bonuses
 *
 * A combo chains near misses inside COMBO_WINDOW_S. Braking or a hit resets it.
 */
export const SURFACE_MULT: Record<Surface, number> = {
  asphalt: 1,
  gravel: 1.3,
  off: 1.5,
  wet: 1.15,
};

export const COMBO_WINDOW_S = 4;
export const COMBO_MULT = [1, 1.5, 2, 3, 4] as const;
export const SPEED_BONUS_KMH = 100;
export const SPEED_BONUS_PER_S = 20;
export const CORNER_BONUS = 150;
const CORNER_MIN_YAW = 0.28; // rad/s
const CORNER_MIN_KMH = 50;
const CORNER_MIN_S = 0.8;

export type BonusKind = 'nearMiss' | 'corner' | 'speed';

export interface Bonus {
  kind: BonusKind;
  points: number;
  combo: number;
  label: string;
}

export function nearMissPoints(speedKmh: number, comboIndex: number): number {
  const mult = COMBO_MULT[Math.min(comboIndex, COMBO_MULT.length - 1)]!;
  return Math.round((100 + 2 * Math.max(0, speedKmh)) * mult);
}

export class Scoring {
  score = 0;
  distancePoints = 0;
  bonusPoints = 0;
  /** Current chain length; 0 = no combo. */
  combo = 0;
  bestCombo = 0;
  comboTimer = 0;
  nearMisses = 0;
  speedSeconds = 0;
  corners = 0;

  private cornering = false;
  private cornerTime = 0;
  private cornerBraked = false;

  reset(): void {
    this.score = 0;
    this.distancePoints = 0;
    this.bonusPoints = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboTimer = 0;
    this.nearMisses = 0;
    this.speedSeconds = 0;
    this.corners = 0;
    this.cornering = false;
    this.cornerTime = 0;
    this.cornerBraked = false;
  }

  /** Multiplier applied to the next near miss. */
  get comboMult(): number {
    return COMBO_MULT[Math.min(this.combo, COMBO_MULT.length - 1)]!;
  }

  /** 0..1 fraction of the combo window remaining. */
  get comboFraction(): number {
    return this.combo > 0 ? Math.max(0, this.comboTimer / COMBO_WINDOW_S) : 0;
  }

  /**
   * Per-fixed-step accrual. Returns a bonus when a clean corner or speed tick completes.
   */
  update(
    dt: number,
    distanceM: number,
    speedKmh: number,
    surface: Surface,
    braking: boolean,
    yawRate: number,
  ): Bonus | null {
    const d = Math.max(0, distanceM) * SURFACE_MULT[surface];
    this.distancePoints += d;
    this.score += d;

    let bonus: Bonus | null = null;

    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    if (braking && this.combo > 0) this.combo = 0;

    if (speedKmh >= SPEED_BONUS_KMH) {
      const before = Math.floor(this.speedSeconds);
      this.speedSeconds += dt;
      const ticks = Math.floor(this.speedSeconds) - before;
      if (ticks > 0) {
        const pts = ticks * SPEED_BONUS_PER_S;
        this.bonusPoints += pts;
        this.score += pts;
        // Speed ticks are frequent; surface them only every 5 s to avoid toast spam.
        if (Math.floor(this.speedSeconds) % 5 === 0)
          bonus = { kind: 'speed', points: pts * 5, combo: this.combo, label: 'Full send' };
      }
    }

    // Clean-corner detection.
    const turning = Math.abs(yawRate) > CORNER_MIN_YAW && speedKmh > CORNER_MIN_KMH;
    if (turning) {
      if (!this.cornering) {
        this.cornering = true;
        this.cornerTime = 0;
        this.cornerBraked = false;
      }
      this.cornerTime += dt;
      if (braking) this.cornerBraked = true;
    } else if (this.cornering) {
      this.cornering = false;
      if (!this.cornerBraked && this.cornerTime >= CORNER_MIN_S) {
        this.corners++;
        this.bonusPoints += CORNER_BONUS;
        this.score += CORNER_BONUS;
        bonus = { kind: 'corner', points: CORNER_BONUS, combo: this.combo, label: 'Clean corner' };
      }
    }
    return bonus;
  }

  nearMiss(speedKmh: number): Bonus {
    const pts = nearMissPoints(speedKmh, this.combo);
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.comboTimer = COMBO_WINDOW_S;
    this.nearMisses++;
    this.bonusPoints += pts;
    this.score += pts;
    return {
      kind: 'nearMiss',
      points: pts,
      combo: this.combo,
      label: this.combo > 1 ? `Near miss ×${this.combo}` : 'Near miss',
    };
  }

  hit(): void {
    this.combo = 0;
    this.comboTimer = 0;
    this.cornering = false;
  }

  get rounded(): number {
    return Math.round(this.score);
  }
}

/** Server-side style plausibility check reused by the leaderboard client. */
export function plausibleScore(score: number, distanceM: number, durationS: number): boolean {
  if (!Number.isFinite(score) || !Number.isFinite(distanceM) || !Number.isFinite(durationS))
    return false;
  if (score < 0 || distanceM < 0 || durationS < 0) return false;
  // Max speed is ~34 m/s; allow slack for slopes.
  if (distanceM > durationS * 40 + 50) return false;
  // Dense oncoming traffic with a maxed combo peaks around 8 points per metre; allow slack.
  return score <= distanceM * 12 + 1500;
}
