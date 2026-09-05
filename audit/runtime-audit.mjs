import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('/Users/sandeepmachiraju/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const { chromium } = require('playwright');

const baseUrl = process.env.BIKE_RIDER_URL ?? 'http://127.0.0.1:5174/';
const quality = process.env.QUALITY ?? 'high';
const outDir = path.resolve('audit-output/runtime');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
const page = await browser.newPage({ viewport: { width: 1365, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (msg) => {
  if (['error', 'warning'].includes(msg.type())) errors.push(`${msg.type()}: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

/** WebGL canvases read back blank after the frame; judge the page screenshot instead. */
function shotProbe(file) {
  const size = fs.statSync(file).size;
  return { bytes: size, nonBlank: size > 20_000 };
}

async function stats() {
  return page.evaluate(() => {
    const game = window.__bikeRider;
    return game?.stats ?? null;
  });
}

const scenes = (process.env.SCENES ?? 'munnar,ladakh,wayanad,ooty,varkala,bengaluru')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const results = [];
for (const scene of scenes) {
  const url = `${baseUrl}?nomenu&mode=ride&autodrive&perf&quality=${quality}&scene=${scene}&seed=424242`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 20_000 });
  await page.waitForTimeout(6_000);
  const first = await stats();
  await page.waitForTimeout(4_000);
  const second = await stats();
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const shot = path.join(outDir, `${scene}-ride.png`);
  await page.screenshot({ path: shot, fullPage: true });
  results.push({ scene, first, second, canvas: shotProbe(shot), bodyText: bodyText.slice(0, 2000), errors: [...errors] });
}

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${baseUrl}?step=scene&perf&quality=medium&scene=munnar`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 20_000 });
await page.waitForTimeout(2_000);
const mobileShot = path.join(outDir, 'mobile-menu-scene.png');
await page.screenshot({ path: mobileShot, fullPage: true });
results.push({
  scene: 'mobile-menu',
  first: await stats(),
  second: null,
  canvas: shotProbe(mobileShot),
  bodyText: (await page.locator('body').innerText().catch(() => '')).slice(0, 2000),
  errors: [...errors],
});

await browser.close();
fs.writeFileSync(path.join(outDir, 'runtime-results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ scenes: results.length, errors }, null, 2));
