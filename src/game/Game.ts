import {
  ACESFilmicToneMapping,
  Clock,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  DRACO_DECODER_PATH,
  EXTERNAL_BIKE_MODEL,
  ROAD,
  WHITE_FLAME_RECOLOUR,
} from '../core/config';
import { Input } from '../core/Input';
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
import { Dust } from '../world/Dust';
import { isSceneId, type SceneId } from '../world/scenes';
import { World } from '../world/World';
import { Bike, loadExternalBike } from './Bike';
import { FACES, GEAR_BY_ID, HAIR, protectionFor, sanitizeRider, type RiderConfig } from './gear';
import { Rider } from './Rider';
import { BikePhysics } from './BikePhysics';
import { ChaseCamera } from './ChaseCamera';
import { EngineAudio } from './EngineAudio';

const FIXED_DT = 1 / 120;
const MAX_FRAME_DT = 1 / 20;

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
  private dust: Dust;
  private audio = new EngineAudio();
  private post: PostFX | null = null;
  private settings: Settings;
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
  /** Dev aids via URL: ?autodrive, ?camera=..., ?time=..., ?scene=..., ?nomenu */
  private params = new URLSearchParams(location.search);
  private autodrive = this.params.has('autodrive');
  /** Menu is up: the world rides itself in cinematic view behind it. */
  private attract = false;
  private savedCamera: Settings['cameraMode'];

  constructor(private container: HTMLElement) {
    const stored = localStorage.getItem('bike-rider.settings.v2');
    this.firstRun = !stored;
    this.settings = loadSettings();
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
      onReset: () => this.reset(),
      onTogglePause: () => this.togglePause(),
      onCycleCamera: () => this.cycleCamera(),
      onSettingsChange: (s) => this.applySettings(s),
      onOpenScenes: () => this.openMenu(),
    });
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
    });

    this.input.on('KeyR', () => !this.attract && this.reset());
    this.input.on('KeyC', () => !this.attract && this.cycleCamera());
    this.input.on('KeyP', () => !this.attract && this.togglePause());
    this.input.on('Escape', () => (this.attract ? undefined : this.openMenu()));

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
    } else {
      this.openMenu(this.params.get('step') === 'scene' ? 'scene' : 'rider');
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

  /** Current protection score 0..100 for the upcoming health system. */
  get protection(): number {
    return protectionFor(this.settings.rider).total;
  }

  // ------------------------------------------------------------------ scenes / menu ------
  private openMenu(step: 'rider' | 'scene' = 'scene'): void {
    if (this.attract) return;
    this.attract = true;
    this.paused = false;
    this.hud.setPaused(false);
    this.hud.setMenuOpen(true);
    this.savedCamera = this.settings.cameraMode;
    this.chase.setMode('cinematic');
    this.menu.select(this.settings.scene, false);
    this.menu.show(step);
    this.onMenuStep(step);
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

  private standRider(): void {
    const p = this.physics;
    // Stand 1.4 m to the rider's right of the parked bike, facing the camera side.
    const right = new Vector3(-p.forward.z, 0, p.forward.x);
    const pos = p.position.clone().addScaledVector(right, 1.5).addScaledVector(p.forward, -0.2);
    pos.y = this.world.heightAt(pos.x, pos.z);
    this.scene.add(this.rider.root);
    this.rider.root.position.copy(pos);
    this.rider.root.rotation.set(0, p.heading + Math.PI / 2 + 0.35, 0);
    this.rider.root.scale.setScalar(1);
    this.rider.setPose('stand');
    this.riderStanding = true;
  }

  private seatRider(): void {
    this.rider.setShowHelmet(true);
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

  private startRide(id: SceneId): void {
    this.switchScene(id);
    this.menu.hide();
    this.attract = false;
    this.hud.setMenuOpen(false);
    this.seatRider();
    this.chase.setFocus(null);
    this.chase.setCloseUp(false);
    this.chase.setMode(this.savedCamera);
    this.hud.setCameraMode(this.savedCamera);
    this.reset();
    this.clock.getDelta();
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
  private reset(): void {
    const z = Math.min(0, Math.ceil(this.physics.position.z / ROAD.tileLength) * ROAD.tileLength);
    const spawn = this.world.spawnAt(z);
    this.physics.reset(spawn.x, spawn.z, spawn.heading);
    this.syncBikeTransform();
    this.chase.resetSmoothing();
    this.world.update(0, this.physics.position, this.camera.position);
  }

  private togglePause(): void {
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

    if (!this.paused) {
      this.elapsed += dt;
      if (this.autodrive || (this.attract && !this.riderStanding)) this.applyAutodrive();
      else if (this.riderStanding) {
        this.input.setVirtual('up', false);
        this.input.setVirtual('left', false);
        this.input.setVirtual('right', false);
      }
      this.input.update(dt);
      this.accumulator += dt;
      while (this.accumulator >= FIXED_DT) {
        this.physics.surface = this.world.surfaceAt(
          this.physics.position.x,
          this.physics.position.z,
        );
        this.physics.update(FIXED_DT, this.input.state);
        this.distance += Math.abs(this.physics.frameDistance);
        this.bike.spin(this.physics.frameDistance);
        this.accumulator -= FIXED_DT;
      }
      const p = this.physics;
      if (this.world.isLost(p.position.x, p.position.z, p.position.y)) this.reset();
      this.syncBikeTransform();

      const gravelly = p.surface !== 'asphalt' ? 1 : 0;
      const roughness =
        gravelly * Math.min(1, p.speedRatio * 2.5) + (1 - p.speedRatio) * 0.08 * p.rpm;
      this.chase.update(dt, p, roughness, this.elapsed);
      this.world.update(dt, p.position, this.camera.position);

      _back.copy(p.forward).multiplyScalar(-1);
      _rearContact.copy(p.position).addScaledVector(_back, 0.73);
      const braking = this.input.state.brake > 0 || this.input.state.handbrake;
      const skid = braking && Math.abs(p.speed) > 8 ? 25 : 0;
      const dustRate = gravelly ? 20 + p.speedRatio * 70 : skid;
      this.dust.update(dt, _rearContact, _back, Math.abs(p.speed), dustRate);

      this.bike.setLights(this.world.headlightsOn, braking && Math.abs(p.speed) > 0.5);
      this.rider.update(p.steerAngle, dt);
      this.audio.update(p.rpm, this.input.state.throttle, this.attract);

      if (!this.attract) {
        this.hud.update({
          speedKmh: p.speedKmh,
          gear: p.gear,
          rpm: p.rpm,
          surface: p.surface,
          offRoute: this.world.distanceFromRoad(p.position.x, p.position.z) > ROAD.offRouteDistance,
          distanceKm: this.distance / 1000,
          fps: this.fps,
          moving: p.speedKmh > 2,
        });
      }
    } else {
      this.audio.update(0.1, 0, true);
    }

    if (this.post) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);
  };

  /** Keeps the bike on the centreline with a relaxed throttle. Attract mode + dev aid. */
  private applyAutodrive(): void {
    const p = this.physics;
    const ahead = p.position.z - 12;
    const targetX = this.world.path.centerX(ahead);
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
    this.post?.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }
}
