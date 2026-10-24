import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BoundedTTLCache } from './lib/bounded-cache.js';
import { compressionMiddleware } from './lib/compression.js';
import { FixedWindowRateLimiter, rateLimitMiddleware } from './lib/rate-limit.js';
import { securityHeaders } from './lib/security-headers.js';
import { sendApiError as respondToApiError } from './lib/api-errors.js';
import { createDownloadCatalog, safeFilename } from './lib/download-catalog.js';
import { createProviderDownloadAdapter } from './lib/provider-downloads.js';
import { createEmbedProviderRegistry } from './lib/embed-providers.js';
import { streamDownloadFile } from './lib/download-http.js';
import { VisitorAnalytics, parseDeviceInfo, lookupIpLocation, makeLocationLabel } from './lib/visitor-analytics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Trust only the explicitly configured hosting ingress. Avoid blindly trusting client-supplied X-Forwarded-For headers locally.
const trustedProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || (process.env.RENDER ? '1' : '0'), 10);
if (Number.isInteger(trustedProxyHops) && trustedProxyHops > 0 && trustedProxyHops <= 3) app.set('trust proxy', trustedProxyHops);
const visitorAnalytics = new VisitorAnalytics();
const parsedPort = Number.parseInt(process.env.PORT || '3000', 10);
const PORT = Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort <= 65535 ? parsedPort : 3000;
const TMDB_TOKEN = process.env.TMDB_TOKEN;
const SUPPORTED_REGIONS = new Set(['NP', 'US', 'GB', 'IN', 'AU', 'CA']);
const configuredRegion = String(process.env.TMDB_REGION || 'NP').toUpperCase();
const DEFAULT_TMDB_REGION = SUPPORTED_REGIONS.has(configuredRegion) ? configuredRegion : 'NP';

// Anonymous analytics stores random browser IDs and derived device/location fields only.
// Raw IP addresses are used transiently for approximate IP geolocation and are not stored;
// full user-agent strings are parsed server-side and are never persisted.
const liveVisitors = new Map();
const recentVisitorActivity = [];
const VISITOR_ACTIVE_MS = 75_000;
const VISITOR_RETENTION_MS = 30 * 60_000;
const MAX_VISITOR_SESSIONS = 5_000;
const MAX_VISITOR_EVENTS = 200;

function secretMatches(candidate, expected) {
  const a = createHash('sha256').update(String(candidate)).digest();
  const b = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  const expectedPassword = String(process.env.ADMIN_PASSWORD || '');
  if (expectedPassword.length < 12) {
    return res.status(503).type('text/plain').send('Visitor dashboard is not configured yet. Set ADMIN_PASSWORD to a strong password of at least 12 characters in the Render environment, then redeploy. Optionally set ADMIN_USERNAME (default: admin).');
  }
  const match = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(String(req.headers.authorization || ''));
  if (!match) {
    res.setHeader('WWW-Authenticate', 'Basic realm="STREAM SUNAA Admin", charset="UTF-8"');
    return res.status(401).type('text/plain').send('Admin authentication required.');
  }
  let decoded = '';
  try { decoded = Buffer.from(match[1], 'base64').toString('utf8'); } catch {}
  const separator = decoded.indexOf(':');
  const username = separator >= 0 ? decoded.slice(0, separator) : '';
  const password = separator >= 0 ? decoded.slice(separator + 1) : '';
  const expectedUsername = String(process.env.ADMIN_USERNAME || 'admin');
  if (!secretMatches(username, expectedUsername) || !secretMatches(password, expectedPassword)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="STREAM SUNAA Admin", charset="UTF-8"');
    return res.status(401).type('text/plain').send('Incorrect admin credentials.');
  }
  next();
}

function cleanVisitorTitle(value) {
  return String(value || 'Browsing STREAM SUNAA').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Browsing STREAM SUNAA';
}

function cleanVisitorPath(value) {
  const candidate = String(value || '/').slice(0, 300);
  try {
    const url = new URL(candidate, 'https://sunaa.invalid');
    return url.origin === 'https://sunaa.invalid' ? url.pathname.slice(0, 160) : '/';
  } catch { return '/'; }
}

function pruneVisitorState(now = Date.now()) {
  for (const [id, visitor] of liveVisitors) {
    if (now - visitor.lastSeen > VISITOR_RETENTION_MS) liveVisitors.delete(id);
  }
  while (liveVisitors.size > MAX_VISITOR_SESSIONS) {
    const oldest = liveVisitors.keys().next().value;
    if (!oldest) break;
    liveVisitors.delete(oldest);
  }
}
function requestRegion(req) {
  const candidate = String(req.query.region || DEFAULT_TMDB_REGION).toUpperCase();
  return SUPPORTED_REGIONS.has(candidate) ? candidate : DEFAULT_TMDB_REGION;
}
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE = 'https://image.tmdb.org/t/p';
const INDEX_HTML = readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const FALLBACK_SOCIAL_IMAGE = '/assets/luma-social.png';
const downloadCatalog = createDownloadCatalog({
  catalogPath: process.env.DOWNLOAD_CATALOG ? path.resolve(process.env.DOWNLOAD_CATALOG) : path.join(__dirname, 'data', 'download-catalog.json'),
  downloadRoot: process.env.MEDIA_DOWNLOADS_DIR ? path.resolve(process.env.MEDIA_DOWNLOADS_DIR) : path.join(__dirname, 'media', 'downloads'),
});
const providerDownloadAdapter = createProviderDownloadAdapter();
const embedProviderRegistry = createEmbedProviderRegistry({
  configPath: process.env.LUMA_EMBED_PROVIDERS_CONFIG
    ? path.resolve(process.env.LUMA_EMBED_PROVIDERS_CONFIG)
    : path.join(__dirname, 'data', 'embed-providers.json'),
});

