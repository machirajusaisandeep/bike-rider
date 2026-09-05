import {
  AmbientLight,
  Color,
  ConeGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import { ROAD } from '../core/config';
import type { Quality, TimeOfDay } from '../core/settings';
import type { Surface } from '../game/BikePhysics';
import { Road } from './Road';
import { Sky, type SkyPreset } from './Sky';
import { roadCenterX, roadHeading, seededRandom } from './roadPath';
import { groundTexture } from './textures';

interface Preset extends SkyPreset {
  fog: number;
  fogNear: number;
  fogFar: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  ambient: number;
  hillColor: number;
  groundTint: number;
  dust: number;
  headlights: boolean;
}

const PRESETS: Record<TimeOfDay, Preset> = {
  day: {
    top: 0x3f86d6,
    horizon: 0xcfe1f2,
    bottom: 0x7d8f9a,
    sun: 0xfff2dc,
    sunDir: new Vector3(0.45, 0.62, 0.35).normalize(),
    fog: 0xc9dced,
    fogNear: 60,
    fogFar: 520,
    sunIntensity: 2.6,
    hemiSky: 0xbfd7ee,
    hemiGround: 0x5c6b46,
    hemiIntensity: 0.75,
    ambient: 0.15,
    hillColor: 0x6f8aa5,
    groundTint: 0xffffff,
    dust: 0xc6b696,
    headlights: false,
  },
  dusk: {
    top: 0x1d2451,
    horizon: 0xf28a4e,
    bottom: 0x4b3a45,
    sun: 0xffb070,
    sunDir: new Vector3(-0.7, 0.14, -0.55).normalize(),
    fog: 0xc98263,
    fogNear: 40,
    fogFar: 420,
    sunIntensity: 1.5,
    hemiSky: 0x6a5c8e,
    hemiGround: 0x3d2e2a,
    hemiIntensity: 0.5,
    ambient: 0.12,
    hillColor: 0x5b3f52,
    groundTint: 0xd6b39a,
    dust: 0xd39a78,
    headlights: true,
  },
};

const HILL_PERIOD = 1400;
const HILL_COUNT = 28;

export class World {
  readonly sun: DirectionalLight;
  readonly sky = new Sky();
  readonly road = new Road();
  private hemi: HemisphereLight;
  private ambient: AmbientLight;
  private ground: Mesh;
  private groundMat: MeshStandardMaterial;
  private hills: InstancedMesh;
  private hillBase: { x: number; z: number; s: Vector3 }[] = [];
  private hillGroup = new Group();
  private sunTarget = new Group();
  private preset: Preset = PRESETS.day;
  private time: TimeOfDay = 'day';

  constructor(
    readonly scene: Scene,
    quality: Quality,
  ) {
    scene.add(this.sky.mesh);
    scene.add(this.road.group);

    // Ground: a large plane that follows the rider, snapped to the texture period.
    const gtex = groundTexture();
    gtex.repeat.set(60, 60);
    this.groundMat = new MeshStandardMaterial({ map: gtex, roughness: 1, metalness: 0 });
    this.ground = new Mesh(new PlaneGeometry(1200, 1200), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    scene.add(this.ground);

    // Distant hills, tiled along the route so they scroll with real parallax.
    const rnd = seededRandom(99);
    this.hills = new InstancedMesh(
      new ConeGeometry(1, 1, 9, 1),
      new MeshStandardMaterial({ color: 0x6f8aa5, roughness: 1, flatShading: true }),
      HILL_COUNT,
    );
    this.hills.frustumCulled = false;
    for (let i = 0; i < HILL_COUNT; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (170 + rnd() * 260);
      const z = -(i / HILL_COUNT) * HILL_PERIOD + rnd() * 40;
      const r = 90 + rnd() * 150;
      const h = 28 + rnd() * 70;
      this.hillBase.push({ x, z, s: new Vector3(r, h, r * (0.7 + rnd() * 0.6)) });
    }
    this.hillGroup.add(this.hills);
    scene.add(this.hillGroup);

    // Lights
    this.hemi = new HemisphereLight(0xffffff, 0x444444, 0.7);
    this.ambient = new AmbientLight(0xffffff, 0.15);
    this.sun = new DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = quality !== 'low';
    const cam = this.sun.shadow.camera;
    cam.left = -22;
    cam.right = 22;
    cam.top = 22;
    cam.bottom = -22;
    cam.near = 1;
    cam.far = 160;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.sun.target = this.sunTarget;
    scene.add(this.hemi, this.ambient, this.sun, this.sunTarget);
    this.setQuality(quality);
    this.setTimeOfDay('day');
  }

  get timeOfDay(): TimeOfDay {
    return this.time;
  }

  get headlightsOn(): boolean {
    return this.preset.headlights;
  }

  get dustColor(): number {
    return this.preset.dust;
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

  setTimeOfDay(t: TimeOfDay): void {
    this.time = t;
    const p = PRESETS[t];
    this.preset = p;
    this.sky.apply(p);
    this.scene.fog = new Fog(p.fog, p.fogNear, p.fogFar);
    this.scene.background = new Color(p.fog);
    this.sun.color.setHex(p.sun);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.setHex(p.hemiSky);
    this.hemi.groundColor.setHex(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.ambient.intensity = p.ambient;
    (this.hills.material as MeshStandardMaterial).color.setHex(p.hillColor);
    this.groundMat.color.setHex(p.groundTint);
  }

  /** Which surface is under (x, z). */
  surfaceAt(x: number, z: number): Surface {
    const d = Math.abs(x - roadCenterX(z));
    if (d <= ROAD.width / 2 + 0.15) return 'asphalt';
    if (d <= ROAD.width / 2 + ROAD.shoulder + 0.6) return 'gravel';
    return 'off';
  }

  distanceFromRoad(x: number, z: number): number {
    return Math.abs(x - roadCenterX(z));
  }

  /** A clean spawn on the centreline near z, pointing down the road. */
  spawnAt(z: number): { x: number; z: number; heading: number } {
    return { x: roadCenterX(z), z, heading: roadHeading(z) };
  }

  private _m = new Matrix4();
  private _q = new Quaternion();
  private _p = new Vector3();

  update(bikePos: Vector3, cameraPos: Vector3): void {
    this.sky.update(cameraPos);
    this.road.update(bikePos.z);

    // Ground follows the rider, snapped to the texture tile so it never appears to slide.
    const unit = 1200 / 60;
    this.ground.position.set(
      Math.round(bikePos.x / unit) * unit,
      0,
      Math.round(bikePos.z / unit) * unit,
    );

    // Sun + shadow frustum follow the rider.
    this.sunTarget.position.copy(bikePos);
    this.sun.position.copy(bikePos).addScaledVector(this.preset.sunDir, 80);

    // Wrap hills around the rider along z.
    for (let i = 0; i < this.hillBase.length; i++) {
      const b = this.hillBase[i]!;
      let dz = b.z - bikePos.z;
      dz = ((((dz + HILL_PERIOD / 2) % HILL_PERIOD) + HILL_PERIOD) % HILL_PERIOD) - HILL_PERIOD / 2;
      this._p.set(b.x, b.s.y / 2 - 2, bikePos.z + dz);
      this.hills.setMatrixAt(i, this._m.compose(this._p, this._q, b.s));
    }
    this.hills.instanceMatrix.needsUpdate = true;
  }
}
