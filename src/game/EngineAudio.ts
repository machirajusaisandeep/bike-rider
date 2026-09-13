import type { SceneId } from '../world/scenes';

/**
 * Synthesized engine + wind + horn + place beds. Off by default: browsers require a user
 * gesture before audio can start, so we lazily create the context on first enable.
 */
export class EngineAudio {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private sub: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private wind: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private bed: GainNode | null = null;
  private master: GainNode | null = null;
  private enabled = false;
  private twin = false;
  private lastGear = 0;
  private place: SceneId = 'munnar';
  private nextChirp = 0;

  setEngine(kind: 'single' | 'twin'): void {
    this.twin = kind === 'twin';
  }

  setPlace(id: SceneId): void {
    this.place = id;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) {
      this.ensure();
      void this.ctx?.resume();
    } else if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  honk(): void {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx;
    const dest = this.master;
    if (!ctx || !dest) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 420;
    const n = ctx.createOscillator();
    n.type = 'sawtooth';
    n.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g);
    n.connect(g);
    g.connect(dest);
    o.start(t);
    n.start(t);
    o.stop(t + 0.2);
    n.stop(t + 0.2);
  }

  private thunk(): void {
    const ctx = this.ctx;
    const dest = this.master;
    if (!ctx || !dest) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 90;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + 0.05);
  }

  private chirp(gain = 0.03): void {
    const ctx = this.ctx;
    const dest = this.bed;
    if (!ctx || !dest) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 380 + Math.random() * 80;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + 0.14);
  }

  private tick(): void {
    const ctx = this.ctx;
    const dest = this.bed;
    if (!ctx || !dest) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 2400 + Math.random() * 800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.012, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + 0.05);
  }

  dhaba(): void {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx;
    const dest = this.master;
    if (!ctx || !dest) return;
    const t = ctx.currentTime;
    const notes = [262, 330, 392, 330];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      const at = t + i * 0.45;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.04, at + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
      o.connect(g);
      g.connect(dest);
      o.start(at);
      o.stop(at + 0.42);
    });
  }

  private ensure(): void {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

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
    gain.connect(master);
    osc.start();
    sub.start();

    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    noise.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 800;
    const wind = ctx.createGain();
    wind.gain.value = 0;
    noise.connect(windFilter);
    windFilter.connect(wind);
    wind.connect(master);
    noise.start();

    const bed = ctx.createGain();
    bed.gain.value = 0.4;
    bed.connect(master);

    this.ctx = ctx;
    this.osc = osc;
    this.sub = sub;
    this.gain = gain;
    this.filter = filter;
    this.wind = wind;
    this.windFilter = windFilter;
    this.bed = bed;
    this.master = master;
  }

  update(
    rpm01: number,
    throttle: number,
    paused: boolean,
    extra?: { gear: number; speedRatio: number; sceneId: SceneId },
  ): void {
    if (!this.enabled || !this.ctx || !this.osc || !this.sub || !this.gain || !this.filter) return;
    const t = this.ctx.currentTime;
    if (this.master) this.master.gain.setTargetAtTime(paused ? 0 : 1, t, 0.08);
    const rpm = 1300 + rpm01 * 5200;
    const f = rpm / 60;
    this.osc.frequency.setTargetAtTime(f * 2, t, 0.04);
    this.sub.frequency.setTargetAtTime(this.twin ? f * 1.01 : f, t, 0.04);
    this.filter.frequency.setTargetAtTime(350 + rpm01 * 1400 + throttle * 500, t, 0.05);
    const target = paused ? 0 : 0.035 + rpm01 * 0.05 + throttle * 0.03;
    this.gain.gain.setTargetAtTime(target, t, 0.08);

    const ratio = extra?.speedRatio ?? rpm01;
    if (this.wind) this.wind.gain.setTargetAtTime(paused ? 0 : ratio * 0.045, t, 0.2);
    if (this.windFilter) this.windFilter.frequency.setTargetAtTime(400 + ratio * 1400, t, 0.2);

    if (extra) {
      if (extra.gear !== this.lastGear && extra.gear > 0 && this.lastGear > 0) this.thunk();
      this.lastGear = extra.gear;
      this.place = extra.sceneId;
      if (!paused && t > this.nextChirp) {
        if (this.place === 'bengaluru') this.chirp(0.025);
        else if (this.place === 'munnar' || this.place === 'wayanad' || this.place === 'ooty')
          this.tick();
        this.nextChirp = t + 4 + Math.random() * 5;
      }
    }
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
