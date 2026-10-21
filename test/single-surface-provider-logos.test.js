import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../public/assets/styles.css', import.meta.url), 'utf8');

test('global search results use the panel surface rather than a nested background', () => {
  assert.match(css, /\.global-search-panel \.search-results,[\s\S]*?background:\s*transparent !important;[\s\S]*?box-shadow:\s*none !important;/);
});

test('provider carousel shows local wordmark logos without any tile background', () => {
  assert.match(css, /\.provider-section \.provider-row\s*\{[\s\S]*?display:\s*flex !important/);
  assert.match(css, /\.provider-section \.provider-tile,[\s\S]*?background:\s*transparent !important/);
  assert.match(css, /\.provider-section \.provider-logo-frame img[\s\S]*?object-fit:\s*contain !important;/);
  assert.match(css, /\.provider-section \.provider-initials \{ display: none !important; \}/);
});
