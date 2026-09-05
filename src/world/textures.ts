import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function noiseFill(
  ctx: Ctx,
  w: number,
  h: number,
  base: [number, number, number],
  spread: number,
  grains: number,
) {
  ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < grains; i++) {
    const v = (Math.random() - 0.5) * spread;
    const r = Math.max(0, Math.min(255, base[0] + v));
    const g = Math.max(0, Math.min(255, base[1] + v));
    const b = Math.max(0, Math.min(255, base[2] + v));
    ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${0.35 + Math.random() * 0.5})`;
    const s = 1 + Math.random() * 2.5;
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

function finish(c: HTMLCanvasElement, anisotropy = 8): CanvasTexture {
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

// ------------------------------------------------------------------------------ road wear ----

/** A meandering crack: a few kinked strokes with a faint lighter halo where the edge crumbled. */
function crack(ctx: Ctx, x: number, y: number, len: number, wrapW: number) {
  const pts: [number, number][] = [[x, y]];
  let a = Math.random() * Math.PI * 2;
  for (let k = 0; k < 7; k++) {
    a += (Math.random() - 0.5) * 1.4;
    const p = pts[pts.length - 1]!;
    pts.push([p[0] + Math.cos(a) * (len / 7), p[1] + Math.sin(a) * (len / 7)]);
  }
  const draw = (dx: number) => {
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + dx, py) : ctx.moveTo(px + dx, py)));
    ctx.stroke();
  };
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(120,116,108,0.28)';
  ctx.lineWidth = 5;
  draw(0);
  ctx.strokeStyle = 'rgba(18,17,16,0.7)';
  ctx.lineWidth = 1.6;
  draw(0);
  // horizontal wrap so seams are invisible
  if (x < len) draw(wrapW);
  if (x > wrapW - len) draw(-wrapW);
}

/** Irregular dark tar / repair patch with a slightly raised lighter rim. */
function tarPatch(ctx: Ctx, x: number, y: number, rx: number, ry: number, dark: number) {
  ctx.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.78 + Math.random() * 0.4;
    const px = x + Math.cos(a) * rx * k;
    const py = y + Math.sin(a) * ry * k;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = `rgba(${dark},${dark},${dark + 2},0.9)`;
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,146,138,0.28)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

/** Paint stripe with flaked / worn gaps so it never reads as a vector line. */
function wornStripe(
  ctx: Ctx,
  x: number,
  y0: number,
  w: number,
  y1: number,
  rgba: string,
  wear: number,
) {
  ctx.fillStyle = rgba;
  ctx.fillRect(x, y0, w, y1 - y0);
  // erode: knock out random chunks along the stripe
  const chunks = Math.round(((y1 - y0) / 18) * wear);
  for (let i = 0; i < chunks; i++) {
    const cy = y0 + Math.random() * (y1 - y0);
    const ch = 3 + Math.random() * 14;
    const cw = w * (0.3 + Math.random() * 0.8);
    ctx.clearRect(x + (Math.random() - 0.3) * w * 0.6, cy, cw, ch);
  }
}

interface RoadOpts {
  base: [number, number, number];
  spread: number;
  /** 0..1 how faded/broken the paint is */
  wear: number;
  cracks: number;
  patches: number;
  /** darker oil / rubber polish in the wheel tracks (0..1) */
  tracks: number;
  /** dirt creeping in from the edges: colour and strength */
  edge: { rgb: [number, number, number]; strength: number; width: number };
  /** lane layout */
  lanes: 'two' | 'city' | 'none';
  /** wide median (city) as a fraction of width */
  median?: number;
  size?: [number, number];
}

/** One 16 m stretch of road. Everything in here is meant to break the repeat and the "vector" look. */
function roadTexture(o: RoadOpts): CanvasTexture {
  const [w, h] = o.size ?? [1024, 2048];
  const [c, ctx] = canvas(w, h);
  noiseFill(ctx, w, h, o.base, o.spread, 60000);
  // coarse aggregate: bigger speckles both lighter and darker
  for (let i = 0; i < 9000; i++) {
    const l = Math.random() < 0.5;
    const v = l ? 30 + Math.random() * 40 : -(20 + Math.random() * 30);
    ctx.fillStyle = `rgba(${o.base[0] + v},${o.base[1] + v},${o.base[2] + v},${0.25 + Math.random() * 0.35})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  // large soft tonal blotches so the surface does not look like a uniform field
  for (let i = 0; i < 14; i++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    const v = (Math.random() - 0.5) * 22;
    g.addColorStop(0, `rgba(${o.base[0] + v},${o.base[1] + v},${o.base[2] + v},0.45)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(Math.random() * w, Math.random() * h);
    ctx.scale(80 + Math.random() * 220, 160 + Math.random() * 420);
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  // wheel-track polish and centre grime
  if (o.tracks > 0) {
    const lanes = o.lanes === 'city' ? [0.14, 0.3, 0.7, 0.86] : [0.24, 0.76];
    for (const u of lanes) {
      const g = ctx.createLinearGradient((u - 0.09) * w, 0, (u + 0.09) * w, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, `rgba(0,0,0,${0.22 * o.tracks})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect((u - 0.09) * w, 0, 0.18 * w, h);
    }
  }
  // patches then cracks (cracks run over patches too)
  for (let i = 0; i < o.patches; i++) {
    tarPatch(
      ctx,
      w * (0.08 + Math.random() * 0.84),
      Math.random() * h,
      40 + Math.random() * 110,
      60 + Math.random() * 160,
      Math.max(8, o.base[0] - 18 - Math.random() * 12),
    );
  }
  for (let i = 0; i < o.cracks; i++) {
    crack(ctx, Math.random() * w, Math.random() * h, 120 + Math.random() * 260, w);
  }
  // edge dirt, both sides, uneven
  const e = o.edge;
  const ew = w * e.width;
  for (const side of [0, 1]) {
    const x0 = side === 0 ? 0 : w - ew;
    const g = ctx.createLinearGradient(side === 0 ? 0 : w, 0, side === 0 ? ew : w - ew, 0);
    g.addColorStop(0, `rgba(${e.rgb[0]},${e.rgb[1]},${e.rgb[2]},${e.strength})`);
    g.addColorStop(0.55, `rgba(${e.rgb[0]},${e.rgb[1]},${e.rgb[2]},${e.strength * 0.35})`);
    g.addColorStop(1, `rgba(${e.rgb[0]},${e.rgb[1]},${e.rgb[2]},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x0, 0, ew, h);
    // ragged edge: broken asphalt bites
    for (let i = 0; i < 26; i++) {
      const y = Math.random() * h;
      const r = 6 + Math.random() * 22;
      ctx.fillStyle = `rgba(${e.rgb[0]},${e.rgb[1]},${e.rgb[2]},${0.35 + Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(side === 0 ? -r * 0.4 : w + r * 0.4, y, r * 1.4, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // paint
  const white = `rgba(228,226,216,${0.92 - o.wear * 0.45})`;
  if (o.lanes === 'two') {
    wornStripe(ctx, w * 0.035, 0, w * 0.018, h, white, o.wear);
    wornStripe(ctx, w * 0.947, 0, w * 0.018, h, white, o.wear);
    // 3 m dash, 5 m gap, twice per 16 m
    for (const y of [0.05, 0.55]) {
      wornStripe(ctx, w * 0.49, h * y, w * 0.02, h * (y + 0.1875), white, o.wear * 1.3);
    }
  } else if (o.lanes === 'city') {
    const med = o.median ?? 0.14;
    wornStripe(ctx, w * 0.018, 0, w * 0.008, h, white, o.wear);
    wornStripe(ctx, w * 0.974, 0, w * 0.008, h, white, o.wear);
    // concrete median with chipped yellow-black kerb paint
    const mx = w * (0.5 - med / 2);
    ctx.fillStyle = 'rgb(122,118,110)';
    ctx.fillRect(mx, 0, w * med, h);
    for (let i = 0; i < 400; i++) {
      const v = 100 + Math.random() * 50;
      ctx.fillStyle = `rgba(${v},${v - 4},${v - 12},0.5)`;
      ctx.fillRect(mx + Math.random() * w * med, Math.random() * h, 3, 3 + Math.random() * 6);
    }
    for (const kx of [mx, mx + w * med - w * 0.012]) {
      for (let y = 0; y < h; y += 60) {
        ctx.fillStyle = (y / 60) % 2 === 0 ? 'rgba(232,200,60,0.85)' : 'rgba(20,20,20,0.85)';
        ctx.fillRect(kx, y, w * 0.012, 60);
      }
    }
    // lane dividers between inner and outer lane on each side
    for (const u of [0.22, 0.78]) {
      for (const y of [0.05, 0.55])
        wornStripe(ctx, w * u, h * y, w * 0.006, h * (y + 0.1875), white, o.wear * 1.5);
    }
    // a faded "SLOW" style transverse bar now and then
    if (Math.random() < 0.6) {
      ctx.fillStyle = `rgba(228,226,216,${0.25 - o.wear * 0.1})`;
      ctx.fillRect(w * 0.53, h * 0.3, w * 0.42, 14);
    }
  }
  return finish(c);
}

/** Two-lane state highway: worn paint, cracks, tar patches, dusty verges. */
export function asphaltTexture(): CanvasTexture {
  return roadTexture({
    base: [54, 55, 58],
    spread: 34,
    wear: 0.55,
    cracks: 14,
    patches: 5,
    tracks: 0.8,
    edge: { rgb: [118, 104, 82], strength: 0.42, width: 0.09 },
    lanes: 'two',
  });
}

/** Ghat road after rain: darker, mossy verges, more patching. */
export function wetGhatAsphaltTexture(): CanvasTexture {
  return roadTexture({
    base: [40, 42, 44],
    spread: 30,
    wear: 0.7,
    cracks: 10,
    patches: 8,
    tracks: 0.9,
    edge: { rgb: [70, 86, 52], strength: 0.5, width: 0.1 },
    lanes: 'two',
  });
}

/** Dusty mountain highway: faded, broken edges, gravel creeping in, lots of patches. */
export function dustyAsphaltTexture(): CanvasTexture {
  return roadTexture({
    base: [96, 92, 86],
    spread: 42,
    wear: 0.9,
    cracks: 22,
    patches: 7,
    tracks: 0.5,
    edge: { rgb: [156, 140, 112], strength: 0.7, width: 0.16 },
    lanes: 'two',
  });
}

/** Ring road: six lanes, concrete median, heavy wheel polish and patching. */
export function cityAsphaltTexture(): CanvasTexture {
  return roadTexture({
    base: [48, 49, 52],
    spread: 26,
    wear: 0.6,
    cracks: 12,
    patches: 9,
    tracks: 1,
    edge: { rgb: [96, 90, 80], strength: 0.4, width: 0.05 },
    lanes: 'city',
    median: 0.14,
  });
}

/** Service road: narrow, no centre line, badly kept. */
export function serviceAsphaltTexture(): CanvasTexture {
  return roadTexture({
    base: [66, 64, 62],
    spread: 40,
    wear: 1,
    cracks: 20,
    patches: 10,
    tracks: 0.6,
    edge: { rgb: [110, 98, 82], strength: 0.6, width: 0.14 },
    lanes: 'none',
    size: [512, 1024],
  });
}

export function gravelTexture(): CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  noiseFill(ctx, 512, 512, [128, 116, 98], 70, 30000);
  for (let i = 0; i < 700; i++) {
    const v = 90 + Math.random() * 90;
    ctx.fillStyle = `rgba(${v},${v - 8},${v - 22},0.8)`;
    ctx.beginPath();
    ctx.ellipse(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 4, 1.5 + Math.random() * 3, Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

export function groundTexture(): CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  noiseFill(ctx, 512, 512, [96, 112, 62], 60, 30000);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(${70 + Math.random() * 40},${80 + Math.random() * 30},${40 + Math.random() * 20},0.35)`;
    ctx.beginPath();
    ctx.ellipse(
      Math.random() * 512,
      Math.random() * 512,
      8 + Math.random() * 28,
      6 + Math.random() * 18,
      Math.random() * 3,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  return finish(c, 4);
}

/** Coarse sand / laterite for beach shoulders. */
export function sandTexture(): CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  noiseFill(ctx, 512, 512, [196, 168, 128], 50, 30000);
  return finish(c);
}

// ------------------------------------------------------------------------------ decals ------

export type DecalKind = 'patch' | 'cracks' | 'oil' | 'pothole';

/** Alpha decal laid over the road ribbon so wear is not locked to the texture repeat. */
export function decalTexture(kind: DecalKind): CanvasTexture {
  const s = 256;
  const [c, ctx] = canvas(s, s);
  ctx.clearRect(0, 0, s, s);
  switch (kind) {
    case 'patch': {
      tarPatch(ctx, s / 2, s / 2, s * 0.4, s * 0.42, 26);
      for (let i = 0; i < 600; i++) {
        const v = 20 + Math.random() * 30;
        ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * s * 0.36;
        ctx.fillRect(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, 2, 2);
      }
      break;
    }
    case 'cracks': {
      for (let i = 0; i < 4; i++)
        crack(ctx, s * 0.3 + Math.random() * s * 0.4, s * 0.3 + Math.random() * s * 0.4, 110, 1e9);
      break;
    }
    case 'oil': {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.45);
      g.addColorStop(0, 'rgba(10,10,12,0.55)');
      g.addColorStop(0.6, 'rgba(14,14,16,0.25)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      break;
    }
    case 'pothole': {
      // shallow crumble ring: not a hazard, just cosmetics on the verge
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r = s * (0.28 + Math.random() * 0.1);
        const px = s / 2 + Math.cos(a) * r;
        const py = s / 2 + Math.sin(a) * r * 0.8;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(70,62,52,0.9)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,140,124,0.5)';
      ctx.lineWidth = 6;
      ctx.stroke();
      for (let i = 0; i < 300; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = s * (0.2 + Math.random() * 0.25);
        ctx.fillStyle = `rgba(${120 + Math.random() * 60},${110 + Math.random() * 50},${90 + Math.random() * 40},0.7)`;
        ctx.fillRect(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r * 0.8, 2, 2);
      }
      break;
    }
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ------------------------------------------------------------------------------ signs -------

export type SignStyle = 'nh' | 'bro' | 'kerala' | 'city';

/**
 * Route signs by authority: NH green boards, BRO yellow boards with black text (Ladakh), Kerala
 * PWD blue/white informatory boards, and blue city direction boards. All get a little grime.
 */
export function signTexture(label: string, style: SignStyle = 'nh'): CanvasTexture {
  const w = 512;
  const h = 256;
  const [c, ctx] = canvas(w, h);
  const palette = {
    nh: { bg: '#0f5f3a', fg: '#f2f2ee', border: '#e8e8e2' },
    bro: { bg: '#e6b41e', fg: '#141414', border: '#141414' },
    kerala: { bg: '#123e8a', fg: '#f4f4f0', border: '#f4f4f0' },
    city: { bg: '#1b4f9c', fg: '#f6f6f2', border: '#f6f6f2' },
  }[style];
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = style === 'bro' ? 14 : 10;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.fillStyle = palette.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = label.split('\n');
  const size = lines.length > 1 ? 66 : label.length > 12 ? 62 : 84;
  ctx.font = `bold ${size}px "Helvetica Neue", Arial, sans-serif`;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.1));
  if (style === 'bro') {
    ctx.font = 'bold 26px "Helvetica Neue", Arial, sans-serif';
    ctx.fillText('B R O · PROJECT HIMANK', w / 2, h - 34);
  }
  // rust streaks / dust so it does not look freshly printed
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(80,60,40,${0.05 + Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 30, 1 + Math.random() * 3);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------------------------ foliage -----

/** Grass / shrub billboard: alpha-cut blades on a transparent canvas. `dry` = Ladakh scrub. */
export function grassBillboardTexture(shrub = false, dry = false): CanvasTexture {
  const w = 256;
  const h = 256;
  const [c, ctx] = canvas(w, h);
  ctx.clearRect(0, 0, w, h);
  const blades = shrub ? 90 : 46;
  for (let i = 0; i < blades; i++) {
    const x0 = w * (0.15 + Math.random() * 0.7);
    const height = h * (shrub ? 0.35 + Math.random() * 0.5 : 0.45 + Math.random() * 0.5);
    const lean = (Math.random() - 0.5) * (shrub ? 120 : 60);
    if (dry) {
      const t = 100 + Math.random() * 70;
      ctx.strokeStyle = `rgb(${t},${t - 18},${t - 55})`;
    } else {
      const g = 90 + Math.random() * 70;
      ctx.strokeStyle = `rgb(${40 + Math.random() * 30},${g},${30 + Math.random() * 25})`;
    }
    ctx.lineWidth = shrub ? (dry ? 3 : 6) + Math.random() * (dry ? 4 : 8) : 3 + Math.random() * 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, h);
    ctx.quadraticCurveTo(x0 + lean * 0.3, h - height * 0.6, x0 + lean, h - height);
    ctx.stroke();
    if (shrub) {
      ctx.fillStyle = dry
        ? `rgba(${120 + Math.random() * 40},${105 + Math.random() * 30},${60},0.85)`
        : `rgba(${50 + Math.random() * 30},${100 + Math.random() * 60},${35},0.9)`;
      ctx.beginPath();
      ctx.ellipse(
        x0 + lean,
        h - height,
        (dry ? 6 : 10) + Math.random() * (dry ? 8 : 12),
        (dry ? 5 : 7) + Math.random() * 8,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ------------------------------------------------------------------------------ buildings ---

/**
 * Building facade: rows of windows; emissive variant lights a random subset. `style` picks a
 * glass tech-park grid or a plastered apartment block with balconies and AC units.
 */
export function facadeTexture(emissive: boolean, style: 'glass' | 'flats' = 'glass'): CanvasTexture {
  const w = 512;
  const h = 1024;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = emissive ? '#000' : style === 'glass' ? '#7f858c' : '#b9ae9c';
  ctx.fillRect(0, 0, w, h);
  const cols = style === 'glass' ? 8 : 5;
  const rows = 16;
  const cw = w / cols;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = Math.random() < (style === 'glass' ? 0.5 : 0.35);
      if (emissive) {
        if (!lit) continue;
        const warm = Math.random() < (style === 'glass' ? 0.4 : 0.85);
        ctx.fillStyle = warm
          ? `rgb(${230 + Math.random() * 25},${170 + Math.random() * 50},${100 + Math.random() * 50})`
          : `rgb(${150 + Math.random() * 40},${200},${255})`;
      } else {
        const t = style === 'glass' ? 60 + Math.random() * 40 : 40 + Math.random() * 30;
        ctx.fillStyle = `rgb(${t},${t + 15},${t + 30})`;
      }
      if (style === 'glass') ctx.fillRect(col * cw + cw * 0.08, r * rh + rh * 0.12, cw * 0.84, rh * 0.7);
      else ctx.fillRect(col * cw + cw * 0.22, r * rh + rh * 0.25, cw * 0.56, rh * 0.45);
    }
  }
  if (!emissive) {
    if (style === 'glass') {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let r = 0; r < rows; r++) ctx.fillRect(0, r * rh, w, 3);
      for (let col = 0; col < cols; col++) ctx.fillRect(col * cw, 0, 2, h);
    } else {
      // balcony slabs, rails, AC units, water stains
      for (let r = 0; r < rows; r++) {
        ctx.fillStyle = 'rgba(70,64,56,0.55)';
        ctx.fillRect(0, r * rh + rh * 0.72, w, 5);
        for (let col = 0; col < cols; col++) {
          if (Math.random() < 0.5) {
            ctx.fillStyle = 'rgba(60,60,64,0.8)';
            ctx.fillRect(col * cw + cw * 0.1, r * rh + rh * 0.55, cw * 0.8, rh * 0.18);
          }
          if (Math.random() < 0.3) {
            ctx.fillStyle = 'rgba(230,230,228,0.9)';
            ctx.fillRect(col * cw + cw * 0.78, r * rh + rh * 0.3, cw * 0.14, rh * 0.18);
          }
        }
      }
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = `rgba(60,50,40,${0.05 + Math.random() * 0.1})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 6 + Math.random() * 20, 40 + Math.random() * 200);
      }
    }
  }
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------------------------ masonry -----

/** Random rubble / laterite stone wall as used for ghat retaining walls. */
export function stoneWallTexture(tint: [number, number, number] = [116, 108, 96]): CanvasTexture {
  const w = 512;
  const h = 256;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = `rgb(${tint[0] - 40},${tint[1] - 40},${tint[2] - 36})`;
  ctx.fillRect(0, 0, w, h);
  let y = 0;
  while (y < h) {
    const rowH = 26 + Math.random() * 22;
    let x = -10;
    while (x < w) {
      const sw = 34 + Math.random() * 50;
      const v = (Math.random() - 0.5) * 50;
      ctx.fillStyle = `rgb(${tint[0] + v},${tint[1] + v},${tint[2] + v * 0.9})`;
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, sw - 4, rowH - 4, 5);
      ctx.fill();
      // moss / damp in the joints
      if (Math.random() < 0.3) {
        ctx.fillStyle = 'rgba(60,90,40,0.35)';
        ctx.fillRect(x + 2, y + rowH - 8, sw * 0.6, 5);
      }
      x += sw;
    }
    y += rowH;
  }
  return finish(c, 4);
}

/** Whitewashed parapet with a black band, chipped. */
export function parapetTexture(): CanvasTexture {
  const w = 256;
  const h = 128;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#e8e6df';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, h * 0.62, w, h * 0.38);
  for (let i = 0; i < 300; i++) {
    const v = 120 + Math.random() * 80;
    ctx.fillStyle = `rgba(${v},${v - 6},${v - 16},${0.15 + Math.random() * 0.3})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 1 + Math.random() * 3);
  }
  return finish(c, 4);
}

/** Bare, streaked concrete for metro piers and viaduct decks. */
export function concreteTexture(): CanvasTexture {
  const [c, ctx] = canvas(256, 512);
  noiseFill(ctx, 256, 512, [150, 148, 142], 34, 14000);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(70,66,60,${0.05 + Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * 256, 0, 2 + Math.random() * 8, 80 + Math.random() * 400);
  }
  // form-work seams
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < 512; y += 128) ctx.fillRect(0, y, 256, 3);
  return finish(c, 4);
}