app.disable('x-powered-by');
app.set('query parser', 'simple');
app.use(securityHeaders);
app.use((req, res, next) => {
  const requestId = randomUUID();
  const startedAt = Date.now();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  res.on('finish', () => {
    // Never log query values; search terms and user-entered text belong in neither logs nor URLs.
    if (req.path.startsWith('/api/') || res.statusCode >= 400) {
      console.info(JSON.stringify({
        level: res.statusCode >= 500 ? 'warn' : 'info',
        event: 'http_request',
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.max(0, Date.now() - startedAt),
      }));
    }
  });
  next();
});
app.use(compressionMiddleware({ threshold: 1024, maxBufferBytes: 1024 * 1024 }));
app.use(express.json({ limit: '64kb', strict: true }));
app.get('/index.html', (req, res) => res.redirect(301, '/'));
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  index: false,
  maxAge: '1h',
  setHeaders(res, filePath) {
    // Always revalidate frontend assets so deploys do not leave clients on stale UI code.
    const ext = path.extname(filePath).toLowerCase();
    if (['.html', '.css', '.js'].includes(ext)) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  },
}));

const CACHE_MS = 1000 * 60 * 5;
const cacheMaxEntries = Number.parseInt(process.env.TMDB_CACHE_MAX || '500', 10);
const cache = new BoundedTTLCache({
  maxEntries: Number.isSafeInteger(cacheMaxEntries) && cacheMaxEntries > 0 ? Math.min(cacheMaxEntries, 5000) : 500,
  ttlMs: CACHE_MS,
});
const apiRateLimiter = new FixedWindowRateLimiter({ windowMs: 60_000, max: 120, maxClients: 10_000 });
const searchRateLimiter = new FixedWindowRateLimiter({ windowMs: 60_000, max: 30, maxClients: 10_000 });
app.use('/api', rateLimitMiddleware(apiRateLimiter));
app.use('/api/search', rateLimitMiddleware(searchRateLimiter, { message: 'Too many searches. Please wait a moment and try again.' }));

