import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const TMDB_TOKEN = process.env.TMDB_TOKEN;
const TMDB_REGION = process.env.TMDB_REGION || 'NP';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE = 'https://image.tmdb.org/t/p';

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const cache = new Map();
const CACHE_MS = 1000 * 60 * 5;

function requireToken() {
  if (!TMDB_TOKEN) throw new Error('TMDB_TOKEN is missing. Add it to .env.');
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
  if (hit && hit.expires > Date.now()) return hit.data;

  const res = await fetch(key, {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      accept: 'application/json'
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = data?.status_message || `TMDB request failed (${res.status})`;
    const err = new Error(error);
    err.status = res.status;
    throw err;
  }
  cache.set(key, { expires: Date.now() + CACHE_MS, data });
  return data;
}

function normalizeItem(item, mediaType) {
  if (!item) return null;
  const type = mediaType || item.media_type || (item.first_air_date !== undefined ? 'tv' : 'movie');
  return {
    ...item,
    media_type: type,
    title: item.title || item.name || 'Untitled',
    release_date: item.release_date || item.first_air_date || null,
    poster: imageUrl(item.poster_path, 'w500'),
    posterLarge: imageUrl(item.poster_path, 'w780'),
    backdrop: imageUrl(item.backdrop_path, 'w1280'),
    backdropLarge: imageUrl(item.backdrop_path, 'original')
  };
}

function normalizeList(data, mediaType) {
  return {
    page: data.page,
    total_pages: data.total_pages,
    total_results: data.total_results,
    results: (data.results || []).map((item) => normalizeItem(item, mediaType))
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, tmdbConfigured: Boolean(TMDB_TOKEN), region: TMDB_REGION });
});

app.get('/api/home', async (req, res) => {
  try {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 365);
    const releaseStart = start.toISOString().slice(0, 10);
    const releaseEnd = today.toISOString().slice(0, 10);
    const releasePages = [1, 2, 3, 4, 5].map(page => tmdb('/discover/movie', {
      language: 'en-US', page, region: TMDB_REGION, sort_by: 'primary_release_date.desc,popularity.desc',
      'primary_release_date.gte': releaseStart, 'primary_release_date.lte': releaseEnd,
      'vote_count.gte': 15, include_adult: false
    }));
    const [trending, movies, tv, topMovies, topTv, providers, ...releaseData] = await Promise.all([
      tmdb('/trending/all/week', { language: 'en-US' }),
      tmdb('/movie/popular', { language: 'en-US', page: 1, region: TMDB_REGION }),
      tmdb('/tv/popular', { language: 'en-US', page: 1 }),
      tmdb('/movie/top_rated', { language: 'en-US', page: 1, region: TMDB_REGION }),
      tmdb('/tv/top_rated', { language: 'en-US', page: 1 }),
      tmdb('/watch/providers/movie', { language: 'en-US', watch_region: TMDB_REGION }),
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
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/api/discover/:media', async (req, res) => {
  try {
    const media = req.params.media === 'tv' ? 'tv' : 'movie';
    const data = await tmdb(`/discover/${media}`, {
      language: 'en-US',
      page: req.query.page || 1,
      sort_by: req.query.sort_by || 'popularity.desc',
      with_genres: req.query.with_genres || undefined,
      'vote_average.gte': req.query.min_rating || undefined,
      primary_release_year: media === 'movie' ? req.query.year || undefined : undefined,
      first_air_date_year: media === 'tv' ? req.query.year || undefined : undefined,
      watch_region: TMDB_REGION,
      with_watch_providers: req.query.provider || undefined,
    });
    res.json(normalizeList(data, media));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const query = String(req.query.query || '').trim();
    if (!query) return res.json({ page: 1, results: [] });
    const data = await tmdb('/search/multi', {
      query,
      language: 'en-US',
      page: req.query.page || 1,
      include_adult: false
    });
    res.json(normalizeList(data));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/api/genres/:media', async (req, res) => {
  try {
    const media = req.params.media === 'tv' ? 'tv' : 'movie';
    const data = await tmdb(`/genre/${media}/list`, { language: 'en-US' });
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/api/:media/:id', async (req, res) => {
  try {
    const media = req.params.media === 'tv' ? 'tv' : 'movie';
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid TMDB id.' });
    const [details, credits, recommendations, providers] = await Promise.all([
      tmdb(`/${media}/${id}`, { language: 'en-US', append_to_response: 'videos,images' }),
      tmdb(`/${media}/${id}/credits`, { language: 'en-US' }),
      tmdb(`/${media}/${id}/recommendations`, { language: 'en-US', page: 1 }),
      tmdb(`/${media}/${id}/watch/providers`)
    ]);
    res.json({
      details: normalizeItem(details, media),
      credits,
      recommendations: normalizeList(recommendations, media),
      providers
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/api/tv/:id/season/:season', async (req, res) => {
  try {
    const data = await tmdb(`/tv/${Number(req.params.id)}/season/${Number(req.params.season)}`, { language: 'en-US' });
    res.json({
      ...data,
      poster: imageUrl(data.poster_path, 'w500'),
      episodes: (data.episodes || []).map((ep) => ({
        ...ep,
        still: imageUrl(ep.still_path, 'w500')
      }))
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/api/providers', async (req, res) => {
  try {
    const [movies, tv] = await Promise.all([
      tmdb('/watch/providers/movie', { language: 'en-US', watch_region: TMDB_REGION }),
      tmdb('/watch/providers/tv', { language: 'en-US', watch_region: TMDB_REGION })
    ]);
    const providers = new Map();
    [...(movies.results || []), ...(tv.results || [])].forEach((item) => {
      if (!item?.provider_id || providers.has(item.provider_id)) return;
      providers.set(item.provider_id, {
        provider_id: item.provider_id,
        provider_name: item.provider_name,
        logo: imageUrl(item.logo_path, 'w92'),
        display_priority: Number(item.display_priority ?? 999)
      });
    });
    res.json([...providers.values()].sort((a, b) => a.display_priority - b.display_priority));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/api/config', (req, res) => {
  res.json({
    region: TMDB_REGION,
    imageBase: TMDB_IMAGE
  });
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not found.' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`LUMA Stream running at http://localhost:${PORT}`);
  console.log(`TMDB token loaded: ${Boolean(TMDB_TOKEN)}`);
});
