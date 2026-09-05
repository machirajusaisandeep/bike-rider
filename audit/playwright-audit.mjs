import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('/Users/sandeepmachiraju/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
const { chromium } = require('playwright');

const baseUrl = process.env.BIKE_RIDER_URL ?? 'http://127.0.0.1:5174/';
const outDir = path.resolve('audit-output');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
const samples = [];

page.on('console', (msg) => {
  if (['error', 'warning'].includes(msg.type())) errors.push(`${msg.type()}: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

async function sample(label) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(250);
  const canvas = await page.evaluate(() => {
    const source = document.querySelector('canvas');
    if (!source) return { width: 0, height: 0, nonBlank: false, uniqueColors: 0 };
    const probe = document.createElement('canvas');
    probe.width = 96;
    probe.height = 54;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { width: source.width, height: source.height, nonBlank: false, uniqueColors: 0 };
    ctx.drawImage(source, 0, 0, probe.width, probe.height);
    const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
    let nonBlank = false;
    const colors = new Set();
    for (let i = 0; i < data.length; i += 4) {
      colors.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
      if (data[i] > 8 || data[i + 1] > 8 || data[i + 2] > 8) nonBlank = true;
    }
    return { width: source.width, height: source.height, nonBlank, uniqueColors: colors.size };
  });
  const fpsText = await page.locator('.fps').textContent({ timeout: 500 }).catch(() => null);
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const browserMetrics = await page.evaluate(() => {
    const memory = performance.memory;
    return memory
      ? {
          usedJSHeapMB: Math.round(memory.usedJSHeapSize / 1024 / 1024),
          totalJSHeapMB: Math.round(memory.totalJSHeapSize / 1024 / 1024),
          limitJSHeapMB: Math.round(memory.jsHeapSizeLimit / 1024 / 1024),
        }
      : null;
  });
  await page.screenshot({ path: path.join(outDir, `${label}.png`), fullPage: true });
  samples.push({
    label,
    url: page.url(),
    fpsText,
    canvas,
    browserMetrics,
    errors: [...errors],
    bodyText: bodyText.slice(0, 5000),
  });
}

async function openRoadMenu() {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 20_000 });
  await page.waitForTimeout(1_500);
  await page.locator('.btn-next').click();
  await page.waitForTimeout(700);
}

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 20_000 });
  await page.waitForTimeout(2_000);
  await sample('01-menu-rider');

  await page.locator('.btn-next').click();
  await page.waitForTimeout(900);
  await sample('02-menu-roads');

  for (const id of ['munnar', 'ladakh', 'wayanad', 'ooty', 'varkala', 'bengaluru']) {
    await page.locator(`.scene-card[data-id="${id}"]`).click();
    await page.waitForTimeout(900);
    await sample(`scene-select-${id}`);
  }

  await page.locator('.btn-routes').click();
  await page.waitForTimeout(800);
  await sample('03-routes-panel');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  await page.locator('.btn-missions').click();
  await page.waitForTimeout(800);
  await sample('04-missions-panel');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  await page.locator('.btn-garage').click();
  await page.waitForTimeout(800);
  await sample('05-garage-panel');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  await openRoadMenu();
  await page.locator('.scene-card[data-id="bengaluru"]').click();
  await page.locator('.btn-start').click();
  await page.waitForTimeout(4_000);
  await sample('06-run-bengaluru');

  await page.keyboard.down('w');
  await page.keyboard.down('d');
  await page.waitForTimeout(2_500);
  await page.keyboard.up('d');
  await page.keyboard.up('w');
  await sample('07-run-input-motion');

  await page.keyboard.press('c');
  await page.waitForTimeout(600);
  await sample('08-camera-cycle');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await sample('09-pause-overlay');

  await page.locator('[data-action="photo"]').click();
  await page.waitForTimeout(700);
  await sample('10-photo-mode');
} finally {
  await browser.close();
  const blank = samples.filter((s) => !s.canvas.nonBlank);
  fs.writeFileSync(path.join(outDir, 'audit-samples.json'), JSON.stringify(samples, null, 2));
  console.log(JSON.stringify({ samples: samples.length, blank: blank.map((s) => s.label), errors }, null, 2));
  if (blank.length) process.exitCode = 1;
}