app.post('/api/analytics/heartbeat', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const id = String(req.body?.id || '');
  if (!/^[a-f0-9-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid anonymous visitor session.' });
  const now = Date.now();
  pruneVisitorState(now);
  const pathName = cleanVisitorPath(req.body?.path);
  const title = cleanVisitorTitle(req.body?.title);
  const previous = liveVisitors.get(id);
  const parsedDevice = parseDeviceInfo(req.get('user-agent') || '', req.body?.deviceModel, req.body?.platform, req.body?.device);
  let location = previous?.location || null;
  if (process.env.VISITOR_GEOLOCATION !== 'false' && (!location || (!location.country && !location.city))) {
    location = await lookupIpLocation(req.ip).catch(() => null) || { city: '', region: '', country: '', countryCode: '', source: '' };
  }
  const visitor = {
    id,
    label: `Visitor ${id.replace(/-/g, '').slice(-6).toUpperCase()}`,
    firstSeen: previous?.firstSeen || now,
    lastSeen: now,
    path: pathName,
    title,
    ...parsedDevice,
    location,
  };
  let persistentResult = null;
  if (visitorAnalytics.enabled) {
    try {
      persistentResult = await visitorAnalytics.recordHeartbeat(visitor);
    } catch {
      // Analytics outages must not break the public streaming catalogue. The dashboard
      // will visibly report that persistent storage is temporarily unavailable.
    }
  }
  const pageChangedInMemory = !previous || previous.path !== pathName || previous.title !== title || now - previous.lastSeen > VISITOR_ACTIVE_MS;
  const pageChanged = persistentResult ? persistentResult.pageChanged : pageChangedInMemory;
  liveVisitors.delete(id);
  liveVisitors.set(id, visitor);
  if (pageChanged) {
    const action = persistentResult?.action || (previous ? 'Now viewing' : 'Arrived');
    recentVisitorActivity.unshift({
      id: visitor.id, label: visitor.label, time: now, path: pathName, title, device: visitor.device,
      deviceModel: visitor.deviceModel, browser: visitor.browser, os: visitor.os,
      city: location.city, region: location.region, country: location.country, countryCode: location.countryCode,
      location: makeLocationLabel(location), locationSource: location.source, action,
    });
    if (recentVisitorActivity.length > MAX_VISITOR_EVENTS) recentVisitorActivity.length = MAX_VISITOR_EVENTS;
  }
  res.status(204).end();
});

app.get('/admin/visitors', requireAdmin, (req, res) => {
  res.type('html').sendFile(path.join(__dirname, 'public', 'admin-visitors.html'));
});

app.get('/admin/visitors/data', requireAdmin, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const now = Date.now();
  pruneVisitorState(now);
  const active = [...liveVisitors.values()]
    .filter(visitor => now - visitor.lastSeen <= VISITOR_ACTIVE_MS)
    .sort((a, b) => b.lastSeen - a.lastSeen);
  const pages = new Map();
  for (const visitor of active) {
    const key = `${visitor.path}|${visitor.title}`;
    const row = pages.get(key) || { path: visitor.path, title: visitor.title, count: 0 };
    row.count += 1;
    pages.set(key, row);
  }
  const fallback = {
    generatedAt: now,
    activeCount: active.length,
    active: active.map(v => ({
      id: v.id.slice(-8), label: v.label, firstSeen: v.firstSeen, lastSeen: v.lastSeen,
      path: v.path, title: v.title, device: v.device, deviceModel: v.deviceModel, browser: v.browser, os: v.os,
      city: v.location?.city || '', region: v.location?.region || '', country: v.location?.country || '', countryCode: v.location?.countryCode || '',
      location: makeLocationLabel(v.location || {}), locationSource: v.location?.source || '',
      pageViews: 0, visitCount: 1, watching: v.path.startsWith('/watch/'),
    })),
    activity: recentVisitorActivity.slice(0, 120),
    popularPages: [...pages.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    devices: { mobile: active.filter(v => v.device === 'mobile').length, tablet: active.filter(v => v.device === 'tablet').length, desktop: active.filter(v => v.device === 'desktop').length },
    totalVisitors: liveVisitors.size,
    totalPageViews: recentVisitorActivity.length,
    returningVisitors: 0,
    countries: [],
    storage: visitorAnalytics.enabled ? 'unavailable' : 'memory',
    storageWarning: visitorAnalytics.enabled ? 'PostgreSQL is configured but not reachable. Live data is temporary until the database reconnects.' : 'Persistent history is not enabled. Set DATABASE_URL in Render to retain visitor history after restarts.',
    retention: 'Live sessions expire after 75 seconds. This server currently has only temporary history.',
  };
  try {
    const snapshot = await visitorAnalytics.dashboardSnapshot(now, fallback);
    res.json(snapshot);
  } catch {
    res.json(fallback);
  }
});

app.get('/admin/visitors/history', requireAdmin, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const query = String(req.query.q || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  const offset = Math.max(0, Math.min(1_000_000, Number.parseInt(String(req.query.offset || '0'), 10) || 0));
  const limit = Math.max(1, Math.min(100, Number.parseInt(String(req.query.limit || '50'), 10) || 50));
  const memoryVisitors = [...liveVisitors.values()].map(v => ({
    id: v.id.slice(-8), label: v.label, firstSeen: v.firstSeen, lastSeen: v.lastSeen, path: v.path, title: v.title,
    device: v.device, deviceModel: v.deviceModel, browser: v.browser, os: v.os,
    city: v.location?.city || '', region: v.location?.region || '', country: v.location?.country || '', countryCode: v.location?.countryCode || '',
    location: makeLocationLabel(v.location || {}), locationSource: v.location?.source || '', pageViews: 0, visitCount: 1,
    watching: v.path.startsWith('/watch/'),
  }));
  try {
    const result = await visitorAnalytics.visitorHistory({ offset, limit, query }, memoryVisitors);
    res.json(result);
  } catch {
    res.status(503).json({ error: 'Visitor history database is unavailable. Please check DATABASE_URL and the Render database status.' });
  }
});

function requireToken() {
  if (!TMDB_TOKEN) {
    const error = new Error('Catalogue service is not configured.');
    error.code = 'TMDB_NOT_CONFIGURED';
    throw error;
  }
}


function imageUrl(file, size = 'w500') {
  return file ? `${TMDB_IMAGE}/${size}${file}` : null;
}

async function tmdb(pathname, params = {}) {
  requireToken();
  const url = new URL(`${TMDB_BASE}${pathname}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  const key = url.toString();
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const res = await fetch(key, {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      accept: 'application/json'
    },
    signal: AbortSignal.timeout(12_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = data?.status_message || `TMDB request failed (${res.status})`;
    const err = new Error(error);
    err.status = res.status;
    throw err;
  }
  cache.set(key, data);
  return data;
}

function normalizeItem(item, mediaType) {
  if (!item || !Number.isSafeInteger(Number(item.id)) || Number(item.id) <= 0) return null;
  const type = mediaType || item.media_type || (item.first_air_date !== undefined ? 'tv' : 'movie');
  const imagePath = type === 'person' ? item.profile_path : item.poster_path;
  return {
    ...item,
    media_type: type,
    title: String(item.title || item.name || '').trim(),
    release_date: item.release_date || item.first_air_date || null,
    poster: imageUrl(imagePath, type === 'person' ? 'w185' : 'w500'),
    posterLarge: imageUrl(imagePath, type === 'person' ? 'w500' : 'w780'),
    profile: type === 'person' ? imageUrl(item.profile_path, 'w185') : undefined,
    profileLarge: type === 'person' ? imageUrl(item.profile_path, 'w500') : undefined,
    backdrop: imageUrl(item.backdrop_path, 'w1280'),
    backdropLarge: imageUrl(item.backdrop_path, 'w1280')
  };
}

function normalizeList(data, mediaType) {
  const results = (Array.isArray(data.results) ? data.results : [])
    .filter((item) => item && item.adult !== true && Number.isSafeInteger(Number(item.id)) && Number(item.id) > 0
      && String(item.title || item.name || '').trim())
    .map((item) => normalizeItem(item, mediaType))
    .filter((item) => item && item.title && (mediaType || ['movie', 'tv', 'person'].includes(item.media_type)));
  return {
    page: Math.max(1, Number(data.page) || 1),
    total_pages: Math.max(1, Number(data.total_pages) || 1),
    total_results: Math.max(results.length, Number(data.total_results) || 0),
    results
  };
}

function boundedInt(value, fallback, min, max) {
  const raw = String(value ?? '').trim();
  if (!/^-?\d+$/.test(raw)) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
function validYear(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = String(value).trim();
  if (!/^\d{4}$/.test(raw)) return undefined;
  const parsed = Number(raw);
  return parsed >= 1900 && parsed <= new Date().getFullYear() + 3 ? parsed : undefined;
}

app.get('/api/embed-providers', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ providers: embedProviderRegistry.getProviders() });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, tmdbConfigured: Boolean(TMDB_TOKEN), region: requestRegion(req) });
});

app.get('/api/home', async (req, res) => {
  try {
    const region = requestRegion(req);
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 365);
    const releaseStart = start.toISOString().slice(0, 10);
    const releaseEnd = today.toISOString().slice(0, 10);
    const releasePages = [1, 2, 3, 4, 5].map(page => tmdb('/discover/movie', {
      language: 'en-US', page, region, sort_by: 'primary_release_date.desc,popularity.desc',
      'primary_release_date.gte': releaseStart, 'primary_release_date.lte': releaseEnd,
      'vote_count.gte': 15, include_adult: false
    }));
    const [trending, movies, tv, topMovies, topTv, providers, ...releaseData] = await Promise.all([
      tmdb('/trending/all/week', { language: 'en-US' }),
      tmdb('/movie/popular', { language: 'en-US', page: 1, region }),
      tmdb('/tv/popular', { language: 'en-US', page: 1 }),
      tmdb('/movie/top_rated', { language: 'en-US', page: 1, region }),
      tmdb('/tv/top_rated', { language: 'en-US', page: 1 }),
      tmdb('/watch/providers/movie', { language: 'en-US', watch_region: region }),
      ...releasePages
    ]);
    const releaseMap = new Map();
    releaseData.flatMap(x => x.results || []).forEach(item => { if (item?.id && !releaseMap.has(item.id)) releaseMap.set(item.id, item); });
    const newReleases = [...releaseMap.values()].map(item => normalizeItem(item, 'movie'));
    res.json({
      trending: normalizeList(trending),
      movies: normalizeList(movies, 'movie'),
      tv: normalizeList(tv, 'tv'),
      topMovies: normalizeList(topMovies, 'movie'),
      topTv: normalizeList(topTv, 'tv'),
      newReleases: { page: 1, total_pages: 5, total_results: newReleases.length, results: newReleases },
      providers: (providers.results || []).slice(0, 18).map((item) => ({
        provider_id: item.provider_id,
        provider_name: item.provider_name,
        logo: imageUrl(item.logo_path, 'w92')
      }))
    });
  } catch (error) {
    respondToApiError(res, error, { tmdbConfigured: Boolean(TMDB_TOKEN) });
  }
});

app.get('/api/discover/:media', async (req, res) => {
  try {
    const region = requestRegion(req);
    if (!['movie', 'tv'].includes(req.params.media)) return res.status(400).json({ error: 'Unsupported catalogue type.' });
    const media = req.params.media;
    const page = boundedInt(req.query.page, 1, 1, 500);
    const dateSort = media === 'tv' ? 'first_air_date' : 'primary_release_date';
    const sortCandidates = new Set(['popularity.desc', 'popularity.asc', 'vote_average.desc', 'vote_average.asc', `${dateSort}.desc`, `${dateSort}.asc`]);
    const requestedSort = String(req.query.sort_by || 'popularity.desc');
    const sortBy = sortCandidates.has(requestedSort) ? requestedSort : 'popularity.desc';
    const genre = String(req.query.with_genres || '').split(',').map(x => Number(x)).filter(x => Number.isInteger(x) && x > 0).join(',');
    const provider = boundedInt(req.query.provider, 0, 0, 100000);
    const requestedRating = Number(req.query.min_rating);
    const minRating = req.query.min_rating !== undefined && Number.isFinite(requestedRating) ? Math.min(10, Math.max(0, requestedRating)) : undefined;
    const minVotes = req.query.min_votes !== undefined && req.query.min_votes !== '' ? boundedInt(req.query.min_votes, 0, 0, 1000000) : (sortBy.startsWith('vote_average') ? 50 : undefined);
    const selectedYear = validYear(req.query.year);
    const data = await tmdb(`/discover/${media}`, {
      language: 'en-US',
      page,
      sort_by: sortBy,
      with_genres: genre || undefined,
      'vote_average.gte': minRating,
      'vote_count.gte': minVotes,
      primary_release_year: media === 'movie' ? selectedYear : undefined,
      first_air_date_year: media === 'tv' ? selectedYear : undefined,
      watch_region: region,
      with_watch_providers: provider || undefined,
      include_adult: false
    });
    res.json(normalizeList(data, media));
  } catch (error) {
    respondToApiError(res, error, { tmdbConfigured: Boolean(TMDB_TOKEN) });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const query = String(req.query.query || '').trim().slice(0, 100);
    if (!query) return res.json({ page: 1, total_pages: 1, total_results: 0, results: [] });
    const page = boundedInt(req.query.page, 1, 1, 500);
    const data = await tmdb('/search/multi', {
      query,
      language: 'en-US',
      page,
      include_adult: false
    });
    // Multi-search is allowed to include people, but malformed and adult entries are discarded.
    const cleaned = {
      ...data,
      results: (Array.isArray(data.results) ? data.results : []).filter(item =>
        item && item.adult !== true && ['movie', 'tv', 'person'].includes(item.media_type)
        && Number.isSafeInteger(Number(item.id)) && Number(item.id) > 0
        && String(item.title || item.name || '').trim())
    };
    res.json(normalizeList(cleaned));
  } catch (error) {
    respondToApiError(res, error, { tmdbConfigured: Boolean(TMDB_TOKEN) });
  }
});

app.get('/api/person/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid person id.' });
    const [person, credits] = await Promise.all([
      tmdb(`/person/${id}`, { language: 'en-US', append_to_response: 'images' }),
      tmdb(`/person/${id}/combined_credits`, { language: 'en-US' })
    ]);
    const allCredits = [...(credits.cast || []), ...(credits.crew || [])]
      .filter(item => item && ['movie', 'tv'].includes(item.media_type))
      .sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0));
    const dedupedCredits = [...new Map(allCredits.map(item => [`${item.media_type}:${item.id}`, item])).values()];
    res.json({
      person: { ...person, id: person.id, name: person.name, media_type: 'person', profile: imageUrl(person.profile_path, 'w342'), profileLarge: imageUrl(person.profile_path, 'w500') },
      credits: normalizeList({ page: 1, total_pages: 1, total_results: dedupedCredits.length, results: dedupedCredits })
    });
  } catch (error) {
    respondToApiError(res, error, { tmdbConfigured: Boolean(TMDB_TOKEN) });
  }
});

app.get('/api/genres/:media', async (req, res) => {
  try {
    if (!['movie', 'tv'].includes(req.params.media)) return res.status(400).json({ error: 'Unsupported catalogue type.' });
    const media = req.params.media;
    const data = await tmdb(`/genre/${media}/list`, { language: 'en-US' });
    res.json(data);
  } catch (error) {
    respondToApiError(res, error, { tmdbConfigured: Boolean(TMDB_TOKEN) });
  }
});

app.get('/api/:media/:id', async (req, res) => {
  try {
    const region = requestRegion(req);
    const media = req.params.media;
    if (!['movie', 'tv'].includes(media)) return res.status(400).json({ error: 'Unsupported catalogue type.' });
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid TMDB id.' });
    const [details, credits, recommendations, providers] = await Promise.all([
      tmdb(`/${media}/${id}`, { language: 'en-US', append_to_response: 'videos,images,external_ids' }),
      tmdb(`/${media}/${id}/credits`, { language: 'en-US' }),
      tmdb(`/${media}/${id}/recommendations`, { language: 'en-US', page: 1 }),
      tmdb(`/${media}/${id}/watch/providers`, { watch_region: region })
    ]);
    res.json({
      details: normalizeItem(details, media),
      credits,
      recommendations: normalizeList(recommendations, media),
      providers
    });
  } catch (error) {
    respondToApiError(res, error, { tmdbConfigured: Boolean(TMDB_TOKEN) });
  }
});

app.get('/api/tv/:id/season/:season', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const season = Number(req.params.season);
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(season) || season < 0) {
      return res.status(400).json({ error: 'Invalid TV id or season number.' });
    }
    const data = await tmdb(`/tv/${id}/season/${season}`, { language: 'en-US' });
    res.json({
      ...data,
      poster: imageUrl(data.poster_path, 'w500'),
      episodes: (data.episodes || []).map((ep) => ({
        ...ep,
        still: imageUrl(ep.still_path, 'w500')
      }))
    });
  } catch (error) {
    respondToApiError(res, error, { tmdbConfigured: Boolean(TMDB_TOKEN) });
  }
});

app.get('/api/providers', async (req, res) => {
  try {
    const region = requestRegion(req);
    const [movies, tv] = await Promise.all([
      tmdb('/watch/providers/movie', { language: 'en-US', watch_region: region }),
      tmdb('/watch/providers/tv', { language: 'en-US', watch_region: region })
    ]);
    const providers = new Map();
    [...(movies.results || []), ...(tv.results || [])].forEach((item) => {
      if (!item?.provider_id || providers.has(item.provider_id)) return;
      providers.set(item.provider_id, {
        provider_id: item.provider_id,
        provider_name: item.provider_name,
        logo: imageUrl(item.logo_path, 'w500'),
        display_priority: Number(item.display_priority ?? 999)
      });
    });
    res.json([...providers.values()].sort((a, b) => a.display_priority - b.display_priority));
  } catch (error) {
    respondToApiError(res, error, { tmdbConfigured: Boolean(TMDB_TOKEN) });
  }
});

function positiveRouteNumber(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function downloadRequestParts(req, res) {
  const media = req.params.media;
  const id = positiveRouteNumber(req.params.id);
  if (!['movie', 'tv'].includes(media) || !id) {
    res.status(400).json({ error: 'Invalid media type or catalogue id.' });
    return null;
  }
  if (media === 'movie') return { media, id, season: null, episode: null };
  const season = positiveRouteNumber(req.query.season);
  const episode = positiveRouteNumber(req.query.episode);
  if (!season || !episode) {
    res.status(400).json({ error: 'A valid season and episode are required for series downloads.' });
    return null;
  }
  return { media, id, season, episode };
}

app.get('/api/downloads/:media/:id', async (req, res) => {
  const parts = downloadRequestParts(req, res);
  if (!parts) return;

  const localListing = downloadCatalog.list(parts.media, parts.id, parts.season, parts.episode);
  const localQualities = localListing.qualities.map((quality) => ({
    ...quality,
    provider: false,
    sourceName: 'STREAM SUNAA library',
  }));

  const providerListing = await providerDownloadAdapter.list({
    ...parts,
    provider: typeof req.query.provider === 'string' ? req.query.provider : undefined,
  });
  const providerQualities = providerListing.qualities.map((quality) => ({
    ...quality,
    provider: true,
  }));

  const ranked = [...localQualities, ...providerQualities].sort((a, b) =>
    b.height - a.height || b.bitrate - a.bitrate || b.sizeBytes - a.sizeBytes || Number(a.provider) - Number(b.provider)
  );
  const qualities = ranked.map((quality) => {
    const query = new URLSearchParams();
    if (parts.media === 'tv') {
      query.set('season', String(parts.season));
      query.set('episode', String(parts.episode));
    }
    if (quality.provider) {
      query.set('sourceId', quality.sourceId);
      return {
        id: quality.id,
        label: quality.label,
        height: quality.height,
        bitrate: quality.bitrate,
        sizeBytes: quality.sizeBytes,
        filename: quality.filename,
        sourceName: quality.sourceName || 'Provider',
        provider: true,
        downloadUrl: `/api/downloads/${parts.media}/${parts.id}/provider-file?${query.toString()}`,
      };
    }
    query.set('quality', quality.id);
    return {
      id: quality.id,
      label: quality.label,
      height: quality.height,
      bitrate: quality.bitrate,
      sizeBytes: quality.sizeBytes,
      filename: quality.filename,
      sourceName: quality.sourceName,
      provider: false,
      downloadUrl: `/api/downloads/${parts.media}/${parts.id}/file?${query.toString()}`,
    };
  });

  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    available: qualities.length > 0,
    title: providerListing.title || localListing.title,
    mediaType: parts.media,
    id: parts.id,
    season: parts.season,
    episode: parts.episode,
    providerConfigured: providerListing.configured,
    providerMessage: providerListing.message || null,
    qualities,
    selection: qualities[0]?.id || null,
  });
});

app.get('/api/downloads/:media/:id/file', async (req, res) => {
  const parts = downloadRequestParts(req, res);
  if (!parts) return;
  const qualityId = typeof req.query.quality === 'string' ? req.query.quality : '';
  const file = downloadCatalog.resolve(parts.media, parts.id, parts.season, parts.episode, qualityId);
  if (!file) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ error: 'That download quality is no longer available.' });
  }
  return streamDownloadFile(req, res, file);
});

app.get('/api/downloads/:media/:id/provider-file', async (req, res) => {
  const parts = downloadRequestParts(req, res);
  if (!parts) return;
  const source = providerDownloadAdapter.getSource(String(req.query.sourceId || ''), parts);
  if (!source) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ error: 'This provider download link expired or does not match the selected media. Open the Download dialog again.' });
  }

  let upstream;
  try {
    upstream = await providerDownloadAdapter.fetchFile(source, req.headers.range);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'The provider download source could not be reached as a direct video file.' });
  }

  if (![200, 206, 416].includes(upstream.status)) {
    await upstream.body?.cancel().catch(() => {});
    res.setHeader('Cache-Control', 'no-store');
    return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'The provider download source is no longer available.' });
  }

  res.status(upstream.status);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.attachment(safeFilename(source.filename, 'luma-download.mp4'));
  const contentType = String(upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  res.setHeader('Content-Type', ['video/mp4', 'video/webm', 'video/x-matroska', 'application/octet-stream'].includes(contentType) ? contentType : source.mimeType);
  for (const header of ['content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers.get(header);
    if (value && /^[\x20-\x7e]+$/.test(value)) res.setHeader(header, value);
  }
  if (!upstream.body) return res.end();
  try {
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    if (!res.headersSent) res.status(502).json({ error: 'The provider download stream was interrupted.' });
    else if (!res.writableEnded) res.destroy(error);
  }
});

app.get('/api/config', (req, res) => {
  res.json({
    region: requestRegion(req),
    imageBase: TMDB_IMAGE
  });
});

function htmlEscape(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function seoText(value, maxLength = 155) {
  const text = String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength - 1);
  const boundary = clipped.lastIndexOf(' ');
  return `${(boundary > maxLength * 0.6 ? clipped.slice(0, boundary) : clipped).trim()}…`;
}
function seoTitle(name, suffix = '') {
  const brand = ' | STREAM SUNAA';
  const tail = `${suffix}${brand}`;
  return `${seoText(name, Math.max(12, 63 - tail.length))}${tail}`;
}
function makeSeoFallback(title, description, details = {}) {
  const image = details.image ? `<img class="seo-fallback-image" src="${htmlEscape(details.image)}" alt="${htmlEscape(details.imageAlt || `${title} artwork`)}" width="185" height="278" loading="eager" />` : '';
  const meta = details.meta ? `<p class="seo-fallback-meta">${htmlEscape(details.meta)}</p>` : '';
  const link = details.href ? `<p><a class="seo-fallback-link" href="${htmlEscape(details.href)}">${htmlEscape(details.linkLabel || 'Explore on STREAM SUNAA')}</a></p>` : '';
  return `<main class="seo-fallback"><article>${image}<div class="seo-fallback-copy"><p class="seo-fallback-eyebrow">STREAM SUNAA · Catalogue</p><h1>${htmlEscape(title)}</h1>${meta}<p>${htmlEscape(seoText(description, 900))}</p>${link}<p class="seo-fallback-footnote">STREAM SUNAA provides catalogue information and viewing discovery. Playback and download availability depend on the source.</p></div></article></main>`;
}
function structuredDataForPage(metadata, canonical, image, title, description, origin) {
  if (metadata.structuredData && typeof metadata.structuredData === 'object') return metadata.structuredData;
  if (canonical === new URL('/', origin).href) {
    return { '@context': 'https://schema.org', '@type': 'WebSite', name: 'STREAM SUNAA', url: new URL('/', origin).href, description };
  }
  return { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description, url: canonical, isPartOf: { '@type': 'WebSite', name: 'STREAM SUNAA', url: new URL('/', origin).href }, primaryImageOfPage: image };
}
function serializeStructuredData(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}
function publicOrigin(req) {
  const configured = String(process.env.PUBLIC_SITE_URL || '').trim();
  if (configured && !/your-domain\.example/i.test(configured)) {
    try {
      const url = new URL(configured);
      if (['http:', 'https:'].includes(url.protocol)) return url.origin;
    } catch { /* Use validated request origin below. */ }
  }
  const host = String(req.get('host') || '').trim();
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) return `http://localhost:${PORT}`;
  return `${req.protocol === 'https' ? 'https' : 'http'}://${host}`;
}
function replaceMetaContent(html, id, content) {
  const tagPattern = new RegExp(`<meta\\b(?=[^>]*\\bid="${id}")[^>]*>`, 'i');
  const tag = html.match(tagPattern)?.[0];
  if (!tag) return html;
  const escaped = htmlEscape(content);
  const updated = /\bcontent="[^"]*"/i.test(tag)
    ? tag.replace(/\bcontent="[^"]*"/i, `content="${escaped}"`)
    : tag.replace(/\s*\/?>(\s*)$/i, ` content="${escaped}">$1`);
  return html.replace(tagPattern, updated);
}
function injectPageMetadata(req, metadata) {
  const origin = publicOrigin(req);
  const canonicalPath = metadata.canonicalPath || req.path || '/';
  const canonical = new URL(canonicalPath, origin).href;
  const image = /^https?:\/\//i.test(metadata.image || '') ? metadata.image : new URL(metadata.image || FALLBACK_SOCIAL_IMAGE, origin).href;
  const title = seoText(metadata.title || 'STREAM SUNAA - Discover Movies & TV', 65);
  const description = seoText(metadata.description || 'Discover movies, television series and people with STREAM SUNAA’s cinematic catalogue.', 160);
  let html = INDEX_HTML.replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlEscape(title)}</title>`);
  for (const [id, value] of Object.entries({
    'meta-description': description,
    'meta-robots': `${metadata.robots || 'index,follow'}${String(metadata.robots || 'index,follow').includes('max-image-preview:large') ? '' : ',max-image-preview:large'}`,
    'meta-og-site-name': 'STREAM SUNAA',
    'meta-og-type': metadata.type || 'website',
    'meta-og-title': title,
    'meta-og-description': description,
    'meta-og-url': canonical,
    'meta-og-image': image,
    'meta-og-image-alt': metadata.imageAlt || title,
    'meta-twitter-card': 'summary_large_image',
    'meta-twitter-title': title,
    'meta-twitter-description': description,
    'meta-twitter-image': image,
  })) html = replaceMetaContent(html, id, value);
  html = html.replace(/<link\b(?=[^>]*\bid="canonical-link")[^>]*>/i, tag => tag.replace(/\bhref="[^"]*"/i, `href="${htmlEscape(canonical)}"`));
  const jsonLd = serializeStructuredData(structuredDataForPage(metadata, canonical, image, title, description, origin));
  html = html.replace(/<script\b(?=[^>]*\bid="seo-jsonld")[^>]*>[\s\S]*?<\/script>/i, `<script id="seo-jsonld" type="application/ld+json">${jsonLd}</script>`);
  html = html.replace('<!--LUMA-SEO-CONTENT-->', metadata.ssrHtml || '');
  if (metadata.preloadImage && /^https?:\/\//i.test(metadata.image || '')) {
    const preload = `<link rel=\"preload\" as=\"image\" fetchpriority=\"high\" data-luma-image-preload=\"true\" href=\"${htmlEscape(metadata.image)}\" />`;
    html = html.replace(/<\/head>/i, `${preload}</head>`);
  }
  return html;
}
function defaultPageMetadata(pathname) {
  const entries = {
    '/': ['STREAM SUNAA - Discover Movies & TV', 'Discover movies, television series and people with STREAM SUNAA’s cinematic catalogue.', '/', 'index,follow'],
    '/browse': ['Browse Movies & Series | STREAM SUNAA', 'Explore movies, TV series, top-rated titles and region-specific streaming provider discovery on STREAM SUNAA.', '/browse', 'index,follow'],
    '/movies': ['Movies | STREAM SUNAA', 'Browse movies by popularity, release year, rating, genre and provider on STREAM SUNAA.', '/movies', 'index,follow'],
    '/tv': ['TV Series | STREAM SUNAA', 'Discover TV series by popularity, first-air year, rating, genre and provider on STREAM SUNAA.', '/tv', 'index,follow'],
    '/search': ['Search Movies, Series & People | STREAM SUNAA', 'Search for movies, TV series, actors and film creators with STREAM SUNAA.', '/search', 'noindex,follow'],
    '/my-list': ['My List | STREAM SUNAA', 'Your locally saved movies and series in STREAM SUNAA.', '/my-list', 'noindex,nofollow'],
    '/history': ['History | STREAM SUNAA', 'Recently opened titles in your STREAM SUNAA browsing history.', '/history', 'noindex,nofollow'],
    '/settings': ['Settings | STREAM SUNAA', 'Customize your STREAM SUNAA viewing, appearance and region preferences.', '/settings', 'noindex,nofollow'],
    '/about': ['About | STREAM SUNAA', 'Learn about STREAM SUNAA, its discovery interface and TMDB-powered catalogue data.', '/about', 'index,follow'],
    '/features': ['Features | STREAM SUNAA', 'Explore STREAM SUNAA discovery, source selection, watch history, themes, subtitles and provider-dependent playback features.', '/features', 'index,follow'],
    '/gitstore': ['GitStore · Project Source | STREAM SUNAA', 'Browse the STREAM SUNAA codebase and open its GitHub repository.', '/gitstore', 'index,follow'],
  };
  const value = entries[pathname] || ['Page Not Found | STREAM SUNAA', 'The requested STREAM SUNAA page could not be found.', pathname || '/', 'noindex,follow'];
  const safeTitle = seoText(value[0], 65);
  const safeDescription = seoText(value[1], 160);
  return {
    title: safeTitle,
    description: safeDescription,
    canonicalPath: value[2],
    robots: value[3],
    image: FALLBACK_SOCIAL_IMAGE,
    ssrHtml: makeSeoFallback(safeTitle, safeDescription, { href: pathname === '/' ? '/browse' : '/', linkLabel: pathname === '/' ? 'Browse the catalogue' : 'Return to STREAM SUNAA' }),
  };
}

