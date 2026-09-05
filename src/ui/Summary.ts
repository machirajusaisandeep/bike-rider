import type { RunStats } from '../game/Run';
import { MODE_LABEL, type GameMode } from '../game/Run';

export interface SummaryData {
  mode: GameMode;
  sceneName: string;
  score: number;
  stats: RunStats;
  newBest: boolean;
  previousBest: number | null;
  coins: number;
  cause: string;
  causeDetail: string;
  /** Daily streak, when mode is daily. */
  streak?: number;
  /** Optional mission line. */
  mission?: { title: string; done: boolean; reward: number } | null;
}

export interface SummaryCallbacks {
  onRetry: () => void;
  onShare: () => void;
  onMenu: () => void;
  onFreeRide: () => void;
  onPhoto: () => void;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/**
 * End-of-run card. The whole point of the design is that Retry is one key and the score is the
 * biggest thing on screen.
 */
export class Summary {
  readonly root: HTMLElement;
  private card: HTMLElement;
  private rankEl: HTMLElement;
  private shareBtn: HTMLButtonElement;
  private onKey = (e: KeyboardEvent) => {
    if (this.root.hidden) return;
    if (e.code === 'KeyR' || e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      this.cb.onRetry();
    } else if (e.code === 'Escape') {
      e.preventDefault();
      this.cb.onMenu();
    } else if (e.code === 'KeyS' && !e.repeat) {
      e.preventDefault();
      this.cb.onShare();
    }
  };

  constructor(
    parent: HTMLElement,
    private cb: SummaryCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'overlay summary';
    this.root.hidden = true;
    this.card = document.createElement('div');
    this.card.className = 'summary-card';
    this.root.appendChild(this.card);
    parent.appendChild(this.root);
    this.rankEl = document.createElement('div');
    this.shareBtn = document.createElement('button');
    window.addEventListener('keydown', this.onKey);
  }

  show(d: SummaryData): void {
    const s = d.stats;
    const delta = d.previousBest !== null && !d.newBest ? d.score - d.previousBest : null;
    this.card.innerHTML = `
      <div class="summary-top">
        <span class="summary-mode">${MODE_LABEL[d.mode]} · ${d.sceneName}</span>
        ${d.newBest ? '<span class="summary-best">New best</span>' : ''}
        ${d.streak && d.streak > 1 ? `<span class="summary-streak">🔥 ${d.streak}-day streak</span>` : ''}
      </div>
      <div class="summary-cause">${d.cause}</div>
      <div class="summary-cause-detail">${d.causeDetail}</div>
      <div class="summary-score">${fmt(d.score)}</div>
      <div class="summary-sub">${
        d.newBest
          ? d.previousBest !== null
            ? `Beat your ${fmt(d.previousBest)}`
            : 'First score on this road'
          : delta !== null
            ? `${fmt(Math.abs(delta))} short of your best ${fmt(d.previousBest!)}`
            : ''
      }</div>
      <div class="summary-grid">
        <div><b>${(s.distanceM / 1000).toFixed(2)}</b><span>km</span></div>
        <div><b>${Math.round(s.topKmh)}</b><span>top km/h</span></div>
        <div><b>${s.nearMisses}</b><span>near misses</span></div>
        <div><b>×${Math.max(1, s.bestCombo)}</b><span>best combo</span></div>
        <div><b>${Math.floor(s.durationS / 60)}:${String(Math.floor(s.durationS % 60)).padStart(2, '0')}</b><span>time</span></div>
        <div><b>+${d.coins}</b><span>coins</span></div>
      </div>
      ${
        d.mission
          ? `<div class="summary-mission ${d.mission.done ? 'done' : ''}">${d.mission.done ? '✓' : '✗'} ${d.mission.title}${d.mission.done ? ` · +${d.mission.reward} coins` : ''}</div>`
          : ''
      }
      <div class="summary-rank" hidden></div>
      <div class="summary-actions">
        <button type="button" class="btn-primary" data-action="retry">Ride again <span class="key">R</span></button>
        <div class="summary-row">
          <button type="button" class="btn-ghost" data-action="share">Share <span class="key">S</span></button>
          <button type="button" class="btn-ghost" data-action="photo">Photo</button>
          <button type="button" class="btn-ghost" data-action="menu">Roads <span class="key">Esc</span></button>
        </div>
        <button type="button" class="link-btn" data-action="free">Just cruise (free ride)</button>
      </div>`;
    this.rankEl = this.card.querySelector<HTMLElement>('.summary-rank')!;
    this.shareBtn = this.card.querySelector<HTMLButtonElement>('[data-action="share"]')!;
    this.card.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((b) =>
      b.addEventListener('click', () => {
        const a = b.dataset.action;
        if (a === 'retry') this.cb.onRetry();
        else if (a === 'share') this.cb.onShare();
        else if (a === 'menu') this.cb.onMenu();
        else if (a === 'free') this.cb.onFreeRide();
        else if (a === 'photo') this.cb.onPhoto();
      }),
    );
    this.root.hidden = false;
    requestAnimationFrame(() => this.root.classList.add('open'));
  }

  /** Leaderboard placement line, filled in asynchronously. */
  setRank(html: string | null): void {
    this.rankEl.hidden = !html;
    if (html) this.rankEl.innerHTML = html;
  }

  /**
   * Rank line plus an inline rider-name editor. `rows` are the top entries; the row flagged
   * `mine` is highlighted.
   */
  setBoard(
    o: {
      rank: number | null;
      total: number | null;
      rows: { handle: string; score: number; mine?: boolean }[];
      source: 'supabase' | 'local';
      handle: string;
    },
    onHandle: (h: string) => void,
  ): void {
    const ord = (n: number) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
    };
    const head =
      o.rank !== null
        ? `${ord(o.rank)}${o.total ? ` of ${o.total.toLocaleString('en-IN')}` : ''} ${o.source === 'local' ? 'on this device' : 'worldwide'}`
        : o.source === 'local'
          ? 'Local board (no server configured)'
          : 'Leaderboard';
    const list = o.rows
      .slice(0, 5)
      .map(
        (r, i) =>
          `<li class="${r.mine ? 'mine' : ''}"><span>${i + 1}</span><em>${escapeHtml(r.handle)}</em><b>${Math.round(r.score).toLocaleString('en-IN')}</b></li>`,
      )
      .join('');
    this.rankEl.innerHTML = `
      <div class="board-head">${head}</div>
      <ol class="board-list">${list}</ol>
      <label class="board-handle">Ride as <input type="text" maxlength="16" value="${escapeHtml(o.handle)}" placeholder="your name" /></label>`;
    this.rankEl.hidden = false;
    const input = this.rankEl.querySelector<HTMLInputElement>('input')!;
    input.addEventListener('keydown', (e) => e.stopPropagation());
    input.addEventListener('change', () => onHandle(input.value.trim().slice(0, 16)));
  }

  setShareState(text: string): void {
    this.shareBtn.innerHTML = text;
  }

  hide(): void {
    this.root.classList.remove('open');
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
