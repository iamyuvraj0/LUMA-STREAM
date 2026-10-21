import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

test('SEO endpoints include robots and a sitemap with canonical absolute URLs', () => {
  assert.match(server, /app\.get\('\/robots\.txt'/);
  assert.match(server, /app\.get\('\/sitemap\.xml'/);
  assert.match(server, /new URL\(route, origin\)\.href/);
  assert.match(server, /trending\/all\/week/);
  assert.match(server, /movie\/popular/);
  assert.match(server, /tv\/popular/);
  assert.match(server, /Disallow: \/api\//);
});

test('initial HTML includes structured data and a replaceable SSR-content slot', () => {
  assert.match(html, /id="seo-jsonld" type="application\/ld\+json"/);
  assert.match(html, /<!--LUMA-SEO-CONTENT-->/);
  assert.match(html, /<div id=\"app\"><!--LUMA-SEO-CONTENT-->\<\/div>/);
  assert.doesNotMatch(html, /<\/div><\/article><\/main><\/div>/);
  assert.match(server, /html = html\.replace\('<!--LUMA-SEO-CONTENT-->'/);
  assert.match(server, /'@type': isSeries \? 'TVSeries' : 'Movie'/);
  assert.match(server, /'@type': 'Person'/);
});

test('detail pages send real semantic fallback content before the SPA boots', () => {
  assert.match(server, /function makeSeoFallback/);
  assert.match(server, /<h1>\$\{htmlEscape\(title\)\}<\/h1>/);
  assert.match(server, /metadata\.ssrHtml = makeSeoFallback/);
});

test('the empty download state links external providers without pretending an embed is a video file', () => {
  assert.match(app, /Choose a download source/);
  assert.match(app, /will not save a player page or rename a stream playlist as an MP4/);
  assert.match(app, /officialOptionsMarkup/);
  assert.match(app, /externalDownloadOptionsMarkup/);
  assert.doesNotMatch(app, /Provider integration settings are documented in <code>\.env\.example/);
  assert.match(readme, /A rendition is shown only when/);
  assert.match(readme, /does not document a direct MP4 download API/);
  assert.match(app, /const jsonLd = document\.getElementById\('seo-jsonld'\)/);
  assert.match(app, /max-image-preview:large/);
});
