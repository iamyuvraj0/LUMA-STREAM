import { randomUUID } from 'node:crypto';

const QUALITY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/i;
const MEDIA_TYPES = new Set(['movie', 'tv']);
const SUPPORTED_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/x-matroska',
  'application/octet-stream',
]);
const MANIFEST_EXTENSIONS = new Set(['.m3u8', '.m3u', '.mpd', '.ism', '.isml']);
const FILE_EXTENSIONS = new Set(['.mp4', '.m4v', '.webm', '.mkv', '.mov']);
const MAX_SOURCES_PER_RESPONSE = 24;
const SOURCE_TTL_MS = 3 * 60 * 1000;
const MAX_SOURCE_TOKENS = 2000;

function validPositiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function safeFilename(value, fallback = 'luma-download.mp4') {
  const name = String(value || fallback)
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, '.')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 180);
  return name || 'luma-download.mp4';
}

function hostIsLoopback(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function parseHttpsUrl(value, { allowLoopbackHttp = false } = {}) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return null;
    const protocolAllowed = url.protocol === 'https:' || (allowLoopbackHttp && url.protocol === 'http:' && hostIsLoopback(url.hostname));
    return protocolAllowed ? url : null;
  } catch {
    return null;
  }
}

function parseAllowedHosts(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[;,\s]+/);
  return new Set(values.map((item) => String(item).trim().toLowerCase().replace(/\.$/, '')).filter(Boolean));
}

function validRangeHeader(value) {
  return typeof value === 'string' && /^bytes=\d*-\d*$/.test(value) && value !== 'bytes=-';
}

/**
 * Optional integration for a configured provider that explicitly returns
 * downloadable direct-file renditions. This intentionally does not scrape
 * third-party iframe internals or accept HLS/DASH manifests as video files.
 *
 * Resolver contract (GET):
 *   ?type=movie|tv&id=TMDB_ID[&season=N&episode=N&provider=VidKing]
 *   Authorization: Bearer <token> (optional)
 *   JSON: { title?: string, qualities: [{ id, label, height, bitrate?, sizeBytes?,
 *     filename?, url, mimeType: "video/mp4", format: "mp4", downloadable: true }] }
 */
