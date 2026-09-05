/**
 * Tiny synthesized single-cylinder engine note. Off by default: browsers require a user
 * gesture before audio can start, so we lazily create the context on first enable.
 */
export class EngineAudio {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private sub: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private enabled = false;

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) {
      this.ensure();
      void this.ctx?.resume();
    } else if (this.gain && this.ctx) {
      this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  private ensure(): void {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const sub = ctx.createOscillator();
    sub.type = 'square';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    sub.start();
    this.ctx = ctx;
    this.osc = osc;
    this.sub = sub;
    this.gain = gain;
    this.filter = filter;
  }

  update(rpm01: number, throttle: number, paused: boolean): void {
    if (!this.enabled || !this.ctx || !this.osc || !this.sub || !this.gain || !this.filter) return;
    const t = this.ctx.currentTime;
    // A 411cc single idles ~1300 rpm and redlines ~6500. Fundamental = rpm/60 (Hz).
    const rpm = 1300 + rpm01 * 5200;
    const f = rpm / 60;
    this.osc.frequency.setTargetAtTime(f * 2, t, 0.04);
    this.sub.frequency.setTargetAtTime(f, t, 0.04);
    this.filter.frequency.setTargetAtTime(350 + rpm01 * 1400 + throttle * 500, t, 0.05);
    const target = paused ? 0 : 0.035 + rpm01 * 0.05 + throttle * 0.03;
    this.gain.gain.setTargetAtTime(target, t, 0.08);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
