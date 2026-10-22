import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const dashboard = await readFile(new URL('../public/admin-visitors.html', import.meta.url), 'utf8');
const dashboardJs = await readFile(new URL('../public/assets/admin-visitors.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../public/assets/styles.css', import.meta.url), 'utf8');

 test('visitor dashboard route is protected by configurable admin credentials', () => {
  assert.match(server, /app\.get\('\/admin\/visitors', requireAdmin/);
  assert.match(server, /app\.get\('\/admin\/visitors\/data', requireAdmin/);
  assert.match(server, /process\.env\.ADMIN_PASSWORD/);
  assert.match(server, /WWW-Authenticate/);
  assert.match(dashboard, /noindex,nofollow,noarchive/);
});

test('anonymous visitor tracking sends only random ID, internal path, title and coarse device type', () => {
  assert.match(app, /function sendAnonymousVisitorHeartbeat\(\)/);
  assert.match(app, /fetch\('\/api\/analytics\/heartbeat'/);
  assert.match(app, /\{ id: anonymousVisitorId\(\), path: location\.pathname, title, device: visitorDeviceClass\(\) \}/);
  assert.match(server, /const visitor = \{[\s\S]*?path: pathName, title, device/);
  assert.doesNotMatch(server, /visitor\.ipAddress|visitor\.userAgent|req\.ip.*liveVisitors/);
});

test('dashboard renders live, active, popularity and recent activity views with periodic refresh', () => {
  assert.match(dashboard, /Active sessions/);
  assert.match(dashboard, /Popular right now/);
  assert.match(dashboard, /Live activity feed/);
  assert.match(dashboardJs, /setInterval\(\(\) => \{ if \(!document\.hidden\) refreshDashboard\(\); \}, 5000\)/);
  assert.match(server, /VISITOR_ACTIVE_MS = 75_000/);
  assert.match(server, /MAX_VISITOR_EVENTS = 200/);
});

test('Continue Watching shows saved position and supports documented resume parameters for VidSrc', () => {
  assert.match(app, /function formatPlaybackTime\(seconds\)/);
  assert.match(app, /Resume at \$\{formatPlaybackTime\(position\)\}/);
  assert.match(app, /\?startAt=\$\{Math\.floor\(Number\(resumeSeconds\)\)\}/);
  assert.match(app, /payload\.player_progress/);
  assert.match(app, /state\.watchPersistHandler = persistLatestPlayback/);
});

test('hero background fades into page and provider wordmarks have visible labels and fallbacks', () => {
  assert.match(styles, /\.hero::after\s*\{[\s\S]*?linear-gradient\(180deg/);
  assert.match(styles, /\.provider-section \.provider-tile > strong\s*\{[\s\S]*?display: block !important/);
  assert.match(app, /provider-logo-fallback/);
  assert.match(app, /fallback\.classList\.add\('visible'\)/);
});
