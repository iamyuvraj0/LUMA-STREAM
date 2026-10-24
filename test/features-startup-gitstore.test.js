import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/assets/styles.css', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

test('startup screen uses a custom projector iris sequence and is accessible', () => {
  assert.match(html, /id="startup-screen" class="startup-screen" role="status"/);
  assert.match(html, /startup-aperture/);
  assert.match(css, /@keyframes startup-lens-open/);
  assert.match(css, /startup-screen\.is-leaving/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.startup-screen\{display:none!important\}/);
  assert.match(app, /function finishStartupScreen\([\s\S]*?startupFailsafe/);
  assert.match(app, /setTimeout\(\(\) => finishStartupScreen\(\{ immediate: true \}\), 4200\)/);
  assert.match(html, /v=20261024-startup-features-gitstore/);
});

test('features page covers implemented functionality and avoids overpromising subtitles or audio tracks', () => {
  assert.match(app, /function renderFeatures\(\)/);
  for (const term of ['Search with intent', 'Filter the catalogue', 'Choose a playback source', 'Subtitles & audio languages', 'Continue Watching', 'Season and episode navigation', 'Download choices', 'A personal shelf on this device', 'Make the interface yours', 'Know the story before you press play']) assert.ok(app.includes(term), `Missing feature page item: ${term}`);
  assert.match(app, /when the selected embedded player offers them/i);
  assert.match(app, /Options vary by title and source/i);
  assert.match(app, /does not own or control every stream/);
  assert.match(app, /if \(parts\[0\] === 'features'\) return renderFeatures\(\)/);
  assert.match(server, /'\/features': \['Features \| STREAM SUNAA'/);
  assert.match(server, /const paths = \[.*'\/features'.*'\/gitstore'/);
});

test('GitStore is a working source hub pointing to the existing GitHub repository', () => {
  assert.match(app, /function renderGitStore\(\)/);
  assert.match(app, /https:\/\/github\.com\/iamyuvraj0\/LUMA-STREAM/);
  assert.match(app, /git clone https:\/\/github\.com\/iamyuvraj0\/LUMA-STREAM\.git/);
  assert.match(app, /archive\/refs\/heads\/main\.zip/);
  assert.match(app, /data-copy-clone/);
  assert.match(app, /if \(parts\[0\] === 'gitstore'\) return renderGitStore\(\)/);
  assert.match(server, /'\/gitstore': \['GitStore/);
  assert.match(server, /const paths = \[.*'\/features'.*'\/gitstore'/);
  assert.match(readme, /`\/gitstore` links the project GitHub repository/);
});
