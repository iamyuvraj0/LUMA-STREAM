import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/assets/styles.css', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');

test('homepage places Continue watching then Studios & Platforms before Trending today', () => {
  const render = app.split('async function renderHome()')[1]?.split('async function renderBrowse()')[0] || '';
  const hero = render.indexOf('${hero(lead');
  const resume = render.indexOf('${continueWatchingSection()}', hero);
  const providers = render.indexOf('${providerRow(state.home.providers)}', resume);
  const trending = render.indexOf("${section('Trending today'", providers);
  assert.ok(hero >= 0 && resume > hero && providers > resume && trending > providers);
});

test('Continue watching is based on saved watch records and renders a real per-title watch route', () => {
  assert.match(app, /function updateWatchHistory\([\s\S]*?watchPath: watchPathFor\(type, item\.id, season, episode\)/);
  assert.match(app, /function continueWatchingSection\([\s\S]*?state\.history\.filter\(entry => \{[\s\S]*?Number\.isFinite\(Number\(entry\.id\)\)/);
  assert.match(app, /Your next watch belongs here/);
  assert.match(app, /watchPathFor\(type, entry\.id, season, episode\)/);
  assert.match(app, /resumeSeconds: safeCurrentTime/);
  assert.match(app, /progress=\$\{Math\.floor\(Number\(resumeSeconds\)\)\}/);
  assert.match(app, /continue-progress-track/);
});

test('VidKing playback events are scoped to the iframe and an exact trusted origin', () => {
  assert.match(app, /event\.source !== player\.contentWindow/);
  assert.match(app, /https:\/\/www\.vidking\.net/);
  assert.match(app, /envelope\.type !== 'PLAYER_EVENT'/);
  assert.match(app, /\['timeupdate', 'play', 'pause', 'seeked', 'ended'\]/);
  assert.match(app, /const episodeChanged = hasEpisode && \(reportedSeason !== season \|\| reportedEpisode !== episode\)/);
  assert.match(app, /renderSourcesForEpisode\(\{ reloadPlayer: false, resumeSeconds: 0 \}\)/);
});

test('season labels normalize underscore and decimal-number names such as season_1.0', () => {
  assert.match(app, /function formatSeasonLabel\(season\)/);
  const source = app.match(/function formatSeasonLabel\(season\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, 'season formatter exists');
  const formatSeasonLabel = new Function(`return (${source})`)();
  assert.equal(formatSeasonLabel({ name: 'season_1.0', season_number: 1 }), 'Season 1');
  assert.equal(formatSeasonLabel({ name: '', season_number: 2 }), 'Season 2');
  assert.match(app, /formatSeasonLabel\(s\)/);
});

test('homepage selector uses merged movie and TV provider data with direct logo-only marks', () => {
  assert.match(app, /api\('\/api\/providers'\)/);
  assert.match(app, /function providerBrand\(/);
  assert.match(app, /class="provider-tile provider-\$\{providerBrand\(p\.provider_name\)\}"/);
  assert.match(css, /\.provider-section \.provider-row \{[\s\S]*?display: flex !important/);
  assert.match(css, /\.provider-section \.provider-tile,[\s\S]*?background: transparent !important/);
  assert.match(css, /\.provider-section \.provider-logo-frame img[\s\S]*?object-fit: contain !important/);
  assert.match(server, /tmdb\('\/watch\/providers\/movie'/);
  assert.match(server, /tmdb\('\/watch\/providers\/tv'/);
});

test('movie and TV provider filter both use the same combined provider endpoint', () => {
  const catalog = app.split('async function renderCatalog(')[1]?.split('async function')[0] || '';
  assert.match(catalog, /api\('\/api\/providers'\)/);
  assert.match(catalog, /const mergedProviders = mergeProviderLists\(Array\.isArray\(providers\) \? providers : \[\]\)/);
  assert.match(catalog, /providerOptions = \[\{value:'',label:'All Providers'\}\]\.concat\(mergedProviders\.map\(/);
  assert.match(server, /\[\.\.\.\(movies\.results \|\| \[\]\), \.\.\.\(tv\.results \|\| \[\]\)\]/);
});

test('movie cards lift and zoom slightly as a coordinated hover motion', () => {
  assert.match(css, /\.movie-card:hover \{ transform: translate3d\(0,-4px,0\) scale\(1\.012\) !important/);
  assert.match(css, /\.movie-card:hover \.poster-wrap \{ transform: translate3d\(0,-1px,0\) scale\(1\.008\) !important/);
});

test('rail control state is looked up on the containing section so provider arrows can disable at each edge', () => {
  assert.match(app, /function updateRailButtons\(row\)\s*\{[\s\S]*?row\.closest\('\.section, \.provider-section'\)\?\.querySelector\('\.section-header'\)/);
});

test('VidKing resume position tolerates currentTime or a plausible seconds timestamp', () => {
  assert.match(app, /const reportedCurrentTime = payload\.currentTime \?\? \(Number\.isFinite\(reportedTimestamp\) && reportedTimestamp >= 0 && reportedTimestamp < 60 \* 60 \* 24 \? reportedTimestamp : undefined\)/);
  assert.match(app, /const safeCurrentTime = Number\.isFinite\(currentTime\) && currentTime >= 0 && currentTime < 60 \* 60 \* 24/);
});


test('empty API provider responses still render a provider carousel with local brand wordmarks inside the tile layout', async () => {
  assert.match(app, /const BUILT_IN_PROVIDERS = \[([\s\S]*?)\];/);
  assert.match(app, /function mergeProviderLists\([\s\S]*?for \(const provider of BUILT_IN_PROVIDERS\)/);
  assert.match(app, /providers = mergeProviderLists\(providers\);/);
  assert.match(app, /state\.home\.providers = mergeProviderLists\(/);
  for (const file of ['netflix.svg','prime-video.svg','amc-plus.svg','apple-tv-plus.svg','crunchyroll.svg','disney-plus.svg','hulu.svg','max.svg','paramount-plus.svg','peacock.svg']) {
    const logo = await readFile(new URL(`../public/assets/provider-logos/${file}`, import.meta.url), 'utf8');
    assert.match(logo, /<svg[\s\S]*<title>[\s\S]*<\/svg>/);
    assert.doesNotMatch(logo, /<rect[^>]+fill=["'](?:#fff|white|#000|black)["']/i);
  }
});


test('homepage keeps Continue watching and provider logos visible if catalogue API fails', () => {
  const render = app.split('async function renderHome()')[1]?.split('async function renderBrowse()')[0] || '';
  assert.match(render, /catch \(e\) \{[\s\S]*?state\.home = \{/);
  assert.match(render, /\$\{continueWatchingSection\(\)\}\$\{providerRow\(state\.home\.providers\)\}/);
  assert.match(app, /function providerRow\(providers = \[\]\)/);
});
