import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

const ACTIVE_WINDOW_MS = 75_000;
const RETURN_WINDOW_MS = 30 * 60_000;
const GEO_CACHE_TTL_MS = 24 * 60 * 60_000;
const MAX_GEO_CACHE = 4_000;
const GEO_CACHE_SALT = randomUUID();
const geoCache = new Map();

function cleanText(value, max = 100, fallback = '') {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || fallback;
}

function looksPublicIp(value) {
  let ip = String(value || '').trim();
  if (ip.toLowerCase().startsWith('::ffff:')) ip = ip.slice(7);
  const version = isIP(ip);
  if (version === 4) {
    const p = ip.split('.').map(Number);
    if (p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    const [a, b] = p;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 192 && b === 0) return false;
    if (a === 192 && b === 0 && p[2] === 2) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && p[2] === 100))) return false;
    if (a === 203 && b === 0 && p[2] === 113) return false;
    return true;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb') || lower.startsWith('2001:db8:')) return false;
    return true;
  }
  return false;
}

function parseDeviceInfo(userAgent, suppliedModel, suppliedPlatform, suppliedCategory) {
  const ua = String(userAgent || '').slice(0, 1200);
  const modelFromClient = cleanText(suppliedModel, 80);
  let deviceModel = modelFromClient;
  let device = ['mobile', 'tablet', 'desktop'].includes(suppliedCategory) ? suppliedCategory : 'desktop';
  if (!deviceModel) {
    const android = /Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]+)?[);]/i.exec(ua);
    if (android?.[1]) {
      const candidate = cleanText(android[1].replace(/\s+wv$/i, ''), 80);
      if (candidate && !/^(?:arm|x86|unknown|generic|linux|u)$/i.test(candidate)) deviceModel = candidate;
    }
  }
  if (!deviceModel) {
    if (/iPad/i.test(ua)) deviceModel = 'Apple iPad (exact model hidden)';
    else if (/iPhone/i.test(ua)) deviceModel = 'Apple iPhone (exact model hidden)';
    else if (/iPod/i.test(ua)) deviceModel = 'Apple iPod (exact model hidden)';
    else if (/Android/i.test(ua) && device === 'tablet') deviceModel = 'Android tablet (model unavailable)';
    else deviceModel = 'Not exposed by browser';
  }
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) device = 'tablet';
  else if (/Mobi|Android|iPhone|iPod|IEMobile|Windows Phone/i.test(ua)) device = 'mobile';
  else if (!['mobile', 'tablet', 'desktop'].includes(device)) device = 'desktop';

  let browser = 'Unknown browser';
  let version = '';
  const browserCandidates = [
    ['Edge', /Edg(?:A|iOS)?\/([\d.]+)/],
    ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
    ['Opera', /(?:OPR|Opera)\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, expression] of browserCandidates) {
    const match = expression.exec(ua);
    if (match) { browser = name; version = String(match[1] || '').split('.')[0]; break; }
  }
  if (browser !== 'Unknown browser' && version) browser += ` ${version}`;

  let os = 'Unknown OS';
  if (/Android/i.test(ua)) os = cleanText((/Android\s([\d.]+)/i.exec(ua) || [])[1] ? `Android ${( /Android\s([\d.]+)/i.exec(ua) || [])[1]}` : 'Android', 60);
  else if (/iPhone|iPad|iPod/i.test(ua)) os = `iOS ${( /(?:OS|Version)[\s_]+([\d_]+)/i.exec(ua) || [])[1]?.replace(/_/g, '.') || ''}`.trim();
  else if (/Windows NT 10/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = `macOS ${( /Mac OS X[\s_]+([\d_]+)/i.exec(ua) || [])[1]?.replace(/_/g, '.') || ''}`.trim();
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  if (suppliedPlatform) {
    const platform = cleanText(suppliedPlatform, 50);
    if (platform && !/^(?:unknown|linux armv\d+l?)$/i.test(platform) && os === 'Unknown OS') os = platform;
  }
  return { device, deviceModel, browser: cleanText(browser, 60, 'Unknown browser'), os: cleanText(os, 60, 'Unknown OS') };
}

function makeLocationLabel(location) {
  return [location.city, location.region, location.country].filter(Boolean).join(', ') || 'Location unavailable';
}

function cacheGeoValue(key, value, ttlMs) {
  geoCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (geoCache.size > MAX_GEO_CACHE) geoCache.delete(geoCache.keys().next().value);
}

