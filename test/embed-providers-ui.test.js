import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');

test('watch page loads configured embed templates and follows the saved preferred source order', () => {
  assert.match(server, /app\.get\('\/api\/embed-providers'/);
  assert.match(app, /api\('\/api\/embed-providers'\)/);
  assert.match(app, /\.replaceAll\('\{id\}', encoded\)/);
  assert.match(app, /\.replaceAll\('\{season\}', String\(s\)\)/);
  assert.match(app, /\.replaceAll\('\{episode\}', String\(e\)\)/);
  assert.match(app, /const order = Array\.isArray\(state\.settings\.serverOrder\)/);
  assert.match(app, /return \[\.\.\.preferred, \.\.\.remaining\]/);
  assert.match(app, /\.replaceAll\('\{imdb\}', encodeURIComponent\(imdbId\)\)/);
  assert.match(app, /'CineSrc'.*'FilmU'.*'2Embed'.*'VidLink'.*'VidRift'/);
});


test('watch source picker shows at most eight provider pills until More is expanded', () => {
  assert.match(app, /const SOURCE_PREVIEW_LIMIT = 8/);
  assert.match(app, /function sourcePillsMarkup\(sources, activeName = sources\[0\]\?\.name, expanded = false\)/);
  assert.match(app, /data-toggle-source-list/);
  assert.match(app, /sourceListExpanded = moreButton\.dataset\.expanded !== 'true'/);
  assert.match(app, /Show less/);
});

test('VidSrc API uses current documented query-string endpoints', () => {
  assert.match(app, /'VidSrc API': \{ name:'VidSrc API', url:movie \? `https:\/\/vidsrc\.sh\/embed\/movie\?tmdb=\$\{encoded\}` : `https:\/\/vidsrc\.sh\/embed\/tv\?tmdb=\$\{encoded\}&season=\$\{s\}&episode=\$\{e\}` \}/);
});
