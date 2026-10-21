import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const parsedPort = Number.parseInt(process.env.PORT || '3000', 10);
const PORT = Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort <= 65535 ? parsedPort : 3000;
const TMDB_TOKEN = process.env.TMDB_TOKEN;
const SUPPORTED_REGIONS = new Set(['NP', 'US', 'GB', 'IN', 'AU', 'CA']);
const configuredRegion = String(process.env.TMDB_REGION || 'NP').toUpperCase();
const DEFAULT_TMDB_REGION = SUPPORTED_REGIONS.has(configuredRegion) ? configuredRegion : 'NP';
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
    if (path.extname(filePath).toLowerCase() === '.html') res.setHeader('Cache-Control', 'no-cache');
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
    sourceName: 'LUMA library',
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
  const brand = ' | LUMA Stream';
  const tail = `${suffix}${brand}`;
  return `${seoText(name, Math.max(12, 63 - tail.length))}${tail}`;
}
function makeSeoFallback(title, description, details = {}) {
  const image = details.image ? `<img class="seo-fallback-image" src="${htmlEscape(details.image)}" alt="${htmlEscape(details.imageAlt || `${title} artwork`)}" width="185" height="278" loading="eager" />` : '';
  const meta = details.meta ? `<p class="seo-fallback-meta">${htmlEscape(details.meta)}</p>` : '';
  const link = details.href ? `<p><a class="seo-fallback-link" href="${htmlEscape(details.href)}">${htmlEscape(details.linkLabel || 'Explore on LUMA Stream')}</a></p>` : '';
  return `<main class="seo-fallback"><article>${image}<div class="seo-fallback-copy"><p class="seo-fallback-eyebrow">LUMA Stream · Catalogue</p><h1>${htmlEscape(title)}</h1>${meta}<p>${htmlEscape(seoText(description, 900))}</p>${link}<p class="seo-fallback-footnote">LUMA provides catalogue information and viewing discovery. Playback and download availability depend on the source.</p></div></article></main>`;
}
function structuredDataForPage(metadata, canonical, image, title, description, origin) {
  if (metadata.structuredData && typeof metadata.structuredData === 'object') return metadata.structuredData;
  if (canonical === new URL('/', origin).href) {
    return { '@context': 'https://schema.org', '@type': 'WebSite', name: 'LUMA Stream', url: new URL('/', origin).href, description };
  }
  return { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description, url: canonical, isPartOf: { '@type': 'WebSite', name: 'LUMA Stream', url: new URL('/', origin).href }, primaryImageOfPage: image };
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
  const title = seoText(metadata.title || 'LUMA Stream - Discover Movies & TV', 65);
  const description = seoText(metadata.description || 'Discover movies, television series and people with LUMA Stream’s cinematic catalogue.', 160);
  let html = INDEX_HTML.replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlEscape(title)}</title>`);
  for (const [id, value] of Object.entries({
    'meta-description': description,
    'meta-robots': `${metadata.robots || 'index,follow'}${String(metadata.robots || 'index,follow').includes('max-image-preview:large') ? '' : ',max-image-preview:large'}`,
    'meta-og-site-name': 'LUMA Stream',
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
    '/': ['LUMA Stream - Discover Movies & TV', 'Discover movies, television series and people with LUMA Stream’s cinematic catalogue.', '/', 'index,follow'],
    '/browse': ['Browse Movies & Series | LUMA Stream', 'Explore movies, TV series, top-rated titles and region-specific streaming provider discovery on LUMA Stream.', '/browse', 'index,follow'],
    '/movies': ['Movies | LUMA Stream', 'Browse movies by popularity, release year, rating, genre and provider on LUMA Stream.', '/movies', 'index,follow'],
    '/tv': ['TV Series | LUMA Stream', 'Discover TV series by popularity, first-air year, rating, genre and provider on LUMA Stream.', '/tv', 'index,follow'],
    '/search': ['Search Movies, Series & People | LUMA Stream', 'Search for movies, TV series, actors and film creators with LUMA Stream.', '/search', 'noindex,follow'],
    '/my-list': ['My List | LUMA Stream', 'Your locally saved movies and series in LUMA Stream.', '/my-list', 'noindex,nofollow'],
    '/history': ['History | LUMA Stream', 'Recently opened titles in your LUMA Stream browsing history.', '/history', 'noindex,nofollow'],
    '/settings': ['Settings | LUMA Stream', 'Customize your LUMA Stream viewing, appearance and region preferences.', '/settings', 'noindex,nofollow'],
    '/about': ['About | LUMA Stream', 'Learn about LUMA Stream, its discovery interface and TMDB-powered catalogue data.', '/about', 'index,follow'],
  };
  const value = entries[pathname] || ['Page Not Found | LUMA Stream', 'The requested LUMA Stream page could not be found.', pathname || '/', 'noindex,follow'];
  const safeTitle = seoText(value[0], 65);
  const safeDescription = seoText(value[1], 160);
  return {
    title: safeTitle,
    description: safeDescription,
    canonicalPath: value[2],
    robots: value[3],
    image: FALLBACK_SOCIAL_IMAGE,
    ssrHtml: makeSeoFallback(safeTitle, safeDescription, { href: pathname === '/' ? '/browse' : '/', linkLabel: pathname === '/' ? 'Browse the catalogue' : 'Return to LUMA Stream' }),
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
    const paths = ['/', '/browse', '/movies', '/tv', '/about'];
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
    metadata.title = `${media === 'tv' ? 'TV Series' : 'Movie'} Details | LUMA Stream`;
    metadata.description = `Explore ${media === 'tv' ? 'television series' : 'movie'} details, ratings and related titles on LUMA Stream.`;
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
      const description = seoText(item.overview || `Explore details, ratings and related ${isSeries ? 'series' : 'movies'} for ${title} on LUMA Stream.`, 160);
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
    metadata.title = 'Cast & Crew Profile | LUMA Stream';
    metadata.description = 'Explore filmographies and screen credits on LUMA Stream.';
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
      const biography = seoText(person.biography || `Explore films and television credits for ${name} on LUMA Stream.`, 160);
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
  const knownStaticRoutes = new Set(['/', '/browse', '/movies', '/tv', '/search', '/my-list', '/history', '/settings', '/about']);
  const isKnownDetailRoute = /^\/(?:details|watch)\/(?:movie|tv)\/\d+$/.test(routePath);
  const isKnownPersonRoute = /^\/person\/\d+$/.test(routePath);
  const isKnownRoute = knownStaticRoutes.has(routePath) || isKnownDetailRoute || isKnownPersonRoute;
  if (!isKnownRoute) {
    res.status(404);
    metadata.robots = 'noindex,nofollow';
    metadata.ssrHtml = makeSeoFallback('Page not found', 'The requested LUMA Stream page does not exist.', { href: '/', linkLabel: 'Return home' });
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
    console.log(`LUMA Stream running at http://localhost:${PORT}`);
    console.log(`TMDB token loaded: ${Boolean(TMDB_TOKEN)}`);
    console.log(`TMDB response cache: ${cache.maxEntries} entries / ${Math.round(CACHE_MS / 1000)}s TTL`);
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 1_000;
}
