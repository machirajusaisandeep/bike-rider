import type { Profile } from '../core/profile';
import { missionAvailable, missionsFor, type Mission } from '../game/missions';
import { SCENES, type SceneId } from '../world/scenes';

export interface MissionsCallbacks {
  onStart: (mission: Mission) => void;
  onClose: () => void;
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Mission list per scene. Opens over the menu; picking one starts a mission run. */
export class MissionsPanel {
  readonly root: HTMLElement;
  private scene: SceneId;
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
    initialScene: SceneId,
    private profile: () => Profile,
    private cb: MissionsCallbacks,
  ) {
    this.scene = initialScene;
    this.root = document.createElement('div');
    this.root.className = 'overlay panel-overlay missions';
    this.root.hidden = true;
    parent.appendChild(this.root);
    window.addEventListener('keydown', this.onKey, true);
  }

  show(scene?: SceneId): void {
    if (scene) this.scene = scene;
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
    const done = p.missionsDone;
    const list = missionsFor(this.scene);
    const total = list.length;
    const n = list.filter((m) => done.includes(m.id)).length;
    const tabs = SCENES.map((s) => {
      const c = missionsFor(s.id).filter((m) => done.includes(m.id)).length;
      return `<button type="button" class="ptab ${s.id === this.scene ? 'active' : ''}" data-scene="${s.id}">${s.name}<small>${c}/8</small></button>`;
    }).join('');
    const rows = list
      .map((m) => {
        const isDone = done.includes(m.id);
        const avail = missionAvailable(m, done);
        const state = isDone ? 'done' : avail ? 'open' : 'locked';
        return `
        <div class="mission ${state}" data-id="${m.id}">
          <div class="m-tier">T${m.tier}</div>
          <div class="m-body">
            <div class="m-title">${escapeHtml(m.title)}${m.unlocks ? `<span class="m-unlock">unlocks ${unlockLabel(m.unlocks)}</span>` : ''}</div>
            <div class="m-desc">${escapeHtml(m.desc)}</div>
          </div>
          <div class="m-reward">${isDone ? '✓' : `+${m.reward}`}<small>${isDone ? 'done' : 'coins'}</small></div>
          <button type="button" class="btn-primary m-go" ${avail ? '' : 'disabled'}>${isDone ? 'Replay' : avail ? 'Ride' : 'Locked'}</button>
        </div>`;
      })
      .join('');
    this.root.innerHTML = `
      <div class="panel-card">
        <header class="panel-head">
          <div>
            <div class="panel-kicker">Missions</div>
            <h2 class="panel-title">${SCENES.find((s) => s.id === this.scene)!.name} <small>${n}/${total}</small></h2>
          </div>
          <div class="panel-right">
            <span class="coins">🪙 <b>${p.coins.toLocaleString('en-IN')}</b></span>
            <button type="button" class="icon-btn panel-close" title="Close (Esc)"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          </div>
        </header>
        <div class="ptabs">${tabs}</div>
        <div class="mission-list">${rows}</div>
        <div class="panel-foot">Tier 2 opens after two Tier 1 missions on that road; Tier 3 after two Tier 2.</div>
      </div>`;
    this.root.querySelector('.panel-close')!.addEventListener('click', () => this.cb.onClose());
    this.root.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach((b) =>
      b.addEventListener('click', () => {
        this.scene = b.dataset.scene as SceneId;
        this.render();
      }),
    );
    this.root.querySelectorAll<HTMLElement>('.mission').forEach((row) => {
      const id = row.dataset.id!;
      row.querySelector<HTMLButtonElement>('.m-go')!.addEventListener('click', () => {
        const m = list.find((x) => x.id === id)!;
        if (missionAvailable(m, done)) this.cb.onStart(m);
      });
    });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }
}

export function unlockLabel(id: string): string {
  const [kind, val] = id.split(':');
  if (kind === 'weather') return `${val} weather`;
  if (kind === 'time') return `${val} riding`;
  if (kind === 'bike') return 'a new bike';
  return id;
}
