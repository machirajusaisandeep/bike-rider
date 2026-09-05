/**
 * Visual smoke test: drives the dev build through the rider creator, the road menu, every scene
 * and a phone viewport, taking PAGE screenshots (never canvas readback, which returns blanks for
 * WebGL) and asserting on visible UI plus the game's own `stats` object.
 *
 *   npx vite --port 5199 &                       # dev build exposes window.__bikeRider
 *   node audit/visual-smoke.mjs                  # headless chromium
 *   HEADED=1 node audit/visual-smoke.mjs         # real Chrome, representative fps
 *   SCENES=munnar,bengaluru node audit/visual-smoke.mjs
 *
 * Playwright is resolved from the local project if installed, else from the npx cache.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

function loadPlaywright() {
  const candidates = [
    path.resolve('package.json'),
    ...fs
      .readdirSync(path.join(process.env.HOME ?? '', '.npm/_npx'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(process.env.HOME ?? '', '.npm/_npx', d.name, 'package.json')),
  ];
  for (const c of candidates) {
    try {
      return createRequire(c)('playwright');
    } catch {
      /* try next */
    }
  }
  throw new Error('playwright not found; run `npx playwright install chromium` first');
}

const { chromium } = loadPlaywright();
const baseUrl = process.env.BIKE_RIDER_URL ?? 'http://127.0.0.1:5199/';
const quality = process.env.QUALITY ?? 'high';
const outDir = path.resolve(process.env.OUT_DIR ?? 'audit-output/smoke');
fs.mkdirSync(outDir, { recursive: true });
const headed = process.env.HEADED === '1';
const scenes = (process.env.SCENES ?? 'munnar,ladakh,wayanad,ooty,varkala,bengaluru')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const browser = await chromium.launch(
  headed ? { headless: false, channel: 'chrome' } : { headless: true },
);
const page = await browser.newPage({ viewport: { width: 1365, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`error: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

const results = [];
const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  return ok;
};

async function shot(name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const size = fs.statSync(file).size;
  check(`${name} screenshot non-empty`, size > 20_000, `${size} bytes`);
  return file;
}

async function stats() {
  return page.evaluate(() => window.__bikeRider?.stats ?? null);
}

/** Fast-forward game time with the dev aid so headless (1-3 fps) still reaches a real ride. */
async function advance(seconds) {
  await page.evaluate((s) => window.__bikeRider?.advance(s, { auto: 0 }), seconds);
}

async function open(url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 20_000 });
  await page.waitForFunction(() => !!window.__bikeRider, null, { timeout: 20_000 });
  await page.waitForTimeout(headed ? 1500 : 800);
}

const visible = (sel) => page.locator(sel).first().isVisible().catch(() => false);

// 1. Rider creator (fresh profile -> step 1)
await open(`${baseUrl}?quality=${quality}`);
await page.waitForTimeout(1200);
check('rider creator title', await visible('.menu-title'));
check('HUD scenes button hidden behind menu', !(await visible('.hud-tr .icon-btn:not(.btn-menu-keep)')));
check('speed cluster hidden behind menu', !(await visible('.hud-bl')));
await shot('01-rider-creator');
await page.locator('.char-tab[data-tab="gear"]').click();
await page.waitForTimeout(600);
await shot('01b-rider-gear');

// 2. Road menu
await open(`${baseUrl}?step=scene&quality=${quality}`);
await page.waitForTimeout(1200);
check('scene cards', (await page.locator('.scene-card').count()) === 6);
check('HUD icons hidden on road menu', !(await visible('.hud-tr .icon-btn:not(.btn-menu-keep)')));
await shot('02-road-menu');
for (const s of scenes) {
  await page.locator(`.scene-card[data-id="${s}"]`).click();
  await page.waitForTimeout(headed ? 1400 : 900);
  await shot(`02-select-${s}`);
}

// 3. Rides
for (const scene of scenes) {
  await open(`${baseUrl}?nomenu&mode=ride&autodrive&perf&quality=${quality}&scene=${scene}&seed=424242`);
  await advance(14);
  await page.waitForTimeout(headed ? 1200 : 700);
  const first = await stats();
  await advance(6);
  await page.waitForTimeout(headed ? 1200 : 700);
  const second = await stats();
  check(`${scene} stats present`, !!second);
  if (second) {
    check(`${scene} scene draw calls real`, second.sceneDrawCalls > 20, `${second.sceneDrawCalls}`);
    check(`${scene} scene triangles real`, second.sceneTriangles > 10_000, `${second.sceneTriangles}`);
    check(`${scene} post passes reported`, !second.postEnabled || second.postPasses >= 3, `${second.postPasses}`);
    // Autodrive is deliberately dumb (full throttle in the left lane), so with the seed fixed it
    // can rear-end traffic; a finished run still proves the ride happened.
    check(`${scene} ride ran`, ['riding', 'crashed', 'summary'].includes(second.phase), second.phase);
  }
  check(`${scene} speed HUD visible`, await visible('.hud-bl'));
  check(`${scene} HUD icons visible in ride`, await visible('.hud-tr .icon-btn:not(.btn-menu-keep)'));
  await shot(`03-ride-${scene}`);
  results.push({ scene, first, second });
}

// 4. Phone viewport: road menu and a ride
await page.setViewportSize({ width: 390, height: 844 });
await open(`${baseUrl}?step=scene&quality=medium&scene=munnar`);
await page.waitForTimeout(1000);
check('mobile: no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await shot('04-mobile-road-menu');
await open(`${baseUrl}?nomenu&mode=ride&autodrive&perf&quality=medium&scene=bengaluru&seed=7`);
await advance(12);
await page.waitForTimeout(800);
check('mobile ride speed visible', await visible('.hud-bl'));
await shot('04-mobile-ride-bengaluru');

await browser.close();
const summary = { quality, headed, results, errors, failures };
fs.writeFileSync(path.join(outDir, 'smoke-results.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ shots: fs.readdirSync(outDir).filter((f) => f.endsWith('.png')).length, failures, errors: errors.slice(0, 10) }, null, 2));
process.exit(failures.length ? 1 : 0);
