import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { BoundedTTLCache } from '../lib/bounded-cache.js';
import { FixedWindowRateLimiter, rateLimitMiddleware } from '../lib/rate-limit.js';
import { compressionMiddleware } from '../lib/compression.js';
import { securityHeaders } from '../lib/security-headers.js';
import { sendApiError } from '../lib/api-errors.js';

function fakeResponse() {
  const headers = new Map();
  const chunks = [];
  return {
    statusCode: 200,
    headers,
    chunks,
    ended: false,
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); return this; },
    removeHeader(name) { headers.delete(String(name).toLowerCase()); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; this.setHeader('content-type', 'application/json'); this.ended = true; return this; },
    write(chunk, encoding, callback) {
      if (chunk !== undefined && chunk !== null) this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : undefined));
      if (typeof encoding === 'function') encoding(); else if (callback) callback();
      return true;
    },
    end(chunk, encoding, callback) {
      if (typeof chunk === 'function') { callback = chunk; chunk = undefined; encoding = undefined; }
      else if (typeof encoding === 'function') { callback = encoding; encoding = undefined; }
      if (chunk !== undefined && chunk !== null) this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : undefined));
      this.ended = true;
      if (callback) callback();
      return this;
    },
  };
}

function fakeRequest(overrides = {}) {
  return { method: 'GET', headers: {}, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' }, secure: false, ...overrides };
}

test('bounded TTL cache enforces its entry cap and LRU order', () => {
  let now = 1_000;
  const cache = new BoundedTTLCache({ maxEntries: 2, ttlMs: 100, now: () => now });
  cache.set('a', 'A').set('b', 'B');
  assert.equal(cache.get('a'), 'A');
  cache.set('c', 'C');
  assert.equal(cache.size, 2);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 'A');
  now += 101;
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('c'), undefined);
  assert.equal(cache.size, 0);
});

test('fixed-window rate limiter blocks over-limit requests and resets', () => {
  let now = 5_000;
  const limiter = new FixedWindowRateLimiter({ windowMs: 10_000, max: 2, maxClients: 100, now: () => now });
  assert.equal(limiter.consume('client-a').allowed, true);
  assert.equal(limiter.consume('client-a').remaining, 0);
  const blocked = limiter.consume('client-a');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 10);
  now += 10_001;
  assert.equal(limiter.consume('client-a').allowed, true);
});

test('rate-limit middleware returns 429 and Retry-After after limit is exceeded', () => {
  const limiter = new FixedWindowRateLimiter({ windowMs: 60_000, max: 1, maxClients: 100 });
  const res1 = fakeResponse();
  let nextCalled = false;
  rateLimitMiddleware(limiter)(fakeRequest(), res1, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  const res2 = fakeResponse();
  rateLimitMiddleware(limiter)(fakeRequest(), res2, () => { nextCalled = true; });
  assert.equal(res2.statusCode, 429);
  assert.equal(res2.getHeader('retry-after'), '60');
  assert.match(res2.body.error, /Too many requests/);
});

test('rate limiter keeps its per-process client table bounded', () => {
  const limiter = new FixedWindowRateLimiter({ windowMs: 60_000, max: 2, maxClients: 100 });
  for (let index = 0; index < 150; index += 1) limiter.consume(`client-${index}`);
  assert.ok(limiter.clients.size <= 100);
});

test('security headers include a restrictive CSP and deny unnecessary browser capabilities', () => {
  const res = fakeResponse();
  let passed = false;
  securityHeaders(fakeRequest(), res, () => { passed = true; });
  assert.equal(passed, true);
  assert.equal(res.getHeader('x-content-type-options'), 'nosniff');
  assert.equal(res.getHeader('x-frame-options'), 'SAMEORIGIN');
  assert.equal(res.getHeader('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.match(res.getHeader('content-security-policy'), /object-src 'none'/);
  assert.match(res.getHeader('content-security-policy'), /frame-src[^;]*vidsrc\.to/);
  assert.match(res.getHeader('permissions-policy'), /microphone=\(\)/);
  assert.doesNotMatch(res.getHeader('content-security-policy'), /script-src[^;]*unsafe-inline/);
});

test('gzip compression produces valid bytes, sets Vary and preserves payload', () => {
  const res = fakeResponse();
  const req = fakeRequest({ headers: { 'accept-encoding': 'gzip' } });
  compressionMiddleware({ threshold: 1, maxBufferBytes: 10_000 })(req, res, () => {});
  res.setHeader('content-type', 'text/html; charset=utf-8');
  const html = '<!doctype html><html><body>' + 'LUMA stream discovery '.repeat(100) + '</body></html>';
  res.end(Buffer.from(html));
  assert.equal(res.getHeader('content-encoding'), 'gzip');
  assert.match(res.getHeader('vary'), /accept-encoding/i);
  assert.equal(gunzipSync(Buffer.concat(res.chunks)).toString('utf8'), html);
  assert.equal(res.getHeader('content-length'), undefined);
});

test('compression respects q=0 and passes through oversized payloads without corrupting data', () => {
  const noGzip = fakeResponse();
  compressionMiddleware({ threshold: 1, maxBufferBytes: 1024 })(fakeRequest({ headers: { 'accept-encoding': 'gzip;q=0' } }), noGzip, () => {});
  noGzip.setHeader('content-type', 'text/plain');
  noGzip.end('plain text');
  assert.equal(noGzip.getHeader('content-encoding'), undefined);
  assert.equal(Buffer.concat(noGzip.chunks).toString(), 'plain text');

  const oversized = fakeResponse();
  compressionMiddleware({ threshold: 1, maxBufferBytes: 8 })(fakeRequest({ headers: { 'accept-encoding': 'gzip' } }), oversized, () => {});
  oversized.setHeader('content-type', 'text/plain');
  oversized.write('123456');
  oversized.end('7890abcdef');
  assert.equal(oversized.getHeader('content-encoding'), undefined);
  assert.equal(Buffer.concat(oversized.chunks).toString(), '1234567890abcdef');
});

test('compression respects Cache-Control no-transform', () => {
  const res = fakeResponse();
  compressionMiddleware({ threshold: 1 })(fakeRequest({ headers: { 'accept-encoding': 'gzip' } }), res, () => {});
  res.setHeader('content-type', 'text/html');
  res.setHeader('cache-control', 'public, no-transform');
  res.end('LUMA HTML content that should not be transformed');
  assert.equal(res.getHeader('content-encoding'), undefined);
  assert.equal(Buffer.concat(res.chunks).toString(), 'LUMA HTML content that should not be transformed');
});

test('API errors use stable client-safe messages', () => {
  const res = fakeResponse();
  sendApiError(res, new Error('private upstream payload or secret'), { tmdbConfigured: true });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, 'The catalogue service is temporarily unavailable.');
  assert.doesNotMatch(JSON.stringify(res.body), /private upstream payload|secret/);

  const unconfigured = fakeResponse();
  sendApiError(unconfigured, Object.assign(new Error('not configured'), { code: 'TMDB_NOT_CONFIGURED' }), { tmdbConfigured: false });
  assert.equal(unconfigured.statusCode, 503);
});

test('theme bootstrap CSP hash matches the actual inline script', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match, 'expected inline theme bootstrap script');
  const hash = createHash('sha256').update(match[1]).digest('base64');
  const res = fakeResponse();
  securityHeaders(fakeRequest(), res, () => {});
  assert.ok(res.getHeader('content-security-policy').includes(`'sha256-${hash}'`));
});
