import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

function noiseFill(
  ctx: CanvasRenderingContext2D,
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

/** One 8 m stretch of two-lane asphalt: solid edge lines, dashed centre line. */
export function asphaltTexture(): CanvasTexture {
  const w = 512;
  const h = 1024;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  noiseFill(ctx, w, h, [52, 54, 58], 34, 26000);
  // Worn tyre tracks
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.22, 'rgba(0,0,0,0.18)');
  grad.addColorStop(0.35, 'rgba(0,0,0,0)');
  grad.addColorStop(0.65, 'rgba(0,0,0,0)');
  grad.addColorStop(0.78, 'rgba(0,0,0,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Edge lines
  ctx.fillStyle = 'rgba(232,232,226,0.9)';
  ctx.fillRect(w * 0.035, 0, w * 0.018, h);
  ctx.fillRect(w * 0.947, 0, w * 0.018, h);
  // Dashed centre line: 3 m dash, 5 m gap within the 8 m tile.
  ctx.fillStyle = 'rgba(240,236,220,0.92)';
  ctx.fillRect(w * 0.49, h * 0.1, w * 0.02, h * 0.375);
  return finish(c);
}

export function gravelTexture(): CanvasTexture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d')!;
  noiseFill(ctx, s, s, [128, 116, 98], 70, 30000);
  return finish(c);
}

export function groundTexture(): CanvasTexture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d')!;
  noiseFill(ctx, s, s, [96, 112, 62], 60, 30000);
  // Scrub patches
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(${70 + Math.random() * 40},${80 + Math.random() * 30},${40 + Math.random() * 20},0.35)`;
    ctx.beginPath();
    ctx.ellipse(
      Math.random() * s,
      Math.random() * s,
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

/** Simple green route sign board with white text. */
export function signTexture(label: string): CanvasTexture {
  const w = 512;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0f5f3a';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e8e8e2';
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.fillStyle = '#f2f2ee';
  ctx.font = 'bold 84px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, w / 2, h / 2);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
