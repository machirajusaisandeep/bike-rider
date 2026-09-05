/**
 * Downloads the Scram 411 GLB that Royal Enfield's digital quick-start viewer uses, plus the
 * Draco decoder from three.js, into public/ for LOCAL use.
 *
 * Both destinations are gitignored on purpose: the model is Royal Enfield's copyrighted asset
 * and is not redistributed by this repository. Without it the game falls back to the built-in
 * procedural bike automatically.
 */
import { createWriteStream, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_URL =
  'https://www.royalenfield.com/content/dam/royal-enfield/scram-digital-quickstart/3D/23-03-22.glb';
const MODEL_OUT = path.join(root, 'public/models/scram411.glb');
const DRACO_SRC = path.join(root, 'node_modules/three/examples/jsm/libs/draco/gltf');
const DRACO_OUT = path.join(root, 'public/draco');

async function download(url, out) {
  mkdirSync(path.dirname(out), { recursive: true });
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 bike-rider-dev' } });
  if (!res.ok || !res.body) throw new Error(`${url} -> HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(out));
  const mb = (statSync(out).size / 1e6).toFixed(1);
  console.log(`✓ ${path.relative(root, out)} (${mb} MB)`);
}

const force = process.argv.includes('--force');
if (existsSync(MODEL_OUT) && !force) {
  console.log(`• ${path.relative(root, MODEL_OUT)} already present (use --force to re-download)`);
} else {
  await download(MODEL_URL, MODEL_OUT);
}

mkdirSync(DRACO_OUT, { recursive: true });
for (const f of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']) {
  copyFileSync(path.join(DRACO_SRC, f), path.join(DRACO_OUT, f));
}
console.log(`✓ public/draco/ (decoder copied from three.js)`);
console.log('\nModel is for local use only and is gitignored. Run `npm run dev` and reload.');
