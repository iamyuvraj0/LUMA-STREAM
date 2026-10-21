import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/assets/styles.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('em dashes are normalized in visible HTML strings and dynamic metadata', () => {
  assert.match(app, /function escapeHtml\(value = ''\).*replace\(\/\\u2014\/g, '-'\)/s);
  assert.match(app, /const titleText = String\(title \|\| 'Discover Movies & TV'\)\.replace\(\/\\u2014\/g, '-'\)/);
  assert.match(app, /const cleanDescription = String\(description[\s\S]*?replace\(\/\\u2014\/g, '-'\)/);
  assert.doesNotMatch(html + css, /\u2014/);
});

test('hero contains no previous, pause or next pill and auto-rotates with reduced-motion guard', () => {
  const heroBlock = app.split('function hero(')[1]?.split('function railKey(')[0] || '';
  assert.doesNotMatch(heroBlock, /data-hero-(?:prev|next|toggle|dot)/);
  assert.match(app, /function startHeroCarousel[\s\S]*?setInterval\([\s\S]*?\}, 6800\)/);
  assert.match(app, /function shouldReduceMotion\(\)[\s\S]*?prefers-reduced-motion/);
  assert.match(css, /@keyframes heroZoom/);
});

test('navbar keeps a single sliding five-destination indicator and no static active bubble', () => {
  const navBlock = app.split('function nav(')[1]?.split('function footer(')[0] || '';
  assert.match(navBlock, /data-global-search-toggle/);
  assert.match(navBlock, /class="bottom-liquid-nav"/);
  for (const route of ['/', '/browse', '/movies', '/tv', '/my-list']) assert.ok(navBlock.includes(`'${route}'`));
  assert.doesNotMatch(navBlock, /class="desktop-nav"/);
  assert.match(css, /\.bottom-liquid-indicator[\s\S]*?transition: transform \.42s/);
  assert.doesNotMatch(navBlock, /nav-liquid-pill|nav-liquid-trail|luma-liquid-filters/);
  assert.match(css, /\.bottom-nav-link\.active, \.bottom-nav-link\.active:hover[\s\S]*?background: transparent !important/);
});

test('global search expands its liquid field and suggestion items force full detail pages', () => {
  assert.match(app, /function openGlobalSearch[\s\S]*?global-liquid-search[\s\S]*?classList\.add\('open'\)/);
  assert.match(app, /function closeGlobalSearch[\s\S]*?global-liquid-search[\s\S]*?classList\.remove\('open'\)/);
  assert.match(app, /function globalSearchResult[\s\S]*?data-link data-force-page="true"/);
  assert.match(app, /function runGlobalSearch[\s\S]*?\/api\/search\?query=/);
});

