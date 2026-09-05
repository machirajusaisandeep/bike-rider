import { Color, Scene, Vector3, WebGLRenderer } from 'three';
import { TRAFFIC } from '../core/config';
import type { Quality, TimeOfDay } from '../core/settings';
import type { Surface } from '../game/BikePhysics';
import { Atmosphere } from './Atmosphere';
import { City } from './City';
import { HeightField } from './heights';
import { Ocean } from './Ocean';
import { Road } from './Road';
import { RoadPath } from './roadPath';
import { SCENE_BY_ID, type SceneDef, type SceneId } from './scenes';
import { Terrain } from './Terrain';
import { Traffic } from './Traffic';
import { Weather, type WeatherId } from './Weather';
import { Gates } from './Gates';
import type { Checkpoint } from '../game/routes';
import { Vegetation } from './Vegetation';

const _fwd = new Vector3(0, 0, -1);

/**
 * Owns everything that is "the place": atmosphere, terrain, road, vegetation, water, city.
 * `load(sceneId)` tears the previous place down and builds the new one; the bike is untouched.
 */
export class World {
  readonly atmosphere: Atmosphere;
  def!: SceneDef;
  path!: RoadPath;
  heights!: HeightField;
  private terrain: Terrain | null = null;
  private road: Road | null = null;
  private veg: Vegetation | null = null;
  private ocean: Ocean | null = null;
  private city: City | null = null;
  traffic: Traffic | null = null;
  readonly weather: Weather;
  private gates: Gates | null = null;
  private quality: Quality;
  private time: TimeOfDay = 'auto';
  private _exposure = 1;

  constructor(
    readonly scene: Scene,
    renderer: WebGLRenderer,
    quality: Quality,
  ) {
    this.quality = quality;
    this.atmosphere = new Atmosphere(scene, renderer, quality);
    this.weather = new Weather(scene);
  }

  get exposure(): number {
    return this._exposure;
  }

  get sceneId(): SceneId {
    return this.def.id;
  }

  load(id: SceneId, time: TimeOfDay): void {
    this.dispose(false);
    this.def = SCENE_BY_ID[id];
    this.path = new RoadPath(this.def);
    this.heights = new HeightField(this.def, this.path);
    this.terrain = new Terrain(this.heights, this.def);
    this.road = new Road(this.heights, this.def);
    this.veg = new Vegetation(this.heights, this.def, this.quality);
    this.scene.add(this.terrain.group, this.road.group, this.veg.group);
    if (this.def.water) {
      this.ocean = new Ocean(this.def);
      this.scene.add(this.ocean.mesh);
    }
    if (this.def.city) {
      this.city = new City(this.heights, this.def);
      this.scene.add(this.city.group);
    }
    this.setTimeOfDay(time);
    this.road.setWet(this.weather.params.wetRoad);
  }

  /** Route checkpoint gates; null removes them. */
  setGates(checkpoints: Checkpoint[] | null): void {
    this.gates?.dispose();
    this.gates = null;
    if (!checkpoints) return;
    this.gates = new Gates(this.heights, checkpoints);
    this.scene.add(this.gates.group);
  }

  /** (Re)creates traffic for a run. Pass `null` density to remove traffic (free ride). */
  setTraffic(seed: number | null, density = 1): void {
    this.traffic?.dispose();
    this.traffic = null;
    if (seed === null) return;
    this.traffic = new Traffic(this.heights, this.def, seed, this.quality, density);
    this.traffic.setLamps(this.headlightsOn);
    this.scene.add(this.traffic.group);
  }

  setTimeOfDay(t: TimeOfDay): void {
    this.time = t;
    this.atmosphere.apply(this.def, t, (e) => (this._exposure = e));
    this.city?.setNight(this.atmosphere.isNight, this.atmosphere.isDusk);
    this.traffic?.setLamps(this.headlightsOn);
    this.scene.background = null; // the sky mesh is the background
    this.applyWeatherParams();
  }

  setWeather(id: WeatherId): void {
    this.weather.set(id);
    this.applyWeatherParams();
  }

  get weatherId(): WeatherId {
    return this.weather.id;
  }

  /** Rain makes every tarmac contact 'wet'. */
  get roadIsWet(): boolean {
    return this.weather.params.wetRoad;
  }

  private applyWeatherParams(): void {
    const w = this.weather.params;
    const fog = this.scene.fog as { density?: number } | null;
    if (fog && 'density' in fog) fog.density = this.atmosphere.fogDensity * w.fogMult;
    this._exposure *= w.exposureMult;
    this.road?.setWet(w.wetRoad);
    this.atmosphere.setGrey(w.grey);
  }

  get timeOfDay(): TimeOfDay {
    return this.time;
  }

  get headlightsOn(): boolean {
    return this.atmosphere.isNight || this.atmosphere.isDusk;
  }

  get dustColor(): number {
    return new Color(this.def.dust).getHex();
  }

  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.atmosphere.setQuality(q);
    // Vegetation density depends on quality: rebuild it.
    if (this.veg) {
      this.veg.dispose();
      this.veg = new Vegetation(this.heights, this.def, q);
      this.scene.add(this.veg.group);
    }
  }

  heightAt = (x: number, z: number): number => this.heights.height(x, z);

  surfaceAt(x: number, z: number): Surface {
    const d = Math.abs(this.path.lateral(x, z));
    if (d <= this.path.width / 2 + 0.15) return 'asphalt';
    if (d <= this.path.width / 2 + this.path.shoulder + 0.6) return 'gravel';
    return 'off';
  }

  distanceFromRoad(x: number, z: number): number {
    return Math.abs(this.path.lateral(x, z));
  }

  /** True when the rider has fallen into the sea or off a cliff drop. */
  isLost(x: number, z: number, y: number): boolean {
    if (this.def.water && y < this.def.water.level + 0.5) return true;
    return this.distanceFromRoad(x, z) > 60 || y < this.path.elevation(z) - 25;
  }

  /**
   * Spawn in the left-hand (same-direction) lane rather than astride the centre line: India
   * drives on the left, and on the ring road the median carries metro piers.
   */
  spawnAt(z: number): { x: number; z: number; heading: number } {
    const half = this.path.width / 2;
    const lane = this.path.width >= 9 ? half * 0.36 : half * TRAFFIC.laneFraction;
    return { x: this.path.centerX(z) - lane, z, heading: this.path.heading(z) };
  }

  update(
    dt: number,
    bikePos: Vector3,
    cameraPos: Vector3,
    bikeSpeed = 0,
    bikeForward: Vector3 = _fwd,
  ): void {
    this.atmosphere.update(bikePos, cameraPos);
    this.traffic?.update(dt, bikePos.z, bikeSpeed);
    this.weather.update(dt, cameraPos, bikeForward, bikeSpeed);
    this.terrain?.update(bikePos);
    this.road?.update(bikePos.z);
    this.veg?.update(bikePos.z);
    this.city?.update(bikePos.z);
    this.ocean?.update(
      dt,
      cameraPos,
      this.atmosphere.sunDir,
      this.atmosphere.horizonColor,
      this.atmosphere.sunColor,
      this.atmosphere.fogColor,
      this.atmosphere.fogDensity,
    );
  }

  dispose(all = true): void {
    this.terrain?.dispose();
    this.road?.dispose();
    this.veg?.dispose();
    this.ocean?.dispose();
    this.city?.dispose();
    this.traffic?.dispose();
    this.gates?.dispose();
    this.terrain = this.road = this.veg = this.ocean = this.city = null;
    this.traffic = null;
    this.gates = null;
    if (all) {
      this.atmosphere.dispose();
      this.weather.dispose();
    }
  }
}
