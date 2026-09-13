/**
 * Riding gear catalogue and protection scoring.
 *
 * Zones add up to 100. An item covers one or more zones with a number of points; equipping
 * several items that cover the same zone never exceeds that zone's cap. The total is the
 * "protection score" that the (upcoming) health system will scale damage by.
 *
 * Catalogue references are linked per item. Scores are game balance, not certification or
 * injury-risk estimates. Legacy IDs remain stable for saved loadouts.
 */
import presets from './rider-presets.json';

export type BodyType = 'male' | 'female';
export type BeardStyle = 'none' | 'stubble' | 'full' | 'moustache';
export type BindiStyle = 'none' | 'red' | 'black';
export type EarringStyle = 'none' | 'studs' | 'jhumka';

export interface FacePreset {
  id: string;
  name: string;
  /** where this look is drawn from, shown as a hint on the thumbnail */
  region?: string;
  morphs: Record<string, number>;
  /** iris colour override */
  iris?: string;
}
export const FACES: Record<BodyType, FacePreset[]> = presets.faces as unknown as Record<
  BodyType,
  FacePreset[]
>;
export const HAIR: Record<BodyType, string[]> = presets.hair as Record<BodyType, string[]>;
export const HAIR_NAMES: Record<string, string> = presets.hairNames;
export const HAIR_COLORS: { id: string; hex: string; name?: string }[] = presets.hairColors;
export const TURBAN_COLORS: { id: string; hex: string; name?: string }[] = presets.turbanColors;
export const SKIN_TONES: { id: string; hex: string }[] = presets.skinTones;
export const BEARDS: BeardStyle[] = presets.beards as BeardStyle[];
export const BINDIS: BindiStyle[] = presets.bindis as BindiStyle[];
export const EARRINGS: EarringStyle[] = presets.earrings as EarringStyle[];
/** Hair styles that hang out below a helmet's rim (their `_out` part stays visible). */
export const HAIR_OUT: string[] = presets.hairOut;
export const MORPH_NAMES: string[] = presets.morphNames;
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
  /** Manufacturer reference, when this is a named Royal Enfield product. */
  source?: string;
  colorway?: string;
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
    name: 'Jet MLG Neo',
    blurb:
      'Classic open-face thermoplastic jet shell, clear polycarbonate visor on external pivots, MLG 1901 roundel at the back. No chin bar.',
    source: 'https://royalenfield.store/in/en/helmets/open-face-helmets',
    colorway: 'Black / red',
    covers: { head: 20 },
    color: '#1d1f22',
    accent: '#b8292f',
    style: 'open',
  },
  {
    id: 'streetwind-full',
    slot: 'helmet',
    name: 'Lightwing Rewing',
    blurb:
      'Full-face ABS shell with three closable intake vents and an exhaust port, clear hard-coated visor, drop-down sun visor, winged graphic and badging front and rear.',
    source: 'https://royalenfield.store/in/en/lwing-ff-rewing-i-abs-gi-grey-xl620',
    colorway: 'Grey',
    covers: { head: 30 },
    color: '#6c7375',
    accent: '#aa2734',
    style: 'full',
  },
  {
    id: 'lightwing-flame',
    slot: 'helmet',
    name: 'Lightwing Checks',
    blurb:
      'Full-face Lightwing in the matt black and red Checks colourway: same vented shell, clear visor and inner sun visor, with a chequered band.',
    source:
      'https://royalenfield.store/in/en/lwing-f-f-helmet-checks-matred-xl-62-cm-matt-black-red',
    colorway: 'Matt black / red',
    covers: { head: 30 },
    color: '#222426',
    accent: '#a81a22',
    style: 'full',
  },
  // Jackets -------------------------------------------------------------------------------
  {
    id: 'streetwind-v2',
    slot: 'jacket',
    name: 'Streetwind V2',
    blurb:
      'Ninety percent abrasion-resistant polyester mesh with 600D panels, two zipped front pockets, reflective shoulder piping, adjusters at cuffs, biceps, forearms and waist. Knox Flexiform Level 1 shoulder and elbow armour fitted internally.',
    source: 'https://store.royalenfield.com/en/streetwind-v2-jacket-black',
    colorway: 'Black',
    covers: { torso: 12, arms: 6 },
    color: '#22252a',
    accent: '#3a3e44',
    style: 'mesh',
  },
  {
    id: 'windfarer',
    slot: 'jacket',
    name: 'Windfarer V2',
    blurb:
      'Olive mesh body with 610D Cordura shoulder and elbow patches, cushioned collar, deep waist pockets, red zip pulls, adjusters at biceps, forearms, cuffs and waist. Ergo Pro-Tech Level 2 shoulder, elbow and back protectors fitted internally.',
    source: 'https://royalenfield.store/in/en/windfarer-v2-green-3xl-48-cm-green',
    colorway: 'Green / black',
    covers: { torso: 16, arms: 8 },
    color: '#48563a',
    accent: '#1f2224',
    style: 'touring',
  },
  {
    id: 'explorer-v3',
    slot: 'jacket',
    name: 'Explorer V3',
    blurb:
      'Grey 600D touring shell, about forty percent mesh at the chest, arms and back, 610D Cordura impact zones, cushioned collar with neck tab, YKK Vislon zips, five pockets and reflective branding. Modelled with Knox Micro-Lock Level 2 armour fitted; shell-only versions exclude protectors.',
    source: 'https://store.royalenfield.com/en/exp-v3-riding-jkt-grey-3xl-48-cm-grey',
    colorway: 'Grey',
    covers: { torso: 20, arms: 10 },
    color: '#6f7478',
    accent: '#3d4145',
    style: 'adventure',
  },
  // Gloves --------------------------------------------------------------------------------
  {
    id: 'intrepid',
    slot: 'gloves',
    name: 'Intrepid',
    blurb:
      'Short-cuff waterproof gloves: goat nappa, moulded PVC knuckle under the leather, 3 mm palm reinforcement, microsuede grip patch, touchscreen fingertips.',
    source: 'https://royalenfield.store/in/en/riding/gloves',
    colorway: 'Olive camo',
    covers: { hands: 6 },
    color: '#4c5148',
    accent: '#1d1f21',
    style: 'short',
  },
  {
    id: 'cragsman',
    slot: 'gloves',
    name: 'Cragsman',
    blurb:
      'Himalayan-inspired goat leather gloves with air-mesh panels, perforated knuckles over PVC protectors, 5 mm palm sponge, microsuede palm patch and a longer Velcro cuff.',
    source: 'https://royalenfield.store/in/en/riding/gloves',
    colorway: 'Black / brown',
    covers: { hands: 8 },
    color: '#1c1d1f',
    accent: '#5a3d2b',
    style: 'gauntlet',
  },
  {
    id: 'stalwart',
    slot: 'gloves',
    name: 'Stalwart',
    blurb:
      'Perforated goat leather with stretch panels, hard Knox knuckle protector, Knox SPS palm slider, accordion stretch and a TPR wrist strap with Velcro closure.',
    source: 'https://royalenfield.store/in/en/stalwart-gloves-black-olive-2xl-24cm-black-olive',
    colorway: 'Black / olive',
    covers: { hands: 10 },
    color: '#1a1c1e',
    accent: '#4d5540',
    style: 'gauntlet',
  },
  // Elbow ---------------------------------------------------------------------------------
  {
    id: 'knox-elbow',
    slot: 'elbow',
    name: 'Universal Elbow Guards',
    blurb:
      'Generic strap-on elbow pads. Not a Royal Enfield product; jacket armour is fitted internally.',
    covers: { arms: 5 },
    color: '#1f2226',
    accent: '#8a8f99',
    style: 'cup',
  },
  // Knee ----------------------------------------------------------------------------------
  {
    id: 'soft-knee',
    slot: 'knee',
    name: 'Knox Challenger',
    blurb:
      'Low-profile LDPE knee plate with an integrated hexagonal cell structure and perforations, breathable nylon backing, elasticated straps with reflective print. CE Level 1.',
    source: 'https://store.royalenfield.com/en/re-knox-external-knee-armour-l1-grey-black',
    colorway: 'Grey / black',
    covers: { knees: 10 },
    color: '#767a7d',
    accent: '#1e2022',
    style: 'sleeve',
  },
  {
    id: 'conqueror',
    slot: 'knee',
    name: 'Conqueror Knee Guards',
    blurb:
      'One-piece LDPE honeycomb shell that runs down over the upper shin, slit for flex, extensively perforated, Knox Micro-Lock inside. Developed with Knox. CE Level 2.',
    source: 'https://www.planet-knox.com/ro/ce-certified-knox-royal-enfield-conqueror-knee-guard/',
    colorway: 'Black',
    covers: { knees: 18 },
    color: '#1e2023',
    accent: '#929592',
    style: 'shell',
  },
  // Boots ---------------------------------------------------------------------------------
  {
    id: 'riding-sneakers',
    slot: 'boots',
    name: 'Cabo WP Boots',
    blurb:
      'TCX-made riding sneaker in waxed grain leather: lace closure, tall side walls, reinforced toe, heel counter and ankle, waterproof membrane, thick rubber sole.',
    source: 'https://royalenfield.store/in/en/riding/shoes',
    colorway: 'Black',
    covers: { feet: 5 },
    color: '#23262a',
    accent: '#1a1c1f',
    style: 'sneaker',
  },
  {
    id: 'ankle-boots',
    slot: 'boots',
    name: 'Marshall Boots',
    blurb:
      'Full leather lace-up boot with TPU protectors in the toe box, ankle and heel cup, toe shift patch, reflective loop at the back and a grooved anti-skid sole.',
    source: 'https://royalenfield.store/in/en/riding/shoes',
    colorway: 'Tan',
    covers: { feet: 9 },
    color: '#8a5a35',
    accent: '#6b4426',
    style: 'ankle',
  },
  {
    id: 'adventure-boots',
    slot: 'boots',
    name: 'Touring Boots',
    blurb:
      'Generic tall touring boots with shin coverage and buckle closures. Not a Royal Enfield product.',
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
  /** turban cloth colour when hair is 'turban' */
  turbanColor: string;
  skin: string;
  beard: BeardStyle;
  /** kajal (kohl) eyeliner */
  kajal: boolean;
  bindi: BindiStyle;
  earrings: EarringStyle;
  /** item id per slot, or null for nothing */
  gear: Record<GearSlot, string | null>;
}

