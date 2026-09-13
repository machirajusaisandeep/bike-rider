import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const candidates = [
  path.resolve('package.json'),
  ...fs
    .readdirSync(path.join(process.env.HOME, '.npm/_npx'))
    .map((x) => path.join(process.env.HOME, '.npm/_npx', x, 'package.json')),
];
let chromium;
for (const candidate of candidates) {
  try {
    ({ chromium } = createRequire(candidate)('playwright'));
    break;
  } catch {
    /* next cache */
  }
}
if (!chromium) throw new Error('Playwright is required');
const out = path.resolve('audit-output/rider-review');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const url =
  'http://127.0.0.1:5199/?quality=high&rider=male&gear=streetwind-full,windfarer,stalwart,conqueror,ankle-boots';
await page.goto(url);
await page.waitForFunction(() => window.__bikeRider?.rider.ready, undefined, { timeout: 45000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: path.join(out, 'desktop-face.png') });
await page.locator('[data-tab="gear"]').click();
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(out, 'desktop-gear.png') });
const stats = await page.evaluate(() => window.__bikeRider.stats);
const checks = [];
const check = (name, pass) => {
  checks.push({ name, pass });
  if (!pass) errors.push(name);
};
async function canvasCheck(name) {
  const result = await page.evaluate(() => {
    const g = window.__bikeRider;
    g.riderStudio.render(innerWidth, innerHeight);
    const gl = g.renderer.getContext();
    const w = gl.drawingBufferWidth,
      h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const colors = new Set();
    let lo = 255,
      hi = 0;
    for (let y = Math.floor(h * 0.58); y < h; y += 11) {
      for (let x = Math.floor(w * 0.35); x < w * 0.9; x += 11) {
        const i = (y * w + x) * 4;
        const lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
        lo = Math.min(lo, lum);
        hi = Math.max(hi, lum);
        colors.add(`${px[i] >> 3},${px[i + 1] >> 3},${px[i + 2] >> 3}`);
      }
    }
    return { colors: colors.size, contrast: hi - lo };
  });
  check(`${name}: nonblank canvas`, result.colors > 25 && result.contrast > 35);
  return result;
}
const pixels = { desktop: await canvasCheck('desktop') };
check(
  'Main action fits desktop',
  await page
    .locator('.btn-next')
    .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
);
const standBones = await page.evaluate(() => {
  const r = window.__bikeRider.rider;
  const bones = {};
  r.root.traverse((o) => {
    if (o.isBone && /^(thigh|upper_arm)/.test(o.name)) bones[o.name] = o.quaternion.toArray();
  });
  return bones;
});
console.log(JSON.stringify({ errors, stats }));
if (process.env.QUICK !== '1') {
  const cameraBefore = await page.evaluate(() =>
    window.__bikeRider.riderStudio.camera.position.toArray(),
  );
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, 'desktop-rotated.png') });
  const cameraAfter = await page.evaluate(() =>
    window.__bikeRider.riderStudio.camera.position.toArray(),
  );
  check(
    'Rotate control changes camera',
    JSON.stringify(cameraBefore) !== JSON.stringify(cameraAfter),
  );
  await page.locator('[data-id="lightwing-flame"]').click();
  check(
    'Checks graphic is equipped',
    await page.evaluate(
      () => window.__bikeRider.rider.active.meshes.get('gear_helmet_checks')?.visible === true,
    ),
  );
  await page.screenshot({ path: path.join(out, 'desktop-checks.png') });
  await page.locator('[data-id="streetwind-full"]').click();
  await page.locator('[data-tab="face"]').click();
  await page.locator('[data-beard="moustache"]').click();
  check(
    'Moustache visible',
    await page.evaluate(
      () => window.__bikeRider.rider.active.meshes.get('beard_moustache')?.visible === true,
    ),
  );
  check(
    'Helmet hidden for face editing',
    await page.evaluate(
      () => !window.__bikeRider.rider.active.meshes.get('gear_helmet_full')?.visible,
    ),
  );
  await page.locator('[data-skin="s5"]').click();
  await page.screenshot({ path: path.join(out, 'desktop-moustache.png') });
  // Skin tone calibration: mean cheek colour vs the s5 swatch under the studio key.
  const cheek = await page.evaluate(() => {
    const g = window.__bikeRider;
    g.riderStudio.render(innerWidth, innerHeight);
    const gl = g.renderer.getContext();
    const w = gl.drawingBufferWidth,
      h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    // face tab frames the head in the right half; sample a block right of centre, mid-height
    let r = 0,
      gg = 0,
      b = 0,
      n = 0;
    // readPixels rows start at the bottom of the canvas
    for (let y = Math.floor(h * 0.63); y < h * 0.69; y += 4) {
      for (let x = Math.floor(w * 0.64); x < w * 0.69; x += 4) {
        const i = (y * w + x) * 4;
        r += px[i];
        gg += px[i + 1];
        b += px[i + 2];
        n++;
      }
    }
    return { r: Math.round(r / n), g: Math.round(gg / n), b: Math.round(b / n) };
  });
  console.log('skin tone probe (s5 #7d5233):', JSON.stringify(cheek));
  await page.locator('[data-tab="hair"]').click();
  await page.locator('[data-hair="curly"]').click();
  check(
    'Hair switch visible',
    await page.evaluate(
      () => window.__bikeRider.rider.active.meshes.get('hair_curly')?.visible === true,
    ),
  );
  await page.screenshot({ path: path.join(out, 'desktop-hair.png') });
  await page.locator('[data-hair="turban"]').click();
  check(
    'Turban visible on the hair tab',
    await page.evaluate(
      () => window.__bikeRider.rider.active.meshes.get('hair_turban')?.visible === true,
    ),
  );
  await page.locator('[data-hair-color="maroon"]').click();
  await page.screenshot({ path: path.join(out, 'desktop-turban.png') });
  await page.locator('[data-tab="gear"]').click();
  await page.waitForTimeout(400);
  check(
    'Turban hidden under a helmet',
    await page.evaluate(
      () => window.__bikeRider.rider.active.meshes.get('hair_turban')?.visible === false,
    ),
  );
  await page.locator('[data-tab="hair"]').click();
  await page.locator('[data-hair="long"]').click();
  await page.locator('[data-tab="gear"]').click();
  await page.waitForTimeout(400);
  check(
    'Long hair hangs out below the helmet',
    await page.evaluate(() => {
      const m = window.__bikeRider.rider.active.meshes;
      return m.get('hair_long_out')?.visible === true && m.get('hair_long')?.visible === false;
    }),
  );
  await page.screenshot({ path: path.join(out, 'desktop-helmet-long.png') });
  await page.locator('[data-tab="gear"]').click();
  await page.locator('[data-id="explorer-v3"]').click();
  await page.screenshot({ path: path.join(out, 'desktop-explorer.png') });
  await page.locator('[data-body="female"]').click();
  await page.waitForFunction(
    () => window.__bikeRider.rider.active === window.__bikeRider.rider.assets.get('female'),
  );
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(out, 'desktop-female.png') });
  await page.locator('[data-tab="face"]').click();
  await page.locator('[data-bindi="red"]').click();
  await page.locator('[data-earrings="jhumka"]').click();
  check(
    'Bindi and jhumka visible',
    await page.evaluate(() => {
      const m = window.__bikeRider.rider.active.meshes;
      return (
        m.get('accent_bindi')?.visible === true &&
        m.get('accent_earring_jhumka')?.visible === true &&
        m.get('accent_kajal')?.visible === true
      );
    }),
  );
  await page.screenshot({ path: path.join(out, 'desktop-female-face.png') });
  await page.locator('[data-tab="hair"]').click();
  await page.locator('[data-hair="braid"]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, 'desktop-female-braid.png') });
  await page.locator('[data-tab="gear"]').click();
  await page.waitForTimeout(400);
  check(
    'Braid hangs out below the helmet',
    await page.evaluate(() => {
      const m = window.__bikeRider.rider.active.meshes;
      return m.get('hair_braid_out')?.visible === true && m.get('hair_braid')?.visible === false;
    }),
  );
  await page.screenshot({ path: path.join(out, 'desktop-female-helmet-braid.png') });
  await page.setViewportSize({ width: 1365, height: 768 });
  await page.waitForTimeout(300);
  check(
    'Main action fits laptop',
    await page
      .locator('.btn-next')
      .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
  );
  await page.screenshot({ path: path.join(out, 'laptop-gear.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, 'mobile-gear.png') });
  pixels.mobile = await canvasCheck('mobile');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) errors.push('Mobile horizontal overflow');
  await page.locator('[data-tab="face"]').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, 'mobile-face.png') });
  await page.locator('.btn-next').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, 'mobile-road.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.btn-start').click();
  await page.waitForTimeout(4500);
  await page.keyboard.down('w');
  await page.waitForTimeout(1500);
  await page.keyboard.up('w');
  await page.screenshot({ path: path.join(out, 'ride.png') });
  const riding = await page.evaluate(() => {
    const r = window.__bikeRider.rider;
    const bones = {};
    r.root.traverse((o) => {
      if (o.isBone && /^(thigh|upper_arm)/.test(o.name)) bones[o.name] = o.quaternion.toArray();
    });
    return { pose: r.pose, bones };
  });
  check(
    'Riding pose deforms the skeleton',
    riding.pose === 'ride' &&
      Object.keys(riding.bones).length === 4 &&
      JSON.stringify(riding.bones) !== JSON.stringify(standBones),
  );
  check(
    'Ride receives throttle input',
    await page.evaluate(() => window.__bikeRider.stats.speedKmh > 0),
  );
}
fs.writeFileSync(
  path.join(out, 'results.json'),
  JSON.stringify({ errors, stats, checks, pixels }, null, 2),
);
console.log(JSON.stringify({ checks, pixels, errors }));
await browser.close();
if (errors.length) process.exitCode = 1;
