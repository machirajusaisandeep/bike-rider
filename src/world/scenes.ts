import type { SignStyle } from './textures';

export type SceneId = 'munnar' | 'ladakh' | 'wayanad' | 'ooty' | 'varkala' | 'bengaluru';
export type SceneCategory = 'Hills' | 'Mountains' | 'Beach' | 'City' | 'Greenery';

export type VegType =
  | 'broadleaf' // dense tropical canopy tree
  | 'raintree' // wide-spreading avenue tree
  | 'pine'
  | 'eucalyptus'
  | 'palm'
  | 'tea' // contour hedge rows (placed as continuous 6 m hedge segments)
  | 'shrub'
  | 'scrub' // dry high-altitude scrub (seabuckthorn / caragana)
  | 'grass'
  | 'rock'
  | 'boulder'
  | 'stupa' // small whitewashed chorten, Ladakh roadside
  | 'flags' // prayer-flag line between two poles
  | 'mani' // mani wall: low stone wall stacked with carved slabs
  | 'shack' // Varkala cliff-top cafe shack
  | 'stall' // roadside chai / coconut stall under a tarp
  | 'hut' // estate worker hut / small house with tin roof
  | 'railing' // white cliff-edge railing
  | 'busstop' // BMTC bus shelter
  | 'barricade'; // orange-white road-works barricade

export interface VegLayer {
  type: VegType;
  /** instances per 40 m road tile at High quality (tea rows derive their own count) */
  perTile: number;
  /** lateral placement band from the road edge, metres */
  minDist: number;
  maxDist: number;
  /** only place where terrain height is within this range (absolute, m) */
  minHeight?: number;
  maxHeight?: number;
  /** skip slopes steeper than this (rise/run) */
  maxSlope?: number;
  /** only on one side of the road (-1 left, 1 right) */
  side?: -1 | 1;
  scale?: [number, number];
  /** instance tint family; defaults per type */
  tint?: 'green' | 'dry' | 'none';
  /** yaw along the road instead of random (walls, stalls, shelters) */
  align?: boolean;
}

export interface SceneDef {
  id: SceneId;
  name: string;
  place: string;
  category: SceneCategory;
  tagline: string;
  description: string;
  /** default sun, degrees */
  sun: { elevation: number; azimuth: number };
  sky: { turbidity: number; rayleigh: number; mieCoefficient: number; mieDirectionalG: number };
  exposure: number;
  /** FogExp2 density and tint mixed with the sky horizon */
  fog: { density: number; color: string };
  /** hemisphere ground bounce colour */
  groundBounce: string;
  road: {
    curviness: number; // 0..1.4 multiplies the centreline amplitude
    width: number;
    shoulder: number;
    /** elevation profile along the route */
    elevation: { amplitude: number; wavelength: number };
    /** roadside sign texts (\n for two lines) and the authority style they are painted in */
    signs: string[];
    signStyle: SignStyle;
    /** paint the road as a dusty mountain highway (lighter, cracked) */
    dusty?: boolean;
    /** darker, glossier ghat tarmac with mossy edges */
    wet?: boolean;
    /** parallel service roads beyond the kerb (city) */
    service?: boolean;
    /** stone retaining walls where the hillside is cut */
    walls?: boolean;
    /** downhill-edge protection: whitewashed parapet or painted stone blocks */
    parapet?: 'stone' | 'blocks';
    /** concrete electricity poles along one side */
    poles?: boolean;
    /** yellow-topped kilometre stones */
    milestones?: boolean;
    /** wear decals (tar patches, cracks, oil) per 40 m tile */
    decals: number;
  };
  terrain: {
    amplitude: number; // metres of local relief
    wavelength: number; // metres
    ridge: boolean;
    octaves: number;
    /** mountains far away: extra big-scale relief */
    mountains: { amplitude: number; wavelength: number };
    /** terrain rises on this side of the road (hillside cut), 0 = symmetric */
    hillside: number;
    snowLine?: number;
    /** scattered snow / ice patches on gentle slopes below the snow line */
    snowPatches?: boolean;
    /** horizontal rock strata banding on steep faces */
    strata?: boolean;
    palette: {
      low: string;
      mid: string;
      high: string;
      cliff: string;
      snow?: string;
      sand?: string;
    };
    /** slope above which the surface reads as cliff/rock */
    cliffSlope: number;
  };
  water?: {
    level: number;
    side: -1 | 1;
    /** distance from the road centre to the cliff edge */
    shore: number;
    /** width of the sand strip between cliff foot and surf */
    beach: number;
    deep: string;
    shallow: string;
  };
  city?: { rows: number; minFloors: number; maxFloors: number; metro?: boolean };
  vegetation: VegLayer[];
  /** dust colour kicked up from the shoulder */
  dust: string;
  /** preview thumbnail served from /previews */
  preview: string;
}

