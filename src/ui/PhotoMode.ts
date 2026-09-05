import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { TimeOfDay } from '../core/settings';

export interface PhotoCallbacks {
  onClose: () => void;
  onCapture: () => void;
  onTimeOfDay: (t: TimeOfDay) => void;
}

const _target = new Vector3();
const _pos = new Vector3();

/**
 * Photo mode: the sim freezes, HUD hides, and the camera becomes a free orbit around the bike
 * with drag / wheel / pinch, a time-of-day picker and an FOV slider. Capture composites the WebGL
 * frame with a small brand strip and hands it to share / download.
 */
export class PhotoMode {
  readonly root: HTMLElement;
  yaw = 0.7;
  pitch = 0.18;
  distance = 5.2;
  fov = 42;
  height = 0.75;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private pinch = 0;
  private onKey = (e: KeyboardEvent) => {
    if (this.root.hidden) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.cb.onClose();
    } else if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      this.cb.onCapture();
    }
  };

  constructor(
    parent: HTMLElement,
    private cb: PhotoCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'photo';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="photo-hint">Drag to orbit · wheel / pinch to zoom · <span class="key">Space</span> capture · <span class="key">Esc</span> close</div>
      <div class="photo-bar">
        <div class="seg photo-time">
          <button type="button" class="seg-btn" data-time="day">Day</button>
          <button type="button" class="seg-btn" data-time="golden">Golden</button>
          <button type="button" class="seg-btn" data-time="night">Night</button>
        </div>
        <label class="photo-slider">Lens <input type="range" min="24" max="80" value="42" /></label>
        <label class="photo-slider">Height <input type="range" min="0" max="100" value="35" data-h /></label>
        <button type="button" class="btn-primary photo-capture">Capture</button>
        <button type="button" class="btn-ghost photo-close">Close</button>
      </div>`;
    parent.appendChild(this.root);
    this.root.querySelector('.photo-capture')!.addEventListener('click', () => this.cb.onCapture());
    this.root.querySelector('.photo-close')!.addEventListener('click', () => this.cb.onClose());
    this.root.querySelectorAll<HTMLButtonElement>('[data-time]').forEach((b) =>
      b.addEventListener('click', () => {
        this.root.querySelectorAll('[data-time]').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        this.cb.onTimeOfDay(b.dataset.time as TimeOfDay);
      }),
    );
    const lens = this.root.querySelector<HTMLInputElement>('input[type=range]:not([data-h])')!;
    lens.addEventListener('input', () => (this.fov = Number(lens.value)));
    const h = this.root.querySelector<HTMLInputElement>('input[data-h]')!;
    h.addEventListener('input', () => (this.height = -0.2 + (Number(h.value) / 100) * 2.6));

    // Orbit input on the whole overlay (it sits above the canvas).
    this.root.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.photo-bar')) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.root.setPointerCapture(e.pointerId);
    });
    this.root.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw -= (e.clientX - this.lastX) * 0.006;
      this.pitch = MathUtils.clamp(this.pitch + (e.clientY - this.lastY) * 0.004, -0.15, 1.2);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    const stop = () => (this.dragging = false);
    this.root.addEventListener('pointerup', stop);
    this.root.addEventListener('pointercancel', stop);
    this.root.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.distance = MathUtils.clamp(this.distance * (1 + e.deltaY * 0.0012), 2.2, 14);
      },
      { passive: false },
    );
    this.root.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) this.pinch = touchDist(e);
    });
    this.root.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length === 2 && this.pinch > 0) {
          const d = touchDist(e);
          this.distance = MathUtils.clamp(this.distance * (this.pinch / d), 2.2, 14);
          this.pinch = d;
        }
      },
      { passive: true },
    );
    window.addEventListener('keydown', this.onKey, true);
  }

  show(time: TimeOfDay): void {
    this.root.hidden = false;
    this.root
      .querySelectorAll<HTMLElement>('[data-time]')
      .forEach((b) =>
        b.classList.toggle('active', b.dataset.time === (time === 'auto' ? 'day' : time)),
      );
  }

  hide(): void {
    this.root.hidden = true;
    this.dragging = false;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /** Place the camera on the orbit around `center`. */
  applyCamera(
    camera: PerspectiveCamera,
    center: Vector3,
    heightAt: (x: number, z: number) => number,
  ): void {
    _target.copy(center);
    _target.y += this.height;
    const r = this.distance;
    _pos.set(
      center.x + Math.sin(this.yaw) * Math.cos(this.pitch) * r,
      center.y + this.height + Math.sin(this.pitch) * r,
      center.z + Math.cos(this.yaw) * Math.cos(this.pitch) * r,
    );
    const ground = heightAt(_pos.x, _pos.z) + 0.25;
    if (_pos.y < ground) _pos.y = ground;
    camera.position.copy(_pos);
    camera.lookAt(_target);
    if (Math.abs(camera.fov - this.fov) > 0.01) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }
}

function touchDist(e: TouchEvent): number {
  const a = e.touches[0]!;
  const b = e.touches[1]!;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** Composite the live WebGL canvas with a brand strip. Call right after a render. */
export async function composePhoto(
  gl: HTMLCanvasElement,
  caption: string,
  sub: string,
): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = gl.width;
  c.height = gl.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(gl, 0, 0);
  const s = Math.max(1, c.width / 1280);
  const pad = 28 * s;
  const grad = ctx.createLinearGradient(0, c.height - 160 * s, 0, c.height);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, c.height - 160 * s, c.width, 160 * s);
  ctx.fillStyle = '#ff5a1f';
  ctx.beginPath();
  ctx.arc(pad + 7 * s, c.height - pad - 9 * s, 6 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `700 ${16 * s}px Inter, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${4 * s}px`;
  ctx.fillText('BIKE RIDER', pad + 22 * s, c.height - pad - 9 * s);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${26 * s}px Inter, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(caption, c.width - pad, c.height - pad - 22 * s);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `500 ${14 * s}px Inter, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(sub, c.width - pad, c.height - pad + 4 * s);
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92),
  );
}
