import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
} from 'three';

export type WeatherId = 'clear' | 'rain' | 'fog' | 'snow';

export const WEATHER_LABEL: Record<WeatherId, string> = {
  clear: 'Clear',
  rain: 'Monsoon',
  fog: 'Ghat fog',
  snow: 'Snow',
};

interface WeatherParams {
  fogMult: number;
  exposureMult: number;
  wetRoad: boolean;
  /** Extra sky desaturation 0..1 */
  grey: number;
}

const PARAMS: Record<WeatherId, WeatherParams> = {
  clear: { fogMult: 1, exposureMult: 1, wetRoad: false, grey: 0 },
  rain: { fogMult: 1.7, exposureMult: 0.82, wetRoad: true, grey: 0.6 },
  fog: { fogMult: 3.2, exposureMult: 0.9, wetRoad: false, grey: 0.5 },
  snow: { fogMult: 1.9, exposureMult: 0.95, wetRoad: false, grey: 0.4 },
};

const RAIN_COUNT = 900;
const SNOW_COUNT = 700;
const BOX = 26; // metres around the camera
const _tmp = new Vector3();

/**
 * Rain streaks (line segments) or snow (points) that live in a box around the camera and wrap
 * as the rider moves, plus the fog / exposure / wet-road parameters the world applies.
 */
export class Weather {
  id: WeatherId = 'clear';
  private rain: LineSegments;
  private snow: Points;
  private rainPos: Float32Array;
  private snowPos: Float32Array;
  private snowVel: Float32Array;
  private lastCam = new Vector3();

  constructor(private scene: Scene) {
    this.rainPos = new Float32Array(RAIN_COUNT * 2 * 3);
    const rg = new BufferGeometry();
    rg.setAttribute('position', new BufferAttribute(this.rainPos, 3));
    this.rain = new LineSegments(
      rg,
      new LineBasicMaterial({
        color: new Color(0xbfd3e6),
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    );
    this.rain.frustumCulled = false;
    this.rain.visible = false;

    this.snowPos = new Float32Array(SNOW_COUNT * 3);
    this.snowVel = new Float32Array(SNOW_COUNT * 3);
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(this.snowPos, 3));
    this.snow = new Points(
      sg,
      new PointsMaterial({
        color: 0xffffff,
        size: 0.09,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    scene.add(this.rain, this.snow);
    for (let i = 0; i < RAIN_COUNT; i++) this.seedRain(i, true);
    for (let i = 0; i < SNOW_COUNT; i++) this.seedSnow(i, true);
  }

  get params(): WeatherParams {
    return PARAMS[this.id];
  }

  set(id: WeatherId): void {
    this.id = id;
    this.rain.visible = id === 'rain';
    this.snow.visible = id === 'snow';
  }

  private seedRain(i: number, anywhere: boolean): void {
    const c = this.lastCam;
    const x = c.x + (Math.random() - 0.5) * BOX;
    const z = c.z + (Math.random() - 0.5) * BOX;
    const y = anywhere ? c.y + Math.random() * BOX : c.y + BOX * 0.5 + Math.random() * 4;
    const o = i * 6;
    this.rainPos[o] = x;
    this.rainPos[o + 1] = y;
    this.rainPos[o + 2] = z;
    this.rainPos[o + 3] = x + 0.12;
    this.rainPos[o + 4] = y - 0.55;
    this.rainPos[o + 5] = z;
  }

  private seedSnow(i: number, anywhere: boolean): void {
    const c = this.lastCam;
    const o = i * 3;
    this.snowPos[o] = c.x + (Math.random() - 0.5) * BOX;
    this.snowPos[o + 1] = anywhere ? c.y + Math.random() * BOX * 0.6 : c.y + BOX * 0.4;
    this.snowPos[o + 2] = c.z + (Math.random() - 0.5) * BOX;
    this.snowVel[o] = (Math.random() - 0.5) * 0.6;
    this.snowVel[o + 1] = -(0.8 + Math.random() * 0.8);
    this.snowVel[o + 2] = (Math.random() - 0.5) * 0.6;
  }

  update(dt: number, cameraPos: Vector3, bikeForward: Vector3, bikeSpeed: number): void {
    this.lastCam.copy(cameraPos);
    if (this.rain.visible) {
      const fall = 14 * dt;
      // Streaks lean into the direction of travel so speed reads.
      const lean = Math.min(0.6, Math.abs(bikeSpeed) * 0.02);
      _tmp.copy(bikeForward).multiplyScalar(-lean);
      const p = this.rainPos;
      for (let i = 0; i < RAIN_COUNT; i++) {
        const o = i * 6;
        p[o + 1]! -= fall;
        p[o + 4]! -= fall;
        p[o + 3] = p[o]! + 0.12 + _tmp.x;
        p[o + 5] = p[o + 2]! + _tmp.z;
        // wrap horizontally with the camera
        if (
          Math.abs(p[o]! - cameraPos.x) > BOX * 0.5 ||
          Math.abs(p[o + 2]! - cameraPos.z) > BOX * 0.5
        )
          this.seedRain(i, true);
        else if (p[o + 1]! < cameraPos.y - 6) this.seedRain(i, false);
      }
      (this.rain.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    }
    if (this.snow.visible) {
      const p = this.snowPos;
      const v = this.snowVel;
      for (let i = 0; i < SNOW_COUNT; i++) {
        const o = i * 3;
        p[o]! += v[o]! * dt;
        p[o + 1]! += v[o + 1]! * dt;
        p[o + 2]! += v[o + 2]! * dt;
        if (
          Math.abs(p[o]! - cameraPos.x) > BOX * 0.5 ||
          Math.abs(p[o + 2]! - cameraPos.z) > BOX * 0.5
        )
          this.seedSnow(i, true);
        else if (p[o + 1]! < cameraPos.y - 4) this.seedSnow(i, false);
      }
      (this.snow.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    }
  }

  dispose(): void {
    this.rain.geometry.dispose();
    (this.rain.material as LineBasicMaterial).dispose();
    this.snow.geometry.dispose();
    (this.snow.material as PointsMaterial).dispose();
    this.scene.remove(this.rain, this.snow);
  }
}
