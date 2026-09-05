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
import { loadProfile, recordRun, type Profile } from '../core/profile';
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
import { MissionsPanel } from '../ui/Missions';
import { GaragePanel } from '../ui/Garage';
import { composePhoto, PhotoMode } from '../ui/PhotoMode';
import {
  evaluateMission,
  MISSION_BY_ID,
  PARCEL_INTERVAL_M,
  type Mission,
  type MissionLive,
} from './missions';
import { BIKE_BY_ID, tuneFor } from './upgrades';
import { saveProfile } from '../core/profile';
import type { WeatherId } from '../world/Weather';
import { RoutesPanel } from '../ui/Routes';
import { DHABA_HEAL, ROUTE_BY_ID, routeProgress, type Route } from './routes';
import { clipSupported, recordClip, shareClip } from '../share/Clip';
import { fetchGhosts, uploadGhost } from '../net/ghosts';
import { initPortal, portal } from '../net/portal';
import { applyLanguage, getLanguage as getLang, onLanguage, setLanguage, t } from '../core/i18n';
import { Color } from 'three';
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
import {
  GhostRecorder,
  GhostRider,
  loadGhost,
  sampleGhost,
  saveGhost,
  type GhostSample,
} from './Ghost';
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
  private ghostRec = new GhostRecorder();
  private ghost: GhostRider | null = null;
  private crashLabel = '';
  private crashKmh = 0;
  /** Seed pinned from the URL for the first ride only. */
  private urlSeed: Seed | null = null;
  private missionsPanel!: MissionsPanel;
  private garage!: GaragePanel;
  private photo!: PhotoMode;
  private mission: Mission | null = null;
  private live: MissionLive = freshLive();
  private missionState: 'live' | 'done' | 'failed' = 'live';
  private missionEvalT = 0;
  private wasBraking = false;
  private photoReturn: 'summary' | 'ride' | 'paused' | null = null;
  private routesPanel!: RoutesPanel;
  private route: Route | null = null;
  private routePassed = 0;
  private others: GhostRider[] = [];
  private replaying = false;
  private continued = false;

  constructor(private container: HTMLElement) {
    const stored = localStorage.getItem('bike-rider.settings.v2');
    this.firstRun = !stored;
    this.settings = loadSettings();
    this.profile = loadProfile();
    initAnalytics();
    void initPortal();
    setLanguage(this.settings.language);
    onLanguage(() => {
      this.menu?.refreshTexts();
      applyLanguage(this.hud?.root ?? document.body);
    });
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
    this.ghost = new GhostRider();
    this.scene.add(this.ghost.bike.root);
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
      onPhoto: () => this.openPhoto(),
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
      onOpenMissions: () => this.missionsPanel.show(this.menu.current),
      onOpenGarage: () => this.garage.show(),
      onOpenRoutes: () => this.routesPanel.show(),
    });
    this.routesPanel = new RoutesPanel(container, () => this.profile, {
      onStart: (r) => {
        this.routesPanel.hide();
        this.launch('route', r.scene, randomSeed(), { routeId: r.id });
      },
      onClose: () => this.routesPanel.hide(),
    });
    this.missionsPanel = new MissionsPanel(container, this.settings.scene, () => this.profile, {
      onStart: (m) => {
        this.missionsPanel.hide();
        this.launch('mission', m.scene, randomSeed(), { missionId: m.id });
      },
      onClose: () => this.missionsPanel.hide(),
    });
    this.garage = new GaragePanel(container, () => this.profile, {
      onChange: () => {
        saveProfile(this.profile);
        this.applyGarage();
        this.refreshProgress();
      },
      onClose: () => this.garage.hide(),
    });
    this.photo = new PhotoMode(container, {
      onClose: () => this.closePhoto(),
      onCapture: () => void this.capturePhoto(),
      onTimeOfDay: (t) => {
        this.settings.timeOfDay = t;
        saveSettings(this.settings);
        this.hud.setSegment('timeOfDay', t);
        this.world.setTimeOfDay(t);
        this.applyLook();
      },
    });
    this.applyGarage();
    const weatherParam = this.params.get('weather');
    if (weatherParam === 'rain' || weatherParam === 'fog' || weatherParam === 'snow')
      this.settings.weather = weatherParam;
    this.applyWeather(true);
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
      onPhoto: () => this.openPhoto(),
      onClip: () => void this.recordReplay(),
      onContinue: () => void this.continueRun(),
    });
    applyLanguage(container);

    this.input.on('KeyR', () => !this.attract && !this.summary.visible && this.reset(true));
    this.input.on('KeyC', () => !this.attract && this.cycleCamera());
    this.input.on('KeyP', () => !this.attract && !this.summary.visible && this.togglePause());
    this.input.on('Escape', () => {
      if (this.photo.visible || this.missionsPanel.visible || this.garage.visible) return;
      if (this.routesPanel.visible || this.replaying) return;
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
    this.world.setWeather(this.world.weatherId);
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
    this.launch(mode, scene, seed);
  }

  private launch(
    mode: GameMode,
    scene: SceneId,
    seed: Seed,
    extra: { missionId?: string; routeId?: string } = {},
  ): void {
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
    this.beginRun({ mode, scene, seed, ...extra });
    this.clock.getDelta();
  }

  private beginRun(cfg: {
    mode: GameMode;
    scene: SceneId;
    seed: Seed;
    missionId?: string;
    routeId?: string;
  }): void {
    // Every run starts at the head of the road so seeds, ghosts and boards line up.
    this.physics.position.set(0, 0, 0);
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
    this.ghostRec.reset();
    if (scored) {
      const g = loadGhost(this.boardKey(cfg.mode, cfg.scene));
      this.ghost?.load(g?.data ?? null);
    } else this.ghost?.load(null);
    this.mission = cfg.missionId ? (MISSION_BY_ID[cfg.missionId] ?? null) : null;
    this.route = cfg.routeId ? (ROUTE_BY_ID[cfg.routeId] ?? null) : null;
    this.routePassed = 0;
    this.continued = false;
    this.world.setGates(this.route?.checkpoints ?? null);
    this.clearOthers();
    if (cfg.mode === 'daily') this.loadOthers(this.boardKey(cfg.mode, cfg.scene));
    this.live = freshLive();
    this.missionState = 'live';
    this.missionEvalT = 0;
    this.wasBraking = false;
    if (this.mission) this.hud.setObjective(this.mission.title, this.mission.desc, 0, 'live');
    else if (this.route) {
      const first = this.route.checkpoints[0]!;
      this.hud.setObjective(
        this.route.name,
        t('route.next', { name: first.name, m: first.at }),
        0,
        'live',
      );
    } else this.hud.setObjective(null);
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
    const go = () => {
      this.beginRun({
        mode: c.mode,
        scene: c.scene,
        seed,
        missionId: c.missionId,
        routeId: c.routeId,
      });
      this.clock.getDelta();
    };
    if (portal.active) {
      void portal
        .maybeCommercialBreak(
          () => this.audio.setEnabled(false),
          () => this.audio.setEnabled(this.settings.sound),
        )
        .then(go);
    } else go();
  }

  /** Rewarded continue: health back to half, bike on the road, same run. */
  private async continueRun(): Promise<void> {
    if (this.continued || this.run.phase !== 'summary') return;
    const ok = await portal.rewardedBreak(
      () => this.audio.setEnabled(false),
      () => this.audio.setEnabled(this.settings.sound),
    );
    if (!ok) return;
    this.continued = true;
    this.summary.hide();
    this.physics.crashed = false;
    this.health.hp = Math.max(this.health.hp, 0.5);
    this.reset();
    this.run.revive();
    this.hud.setCountdown(null);
    this.clock.getDelta();
    track('run_start', {
      mode: this.run.config.mode,
      scene: this.run.config.scene,
      continued: true,
    });
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
    if (phase === 'riding') {
      this.goTimer = GO_FLASH_S;
      portal.gameplayStart();
    }
    if (phase === 'crashed' || phase === 'summary' || phase === 'idle') portal.gameplayStop();
    if (phase === 'summary') this.showSummary();
  }

  private boardKey(mode: GameMode, scene: SceneId): string {
    return mode === 'daily' ? `daily:${todayKey()}` : `ride:${scene}`;
  }

  private showSummary(): void {
    const s = this.run.stats;
    const c = this.run.config;
    if (c.mode === 'free') return;
    this.ghost?.hide();
    this.hud.setCountdown(null);
    const score = this.scoring.rounded;
    const prev =
      c.mode === 'daily'
        ? (this.profile.daily.best[todayKey()]?.score ?? null)
        : (this.profile.bests[c.scene]?.score ?? null);
    let missionLine: { title: string; done: boolean; reward: number } | null = null;
    if (this.mission) {
      const r = evaluateMission(this.mission, s, this.live);
      const already = this.profile.missionsDone.includes(this.mission.id);
      missionLine = {
        title: this.mission.title,
        done: r.done,
        reward: already ? 0 : this.mission.reward,
      };
      if (r.done && !already) {
        this.profile.missionsDone.push(this.mission.id);
        this.profile.coins += this.mission.reward;
        if (this.mission.unlocks && !this.profile.unlocks.includes(this.mission.unlocks))
          this.profile.unlocks.push(this.mission.unlocks);
        track('mission_complete', { id: this.mission.id });
      }
    }
    let routeDone = false;
    if (this.route && s.cause === 'arrived') {
      routeDone = true;
      if (!this.profile.routesDone.includes(this.route.id)) {
        this.profile.routesDone.push(this.route.id);
        this.profile.coins += this.route.reward;
      }
    }
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
    if (newBest) {
      saveGhost(this.boardKey(c.mode, c.scene), score, c.seed, this.ghostRec);
      portal.happyTime();
      if (c.mode === 'daily' && this.ghostRec.samples > 20)
        void uploadGhost(
          this.boardKey(c.mode, c.scene),
          this.profile.handle,
          score,
          this.ghostRec.serialize(),
        );
    }
    const cause =
      s.cause === 'crash'
        ? t('sum.crash', { what: articled(this.crashLabel.toLowerCase()) })
        : s.cause === 'lost'
          ? t('sum.lost')
          : s.cause === 'complete'
            ? t('sum.complete')
            : s.cause === 'arrived'
              ? t('sum.arrived', { to: this.route?.to ?? '' })
              : t('sum.ended');
    const detail =
      s.cause === 'crash'
        ? t('sum.crashDetail', { kmh: Math.round(this.crashKmh), p: this.protection })
        : s.cause === 'lost'
          ? this.world.def.water
            ? t('sum.lostSea')
            : t('sum.lostHill')
          : s.cause === 'complete'
            ? `${this.mission?.title ?? 'Objective'} done. Coins banked.`
            : s.cause === 'arrived'
              ? t('sum.arrivedDetail', { route: this.route?.name ?? '' })
              : t('sum.endedDetail');
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
      mission:
        missionLine ??
        (this.route
          ? { title: this.route.name, done: routeDone, reward: routeDone ? this.route.reward : 0 }
          : null),
      canContinue: portal.active && !this.continued && s.cause === 'crash',
      canClip: clipSupported() && this.ghostRec.samples > 30,
    });
    this.clearOthers();
    this.hud.setObjective(null);
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
      mode: c.mode === 'free' || c.mode === 'route' ? 'ride' : c.mode,
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
        saveProfile(this.profile);
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

  // ------------------------------------------------------------------ missions -------------
  private updateMission(dt: number, step: number, braking: boolean): void {
    const m = this.mission!;
    const run = this.run;
    if (braking && !this.wasBraking) {
      this.live.brakeTaps++;
      this.live.noBrakeM = 0;
    }
    this.wasBraking = braking;
    if (!braking) this.live.noBrakeM += step;
    this.live.cleanM += step;
    this.live.score = this.scoring.score;
    const parcels = Math.floor(run.stats.distanceM / PARCEL_INTERVAL_M);
    if (m.type === 'deliver' && parcels > this.live.parcels) {
      this.live.parcels = parcels;
      this.hud.popBonus(`Parcel ${Math.min(parcels, m.target)}/${m.target} delivered`, 0, 'corner');
    } else this.live.parcels = parcels;
    this.missionEvalT += dt;
    if (this.missionEvalT < 0.25 && this.missionState === 'live') return;
    this.missionEvalT = 0;
    if (this.missionState !== 'live') return;
    const r = evaluateMission(m, run.stats, this.live);
    if (r.done) {
      this.missionState = 'done';
      this.hud.setObjective(m.title, 'Complete!', 1, 'done');
      this.hud.popBonus(`Mission complete · +${m.reward} coins`, 0, 'corner');
      // Let the moment land, then wrap the run up.
      setTimeout(() => {
        if (this.run.active && this.mission === m) {
          this.run.stats.cause = 'complete';
          this.run.finish();
        }
      }, 1800);
    } else if (r.failed) {
      this.missionState = 'failed';
      this.hud.setObjective(m.title, 'Out of time', r.progress, 'failed');
    } else this.hud.setObjective(m.title, r.label, r.progress, 'live');
  }

  // ------------------------------------------------------------------ routes ---------------
  private updateRoute(): void {
    const r = this.route!;
    const run = this.run;
    const prog = routeProgress(r, run.stats.distanceM);
    while (this.routePassed < prog.passed) {
      const c = r.checkpoints[this.routePassed]!;
      this.routePassed++;
      if (c.kind === 'dhaba') {
        this.health.hp = Math.min(1, this.health.hp + DHABA_HEAL);
        this.hud.popBonus(
          t('route.dhaba', { name: c.name, n: Math.round(DHABA_HEAL * 100) }),
          0,
          'corner',
        );
      } else if (c.kind === 'finish') {
        this.hud.popBonus(t('route.finish', { name: c.name }), 0, 'corner');
        this.hud.setObjective(r.name, c.name, 1, 'done');
        setTimeout(() => {
          if (this.run.active && this.route === r) {
            this.run.stats.cause = 'arrived';
            this.run.finish();
          }
        }, 1500);
        return;
      } else {
        this.hud.popBonus(t('route.pass', { name: c.name, note: c.note ?? '' }), 0, 'speed');
      }
    }
    if (prog.next) {
      this.hud.setObjective(
        r.name,
        t('route.next', { name: prog.next.name, m: Math.round(prog.remaining) }),
        prog.passed / prog.total +
          (1 / prog.total) *
            (1 -
              prog.remaining /
                Math.max(1, prog.next.at - (r.checkpoints[prog.passed - 1]?.at ?? 0))),
        'live',
      );
    }
  }

  // ------------------------------------------------------------------ group ride -----------
  private clearOthers(): void {
    for (const g of this.others) g.dispose();
    this.others = [];
  }

  private loadOthers(board: string): void {
    const tints = [0xffb428, 0xff5a1f, 0x7ee08a];
    void fetchGhosts(board, this.profile.handle).then((list) => {
      if (
        this.run.config.mode !== 'daily' ||
        this.boardKey('daily', this.run.config.scene) !== board
      )
        return;
      this.clearOthers();
      list.forEach((g, i) => {
        const rider = new GhostRider(new Color(tints[i % tints.length]!));
        rider.label = g.handle;
        rider.load(g.data);
        this.scene.add(rider.bike.root);
        this.others.push(rider);
      });
      if (list.length) this.hud.setStatus(`Riding with ${list.map((g) => g.handle).join(', ')}`);
      setTimeout(() => this.hud.setStatus(null), 3000);
    });
  }

  // ------------------------------------------------------------------ replay clip ----------
  /** Re-run the last ~10 s of this run from the ghost samples under a cinematic camera. */
  private async recordReplay(): Promise<void> {
    if (this.replaying || !clipSupported() || this.ghostRec.samples < 30) return;
    const data = deserializeOwn(this.ghostRec);
    if (!data) return;
    const T = data[data.length - 6]!;
    const CLIP_S = Math.min(10, T);
    const t0 = Math.max(0, T - CLIP_S);
    this.replaying = true;
    this.summary.hide();
    this.hud.root.classList.add('photo-open');
    this.summary.setClipState('Recording…');
    const traffic = this.world.traffic;
    if (traffic) traffic.group.visible = false;
    this.ghost?.hide();
    const prevMode = this.chase.mode;
    this.chase.setMode('cinematic');
    const p = this.physics;
    const sample: GhostSample = { x: 0, y: 0, z: 0, heading: 0, lean: 0, speed: 0 };
    let last = 0;
    const crashed = p.crashed;
    p.crashed = false;
    try {
      const blob = await recordClip({
        canvas: this.renderer.domElement,
        seconds: CLIP_S + 0.4,
        tick: (t) => {
          const dt = Math.min(0.1, Math.max(0.001, t - last));
          last = t;
          if (sampleGhost(data, t0 + Math.min(t, CLIP_S), sample)) {
            p.position.set(sample.x, sample.y, sample.z);
            p.heading = sample.heading;
            p.lean = sample.lean;
            p.speed = sample.speed;
            p.forward.set(-Math.sin(p.heading), 0, -Math.cos(p.heading));
          }
          this.syncBikeTransform();
          this.bike.spin(p.speed * dt);
          this.chase.update(dt, p, 0, this.elapsed + t);
          this.world.update(dt, p.position, this.camera.position, p.speed, p.forward);
          if (this.post) this.post.render(dt);
          else this.renderer.render(this.scene, this.camera);
        },
      });
      const def = this.world.def;
      const outcome = await shareClip(
        blob,
        `${this.scoring.rounded.toLocaleString('en-IN')} points on ${def.name} · Bike Rider`,
        this.shareUrl(),
      );
      track('clip', { outcome, seconds: CLIP_S });
      this.summary.setClipState(
        outcome === 'shared'
          ? 'Clip shared ✓'
          : outcome === 'downloaded'
            ? 'Clip saved ✓'
            : t('sum.clip'),
      );
    } catch (e) {
      console.info('[clip] failed', e);
      this.summary.setClipState('Clip failed');
    } finally {
      if (traffic) traffic.group.visible = true;
      p.crashed = crashed;
      this.chase.setMode(prevMode);
      this.hud.root.classList.remove('photo-open');
      this.replaying = false;
      this.summary.reveal();
      this.clock.getDelta();
    }
  }

  // ------------------------------------------------------------------ garage / weather -----
  private applyGarage(): void {
    this.physics.tune = tuneFor(this.profile);
    const bike = BIKE_BY_ID[this.profile.bike] ?? BIKE_BY_ID['scram']!;
    this.bike.setPaint(bike.paint, bike.accent);
  }

  /** Applies settings.weather if unlocked; otherwise snaps the setting back to clear. */
  private applyWeather(initial: boolean): void {
    const want: WeatherId = this.settings.weather;
    const unlocked =
      want === 'clear' ||
      import.meta.env.DEV ||
      this.params.has('weather') ||
      this.profile.unlocks.includes(`weather:${want}`);
    if (!unlocked) {
      const hint: Record<string, string> = {
        rain: 'Monsoon unlocks with the Wayanad mission "Dry socks"',
        fog: 'Ghat fog unlocks with the Munnar mission "Not a scratch"',
        snow: 'Snow unlocks with the Ladakh mission "Supplies for Nubra"',
      };
      this.hud.setStatus(hint[want] ?? 'Locked');
      setTimeout(() => this.hud.setStatus(null), 3500);
      this.settings.weather = 'clear';
      this.hud.setSegment('weather', 'clear');
      saveSettings(this.settings);
    }
    if (this.world.weatherId !== this.settings.weather || initial) {
      this.world.setWeather(this.settings.weather);
      this.applyLook();
    }
  }

  // ------------------------------------------------------------------ photo mode -----------
  private openPhoto(): void {
    if (this.attract || this.photo.visible) return;
    this.photoReturn = this.summary.visible ? 'summary' : this.paused ? 'paused' : 'ride';
    this.summary.hide();
    this.paused = true;
    this.hud.setPaused(false);
    this.hud.root.classList.add('photo-open');
    this.photo.yaw = this.physics.heading + 0.7;
    this.photo.show(this.settings.timeOfDay);
    track('photo', { open: true });
  }

  private closePhoto(): void {
    if (!this.photo.visible) return;
    this.photo.hide();
    this.hud.root.classList.remove('photo-open');
    this.chase.resetSmoothing();
    this.camera.fov = 58;
    this.camera.updateProjectionMatrix();
    if (this.photoReturn === 'summary') {
      this.paused = false;
      this.summary.root.hidden = false;
      this.summary.root.classList.add('open');
    } else if (this.photoReturn === 'paused') {
      this.hud.setPaused(true);
    } else {
      this.paused = false;
      this.clock.getDelta();
    }
    this.photoReturn = null;
  }

  private async capturePhoto(): Promise<void> {
    // Render this exact frame, then read the canvas back before the next clear.
    this.photo.applyCamera(this.camera, this.bike.root.position, this.world.heightAt);
    if (this.post) this.post.render(0);
    else this.renderer.render(this.scene, this.camera);
    const def = this.world.def;
    const sub =
      this.run.scored && this.scoring.rounded > 0
        ? `${this.scoring.rounded.toLocaleString('en-IN')} pts · ${def.place}`
        : def.place;
    try {
      const blob = await composePhoto(this.renderer.domElement, def.name, sub);
      const outcome = await shareCard(blob, `Riding ${def.name} in Bike Rider`, this.shareUrl());
      this.hud.setStatus(
        outcome === 'shared'
          ? 'Photo shared'
          : outcome === 'copied-image'
            ? 'Photo copied to clipboard'
            : outcome === 'downloaded'
              ? 'Photo saved'
              : 'Photo link copied',
      );
      setTimeout(() => this.hud.setStatus(null), 2500);
      track('photo', { outcome });
    } catch {
      this.hud.setStatus('Could not capture photo');
      setTimeout(() => this.hud.setStatus(null), 2500);
    }
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
            this.live.cleanM = 0;
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
      this.live.cleanM = 0;
      p.impulse(c.side, 0.45 + r.damage);
      this.chase.kick(0.6 + r.damage);
      this.hud.flashHit();
      this.hud.popBonus(
        t('bonus.hit', { what: o.label.toLowerCase() }),
        -Math.round(r.damage * 100),
        'hit',
      );
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
      this.live.currentCombo = this.scoring.combo;
      const label =
        bonus.combo > 1 ? t('bonus.nearMissCombo', { n: bonus.combo }) : t('bonus.nearMiss');
      this.hud.popBonus(
        nm.oncoming ? `${label} · ${t('bonus.oncoming')}` : label,
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
    this.hud.popBonus(t('bonus.crash', { what: label.toLowerCase() }), 0, 'hit');
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
    if (!initial) this.applyWeather(false);
    if (s.language !== getLang()) setLanguage(s.language);
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
    if (this.photo.visible) {
      this.photo.applyCamera(this.camera, this.bike.root.position, this.world.heightAt);
      this.world.update(0, this.physics.position, this.camera.position, 0, this.physics.forward);
    }

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
      if (p.surface === 'asphalt' && this.world.roadIsWet) p.surface = 'wet';
      this.wetStep = false;
      p.update(FIXED_DT, drive);
      const step = Math.abs(p.frameDistance);
      this.distance += step;
      this.bike.spin(p.frameDistance);
      if (run.active) {
        const braking = drive.brake > 0 || drive.handbrake;
        run.stats.distanceM += step;
        run.stats.topKmh = Math.max(run.stats.topKmh, p.speedKmh);
        this.ghostRec.sample(run.stats.durationS, p);
        if (this.mission) this.updateMission(FIXED_DT, step, braking);
        if (this.route) this.updateRoute();
        this.health.tick(FIXED_DT);
        const bonus = this.scoring.update(
          FIXED_DT,
          step,
          p.speedKmh,
          p.surface,
          braking,
          p.yawRate,
        );
        if (bonus)
          this.hud.popBonus(
            bonus.kind === 'corner'
              ? t('bonus.corner')
              : bonus.kind === 'speed'
                ? t('bonus.speed')
                : bonus.label,
            bonus.points,
            bonus.kind,
          );
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
    if (run.active || run.phase === 'countdown') {
      this.ghost?.update(run.stats.durationS);
      for (const g of this.others) g.update(run.stats.durationS);
    }

    const gravelly = p.surface !== 'asphalt' && p.surface !== 'wet' ? 1 : 0;
    const roughness =
      gravelly * Math.min(1, p.speedRatio * 2.5) + (1 - p.speedRatio) * 0.08 * p.rpm;
    this.chase.update(simDt, p, roughness, this.elapsed);
    this.world.update(simDt, p.position, this.camera.position, p.speed, p.forward);

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
    this.missionsPanel.dispose();
    this.garage.dispose();
    this.routesPanel.dispose();
    this.photo.dispose();
    this.clearOthers();
    this.post?.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }
}

function freshLive(): MissionLive {
  return { score: 0, brakeTaps: 0, noBrakeM: 0, cleanM: 0, parcels: 0, currentCombo: 0 };
}

/** The current run's own samples as a Float32Array (round-trips through the serializer). */
function deserializeOwn(rec: GhostRecorder): Float32Array | null {
  try {
    const b64 = rec.serialize();
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Float32Array(bytes.buffer);
  } catch {
    return null;
  }
}

/** English indefinite article for the crash line; other languages ignore it. */
function articled(noun: string): string {
  if (getLang() !== 'en') return noun;
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
}
