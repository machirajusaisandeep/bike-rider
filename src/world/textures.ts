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

/** Grass / shrub billboard: alpha-cut blades on a transparent canvas. */
export function grassBillboardTexture(shrub = false): CanvasTexture {
  const w = 256;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  const blades = shrub ? 90 : 46;
  for (let i = 0; i < blades; i++) {
    const x0 = w * (0.15 + Math.random() * 0.7);
    const height = h * (shrub ? 0.35 + Math.random() * 0.5 : 0.45 + Math.random() * 0.5);
    const lean = (Math.random() - 0.5) * (shrub ? 120 : 60);
    const g = 90 + Math.random() * 70;
    ctx.strokeStyle = `rgb(${40 + Math.random() * 30},${g},${30 + Math.random() * 25})`;
    ctx.lineWidth = shrub ? 6 + Math.random() * 8 : 3 + Math.random() * 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, h);
    ctx.quadraticCurveTo(x0 + lean * 0.3, h - height * 0.6, x0 + lean, h - height);
    ctx.stroke();
    if (shrub) {
      ctx.fillStyle = `rgba(${50 + Math.random() * 30},${g + 10},${35},0.9)`;
      ctx.beginPath();
      ctx.ellipse(
        x0 + lean,
        h - height,
        10 + Math.random() * 12,
        7 + Math.random() * 8,
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

/** Building facade: rows of windows; emissive variant lights a random subset. */
export function facadeTexture(emissive: boolean): CanvasTexture {
  const w = 512;
  const h = 1024;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = emissive ? '#000' : '#8e9298';
  ctx.fillRect(0, 0, w, h);
  const cols = 6;
  const rows = 16;
  const cw = w / cols;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = Math.random() < 0.45;
      if (emissive) {
        if (!lit) continue;
        const warm = Math.random() < 0.7;
        ctx.fillStyle = warm
          ? `rgb(${230 + Math.random() * 25},${180 + Math.random() * 40},${110 + Math.random() * 40})`
          : `rgb(${150},${200},${255})`;
      } else {
        const t = 60 + Math.random() * 40;
        ctx.fillStyle = `rgb(${t},${t + 15},${t + 30})`;
      }
      ctx.fillRect(col * cw + cw * 0.18, r * rh + rh * 0.22, cw * 0.64, rh * 0.5);
    }
  }
  if (!emissive) {
    // concrete banding between floors
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let r = 0; r < rows; r++) ctx.fillRect(0, r * rh, w, 3);
  }
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Wide 3-lane-per-side city road: lane dashes, edge lines. */
export function cityAsphaltTexture(): CanvasTexture {
  const w = 1024;
  const h = 1024;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  noiseFill(ctx, w, h, [46, 47, 50], 26, 40000);
  ctx.fillStyle = 'rgba(232,232,226,0.85)';
  ctx.fillRect(w * 0.02, 0, w * 0.008, h);
  ctx.fillRect(w * 0.972, 0, w * 0.008, h);
  // median double yellow
  ctx.fillStyle = 'rgba(240,200,60,0.9)';
  ctx.fillRect(w * 0.492, 0, w * 0.006, h);
  ctx.fillRect(w * 0.502, 0, w * 0.006, h);
  // lane dashes at 1/6 and 2/6 each side
  ctx.fillStyle = 'rgba(240,236,220,0.85)';
  for (const u of [0.18, 0.34, 0.66, 0.82]) ctx.fillRect(w * u, h * 0.1, w * 0.006, h * 0.375);
  return finish(c);
}

/** Dusty mountain highway: lighter, faded lines, cracks. */
export function dustyAsphaltTexture(): CanvasTexture {
  const w = 512;
  const h = 1024;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  noiseFill(ctx, w, h, [92, 88, 82], 40, 30000);
  ctx.strokeStyle = 'rgba(40,36,32,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    let x = Math.random() * w;
    let y = Math.random() * h;
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (Math.random() - 0.5) * 80;
      y += Math.random() * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(232,232,226,0.45)';
  ctx.fillRect(w * 0.035, 0, w * 0.018, h);
  ctx.fillRect(w * 0.947, 0, w * 0.018, h);
  ctx.fillStyle = 'rgba(240,236,220,0.5)';
  ctx.fillRect(w * 0.49, h * 0.1, w * 0.02, h * 0.375);
  return finish(c);
}

/** Coarse sand / laterite for beach shoulders. */
export function sandTexture(): CanvasTexture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d')!;
  noiseFill(ctx, s, s, [196, 168, 128], 50, 30000);
  return finish(c);
}
