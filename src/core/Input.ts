export interface InputState {
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  /** -1 (left) .. 1 (right) */
  steer: number;
  handbrake: boolean;
}

type ActionKey = 'up' | 'down' | 'left' | 'right' | 'space';

const KEYMAP: Record<string, ActionKey> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'space',
};

/**
 * Keyboard + touch input. Touch buttons call `setVirtual` so the on-screen controls and
 * the keyboard share one code path.
 */
export class Input {
  private keys = new Set<ActionKey>();
  private virtual = new Set<ActionKey>();
  private listeners = new Map<string, Set<() => void>>();

  readonly state: InputState = { throttle: 0, brake: 0, steer: 0, handbrake: false };

  constructor(private target: Window = window) {
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('blur', this.clear);
  }

  /** Fire-once actions (reset, camera, pause, ...) */
  on(code: string, fn: () => void): void {
    if (!this.listeners.has(code)) this.listeners.set(code, new Set());
    this.listeners.get(code)!.add(fn);
  }

  setVirtual(action: ActionKey, active: boolean): void {
    if (active) this.virtual.add(action);
    else this.virtual.delete(action);
  }

  /** Smoothly integrate raw key state into analog-ish values. */
  update(dt: number): void {
    const has = (a: ActionKey) => this.keys.has(a) || this.virtual.has(a);
    const s = this.state;
    const steerTarget = (has('right') ? 1 : 0) - (has('left') ? 1 : 0);
    // Steering ramps in over ~0.18s and centres faster, which feels much better than a
    // hard -1/0/1 toggle on a bike.
    const rate = steerTarget === 0 ? 12 : 6;
    s.steer += (steerTarget - s.steer) * Math.min(1, rate * dt);
    if (Math.abs(s.steer) < 0.001) s.steer = 0;

    const throttleTarget = has('up') ? 1 : 0;
    s.throttle += (throttleTarget - s.throttle) * Math.min(1, 8 * dt);
    s.brake = has('down') ? 1 : 0;
    s.handbrake = has('space');
  }

  private isActive(a: ActionKey) {
    return this.keys.has(a) || this.virtual.has(a);
  }

  get anyDriveInput(): boolean {
    return this.isActive('up') || this.isActive('down');
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
    const action = KEYMAP[e.code];
    if (action) {
      this.keys.add(action);
      e.preventDefault();
    }
    if (!e.repeat) {
      const fns = this.listeners.get(e.code);
      if (fns) {
        e.preventDefault();
        fns.forEach((fn) => fn());
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const action = KEYMAP[e.code];
    if (action) this.keys.delete(action);
  };

  private clear = () => {
    this.keys.clear();
  };

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.clear);
  }
}
