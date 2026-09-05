import type { Input } from '../core/Input';
import {
  isTouchDevice,
  type CameraMode,
  type Quality,
  type Settings,
  type TimeOfDay,
  type Units,
} from '../core/settings';
import type { Surface } from '../game/BikePhysics';
import { CAMERA_LABELS } from '../game/ChaseCamera';

export interface HudData {
  speedKmh: number;
  gear: number;
  rpm: number;
  surface: Surface;
  offRoute: boolean;
  distanceKm: number;
  fps: number;
  moving: boolean;
}

export interface HudCallbacks {
  onReset: () => void;
  onTogglePause: () => void;
  onCycleCamera: () => void;
  onSettingsChange: (s: Settings) => void;
  onOpenScenes: () => void;
  onQuitRun: () => void;
}

const ICONS = {
  camera:
    '<svg viewBox="0 0 24 24"><path d="M4 7h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="12.5" r="3.2"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v5h5"/></svg>',
  sound:
    '<svg viewBox="0 0 24 24"><path d="M4 10v4h3l4 3V7l-4 3zM15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  soundOff:
    '<svg viewBox="0 0 24 24"><path d="M4 10v4h3l4 3V7l-4 3zM15 9.5l5 5M20 9.5l-5 5"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z"/></svg>',
  scenes:
    '<svg viewBox="0 0 24 24"><path d="M3 17l5-7 4 5 3-3 6 5z"/><circle cx="17" cy="7" r="2"/></svg>',
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/**
 * All 2D overlay UI: HUD readouts, icon buttons, settings sheet, pause overlay and the touch
 * controls. Pure DOM, no framework.
 */
export class Hud {
  readonly root: HTMLElement;
  private speedEl: HTMLElement;
  private unitEl: HTMLElement;
  private gearEl: HTMLElement;
  private rpmFill: HTMLElement;
  private surfaceEl: HTMLElement;
  private distEl: HTMLElement;
  private fpsEl: HTMLElement;
  private protectEl: HTMLElement;
  private cameraBtn: HTMLButtonElement;
  private cameraLabel: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  private soundBtn: HTMLButtonElement;
  private pauseOverlay: HTMLElement;
  private settingsPanel: HTMLElement;
  private offRouteEl: HTMLElement;
  private statusEl: HTMLElement;
  private startHint: HTMLElement;
  private touchEl: HTMLElement;
  private settings: Settings;
  private hintDismissed = false;
  private lastSpeedText = '';
  private scoreEl: HTMLElement;
  private comboEl: HTMLElement;
  private comboFill: HTMLElement;
  private healthFill: HTMLElement;
  private healthWrap: HTMLElement;
  private modeChip: HTMLElement;
  private countdownEl: HTMLElement;
  private bonusWrap: HTMLElement;
  private runCluster: HTMLElement;
  private lastScoreText = '';
  private perf = false;

  constructor(
    parent: HTMLElement,
    settings: Settings,
    private input: Input,
    private cb: HudCallbacks,
  ) {
    this.settings = settings;
    this.root = el('div', 'hud');
    parent.appendChild(this.root);

    // --- top-left: identity + route ------------------------------------------------
    const tl = el('div', 'hud-corner hud-tl');
    tl.appendChild(el('div', 'brand', '<span class="brand-dot"></span>BIKE RIDER'));
    tl.appendChild(el('div', 'brand-sub', 'Scram 411 · White Flame'));
    const route = el('div', 'chip-row');
    this.distEl = el('span', 'chip', '0.0 km');
    this.surfaceEl = el('span', 'chip chip-surface', 'Asphalt');
    this.fpsEl = el('span', 'chip chip-fps', '60 fps');
    this.protectEl = el('span', 'chip chip-protect', '');
    this.protectEl.title = 'Protection score from your riding gear';
    route.append(this.distEl, this.surfaceEl, this.protectEl, this.fpsEl);
    tl.appendChild(route);
    this.root.appendChild(tl);

    // --- top-right: icon buttons ----------------------------------------------------
    const tr = el('div', 'hud-corner hud-tr');
    this.cameraBtn = this.iconButton(ICONS.camera, 'Camera (C)', () => this.cb.onCycleCamera());
    this.cameraLabel = el('span', 'btn-label', CAMERA_LABELS[settings.cameraMode]);
    this.cameraBtn.appendChild(this.cameraLabel);
    this.cameraBtn.classList.add('btn-wide');
    this.pauseBtn = this.iconButton(ICONS.pause, 'Pause (P)', () => this.cb.onTogglePause());
    const resetBtn = this.iconButton(ICONS.reset, 'Reset bike (R)', () => this.cb.onReset());
    this.soundBtn = this.iconButton(
      settings.sound ? ICONS.sound : ICONS.soundOff,
      'Engine sound',
      () => {
        this.settings.sound = !this.settings.sound;
        this.soundBtn.innerHTML = this.settings.sound ? ICONS.sound : ICONS.soundOff;
        this.emitSettings();
      },
    );
    const settingsBtn = this.iconButton(ICONS.settings, 'Settings', () => this.toggleSettings());
    const scenesBtn = this.iconButton(ICONS.scenes, 'Change scene (Esc)', () =>
      this.cb.onOpenScenes(),
    );
    scenesBtn.appendChild(el('span', 'btn-label', 'Scenes'));
    scenesBtn.classList.add('btn-wide');
    tr.append(scenesBtn, this.cameraBtn, this.pauseBtn, resetBtn, this.soundBtn, settingsBtn);
    this.root.appendChild(tr);

    // --- top-centre: run cluster (score, combo, health) ------------------------------
    const tc = el('div', 'hud-corner hud-tc');
    this.runCluster = el('div', 'run-cluster');
    this.modeChip = el('div', 'run-mode', 'Ride');
    this.scoreEl = el('div', 'run-score', '0');
    const comboWrap = el('div', 'run-combo');
    this.comboEl = el('span', 'run-combo-text', '');
    const comboBar = el('div', 'run-combo-bar');
    this.comboFill = el('div', 'run-combo-fill');
    comboBar.appendChild(this.comboFill);
    comboWrap.append(this.comboEl, comboBar);
    this.healthWrap = el('div', 'run-health');
    this.healthWrap.title = 'Rider health';
    this.healthFill = el('div', 'run-health-fill');
    this.healthWrap.appendChild(this.healthFill);
    this.runCluster.append(this.modeChip, this.scoreEl, comboWrap, this.healthWrap);
    this.runCluster.hidden = true;
    tc.appendChild(this.runCluster);
    this.root.appendChild(tc);

    this.countdownEl = el('div', 'countdown');
    this.countdownEl.hidden = true;
    this.root.appendChild(this.countdownEl);
    this.bonusWrap = el('div', 'bonus-wrap');
    this.root.appendChild(this.bonusWrap);

    // --- bottom-left: speed cluster --------------------------------------------------
    const bl = el('div', 'hud-corner hud-bl');
    const cluster = el('div', 'cluster');
    const speedWrap = el('div', 'speed');
    this.speedEl = el('div', 'speed-value', '0');
    this.unitEl = el('div', 'speed-unit', settings.units === 'kmh' ? 'km/h' : 'mph');
    speedWrap.append(this.speedEl, this.unitEl);
    const gearWrap = el('div', 'gear');
    gearWrap.appendChild(el('div', 'gear-label', 'GEAR'));
    this.gearEl = el('div', 'gear-value', 'N');
    gearWrap.appendChild(this.gearEl);
    cluster.append(speedWrap, gearWrap);
    const rpm = el('div', 'rpm');
    this.rpmFill = el('div', 'rpm-fill');
    rpm.appendChild(this.rpmFill);
    rpm.appendChild(el('div', 'rpm-ticks'));
    bl.append(cluster, rpm);
    this.root.appendChild(bl);

    // --- bottom-centre: controls strip -----------------------------------------------
    const bc = el('div', 'hud-corner hud-bc');
    bc.innerHTML = `
      <div class="controls">
        <div class="ctl"><span class="key">W</span><span class="key">↑</span><em>Throttle</em></div>
        <div class="ctl"><span class="key">S</span><span class="key">↓</span><em>Brake</em></div>
        <div class="ctl"><span class="key">A</span><span class="key">D</span><em>Steer</em></div>
        <div class="ctl"><span class="key key-wide">Space</span><em>Quick brake</em></div>
        <div class="ctl"><span class="key">R</span><em>Reset</em></div>
        <div class="ctl"><span class="key">C</span><em>Camera</em></div>
        <div class="ctl"><span class="key">P</span><em>Pause</em></div>
        <div class="ctl"><span class="key">Esc</span><em>Scenes</em></div>
      </div>`;
    this.root.appendChild(bc);

    // --- hints ------------------------------------------------------------------------
    this.offRouteEl = el(
      'div',
      'toast toast-warn',
      'Off route · press <b>R</b> to get back on the road',
    );
    this.offRouteEl.hidden = true;
    this.root.appendChild(this.offRouteEl);
    this.statusEl = el('div', 'toast toast-status', '');
    this.statusEl.hidden = true;
    this.root.appendChild(this.statusEl);
    this.startHint = el(
      'div',
      'start-hint',
      '<span>Hold</span><span class="key">W</span><span>or</span><span class="key">↑</span><span>to ride</span>',
    );
    this.root.appendChild(this.startHint);

    // --- pause overlay ----------------------------------------------------------------
    this.pauseOverlay = el('div', 'overlay');
    this.pauseOverlay.hidden = true;
    this.pauseOverlay.innerHTML = `
      <div class="overlay-card">
        <div class="overlay-title">Paused</div>
        <p>Take a breather. Your bike is right where you left it.</p>
        <button class="btn-primary" data-action="resume">Resume</button>
        <button class="btn-ghost" data-action="reset">Reset bike</button>
        <button class="btn-ghost" data-action="quit">End run · change road</button>
      </div>`;
    this.pauseOverlay.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!t) return;
      if (t.dataset.action === 'resume') this.cb.onTogglePause();
      if (t.dataset.action === 'reset') {
        this.cb.onReset();
        this.cb.onTogglePause();
      }
      if (t.dataset.action === 'quit') this.cb.onQuitRun();
    });
    this.root.appendChild(this.pauseOverlay);

    // --- settings panel ---------------------------------------------------------------
    this.settingsPanel = this.buildSettings();
    this.root.appendChild(this.settingsPanel);

    // --- touch controls ---------------------------------------------------------------
    this.touchEl = this.buildTouch();
    this.root.appendChild(this.touchEl);
    this.applyTouchVisibility();
  }

  // -------------------------------------------------------------------------------------
  private iconButton(svg: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', 'icon-btn', svg);
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', (e) => {
      e.preventDefault();
      onClick();
      b.blur();
    });
    return b;
  }

  private buildSettings(): HTMLElement {
    const panel = el('div', 'sheet');
    panel.hidden = true;
    const segmented = <T extends string>(
      label: string,
      key: keyof Settings,
      opts: { v: T; l: string }[],
    ) => {
      const row = el('div', 'row');
      row.appendChild(el('div', 'row-label', label));
      const seg = el('div', 'seg');
      seg.dataset.key = key;
      for (const o of opts) {
        const b = el('button', 'seg-btn', o.l);
        b.type = 'button';
        b.dataset.value = o.v;
        if (this.settings[key] === o.v) b.classList.add('active');
        b.addEventListener('click', () => {
          (this.settings as unknown as Record<string, unknown>)[key] = o.v;
          seg.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          if (key === 'units') this.unitEl.textContent = o.v === 'kmh' ? 'km/h' : 'mph';
          if (key === 'touchControls') this.applyTouchVisibility();
          this.emitSettings();
        });
        seg.appendChild(b);
      }
      row.appendChild(seg);
      return row;
    };
    const head = el('div', 'sheet-head');
    head.appendChild(el('div', 'sheet-title', 'Settings'));
    head.appendChild(this.iconButton(ICONS.close, 'Close', () => this.toggleSettings(false)));
    panel.appendChild(head);
    panel.appendChild(
      segmented<Quality>('Quality', 'quality', [
        { v: 'low', l: 'Low' },
        { v: 'medium', l: 'Medium' },
        { v: 'high', l: 'High' },
      ]),
    );
    panel.appendChild(
      segmented<TimeOfDay>('Time of day', 'timeOfDay', [
        { v: 'auto', l: 'Scene' },
        { v: 'day', l: 'Noon' },
        { v: 'golden', l: 'Golden' },
        { v: 'night', l: 'Night' },
      ]),
    );
    panel.appendChild(
      segmented<CameraMode>('Camera', 'cameraMode', [
        { v: 'chase', l: 'Chase' },
        { v: 'cockpit', l: 'Cockpit' },
        { v: 'cinematic', l: 'Cinematic' },
      ]),
    );
    panel.appendChild(
      segmented<Units>('Units', 'units', [
        { v: 'kmh', l: 'km/h' },
        { v: 'mph', l: 'mph' },
      ]),
    );
    panel.appendChild(
      segmented<Settings['touchControls']>('Touch controls', 'touchControls', [
        { v: 'auto', l: 'Auto' },
        { v: 'on', l: 'On' },
        { v: 'off', l: 'Off' },
      ]),
    );
    panel.appendChild(
      el(
        'div',
        'sheet-foot',
        'Keyboard: WASD / arrows, Space brake, R reset, C camera, P pause, Esc scenes.',
      ),
    );
    return panel;
  }

  private buildTouch(): HTMLElement {
    const wrap = el('div', 'touch');
    const mk = (cls: string, html: string, action: 'left' | 'right' | 'up' | 'down') => {
      const b = el('div', `touch-btn ${cls}`, html);
      const on = (e: Event) => {
        e.preventDefault();
        this.input.setVirtual(action, true);
        b.classList.add('active');
      };
      const off = (e: Event) => {
        e.preventDefault();
        this.input.setVirtual(action, false);
        b.classList.remove('active');
      };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      return b;
    };
    const left = el('div', 'touch-group touch-left');
    left.append(mk('', '◀', 'left'), mk('', '▶', 'right'));
    const right = el('div', 'touch-group touch-right');
    right.append(mk('brake', 'BRAKE', 'down'), mk('gas', 'GAS', 'up'));
    wrap.append(left, right);
    return wrap;
  }

  private applyTouchVisibility(): void {
    const mode = this.settings.touchControls;
    const show = mode === 'on' || (mode === 'auto' && isTouchDevice());
    this.touchEl.hidden = !show;
    this.root.classList.toggle('has-touch', show);
  }

  private emitSettings(): void {
    this.cb.onSettingsChange({ ...this.settings });
  }

  setProtection(score: number, exposed: string[]): void {
    this.protectEl.innerHTML = `${ICONS.shield}${score}<small>/100</small>`;
    this.protectEl.dataset.level = score >= 75 ? 'high' : score >= 45 ? 'mid' : 'low';
    this.protectEl.title = exposed.length
      ? `Protection ${score}/100 · exposed: ${exposed.join(', ')}`
      : `Protection ${score}/100 · fully covered`;
  }

  // ------------------------------------------------------------------ run UI --------------
  /** Show / hide the score cluster. `label` is the mode name shown above the score. */
  setRun(scored: boolean, label = 'Ride'): void {
    this.runCluster.hidden = !scored;
    this.modeChip.textContent = label;
    this.root.classList.toggle('scored', scored);
    if (scored) {
      this.updateScore(0, 0, 0, 1);
      this.setHealth(1);
    }
  }

  updateScore(score: number, combo: number, comboFraction: number, mult: number): void {
    const txt = Math.round(score).toLocaleString('en-IN');
    if (txt !== this.lastScoreText) {
      this.scoreEl.textContent = txt;
      this.lastScoreText = txt;
    }
    const on = combo > 0;
    this.comboEl.textContent = on ? `×${mult} combo` : '';
    this.comboEl.parentElement!.classList.toggle('on', on);
    this.comboFill.style.transform = `scaleX(${comboFraction.toFixed(3)})`;
  }

  setHealth(hp: number): void {
    this.healthFill.style.transform = `scaleX(${Math.max(0, Math.min(1, hp)).toFixed(3)})`;
    this.healthWrap.dataset.level = hp > 0.6 ? 'high' : hp > 0.3 ? 'mid' : 'low';
  }

  /** Big centre text for the countdown / GO. Pass null to hide. */
  setCountdown(text: string | null): void {
    this.countdownEl.hidden = !text;
    if (text && this.countdownEl.textContent !== text) {
      this.countdownEl.textContent = text;
      this.countdownEl.classList.remove('pop');
      void this.countdownEl.offsetWidth;
      this.countdownEl.classList.add('pop');
    }
  }

  /** Floating bonus text ("Near miss ×3  +420"). */
  popBonus(label: string, points: number, kind: string): void {
    const pts = points === 0 ? '' : `<b>${points > 0 ? '+' : ''}${points}</b>`;
    const b = el('div', `bonus bonus-${kind}`, `<span>${label}</span>${pts}`);
    this.bonusWrap.appendChild(b);
    while (this.bonusWrap.children.length > 4) this.bonusWrap.firstElementChild?.remove();
    setTimeout(() => b.remove(), 1400);
  }

  /** Replace the start hint (null restores the default and re-arms it). */
  setHint(html: string | null): void {
    this.startHint.innerHTML =
      html ??
      '<span>Hold</span><span class="key">W</span><span>or</span><span class="key">↑</span><span>to ride</span>';
    this.startHint.classList.remove('gone');
    this.hintDismissed = false;
  }

  /** Red vignette flash on impact. */
  flashHit(): void {
    this.root.classList.remove('hit-flash');
    void this.root.offsetWidth;
    this.root.classList.add('hit-flash');
  }

  setPerf(on: boolean): void {
    this.perf = on;
    this.fpsEl.hidden = !on;
  }

  /** Transient status line (model loading etc.). Pass null to hide. */
  setStatus(text: string | null): void {
    this.statusEl.hidden = !text;
    if (text) this.statusEl.textContent = text;
  }

  toggleSettings(force?: boolean): void {
    const open = force ?? this.settingsPanel.hidden;
    this.settingsPanel.hidden = !open;
  }

  setMenuOpen(open: boolean): void {
    this.root.classList.toggle('menu-open', open);
    if (open) this.toggleSettings(false);
  }

  setPaused(paused: boolean): void {
    this.pauseOverlay.hidden = !paused;
    this.pauseBtn.innerHTML = paused ? ICONS.play : ICONS.pause;
    this.pauseBtn.title = paused ? 'Resume (P)' : 'Pause (P)';
    this.root.classList.toggle('paused', paused);
  }

  setCameraMode(mode: CameraMode): void {
    this.settings.cameraMode = mode;
    this.cameraLabel.textContent = CAMERA_LABELS[mode];
    this.settingsPanel
      .querySelectorAll<HTMLElement>('.seg[data-key="cameraMode"] .seg-btn')
      .forEach((b) => {
        b.classList.toggle('active', b.dataset.value === mode);
      });
  }

  update(d: HudData): void {
    const speed = this.settings.units === 'kmh' ? d.speedKmh : d.speedKmh * 0.621371;
    const txt = String(Math.round(speed));
    if (txt !== this.lastSpeedText) {
      this.speedEl.textContent = txt;
      this.lastSpeedText = txt;
    }
    const gear = d.gear === 0 ? 'N' : d.gear < 0 ? 'R' : String(d.gear);
    if (this.gearEl.textContent !== gear) this.gearEl.textContent = gear;
    this.rpmFill.style.transform = `scaleX(${d.rpm.toFixed(3)})`;
    this.rpmFill.classList.toggle('hot', d.rpm > 0.85);
    const surf =
      d.surface === 'asphalt'
        ? 'Asphalt'
        : d.surface === 'gravel'
          ? 'Gravel'
          : d.surface === 'wet'
            ? 'Wet'
            : 'Off-road';
    if (this.surfaceEl.textContent !== surf) {
      this.surfaceEl.textContent = surf;
      this.surfaceEl.dataset.surface = d.surface;
    }
    const dist = `${d.distanceKm.toFixed(1)} km`;
    if (this.distEl.textContent !== dist) this.distEl.textContent = dist;
    if (this.perf) {
      const fps = `${Math.round(d.fps)} fps`;
      if (this.fpsEl.textContent !== fps) this.fpsEl.textContent = fps;
    }
    this.offRouteEl.hidden = !d.offRoute;
    if (!this.hintDismissed && d.moving) {
      this.hintDismissed = true;
      this.startHint.classList.add('gone');
    }
  }
}
