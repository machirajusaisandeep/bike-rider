import type { SceneId } from '../world/scenes';
import type { Seed } from '../core/seed';

/**
 * Game modes.
 *  - free:  the original sandbox. No traffic, no score, no failure.
 *  - ride:  the scored run. Traffic, hazards, health; ends on a fatal crash.
 *  - daily: a ride on the daily seed and scene, one shared board.
 *  - mission: a ride with an objective attached (see missions.ts).
 */
export type GameMode = 'free' | 'ride' | 'daily' | 'mission';

export type RunPhase = 'idle' | 'countdown' | 'riding' | 'crashed' | 'summary';

export interface RunConfig {
  mode: GameMode;
  scene: SceneId;
  seed: Seed;
  missionId?: string;
}

export interface RunStats {
  distanceM: number;
  durationS: number;
  topKmh: number;
  nearMisses: number;
  bestCombo: number;
  crashes: number;
  cause: 'crash' | 'lost' | 'quit' | null;
}

export const COUNTDOWN_S = 2.4;

/**
 * Tiny explicit state machine that owns "what kind of play is happening". `Game` reads
 * `phase` to decide whether input drives the bike, whether traffic spawns, whether the HUD shows
 * the score, and so on. Keeping it separate from Game keeps the frame loop readable.
 */
export class Run {
  phase: RunPhase = 'idle';
  config: RunConfig;
  stats: RunStats = freshStats();
  /** Seconds left in the countdown. */
  countdown = 0;
  /** Seconds since the crash, for the slow-mo / cut to summary. */
  sinceCrash = 0;
  onPhase: ((phase: RunPhase) => void) | null = null;

  constructor(config: RunConfig) {
    this.config = config;
  }

  get scored(): boolean {
    return this.config.mode !== 'free';
  }

  get active(): boolean {
    return this.phase === 'riding';
  }

  /** Bike may be controlled by the player. */
  get controllable(): boolean {
    return this.phase === 'riding' || (this.phase === 'idle' && this.config.mode === 'free');
  }

  start(config?: Partial<RunConfig>): void {
    if (config) this.config = { ...this.config, ...config };
    this.stats = freshStats();
    this.sinceCrash = 0;
    if (this.scored) {
      this.countdown = COUNTDOWN_S;
      this.set('countdown');
    } else {
      this.set('idle');
    }
  }

  /** Advance timers; call once per frame with the (unpaused) delta. */
  tick(dt: number): void {
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.set('riding');
      }
    } else if (this.phase === 'riding') {
      this.stats.durationS += dt;
    } else if (this.phase === 'crashed') {
      this.sinceCrash += dt;
    }
  }

  crash(cause: RunStats['cause'] = 'crash'): void {
    if (this.phase !== 'riding') return;
    this.stats.cause = cause;
    this.sinceCrash = 0;
    this.set('crashed');
  }

  finish(): void {
    if (this.phase === 'summary') return;
    if (this.phase === 'riding') this.stats.cause = 'quit';
    this.set('summary');
  }

  /** Back to the sandbox: stop scoring, keep riding. */
  toFree(): void {
    this.config = { ...this.config, mode: 'free' };
    this.set('idle');
  }

  private set(p: RunPhase): void {
    if (p === this.phase) return;
    this.phase = p;
    this.onPhase?.(p);
  }
}

export function freshStats(): RunStats {
  return {
    distanceM: 0,
    durationS: 0,
    topKmh: 0,
    nearMisses: 0,
    bestCombo: 0,
    crashes: 0,
    cause: null,
  };
}

export const MODE_LABEL: Record<GameMode, string> = {
  free: 'Free ride',
  ride: 'Ride',
  daily: 'Daily challenge',
  mission: 'Mission',
};
