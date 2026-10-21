import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/assets/styles.css', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let brace = app.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = brace; i < app.length; i++) {
    const ch = app[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '`' || ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

test('homepage logo clicks navigate to a provider-filtered movie catalogue', () => {
  const row = extractFunction('providerRow');
  assert.match(row, /href="\/movies\?provider=\$\{providerId\}"/);
  assert.match(row, /data-link data-provider-browse="\$\{providerId\}"/);
  assert.match(row, /aria-label="Browse movies on \$\{escapeHtml\(p\.provider_name\)\}"/);
});

test('homepage prioritizes large local transparent wordmarks over TMDB square icons', () => {
  const row = extractFunction('providerRow');
  assert.match(row, /localLogoByBrand\.get\(brand\) \|\| p\.logo/);
  assert.match(app, /logo: '\/assets\/provider-logos\/netflix\.svg'/);
  assert.match(css, /\.provider-section \.provider-logo-frame img\s*\{[\s\S]*?width: 100% !important;[\s\S]*?height: 62px !important;[\s\S]*?object-fit: contain !important;/);
});

test('filtered provider catalogue offers Movies and Series links that preserve the provider ID', () => {
  const source = extractFunction('providerCatalogSwitch');
  const makeSwitch = new Function('providerId','isTv','providers','mergeProviderLists','escapeHtml', `${source}; return providerCatalogSwitch(providerId,isTv,providers);`);
  const providers = [{provider_id:8,provider_name:'Netflix'}];
  const html = makeSwitch(8, false, providers, list => list, value => String(value));
  assert.match(html, /href="\/movies\?provider=8"/);
  assert.match(html, /href="\/tv\?provider=8"/);
  assert.match(html, /Browsing Netflix/);
  assert.match(html, /Movies/);
  assert.match(html, /Series/);
});

test('provider endpoint failure falls back to built-in providers rather than aborting catalog rendering', () => {
  const catalog = app.split('async function renderCatalog(')[1]?.split('function openGlobalSearch')[0] || '';
  assert.match(catalog, /api\('\/api\/providers'\)\.catch\(\(\) => \[\]\)/);
  assert.match(catalog, /const mergedProviders = mergeProviderLists\(Array\.isArray\(providers\) \? providers : \[\]\)/);
});
