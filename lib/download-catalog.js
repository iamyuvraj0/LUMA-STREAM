import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

const QUALITY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/i;
const MAX_LABEL_LENGTH = 40;

function positiveInteger(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function safeFilename(value, fallback) {
  const candidate = String(value || fallback || 'video.mp4')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, '.')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 180);
  return candidate || 'video.mp4';
}

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * A download catalogue intentionally supports only media files hosted on the
 * LUMA server. It does not inspect, proxy, or extract files from third-party
 * iframe players or arbitrary remote URLs.
 */
export function createDownloadCatalog({ catalogPath, downloadRoot } = {}) {
  const catalogFile = path.resolve(catalogPath || path.join(process.cwd(), 'data', 'download-catalog.json'));
  const root = path.resolve(downloadRoot || path.join(process.cwd(), 'media', 'downloads'));

  function readCatalog() {
    try {
      const raw = JSON.parse(readFileSync(catalogFile, 'utf8'));
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    } catch {
      return {};
    }
  }

  function mediaEntry(media, id, season, episode) {
    if (!['movie', 'tv'].includes(media)) return null;
    const safeId = positiveInteger(id);
    if (!safeId) return null;
    const catalog = readCatalog();
    const branch = media === 'movie' ? catalog.movies : catalog.tv;
    const titleEntry = branch && typeof branch === 'object' ? branch[String(safeId)] : null;
    if (!titleEntry || typeof titleEntry !== 'object' || Array.isArray(titleEntry)) return null;
    if (media === 'movie') return titleEntry;

    const safeSeason = positiveInteger(season);
    const safeEpisode = positiveInteger(episode);
    if (!safeSeason || !safeEpisode) return null;
    const episodeEntry = titleEntry.seasons?.[String(safeSeason)]?.episodes?.[String(safeEpisode)];
    return episodeEntry && typeof episodeEntry === 'object' && !Array.isArray(episodeEntry) ? episodeEntry : null;
  }

  function resolveLocalFile(relativeFile) {
    if (typeof relativeFile !== 'string' || !relativeFile.trim() || path.isAbsolute(relativeFile) || relativeFile.includes('\\') || relativeFile.includes('\0')) return null;
    const candidate = path.resolve(root, relativeFile);
    if (!inside(root, candidate)) return null;

    try {
      const realRoot = realpathSync(root);
      const realFile = realpathSync(candidate);
      if (!inside(realRoot, realFile)) return null;
      const stats = statSync(realFile);
      if (!stats.isFile() || stats.size < 1) return null;
      return { filePath: realFile, sizeBytes: stats.size };
    } catch {
      return null;
    }
  }

  function list(media, id, season, episode) {
    const entry = mediaEntry(media, id, season, episode);
    if (!entry || !Array.isArray(entry.qualities)) return { title: typeof entry?.title === 'string' ? entry.title.slice(0, 200) : null, qualities: [] };

    const seenIds = new Set();
    const qualities = [];
    for (const [index, option] of entry.qualities.entries()) {
      if (!option || typeof option !== 'object' || Array.isArray(option)) continue;
      const optionId = String(option.id || '').trim();
      const label = String(option.label || '').trim().slice(0, MAX_LABEL_LENGTH);
      if (!QUALITY_ID_PATTERN.test(optionId) || seenIds.has(optionId) || !label) continue;
      const file = resolveLocalFile(option.file);
      if (!file) continue;
      seenIds.add(optionId);
      const height = Number(option.height);
      const bitrate = Number(option.bitrate);
      const filename = safeFilename(option.filename, path.basename(file.filePath));
      qualities.push({
        id: optionId,
        label,
        height: Number.isSafeInteger(height) && height > 0 && height <= 4320 ? height : 0,
        bitrate: Number.isFinite(bitrate) && bitrate > 0 ? bitrate : 0,
        sizeBytes: file.sizeBytes,
        filename,
        filePath: file.filePath,
        sourceIndex: index,
      });
    }

    qualities.sort((a, b) => b.height - a.height || b.bitrate - a.bitrate || b.sizeBytes - a.sizeBytes || a.sourceIndex - b.sourceIndex);
    return {
      title: typeof entry.title === 'string' ? entry.title.slice(0, 200) : null,
      qualities: qualities.map(({ sourceIndex, ...quality }) => quality),
    };
  }

  function resolve(media, id, season, episode, qualityId) {
    if (typeof qualityId !== 'string' || !QUALITY_ID_PATTERN.test(qualityId)) return null;
    const { qualities } = list(media, id, season, episode);
    const quality = qualities.find((option) => option.id === qualityId);
    if (!quality) return null;
    return { filePath: quality.filePath, filename: quality.filename, quality };
  }

  return { list, resolve, root, catalogFile };
}

export { safeFilename };
