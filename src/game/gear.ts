/**
 * Riding gear catalogue and protection scoring.
 *
 * Zones add up to 100. An item covers one or more zones with a number of points; equipping
 * several items that cover the same zone never exceeds that zone's cap. The total is the
 * "protection score" that the (upcoming) health system will scale damage by.
 *
 * Product names follow Royal Enfield's riding-gear catalogue (Streetwind, Windfarer, Explorer,
 * Intrepid, Cragsman, Stalwart, Conqueror, Lightwing); visuals are original low-poly stand-ins.
 */
import presets from './rider-presets.json';

export type BodyType = 'male' | 'female';
export type BeardStyle = 'none' | 'stubble' | 'full';

export interface FacePreset {
  id: string;
  name: string;
  morphs: Record<string, number>;
}
export const FACES: Record<BodyType, FacePreset[]> = presets.faces as Record<
  BodyType,
  FacePreset[]
>;
export const HAIR: Record<BodyType, string[]> = presets.hair as Record<BodyType, string[]>;
export const HAIR_NAMES: Record<string, string> = presets.hairNames;
export const HAIR_COLORS: { id: string; hex: string }[] = presets.hairColors;
export const SKIN_TONES: { id: string; hex: string }[] = presets.skinTones;
export const BEARDS: BeardStyle[] = presets.beards as BeardStyle[];
export type GearSlot = 'helmet' | 'jacket' | 'gloves' | 'elbow' | 'knee' | 'boots';
export type Zone = 'head' | 'torso' | 'arms' | 'hands' | 'knees' | 'feet';

export const ZONE_CAP: Record<Zone, number> = {
  head: 30,
  torso: 20,
  arms: 10,
  hands: 10,
  knees: 18,
  feet: 12,
};

export const ZONE_LABEL: Record<Zone, string> = {
  head: 'Head',
  torso: 'Torso',
  arms: 'Arms',
  hands: 'Hands',
  knees: 'Knees',
  feet: 'Feet',
};

export interface GearItem {
  id: string;
  slot: GearSlot;
  name: string;
  blurb: string;
  /** points per zone */
  covers: Partial<Record<Zone, number>>;
  /** primary colour used by the rider model */
  color: string;
  /** accent colour (panels, straps, visor) */
  accent?: string;
  /** visual style hint for the rider model */
  style: string;
}

export const SLOT_LABEL: Record<GearSlot, string> = {
  helmet: 'Helmet',
  jacket: 'Jacket',
  gloves: 'Gloves',
  elbow: 'Elbow guards',
  knee: 'Knee guards',
  boots: 'Footwear',
};

export const SLOTS: GearSlot[] = ['helmet', 'jacket', 'gloves', 'elbow', 'knee', 'boots'];

export const GEAR: GearItem[] = [
  // Helmets -------------------------------------------------------------------------------
  {
    id: 'lightwing-open',
    slot: 'helmet',
    name: 'Lightwing Open Face',
    blurb: 'ISI-certified open-face lid with a snap-on peak. Great airflow, no chin bar.',
    covers: { head: 20 },
    color: '#f2f0ea',
    accent: '#1a1b1e',
    style: 'open',
  },
  {
    id: 'streetwind-full',
    slot: 'helmet',
    name: 'Streetwind Full Face',
    blurb: 'Full-face shell with a wide visor and chin bar. The safest thing on this list.',
    covers: { head: 30 },
    color: '#15171a',
    accent: '#ff5a1f',
    style: 'full',
  },
  {
    id: 'lightwing-flame',
    slot: 'helmet',
    name: 'Lightwing White Flame',
    blurb: 'Open-face in the White Flame livery to match the tank.',
    covers: { head: 20 },
    color: '#f2f0ea',
    accent: '#a81a22',
    style: 'open',
  },
  // Jackets -------------------------------------------------------------------------------
  {
    id: 'streetwind-v2',
    slot: 'jacket',
    name: 'Streetwind V2',
    blurb: 'Summer mesh jacket with soft shoulder and elbow inserts.',
    covers: { torso: 12, arms: 6 },
    color: '#2b2f36',
    accent: '#8a8f99',
    style: 'mesh',
  },
  {
    id: 'windfarer',
    slot: 'jacket',
    name: 'Windfarer',
    blurb: 'Touring textile with wind and rain protection and CE Level 1 armour.',
    covers: { torso: 16, arms: 8 },
    color: '#5a6b4a',
    accent: '#d9c9a5',
    style: 'touring',
  },
  {
    id: 'explorer-v3',
    slot: 'jacket',
    name: 'Explorer V3',
    blurb: 'Adventure shell developed with KNOX, CE Level 2 shoulders, elbows and back.',
    covers: { torso: 20, arms: 10 },
    color: '#b8451c',
    accent: '#1f2226',
    style: 'adventure',
  },
  // Gloves --------------------------------------------------------------------------------
  {
    id: 'intrepid',
    slot: 'gloves',
    name: 'Intrepid',
    blurb: 'Short-cuff summer gloves with knuckle padding.',
    covers: { hands: 6 },
    color: '#1f2226',
    style: 'short',
  },
  {
    id: 'cragsman',
    slot: 'gloves',
    name: 'Cragsman',
    blurb: 'Full-gauntlet leather with hard knuckles.',
    covers: { hands: 8 },
    color: '#4a3526',
    accent: '#d9b56b',
    style: 'gauntlet',
  },
  {
    id: 'stalwart',
    slot: 'gloves',
    name: 'Stalwart',
    blurb: 'Waterproof touring gauntlet with CE knuckle and palm sliders.',
    covers: { hands: 10 },
    color: '#15171a',
    accent: '#ff5a1f',
    style: 'gauntlet',
  },
  // Elbow ---------------------------------------------------------------------------------
  {
    id: 'knox-elbow',
    slot: 'elbow',
    name: 'RE × KNOX Elbow Guards',
    blurb: 'Strap-on CE elbow cups worn over or under a jacket.',
    covers: { arms: 5 },
    color: '#1f2226',
    accent: '#8a8f99',
    style: 'cup',
  },
  // Knee ----------------------------------------------------------------------------------
  {
    id: 'soft-knee',
    slot: 'knee',
    name: 'Soft Knee Sleeves',
    blurb: 'Slip-on foam sleeves. Better than denim alone.',
    covers: { knees: 10 },
    color: '#2b2f36',
    style: 'sleeve',
  },
  {
    id: 'conqueror',
    slot: 'knee',
    name: 'Conqueror Knee Guards',
    blurb: 'CE Level 2 hard-shell knee and shin guards developed with KNOX.',
    covers: { knees: 18 },
    color: '#15171a',
    accent: '#ff5a1f',
    style: 'shell',
  },
  // Boots ---------------------------------------------------------------------------------
  {
    id: 'riding-sneakers',
    slot: 'boots',
    name: 'Riding Sneakers',
    blurb: 'Reinforced ankle sneakers. Casual, minimal protection.',
    covers: { feet: 5 },
    color: '#c9c4b8',
    accent: '#ff5a1f',
    style: 'sneaker',
  },
  {
    id: 'ankle-boots',
    slot: 'boots',
    name: 'Ankle Riding Boots',
    blurb: 'Leather ankle boots with shift pad and heel cup.',
    covers: { feet: 9 },
    color: '#4a3526',
    style: 'ankle',
  },
  {
    id: 'adventure-boots',
    slot: 'boots',
    name: 'Adventure Boots',
    blurb: 'Tall waterproof boots with shin plate and ankle armour.',
    covers: { feet: 12 },
    color: '#1f2226',
    accent: '#8a8f99',
    style: 'tall',
  },
];

