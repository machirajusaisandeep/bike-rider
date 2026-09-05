import type { Profile, UpgradeKey } from '../core/profile';
import {
  BIKES,
  buyUpgrade,
  canBuyUpgrade,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  MAX_LEVEL,
  selectBike,
  tuneFor,
  UPGRADES,
  type BikeDef,
} from '../game/upgrades';

export interface GarageCallbacks {
  /** Profile changed (purchase / bike selection): persist and retune. */
  onChange: () => void;
  onClose: () => void;
}

/** Upgrades and bikes. Mutates the profile through upgrades.ts helpers. */
export class GaragePanel {
  readonly root: HTMLElement;
  private onKey = (e: KeyboardEvent) => {
    if (this.root.hidden) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.cb.onClose();
    }
  };

  constructor(
    parent: HTMLElement,
    private profile: () => Profile,
    private cb: GarageCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'overlay panel-overlay garage';
    this.root.hidden = true;
    parent.appendChild(this.root);
    window.addEventListener('keydown', this.onKey, true);
  }

  show(): void {
    this.render();
    this.root.hidden = false;
    requestAnimationFrame(() => this.root.classList.add('open'));
  }

  hide(): void {
    this.root.classList.remove('open');
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  private render(): void {
    const p = this.profile();
    const tune = tuneFor(p);
    const current = BIKES.find((b) => b.id === p.bike) ?? BIKES[0]!;
    const pct = (v: number) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
    const upgrades = UPGRADES.map((u) => {
      const lvl = p.upgrades[u.key] ?? 0;
      const { ok, cost } = canBuyUpgrade(p, u.key);
      const pips = Array.from(
        { length: MAX_LEVEL },
        (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`,
      ).join('');
      return `
        <div class="upg" data-key="${u.key}">
          <div class="upg-body">
            <div class="upg-title">${u.name} <span class="pips">${pips}</span></div>
          </div>
          <button type="button" class="btn-ghost upg-buy" ${ok ? '' : 'disabled'}>${cost === null ? 'Maxed' : `🪙 ${cost}`}</button>
        </div>`;
    }).join('');
    const bikeCard = (b: BikeDef) => {
      const on = p.bike === b.id;
      return `
        <button type="button" class="bike-card ${on ? 'current' : ''}" data-bike="${b.id}" aria-pressed="${on}" title="${b.blurb}">
          <div class="bike-viz" style="--bike-paint:${b.paint};--bike-accent:${b.accent}">${bikeSilhouette(b)}</div>
          <div class="bike-name">${b.name}</div>
        </button>`;
    };
    const bikes = CATEGORY_ORDER.map((cat) => {
      const group = BIKES.filter((b) => b.category === cat);
      if (!group.length) return '';
      return `<div class="bike-cat"><h4>${CATEGORY_LABEL[cat]}</h4><div class="bike-grid">${group.map(bikeCard).join('')}</div></div>`;
    }).join('');
    this.root.innerHTML = `
      <div class="panel-card">
        <header class="panel-head">
          <div>
            <div class="panel-kicker">Garage</div>
            <h2 class="panel-title">Choose a bike <small>${current.name}</small></h2>
          </div>
          <div class="panel-right">
            <span class="garage-current-tune">power ${pct(tune.power)} · grip ${pct(tune.grip)} · dirt ${pct(tune.offroad)}</span>
            <button type="button" class="icon-btn panel-close" title="Close (Esc)"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          </div>
        </header>
        <section class="garage-bikes">${bikes}</section>
        <section class="garage-upgrades">
          <h3>Upgrades</h3>
          <div class="upg-list">${upgrades}</div>
        </section>
      </div>`;
    this.root.querySelector('.panel-close')!.addEventListener('click', () => this.cb.onClose());
    this.root.querySelectorAll<HTMLElement>('.upg').forEach((row) =>
      row.querySelector<HTMLButtonElement>('.upg-buy')!.addEventListener('click', () => {
        if (buyUpgrade(this.profile(), row.dataset.key as UpgradeKey)) {
          this.cb.onChange();
          this.render();
        }
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('.bike-card').forEach((card) =>
      card.addEventListener('click', () => {
        const id = card.dataset.bike!;
        if (this.profile().bike === id) return;
        if (selectBike(this.profile(), id)) {
          this.cb.onChange();
          this.markCurrent(id);
        }
      }),
    );
  }

  private markCurrent(id: string): void {
    const p = this.profile();
    const bike = BIKES.find((b) => b.id === id);
    const title = this.root.querySelector('.panel-title');
    if (title && bike) title.innerHTML = `Choose a bike <small>${bike.name}</small>`;
    const tune = tuneFor(p);
    const pct = (v: number) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
    const tuneEl = this.root.querySelector('.garage-current-tune');
    if (tuneEl)
      tuneEl.textContent = `power ${pct(tune.power)} · grip ${pct(tune.grip)} · dirt ${pct(tune.offroad)}`;
    this.root.querySelectorAll<HTMLButtonElement>('.bike-card').forEach((c) => {
      const on = c.dataset.bike === id;
      c.classList.toggle('current', on);
      c.setAttribute('aria-pressed', String(on));
    });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }
}

/** Side-view silhouette; tank and trim take the bike's paint / accent. */
function bikeSilhouette(b: BikeDef): string {
  const family = b.family;
  const bars =
    family === 'cafe'
      ? '<path d="M78 58 L70 48 L62 50" />'
      : family === 'adventure'
        ? '<path d="M78 52 L70 38 L88 40" /><path d="M72 44 L84 36" />'
        : '<path d="M78 52 L88 44 L96 46" />';
  const tank =
    family === 'heritage'
      ? '<ellipse cx="58" cy="58" rx="18" ry="11" fill="var(--bike-paint)" />'
      : family === 'cruiser'
        ? '<ellipse cx="56" cy="62" rx="22" ry="9" fill="var(--bike-paint)" />'
        : family === 'cafe'
          ? '<path d="M40 62 C44 48 78 46 82 60 L78 66 L42 66 Z" fill="var(--bike-paint)" />'
          : family === 'adventure'
            ? '<rect x="40" y="50" width="38" height="16" rx="5" fill="var(--bike-paint)" />'
            : '<path d="M42 64 C46 50 74 50 80 62 L76 68 L44 68 Z" fill="var(--bike-paint)" />';
  const seat =
    family === 'cruiser'
      ? '<path d="M36 64 L18 70 L16 66 L34 60 Z" fill="#1a1a1c" />'
      : '<path d="M42 62 L22 60 L20 56 L40 56 Z" fill="#1a1a1c" />';
  const exhaust =
    b.chassis.engine === 'twin'
      ? '<path d="M34 78 L12 70" /><path d="M34 82 L12 76" />'
      : '<path d="M34 80 L10 68" />';
  const shock =
    family === 'heritage'
      ? '<path d="M28 58 L22 78" /><path d="M32 58 L26 78" />'
      : '<path d="M30 58 L24 78" />';
  return `
    <svg viewBox="0 0 120 100" aria-hidden="true">
      <g fill="none" stroke="#0d0e10" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="28" cy="78" r="14" fill="#111" />
        <circle cx="28" cy="78" r="6" fill="#c6c9cc" stroke="#9fa4a8" />
        <circle cx="90" cy="76" r="12" fill="#111" />
        <circle cx="90" cy="76" r="5" fill="#c6c9cc" stroke="#9fa4a8" />
        <path d="M28 78 L42 58 L78 52 L90 76" />
        ${shock}
        ${exhaust}
        ${bars}
      </g>
      ${tank}
      ${seat}
      <circle cx="96" cy="54" r="5" fill="#fff6e5" stroke="#0d0e10" stroke-width="2" />
      <rect x="54" y="66" width="14" height="4" fill="var(--bike-accent)" />
    </svg>`;
}
