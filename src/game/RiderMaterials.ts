import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

export type TextileKind = 'mesh' | 'weave' | 'leather' | 'denim';

/**
 * Small, shared textile tiles multiplied over the baked product colours. Tiles are kept
 * high-key (mean ~0.8 linear) so the catalogue colour survives; the same tile drives the bump.
 */
export function textileTexture(kind: TextileKind): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  let seed = 73;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v: number;
      if (kind === 'leather') {
        // pebbled grain: low-frequency cells + fine noise
        const cell =
          Math.sin(x * 0.55 + Math.sin(y * 0.31) * 2.1) *
          Math.cos(y * 0.47 + Math.sin(x * 0.23) * 1.7);
        v = 226 + cell * 9 + rnd() * 14;
      } else if (kind === 'denim') {
        // right-hand twill: diagonal ridges every 4px with a slight weft flicker
        const twill = ((x + y) % 4 < 2 ? 1 : 0) * 14;
        v = 218 + twill + rnd() * 12 - (y % 2) * 4;
      } else if (kind === 'weave') {
        // ripstop: fine plain weave with a stronger thread every 16px
        const warp = (x % 3 === 0 ? 6 : 0) + (y % 3 === 0 ? 6 : 0);
        const rip = x % 16 === 0 || y % 16 === 0 ? 12 : 0;
        v = 222 + warp + rip + rnd() * 10;
      } else {
        v = 236 + rnd() * 10;
      }
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (kind === 'mesh') {
    // air mesh: staggered hexagonal perforations with a soft bevel
    const pitch = 12;
    for (let row = 0; row * pitch * 0.87 < size + pitch; row++) {
      for (let col = 0; col * pitch < size + pitch; col++) {
        const cx = col * pitch + (row % 2 ? pitch / 2 : 0);
        const cy = row * pitch * 0.87;
        const g = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, 4.2);
        g.addColorStop(0, '#3a3a3a');
        g.addColorStop(0.75, '#4a4a4a');
        g.addColorStop(1, 'rgba(120,120,120,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const map = new CanvasTexture(canvas);
  map.wrapS = map.wrapT = RepeatWrapping;
  const repeat = kind === 'leather' ? 6 : kind === 'denim' ? 10 : kind === 'mesh' ? 9 : 12;
  map.repeat.set(repeat, repeat);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

/** Deterministic LCG so every texture is identical between sessions and machines. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Hair strands: a vertical streak field with clumps and a few darker, thinner strands. Used as
 * colour multiplier, bump and roughness so the same tile drives the anisotropic look. High-key
 * (mean ~0.82) so the chosen hair colour survives. Hair UVs are authored so v runs along strands.
 */
export function strandTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rnd = rng(911);
  const column = new Float32Array(size);
  for (let x = 0; x < size; x++) column[x] = 0.7 + rnd() * 0.3;
  // blur columns a little so strands are 2-3 px wide, then add a slow clump modulation
  const soft = new Float32Array(size);
  for (let x = 0; x < size; x++) {
    soft[x] =
      (column[(x + size - 1) % size]! + column[x]! * 2 + column[(x + 1) % size]!) / 4 +
      Math.sin(x * 0.13) * 0.05 +
      Math.sin(x * 0.041 + 1.3) * 0.06;
  }
  for (let y = 0; y < size; y++) {
    const along = 1 + Math.sin(y * 0.09) * 0.03;
    for (let x = 0; x < size; x++) {
      let v = soft[x]! * along;
      // sparse dark single strands drifting across the tile
      const drift = (x + Math.floor(y * 0.15)) % 37;
      if (drift === 0) v *= 0.55;
      if ((x * 7 + y) % 101 === 0) v *= 0.8;
      v = Math.max(0.35, Math.min(1, v));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(v * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = new CanvasTexture(canvas);
  map.wrapS = map.wrapT = RepeatWrapping;
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

/**
 * Iris: radial fibres, a lighter collarette ring around the pupil, a dark limbal ring at the
 * edge and a soft-edged black pupil. `hex` is the mid iris colour; dark brown by default.
 */
export function irisTexture(hex = '#3a2010'): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rnd = rng(1729);
  const r0 = parseInt(hex.slice(1, 3), 16);
  const g0 = parseInt(hex.slice(3, 5), 16);
  const b0 = parseInt(hex.slice(5, 7), 16);
  const spokes = new Float32Array(720);
  for (let i = 0; i < spokes.length; i++) spokes[i] = 0.75 + rnd() * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.hypot(dx, dy) * 2; // 1 at the disc edge
      const a = Math.atan2(dy, dx);
      const spoke = spokes[Math.floor(((a + Math.PI) / (2 * Math.PI)) * 719)]!;
      let k = Math.min(1.25, spoke * (0.8 + 0.3 * Math.sin(r * 21 + a * 3)));
      // collarette: lighter ring just outside the pupil
      k *= 1 + 0.45 * Math.exp(-(((r - 0.42) / 0.07) ** 2));
      // limbal ring
      k *= 1 - 0.75 * Math.max(0, (r - 0.82) / 0.18);
      // pupil with a soft edge
      const pupil = Math.min(1, Math.max(0, (r - 0.3) / 0.05));
      k *= pupil;
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, r0 * k);
      img.data[i + 1] = Math.min(255, g0 * k);
      img.data[i + 2] = Math.min(255, b0 * k);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

/**
 * Sclera: off-white that warms and darkens toward the back pole (v = 1 in the eye UVs), with a
 * few faint veins radiating from the back. Kept subtle: the lids cover most of it.
 */
export function scleraTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#ece6df');
  grad.addColorStop(0.45, '#ddd4cb');
  grad.addColorStop(1, '#b39c8e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const rnd = rng(4242);
  ctx.strokeStyle = 'rgba(170, 60, 50, 0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    let x = rnd() * size;
    let y = size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += (rnd() - 0.5) * 18;
      y -= 12 + rnd() * 14;
      ctx.lineTo(x, y);
      if (y < size * 0.35) break;
    }
    ctx.stroke();
  }
  const map = new CanvasTexture(canvas);
  map.wrapS = RepeatWrapping;
  map.colorSpace = SRGBColorSpace;
  return map;
}

/**
 * Brow cutout: an opaque band through the middle of the brow UV strip (v 0.43..0.57) whose
 * upper and lower edges feather into individual angled hairs. Used as alphaMap with alphaTest
 * so the solid shell reads as hair rather than a painted slab.
 */
export function browAlphaTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  // Smooth core band: opaque through the middle, fading over the outer 40 % of the shell so
  // alphaTest carves a clean curved edge instead of the shell's polygon steps.
  const band = ctx.createLinearGradient(0, size * 0.42, 0, size * 0.58);
  band.addColorStop(0, '#000');
  band.addColorStop(0.28, '#fff');
  band.addColorStop(0.72, '#fff');
  band.addColorStop(1, '#000');
  ctx.fillStyle = band;
  ctx.fillRect(0, size * 0.42, size, size * 0.16);
  // Fine wisps along both edges, denser at the head (u -> 0) than the tail.
  const rnd = rng(313);
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  for (let i = 0; i < 700; i++) {
    const u = rnd();
    if (rnd() < u * 0.6) continue;
    const dir = rnd() < 0.5 ? -1 : 1;
    const len = (0.012 + rnd() * 0.02) * size;
    const x0 = u * size;
    const y0 = size * (dir < 0 ? 0.462 : 0.538);
    ctx.lineWidth = 0.6 + rnd() * 0.5;
    ctx.globalAlpha = 0.5 + rnd() * 0.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + len * 0.7, y0 + dir * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const map = new CanvasTexture(canvas);
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  return map;
}
