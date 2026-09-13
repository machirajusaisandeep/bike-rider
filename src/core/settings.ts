import { DEFAULT_RIDER, sanitizeRider, type RiderConfig } from '../game/gear';
import { DEFAULT_SCENE, isSceneId, type SceneId } from '../world/scenes';

export type Quality = 'low' | 'medium' | 'high';
export type TimeOfDay = 'auto' | 'day' | 'golden' | 'night';
export type Units = 'kmh' | 'mph';
export type CameraMode = 'chase' | 'cockpit' | 'cinematic' | 'tank';
export type QualityMode = 'auto' | Quality;
export type WeatherSetting = 'clear' | 'rain' | 'fog' | 'snow';

export interface Settings {
  scene: SceneId;
  rider: RiderConfig;
  quality: Quality;
  qualityMode: QualityMode;
  timeOfDay: TimeOfDay;
  units: Units;
  touchControls: 'auto' | 'on' | 'off';
  sound: boolean;
  cameraMode: CameraMode;
  weather: WeatherSetting;
  language: 'en' | 'hi' | 'kn' | 'ta' | 'ml';
  haptics: boolean;
}

const KEY = 'bike-rider.settings.v2';

export const DEFAULT_SETTINGS: Settings = {
  scene: DEFAULT_SCENE,
  rider: DEFAULT_RIDER,
  quality: 'high',
  qualityMode: 'auto',
  timeOfDay: 'auto',
  units: 'kmh',
  touchControls: 'auto',
  sound: false,
  cameraMode: 'chase',
  weather: 'clear',
  language: 'en',
  haptics: true,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const s = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    if (!isSceneId(s.scene)) s.scene = DEFAULT_SCENE;
    s.rider = sanitizeRider(s.rider);
    if (!['auto', 'day', 'golden', 'night'].includes(s.timeOfDay)) s.timeOfDay = 'auto';
    if (!['clear', 'rain', 'fog', 'snow'].includes(s.weather)) s.weather = 'clear';
    if (!['en', 'hi', 'kn', 'ta', 'ml'].includes(s.language)) s.language = 'en';
    if (!['auto', 'low', 'medium', 'high'].includes(s.qualityMode)) s.qualityMode = s.quality;
    if (typeof s.haptics !== 'boolean') s.haptics = true;
    if (!['chase', 'cockpit', 'cinematic', 'tank'].includes(s.cameraMode)) s.cameraMode = 'chase';
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. – ignore */
  }
}

/** Pick a sensible default quality for the device on first run. */
export function autoQuality(): Quality {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (coarse && cores <= 4) return 'low';
  if (coarse || cores <= 4) return 'medium';
  return 'high';
}

export function isTouchDevice(): boolean {
  return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}
