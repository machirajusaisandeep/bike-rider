import type { Profile } from '../core/profile';
import { ROUTES, type Route } from '../game/routes';
import { SCENE_BY_ID } from '../world/scenes';

export interface RoutesCallbacks {
  onStart: (route: Route) => void;
  onClose: () => void;
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Named routes with their checkpoints. */
export class RoutesPanel {
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
    private cb: RoutesCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'overlay panel-overlay routes';
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
    const done = p.routesDone ?? [];
    const cards = ROUTES.map((r) => {
      const scene = SCENE_BY_ID[r.scene];
      const isDone = done.includes(r.id);
      const km = (r.checkpoints[r.checkpoints.length - 1]!.at / 1000).toFixed(1);
      const cps = r.checkpoints
        .map(
          (c) =>
            `<li class="cp cp-${c.kind}"><i></i><span>${escapeHtml(c.name)}</span><small>${(c.at / 1000).toFixed(1)} km</small></li>`,
        )
        .join('');
      return `
        <div class="route ${isDone ? 'done' : ''}" data-id="${r.id}">
          <div class="route-thumb" style="background-image:url('${import.meta.env.BASE_URL}${scene.preview}')"></div>
          <div class="route-body">
            <div class="route-name">${escapeHtml(r.name)} <small>${km} km · ${scene.name}</small>${isDone ? '<span class="route-done">Ridden</span>' : ''}</div>
            <div class="route-blurb">${escapeHtml(r.blurb)}</div>
            <ul class="route-cps">${cps}</ul>
          </div>
          <div class="route-side">
            <div class="m-reward">${isDone ? '✓' : `+${r.reward}`}<small>${isDone ? 'done' : 'coins'}</small></div>
            <button type="button" class="btn-primary route-go">${isDone ? 'Ride again' : 'Ride'}</button>
          </div>
        </div>`;
    }).join('');
    this.root.innerHTML = `
      <div class="panel-card">
        <header class="panel-head">
          <div>
            <div class="panel-kicker">Routes</div>
            <h2 class="panel-title">Ride the real roads <small>${done.length}/${ROUTES.length}</small></h2>
          </div>
          <div class="panel-right">
            <span class="coins">🪙 <b>${p.coins.toLocaleString('en-IN')}</b></span>
            <button type="button" class="icon-btn panel-close" title="Close (Esc)"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          </div>
        </header>
        <div class="route-list">${cards}</div>
        <div class="panel-foot">Pass under every gate to finish. Dhabas restore health; passes are just for bragging.</div>
      </div>`;
    this.root.querySelector('.panel-close')!.addEventListener('click', () => this.cb.onClose());
    this.root.querySelectorAll<HTMLElement>('.route').forEach((card) =>
      card.querySelector<HTMLButtonElement>('.route-go')!.addEventListener('click', () => {
        const r = ROUTES.find((x) => x.id === card.dataset.id)!;
        this.cb.onStart(r);
      }),
    );
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }
}
