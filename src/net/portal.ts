/**
 * Web-game portal adapter. Poki and CrazyGames both want to know when gameplay starts and
 * stops, and both sell ads through "commercial breaks" (between runs) and "rewarded breaks"
 * (player opts in for a reward: here, one continue after a crash).
 *
 * The SDK script tag is only added when `VITE_PORTAL` is set at build time, so the normal
 * build carries no third-party code. Every call is safe to make when no SDK is loaded.
 *
 *   Poki:        https://sdk.poki.com/docs
 *   CrazyGames:  https://docs.crazygames.com/sdk/html5-v3/
 */

export type Portal = 'poki' | 'crazygames' | 'none';

interface PokiSDK {
  init: () => Promise<void>;
  gameLoadingFinished: () => void;
  gameplayStart: () => void;
  gameplayStop: () => void;
  commercialBreak: (onStart?: () => void) => Promise<void>;
  rewardedBreak: (onStart?: () => void) => Promise<boolean>;
  shareableURL?: (params: Record<string, string>) => Promise<string>;
  getURLParam?: (name: string) => string | null;
}

interface CrazyGamesSDK {
  init: () => Promise<void>;
  game: {
    gameplayStart: () => void;
    gameplayStop: () => void;
    loadingStart: () => void;
    loadingStop: () => void;
    happytime: () => void;
    inviteLink?: (params: Record<string, string>) => string;
  };
  ad: {
    requestAd: (
      type: 'midgame' | 'rewarded',
      callbacks: {
        adFinished?: () => void;
        adError?: (e: unknown) => void;
        adStarted?: () => void;
      },
    ) => void;
  };
}

declare global {
  interface Window {
    PokiSDK?: PokiSDK;
    CrazyGames?: { SDK: CrazyGamesSDK };
  }
}

export const PORTAL: Portal = (import.meta.env.VITE_PORTAL as Portal | '' | undefined) || 'none';

let ready = false;
let runsSinceBreak = 0;
/** Commercial break every N run ends (portal guidance: not more than one per ~3 minutes). */
const BREAK_EVERY = 3;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/** Load and init the portal SDK. Resolves quickly when no portal is configured. */
export async function initPortal(): Promise<void> {
  try {
    if (PORTAL === 'poki') {
      await loadScript('https://game-cdn.poki.com/scripts/v2/poki-sdk.js');
      await window.PokiSDK!.init();
      window.PokiSDK!.gameLoadingFinished();
      ready = true;
    } else if (PORTAL === 'crazygames') {
      await loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js');
      await window.CrazyGames!.SDK.init();
      window.CrazyGames!.SDK.game.loadingStop();
      ready = true;
    }
  } catch (e) {
    console.info('[portal] SDK unavailable, continuing without it', e);
    ready = false;
  }
}

export const portal = {
  get active(): boolean {
    return ready;
  },

  gameplayStart(): void {
    if (!ready) return;
    window.PokiSDK?.gameplayStart();
    window.CrazyGames?.SDK.game.gameplayStart();
  },

  gameplayStop(): void {
    if (!ready) return;
    window.PokiSDK?.gameplayStop();
    window.CrazyGames?.SDK.game.gameplayStop();
  },

  /** Celebrate a new best (CrazyGames shows confetti). */
  happyTime(): void {
    if (!ready) return;
    window.CrazyGames?.SDK.game.happytime();
  },

  /**
   * Maybe show a commercial break before the next run. `mute`/`unmute` let the game silence
   * its audio while the ad plays. Resolves when it is fine to continue.
   */
  async maybeCommercialBreak(mute: () => void, unmute: () => void): Promise<void> {
    if (!ready) return;
    runsSinceBreak++;
    if (runsSinceBreak < BREAK_EVERY) return;
    runsSinceBreak = 0;
    try {
      if (window.PokiSDK) {
        await window.PokiSDK.commercialBreak(mute);
      } else if (window.CrazyGames) {
        await new Promise<void>((resolve) =>
          window.CrazyGames!.SDK.ad.requestAd('midgame', {
            adStarted: mute,
            adFinished: resolve,
            adError: () => resolve(),
          }),
        );
      }
    } finally {
      unmute();
    }
  },

  /** Rewarded break for a continue. Resolves true only when the reward should be granted. */
  async rewardedBreak(mute: () => void, unmute: () => void): Promise<boolean> {
    if (!ready) return false;
    try {
      if (window.PokiSDK) return await window.PokiSDK.rewardedBreak(mute);
      if (window.CrazyGames) {
        return await new Promise<boolean>((resolve) =>
          window.CrazyGames!.SDK.ad.requestAd('rewarded', {
            adStarted: mute,
            adFinished: () => resolve(true),
            adError: () => resolve(false),
          }),
        );
      }
      return false;
    } catch {
      return false;
    } finally {
      unmute();
    }
  },

  /** Portal-aware share URL (Poki wraps links so they open inside the portal). */
  async shareUrl(fallback: string, params: Record<string, string>): Promise<string> {
    try {
      if (ready && window.PokiSDK?.shareableURL) return await window.PokiSDK.shareableURL(params);
      if (ready && window.CrazyGames?.SDK.game.inviteLink)
        return window.CrazyGames.SDK.game.inviteLink(params);
    } catch {
      /* fall through */
    }
    return fallback;
  },
};
