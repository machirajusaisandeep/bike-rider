import { SCENES, type SceneDef, type SceneId } from '../world/scenes';

export interface MenuCallbacks {
  /** Fired as the user browses cards: the world behind the menu switches live. */
  onPreview: (id: SceneId) => void;
  onStart: (id: SceneId) => void;
}

const ICON: Record<SceneDef['category'], string> = {
  Hills: '<svg viewBox="0 0 24 24"><path d="M2 19l6-9 4 6 3-4 7 7z"/></svg>',
  Mountains:
    '<svg viewBox="0 0 24 24"><path d="M2 20l7-12 3 5 2-3 8 10z"/><path d="M9 8l1.5 2.5L12 9"/></svg>',
  Greenery:
    '<svg viewBox="0 0 24 24"><path d="M12 21V11M12 11c-4 0-7-3-7-7 4 0 7 3 7 7zm0 0c4 0 7-3 7-7-4 0-7 3-7 7z"/></svg>',
  Beach:
    '<svg viewBox="0 0 24 24"><path d="M3 18c3-2 6-2 9 0s6 2 9 0"/><circle cx="17" cy="7" r="3"/><path d="M4 13c2-4 5-5 8-3"/></svg>',
  City: '<svg viewBox="0 0 24 24"><path d="M3 21V9h5v12M8 21V4h6v17M14 21V11h7v10"/><path d="M5 12h1M5 15h1M10 8h2M10 12h2M17 14h1M17 17h1"/></svg>',
};

/**
 * Scene select shown before a ride (and from the in-game Scenes button). The live scene renders
 * behind it in attract mode, so browsing cards previews each location.
 */
export class Menu {
  readonly root: HTMLElement;
  private cards = new Map<SceneId, HTMLButtonElement>();
  private selected: SceneId;
  private startBtn: HTMLButtonElement;
  private titleEl: HTMLElement;
  private descEl: HTMLElement;
  private placeEl: HTMLElement;
  private onKey = (e: KeyboardEvent) => {
    if (this.root.hidden) return;
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      this.cb.onStart(this.selected);
    } else if (e.code === 'ArrowRight' || e.code === 'ArrowDown') {
      e.preventDefault();
      this.move(1);
    } else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') {
      e.preventDefault();
      this.move(-1);
    }
  };

  constructor(
    parent: HTMLElement,
    initial: SceneId,
    private cb: MenuCallbacks,
  ) {
    this.selected = initial;
    this.root = document.createElement('div');
    this.root.className = 'menu';
    this.root.innerHTML = `
      <div class="menu-scrim"></div>
      <div class="menu-body">
        <header class="menu-head">
          <div class="menu-brand"><span class="brand-dot"></span>BIKE RIDER</div>
          <h1 class="menu-title">Ride India on a <em>Scram 411</em></h1>
          <p class="menu-sub">Pick a road. Tea hills, Himalayan passes, rainforest ghats, a cliff above the sea or the city at dusk.</p>
        </header>
        <div class="menu-grid" role="listbox" aria-label="Choose a scene"></div>
        <footer class="menu-foot">
          <div class="menu-selected">
            <div class="menu-selected-name"></div>
            <div class="menu-selected-place"></div>
            <div class="menu-selected-desc"></div>
          </div>
          <div class="menu-actions">
            <button type="button" class="btn-primary btn-start">Start ride <span class="key">↵</span></button>
            <div class="menu-keys">
              <span><span class="key">W</span><span class="key">↑</span> throttle</span>
              <span><span class="key">A</span><span class="key">D</span> steer</span>
              <span><span class="key">Space</span> brake</span>
              <span><span class="key">C</span> camera</span>
            </div>
          </div>
        </footer>
      </div>`;
    parent.appendChild(this.root);
    const grid = this.root.querySelector<HTMLElement>('.menu-grid')!;
    for (const s of SCENES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'scene-card';
      b.setAttribute('role', 'option');
      b.dataset.id = s.id;
      b.innerHTML = `
        <div class="scene-thumb" style="background-image:url('${import.meta.env.BASE_URL}${s.preview}')"></div>
        <div class="scene-meta">
          <span class="scene-cat">${ICON[s.category]}${s.category}</span>
          <span class="scene-name">${s.name}</span>
          <span class="scene-tag">${s.tagline}</span>
        </div>`;
      b.addEventListener('click', () => this.select(s.id, true));
      b.addEventListener('dblclick', () => this.cb.onStart(s.id));
      b.addEventListener('mouseenter', () => b.classList.add('hover'));
      b.addEventListener('mouseleave', () => b.classList.remove('hover'));
      grid.appendChild(b);
      this.cards.set(s.id, b);
    }
    this.startBtn = this.root.querySelector<HTMLButtonElement>('.btn-start')!;
    this.startBtn.addEventListener('click', () => this.cb.onStart(this.selected));
    this.titleEl = this.root.querySelector<HTMLElement>('.menu-selected-name')!;
    this.placeEl = this.root.querySelector<HTMLElement>('.menu-selected-place')!;
    this.descEl = this.root.querySelector<HTMLElement>('.menu-selected-desc')!;
    window.addEventListener('keydown', this.onKey);
    this.select(initial, false);
  }

  private move(dir: number): void {
    const i = SCENES.findIndex((s) => s.id === this.selected);
    const next = SCENES[(i + dir + SCENES.length) % SCENES.length]!;
    this.select(next.id, true);
  }

  select(id: SceneId, preview: boolean): void {
    this.selected = id;
    for (const [k, b] of this.cards) {
      const on = k === id;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-selected', String(on));
    }
    const def = SCENES.find((s) => s.id === id)!;
    this.titleEl.textContent = def.name;
    this.placeEl.textContent = def.place;
    this.descEl.textContent = def.description;
    this.startBtn.innerHTML = `Ride ${def.name} <span class="key">↵</span>`;
    if (preview) this.cb.onPreview(id);
  }

  get current(): SceneId {
    return this.selected;
  }

  show(): void {
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

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
