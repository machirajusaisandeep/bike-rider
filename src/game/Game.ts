import {
  ACESFilmicToneMapping,
  Clock,
  DirectionalLight,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { initAnalytics, track } from '../core/analytics';
import {
  DRACO_DECODER_PATH,
  EXTERNAL_BIKE_MODEL,
  ROAD,
  TRAFFIC,
  WHITE_FLAME_RECOLOUR,
} from '../core/config';
import { Input, type InputState } from '../core/Input';
import { loadProfile, recordRun, saveProfile as recordHandle, type Profile } from '../core/profile';
import { dailyScene, dailySeed, parseSeed, randomSeed, todayKey, type Seed } from '../core/seed';
import {
  autoQuality,
  loadSettings,
  saveSettings,
  type Quality,
  type Settings,
} from '../core/settings';
import { PostFX } from '../postfx/PostFX';
import { Hud } from '../ui/Hud';
import { Menu } from '../ui/Menu';
import { Summary } from '../ui/Summary';
import { renderCard, shareCard } from '../share/Card';
import { submitRun } from '../net/leaderboard';
import { Dust } from '../world/Dust';
import { isSceneId, SCENE_BY_ID, type SceneId } from '../world/scenes';
import type { Contact, NearMiss } from '../world/Traffic';
import { World } from '../world/World';
import { Bike, loadExternalBike } from './Bike';
import { BikePhysics } from './BikePhysics';
import { ChaseCamera } from './ChaseCamera';
import { EngineAudio } from './EngineAudio';
import { FACES, GEAR_BY_ID, HAIR, protectionFor, sanitizeRider, type RiderConfig } from './gear';
import { Health } from './Health';
import { Rider } from './Rider';
import { MODE_LABEL, Run, type GameMode } from './Run';
import { Scoring } from './Scoring';

const FIXED_DT = 1 / 120;
const MAX_FRAME_DT = 1 / 20;
/** Seconds the crash slide plays before the summary appears. */
const CRASH_HOLD_S = 1.7;
const CRASH_SLOWMO = 0.4;
const GO_FLASH_S = 0.7;

const NO_INPUT: InputState = { throttle: 0, brake: 0, steer: 0, handbrake: false };

const _back = new Vector3();
const _rearContact = new Vector3();

export class Game {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private chase: ChaseCamera;
  private world: World;
  private bike = new Bike();
  private rider = new Rider();
  private physics = new BikePhysics();
  private input = new Input();
  private hud!: Hud;
  private menu: Menu;
  private summary: Summary;
  private dust: Dust;
  private audio = new EngineAudio();
  private post: PostFX | null = null;
  private settings: Settings;
  private profile: Profile;
  private clock = new Clock();
  private accumulator = 0;
  private elapsed = 0;
  private paused = false;
  private distance = 0;
  private fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private raf = 0;
  private firstRun: boolean;
  /** Dev aids via URL: ?autodrive, ?camera=..., ?time=..., ?scene=..., ?nomenu, ?perf, ?seed, ?mode */
  private params = new URLSearchParams(location.search);
  private autodrive = this.params.has('autodrive');
  private autoOffset = 0;
  /** Menu is up: the world rides itself in cinematic view behind it. */
  private attract = false;
  private savedCamera: Settings['cameraMode'];

  // ---- run state ----
  private run: Run;
  private scoring = new Scoring();
  private health = new Health();
  private contacts: Contact[] = [];
  private nearMisses: NearMiss[] = [];
  private goTimer = 0;
  private wetStep = false;
  private crashLabel = '';
  private crashKmh = 0;
  /** Seed pinned from the URL for the first ride only. */
  private urlSeed: Seed | null = null;

  constructor(private container: HTMLElement) {
    const stored = localStorage.getItem('bike-rider.settings.v2');
    this.firstRun = !stored;
    this.settings = loadSettings();
    this.profile = loadProfile();
    initAnalytics();
    if (this.firstRun) this.settings.quality = autoQuality();
    const camParam = this.params.get('camera');
    if (camParam === 'chase' || camParam === 'cockpit' || camParam === 'cinematic')
      this.settings.cameraMode = camParam;
    const timeParam = this.params.get('time');
    if (
      timeParam === 'auto' ||
      timeParam === 'day' ||
      timeParam === 'golden' ||
      timeParam === 'night'
    )
      this.settings.timeOfDay = timeParam;
    const sceneParam = this.params.get('scene');
    if (isSceneId(sceneParam)) this.settings.scene = sceneParam;
    // ?rider=female&gear=streetwind-full,explorer-v3,... previews a loadout without touching storage
    const riderParam = this.params.get('rider');
    const gearParam = this.params.get('gear');
    if (riderParam || gearParam !== null) {
      const cfg = structuredClone(this.settings.rider);
      if (riderParam === 'male' || riderParam === 'female') cfg.body = riderParam;
      const face = this.params.get('face');
      if (face && FACES[cfg.body].some((f) => f.id === face)) cfg.face = face;
      const hair = this.params.get('hair');
      if (hair && HAIR[cfg.body].includes(hair)) cfg.hair = hair;
      if (this.params.get('skin')) cfg.skin = this.params.get('skin')!;
      if (this.params.get('beard')) cfg.beard = this.params.get('beard') as RiderConfig['beard'];
      if (gearParam !== null) {
        for (const slot of Object.keys(cfg.gear) as (keyof typeof cfg.gear)[])
          cfg.gear[slot] = null;
        for (const id of gearParam.split(',').filter(Boolean)) {
          const item = GEAR_BY_ID[id];
          if (item) cfg.gear[item.slot] = id;
        }
      }
      this.settings.rider = sanitizeRider(cfg);
    }
    const qParam = this.params.get('quality');
    if (qParam === 'low' || qParam === 'medium' || qParam === 'high')
      this.settings.quality = qParam;
    this.savedCamera = this.settings.cameraMode;
    this.urlSeed = parseSeed(this.params.get('seed'));
    const modeParam = this.params.get('mode');
    const initialMode: GameMode =
      modeParam === 'free' || modeParam === 'daily' || modeParam === 'ride'
        ? modeParam
        : this.urlSeed
          ? 'ride'
          : 'ride';

    this.run = new Run({ mode: 'free', scene: this.settings.scene, seed: randomSeed() });
    this.run.onPhase = (p) => this.onRunPhase(p);

    this.renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(58, 1, 0.1, 6000);
    this.chase = new ChaseCamera(this.camera);
    this.chase.setMode(this.settings.cameraMode);

    this.world = new World(this.scene, this.renderer, this.settings.quality);
    this.world.load(this.settings.scene, this.settings.timeOfDay);
    this.physics.heightAt = this.world.heightAt;
    this.chase.heightAt = this.world.heightAt;
    this.scene.add(this.bike.root);
    this.seatRider();
    this.rider.onLoaded = () => this.hud.setStatus(null);
    this.applyRider(this.settings.rider, false);
    this.dust = new Dust(this.renderer.getPixelRatio());
    this.scene.add(this.dust.points);

    this.hud = new Hud(container, this.settings, this.input, {
      onReset: () => this.reset(true),
      onTogglePause: () => this.togglePause(),
      onCycleCamera: () => this.cycleCamera(),
      onSettingsChange: (s) => this.applySettings(s),
      onOpenScenes: () => this.openMenu(),
      onQuitRun: () => this.quitRun(),
    });
    this.hud.setPerf(this.params.has('perf') || import.meta.env.DEV);
    {
      const p = protectionFor(this.settings.rider);
      this.hud.setProtection(p.total, p.exposed);
    }
    this.menu = new Menu(container, this.settings.scene, this.settings.rider, {
      onRiderChange: (cfg) => this.applyRider(cfg, true),
      onPreview: (id) => this.switchScene(id),
      onStart: (id) => this.startRide(id),
      onStepChange: (step) => this.onMenuStep(step),
      onFocus: (tab) => this.focusRider(tab),
      onModeChange: (mode) => track('mode_select', { mode }),
      onOpenMissions: () => this.hud.setStatus('Missions arrive in the next update'),
      onOpenGarage: () => this.hud.setStatus('Garage arrives in the next update'),
    });
    this.menu.setDaily(dailyScene(), this.profile.daily.streak);
    this.refreshProgress();
    this.menu.setMode(initialMode);

    this.summary = new Summary(container, {
      onRetry: () => this.retry(),
      onShare: () => this.share(),
      onMenu: () => {
        this.summary.hide();
        this.openMenu('scene');
      },
      onFreeRide: () => {
        this.summary.hide();
        this.startFreeRide();
      },
      onPhoto: () => this.hud.setStatus('Photo mode arrives in the next update'),
    });

    this.input.on('KeyR', () => !this.attract && !this.summary.visible && this.reset(true));
    this.input.on('KeyC', () => !this.attract && this.cycleCamera());
    this.input.on('KeyP', () => !this.attract && !this.summary.visible && this.togglePause());
    this.input.on('Escape', () => {
      if (this.attract || this.summary.visible) return;
      if (this.run.scored && this.run.phase !== 'idle') this.togglePause();
      else this.openMenu();
    });

    window.addEventListener('resize', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.paused && !this.autodrive && !this.attract) this.togglePause();
    });

    this.applySettings(this.settings, true);
    this.reset();
    this.onResize();

    if (EXTERNAL_BIKE_MODEL) this.loadModel(EXTERNAL_BIKE_MODEL);

    const skipMenu = this.params.has('nomenu') || this.autodrive;
    if (skipMenu) {
      this.menu.hide();
      if (this.params.has('closeup')) this.chase.setCloseUp(true);
      if (this.urlSeed || modeParam) this.startRide(this.settings.scene);
    } else {
      this.openMenu(
        this.params.get('step') === 'scene' || this.urlSeed || this.profile.totalRuns > 0
          ? 'scene'
          : 'rider',
      );
      const tabParam = this.params.get('tab');
      if (tabParam === 'face' || tabParam === 'hair' || tabParam === 'gear')
        this.menu.setTab(tabParam);
    }

    this.clock.start();
    this.raf = requestAnimationFrame(this.frame);
    if (import.meta.env.DEV) (window as unknown as { __bikeRider?: Game }).__bikeRider = this;
  }

  /** Read-only view for dev tooling / screenshots. */
  get bikeModel(): Bike {
    return this.bike;
  }

  get stats(): {
    fps: number;
    scene: string;
    external: boolean;
    post: boolean;
    drawCalls: number;
    triangles: number;
    speedKmh: number;
    score: number;
    phase: string;
    traffic: number;
  } {
    const info = this.renderer.info.render;
    return {
      fps: Math.round(this.fps * 10) / 10,
      scene: this.world.sceneId,
      external: this.bike.external,
      post: !!this.post,
      drawCalls: info.calls,
      triangles: info.triangles,
      speedKmh: Math.round(this.physics.speedKmh),
      score: this.scoring.rounded,
      phase: this.run.phase,
      traffic: this.world.traffic?.count ?? 0,
    };
  }

  // ------------------------------------------------------------------ rider -----------------
  private applyRider(cfg: RiderConfig, save: boolean): void {
    this.settings.rider = cfg;
    this.rider.apply(cfg);
    const p = protectionFor(cfg);
    this.hud?.setProtection(p.total, p.exposed);
    if (save) saveSettings(this.settings);
  }

  /** Current protection score 0..100; drives how much each impact costs. */
  get protection(): number {
    return protectionFor(this.settings.rider).total;
  }

  // ------------------------------------------------------------------ scenes / menu ------
  private openMenu(step: 'rider' | 'scene' = 'scene'): void {
    if (this.attract) return;
    if (this.run.phase === 'riding' || this.run.phase === 'countdown') this.run.finish();
    this.summary.hide();
    this.hud.setCountdown(null);
    this.attract = true;
    this.paused = false;
    this.hud.setPaused(false);
    this.hud.setMenuOpen(true);
    this.hud.setRun(false);
    this.world.setTraffic(null);
    this.physics.crashed = false;
    this.savedCamera = this.settings.cameraMode;
    this.chase.setMode('cinematic');
    this.menu.select(this.settings.scene, false);
    this.menu.setDaily(dailyScene(), this.profile.daily.streak);
    this.refreshProgress();
    this.menu.show(step);
    this.onMenuStep(step);
  }

  private refreshProgress(): void {
    const bests: Partial<Record<SceneId, number>> = {};
    for (const [k, v] of Object.entries(this.profile.bests)) if (v) bests[k as SceneId] = v.score;
    this.menu.setBests(bests);
    this.menu.setCoins(this.profile.coins);
  }

  /** Rider step: bike parked, rider standing beside it under a fixed camera. Scene step: attract cruise. */
  private onMenuStep(step: 'rider' | 'scene'): void {
    if (step === 'rider') {
      this.reset();
      this.standRider();
      this.focusRider(this.menu.currentTab);
    } else {
      this.seatRider();
      this.chase.setFocus(null);
      this.chase.setCloseUp(false);
      this.chase.resetSmoothing();
    }
  }

  private riderStanding = false;
  /** Character-screen studio lights: key from the camera side, cool fill from the other. */
  private riderKey = new DirectionalLight(0xfff1dc, 0);
  private riderFill = new DirectionalLight(0xc4d4ff, 0);
  private riderLightsAdded = false;

  private standRider(): void {
    const p = this.physics;
    // Stand 1.5 m to the rider's right of the parked bike ...
    const right = new Vector3(-p.forward.z, 0, p.forward.x);
    const pos = p.position.clone().addScaledVector(right, 1.5).addScaledVector(p.forward, -0.2);
    pos.y = this.world.heightAt(pos.x, pos.z);
    // ... facing the sun, so the camera (placed along the facing direction) has the sun behind
    // it and the face is lit instead of silhouetted against the flare.
    const sun = this.world.atmosphere.sunDir;
    const horiz = Math.hypot(sun.x, sun.z);
    let ry = horiz > 0.05 ? Math.atan2(sun.x, sun.z) : p.heading + Math.PI / 2 + 0.35;
    // Keep the bike in frame behind the rider: nudge the facing towards the road-side view.
    ry += 0.15;
    this.scene.add(this.rider.root);
    this.rider.root.position.copy(pos);
    this.rider.root.rotation.set(0, ry, 0);
    this.rider.root.scale.setScalar(1);
    this.rider.setPose('stand');
    this.riderStanding = true;

    if (!this.riderLightsAdded) {
      this.scene.add(this.riderKey, this.riderKey.target, this.riderFill, this.riderFill.target);
      this.riderLightsAdded = true;
    }
    const facing = new Vector3(Math.sin(ry), 0, Math.cos(ry));
    const side = new Vector3(facing.z, 0, -facing.x);
    const chest = pos.clone().add(new Vector3(0, 1.2, 0));
    this.riderKey.position
      .copy(chest)
      .addScaledVector(facing, 3)
      .addScaledVector(side, -1.6)
      .add(new Vector3(0, 2.2, 0));
    this.riderKey.target.position.copy(chest);
    this.riderFill.position
      .copy(chest)
      .addScaledVector(facing, 2.5)
      .addScaledVector(side, 2.2)
      .add(new Vector3(0, 0.8, 0));
    this.riderFill.target.position.copy(chest);
    const night = this.world.atmosphere.isNight;
    this.riderKey.intensity = night ? 4.5 : 3.2;
    this.riderFill.intensity = night ? 1.6 : 1.1;
  }

  private seatRider(): void {
    this.rider.setShowHelmet(true);
    this.riderKey.intensity = 0;
    this.riderFill.intensity = 0;
    this.bike.lean.add(this.rider.root);
    // The GLB faces +Z (Blender -Y front), the bike faces -Z: half turn. Rig hips are at y 0.91
    // in the rest pose and the saddle top is ~0.80, so drop the root to seat the pelvis.
    this.rider.root.position.set(0, -0.13, 0.4);
    this.rider.root.rotation.set(0, Math.PI, 0);
    this.rider.setPose('ride');
    this.riderStanding = false;
  }

  private focusRider(tab: 'face' | 'hair' | 'gear'): void {
    if (!this.riderStanding) return;
    this.rider.setShowHelmet(tab === 'gear');
    const base = this.rider.root.position.clone();
    // The rider faces +Z in its local frame, i.e. world direction (sin ry, 0, cos ry); put the
    // camera out along that direction, swung a little for a three-quarter view.
    const yaw = this.rider.root.rotation.y - 0.4;
    const head = tab !== 'gear';
    this.chase.setFocus({
      target: base.clone().add(new Vector3(0, head ? 1.42 : 0.92, 0)),
      distance: head ? 2.0 : 4.4,
      height: head ? 0.12 : 0.45,
      yaw,
      sideOffset: head ? 0.55 : 0.95,
    });
  }

  private switchScene(id: SceneId): void {
    if (this.world.sceneId === id) return;
    this.settings.scene = id;
    saveSettings(this.settings);
    this.world.load(id, this.settings.timeOfDay);
    this.applyLook();
    this.dust.setColor(this.world.dustColor);
    this.reset();
  }

  // ------------------------------------------------------------------ runs -----------------
  /** Called from the menu's Start button. Decides the mode from the menu's selector. */
  private startRide(id: SceneId): void {
    const mode = this.menu.currentMode;
    let scene = id;
    let seed: Seed;
    if (mode === 'daily') {
      scene = dailyScene();
      seed = dailySeed();
    } else {
      seed = this.urlSeed ?? randomSeed();
      this.urlSeed = null;
    }
    this.switchScene(scene);
    this.menu.hide();
    this.summary.hide();
    this.attract = false;
    this.hud.setMenuOpen(false);
    this.seatRider();
    this.chase.setFocus(null);
    this.chase.setCloseUp(false);
    this.chase.setMode(this.savedCamera);
    this.hud.setCameraMode(this.savedCamera);
    this.beginRun({ mode, scene, seed });
    this.clock.getDelta();
  }

  private beginRun(cfg: { mode: GameMode; scene: SceneId; seed: Seed }): void {
    this.reset();
    this.scoring.reset();
    this.health.reset();
    this.distance = 0;
    this.goTimer = 0;
    this.crashLabel = '';
    this.crashKmh = 0;
    this.physics.crashed = false;
    const scored = cfg.mode !== 'free';
    if (scored) {
      this.world.setTraffic(cfg.seed);
      this.world.traffic!.reset(this.physics.position.z, cfg.seed);
    } else {
      this.world.setTraffic(null);
    }
    this.hud.setRun(scored, MODE_LABEL[cfg.mode]);
    this.hud.setHint(
      scored
        ? '<span class="key">A</span><span class="key">D</span><span>steer</span><span class="key">W</span><span>gas</span><span>· pass traffic close for points</span>'
        : null,
    );
    this.run.start(cfg);
    track('run_start', { mode: cfg.mode, scene: cfg.scene, protection: this.protection });
  }

  private retry(): void {
    this.summary.hide();
    const c = this.run.config;
    const seed = c.mode === 'daily' ? c.seed : randomSeed();
    track('retry', { mode: c.mode, scene: c.scene });
    this.beginRun({ mode: c.mode, scene: c.scene, seed });
    this.clock.getDelta();
  }

  private startFreeRide(): void {
    this.hud.setCountdown(null);
    this.beginRun({ mode: 'free', scene: this.world.sceneId, seed: randomSeed() });
  }

  private quitRun(): void {
    this.paused = false;
    this.hud.setPaused(false);
    this.run.finish();
    this.openMenu('scene');
  }

  private onRunPhase(phase: Run['phase']): void {
    if (phase === 'riding') this.goTimer = GO_FLASH_S;
    if (phase === 'summary') this.showSummary();
  }

  private showSummary(): void {
    const s = this.run.stats;
    const c = this.run.config;
    if (c.mode === 'free') return;
    this.hud.setCountdown(null);
    const score = this.scoring.rounded;
    const prev =
      c.mode === 'daily'
        ? (this.profile.daily.best[todayKey()]?.score ?? null)
        : (this.profile.bests[c.scene]?.score ?? null);
    const { newBest, coins } = recordRun(this.profile, {
      mode: c.mode,
      scene: c.scene,
      seed: c.seed,
      dayKey: c.mode === 'daily' ? todayKey() : undefined,
      score,
      distanceM: s.distanceM,
      topKmh: s.topKmh,
      nearMisses: s.nearMisses,
      bestCombo: s.bestCombo,
    });
    const cause =
      s.cause === 'crash'
        ? `Crashed into a ${this.crashLabel.toLowerCase()}`
        : s.cause === 'lost'
          ? 'Off the road'
          : 'Run ended';
    const detail =
      s.cause === 'crash'
        ? `${Math.round(this.crashKmh)} km/h impact · protection ${this.protection}/100`
        : s.cause === 'lost'
          ? this.world.def.water
            ? 'Into the sea. Stay on the tarmac.'
            : 'Down the hillside. Stay on the tarmac.'
          : 'You ended the run from the pause menu.';
    this.summary.show({
      mode: c.mode,
      sceneName: SCENE_BY_ID[c.scene].name,
      score,
      stats: s,
      newBest,
      previousBest: prev,
      coins,
      cause,
      causeDetail: detail,
      streak: c.mode === 'daily' ? this.profile.daily.streak : undefined,
    });
    this.refreshProgress();
    if (s.cause !== 'quit' || s.distanceM > 200) this.submitToBoard(score);
    track('run_end', {
      mode: c.mode,
      scene: c.scene,
      score,
      distance: s.distanceM,
      duration: s.durationS,
      cause: s.cause,
      near_misses: s.nearMisses,
      protection: this.protection,
      new_best: newBest,
    });
  }

  private lastRank: string | null = null;

  private shareUrl(): string {
    const c = this.run.config;
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('scene', c.scene);
    url.searchParams.set('seed', String(c.seed));
    url.searchParams.set('mode', c.mode === 'daily' ? 'daily' : 'ride');
    return url.toString();
  }

  private submitToBoard(score: number): void {
    const s = this.run.stats;
    const c = this.run.config;
    this.lastRank = null;
    void submitRun({
      mode: c.mode === 'free' ? 'ride' : c.mode,
      scene: c.scene,
      seed: c.seed,
      day: c.mode === 'daily' ? todayKey() : null,
      score,
      distance_m: Math.round(s.distanceM),
      duration_s: Math.round(s.durationS * 10) / 10,
      top_kmh: Math.round(s.topKmh * 10) / 10,
      near_misses: s.nearMisses,
      best_combo: s.bestCombo,
      protection: this.protection,
      handle: this.profile.handle,
    }).then((board) => {
      if (!this.summary.visible) return;
      if (board.rank !== null) {
        const ord = (n: number) => {
          const t = ['th', 'st', 'nd', 'rd'];
          const v = n % 100;
          return `${n}${t[(v - 20) % 10] ?? t[v] ?? t[0]}`;
        };
        this.lastRank = `${ord(board.rank)}${board.source === 'local' ? ' on this device' : ' worldwide'}`;
      }
      this.summary.setBoard({ ...board, handle: this.profile.handle }, (h) => {
        this.profile.handle = h;
        recordHandle(this.profile);
      });
      track('leaderboard_submit', { source: board.source, rank: board.rank });
    });
  }

  /** Renders the result card and hands it to the share sheet / clipboard. */
  private share(): void {
    const c = this.run.config;
    const def = SCENE_BY_ID[c.scene];
    const score = this.scoring.rounded;
    const text = `I scored ${score.toLocaleString('en-IN')} riding ${def.name} in Bike Rider. Beat it:`;
    const url = this.shareUrl();
    this.summary.setShareState('Rendering…');
    track('share', { mode: c.mode, scene: c.scene, score });
    void renderCard({
      mode: c.mode,
      sceneName: def.name,
      scenePlace: def.place,
      previewUrl: import.meta.env.BASE_URL + def.preview,
      score,
      stats: this.run.stats,
      protection: this.protection,
      handle: this.profile.handle,
      shareUrl: url,
      rank: this.lastRank,
      streak: c.mode === 'daily' ? this.profile.daily.streak : undefined,
    })
      .then((blob) => shareCard(blob, text, url))
      .then((outcome) => {
        track('share_card', { outcome });
        this.summary.setShareState(
          outcome === 'shared'
            ? 'Shared ✓'
            : outcome === 'copied-image'
              ? 'Card copied ✓'
              : outcome === 'copied-link'
                ? 'Link copied ✓'
                : outcome === 'downloaded'
                  ? 'Card saved ✓'
                  : 'Share <span class="key">S</span>',
        );
      })
      .catch(() => this.summary.setShareState('Share failed'));
  }

  // ------------------------------------------------------------------ collisions -----------
  private handleContacts(): void {
    const traffic = this.world.traffic;
    if (!traffic || !this.run.active) return;
    const p = this.physics;
    const lat = this.world.path.lateral(p.position.x, p.position.z);
    traffic.contacts(lat, p.position.z, p.speed, this.contacts);
    for (const c of this.contacts) {
      const o = c.obstacle;
      if (o.effect === 'slick') {
        this.wetStep = true;
        continue;
      }
      if (o.effect === 'bump') {
        if (o.bumped) continue;
        o.bumped = true;
        const kmh = p.speedKmh;
        if (o.kind === 'breaker') {
          if (kmh > 45) {
            p.speed *= 0.8;
            this.chase.kick(0.45);
            this.hud.popBonus('Speed breaker', 0, 'hit');
          }
        } else if (kmh > 25) {
          p.speed *= 0.86;
          this.chase.kick(0.55);
          const r = this.health.hit(22, this.protection);
          if (r && !r.wobble) {
            this.hud.popBonus('Pothole', -Math.round(r.damage * 100), 'hit');
            if (r.fatal) this.fatal(o.label, 22, c.side);
          }
        }
        continue;
      }
      // solid
      const r = this.health.hit(c.relativeKmh, this.protection);
      if (!r) {
        // Still inside something during the grace window: keep pushing out.
        p.impulse(c.side, 0.2);
        traffic.shove(o, -c.side as 1 | -1, 0.15);
        continue;
      }
      this.scoring.hit();
      if (r.wobble) {
        p.impulse(c.side, 0.3);
        this.chase.kick(0.3);
        continue;
      }
      if (r.fatal) {
        this.fatal(o.label, c.relativeKmh, c.side);
        continue;
      }
      p.impulse(c.side, 0.45 + r.damage);
      this.chase.kick(0.6 + r.damage);
      this.hud.flashHit();
      this.hud.popBonus(`Hit ${o.label.toLowerCase()}`, -Math.round(r.damage * 100), 'hit');
      this.run.stats.crashes++;
    }
    // Near misses fire once as the rider's centre passes each obstacle.
    traffic.nearMisses(lat, p.position.z, this.nearMisses);
    for (const nm of this.nearMisses) {
      if (nm.gap < 0 || nm.gap > TRAFFIC.nearMissGap) continue;
      if (p.speedKmh < TRAFFIC.nearMissMinKmh) continue;
      const bonus = this.scoring.nearMiss(p.speedKmh * (nm.oncoming ? 1.5 : 1));
      this.run.stats.nearMisses++;
      this.run.stats.bestCombo = Math.max(this.run.stats.bestCombo, this.scoring.combo);
      this.hud.popBonus(
        nm.oncoming ? `${bonus.label} · oncoming!` : bonus.label,
        bonus.points,
        'nearMiss',
      );
    }
  }

  private fatal(label: string, kmh: number, side: 1 | -1): void {
    this.crashLabel = label;
    this.crashKmh = kmh;
    this.physics.crash(side);
    this.chase.kick(1.2);
    this.hud.flashHit();
    this.hud.popBonus(`Crashed · ${label.toLowerCase()}`, 0, 'hit');
    this.run.crash('crash');
    this.run.stats.crashes++;
  }

  private applyLook(): void {
    this.renderer.toneMappingExposure = this.world.exposure;
    const night = this.world.atmosphere.isNight;
    const dusk = this.world.atmosphere.isDusk;
    // Bloom samples the HDR buffer before exposure, so express the threshold in post-exposure
    // terms: only pixels that would tone-map brighter than white should glow.
    const exposure = Math.max(0.05, this.world.exposure);
    this.post?.setLook({
      bloom: night ? 0.5 : dusk ? 0.22 : 0.12,
      bloomThreshold: (night ? 0.75 : dusk ? 1.05 : 1.2) / exposure,
      warm: dusk ? 1 : night ? -0.6 : 0.2,
      saturation: this.world.def.category === 'Greenery' ? 1.12 : 1.06,
      vignette: night ? 0.45 : 0.3,
    });
  }

  private loadModel(rel: string): void {
    const base = import.meta.env.BASE_URL;
    this.hud.setStatus('Loading Scram 411 model…');
    loadExternalBike(base + rel, this.bike, {
      dracoPath: base + DRACO_DECODER_PATH,
      whiteFlame: WHITE_FLAME_RECOLOUR,
      onProgress: (f) => this.hud.setStatus(`Loading Scram 411 model… ${Math.round(f * 100)}%`),
    })
      .then(() => {
        this.hud.setStatus(null);
        this.syncBikeTransform();
      })
      .catch((err: unknown) => {
        console.info('External bike model not available, using procedural bike.', err);
        this.hud.setStatus(null);
      });
  }

  // ------------------------------------------------------------------ controls ------------
  /** Snap the bike back onto the road. `manual` = the player asked (costs the combo in a run). */
  private reset(manual = false): void {
    if (manual && this.run.phase === 'crashed') return;
    const z = Math.min(0, Math.ceil(this.physics.position.z / ROAD.tileLength) * ROAD.tileLength);
    const spawn = this.world.spawnAt(z);
    this.physics.reset(spawn.x, spawn.z, spawn.heading);
    this.syncBikeTransform();
    this.chase.resetSmoothing();
    this.world.update(0, this.physics.position, this.camera.position);
    if (manual && this.run.active) this.scoring.hit();
  }

  private togglePause(): void {
    if (this.summary.visible) return;
    this.paused = !this.paused;
    this.hud.setPaused(this.paused);
    if (!this.paused) this.clock.getDelta();
  }

  private cycleCamera(): void {
    const mode = this.chase.cycle();
    this.settings.cameraMode = mode;
    this.savedCamera = mode;
    this.hud.setCameraMode(mode);
    saveSettings(this.settings);
  }

  private applySettings(s: Settings, initial = false): void {
    const prevQuality = this.settings.quality;
    const prevTime = this.settings.timeOfDay;
    const prevCamera = this.settings.cameraMode;
    this.settings = s;
    saveSettings(s);
    if (initial || s.quality !== prevQuality) this.applyQuality(s.quality);
    if (initial || s.timeOfDay !== prevTime) {
      this.world.setTimeOfDay(s.timeOfDay);
      this.applyLook();
    }
    if (!initial && s.cameraMode !== prevCamera && !this.attract) {
      this.chase.setMode(s.cameraMode);
      this.hud.setCameraMode(s.cameraMode);
    }
    if (!initial) this.savedCamera = s.cameraMode;
    this.audio.setEnabled(s.sound);
    this.dust.setColor(this.world.dustColor);
    if (!initial) track('settings_change', { quality: s.quality, time: s.timeOfDay });
  }

  private applyQuality(q: Quality): void {
    const dpr = window.devicePixelRatio || 1;
    const ratio = q === 'high' ? Math.min(2, dpr) : q === 'medium' ? Math.min(1.5, dpr) : 1;
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = q !== 'low';
    this.world.setQuality(q);
    this.dust.setPixelRatio(ratio);
    if (q === 'low') {
      this.post?.dispose();
      this.post = null;
    } else if (!this.post) {
      this.post = new PostFX(this.renderer, this.scene, this.camera);
    }
    this.applyLook();
    this.scene.traverse((o) => {
      const mesh = o as { material?: { needsUpdate: boolean } | { needsUpdate: boolean }[] };
      if (!mesh.material) return;
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => (m.needsUpdate = true));
      else mesh.material.needsUpdate = true;
    });
    this.onResize();
  }

  private onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post?.setSize(w, h);
  };

  // ------------------------------------------------------------------ loop ----------------
  private frame = (): void => {
    this.raf = requestAnimationFrame(this.frame);
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, MAX_FRAME_DT);

    this.fpsAcc += rawDt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    if (!this.paused) this.step(dt);
    else this.audio.update(0.1, 0, true);

    if (this.post) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);
  };

  /** One simulation tick (input, physics, traffic, scoring, HUD). No rendering. */
  private step(dt: number): void {
    this.elapsed += dt;
    const run = this.run;
    if (!this.attract) run.tick(dt);
    // Crash slide plays in slow motion.
    const simDt = run.phase === 'crashed' ? dt * CRASH_SLOWMO : dt;

    if (this.autodrive || (this.attract && !this.riderStanding)) this.applyAutodrive();
    else if (this.riderStanding) {
      this.input.setVirtual('up', false);
      this.input.setVirtual('left', false);
      this.input.setVirtual('right', false);
    }
    this.input.update(dt);
    const drive = this.attract || run.controllable ? this.input.state : NO_INPUT;

    this.accumulator += simDt;
    while (this.accumulator >= FIXED_DT) {
      const p = this.physics;
      p.surface = this.wetStep ? 'wet' : this.world.surfaceAt(p.position.x, p.position.z);
      this.wetStep = false;
      p.update(FIXED_DT, drive);
      const step = Math.abs(p.frameDistance);
      this.distance += step;
      this.bike.spin(p.frameDistance);
      if (run.active) {
        const braking = drive.brake > 0 || drive.handbrake;
        run.stats.distanceM += step;
        run.stats.topKmh = Math.max(run.stats.topKmh, p.speedKmh);
        this.health.tick(FIXED_DT);
        const bonus = this.scoring.update(
          FIXED_DT,
          step,
          p.speedKmh,
          p.surface,
          braking,
          p.yawRate,
        );
        if (bonus) this.hud.popBonus(bonus.label, bonus.points, bonus.kind);
        this.handleContacts();
      }
      this.accumulator -= FIXED_DT;
    }
    const p = this.physics;
    if (this.world.isLost(p.position.x, p.position.z, p.position.y)) {
      if (run.active) {
        this.crashLabel = '';
        this.physics.crash(1);
        run.crash('lost');
      } else if (run.phase !== 'crashed') this.reset();
    }
    if (run.phase === 'crashed' && run.sinceCrash >= CRASH_HOLD_S) run.finish();
    this.syncBikeTransform();

    const gravelly = p.surface !== 'asphalt' && p.surface !== 'wet' ? 1 : 0;
    const roughness =
      gravelly * Math.min(1, p.speedRatio * 2.5) + (1 - p.speedRatio) * 0.08 * p.rpm;
    this.chase.update(simDt, p, roughness, this.elapsed);
    this.world.update(simDt, p.position, this.camera.position, p.speed);

    _back.copy(p.forward).multiplyScalar(-1);
    _rearContact.copy(p.position).addScaledVector(_back, 0.73);
    const braking = drive.brake > 0 || drive.handbrake;
    const skid = (braking && Math.abs(p.speed) > 8) || p.crashed ? 25 : 0;
    const dustRate = gravelly ? 20 + p.speedRatio * 70 : skid;
    this.dust.update(simDt, _rearContact, _back, Math.abs(p.speed), dustRate);

    this.bike.setLights(this.world.headlightsOn, braking && Math.abs(p.speed) > 0.5);
    this.rider.update(p.steerAngle, dt);
    this.audio.update(p.crashed ? 0.1 : p.rpm, drive.throttle, this.attract);

    if (!this.attract) {
      this.hud.update({
        speedKmh: p.speedKmh,
        gear: p.gear,
        rpm: p.rpm,
        surface: p.surface,
        offRoute:
          !p.crashed &&
          this.world.distanceFromRoad(p.position.x, p.position.z) > ROAD.offRouteDistance,
        distanceKm: this.distance / 1000,
        fps: this.fps,
        moving: p.speedKmh > 2,
      });
      if (run.scored) {
        this.hud.updateScore(
          this.scoring.score,
          this.scoring.combo,
          this.scoring.comboFraction,
          this.scoring.comboMult,
        );
        this.hud.setHealth(this.health.hp);
        if (run.phase === 'countdown') {
          this.hud.setCountdown(String(Math.ceil(run.countdown)));
        } else if (this.goTimer > 0) {
          this.goTimer -= dt;
          this.hud.setCountdown(this.goTimer > 0 ? 'GO' : null);
        }
      }
    }
  }

  /**
   * Dev / test aid: fast-forward `seconds` of game time with a fixed virtual input, without
   * waiting for real frames. Headless captures run at ~1 fps, so this is how runs are tested.
   */
  advance(
    seconds: number,
    keys: {
      up?: boolean;
      left?: boolean;
      right?: boolean;
      down?: boolean;
      /** Follow the road automatically, offset from the centreline (m, +right). */
      auto?: number;
    } = { up: true },
  ): void {
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) {
      if (keys.auto !== undefined) {
        this.autoOffset = keys.auto;
        this.autodrive = true;
      } else {
        this.input.setVirtual('up', !!keys.up);
        this.input.setVirtual('left', !!keys.left);
        this.input.setVirtual('right', !!keys.right);
        this.input.setVirtual('down', !!keys.down);
      }
      this.step(dt);
    }
    this.autodrive = this.params.has('autodrive');
    this.autoOffset = 0;
    this.input.setVirtual('up', false);
    this.input.setVirtual('left', false);
    this.input.setVirtual('right', false);
    this.input.setVirtual('down', false);
    this.clock.getDelta();
  }

  /** Keeps the bike on the centreline with a relaxed throttle. Attract mode + dev aid. */
  private applyAutodrive(): void {
    const p = this.physics;
    const ahead = p.position.z - 12;
    const targetX = this.world.path.centerX(ahead) + this.autoOffset;
    const err = targetX - (p.position.x + p.forward.x * 12);
    // Cruise gently in attract mode so the scenery can be enjoyed.
    const cruise = this.attract ? p.speedKmh < 48 : true;
    this.input.setVirtual('up', cruise);
    this.input.setVirtual('right', err > 0.4);
    this.input.setVirtual('left', err < -0.4);
  }

  private syncBikeTransform(): void {
    const p = this.physics;
    this.bike.root.position.copy(p.position);
    this.bike.root.rotation.order = 'YXZ';
    this.bike.root.rotation.y = p.heading;
    this.bike.root.rotation.x = p.pitch;
    this.bike.setLean(p.lean);
    this.bike.setSteer(p.steerAngle);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.audio.dispose();
    this.menu.dispose();
    this.summary.dispose();
    this.post?.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }
}
