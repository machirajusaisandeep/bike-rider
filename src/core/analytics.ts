/**
 * Privacy-friendly event sink. No cookies, no PII, no consent banner needed.
 *
 * Provider is chosen at runtime:
 *  - `window.plausible` (Plausible script tag in index.html) or
 *  - `window.umami` (Umami script tag) or
 *  - a `VITE_ANALYTICS_ENDPOINT` URL that receives `{ name, props, ts }` via `sendBeacon`, or
 *  - console (dev) / noop (prod).
 *
 * Everything funnels through `track()` so the game code never knows which provider is live.
 */

export type EventName =
  | 'app_open'
  | 'run_start'
  | 'run_end'
  | 'retry'
  | 'share'
  | 'share_card'
  | 'leaderboard_submit'
  | 'mission_complete'
  | 'upgrade'
  | 'photo'
  | 'clip'
  | 'mode_select'
  | 'settings_change';

export type EventProps = Record<string, string | number | boolean | null | undefined>;

interface PlausibleFn {
  (name: string, opts?: { props?: EventProps }): void;
}
interface UmamiApi {
  track: (name: string, props?: EventProps) => void;
}

declare global {
  interface Window {
    plausible?: PlausibleFn;
    umami?: UmamiApi;
  }
}

const ENDPOINT: string | undefined = import.meta.env.VITE_ANALYTICS_ENDPOINT;
const DEV = import.meta.env.DEV;

let sessionStart = Date.now();
let runCounter = 0;

/** Anonymous per-install id (random, not fingerprinted) so retention can be estimated. */
function installId(): string {
  try {
    const k = 'bike-rider.install';
    let v = localStorage.getItem(k);
    if (!v) {
      v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return 'anon';
  }
}

function clean(props: EventProps): EventProps {
  const out: EventProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === 'number' ? Math.round(v * 100) / 100 : v;
  }
  return out;
}

export function track(name: EventName, props: EventProps = {}): void {
  const p = clean({
    ...props,
    session_s: Math.round((Date.now() - sessionStart) / 1000),
    runs: runCounter,
  });
  if (name === 'run_start') runCounter++;
  try {
    if (window.plausible) window.plausible(name, { props: p });
    else if (window.umami) window.umami.track(name, p);
    else if (ENDPOINT) {
      const body = JSON.stringify({ name, props: p, id: installId(), ts: Date.now() });
      if (!navigator.sendBeacon?.(ENDPOINT, body)) {
        void fetch(ENDPOINT, { method: 'POST', body, keepalive: true }).catch(() => {});
      }
    } else if (DEV) {
      console.debug('[analytics]', name, p);
    }
  } catch {
    /* analytics must never break the game */
  }
}

/** Call once at boot. */
export function initAnalytics(): void {
  sessionStart = Date.now();
  track('app_open', {
    touch: matchMedia('(pointer: coarse)').matches,
    w: window.innerWidth,
    h: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    lang: navigator.language,
  });
}
