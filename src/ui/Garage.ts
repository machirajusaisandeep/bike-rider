import type { Profile, UpgradeKey } from '../core/profile';
import {
  BIKES,
  bikeState,
  buyBike,
  buyUpgrade,
  canBuyUpgrade,
  MAX_LEVEL,
  tuneFor,
  UPGRADES,
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
            <div class="upg-desc">${u.desc}</div>
          </div>
          <button type="button" class="btn-ghost upg-buy" ${ok ? '' : 'disabled'}>${cost === null ? 'Maxed' : `🪙 ${cost}`}</button>
        </div>`;
    }).join('');
    const bikes = BIKES.map((b) => {
      const st = bikeState(p, b);
      const current = p.bike === b.id;
      const label =
        st === 'owned'
          ? current
            ? 'Riding'
            : 'Select'
          : st === 'locked'
            ? 'Locked'
            : `🪙 ${b.price}`;
      return `
        <div class="bike-card ${current ? 'current' : ''} ${st}" data-bike="${b.id}">
          <div class="bike-swatch" style="background:${b.paint};border-color:${b.accent}"></div>
          <div class="bike-name">${b.name}</div>
          <div class="bike-blurb">${b.blurb}</div>
          <div class="bike-tune">
            <span>power ${pct(b.tune.power)}</span><span>grip ${pct(b.tune.grip)}</span><span>dirt ${pct(b.tune.offroad)}</span>
          </div>
          <button type="button" class="${current ? 'btn-ghost' : 'btn-primary'} bike-btn" ${st === 'locked' || st === 'poor' || current ? 'disabled' : ''}>${label}</button>
          ${st === 'locked' ? '<div class="bike-lock">Complete the Bengaluru "Namma legend" mission</div>' : ''}
        </div>`;
    }).join('');
    this.root.innerHTML = `
      <div class="panel-card">
        <header class="panel-head">
          <div>
            <div class="panel-kicker">Garage</div>
            <h2 class="panel-title">Tune and unlock</h2>
          </div>
          <div class="panel-right">
            <span class="coins">🪙 <b>${p.coins.toLocaleString('en-IN')}</b></span>
            <button type="button" class="icon-btn panel-close" title="Close (Esc)"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          </div>
        </header>
        <div class="garage-cols">
          <section>
            <h3>Upgrades <small>acceleration ${pct(tune.power)} · braking ${pct(tune.brakes)} · grip ${pct(tune.grip)} · dirt ${pct(tune.offroad)}</small></h3>
            <div class="upg-list">${upgrades}</div>
          </section>
          <section>
            <h3>Bikes</h3>
            <div class="bike-grid">${bikes}</div>
          </section>
        </div>
        <div class="panel-foot">Coins come from run score (1 per 100 points) and mission rewards.</div>
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
    this.root.querySelectorAll<HTMLElement>('.bike-card').forEach((card) =>
      card.querySelector<HTMLButtonElement>('.bike-btn')!.addEventListener('click', () => {
        const id = card.dataset.bike!;
        const prof = this.profile();
        const st = bikeState(prof, { ...BIKES.find((b) => b.id === id)! });
        let changed = false;
        if (st === 'owned') {
          prof.bike = id;
          changed = true;
        } else if (st === 'buyable') changed = buyBike(prof, id);
        if (changed) {
          this.cb.onChange();
          this.render();
        }
      }),
    );
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }
}
