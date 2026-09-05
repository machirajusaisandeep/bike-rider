import type { SceneId } from '../world/scenes';

/**
 * Named Indian routes: an ordered list of checkpoints along a scene's road. Distances are
 * compressed so a route is a 3–5 km run, which is the sweet spot for one sitting.
 */
export type CheckpointKind = 'pass' | 'dhaba' | 'town' | 'view' | 'finish';

export interface Checkpoint {
  /** Metres from the start. */
  at: number;
  name: string;
  kind: CheckpointKind;
  /** Short line shown on the banner / toast. */
  note?: string;
}

export interface Route {
  id: string;
  scene: SceneId;
  name: string;
  from: string;
  to: string;
  blurb: string;
  reward: number;
  checkpoints: Checkpoint[];
}

/** Health restored (fraction) when you pass a dhaba. */
export const DHABA_HEAL = 0.25;

export const ROUTES: Route[] = [
  {
    id: 'manali-leh',
    scene: 'ladakh',
    name: 'Manali → Leh',
    from: 'Manali',
    to: 'Khardung La',
    blurb: 'The pilgrimage. Three passes, two chai stops, one very thin atmosphere.',
    reward: 900,
    checkpoints: [
      { at: 900, name: 'Rohtang La', kind: 'pass', note: '3,978 m' },
      { at: 1700, name: 'Keylong dhaba', kind: 'dhaba', note: 'Chai and maggi' },
      { at: 2600, name: 'Baralacha La', kind: 'pass', note: '4,890 m' },
      { at: 3400, name: 'Sarchu tents', kind: 'dhaba', note: 'Butter tea' },
      { at: 4200, name: 'Tanglang La', kind: 'pass', note: '5,328 m' },
      { at: 5000, name: 'Khardung La', kind: 'finish', note: 'Top of the world' },
    ],
  },
  {
    id: 'mysuru-ooty',
    scene: 'ooty',
    name: 'Mysuru → Ooty',
    from: 'Bandipur',
    to: 'Ooty',
    blurb: 'Through the tiger reserve and up the 36 hairpins of the Kalhatti ghat.',
    reward: 700,
    checkpoints: [
      { at: 700, name: 'Bandipur gate', kind: 'view', note: 'Elephant crossing' },
      { at: 1500, name: 'Masinagudi dhaba', kind: 'dhaba', note: 'Filter coffee' },
      { at: 2300, name: 'Hairpin 12 / 36', kind: 'view', note: 'Kalhatti ghat' },
      { at: 3100, name: 'Hairpin 36 / 36', kind: 'pass', note: 'Made it' },
      { at: 3800, name: 'Ooty', kind: 'finish', note: 'Queen of hills' },
    ],
  },
  {
    id: 'kochi-munnar',
    scene: 'munnar',
    name: 'Kochi → Munnar',
    from: 'Neriamangalam',
    to: 'Munnar',
    blurb: 'Waterfalls, spice towns and the first tea bushes after Adimali.',
    reward: 650,
    checkpoints: [
      { at: 700, name: 'Neriamangalam bridge', kind: 'view', note: 'Periyar below' },
      { at: 1500, name: 'Adimali chai kada', kind: 'dhaba', note: 'Chai and pazham pori' },
      { at: 2200, name: 'Cheeyappara falls', kind: 'view', note: 'Seven steps' },
      { at: 3000, name: 'Munnar', kind: 'finish', note: 'Tea country' },
    ],
  },
  {
    id: 'kozhikode-wayanad',
    scene: 'wayanad',
    name: 'Kozhikode → Wayanad',
    from: 'Adivaram',
    to: 'Vythiri',
    blurb: 'Nine hairpins of the Thamarassery churam, usually in the rain.',
    reward: 650,
    checkpoints: [
      { at: 600, name: 'Adivaram', kind: 'view', note: 'Foot of the ghat' },
      { at: 1400, name: 'Churam view point', kind: 'view', note: 'Hairpin 5 / 9' },
      { at: 2100, name: 'Lakkidi dhaba', kind: 'dhaba', note: 'Wettest place in Kerala' },
      { at: 2900, name: 'Vythiri', kind: 'finish', note: 'Into the mist' },
    ],
  },
  {
    id: 'varkala-cliff',
    scene: 'varkala',
    name: 'Varkala cliff run',
    from: 'Papanasam',
    to: 'Kappil',
    blurb: 'The cliff road at sunset, shacks on one side, the Arabian Sea on the other.',
    reward: 500,
    checkpoints: [
      { at: 500, name: 'Papanasam beach', kind: 'view', note: 'Helipad' },
      { at: 1200, name: 'Black beach shack', kind: 'dhaba', note: 'Lime soda' },
      {
        at: 1900,
        name: 'Kappil backwaters',
        kind: 'finish',
        note: 'Where the river meets the sea',
      },
    ],
  },
  {
    id: 'orr-dash',
    scene: 'bengaluru',
    name: 'Outer Ring Road dash',
    from: 'Silk Board',
    to: 'Hebbal',
    blurb: 'Peak hour on the ORR. Nobody stays in their lane, least of all you.',
    reward: 750,
    checkpoints: [
      { at: 600, name: 'Silk Board', kind: 'view', note: 'The junction' },
      { at: 1300, name: 'HSR chaat corner', kind: 'dhaba', note: 'Pani puri break' },
      { at: 2100, name: 'Marathahalli', kind: 'view', note: 'Flyover' },
      { at: 3200, name: 'Hebbal', kind: 'finish', note: 'Made it home' },
    ],
  },
];

export const ROUTE_BY_ID: Record<string, Route> = Object.fromEntries(ROUTES.map((r) => [r.id, r]));

export function routesFor(scene: SceneId): Route[] {
  return ROUTES.filter((r) => r.scene === scene);
}

export interface RouteProgress {
  next: Checkpoint | null;
  /** Metres to the next checkpoint. */
  remaining: number;
  passed: number;
  total: number;
  finished: boolean;
}

/** Progress along a route from distance ridden. Pure. */
export function routeProgress(route: Route, distanceM: number): RouteProgress {
  const total = route.checkpoints.length;
  let passed = 0;
  for (const c of route.checkpoints) if (distanceM >= c.at) passed++;
  const next = route.checkpoints[passed] ?? null;
  return {
    next,
    remaining: next ? Math.max(0, next.at - distanceM) : 0,
    passed,
    total,
    finished: passed >= total,
  };
}