export const SCENES: SceneDef[] = [
  {
    id: 'munnar',
    name: 'Munnar',
    place: 'Idukki, Kerala',
    category: 'Hills',
    tagline: 'Tea estates rolling into the mist',
    description:
      'A ribbon of tarmac winding between contour-planted tea bushes, shola forest patches and low morning cloud.',
    sun: { elevation: 24, azimuth: 205 },
    sky: { turbidity: 3.2, rayleigh: 1.6, mieCoefficient: 0.006, mieDirectionalG: 0.8 },
    exposure: 0.95,
    fog: { density: 0.0024, color: '#b7c9c6' },
    groundBounce: '#3f5a2e',
    road: {
      curviness: 1.2,
      width: 6.2,
      shoulder: 1.6,
      elevation: { amplitude: 9, wavelength: 420 },
      signs: [
        'MUNNAR 12',
        'TOP STATION 32',
        'ERAVIKULAM\nNATIONAL PARK',
        'MATTUPETTY DAM',
        'KANNAN DEVAN\nHILLS ESTATE',
        'TEA MUSEUM 3',
      ],
      signStyle: 'kerala',
      walls: true,
      parapet: 'stone',
      poles: true,
      milestones: true,
      decals: 4,
    },
    terrain: {
      amplitude: 18,
      wavelength: 220,
      ridge: false,
      octaves: 5,
      mountains: { amplitude: 140, wavelength: 1400 },
      hillside: 0.22,
      palette: { low: '#4f7f2e', mid: '#5c8f33', high: '#6f9a45', cliff: '#5d5a4c' },
      cliffSlope: 1.1,
    },
    vegetation: [
      { type: 'tea', perTile: 0, minDist: 2.5, maxDist: 48, maxSlope: 1.0, scale: [0.95, 1.1] },
      { type: 'broadleaf', perTile: 8, minDist: 14, maxDist: 90, maxSlope: 0.9, scale: [0.8, 1.4] },
      { type: 'eucalyptus', perTile: 4, minDist: 8, maxDist: 60, scale: [0.9, 1.3] },
      { type: 'grass', perTile: 150, minDist: 0.6, maxDist: 6, scale: [0.7, 1.2] },
      { type: 'rock', perTile: 3, minDist: 3, maxDist: 30 },
      { type: 'hut', perTile: 0.45, minDist: 6, maxDist: 22, maxSlope: 0.35, align: true },
      { type: 'stall', perTile: 0.2, minDist: 1.5, maxDist: 3, maxSlope: 0.3, align: true },
    ],
    dust: '#a99c82',
    preview: 'previews/munnar.jpg',
  },
  {
    id: 'ladakh',
    name: 'Leh–Ladakh',
    place: 'Khardung La road, Ladakh',
    category: 'Mountains',
    tagline: 'High-altitude desert at the roof of the world',
    description:
      'Thin air, barren ochre slopes, snow-capped peaks and a dusty highway strung with chortens and prayer flags.',
    sun: { elevation: 48, azimuth: 160 },
    sky: { turbidity: 1.6, rayleigh: 0.9, mieCoefficient: 0.003, mieDirectionalG: 0.7 },
    exposure: 1.0,
    fog: { density: 0.00085, color: '#b9c6d6' },
    groundBounce: '#6e5a45',
    road: {
      curviness: 0.95,
      width: 5.6,
      shoulder: 2.8,
      elevation: { amplitude: 16, wavelength: 520 },
      signs: [
        'KHARDUNG LA\n17,582 FT',
        'LEH 42',
        'BE GENTLE\nON MY CURVES',
        'SOUTH PULLU\nCHECK POST',
        'NUBRA VALLEY',
        'DRIVE SLOW\nLIVE LONG',
        'PANGONG 160',
      ],
      signStyle: 'bro',
      dusty: true,
      parapet: 'blocks',
      milestones: true,
      decals: 3,
    },
    terrain: {
      amplitude: 22,
      wavelength: 340,
      ridge: true,
      octaves: 5,
      mountains: { amplitude: 420, wavelength: 2400 },
      hillside: 0.14,
      snowLine: 210,
      snowPatches: true,
      strata: true,
      palette: {
        low: '#8e7a5c',
        mid: '#9c8464',
        high: '#7c6a56',
        cliff: '#5f544a',
        snow: '#f1f3f6',
      },
      cliffSlope: 0.9,
    },
    vegetation: [
      { type: 'boulder', perTile: 10, minDist: 3, maxDist: 90, scale: [0.6, 2.2] },
      { type: 'rock', perTile: 18, minDist: 2, maxDist: 60, scale: [0.5, 1.4] },
      { type: 'scrub', perTile: 22, minDist: 2, maxDist: 40, maxHeight: 150, scale: [0.5, 1.0] },
      { type: 'stupa', perTile: 0.3, minDist: 5, maxDist: 12, maxSlope: 0.3, align: true },
      { type: 'flags', perTile: 0.4, minDist: 3, maxDist: 9, maxSlope: 0.4, align: true },
      { type: 'mani', perTile: 0.3, minDist: 4, maxDist: 10, maxSlope: 0.3, align: true },
    ],
    dust: '#c9b79a',
    preview: 'previews/ladakh.jpg',
  },
  {
    id: 'wayanad',
    name: 'Wayanad',
    place: 'Thamarassery ghat, Kerala',
    category: 'Greenery',
    tagline: 'Rainforest canopy after the monsoon',
    description:
      'Dripping green on every side: hairpins through dense forest, wet tarmac, mist in the valleys and the smell of rain.',
    sun: { elevation: 30, azimuth: 120 },
    sky: { turbidity: 4.5, rayleigh: 2.0, mieCoefficient: 0.01, mieDirectionalG: 0.85 },
    exposure: 0.9,
    fog: { density: 0.0038, color: '#aebfb4' },
    groundBounce: '#2f4a25',
    road: {
      curviness: 1.4,
      width: 6.0,
      shoulder: 1.4,
      elevation: { amplitude: 12, wavelength: 360 },
      signs: [
        'KALPETTA 18',
        'THAMARASSERY\nCHURAM · 9 HAIRPINS',
        'LAKKIDI\nVIEW POINT',
        'VYTHIRI 6',
        'HAIRPIN BEND\nNO. 5',
        'EDAKKAL CAVES',
      ],
      signStyle: 'kerala',
      wet: true,
      walls: true,
      parapet: 'stone',
      poles: true,
      milestones: true,
      decals: 5,
    },
    terrain: {
      amplitude: 22,
      wavelength: 240,
      ridge: false,
      octaves: 5,
      mountains: { amplitude: 220, wavelength: 1500 },
      hillside: 0.28,
      palette: { low: '#2f5d24', mid: '#37692a', high: '#45753a', cliff: '#4a4a3f' },
      cliffSlope: 1.0,
    },
    vegetation: [
      {
        type: 'broadleaf',
        perTile: 40,
        minDist: 1.5,
        maxDist: 100,
        maxSlope: 1.3,
        scale: [1.0, 1.9],
      },
      { type: 'palm', perTile: 5, minDist: 4, maxDist: 60, scale: [0.8, 1.2] },
      { type: 'shrub', perTile: 70, minDist: 1.0, maxDist: 30, scale: [0.8, 1.6] },
      { type: 'grass', perTile: 180, minDist: 0.5, maxDist: 8, scale: [0.8, 1.3] },
      { type: 'rock', perTile: 4, minDist: 3, maxDist: 25 },
      { type: 'hut', perTile: 0.25, minDist: 5, maxDist: 16, maxSlope: 0.35, align: true },
      { type: 'stall', perTile: 0.2, minDist: 1.5, maxDist: 3, maxSlope: 0.3, align: true },
    ],
    dust: '#7d7561',
    preview: 'previews/wayanad.jpg',
  },
  {
    id: 'ooty',
    name: 'Ooty',
    place: 'Nilgiris, Tamil Nadu',
    category: 'Hills',
    tagline: 'Pine and eucalyptus on the Nilgiri slopes',
    description:
      'Cool air, long shadows through pine plantations, eucalyptus groves and grassy downs above the tea line.',
    sun: { elevation: 20, azimuth: 205 },
    sky: { turbidity: 2.6, rayleigh: 1.4, mieCoefficient: 0.004, mieDirectionalG: 0.78 },
    exposure: 1.0,
    fog: { density: 0.0022, color: '#c3cdd2' },
    groundBounce: '#4b5f33',
    road: {
      curviness: 1.0,
      width: 6.2,
      shoulder: 1.6,
      elevation: { amplitude: 11, wavelength: 400 },
      signs: [
        'OOTY 9',
        'COONOOR 19',
        'DODDABETTA\nPEAK 2,637 M',
        'HAIRPIN BEND\n14 / 36',
        'PYKARA FALLS',
        'NILGIRI MTN\nRAILWAY ->',
      ],
      signStyle: 'nh',
      walls: true,
      parapet: 'stone',
      poles: true,
      milestones: true,
      decals: 3,
    },
    terrain: {
      amplitude: 20,
      wavelength: 240,
      ridge: false,
      octaves: 5,
      mountains: { amplitude: 160, wavelength: 1600 },
      hillside: 0.18,
      palette: { low: '#5b8a3a', mid: '#6b9440', high: '#7e9a52', cliff: '#66604f' },
      cliffSlope: 1.1,
    },
    vegetation: [
      { type: 'pine', perTile: 22, minDist: 4, maxDist: 90, maxSlope: 1.2, scale: [0.8, 1.4] },
      { type: 'eucalyptus', perTile: 12, minDist: 5, maxDist: 80, scale: [0.9, 1.3] },
      { type: 'tea', perTile: 0, minDist: 3, maxDist: 22, maxSlope: 0.8, side: -1, scale: [0.9, 1.05] },
      { type: 'shrub', perTile: 30, minDist: 1.5, maxDist: 25, scale: [0.6, 1.2] },
      { type: 'grass', perTile: 170, minDist: 0.6, maxDist: 9, scale: [0.7, 1.2] },
      { type: 'rock', perTile: 4, minDist: 3, maxDist: 30 },
      { type: 'hut', perTile: 0.35, minDist: 6, maxDist: 20, maxSlope: 0.35, align: true },
      { type: 'stall', perTile: 0.2, minDist: 1.5, maxDist: 3, maxSlope: 0.3, align: true },
    ],
    dust: '#9d9377',
    preview: 'previews/ooty.jpg',
  },
  {
    id: 'varkala',
    name: 'Varkala',
    place: 'Papanasam cliff, Kerala',
    category: 'Beach',
    tagline: 'Cliff road above the Arabian Sea',
    description:
      'Coconut palms lean over a red-laterite cliff, cafe shacks line the edge and the sea glitters all the way to the horizon.',
    sun: { elevation: 14, azimuth: 262 },
    sky: { turbidity: 3.5, rayleigh: 2.0, mieCoefficient: 0.005, mieDirectionalG: 0.8 },
    exposure: 1.05,
    fog: { density: 0.0016, color: '#e6cbb0' },
    groundBounce: '#7a6242',
    road: {
      curviness: 0.6,
      width: 5.8,
      shoulder: 1.8,
      elevation: { amplitude: 3, wavelength: 500 },
      signs: [
        'VARKALA 2',
        'PAPANASAM\nBEACH',
        'JANARDHANA\nSWAMY TEMPLE',
        'NORTH CLIFF\nHELIPAD',
        'KAPPIL 7',
        'ODAYAM BEACH',
      ],
      signStyle: 'kerala',
      poles: true,
      milestones: true,
      decals: 3,
    },
    terrain: {
      amplitude: 6,
      wavelength: 160,
      ridge: false,
      octaves: 4,
      mountains: { amplitude: 0, wavelength: 1000 },
      hillside: -0.06,
      palette: {
        low: '#7a9a3f',
        mid: '#86a047',
        high: '#8aa050',
        cliff: '#9a4a2c',
        sand: '#e0c9a0',
      },
      cliffSlope: 0.8,
    },
    water: { level: -22, side: 1, shore: 15, beach: 24, deep: '#0f4d6b', shallow: '#2f9aa8' },
    vegetation: [
      { type: 'palm', perTile: 22, minDist: 2, maxDist: 70, side: -1, scale: [0.8, 1.35] },
      { type: 'palm', perTile: 7, minDist: 2, maxDist: 9, side: 1, scale: [0.8, 1.3] },
      { type: 'shack', perTile: 0.8, minDist: 4, maxDist: 6, side: 1, maxSlope: 0.3, align: true },
      { type: 'railing', perTile: 5, minDist: 9.5, maxDist: 10, side: 1, maxSlope: 0.6, align: true },
      { type: 'stall', perTile: 0.35, minDist: 1.5, maxDist: 3, side: -1, maxSlope: 0.3, align: true },
      { type: 'shrub', perTile: 40, minDist: 1.5, maxDist: 40, scale: [0.7, 1.4] },
      { type: 'grass', perTile: 140, minDist: 0.6, maxDist: 9, scale: [0.7, 1.2] },
    ],
    dust: '#c7a889',
    preview: 'previews/varkala.jpg',
  },
  {
    id: 'bengaluru',
    name: 'Bengaluru',
    place: 'Outer Ring Road, Karnataka',
    category: 'City',
    tagline: 'Rain trees and glass towers at dusk',
    description:
      'Six lanes under a canopy of rain trees, tech-park glass lighting up, metro piers marching down the median and traffic that never quite settles.',
    sun: { elevation: 7, azimuth: 275 },
    sky: { turbidity: 6, rayleigh: 1.8, mieCoefficient: 0.015, mieDirectionalG: 0.88 },
    exposure: 1.0,
    fog: { density: 0.0022, color: '#d9b9a4' },
    groundBounce: '#4d4a46',
    road: {
      curviness: 0.35,
      width: 13,
      shoulder: 1.0,
      elevation: { amplitude: 1.2, wavelength: 600 },
      signs: [
        'SILK BOARD JN 2',
        'MARATHAHALLI',
        'BELLANDUR',
        'KADUBEESANAHALLI',
        'HEBBAL 21',
        'K R PURAM',
        'NAMMA METRO\nWORK IN PROGRESS',
      ],
      signStyle: 'city',
      service: true,
      decals: 7,
    },
    terrain: {
      amplitude: 1.2,
      wavelength: 120,
      ridge: false,
      octaves: 3,
      mountains: { amplitude: 0, wavelength: 1000 },
      hillside: 0,
      palette: { low: '#6d6a62', mid: '#75726a', high: '#7a776f', cliff: '#7a776f' },
      cliffSlope: 9,
    },
    city: { rows: 3, minFloors: 2, maxFloors: 14, metro: true },
    vegetation: [
      { type: 'raintree', perTile: 3, minDist: 0.6, maxDist: 1.6, scale: [0.9, 1.3] },
      { type: 'busstop', perTile: 0.34, minDist: 0.3, maxDist: 0.4, maxSlope: 1, align: true },
      { type: 'barricade', perTile: 3, minDist: 0.1, maxDist: 0.5, align: true },
      { type: 'shrub', perTile: 6, minDist: 0.5, maxDist: 1.8, scale: [0.5, 0.8] },
    ],
    dust: '#8d857a',
    preview: 'previews/bengaluru.jpg',
  },
];

export const SCENE_BY_ID: Record<SceneId, SceneDef> = Object.fromEntries(
  SCENES.map((s) => [s.id, s]),
) as Record<SceneId, SceneDef>;

export const DEFAULT_SCENE: SceneId = 'munnar';

export function isSceneId(v: unknown): v is SceneId {
  return typeof v === 'string' && v in SCENE_BY_ID;
}