export function createProviderDownloadAdapter({
  resolverUrl = process.env.LUMA_DOWNLOAD_RESOLVER_URL,
  resolverToken = process.env.LUMA_DOWNLOAD_RESOLVER_TOKEN,
  allowedHosts = process.env.LUMA_DOWNLOAD_ALLOWED_HOSTS,
  fetchImpl = globalThis.fetch,
  sourceTtlMs = SOURCE_TTL_MS,
  now = () => Date.now(),
} = {}) {
  const resolver = parseHttpsUrl(String(resolverUrl || '').trim(), { allowLoopbackHttp: true });
  const hostAllowlist = parseAllowedHosts(allowedHosts);
  const sources = new Map();

  function isAllowedUrl(value) {
    const url = parseHttpsUrl(value, { allowLoopbackHttp: true });
    if (!url) return null;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!hostAllowlist.has(hostname)) return null;
    const extension = url.pathname.slice(url.pathname.lastIndexOf('.')).toLowerCase();
    if (MANIFEST_EXTENSIONS.has(extension)) return null;
    return url;
  }

  function pruneSources() {
    const current = now();
    for (const [key, value] of sources) {
      if (value.expiresAt <= current) sources.delete(key);
    }
    while (sources.size >= MAX_SOURCE_TOKENS) {
      const first = sources.keys().next().value;
      if (!first) break;
      sources.delete(first);
    }
  }

  function cleanRendition(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || item.downloadable !== true) return null;
    const urlValue = String(item.url || item.downloadUrl || item.directUrl || item.fileUrl || '').trim();
    const url = isAllowedUrl(urlValue);
    if (!url) return null;
    // An embed/player page is never a direct file, even if a resolver labels it
    // as MP4. Signed direct-file URLs may omit extensions, so MIME/format checks
    // below are still used for those.
    if (/\/(?:embed|player)\//i.test(url.pathname)
      || /^\/(?:movie|serial|tv)\/[^.]+\/?$/i.test(url.pathname)) return null;

    const mimeType = String(item.mimeType || item.contentType || '').split(';')[0].trim().toLowerCase();
    const format = String(item.format || '').trim().toLowerCase();
    const extension = url.pathname.slice(url.pathname.lastIndexOf('.')).toLowerCase();
    // A direct-file declaration is required. HLS/DASH manifests are not files
    // and a playlist must never be renamed to .mp4 and presented as a download.
    if (MANIFEST_EXTENSIONS.has(extension)) return null;
    if (!SUPPORTED_MIME_TYPES.has(mimeType) && !FILE_EXTENSIONS.has(extension) && !['mp4', 'm4v', 'webm', 'mkv', 'mov'].includes(format)) return null;
    if (mimeType.includes('mpegurl') || mimeType.includes('dash+xml')) return null;
    if (format && !['mp4', 'm4v', 'webm', 'mkv', 'mov'].includes(format)) return null;

    const rawId = String(item.id || '').trim();
    const id = QUALITY_ID_PATTERN.test(rawId) ? rawId : `${format || 'file'}-${randomUUID().slice(0, 8)}`;
    const rawHeight = Number(item.height);
    const rawBitrate = Number(item.bitrate);
    const rawSize = Number(item.sizeBytes ?? item.size);
    const label = String(item.label || (Number.isSafeInteger(rawHeight) && rawHeight > 0 ? `${rawHeight}p` : format.toUpperCase() || 'Video file')).trim().slice(0, 50);
    if (!label) return null;

    return {
      id,
      label,
      height: Number.isSafeInteger(rawHeight) && rawHeight > 0 && rawHeight <= 4320 ? rawHeight : 0,
      bitrate: Number.isFinite(rawBitrate) && rawBitrate > 0 ? rawBitrate : 0,
      sizeBytes: Number.isFinite(rawSize) && rawSize > 0 ? Math.floor(rawSize) : 0,
      filename: safeFilename(item.filename, `luma-${id}.${format || (extension.startsWith('.') ? extension.slice(1) : 'mp4')}`),
      mimeType: SUPPORTED_MIME_TYPES.has(mimeType) ? mimeType : (extension === '.webm' ? 'video/webm' : 'video/mp4'),
      url: url.href,
      hostname: url.hostname.toLowerCase(),
    };
  }

  async function list({ media, id, season, episode, provider } = {}) {
    if (!resolver || !hostAllowlist.size || typeof fetchImpl !== 'function') {
      return { configured: false, title: null, qualities: [], message: 'No downloadable provider is configured.' };
    }
    if (!MEDIA_TYPES.has(media) || !validPositiveInteger(id)) {
      return { configured: true, title: null, qualities: [], message: 'Invalid media selection.' };
    }
    if (media === 'tv' && (!validPositiveInteger(season) || !validPositiveInteger(episode))) {
      return { configured: true, title: null, qualities: [], message: 'Select a valid season and episode.' };
    }

    try {
      const url = new URL(resolver.href);
      url.searchParams.set('type', media);
      url.searchParams.set('id', String(Number(id)));
      if (media === 'tv') {
        url.searchParams.set('season', String(Number(season)));
        url.searchParams.set('episode', String(Number(episode)));
      }
      if (typeof provider === 'string' && provider.length <= 40 && /^[a-z0-9 _-]+$/i.test(provider)) {
        url.searchParams.set('provider', provider);
      }
      const headers = { Accept: 'application/json' };
      if (String(resolverToken || '').trim()) headers.Authorization = `Bearer ${String(resolverToken).trim()}`;
      const response = await fetchImpl(url, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return { configured: true, title: null, qualities: [], message: 'The configured download provider is unavailable.' };
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('application/json')) return { configured: true, title: null, qualities: [], message: 'The download provider did not return a valid JSON response.' };
      const payload = await response.json();
      const options = Array.isArray(payload?.qualities) ? payload.qualities
        : Array.isArray(payload?.renditions) ? payload.renditions
          : Array.isArray(payload?.sources) ? payload.sources
            : Array.isArray(payload?.data?.qualities) ? payload.data.qualities
              : Array.isArray(payload?.data?.renditions) ? payload.data.renditions
                : Array.isArray(payload?.data?.sources) ? payload.data.sources : [];
      const identity = {
        media,
        id: Number(id),
        season: media === 'tv' ? Number(season) : null,
        episode: media === 'tv' ? Number(episode) : null,
      };
      const unique = new Set();
      const qualities = [];
      pruneSources();
      for (const item of options.slice(0, MAX_SOURCES_PER_RESPONSE)) {
        const rendition = cleanRendition(item);
        if (!rendition) continue;
        const dedupe = `${rendition.id}:${rendition.url}`;
        if (unique.has(dedupe)) continue;
        unique.add(dedupe);
        const sourceId = randomUUID();
        sources.set(sourceId, {
          ...rendition,
          identity,
          expiresAt: now() + Math.max(30_000, Math.min(Number(sourceTtlMs) || SOURCE_TTL_MS, 10 * 60_000)),
        });
        qualities.push({
          id: `provider-${sourceId}`,
          label: rendition.label,
          height: rendition.height,
          bitrate: rendition.bitrate,
          sizeBytes: rendition.sizeBytes,
          filename: rendition.filename,
          sourceId,
          sourceName: String(item.sourceName || payload.provider || 'Provider').slice(0, 40),
          provider: true,
        });
      }
      qualities.sort((a, b) => b.height - a.height || b.bitrate - a.bitrate || b.sizeBytes - a.sizeBytes);
      return {
        configured: true,
        title: typeof payload.title === 'string' ? payload.title.slice(0, 200) : null,
        qualities,
        message: qualities.length ? null : 'The configured provider returned no verified direct-download files.',
      };
    } catch {
      return { configured: true, title: null, qualities: [], message: 'The configured download provider could not be reached or returned an invalid response.' };
    }
  }

  function getSource(sourceId, identity) {
    if (typeof sourceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(sourceId)) return null;
    const source = sources.get(sourceId);
    if (!source || source.expiresAt <= now()) {
      sources.delete(sourceId);
      return null;
    }
    if (!identity || source.identity.media !== identity.media || source.identity.id !== Number(identity.id) || source.identity.season !== (identity.media === 'tv' ? Number(identity.season) : null) || source.identity.episode !== (identity.media === 'tv' ? Number(identity.episode) : null)) return null;
    return { ...source };
  }

  async function fetchFile(source, rangeHeader) {
    if (!source || !isAllowedUrl(source.url)) throw new Error('Invalid provider file source.');
    if (rangeHeader !== undefined && !validRangeHeader(rangeHeader)) throw new Error('Invalid byte range.');
    let current = source.url;
    for (let hop = 0; hop <= 3; hop += 1) {
      const url = isAllowedUrl(current);
      if (!url) throw new Error('Provider redirected to a host that is not allowed.');
      const headers = { Accept: 'video/mp4,video/webm,video/x-matroska,application/octet-stream;q=0.9' };
      if (validRangeHeader(rangeHeader)) headers.Range = rangeHeader;
      const controller = new AbortController();
      // Bound connection/header wait only. Do not attach a fixed-duration signal
      // to the body stream: long movie downloads can take far longer than 30s.
      const headerTimeout = setTimeout(() => controller.abort(), 30_000);
      let response;
      try {
        response = await fetchImpl(url, {
          method: 'GET',
          headers,
          redirect: 'manual',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(headerTimeout);
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => {});
        if (!location || hop === 3) throw new Error('The provider returned too many or an invalid redirects.');
        const next = new URL(location, url);
        if (!isAllowedUrl(next.href)) throw new Error('Provider redirected to a host that is not allowed.');
        current = next.href;
        continue;
      }
      const remoteType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (remoteType.includes('mpegurl') || remoteType.includes('dash+xml')) {
        await response.body?.cancel().catch(() => {});
        throw new Error('The provider returned a streaming manifest, not a downloadable video file.');
      }
      if (response.ok && !SUPPORTED_MIME_TYPES.has(remoteType)) {
        await response.body?.cancel().catch(() => {});
        throw new Error('The provider did not return a supported video-file content type.');
      }
      return response;
    }
    throw new Error('Unable to resolve the provider file.');
  }

  return {
    configured: Boolean(resolver && hostAllowlist.size),
    list,
    getSource,
    fetchFile,
    isAllowedUrl: (value) => Boolean(isAllowedUrl(value)),
  };
}

export { validRangeHeader };
