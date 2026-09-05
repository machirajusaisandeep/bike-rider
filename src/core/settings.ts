export type Quality = 'low' | 'medium' | 'high';
export type TimeOfDay = 'day' | 'dusk';
export type Units = 'kmh' | 'mph';
export type CameraMode = 'chase' | 'cockpit' | 'cinematic';

export interface Settings {
  quality: Quality;
  timeOfDay: TimeOfDay;
  units: Units;
  touchControls: 'auto' | 'on' | 'off';
  sound: boolean;
  cameraMode: CameraMode;
}

const KEY = 'bike-rider.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  timeOfDay: 'day',
  units: 'kmh',
  touchControls: 'auto',
  sound: false,
  cameraMode: 'chase',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
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
