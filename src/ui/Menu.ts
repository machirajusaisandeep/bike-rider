import {
  BEARDS,
  FACES,
  GEAR_BY_ID,
  HAIR,
  HAIR_COLORS,
  HAIR_NAMES,
  SKIN_TONES,
  SLOTS,
  SLOT_LABEL,
  ZONE_CAP,
  ZONE_LABEL,
  itemsFor,
  protectionFor,
  riderForBody,
  type BeardStyle,
  type BodyType,
  type RiderConfig,
  type Zone,
} from '../game/gear';
import { SCENES, type SceneDef, type SceneId } from '../world/scenes';
import type { GameMode } from '../game/Run';

export type MenuStep = 'rider' | 'scene';
export type RiderTab = 'face' | 'hair' | 'gear';

export interface MenuCallbacks {
  /** Rider body / gear changed: update the 3D rider live. */
  onRiderChange: (cfg: RiderConfig) => void;
  /** Fired as the user browses scene cards: the world behind the menu switches live. */
  onPreview: (id: SceneId) => void;
  onStart: (id: SceneId) => void;
  onStepChange: (step: MenuStep) => void;
  /** Character tab changed: the camera frames the head for face/hair, full body for gear. */
  onFocus: (tab: RiderTab) => void;
  onModeChange: (mode: GameMode) => void;
  onOpenMissions: () => void;
  onOpenGarage: () => void;
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

/** Simplified front-facing figure; each zone is a separate path so coverage can be tinted. */
const BODY_SVG = `
<svg viewBox="0 0 120 260" class="body-map" aria-hidden="true">
  <path data-zone="head" d="M60 8a18 18 0 0 1 18 18v10a18 18 0 0 1-36 0V26A18 18 0 0 1 60 8z"/>
  <path data-zone="torso" d="M38 60h44l8 70H30z"/>
  <path data-zone="arms" d="M30 62l-14 6-8 62 12 3 8-52zM90 62l14 6 8 62-12 3-8-52z"/>
  <path data-zone="hands" d="M6 134l14 3-2 18-14-3zM114 134l-14 3 2 18 14-3z"/>
  <path data-zone="knees" d="M32 132h22l-2 78H36zM66 132h22l-4 78H68z"/>
  <path data-zone="feet" d="M34 212h20l2 26H30zM68 212h20l4 26H66z"/>
</svg>`;

/**
 * Pre-ride flow: (1) rider + gear, (2) scene. The live world renders behind it, so gear and
 * scenes preview instantly. Also reopened in-ride via Esc / the Scenes button.
 */
export class Menu {
  readonly root: HTMLElement;
  private step: MenuStep = 'rider';
  private rider: RiderConfig;
  private selected: SceneId;
  private cards = new Map<SceneId, HTMLButtonElement>();
  private riderPanel: HTMLElement;
  private scenePanel: HTMLElement;
  private scoreEl: HTMLElement;
  private scoreBar: HTMLElement;
  private exposedEl: HTMLElement;
  private zoneList: HTMLElement;
  private bodyMap: HTMLElement;
  private startBtn: HTMLButtonElement;
  private titleEl: HTMLElement;
  private descEl: HTMLElement;
  private placeEl: HTMLElement;
  private stepDots: HTMLElement[] = [];
  private mode: GameMode = 'ride';
  private dailyScene: SceneId | null = null;
  private dailyStreak = 0;
  private bests: Partial<Record<SceneId, number>> = {};
  private modeSeg!: HTMLElement;
  private modeNote!: HTMLElement;
  private coinsEl!: HTMLElement;

