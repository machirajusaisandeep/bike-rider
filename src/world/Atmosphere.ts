import {
  AdditiveBlending,
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  MathUtils,
  PMREMGenerator,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { Quality, TimeOfDay } from '../core/settings';
import type { SceneDef } from './scenes';

/**
 * Physically based sky (Preetham model), sun + sky lighting, environment map baked from the sky,
 * and exponential fog tinted from the horizon. One call to `apply` sets the whole mood.
 */
export class Atmosphere {
  readonly sky = new Sky();
  readonly sun = new DirectionalLight(0xffffff, 3);
  readonly sunDir = new Vector3(0, 1, 0);
  readonly hemi = new HemisphereLight(0xffffff, 0x444444, 0.6);
  readonly ambient = new AmbientLight(0xffffff, 0.05);
  readonly fogColor = new Color();
  readonly horizonColor = new Color();
  readonly sunColor = new Color();
  fogDensity = 0.002;
  isNight = false;
  isDusk = false;
  private sunTarget = new Group();
  private sunSprite: Sprite;
  private pmrem: PMREMGenerator;
  private envScene = new Scene();
  private envTexture: import('three').Texture | null = null;

  constructor(
    private scene: Scene,
    renderer: WebGLRenderer,
    quality: Quality,
  ) {
    this.sky.scale.setScalar(45000);
    // The shader's own sun disc is astronomically bright and flares bloom; draw a bounded one.
    this.sky.material.uniforms.showSunDisc!.value = 0;
    scene.add(this.sky);
    this.sunSprite = new Sprite(
      new SpriteMaterial({
        map: sunTexture(),
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        fog: false,
        transparent: true,
      }),
    );
    this.sunSprite.renderOrder = -5;
    scene.add(this.sunSprite);
    this.pmrem = new PMREMGenerator(renderer);
    this.sun.castShadow = quality !== 'low';
    const cam = this.sun.shadow.camera;
    cam.left = -34;
    cam.right = 34;
    cam.top = 34;
    cam.bottom = -34;
    cam.near = 1;
    cam.far = 260;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.sun.target = this.sunTarget;
    scene.add(this.sun, this.sunTarget, this.hemi, this.ambient);
    this.setQuality(quality);
  }

  setQuality(q: Quality): void {
    this.sun.castShadow = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  /** Resolve the sun elevation for a scene + time-of-day setting. */
  static sunFor(def: SceneDef, time: TimeOfDay): { elevation: number; azimuth: number } {
    switch (time) {
      case 'day':
        return { elevation: Math.max(def.sun.elevation, 52), azimuth: def.sun.azimuth };
      case 'golden':
        return { elevation: 6, azimuth: def.sun.azimuth };
      case 'night':
        return { elevation: -12, azimuth: def.sun.azimuth };
      default:
        return def.sun;
    }
  }

  apply(def: SceneDef, time: TimeOfDay, exposureOut: (e: number) => void): void {
    const { elevation, azimuth } = Atmosphere.sunFor(def, time);
    const phi = MathUtils.degToRad(90 - elevation);
    const theta = MathUtils.degToRad(azimuth);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    this.isNight = elevation < 0;
    this.isDusk = elevation >= 0 && elevation < 12;

    const u = this.sky.material.uniforms;
    u.turbidity!.value = def.sky.turbidity;
    u.rayleigh!.value = this.isNight ? 0.2 : def.sky.rayleigh;
    u.mieCoefficient!.value = def.sky.mieCoefficient;
    u.mieDirectionalG!.value = def.sky.mieDirectionalG;
    (u.sunPosition!.value as Vector3).copy(this.sunDir);

    // Sun colour: white at noon, amber at the horizon.
    const low = MathUtils.clamp(1 - elevation / 30, 0, 1);
    this.sunColor.setRGB(1, MathUtils.lerp(0.97, 0.62, low), MathUtils.lerp(0.9, 0.3, low));
    this.sun.color.copy(this.sunColor);
    const sm = this.sunSprite.material;
    // HDR colour (>1) so it blooms; smaller and dimmer when it is night.
    sm.color.copy(this.sunColor).multiplyScalar(this.isNight ? 0.5 : 1.4);
    this.sunSprite.visible = elevation > -6;
    this.sunSprite.scale.setScalar(this.isNight ? 140 : 150 + low * 90);
    this.sun.intensity = this.isNight ? 0.6 : MathUtils.lerp(7.5, 4.5, low);
    if (this.isNight) this.sun.color.set(0x8fa6d6); // moonlight
    // The light comes from above the horizon even at "night" so shadows still make sense.
    const lightDir = this.sunDir.clone();
    if (lightDir.y < 0.12) lightDir.y = 0.12;
    lightDir.normalize();
    this.sun.position.copy(lightDir).multiplyScalar(120);
    this.lightDir.copy(lightDir);

    // Horizon / fog colour approximated from the sun height and the scene's own haze tint.
    const sceneFog = new Color(def.fog.color);
    const dayHorizon = new Color(0xcfe0ee).lerp(sceneFog, 0.55);
    const warmHorizon = new Color(0xf0a86a).lerp(sceneFog, 0.35);
    const nightHorizon = new Color(0x16213a).lerp(sceneFog, 0.15);
    this.horizonColor.copy(dayHorizon).lerp(warmHorizon, low);
    if (this.isNight) this.horizonColor.copy(nightHorizon);
    this.fogColor.copy(this.horizonColor);
    this.fogDensity = def.fog.density * (this.isNight ? 1.25 : 1);
    this.scene.fog = new FogExp2(this.fogColor.getHex(), this.fogDensity);

    this.hemi.color.copy(this.horizonColor).lerp(new Color(0xffffff), 0.3);
    this.hemi.groundColor.set(def.groundBounce);
    this.hemi.intensity = this.isNight ? 0.35 : MathUtils.lerp(1.7, 1.2, low);
    this.ambient.intensity = this.isNight ? 0.08 : 0.14;

    // The physical sky is bright: three's own sky demo runs at 0.5 exposure.
    exposureOut(def.exposure * 0.42 * (this.isNight ? 0.8 : 1));
    this.bakeEnvironment();
  }

  readonly lightDir = new Vector3(0, 1, 0);

  private bakeEnvironment(): void {
    // Render the sky itself into a PMREM so materials reflect the actual atmosphere.
    this.envScene.clear();
    const skyForEnv = new Sky();
    skyForEnv.scale.setScalar(4000);
    // The Preetham shader can emit huge / non-finite values (sun disc, below-horizon maths).
    // Blurred into a PMREM those poison every PBR material with NaN, so clamp and guard here.
    skyForEnv.material.fragmentShader = skyForEnv.material.fragmentShader.replace(
      'gl_FragColor = vec4( texColor, 1.0 );',
      `vec3 safe = texColor;
       if (any(isnan(safe)) || any(isinf(safe))) safe = vec3(0.0);
       safe = clamp(safe, vec3(0.0), vec3(3.0));
       gl_FragColor = vec4( safe, 1.0 );`,
    );
    skyForEnv.material.needsUpdate = true;
    const src = this.sky.material.uniforms;
    const dst = skyForEnv.material.uniforms;
    dst.showSunDisc!.value = 0;
    dst.turbidity!.value = src.turbidity!.value;
    dst.rayleigh!.value = src.rayleigh!.value;
    dst.mieCoefficient!.value = src.mieCoefficient!.value;
    dst.mieDirectionalG!.value = src.mieDirectionalG!.value;
    (dst.sunPosition!.value as Vector3).copy(src.sunPosition!.value as Vector3);
    this.envScene.add(skyForEnv);
    this.envTexture?.dispose();
    this.envTexture = this.pmrem.fromScene(this.envScene, 0, 1, 20000).texture;
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = this.isNight ? 0.35 : 1.0;
    skyForEnv.material.dispose();
    skyForEnv.geometry.dispose();
  }

  /** Follow the rider so the shadow frustum stays useful. */
  update(bikePos: Vector3, cameraPos: Vector3): void {
    this.sunTarget.position.copy(bikePos);
    this.sun.position.copy(bikePos).addScaledVector(this.lightDir, 120);
    this.sky.position.copy(cameraPos);
    this.sunSprite.position.copy(cameraPos).addScaledVector(this.sunDir, 5000);
  }

  dispose(): void {
    this.pmrem.dispose();
    this.envTexture?.dispose();
  }
}

/** Soft radial sun disc with a faint corona. */
function sunTexture(): CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,250,235,1)');
  g.addColorStop(0.2, 'rgba(255,240,210,0.55)');
  g.addColorStop(0.5, 'rgba(255,220,170,0.12)');
  g.addColorStop(1, 'rgba(255,200,140,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(c);
}