export const GEAR_BY_ID: Record<string, GearItem> = Object.fromEntries(GEAR.map((g) => [g.id, g]));

export function itemsFor(slot: GearSlot): GearItem[] {
  return GEAR.filter((g) => g.slot === slot);
}

export interface RiderConfig {
  body: BodyType;
  /** face preset id (per body type) */
  face: string;
  /** hair style id (per body type) */
  hair: string;
  hairColor: string;
  skin: string;
  beard: BeardStyle;
  /** item id per slot, or null for nothing */
  gear: Record<GearSlot, string | null>;
}

export const DEFAULT_RIDER: RiderConfig = {
  body: 'male',
  face: 'arjun',
  hair: 'crop',
  hairColor: 'black',
  skin: 's3',
  beard: 'none',
  gear: {
    helmet: 'lightwing-open',
    jacket: null,
    gloves: null,
    elbow: null,
    knee: null,
    boots: 'riding-sneakers',
  },
};

export interface ProtectionBreakdown {
  total: number;
  zones: Record<Zone, number>;
  /** zones with zero coverage: what the rider is exposed on */
  exposed: Zone[];
}

export function protectionFor(cfg: RiderConfig): ProtectionBreakdown {
  const zones: Record<Zone, number> = { head: 0, torso: 0, arms: 0, hands: 0, knees: 0, feet: 0 };
  for (const slot of SLOTS) {
    const id = cfg.gear[slot];
    if (!id) continue;
    const item = GEAR_BY_ID[id];
    if (!item) continue;
    for (const [z, pts] of Object.entries(item.covers) as [Zone, number][]) {
      zones[z] = Math.min(ZONE_CAP[z], zones[z] + pts);
    }
  }
  const total = (Object.values(zones) as number[]).reduce((a, b) => a + b, 0);
  const exposed = (Object.keys(zones) as Zone[]).filter((z) => zones[z] === 0);
  return { total, zones, exposed };
}

export function sanitizeRider(raw: unknown): RiderConfig {
  const r = (raw ?? {}) as Partial<RiderConfig>;
  const body: BodyType = r.body === 'female' ? 'female' : 'male';
  const gear = { ...DEFAULT_RIDER.gear };
  for (const slot of SLOTS) {
    const id = r.gear?.[slot];
    if (id === null) gear[slot] = null;
    else if (typeof id === 'string' && GEAR_BY_ID[id]?.slot === slot) gear[slot] = id;
  }
  const faces = FACES[body];
  const face = faces.some((f) => f.id === r.face) ? r.face! : faces[0]!.id;
  const hair = HAIR[body].includes(r.hair ?? '') ? r.hair! : HAIR[body][0]!;
  const hairColor = HAIR_COLORS.some((c) => c.id === r.hairColor) ? r.hairColor! : 'black';
  const skin = SKIN_TONES.some((c) => c.id === r.skin) ? r.skin! : 's3';
  const beard: BeardStyle =
    body === 'male' && BEARDS.includes(r.beard as BeardStyle) ? (r.beard as BeardStyle) : 'none';
  return { body, face, hair, hairColor, skin, beard, gear };
}

/** Defaults that make sense when switching body type. */
export function riderForBody(cfg: RiderConfig, body: BodyType): RiderConfig {
  return sanitizeRider({
    ...cfg,
    body,
    face: FACES[body][0]!.id,
    hair: HAIR[body][0]!,
    beard: body === 'male' ? cfg.beard : 'none',
  });
}
