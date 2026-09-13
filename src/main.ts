import './style.css';
import { detectWebGL } from './core/webgl';

const app = document.getElementById('app')!;

function bootScene(): string {
  try {
    const raw = localStorage.getItem('bike-rider.settings.v2');
    const parsed = raw ? (JSON.parse(raw) as { scene?: string }) : null;
    const scene = parsed?.scene;
    return ['munnar', 'ladakh', 'wayanad', 'ooty', 'varkala', 'bengaluru'].includes(scene ?? '')
      ? scene!
      : 'munnar';
  } catch {
    return 'munnar';
  }
}

function showBootPoster(): void {
  const scene = bootScene();
  app.innerHTML = `
    <div class="boot-poster" style="--boot-image:url('${scene === 'munnar' ? 'previews/munnar.jpg' : `previews/${scene}.jpg`}')">
      <div class="boot-brand"><span class="brand-dot"></span>BIKE RIDER</div>
    </div>`;
}

function showFallback(reason?: string): void {
  app.innerHTML = `
    <div class="fallback">
      <div class="fallback-card">
        <h1>Bike Rider needs WebGL</h1>
        <p>This browser could not start a WebGL context, so the 3D ride can't render.${
          reason ? ` <br/><small>(${reason})</small>` : ''
        }</p>
        <ul>
          <li>Use a current version of Chrome, Edge, Firefox or Safari.</li>
          <li>Make sure hardware acceleration is enabled in your browser settings.</li>
          <li>Chrome/Edge: check <code>chrome://gpu</code> for WebGL status. Firefox: set <code>webgl.disabled</code> to <code>false</code> in <code>about:config</code>.</li>
          <li>Update your graphics drivers, or try another device.</li>
        </ul>
      </div>
    </div>`;
}

showBootPoster();
const support = detectWebGL();
if (!support.supported) {
  showFallback(support.reason);
} else {
  import('./game/Game')
    .then(({ Game }) => {
      try {
        new Game(app);
      } catch (err) {
        console.error(err);
        showFallback((err as Error).message);
      }
    })
    .catch((err: unknown) => {
      console.error(err);
      showFallback('Failed to load the game bundle.');
    });
}
