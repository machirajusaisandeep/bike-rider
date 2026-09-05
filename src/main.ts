import './style.css';
import { detectWebGL } from './core/webgl';

const app = document.getElementById('app')!;

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
