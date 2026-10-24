import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseDeviceInfo, looksPublicIp } from '../lib/visitor-analytics.js';

const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
const analytics = await readFile(new URL('../lib/visitor-analytics.js', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const dashboard = await readFile(new URL('../public/admin-visitors.html', import.meta.url), 'utf8');
const dashboardJs = await readFile(new URL('../public/assets/admin-visitors.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../public/assets/admin-visitors.css', import.meta.url), 'utf8');
const privacy = await readFile(new URL('../public/privacy.html', import.meta.url), 'utf8');
const privacyJs = await readFile(new URL('../public/assets/privacy.js', import.meta.url), 'utf8');

test('visitor dashboard and history routes are protected by configurable admin credentials', () => {
  assert.match(server, /app\.get\('\/admin\/visitors', requireAdmin/);
  assert.match(server, /app\.get\('\/admin\/visitors\/data', requireAdmin/);
  assert.match(server, /app\.get\('\/admin\/visitors\/history', requireAdmin/);
  assert.match(server, /process\.env\.ADMIN_PASSWORD/);
  assert.match(server, /WWW-Authenticate/);
  assert.match(dashboard, /noindex,nofollow,noarchive/);
});

test('anonymous heartbeat requests device hints and server does not persist raw IP or full user-agent', () => {
  assert.match(app, /function sendAnonymousVisitorHeartbeat\(\)/);
  assert.match(app, /getHighEntropyValues\(\['model', 'platform', 'platformVersion'\]\)/);
  assert.match(app, /fetch\('\/api\/analytics\/heartbeat'/);
  assert.match(server, /parseDeviceInfo\(req\.get\('user-agent'\)/);
  assert.match(analytics, /CREATE TABLE IF NOT EXISTS sunaa_visitor_sessions/);
  assert.match(analytics, /CREATE TABLE IF NOT EXISTS sunaa_visitor_events/);
  assert.doesNotMatch(analytics, /ip_address\s+TEXT/i);
  assert.doesNotMatch(analytics, /INSERT INTO sunaa_visitor_sessions[\s\S]{0,600}\bip_address\b/i);
  assert.doesNotMatch(analytics, /user_agent\s+TEXT/i);
});

test('device parser extracts browser and approximate device model where exposed', () => {
  const android = parseDeviceInfo('Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/UP1A.231005.007) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36', '', 'Android', 'mobile');
  assert.equal(android.device, 'mobile');
  assert.match(android.deviceModel, /Pixel 8 Pro/);
  assert.match(android.browser, /Chrome 122/);
  assert.match(android.os, /Android 14/);
  const iphone = parseDeviceInfo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Version/17.2 Mobile/15E148 Safari/604.1', '', 'iOS', 'mobile');
  assert.match(iphone.deviceModel, /iPhone/);
  assert.match(iphone.deviceModel, /hidden/);
});

test('IP geolocation rejects private addresses and the UI labels location as an estimate', () => {
  assert.equal(looksPublicIp('127.0.0.1'), false);
  assert.equal(looksPublicIp('192.168.1.4'), false);
  assert.equal(looksPublicIp('10.2.3.4'), false);
  assert.equal(looksPublicIp('8.8.8.8'), true);
  assert.match(analytics, /https:\/\/ipwho\.is\//);
  assert.match(dashboard, /IP location is approximate/);
  assert.match(privacy, /The raw IP address is not written to the visitor analytics database/);
  assert.match(privacy, /analytics-toggle/);
  assert.match(privacyJs, /sunaa-analytics-opt-out/);
  assert.match(app, /sunaa-analytics-opt-out/);
});

test('persistent history supports counts, search, sorting and pagination', () => {
  assert.match(analytics, /total_page_views/);
  assert.match(analytics, /returning_visitors/);
  assert.match(analytics, /ORDER BY last_seen DESC LIMIT/);
  assert.match(analytics, /visitorHistory\(/);
  assert.match(server, /DATABASE_URL/);
  assert.match(dashboard, /Visitor history/);
  assert.match(dashboard, /history-search/);
  assert.match(dashboard, /history-prev/);
  assert.match(dashboard, /history-next/);
  assert.match(dashboardJs, /\/admin\/visitors\/history/);
});

test('dashboard has modern glass/clay visuals and mobile responsive rules', () => {
  assert.match(dashboard, /Audience Studio/);
  assert.match(styles, /admin-atmosphere\.svg/);
  assert.match(styles, /backdrop-filter:blur/);
  assert.match(styles, /inset 2px 2px/);
  assert.match(styles, /@media\(max-width:560px\)/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
});

test('continue watching and the homepage finish remain in place', async () => {
  assert.match(app, /function formatPlaybackTime\(seconds\)/);
  assert.match(app, /Resume at \$\{formatPlaybackTime\(position\)\}/);
  assert.match(app, /\?startAt=\$\{Math\.floor\(Number\(resumeSeconds\)\)\}/);
  const mainStyles = await readFile(new URL('../public/assets/styles.css', import.meta.url), 'utf8');
  assert.match(mainStyles, /\.hero::after\s*\{[\s\S]*?linear-gradient\(180deg/);
  assert.match(mainStyles, /\.provider-section \.provider-tile > strong\s*\{[\s\S]*?display: block !important/);
});
