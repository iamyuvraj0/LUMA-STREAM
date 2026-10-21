import { readFileSync } from 'node:fs';

const MAX_PROVIDERS = 30;
const MAX_NAME_LENGTH = 48;
const ALLOWED_PLACEHOLDERS = new Set(['id', 'imdb', 'season', 'episode']);

function normalizeTemplate(value, { requiredAny = ['id'], requiredAll = [] } = {}) {
  if (typeof value !== 'string' || value.length > 1024) return null;
  const placeholders = [...value.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]);
  if (placeholders.some(name => !ALLOWED_PLACEHOLDERS.has(name))) return null;
  if (!requiredAny.some(name => placeholders.includes(name))) return null;
  if (!requiredAll.every(name => placeholders.includes(name))) return null;

  // Placeholders may only be used after the origin, never in the scheme or host.
  const authority = value.match(/^https:\/\/([^/?#]+)/i)?.[1];
  if (!authority || /[{}]/.test(authority)) return null;

  // Check the fully-expanded URL before exposing the template to the browser.
  const sample = value
    .replaceAll('{id}', '12345')
    .replaceAll('{imdb}', 'tt1234567')
    .replaceAll('{season}', '1')
    .replaceAll('{episode}', '1');
  if (/[{}]/.test(sample)) return null;
  try {
    const parsed = new URL(sample);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * Loads administrator-configured embed endpoints. This only advertises public
 * iframe templates; it never resolves hidden media URLs or fetches upstream media.
 */
export function createEmbedProviderRegistry({ configPath } = {}) {
  return {
    getProviders() {
      if (!configPath) return [];
      let parsed;
      try {
        parsed = JSON.parse(readFileSync(configPath, 'utf8'));
      } catch {
        return [];
      }
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.providers)) return [];

      const providers = [];
      const names = new Set();
      for (const item of parsed.providers.slice(0, MAX_PROVIDERS)) {
        if (!item || typeof item !== 'object' || item.enabled !== true) continue;
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        if (!name || name.length > MAX_NAME_LENGTH || /[<>\u0000-\u001f]/.test(name)) continue;
        const key = name.toLowerCase();
        if (names.has(key)) continue;
        const movie = normalizeTemplate(item.movie, { requiredAny: ['id', 'imdb'] });
        const tv = normalizeTemplate(item.tv, { requiredAny: ['id', 'imdb'], requiredAll: ['season', 'episode'] });
        if (!movie && !tv) continue;
        names.add(key);
        providers.push({ name, movie, tv });
      }
      return providers;
    },
  };
}
