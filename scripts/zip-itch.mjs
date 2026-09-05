/**
 * Builds the public bundle and zips dist/ for itch.io (HTML5 upload, "This file will be played
 * in the browser", index.html at the root). Run: npm run zip:itch
 */
import { execSync } from 'node:child_process';
import { existsSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'bike-rider-itch.zip');

execSync('npm run build', {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_PUBLIC_BUILD: '1' },
});
if (existsSync(out)) rmSync(out);
// Vite copies everything in public/, including the locally fetched Royal Enfield model. It must
// never leave this machine, so strip it from the bundle before zipping.
const model = path.join(root, 'dist/models/scram411.glb');
if (existsSync(model)) {
  rmSync(model);
  console.log('• removed dist/models/scram411.glb (local-only asset)');
}
// itch wants index.html at the zip root, so zip the *contents* of dist/.
execSync(`cd "${path.join(root, 'dist')}" && zip -qr "${out}" .`, { stdio: 'inherit' });
console.log(`✓ ${path.relative(root, out)} (${(statSync(out).size / 1e6).toFixed(1)} MB)`);
