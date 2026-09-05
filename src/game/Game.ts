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
import { EXTERNAL_BIKE_MODEL, ROAD } from '../core/config';
import { Input } from '../core/Input';
import {
  autoQuality,
  loadSettings,
  saveSettings,
  type Quality,
  type Settings,
} from '../core/settings';
import { Hud } from '../ui/Hud';
import { Dust } from '../world/Dust';
import { World } from '../world/World';
import { roadCenterX } from '../world/roadPath';
import { Bike, loadExternalBike } from './Bike';
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
  private physics = new BikePhysics();
  private input = new Input();
  private hud: Hud;
  private dust: Dust;
  private audio = new EngineAudio();
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
  /** Dev aids via URL: ?autodrive (rides itself), ?camera=chase|cockpit|cinematic, ?time=day|dusk */
  private params = new URLSearchParams(location.search);
  private autodrive = this.params.has('autodrive');

  constructor(private container: HTMLElement) {
    const stored = localStorage.getItem('bike-rider.settings.v1');
    this.firstRun = !stored;
    this.settings = loadSettings();
    if (this.firstRun) this.settings.quality = autoQuality();
    const camParam = this.params.get('camera');
    if (camParam === 'chase' || camParam === 'cockpit' || camParam === 'cinematic')
      this.settings.cameraMode = camParam;
    const timeParam = this.params.get('time');
    if (timeParam === 'day' || timeParam === 'dusk') this.settings.timeOfDay = timeParam;

    this.renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(58, 1, 0.1, 1500);
    this.chase = new ChaseCamera(this.camera);
    this.chase.setMode(this.settings.cameraMode);

    this.world = new World(this.scene, this.settings.quality);
    this.scene.add(this.bike.root);
    this.dust = new Dust(this.renderer.getPixelRatio());
    this.scene.add(this.dust.points);

    this.hud = new Hud(container, this.settings, this.input, {
      onReset: () => this.reset(),
      onTogglePause: () => this.togglePause(),
      onCycleCamera: () => this.cycleCamera(),
      onSettingsChange: (s) => this.applySettings(s),
    });

    this.input.on('KeyR', () => this.reset());
    this.input.on('KeyC', () => this.cycleCamera());
    this.input.on('KeyP', () => this.togglePause());
    this.input.on('Escape', () => this.togglePause());

    window.addEventListener('resize', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.paused && !this.autodrive) this.togglePause();
    });

    this.applySettings(this.settings, true);
    this.reset();
    this.onResize();

    if (EXTERNAL_BIKE_MODEL) {
      loadExternalBike(EXTERNAL_BIKE_MODEL, this.bike).catch((err) => {
        console.warn('External bike model failed to load, using procedural bike.', err);
      });
    }

    this.clock.start();
    this.raf = requestAnimationFrame(this.frame);
  }

  // -------------------------------------------------------------------------------------
  private reset(): void {
    // Snap back onto the centreline at the nearest tile boundary ahead.
    const z = Math.min(0, Math.ceil(this.physics.position.z / ROAD.tileLength) * ROAD.tileLength);
    const spawn = this.world.spawnAt(z);
    this.physics.reset(spawn.x, spawn.z, spawn.heading);
    this.syncBikeTransform();
    this.chase.resetSmoothing();
    this.world.update(this.physics.position, this.camera.position);
  }

  private togglePause(): void {
    this.paused = !this.paused;
    this.hud.setPaused(this.paused);
    if (!this.paused) this.clock.getDelta(); // discard the paused interval
  }

  private cycleCamera(): void {
    const mode = this.chase.cycle();
    this.settings.cameraMode = mode;
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
    if (initial || s.timeOfDay !== prevTime) this.world.setTimeOfDay(s.timeOfDay);
    if (!initial && s.cameraMode !== prevCamera) {
      this.chase.setMode(s.cameraMode);
      this.hud.setCameraMode(s.cameraMode);
    }
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
    // Force materials to recompile with/without shadows.
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
  };

  // -------------------------------------------------------------------------------------
  private frame = (): void => {
    this.raf = requestAnimationFrame(this.frame);
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, MAX_FRAME_DT);

    // FPS sampling
    this.fpsAcc += rawDt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    if (!this.paused) {
      this.elapsed += dt;
      if (this.autodrive) this.applyAutodrive();
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
      this.syncBikeTransform();

      // Effects
      const p = this.physics;
      const gravelly = p.surface !== 'asphalt' ? 1 : 0;
      const roughness =
        gravelly * Math.min(1, p.speedRatio * 2.5) + (1 - p.speedRatio) * 0.08 * p.rpm;
      this.chase.update(dt, p, roughness, this.elapsed);
      this.world.update(p.position, this.camera.position);

      _back.copy(p.forward).multiplyScalar(-1);
      _rearContact.copy(p.position).addScaledVector(_back, 0.73);
      const braking = this.input.state.brake > 0 || this.input.state.handbrake;
      const skid = braking && Math.abs(p.speed) > 8 ? 25 : 0;
      const dustRate = gravelly ? 20 + p.speedRatio * 70 : skid;
      this.dust.update(dt, _rearContact, _back, Math.abs(p.speed), dustRate);

      this.bike.setLights(this.world.headlightsOn, braking && Math.abs(p.speed) > 0.5);
      this.audio.update(p.rpm, this.input.state.throttle, false);

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
    } else {
      this.audio.update(0.1, 0, true);
    }

    this.renderer.render(this.scene, this.camera);
  };

  /** Keeps the bike on the centreline with the throttle pinned. Dev/demo only. */
  private applyAutodrive(): void {
    const p = this.physics;
    const ahead = p.position.z - 12;
    const targetX = roadCenterX(ahead);
    const err = targetX - (p.position.x + p.forward.x * 12);
    this.input.setVirtual('up', true);
    this.input.setVirtual('right', err > 0.4);
    this.input.setVirtual('left', err < -0.4);
  }

  private syncBikeTransform(): void {
    const p = this.physics;
    this.bike.root.position.copy(p.position);
    this.bike.root.rotation.y = p.heading;
    this.bike.setLean(p.lean);
    this.bike.setSteer(p.steerAngle);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.audio.dispose();
    this.renderer.dispose();
  }
}
