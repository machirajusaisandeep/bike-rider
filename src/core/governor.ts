import type { Quality } from './settings';

const RING = 40;
const PROMOTE_FRAMES = 90;
const DEMOTE_FRAMES = 45;
const HIGH_MS = 22;
const MED_MS = 28;

const RANK: Record<Quality, number> = { high: 2, medium: 1, low: 0 };

function median(xs: number[]): number {
  if (!xs.length) return 16;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function wantFromMs(ms: number): Quality {
  if (ms <= HIGH_MS) return 'high';
  if (ms <= MED_MS) return 'medium';
  return 'low';
}

/**
 * Closed-loop quality picker. Median of the last 40 frame times, with hysteresis so one GC
 * pause does not drop a tier and a brief fast stretch does not promote.
 */
export class Governor {
  private times: number[] = [];
  private pending: Quality | null = null;
  private pendingFrames = 0;
  current: Quality;

  constructor(initial: Quality = 'high') {
    this.current = initial;
  }

  reset(q: Quality): void {
    this.current = q;
    this.times = [];
    this.pending = null;
    this.pendingFrames = 0;
  }

  /** Feed a raw frame time in milliseconds. Returns a new tier when it commits, else null. */
  sample(frameMs: number): Quality | null {
    const ms = Math.max(1, Math.min(250, frameMs));
    this.times.push(ms);
    if (this.times.length > RING) this.times.shift();
    if (this.times.length < 12) return null;
    const target = wantFromMs(median(this.times));
    if (target === this.current) {
      this.pending = null;
      this.pendingFrames = 0;
      return null;
    }
    if (this.pending !== target) {
      this.pending = target;
      this.pendingFrames = 1;
      return null;
    }
    this.pendingFrames++;
    const need = RANK[target] < RANK[this.current] ? DEMOTE_FRAMES : PROMOTE_FRAMES;
    if (this.pendingFrames < need) return null;
    this.current = target;
    this.pending = null;
    this.pendingFrames = 0;
    return target;
  }
}

export const _test = { median, wantFromMs, RING, PROMOTE_FRAMES, DEMOTE_FRAMES };