test('gradient and accent palettes have searchable controls, intensity and dual custom accents', () => {
  assert.match(app, /const GRADIENT_PALETTES = \[/);
  assert.match(app, /id="gradient-palette-input"/);
  assert.match(app, /id="gradient-intensity" type="range"/);
  assert.match(app, /id="gradient-motion-switch"[\s\S]*?role="switch"/);
  assert.match(app, /id="accent-palette-input"/);
  assert.match(app, /data-accent-color="accentPrimary"/);
  assert.match(app, /data-accent-color="accentSecondary"/);
});

test('detail synopsis is hidden by default, revealed on hover/focus, and episode selectors are pills', () => {
  assert.match(css, /\.details-copy \.hero-overview\s*\{[^}]*max-height:0/);
  assert.match(css, /\.details-copy:hover \.hero-overview/);
  assert.match(css, /\.details-copy:focus-within \.hero-overview/);
  assert.match(app, /class="synopsis-toggle" data-synopsis-toggle/);
  assert.match(app, /class="episode-pill/);
  assert.match(css, /\.episode-pill\s*\{[^}]*border-radius:999px/);
});

test('expensive continuous card and background animations are disabled while core navigation remains animated', () => {
  assert.match(css, /body::after \{ animation: none !important; filter: none !important; will-change: auto !important/);
  assert.match(css, /\.movie-card, \.provider-tile, \.loading-orb, \.skeleton,[\s\S]*?animation: none !important/);
  assert.match(css, /html \{ scroll-behavior: auto !important; \}/);
  assert.match(css, /\.bottom-liquid-indicator[\s\S]*?transition: transform \.42s/);
  assert.match(app, /document\.startViewTransition[\s\S]*?shouldReduceMotion\(\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});


test('watch page has a two-column player/episode layout with thumbnail summaries and season tabs', () => {
  assert.match(app, /class="watch-layout \${isSeries \? 'has-episodes'/);
  assert.match(app, /class="watch-episode \${ep\.episode_number === episode/);
  assert.match(app, /ep\.still \|\| fallback/);
  assert.match(app, /episodeGrid\.querySelectorAll\('\[data-episode\]'\)/);
  assert.match(app, /class="watch-season-tabs" role="tablist"/);
  assert.match(css, /\.watch-layout \{[\s\S]*?grid-template-columns: minmax\(0, 2\.05fr\) minmax\(310px, \.95fr\)/);
  assert.match(css, /\.watch-episode\.active \{ border-color: #e11b2d/);
});

test('removed legacy sources stay absent while requested SuperEmbed is configured explicitly', async () => {
  const server = await readFile(new URL('../lib/security-headers.js', import.meta.url), 'utf8');
  const config = JSON.parse(await readFile(new URL('../data/embed-providers.json', import.meta.url), 'utf8'));
  assert.doesNotMatch(app, /'VidSrc Hair'|'AutoEmbed'|'MultiEmbed'/);
  assert.doesNotMatch(app + server, /vidsrc\.hair|player\.autoembed\.app/);
  assert.match(server, /https:\/\/multiembed\.mov/);
  assert.equal(config.providers.find(provider => provider.name === 'SuperEmbed')?.movie, 'https://multiembed.mov/?video_id={id}&tmdb=1');
});

test('frosted glass is subtle, static, and does not run the liquid-refraction module', () => {
  assert.doesNotMatch(app, /import ['"]\.\/liquid-glass\.js['"]/);
  assert.doesNotMatch(app, /class="poster-liquid-lens"|class="luma-liquid-filters"/);
  assert.match(css, /background-image: none !important;[\s\S]*?backdrop-filter: blur\(2px\) saturate\(1\.04\) !important/);
  assert.match(css, /html \{ scroll-behavior: auto !important; \}/);
});

test('five official fallback searches and regional provider availability are offered separately from iframe sources', () => {
  assert.match(app, /name: 'Netflix'/);
  assert.match(app, /name: 'Prime Video'/);
  assert.match(app, /name: 'Apple TV'/);
  assert.match(app, /name: 'YouTube'/);
  assert.match(app, /name: 'Plex'/);
  assert.match(app, /regional\?\.link/);
  assert.match(app, /JustWatch/);
});


test('watch player has an authorized-download picker with resolution-first selection', () => {
  assert.match(app, /data-open-download/);
  assert.match(app, /async function openDownloadModal/);
  assert.match(app, /highest verified direct-file quality|highest available quality in LUMA/);
  assert.match(app, /\/api\/downloads\/\$\{type\}\/\$\{id\}/);
  assert.match(css, /\.download-quality-select/);
});


test('settings use a clean unframed section and global search has one close control', () => {
  assert.doesNotMatch(app, /id="global-search-clear"/);
  assert.doesNotMatch(app, /closest\('#global-search-clear'\)/);
  assert.match(app, /id="global-search-close"/);
  assert.match(css, /settings-content > \.settings-section,\s*\n\.settings-content > \.settings-section \+ \.settings-section \{\s*border: 0 !important/);
  assert.match(css, /global-liquid-search\.open input \{ right: 18px !important; width: calc\(100% - 36px\) !important/);
});


test('download dialog exposes only VidVault provider pages for movies and episodes', () => {
  assert.match(app, /function externalDownloadOptionsMarkup/);
  assert.doesNotMatch(app, /redflix\.co\/play/);
  assert.match(app, /https:\/\/vidvault\.to\/movie\/\$\{mediaId\}/);
  assert.match(app, /https:\/\/vidvault\.to\/tv\/\$\{mediaId\}\/\$\{seasonNumber\}\/\$\{episodeNumber\}/);
  assert.match(app, /target=\"_blank\" rel=\"noopener noreferrer\"/);
  assert.match(css, /\.download-provider-options/);
  assert.match(css, /\.download-provider-links/);
});

test('now playing details are rendered after the player and before source selector', () => {
  const player = app.indexOf('class=\"player-wrap\"');
  const nowPlaying = app.indexOf('class=\"watch-heading\"', player);
  const selector = app.indexOf('aria-label=\"Streaming source selector\"', nowPlaying);
  assert.ok(player >= 0 && nowPlaying > player && selector > nowPlaying);
});