const SITEMAP_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let sitemapCache = { expiresAt: 0, origin: '', body: '' };
function xmlEscape(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}
function sitemapPathsFromResults(results, defaultMediaType = null) {
  const paths = [];
  const seen = new Set();
  for (const item of results) {
    if (!item || !Number.isSafeInteger(Number(item.id)) || Number(item.id) <= 0) continue;
    const mediaType = item.media_type || defaultMediaType;
    let itemPath = null;
    if (mediaType === 'movie') itemPath = `/details/movie/${Number(item.id)}`;
    else if (mediaType === 'tv') itemPath = `/details/tv/${Number(item.id)}`;
    else if (mediaType === 'person') itemPath = `/person/${Number(item.id)}`;
    if (itemPath && !seen.has(itemPath)) { seen.add(itemPath); paths.push(itemPath); }
  }
  return paths;
}
app.get('/robots.txt', (req, res) => {
  const sitemapUrl = new URL('/sitemap.xml', publicOrigin(req)).href;
  res.status(200).set('Content-Type', 'text/plain; charset=utf-8').set('Cache-Control', 'public, max-age=3600')
    .send(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${sitemapUrl}\n`);
});
app.get('/sitemap.xml', async (req, res) => {
  const origin = publicOrigin(req);
  let body = sitemapCache.origin === origin && sitemapCache.expiresAt > Date.now() ? sitemapCache.body : '';
  if (!body) {
    const paths = ['/', '/browse', '/movies', '/tv', '/about', '/features', '/gitstore'];
    if (TMDB_TOKEN) {
      try {
        // Several popular pages give the sitemap useful catalogue depth while
        // keeping it small, bounded, and cheap to refresh on a six-hour cache.
        const settled = await Promise.allSettled([
          tmdb('/trending/all/week', { language: 'en-US', page: 1 }),
          tmdb('/movie/popular', { language: 'en-US', page: 1 }),
          tmdb('/movie/popular', { language: 'en-US', page: 2 }),
          tmdb('/movie/popular', { language: 'en-US', page: 3 }),
          tmdb('/tv/popular', { language: 'en-US', page: 1 }),
          tmdb('/tv/popular', { language: 'en-US', page: 2 }),
          tmdb('/tv/popular', { language: 'en-US', page: 3 }),
        ]);
        const results = settled.map((entry) => entry.status === 'fulfilled' ? entry.value : null);
        if (results[0]) paths.push(...sitemapPathsFromResults(results[0].results || []));
        results.slice(1).forEach((result, index) => {
          if (!result) return;
          const mediaType = index < 3 ? 'movie' : 'tv';
          paths.push(...sitemapPathsFromResults(result.results || [], mediaType));
        });
      } catch { /* Keep the static sitemap available if TMDB is unavailable. */ }
    }
    const uniquePaths = [...new Set(paths)];
    const entries = uniquePaths.map(route => `<url><loc>${xmlEscape(new URL(route, origin).href)}</loc></url>`).join('');
    body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;
    sitemapCache = { body, origin, expiresAt: Date.now() + SITEMAP_CACHE_TTL_MS };
  }
  res.status(200).set('Content-Type', 'application/xml; charset=utf-8').set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400').send(body);
});

app.use(async (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not found.' });
  // A dotted path is usually a missing asset, not an SPA route. Avoid returning HTML for broken asset URLs.
  if (path.extname(req.path)) return res.status(404).type('text/plain').send('Not found');

  const routePath = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
  let metadata = defaultPageMetadata(routePath);
  const titleMatch = routePath.match(/^\/(?:details|watch)\/(movie|tv)\/(\d+)$/);
  const personMatch = routePath.match(/^\/person\/(\d+)$/);
  if (titleMatch) {
    const [, media, id] = titleMatch;
    metadata.canonicalPath = `/details/${media}/${id}`;
    metadata.title = `${media === 'tv' ? 'TV Series' : 'Movie'} Details | STREAM SUNAA`;
    metadata.description = `Explore ${media === 'tv' ? 'television series' : 'movie'} details, ratings and related titles on STREAM SUNAA.`;
    metadata.image = FALLBACK_SOCIAL_IMAGE;
    metadata.robots = routePath.startsWith('/watch/') ? 'noindex,follow' : 'index,follow';
    metadata.ssrHtml = makeSeoFallback(metadata.title, metadata.description, {
      href: `/watch/${media}/${id}`,
      linkLabel: 'Open viewing options',
    });
    try {
      const item = await tmdb(`/${media}/${id}`, { language: 'en-US' });
      const title = String(item.title || item.name || 'Untitled').trim();
      const isSeries = media === 'tv';
      const itemUrl = new URL(metadata.canonicalPath, publicOrigin(req)).href;
      const itemImage = item.poster_path ? imageUrl(item.poster_path, 'w780') : item.backdrop_path ? imageUrl(item.backdrop_path, 'w1280') : FALLBACK_SOCIAL_IMAGE;
      const description = seoText(item.overview || `Explore details, ratings and related ${isSeries ? 'series' : 'movies'} for ${title} on STREAM SUNAA.`, 160);
      metadata.title = seoTitle(title, isSeries ? ' (TV Series)' : ' (Movie)');
      metadata.description = description;
      metadata.image = item.backdrop_path ? imageUrl(item.backdrop_path, 'w1280') : itemImage;
      metadata.imageAlt = `${title} artwork`;
      metadata.type = isSeries ? 'video.tv_show' : 'video.movie';
      metadata.preloadImage = Boolean(item.backdrop_path);
      const releaseDate = item.release_date || item.first_air_date || '';
      const yearText = releaseDate ? releaseDate.slice(0, 4) : '';
      const genreNames = Array.isArray(item.genres) ? item.genres.map(genre => genre?.name).filter(Boolean).slice(0, 6) : [];
      const ratingValue = Number(item.vote_average);
      const ratingCount = Number(item.vote_count);
      metadata.ssrHtml = makeSeoFallback(title, item.overview || description, {
        image: itemImage,
        imageAlt: `${title} ${isSeries ? 'series' : 'movie'} poster`,
        meta: [yearText, genreNames.join(' · '), Number.isFinite(ratingValue) && ratingValue > 0 ? `TMDB rating ${ratingValue.toFixed(1)}/10` : ''].filter(Boolean).join(' · '),
        href: `/watch/${media}/${id}`,
        linkLabel: 'Open viewing options',
      });
      metadata.structuredData = {
        '@context': 'https://schema.org',
        '@type': isSeries ? 'TVSeries' : 'Movie',
        name: title,
        description,
        url: itemUrl,
        image: itemImage,
        ...(releaseDate ? { datePublished: releaseDate } : {}),
        ...(genreNames.length ? { genre: genreNames } : {}),
        ...(Number.isFinite(ratingValue) && ratingValue > 0 && ratingValue <= 10 && Number.isFinite(ratingCount) && ratingCount > 0
          ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: ratingValue.toFixed(1), bestRating: 10, worstRating: 0, ratingCount } } : {}),
      };
    } catch { /* Missing token or upstream failure falls back to useful generic page metadata. */ }
  } else if (personMatch) {
    const id = personMatch[1];
    metadata.canonicalPath = `/person/${id}`;
    metadata.title = 'Cast & Crew Profile | STREAM SUNAA';
    metadata.description = 'Explore filmographies and screen credits on STREAM SUNAA.';
    metadata.image = FALLBACK_SOCIAL_IMAGE;
    metadata.robots = 'index,follow';
    metadata.ssrHtml = makeSeoFallback(metadata.title, metadata.description, {
      href: '/browse',
      linkLabel: 'Explore movies and series',
    });
    try {
      const person = await tmdb(`/person/${id}`, { language: 'en-US' });
      const name = String(person.name || 'Cast and crew profile').trim();
      const portrait = person.profile_path ? imageUrl(person.profile_path, 'w500') : FALLBACK_SOCIAL_IMAGE;
      const biography = seoText(person.biography || `Explore films and television credits for ${name} on STREAM SUNAA.`, 160);
      metadata.title = seoTitle(name, ' (Filmography)');
      metadata.description = biography;
      metadata.image = portrait;
      metadata.imageAlt = `Portrait of ${name}`;
      metadata.ssrHtml = makeSeoFallback(name, person.biography || biography, { image: portrait, imageAlt: `Portrait of ${name}`, meta: 'Cast & crew profile', href: '/browse', linkLabel: 'Explore movies and series' });
      metadata.structuredData = { '@context': 'https://schema.org', '@type': 'Person', name, description: biography, url: new URL(metadata.canonicalPath, publicOrigin(req)).href, image: portrait };
    } catch { /* Fall back when TMDB is unavailable. */ }
  } else if (routePath.startsWith('/watch/')) {
    metadata.robots = 'noindex,follow';
  }
  const knownStaticRoutes = new Set(['/', '/browse', '/movies', '/tv', '/search', '/my-list', '/history', '/settings', '/about', '/features', '/gitstore']);
  const isKnownDetailRoute = /^\/(?:details|watch)\/(?:movie|tv)\/\d+$/.test(routePath);
  const isKnownPersonRoute = /^\/person\/\d+$/.test(routePath);
  const isKnownRoute = knownStaticRoutes.has(routePath) || isKnownDetailRoute || isKnownPersonRoute;
  if (!isKnownRoute) {
    res.status(404);
    metadata.robots = 'noindex,nofollow';
    metadata.ssrHtml = makeSeoFallback('Page not found', 'The requested STREAM SUNAA page does not exist.', { href: '/', linkLabel: 'Return home' });
  }
  res.type('html').send(injectPageMetadata(req, metadata));
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON request body.' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
  // Log the error class only; request details, search terms and upstream payloads may be sensitive.
  console.error(JSON.stringify({ level: 'error', event: 'request_error', requestId: req.requestId || null, errorType: String(err?.name || 'Error').slice(0, 80) }));
  return res.status(500).json({ error: 'Internal server error.' });
});

export { app, cache, requestRegion };

const isMainModule = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = app.listen(PORT, () => {
    console.log(`STREAM SUNAA running at http://localhost:${PORT}`);
    console.log(`TMDB token loaded: ${Boolean(TMDB_TOKEN)}`);
    console.log(`TMDB response cache: ${cache.maxEntries} entries / ${Math.round(CACHE_MS / 1000)}s TTL`);
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 1_000;
}