  private onKey = (e: KeyboardEvent) => {
    if (this.root.hidden) return;
    if (e.code === 'Enter') {
      e.preventDefault();
      if (this.step === 'rider') this.setStep('scene');
      else this.cb.onStart(this.selected);
    } else if (this.step === 'scene' && (e.code === 'ArrowRight' || e.code === 'ArrowDown')) {
      e.preventDefault();
      this.move(1);
    } else if (this.step === 'scene' && (e.code === 'ArrowLeft' || e.code === 'ArrowUp')) {
      e.preventDefault();
      this.move(-1);
    } else if (e.code === 'Backspace' && this.step === 'scene') {
      e.preventDefault();
      this.setStep('rider');
    }
  };

  constructor(
    parent: HTMLElement,
    initialScene: SceneId,
    rider: RiderConfig,
    private cb: MenuCallbacks,
  ) {
    this.selected = initialScene;
    this.rider = structuredClone(rider);
    this.root = document.createElement('div');
    this.root.className = 'menu';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="menu-scrim"></div>
      <div class="menu-body">
        <header class="menu-head">
          <div class="menu-topline">
            <div class="menu-brand"><span class="brand-dot"></span>BIKE RIDER</div>
            <div class="menu-steps"><span class="step-dot" data-step="rider">1 Rider</span><span class="step-dot" data-step="scene">2 Road</span></div>
          </div>
          <h1 class="menu-title"></h1>
          <p class="menu-sub"></p>
        </header>
        <section class="panel-rider"></section>
        <section class="panel-scene" hidden>
          <div class="mode-row">
            <div class="seg mode-seg">
              <button type="button" class="seg-btn active" data-mode="ride">Ride</button>
              <button type="button" class="seg-btn" data-mode="daily">Daily challenge</button>
              <button type="button" class="seg-btn" data-mode="free">Free ride</button>
            </div>
            <div class="mode-note"></div>
            <div class="mode-right">
              <button type="button" class="link-btn btn-missions">Missions</button>
              <button type="button" class="link-btn btn-garage">Garage</button>
              <span class="coins" title="Coins">🪙 <b class="coins-num">0</b></span>
            </div>
          </div>
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
                <button type="button" class="link-btn btn-back">← Rider &amp; gear</button>
                <span><span class="key">W</span><span class="key">↑</span> throttle</span>
                <span><span class="key">A</span><span class="key">D</span> steer</span>
                <span><span class="key">Space</span> brake</span>
              </div>
            </div>
          </footer>
        </section>
      </div>`;
    parent.appendChild(this.root);
    this.stepDots = Array.from(this.root.querySelectorAll<HTMLElement>('.step-dot'));
    this.stepDots.forEach((d) =>
      d.addEventListener('click', () => this.setStep(d.dataset.step as MenuStep)),
    );
    this.riderPanel = this.root.querySelector<HTMLElement>('.panel-rider')!;
    this.scenePanel = this.root.querySelector<HTMLElement>('.panel-scene')!;
    this.titleEl = this.root.querySelector<HTMLElement>('.menu-title')!;

    // ---- rider panel (character creator) -------------------------------------------------
    this.riderPanel.innerHTML = `
      <div class="char">
        <div class="char-panel">
          <div class="char-tabs" role="tablist">
            <button type="button" class="char-tab active" data-tab="face">Face</button>
            <button type="button" class="char-tab" data-tab="hair">Hair</button>
            <button type="button" class="char-tab" data-tab="gear">Riding gear</button>
          </div>
          <div class="char-page" data-page="face">
            <div class="char-label">Face</div>
            <div class="thumb-grid faces"></div>
            <div class="char-label">Skin tone</div>
            <div class="swatches skins"></div>
            <div class="beard-row"><div class="char-label">Beard</div><div class="seg seg-beard"></div></div>
          </div>
          <div class="char-page" data-page="hair" hidden>
            <div class="char-label">Hair</div>
            <div class="thumb-grid hairs"></div>
            <div class="char-label">Hair colour</div>
            <div class="swatches hair-colors"></div>
          </div>
          <div class="char-page" data-page="gear" hidden>
            <div class="gear-list"></div>
          </div>
          <div class="char-foot">
            <div class="seg seg-body">
              <button type="button" class="seg-btn" data-body="male"><svg viewBox="0 0 24 24"><circle cx="10" cy="14" r="5"/><path d="M14 10l6-6M15 4h5v5"/></svg>Male</button>
              <button type="button" class="seg-btn" data-body="female"><svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="5"/><path d="M12 14v7M9 18h6"/></svg>Female</button>
            </div>
            <div class="char-score" title="Protection score from riding gear">
              <svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z"/></svg>
              <b class="protect-num">0</b><span>/100</span>
              <i class="protect-exposed"></i>
            </div>
            <button type="button" class="btn-primary btn-next">Choose a road <span class="key">↵</span></button>
          </div>
        </div>
        <aside class="char-side">
          <div class="protect-card compact">
            <div class="protect-head">
              ${BODY_SVG}
              <ul class="zone-list"></ul>
            </div>
            <div class="protect-bar"><div class="protect-fill"></div></div>
          </div>
        </aside>
      </div>`;
    const base = import.meta.env.BASE_URL;
    this.riderPanel
      .querySelectorAll<HTMLButtonElement>('.char-tab')
      .forEach((b) => b.addEventListener('click', () => this.setTab(b.dataset.tab as RiderTab)));
    this.riderPanel.querySelectorAll<HTMLButtonElement>('[data-body]').forEach((b) =>
      b.addEventListener('click', () => {
        if (this.rider.body === b.dataset.body) return;
        this.rider = riderForBody(this.rider, b.dataset.body as BodyType);
        this.buildThumbGrids(base);
        this.renderRider();
        this.cb.onRiderChange(structuredClone(this.rider));
      }),
    );
    const skins = this.riderPanel.querySelector<HTMLElement>('.skins')!;
    for (const t of SKIN_TONES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.skin = t.id;
      b.style.background = t.hex;
      b.title = 'Skin tone';
      b.addEventListener('click', () => this.change({ skin: t.id }));
      skins.appendChild(b);
    }
    const hcs = this.riderPanel.querySelector<HTMLElement>('.hair-colors')!;
    for (const c of HAIR_COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.hairColor = c.id;
      b.style.background = c.hex;
      b.addEventListener('click', () => this.change({ hairColor: c.id }));
      hcs.appendChild(b);
    }
    const beardSeg = this.riderPanel.querySelector<HTMLElement>('.seg-beard')!;
    for (const bd of BEARDS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg-btn';
      b.dataset.beard = bd;
      b.textContent = bd === 'none' ? 'Clean' : bd === 'stubble' ? 'Stubble' : 'Full';
      b.addEventListener('click', () => this.change({ beard: bd as BeardStyle }));
      beardSeg.appendChild(b);
    }
    this.buildThumbGrids(base);
    const list = this.riderPanel.querySelector<HTMLElement>('.gear-list')!;
    for (const slot of SLOTS) {
      const row = document.createElement('div');
      row.className = 'gear-row';
      row.dataset.slot = slot;
      const items = itemsFor(slot);
      row.innerHTML = `
        <div class="gear-slot">
          <span class="gear-slot-name">${SLOT_LABEL[slot]}</span>
          <span class="gear-slot-pick"></span>
        </div>
        <div class="gear-options">
          <button type="button" class="gear-opt" data-id="">None<small>0</small></button>
          ${items
            .map((it) => {
              const pts = Object.values(it.covers).reduce((a, b) => a + b, 0);
              return `<button type="button" class="gear-opt" data-id="${it.id}" title="${it.blurb}"><i style="background:${it.color};border-color:${it.accent ?? 'rgba(255,255,255,.25)'}"></i>${it.name}<small>+${pts}</small></button>`;
            })
            .join('')}
        </div>`;
      row.querySelectorAll<HTMLButtonElement>('.gear-opt').forEach((b) =>
        b.addEventListener('click', () => {
          this.rider.gear[slot] = b.dataset.id ? b.dataset.id : null;
          this.renderRider();
          this.cb.onRiderChange(structuredClone(this.rider));
        }),
      );
      list.appendChild(row);
    }
    this.scoreEl = this.riderPanel.querySelector<HTMLElement>('.protect-num')!;
    this.scoreBar = this.riderPanel.querySelector<HTMLElement>('.protect-fill')!;
    this.exposedEl = this.riderPanel.querySelector<HTMLElement>('.protect-exposed')!;
    this.zoneList = this.riderPanel.querySelector<HTMLElement>('.zone-list')!;
    this.bodyMap = this.riderPanel.querySelector<HTMLElement>('.body-map')!;
    this.riderPanel
      .querySelector<HTMLButtonElement>('.btn-next')!
      .addEventListener('click', () => this.setStep('scene'));

    // ---- scene panel ------------------------------------------------------------------
    const grid = this.scenePanel.querySelector<HTMLElement>('.menu-grid')!;
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
          <span class="scene-best" hidden></span>
        </div>`;
      b.addEventListener('click', () => this.select(s.id, true));
      b.addEventListener('dblclick', () => this.cb.onStart(s.id));
      grid.appendChild(b);
      this.cards.set(s.id, b);
    }
    this.startBtn = this.scenePanel.querySelector<HTMLButtonElement>('.btn-start')!;
    this.startBtn.addEventListener('click', () => this.cb.onStart(this.selected));
    this.modeSeg = this.scenePanel.querySelector<HTMLElement>('.mode-seg')!;
    this.modeNote = this.scenePanel.querySelector<HTMLElement>('.mode-note')!;
    this.coinsEl = this.scenePanel.querySelector<HTMLElement>('.coins-num')!;
    this.modeSeg.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => this.setMode(b.dataset.mode as GameMode, true)),
    );
    this.scenePanel
      .querySelector<HTMLButtonElement>('.btn-missions')!
      .addEventListener('click', () => this.cb.onOpenMissions());
    this.scenePanel
      .querySelector<HTMLButtonElement>('.btn-garage')!
      .addEventListener('click', () => this.cb.onOpenGarage());
    this.scenePanel
      .querySelector<HTMLButtonElement>('.btn-back')!
      .addEventListener('click', () => this.setStep('rider'));
    this.placeEl = this.scenePanel.querySelector<HTMLElement>('.menu-selected-place')!;
    this.descEl = this.scenePanel.querySelector<HTMLElement>('.menu-selected-desc')!;
    const nameEl = this.scenePanel.querySelector<HTMLElement>('.menu-selected-name')!;
    this.sceneNameEl = nameEl;

    window.addEventListener('keydown', this.onKey);
    this.renderRider();
    this.select(initialScene, false);
    this.setStep('rider', false);
  }

  private sceneNameEl: HTMLElement;

  // -------------------------------------------------------------------------------------
  setStep(step: MenuStep, notify = true): void {
    this.step = step;
    this.riderPanel.hidden = step !== 'rider';
    this.scenePanel.hidden = step !== 'scene';
    this.root.classList.toggle('step-rider', step === 'rider');
    this.root.classList.toggle('step-scene', step === 'scene');
    this.stepDots.forEach((d) => d.classList.toggle('active', d.dataset.step === step));
    const sub = this.root.querySelector<HTMLElement>('.menu-sub')!;
    if (step === 'rider') {
      this.titleEl.innerHTML = 'Create your <em>rider</em>';
      sub.textContent = 'Face, hair and riding gear. What you wear is what protects you.';
    } else {
      this.titleEl.innerHTML = 'Ride India on a <em>Scram 411</em>';
      sub.textContent =
        'Pick a road. Tea hills, Himalayan passes, rainforest ghats, a cliff above the sea or the city at dusk.';
    }
    if (notify) this.cb.onStepChange(step);
    if (notify && step === 'rider') this.cb.onFocus(this.tab);
  }

  get currentStep(): MenuStep {
    return this.step;
  }

  get currentTab(): RiderTab {
    return this.tab;
  }

  private tab: RiderTab = 'face';

  setTab(tab: RiderTab): void {
    this.tab = tab;
    this.riderPanel
      .querySelectorAll<HTMLElement>('.char-tab')
      .forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    this.riderPanel
      .querySelectorAll<HTMLElement>('.char-page')
      .forEach((p) => (p.hidden = p.dataset.page !== tab));
    this.cb.onFocus(tab);
  }

  private change(patch: Partial<RiderConfig>): void {
    Object.assign(this.rider, patch);
    this.renderRider();
    this.cb.onRiderChange(structuredClone(this.rider));
  }

  private buildThumbGrids(base: string): void {
    const faces = this.riderPanel.querySelector<HTMLElement>('.faces')!;
    faces.innerHTML = '';
    for (const f of FACES[this.rider.body]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'thumb';
      b.dataset.face = f.id;
      b.innerHTML = `<img src="${base}previews/rider/face_${this.rider.body}_${f.id}.png" alt="${f.name}" loading="lazy"/><span>${f.name}</span>`;
      b.addEventListener('click', () => this.change({ face: f.id }));
      faces.appendChild(b);
    }
    const hairs = this.riderPanel.querySelector<HTMLElement>('.hairs')!;
    hairs.innerHTML = '';
    for (const h of HAIR[this.rider.body]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'thumb';
      b.dataset.hair = h;
      b.innerHTML = `<img src="${base}previews/rider/hair_${this.rider.body}_${h}.png" alt="${HAIR_NAMES[h]}" loading="lazy"/><span>${HAIR_NAMES[h] ?? h}</span>`;
      b.addEventListener('click', () => this.change({ hair: h }));
      hairs.appendChild(b);
    }
    this.riderPanel.querySelector<HTMLElement>('.beard-row')!.hidden = this.rider.body !== 'male';
  }

  private renderRider(): void {
    this.riderPanel
      .querySelectorAll<HTMLElement>('[data-face]')
      .forEach((b) => b.classList.toggle('active', b.dataset.face === this.rider.face));
    this.riderPanel
      .querySelectorAll<HTMLElement>('[data-hair]')
      .forEach((b) => b.classList.toggle('active', b.dataset.hair === this.rider.hair));
    this.riderPanel
      .querySelectorAll<HTMLElement>('[data-skin]')
      .forEach((b) => b.classList.toggle('active', b.dataset.skin === this.rider.skin));
    this.riderPanel
      .querySelectorAll<HTMLElement>('[data-hair-color]')
      .forEach((b) => b.classList.toggle('active', b.dataset.hairColor === this.rider.hairColor));
    this.riderPanel
      .querySelectorAll<HTMLElement>('[data-beard]')
      .forEach((b) => b.classList.toggle('active', b.dataset.beard === this.rider.beard));
    this.riderPanel
      .querySelectorAll<HTMLButtonElement>('[data-body]')
      .forEach((b) => b.classList.toggle('active', b.dataset.body === this.rider.body));
    for (const slot of SLOTS) {
      const row = this.riderPanel.querySelector<HTMLElement>(`.gear-row[data-slot="${slot}"]`)!;
      const id = this.rider.gear[slot] ?? '';
      row
        .querySelectorAll<HTMLButtonElement>('.gear-opt')
        .forEach((b) => b.classList.toggle('active', (b.dataset.id ?? '') === id));
      row.querySelector<HTMLElement>('.gear-slot-pick')!.textContent = id
        ? GEAR_BY_ID[id]!.name
        : 'Nothing';
    }
    const p = protectionFor(this.rider);
    this.scoreEl.textContent = String(p.total);
    this.scoreBar.style.width = `${p.total}%`;
    this.scoreBar.dataset.level = p.total >= 75 ? 'high' : p.total >= 45 ? 'mid' : 'low';
    this.zoneList.innerHTML = (Object.keys(ZONE_CAP) as Zone[])
      .map((z) => {
        const v = p.zones[z];
        const cap = ZONE_CAP[z];
        return `<li class="${v === 0 ? 'none' : v >= cap ? 'full' : 'part'}"><span>${ZONE_LABEL[z]}</span><b>${v}<small>/${cap}</small></b></li>`;
      })
      .join('');
    this.bodyMap.querySelectorAll<SVGPathElement>('[data-zone]').forEach((path) => {
      const z = path.dataset.zone as Zone;
      const v = p.zones[z] / ZONE_CAP[z];
      path.style.fill =
        v === 0
          ? 'rgba(255,59,48,0.55)'
          : v >= 1
            ? 'rgba(126,224,138,0.85)'
            : 'rgba(255,180,40,0.75)';
    });
    this.exposedEl.textContent = p.exposed.length
      ? `exposed: ${p.exposed.map((z) => ZONE_LABEL[z].toLowerCase()).join(', ')}`
      : 'fully covered';
    this.exposedEl.classList.toggle('ok', p.exposed.length === 0);
  }

  get riderConfig(): RiderConfig {
    return structuredClone(this.rider);
  }

  private move(dir: number): void {
    if (this.mode === 'daily') return;
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
    this.sceneNameEl.textContent = def.name;
    this.placeEl.textContent = def.place;
    this.descEl.textContent = def.description;
    this.startBtn.innerHTML =
      this.mode === 'daily'
        ? `Ride today's daily <span class="key">↵</span>`
        : this.mode === 'free'
          ? `Cruise ${def.name} <span class="key">↵</span>`
          : `Ride ${def.name} <span class="key">↵</span>`;
    if (preview) this.cb.onPreview(id);
  }

  // ------------------------------------------------------------------ modes / progress ----
  setMode(mode: GameMode, notify = false): void {
    this.mode = mode === 'mission' ? 'ride' : mode;
    this.modeSeg
      .querySelectorAll<HTMLElement>('[data-mode]')
      .forEach((b) => b.classList.toggle('active', b.dataset.mode === this.mode));
    const daily = this.mode === 'daily' && this.dailyScene;
    for (const [id, card] of this.cards) {
      card.classList.toggle('locked', !!daily && id !== this.dailyScene);
    }
    if (daily) this.select(this.dailyScene!, true);
    else this.select(this.selected, false);
    this.modeNote.textContent =
      this.mode === 'daily'
        ? `Same road and traffic for everyone today${this.dailyStreak > 1 ? ` · ${this.dailyStreak}-day streak` : ''}`
        : this.mode === 'free'
          ? 'No traffic, no score. Just the road.'
          : 'Traffic, hazards, near-miss combos. Crash and the run ends.';
    if (notify) this.cb.onModeChange(this.mode);
  }

  get currentMode(): GameMode {
    return this.mode;
  }

  setDaily(scene: SceneId, streak: number): void {
    this.dailyScene = scene;
    this.dailyStreak = streak;
    for (const [id, card] of this.cards) {
      card.classList.toggle('is-daily', id === scene);
    }
    if (this.mode === 'daily') this.setMode('daily');
  }

  setBests(bests: Partial<Record<SceneId, number>>): void {
    this.bests = bests;
    for (const [id, card] of this.cards) {
      const el = card.querySelector<HTMLElement>('.scene-best')!;
      const b = this.bests[id];
      el.hidden = !b;
      if (b) el.textContent = `Best ${Math.round(b).toLocaleString('en-IN')}`;
    }
  }

  setCoins(n: number): void {
    this.coinsEl.textContent = n.toLocaleString('en-IN');
  }

  get current(): SceneId {
    return this.selected;
  }

  show(step?: MenuStep): void {
    if (step) this.setStep(step);
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
