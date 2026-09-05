import type { RunStats } from '../game/Run';
import { MODE_LABEL, type GameMode } from '../game/Run';

export interface CardData {
  mode: GameMode;
  sceneName: string;
  scenePlace: string;
  previewUrl: string;
  score: number;
  stats: RunStats;
  protection: number;
  handle: string;
  shareUrl: string;
  rank?: string | null;
  streak?: number;
}

const W = 1200;
const H = 630;

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Renders the 1200×630 result card (Open Graph size, so it also previews well as a link).
 * Pure canvas 2D: no fonts to load, no layout to wait for.
 */
export async function renderCard(d: CardData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const font = (weight: number, size: number, mono = false) =>
    `${weight} ${size}px ${mono ? '"JetBrains Mono", "SF Mono", Menlo, monospace' : 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif'}`;

  // Background: scene still with a dark gradient for legibility.
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, W, H);
  const img = await loadImage(d.previewUrl);
  if (img) {
    const scale = Math.max(W / img.width, H / img.height);
    const iw = img.width * scale;
    const ih = img.height * scale;
    ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
  }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(6,8,11,0.35)');
  g.addColorStop(0.55, 'rgba(6,8,11,0.55)');
  g.addColorStop(1, 'rgba(6,8,11,0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(W * 0.5, H * 1.1, 50, W * 0.5, H * 1.1, 900);
  g2.addColorStop(0, 'rgba(255,90,31,0.28)');
  g2.addColorStop(1, 'rgba(255,90,31,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);

  // Brand
  ctx.fillStyle = '#ff5a1f';
  ctx.beginPath();
  ctx.arc(70, 66, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = font(700, 22);
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '6px';
  ctx.fillText('BIKE RIDER', 92, 66);
  ctx.letterSpacing = '0px';

  // Mode + scene
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = font(600, 22);
  ctx.letterSpacing = '3px';
  ctx.fillText(`${MODE_LABEL[d.mode].toUpperCase()} · ${d.sceneName.toUpperCase()}`, 60, 176);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#ffb428';
  ctx.font = font(500, 20);
  ctx.fillText(d.scenePlace, 60, 208);

  // Score
  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, 168, true);
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '-8px';
  ctx.fillText(fmt(d.score), 52, 380);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = font(600, 22);
  ctx.textBaseline = 'middle';
  ctx.fillText('POINTS', 60, 412);
  if (d.rank) {
    ctx.fillStyle = '#ffb428';
    ctx.font = font(700, 24);
    ctx.fillText(d.rank, 170, 412);
  }

  // Stats tiles
  const tiles: [string, string][] = [
    [(d.stats.distanceM / 1000).toFixed(2), 'km'],
    [String(Math.round(d.stats.topKmh)), 'top km/h'],
    [String(d.stats.nearMisses), 'near misses'],
    [`×${Math.max(1, d.stats.bestCombo)}`, 'best combo'],
    [`${d.protection}`, 'protection'],
  ];
  const tw = 196;
  const th = 96;
  const ty = 440;
  tiles.forEach(([v, l], i) => {
    const x = 60 + i * (tw + 14);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, x, ty, tw, th, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = font(700, 36, true);
    ctx.fillText(v, x + 20, ty + 40);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = font(600, 15);
    ctx.letterSpacing = '2px';
    ctx.fillText(l.toUpperCase(), x + 20, ty + 72);
    ctx.letterSpacing = '0px';
  });

  // Right column: rider handle + streak + URL
  ctx.textAlign = 'right';
  if (d.handle) {
    ctx.fillStyle = '#ffffff';
    ctx.font = font(700, 28);
    ctx.fillText(d.handle, W - 60, 66);
  }
  if (d.streak && d.streak > 1) {
    ctx.fillStyle = '#ff5a1f';
    ctx.font = font(700, 22);
    ctx.fillText(`🔥 ${d.streak}-day streak`, W - 60, 176);
  }
  // Link (host + path only; the seed travels in the shared text).
  const shown = d.shareUrl.replace(/^https?:\/\//, '').replace(/[?#].*$/, '');
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = font(500, 18);
  ctx.fillText('Beat it at', W - 60, H - 52);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(600, 20, true);
  ctx.fillText(shown, W - 60, H - 26);
  ctx.textAlign = 'left';

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
}

export type ShareOutcome = 'shared' | 'copied-image' | 'copied-link' | 'downloaded' | 'failed';

/**
 * Best available sharing path: native share sheet with the image (mobile), otherwise copy the
 * image to the clipboard, otherwise copy the link, otherwise download the PNG.
 */
export async function shareCard(blob: Blob, text: string, url: string): Promise<ShareOutcome> {
  const file = new File([blob], 'bike-rider-run.png', { type: 'image/png' });
  try {
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text, url });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'failed';
  }
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Bike Rider', text, url });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'failed';
  }
  const withTimeout = <T>(p: Promise<T>, ms: number) =>
    Promise.race<T>([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ]);
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await withTimeout(
        navigator.clipboard.write([
          new ClipboardItem({
            'image/png': blob,
            'text/plain': new Blob([`${text} ${url}`], { type: 'text/plain' }),
          }),
        ]),
        4000,
      );
      return 'copied-image';
    }
  } catch {
    /* fall through */
  }
  try {
    await withTimeout(navigator.clipboard!.writeText(`${text} ${url}`), 3000);
    return 'copied-link';
  } catch {
    /* fall through */
  }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bike-rider-run.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
