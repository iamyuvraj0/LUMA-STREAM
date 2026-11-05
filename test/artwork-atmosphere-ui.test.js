import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/assets/styles.css', import.meta.url), 'utf8');

test('artwork atmosphere has an explicit persisted artwork/gradient setting', () => {
  assert.match(html, /id="page-atmosphere"/);
  assert.match(html, /id="page-atmosphere-image"/);
  assert.match(app, /backgroundMode: 'artwork'/);
  assert.match(app, /settingChoice\('backgroundMode'/);
  assert.match(app, /safeStorageSet\('luma-atmosphere-image'/);
  assert.match(css, /html\[data-background-mode="gradient"\]/);
});

test('home artwork is synced with the hero and series watch art follows the selected episode still', () => {
  assert.match(app, /setPageAtmosphere\(artworkFor\(lead\)\)/);
  assert.match(app, /setPageAtmosphere\(artworkFor\(current\)\)/);
  assert.match(app, /setWatchAtmosphere\(watchArtworkFor\(item, type\)\)/);
  assert.match(app, /setWatchAtmosphere\(currentEpisode\?\.still \|\| fallback/);
});

test('orange is the default accent and episode states use the accent token', () => {
  assert.match(app, /safeStorageGet\('luma-accent', 'orange-ember'\)/);
  assert.match(app, /value:'orange-ember'.*color:'#ff7a1a'/);
  assert.match(app, /preset\?\.ink \|\| \(isLightHex\(primary\)/);
  assert.match(css, /\.watch-episode\.active[\s\S]*?var\(--accent\)/);
});

test('nav wordmark does not stretch over empty header space; provider names remain visible', () => {
  assert.match(css, /\.site-header \.brand \{ justify-self: start !important; width: fit-content !important;/);
  assert.match(app, /class="provider-title"/);
  assert.match(css, /\.provider-section \.provider-title,[\s\S]*?display: block !important;/);
});

test('dropdown surfaces use a darker, stronger blur and startup loader is quiet', () => {
  assert.match(css, /\.search-results\.global-search-results,[\s\S]*?background: rgba\(9,10,13,.91\) !important;/);
  assert.match(css, /backdrop-filter: blur\(18px\) saturate\(1.18\) !important/);
  assert.match(html, /startup-brand-mark/);
  assert.match(css, /@keyframes startup-minimal-load/);
});