async function lookupIpLocation(ip) {
  if (!looksPublicIp(ip)) return null;
  const cacheKey = createHash('sha256').update(`${GEO_CACHE_SALT}:${ip}`).digest('hex');
  const cached = geoCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(2800) });
    if (!response.ok) { cacheGeoValue(cacheKey, null, 5 * 60_000); return null; }
    const data = await response.json();
    if (data?.success === false || data?.error || !data?.country) { cacheGeoValue(cacheKey, null, 5 * 60_000); return null; }
    const location = {
      city: cleanText(data.city, 90),
      region: cleanText(data.region, 90),
      country: cleanText(data.country, 90),
      countryCode: /^[A-Z]{2}$/.test(String(data.country_code || '').toUpperCase()) ? String(data.country_code).toUpperCase() : '',
      source: 'IP estimate',
    };
    cacheGeoValue(cacheKey, location, GEO_CACHE_TTL_MS);
    return location;
  } catch {
    cacheGeoValue(cacheKey, null, 5 * 60_000);
    return null;
  }
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sunaa_visitor_sessions (
  visitor_id TEXT PRIMARY KEY,
  visitor_label TEXT NOT NULL,
  first_seen BIGINT NOT NULL,
  last_seen BIGINT NOT NULL,
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  device_category TEXT NOT NULL,
  device_model TEXT NOT NULL,
  browser TEXT NOT NULL,
  os TEXT NOT NULL,
  city TEXT,
  region TEXT,
  country TEXT,
  country_code TEXT,
  location_source TEXT,
  page_views BIGINT NOT NULL DEFAULT 1,
  visit_count BIGINT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS sunaa_visitor_sessions_last_seen_idx ON sunaa_visitor_sessions(last_seen DESC);
CREATE INDEX IF NOT EXISTS sunaa_visitor_sessions_country_idx ON sunaa_visitor_sessions(country_code);
CREATE TABLE IF NOT EXISTS sunaa_visitor_events (
  id BIGSERIAL PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES sunaa_visitor_sessions(visitor_id) ON DELETE CASCADE,
  visitor_label TEXT NOT NULL,
  occurred_at BIGINT NOT NULL,
  action TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  device_category TEXT NOT NULL,
  device_model TEXT NOT NULL,
  browser TEXT NOT NULL,
  os TEXT NOT NULL,
  city TEXT,
  region TEXT,
  country TEXT,
  country_code TEXT,
  location_source TEXT
);
CREATE INDEX IF NOT EXISTS sunaa_visitor_events_occurred_idx ON sunaa_visitor_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS sunaa_visitor_events_visitor_idx ON sunaa_visitor_events(visitor_id, occurred_at DESC);
`;

export class VisitorAnalytics {
  constructor({ databaseUrl = process.env.DATABASE_URL } = {}) {
    this.databaseUrl = String(databaseUrl || '').trim();
    this.poolPromise = null;
    this.status = this.databaseUrl ? 'connecting' : 'memory';
  }

  get enabled() { return Boolean(this.databaseUrl); }

  async getPool() {
    if (!this.enabled) return null;
    if (!this.poolPromise) {
      this.poolPromise = (async () => {
        const pg = await import('pg');
        const Pool = pg.Pool || pg.default?.Pool;
        const pool = new Pool({
          connectionString: this.databaseUrl,
          ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' },
          statement_timeout: 5000,
          max: 5,
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 30_000,
          keepAlive: true,
        });
        try {
          await pool.query(SCHEMA_SQL);
          this.status = 'persistent';
          return pool;
        } catch (error) {
          this.status = 'unavailable';
          await pool.end().catch(() => {});
          this.poolPromise = null;
          console.error(JSON.stringify({ level: 'warn', event: 'visitor_database_unavailable', errorType: String(error?.name || 'Error').slice(0, 80) }));
          throw error;
        }
      })().catch(error => { this.poolPromise = null; throw error; });
    }
    return this.poolPromise;
  }

  async recordHeartbeat(visitor) {
    const pool = await this.getPool();
    if (!pool) return { storage: 'memory' };
    const now = visitor.lastSeen;
    const priorResult = await pool.query('SELECT last_seen, path, title, visit_count FROM sunaa_visitor_sessions WHERE visitor_id = $1', [visitor.id]);
    const prior = priorResult.rows[0] || null;
    const isReturn = Boolean(prior && now - Number(prior.last_seen) > RETURN_WINDOW_MS);
    const pageChanged = !prior || prior.path !== visitor.path || prior.title !== visitor.title || now - Number(prior.last_seen) > ACTIVE_WINDOW_MS;
    const action = !prior ? 'Arrived' : (isReturn ? 'Returned' : (pageChanged ? 'Now viewing' : null));
    const viewIncrement = pageChanged ? 1 : 0;
    const visitIncrement = !prior || isReturn ? 1 : 0;
    const values = [visitor.id, visitor.label, visitor.firstSeen, now, visitor.path, visitor.title, visitor.device, visitor.deviceModel, visitor.browser, visitor.os, visitor.location.city || null, visitor.location.region || null, visitor.location.country || null, visitor.location.countryCode || null, visitor.location.source || null, viewIncrement, visitIncrement];
    await pool.query(`INSERT INTO sunaa_visitor_sessions (
      visitor_id, visitor_label, first_seen, last_seen, path, title, device_category, device_model, browser, os,
      city, region, country, country_code, location_source, page_views, visit_count
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,GREATEST($16,1),GREATEST($17,1))
    ON CONFLICT (visitor_id) DO UPDATE SET
      visitor_label = EXCLUDED.visitor_label,
      last_seen = EXCLUDED.last_seen,
      path = EXCLUDED.path, title = EXCLUDED.title,
      device_category = EXCLUDED.device_category,
      device_model = CASE WHEN EXCLUDED.device_model = 'Not exposed by browser' THEN sunaa_visitor_sessions.device_model ELSE EXCLUDED.device_model END,
      browser = EXCLUDED.browser, os = EXCLUDED.os,
      city = COALESCE(EXCLUDED.city, sunaa_visitor_sessions.city),
      region = COALESCE(EXCLUDED.region, sunaa_visitor_sessions.region),
      country = COALESCE(EXCLUDED.country, sunaa_visitor_sessions.country),
      country_code = COALESCE(EXCLUDED.country_code, sunaa_visitor_sessions.country_code),
      location_source = COALESCE(EXCLUDED.location_source, sunaa_visitor_sessions.location_source),
      page_views = sunaa_visitor_sessions.page_views + $16,
      visit_count = sunaa_visitor_sessions.visit_count + $17`, values);
    if (action) {
      await pool.query(`INSERT INTO sunaa_visitor_events (
        visitor_id, visitor_label, occurred_at, action, path, title, device_category, device_model, browser, os,
        city, region, country, country_code, location_source
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, [visitor.id, visitor.label, now, action, visitor.path, visitor.title, visitor.device, visitor.deviceModel, visitor.browser, visitor.os, visitor.location.city || null, visitor.location.region || null, visitor.location.country || null, visitor.location.countryCode || null, visitor.location.source || null]);
    }
    return { storage: 'persistent', action, pageChanged, returning: isReturn };
  }

  async dashboardSnapshot(now, inMemory = {}) {
    if (!this.enabled) return { ...inMemory, storage: 'memory', storageWarning: 'Persistent history is not enabled. Set DATABASE_URL in Render to retain visitor history after restarts.' };
    const pool = await this.getPool();
    const cutoff = now - ACTIVE_WINDOW_MS;
    const [summaryResult, activeResult, popularResult, devicesResult, countryResult, activityResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::bigint AS total_visitors, COALESCE(SUM(page_views),0)::bigint AS total_page_views, COUNT(*) FILTER (WHERE visit_count > 1)::bigint AS returning_visitors FROM sunaa_visitor_sessions`),
      pool.query(`SELECT * FROM sunaa_visitor_sessions WHERE last_seen >= $1 ORDER BY last_seen DESC LIMIT 250`, [cutoff]),
      pool.query(`SELECT path, title, COUNT(*)::bigint AS count FROM sunaa_visitor_sessions WHERE last_seen >= $1 GROUP BY path,title ORDER BY count DESC LIMIT 8`, [cutoff]),
      pool.query(`SELECT device_category, COUNT(*)::bigint AS count FROM sunaa_visitor_sessions WHERE last_seen >= $1 GROUP BY device_category`, [cutoff]),
      pool.query(`SELECT COALESCE(country,'Location unavailable') AS country, COALESCE(country_code,'') AS country_code, COUNT(*)::bigint AS count FROM sunaa_visitor_sessions WHERE last_seen >= $1 GROUP BY country,country_code ORDER BY count DESC LIMIT 8`, [cutoff]),
      pool.query(`SELECT visitor_id, visitor_label, occurred_at, action, path, title, device_category, device_model, browser, os, city, region, country, country_code, location_source FROM sunaa_visitor_events ORDER BY occurred_at DESC LIMIT 120`),
    ]);
    const summary = summaryResult.rows[0] || {};
    const mapVisitor = row => ({
      id: String(row.visitor_id || '').slice(-8), label: row.visitor_label,
      firstSeen: Number(row.first_seen), lastSeen: Number(row.last_seen),
      path: row.path, title: row.title, device: row.device_category,
      deviceModel: row.device_model || 'Not exposed by browser', browser: row.browser || 'Unknown browser', os: row.os || 'Unknown OS',
      city: row.city || '', region: row.region || '', country: row.country || '', countryCode: row.country_code || '',
      location: makeLocationLabel({ city: row.city, region: row.region, country: row.country }), locationSource: row.location_source || '',
      pageViews: Number(row.page_views || 0), visitCount: Number(row.visit_count || 1), watching: String(row.path || '').startsWith('/watch/'),
    });
    const active = activeResult.rows.map(mapVisitor);
    const devices = { mobile: 0, tablet: 0, desktop: 0 };
    for (const row of devicesResult.rows) if (Object.hasOwn(devices, row.device_category)) devices[row.device_category] = Number(row.count);
    const activity = activityResult.rows.map(row => ({
      id: String(row.visitor_id || '').slice(-8), label: row.visitor_label, time: Number(row.occurred_at), action: row.action,
      path: row.path, title: row.title, device: row.device_category, deviceModel: row.device_model || 'Not exposed by browser',
      browser: row.browser || 'Unknown browser', os: row.os || 'Unknown OS', city: row.city || '', region: row.region || '', country: row.country || '', countryCode: row.country_code || '',
      location: makeLocationLabel({ city: row.city, region: row.region, country: row.country }), locationSource: row.location_source || '',
    }));
    const recentVisitors = activeResult.rows;
    // History is paginated through visitorHistory(); this snapshot supplies active summaries and totals.
    return {
      generatedAt: now, activeCount: active.length, active, activity,
      popularPages: popularResult.rows.map(row => ({ path: row.path, title: row.title, count: Number(row.count) })),
      devices, totalVisitors: Number(summary.total_visitors || 0), totalPageViews: Number(summary.total_page_views || 0), returningVisitors: Number(summary.returning_visitors || 0),
      countries: countryResult.rows.map(row => ({ country: row.country, countryCode: row.country_code, count: Number(row.count) })),
      storage: 'persistent', storageWarning: '', retention: 'Visitor sessions and activity are stored in PostgreSQL across app restarts. IP addresses and raw user-agent strings are not stored.',
    };
  }

  async visitorHistory({ offset = 0, limit = 50, query = '' } = {}, memoryVisitors = []) {
    const safeOffset = Math.max(0, Math.min(1_000_000, Math.floor(Number(offset) || 0)));
    const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 50)));
    if (!this.enabled) {
      const matching = memoryVisitors.filter(v => !query || [v.label, v.title, v.path, v.deviceModel, v.browser, v.os, v.city, v.region, v.country].some(value => String(value || '').toLowerCase().includes(query.toLowerCase())));
      return { visitors: matching.slice(safeOffset, safeOffset + safeLimit), total: matching.length, offset: safeOffset, limit: safeLimit, storage: 'memory' };
    }
    const pool = await this.getPool();
    const q = String(query || '').trim().slice(0, 100).replace(/[\\%_]/g, '\\$&');
    const pattern = `%${q}%`;
    const filterSql = q ? `WHERE visitor_label ILIKE $1 ESCAPE '\\' OR title ILIKE $1 ESCAPE '\\' OR path ILIKE $1 ESCAPE '\\' OR device_model ILIKE $1 ESCAPE '\\' OR browser ILIKE $1 ESCAPE '\\' OR os ILIKE $1 ESCAPE '\\' OR COALESCE(city,'') ILIKE $1 ESCAPE '\\' OR COALESCE(region,'') ILIKE $1 ESCAPE '\\' OR COALESCE(country,'') ILIKE $1 ESCAPE '\\'` : '';
    const countParams = q ? [pattern] : [];
    const rowsParams = q ? [pattern, safeLimit, safeOffset] : [safeLimit, safeOffset];
    const limitParam = q ? '$2' : '$1';
    const offsetParam = q ? '$3' : '$2';
    const [countResult, rowsResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::bigint AS total FROM sunaa_visitor_sessions ${filterSql}`, countParams),
      pool.query(`SELECT * FROM sunaa_visitor_sessions ${filterSql} ORDER BY last_seen DESC LIMIT ${limitParam} OFFSET ${offsetParam}`, rowsParams),
    ]);
    const visitors = rowsResult.rows.map(row => ({
      id: String(row.visitor_id || '').slice(-8), label: row.visitor_label,
      firstSeen: Number(row.first_seen), lastSeen: Number(row.last_seen), path: row.path, title: row.title,
      device: row.device_category, deviceModel: row.device_model || 'Not exposed by browser', browser: row.browser || 'Unknown browser', os: row.os || 'Unknown OS',
      city: row.city || '', region: row.region || '', country: row.country || '', countryCode: row.country_code || '',
      location: makeLocationLabel({ city: row.city, region: row.region, country: row.country }), locationSource: row.location_source || '',
      pageViews: Number(row.page_views || 0), visitCount: Number(row.visit_count || 1), watching: String(row.path || '').startsWith('/watch/'),
    }));
    return { visitors, total: Number(countResult.rows[0]?.total || 0), offset: safeOffset, limit: safeLimit, storage: 'persistent' };
  }
}

export { parseDeviceInfo, lookupIpLocation, looksPublicIp, makeLocationLabel };