export const DEFAULT_RIDER: RiderConfig = {
  body: 'male',
  face: 'arjun',
  hair: 'crop',
  hairColor: 'black',
  turbanColor: 'saffron',
  skin: 's3',
  beard: 'none',
  kajal: false,
  bindi: 'none',
  earrings: 'none',
  gear: {
    helmet: 'lightwing-open',
    jacket: 'windfarer',
    gloves: 'intrepid',
    elbow: null,
    knee: 'soft-knee',
    boots: 'ankle-boots',
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
  const turbanColor = TURBAN_COLORS.some((c) => c.id === r.turbanColor)
    ? r.turbanColor!
    : 'saffron';
  const skin = SKIN_TONES.some((c) => c.id === r.skin) ? r.skin! : 's3';
  const beard: BeardStyle =
    body === 'male' && BEARDS.includes(r.beard as BeardStyle) ? (r.beard as BeardStyle) : 'none';
  const kajal = typeof r.kajal === 'boolean' ? r.kajal : body === 'female';
  const bindi: BindiStyle =
    body === 'female' && BINDIS.includes(r.bindi as BindiStyle) ? (r.bindi as BindiStyle) : 'none';
  const earrings: EarringStyle =
    body === 'female' && EARRINGS.includes(r.earrings as EarringStyle)
      ? (r.earrings as EarringStyle)
      : 'none';
  return { body, face, hair, hairColor, turbanColor, skin, beard, kajal, bindi, earrings, gear };
}

/** Defaults that make sense when switching body type. */
export function riderForBody(cfg: RiderConfig, body: BodyType): RiderConfig {
  return sanitizeRider({
    ...cfg,
    body,
    face: FACES[body][0]!.id,
    hair: HAIR[body][0]!,
    beard: body === 'male' ? cfg.beard : 'none',
    kajal: body === 'female',
    bindi: 'none',
    earrings: 'none',
  });
}
