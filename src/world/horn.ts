/** Pure horn-reaction policy. No three.js — unit-tested. */

export type HornReaction = 'scare' | 'flinch' | 'brake' | 'blink' | 'none';

export function hornReaction(kind: string): HornReaction {
  if (kind === 'cow' || kind === 'goat') return 'scare';
  if (kind === 'auto' || kind === 'scooter' || kind === 'bike') return 'flinch';
  if (kind === 'hatch' || kind === 'suv' || kind === 'tempo') return 'brake';
  if (kind === 'truck' || kind === 'bus' || kind === 'tanker') return 'blink';
  return 'none';
}

export interface HornObstacle {
  id: number;
  kind: string;
  z: number;
}

/**
 * Obstacles ahead of the bike (road runs toward −Z) inside `range` metres that react to a honk.
 */
export function hornTargets(
  obstacles: HornObstacle[],
  bikeZ: number,
  range = 18,
): { id: number; reaction: HornReaction }[] {
  const out: { id: number; reaction: HornReaction }[] = [];
  for (const o of obstacles) {
    const ahead = bikeZ - o.z;
    if (ahead < -2 || ahead > range) continue;
    const reaction = hornReaction(o.kind);
    if (reaction === 'none') continue;
    out.push({ id: o.id, reaction });
  }
  return out;
}

/** Magnitude 0.55–1 from id, no RNG. */
export function hornMagnitude(id: number): number {
  const x = Math.sin(id * 12.9898) * 43758.5453;
  return 0.55 + (x - Math.floor(x)) * 0.45;
}
