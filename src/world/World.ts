import { Color, Scene, Vector3, WebGLRenderer } from 'three';
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
import { Vegetation } from './Vegetation';

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
  }

  setTimeOfDay(t: TimeOfDay): void {
    this.time = t;
    this.atmosphere.apply(this.def, t, (e) => (this._exposure = e));
    this.city?.setNight(this.atmosphere.isNight, this.atmosphere.isDusk);
    this.scene.background = null; // the sky mesh is the background
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

  spawnAt(z: number): { x: number; z: number; heading: number } {
    return { x: this.path.centerX(z), z, heading: this.path.heading(z) };
  }

  update(dt: number, bikePos: Vector3, cameraPos: Vector3): void {
    this.atmosphere.update(bikePos, cameraPos);
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
    this.terrain = this.road = this.veg = this.ocean = this.city = null;
    if (all) this.atmosphere.dispose();
  }
}
