const app = document.querySelector('#app');
const toastRoot = document.querySelector('#toast-root');

const SETTINGS_KEY = 'luma-settings';
const DEFAULT_SERVER_ORDER = ['VidKing', 'VidSrc', 'CineSrc', 'FilmU', '2Embed', 'VidLink', 'VidRift', 'SuperEmbed', 'SmashyStream', 'VidEasy', 'VidSrc.cc', 'RiveStream', 'YapGrid', 'VidPlus', 'VidCore', 'VidZee', 'Frembed', 'PrimeWire Embed', 'P-Stream', 'VidSrc API', 'VidSrc TW', 'VidSrc Link', 'VidSrc Wiki'];
const SOURCE_PREVIEW_LIMIT = 8;
let configuredEmbedProviders = [];
function safeStorageGet(key, fallback = null) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function safeStoredArray(key) {
  try {
    const value = JSON.parse(safeStorageGet(key, '[]'));
    return Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && Number.isFinite(Number(item.id))) : [];
  } catch { return []; }
}
function validHexSetting(value) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value); }
const DEFAULT_GRADIENT = { palette: 'Abyss Bloom', base: '#05070c', c1: '#17345a', c2: '#38204d', c3: '#0e4a43', intensity: 86, tempo: 0, motion: true };
const DEFAULT_SETTINGS = {
  theme: safeStorageGet('luma-theme', 'dark'),
  accent: safeStorageGet('luma-accent', 'sage-ink'),
  accentPrimary: '#91a58b',
  accentSecondary: '#d2c7a6',
  gradient: { ...DEFAULT_GRADIENT },
  region: 'NP',
  detailView: 'page',
  imageLogos: false,
  trailers: false,
  spoilerFree: false,
  reduceMotion: false,
  autoplay: true,
  serverOrder: DEFAULT_SERVER_ORDER,
  account: null,
};
function loadSettings() {
  try {
    const parsed = JSON.parse(safeStorageGet(SETTINGS_KEY, '{}'));
    const stored = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    const validRegions = ['NP', 'US', 'GB', 'IN', 'AU', 'CA'];
    const savedOrder = Array.isArray(stored.serverOrder) ? stored.serverOrder : [];
    const mergedOrder = [...savedOrder.filter(name => DEFAULT_SERVER_ORDER.includes(name)), ...DEFAULT_SERVER_ORDER.filter(name => !savedOrder.includes(name))];
    const savedGradient = stored.gradient && typeof stored.gradient === 'object' && !Array.isArray(stored.gradient) ? stored.gradient : {};
    const gradient = {
      ...DEFAULT_GRADIENT,
      ...savedGradient,
      base: validHexSetting(savedGradient.base) ? savedGradient.base : DEFAULT_GRADIENT.base,
      c1: validHexSetting(savedGradient.c1) ? savedGradient.c1 : DEFAULT_GRADIENT.c1,
      c2: validHexSetting(savedGradient.c2) ? savedGradient.c2 : DEFAULT_GRADIENT.c2,
      c3: validHexSetting(savedGradient.c3) ? savedGradient.c3 : DEFAULT_GRADIENT.c3,
      palette: typeof savedGradient.palette === 'string' ? savedGradient.palette.slice(0, 60) : DEFAULT_GRADIENT.palette,
      intensity: Number.isFinite(Number(savedGradient.intensity)) ? Math.max(35, Math.min(100, Number(savedGradient.intensity))) : DEFAULT_GRADIENT.intensity,
      tempo: Number.isInteger(savedGradient.tempo) ? Math.max(0, Math.min(3, savedGradient.tempo)) : DEFAULT_GRADIENT.tempo,
      motion: typeof savedGradient.motion === 'boolean' ? savedGradient.motion : DEFAULT_GRADIENT.motion,
    };
    return {
      ...DEFAULT_SETTINGS, ...stored,
      accentPrimary: validHexSetting(stored.accentPrimary) ? stored.accentPrimary : DEFAULT_SETTINGS.accentPrimary,
      accentSecondary: validHexSetting(stored.accentSecondary) ? stored.accentSecondary : DEFAULT_SETTINGS.accentSecondary,
      gradient,
      region: validRegions.includes(stored.region) ? stored.region : DEFAULT_SETTINGS.region,
      serverOrder: mergedOrder
    };
  } catch {
    return { ...DEFAULT_SETTINGS, serverOrder: [...DEFAULT_SERVER_ORDER] };
  }
}
function saveSettings() {
  return safeStorageSet(SETTINGS_KEY, JSON.stringify(state.settings));
}
function updateSetting(key, value, { persist = true, refresh = false } = {}) {
  state.settings[key] = value;
  if (persist) saveSettings();
  if (refresh) applySettings();
}
const state = {
  home: null,
  cache: new Map(),
  list: safeStoredArray('luma-list'),
  history: safeStoredArray('luma-history'),
  heroIndex: 0,
  heroTimer: null,
  heroItems: [],
  heroPaused: false,
  heroHoverPaused: false,
  lastInputMethod: 'pointer',
  modalTrigger: null,
  renderSequence: 0,
  globalSearchTimer: null,
  globalSearchCloseTimer: null,
  globalSearchSequence: 0,
  globalSearchReturnFocus: null,
  navIndex: null,
  scrollFrame: 0,
  gradientStretchTimer: 0,
  watchMessageHandler: null,
  settings: loadSettings(),
};

const icon = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v11"/><path d="m7.5 10 4.5 4.5 4.5-4.5"/><path d="M5 16.5v2A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2v-2"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true" class="icon-fill"><path d="M8 5.4v13.2L19 12 8 5.4Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
  playCircle: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m10.2 8.8 5.1 3.2-5.1 3.2V8.8Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 7"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.9 7.5-4.3M8.2 13.1l7.5 4.3"/></svg>',
  external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8"/><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 10.8v5.1M12 7.8v.1"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.6"/><path d="M12 2.8v2M12 19.2v2M21.2 12h-2M4.8 12h-2M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4M18.5 18.5l-1.4-1.4M6.9 6.9 5.5 5.5"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.6 14.7A7.7 7.7 0 0 1 9.3 4.4 7.7 7.7 0 1 0 19.6 14.7Z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M8 3.8v3.4M16 3.8v3.4M4 9.5h16"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.8v4.7l3.1 1.8"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 2.3 4.7 5.2.8-3.8 3.6.9 5.2-4.6-2.5-4.6 2.5.9-5.2-3.8-3.6 5.2-.8L12 4Z"/></svg>',
  film: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 5v14M16 5v14M4 9h4M12 9h4M4 15h4M12 15h4"/></svg>',
  tv: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="2"/><path d="m9 3 3 3 3-3"/><path d="M10 10.2 15 12l-5 1.8v-3.6Z"/></svg>',
  users: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9" r="3"/><path d="M3.8 19c.5-3 2.4-4.8 5.2-4.8s4.7 1.8 5.2 4.8"/><path d="M15.5 6.7a2.8 2.8 0 0 1 0 5.5M16.1 14.2c2.2.5 3.5 2 4 4.8"/></svg>',
  globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.8 12h16.4M12 3.5c2.2 2.3 3.2 5.1 3.2 8.5S14.2 18.2 12 20.5c-2.2-2.3-3.2-5.1-3.2-8.5S9.8 5.8 12 3.5Z"/></svg>',
  layers: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 16l8 4 8-4"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z"/><path d="M9 20v-6h6v6"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19 13.5 1.2 1.2-2 3.4-1.7-.5a7.8 7.8 0 0 1-1.6.9L14.6 20h-4l-.3-1.5a7.8 7.8 0 0 1-1.6-.9l-1.7.5-2-3.4L6.2 13.5a7.5 7.5 0 0 1 0-3L5 9.3l2-3.4 1.7.5a7.8 7.8 0 0 1 1.6-.9L10.6 4h4l.3 1.5a7.8 7.8 0 0 1 1.6.9l1.7-.5 2 3.4-1.2 1.2a7.5 7.5 0 0 1 0 3Z"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.1"/><path d="M5.5 19.5c.8-3.4 2.9-5.1 6.5-5.1s5.7 1.7 6.5 5.1"/></svg>',
  palette: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5a7.5 7.5 0 0 0 0 15h1.2a1.8 1.8 0 0 0 0-3.6H12a1.2 1.2 0 0 1 0-2.4h2.6a5.9 5.9 0 0 0 0-11.8H12Z"/><circle cx="7.5" cy="10" r=".8"/><circle cx="10" cy="7.2" r=".8"/><circle cx="14" cy="7.2" r=".8"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h8M17 7h2M5 17h2M11 17h8M13 5v4M9 15v4"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  server: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4.5" width="16" height="6" rx="1.5"/><rect x="4" y="13.5" width="16" height="6" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01M10 7.5h5M10 16.5h5"/></svg>',
  subtitles: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M7 14h3M14 14h3M7 10h5M15 10h2"/></svg>',
  ads: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z"/><path d="m8 8 8 8M16 8l-8 8"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 18.2h9.5a4.3 4.3 0 0 0 .3-8.6A6 6 0 0 0 5.5 11 3.7 3.7 0 0 0 7.2 18.2Z"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  chevronUp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
  carousel: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="5" height="12" rx="1.3"/><rect x="9.5" y="6" width="5" height="12" rx="1.3"/><rect x="16" y="6" width="5" height="12" rx="1.3"/></svg>',
  monitor: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="11" rx="2"/><path d="M9 20h6M12 15v5"/></svg>',
  modal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h5M8 16h6"/></svg>',
  grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="7" r="1"/><circle cx="16" cy="7" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="17" r="1"/><circle cx="16" cy="17" r="1"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg>',
};


function setPageMetadata({ title = 'Discover Movies & TV', description = 'Discover movies, television series and people with LUMA Stream’s cinematic catalogue.', image = null, path = location.pathname || '/', robots = 'index,follow', preloadImage = false, type = 'website' } = {}) {
  const titleText = String(title || 'Discover Movies & TV').replace(/\u2014/g, '-');
  let fullTitle = titleText === 'LUMA Stream' ? titleText : titleText === 'Discover Movies & TV' ? 'LUMA Stream - Discover Movies & TV' : `${titleText} | LUMA Stream`;
  if (fullTitle.length > 65) { const suffix = ' | LUMA Stream'; const source = titleText.replace(/\s*\|\s*LUMA Stream$/i, ''); const maxBase = 65 - suffix.length; const clipped = source.slice(0, maxBase - 1); const boundary = clipped.lastIndexOf(' '); fullTitle = `${(boundary > maxBase * 0.6 ? clipped.slice(0, boundary) : clipped).trim()}…${suffix}`; }
  const canonicalPath = String(path || '/').split('?')[0] || '/';
  const canonical = new URL(canonicalPath, location.origin).href;
  const safeImage = (() => {
    try {
      const url = new URL(image || '/assets/luma-social.png', location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : new URL('/assets/luma-social.png', location.origin).href;
    } catch { return new URL('/assets/luma-social.png', location.origin).href; }
  })();
  const cleanDescription = String(description || 'Discover movies, television series and people with LUMA Stream’s cinematic catalogue.').replace(/\u2014/g, '-').replace(/\s+/g, ' ').trim().slice(0, 160);
  document.title = fullTitle;
  const values = {
    'meta-description': cleanDescription,
    'meta-robots': `${robots}${String(robots).includes('max-image-preview:large') ? '' : ',max-image-preview:large'}`,
    'meta-theme-color': document.documentElement.dataset.theme === 'light' ? '#f0ede7' : '#08090c',
    'meta-og-site-name': 'LUMA Stream',
    'meta-og-type': type,
    'meta-og-title': fullTitle,
    'meta-og-description': cleanDescription,
    'meta-og-url': canonical,
    'meta-og-image': safeImage,
    'meta-og-image-alt': fullTitle,
    'meta-twitter-card': 'summary_large_image',
    'meta-twitter-title': fullTitle,
    'meta-twitter-description': cleanDescription,
    'meta-twitter-image': safeImage,
  };
  for (const [id, value] of Object.entries(values)) {
    const element = document.getElementById(id);
    if (element) element.setAttribute('content', value);
  }
  const canonicalLink = document.getElementById('canonical-link');
  if (canonicalLink) canonicalLink.setAttribute('href', canonical);
  const jsonLd = document.getElementById('seo-jsonld');
  if (jsonLd) {
    const detailMatch = canonicalPath.match(/^\/details\/(movie|tv)\/(\d+)$/);
    const personMatch = canonicalPath.match(/^\/person\/(\d+)$/);
    const schemaType = detailMatch ? (detailMatch[1] === 'tv' ? 'TVSeries' : 'Movie') : personMatch ? 'Person' : canonicalPath === '/' ? 'WebSite' : 'WebPage';
    const schemaName = detailMatch ? titleText.replace(/\s*-\s*(?:Movie|TV Series)$/i, '') : personMatch ? titleText.replace(/\s*-\s*Filmography$/i, '') : fullTitle;
    const schema = { '@context': 'https://schema.org', '@type': schemaType, name: schemaName, description: cleanDescription, url: canonical };
    if (schemaType === 'WebSite') schema.name = 'LUMA Stream';
    if (['Person', 'Movie', 'TVSeries'].includes(schemaType)) schema.image = safeImage;
    else if (schemaType !== 'WebSite') schema.primaryImageOfPage = safeImage;
    jsonLd.textContent = JSON.stringify(schema);
  }
  document.querySelectorAll('link[data-luma-image-preload]').forEach(link => link.remove());
  if (preloadImage && image) {
    const preload = document.createElement('link');
    preload.rel = 'preload'; preload.as = 'image'; preload.href = safeImage; preload.setAttribute('fetchpriority', 'high'); preload.dataset.lumaImagePreload = 'true';
    document.head.append(preload);
  }
}

function iconWrap(name, cls = '') { return `<span class="icon ${cls}" aria-hidden="true">${icon[name] || ''}</span>`; }
function escapeHtml(value = '') { return String(value).replace(/\u2014/g, '-').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
function year(v) { return v ? new Date(v).getFullYear() : '-'; }
function rating(v) { return Number(v || 0).toFixed(1); }
function mediaType(item) {
  if (item?.media_type === 'person') return 'person';
  if (item?.media_type === 'tv' || (item?.name && !item?.title)) return 'tv';
  return 'movie';
}
function detailHref(item) { return `/details/${mediaType(item)}/${item.id}`; }
function saveState() {
  const listSaved = safeStorageSet('luma-list', JSON.stringify(state.list));
  const historySaved = safeStorageSet('luma-history', JSON.stringify(state.history.slice(0, 30)));
  if (!listSaved || !historySaved) showToast('Browser storage is unavailable; changes may not persist.');
}
function isSaved(id, type) { return state.list.some(x => x.id === id && x.media_type === type); }
function formatMinutes(minutes) {
  const value = Number(minutes || 0);
  if (!value) return '-';
  const h = Math.floor(value / 60);
  const m = value % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
function dedupeBy(items, key) { return [...new Map(items.filter(Boolean).map(item => [item[key], item])).values()]; }
function showToast(text) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.innerHTML = `${iconWrap('check')}<span>${escapeHtml(text)}</span>`;
  toastRoot.append(node);
  setTimeout(() => node.remove(), 2400);
}
function watchHistoryEntry(type, id) {
  return state.history.find(entry => Number(entry.id) === Number(id) && entry.media_type === type && entry.watchPath) || null;
}
function watchPathFor(type, id, season, episode) {
  return type === 'tv'
    ? `/watch/tv/${Number(id)}?season=${Math.max(1, Number(season) || 1)}&episode=${Math.max(1, Number(episode) || 1)}`
    : `/watch/movie/${Number(id)}`;
}
function updateWatchHistory(item, { season = null, episode = null, progress, resumeSeconds, duration, sourceName, resetProgress = false } = {}) {
  const type = mediaType(item);
  const previous = state.history.find(entry => Number(entry.id) === Number(item.id) && entry.media_type === type) || null;
  const sameEpisode = Boolean(previous && (type !== 'tv' || (Number(previous.season) === Number(season) && Number(previous.episode) === Number(episode))));
  const keepPrior = sameEpisode && !resetProgress;
  const next = {
    ...(previous || {}),
    id: Number(item.id), media_type: type,
    title: item.title || item.name || previous?.title || 'Untitled',
    poster: item.poster || item.posterLarge || previous?.poster || '',
    release_date: item.release_date || previous?.release_date || '',
    vote_average: item.vote_average ?? previous?.vote_average ?? 0,
    at: Date.now(), lastWatchedAt: Date.now(),
    watchPath: watchPathFor(type, item.id, season, episode),
    progress: resetProgress ? 0 : Number.isFinite(Number(progress)) ? Math.max(0, Math.min(100, Number(progress))) : (keepPrior ? Number(previous.progress) || 0 : 0),
    resumeSeconds: resetProgress ? 0 : Number.isFinite(Number(resumeSeconds)) ? Math.max(0, Number(resumeSeconds)) : (keepPrior ? Number(previous.resumeSeconds) || 0 : 0),
    duration: resetProgress ? 0 : Number.isFinite(Number(duration)) && Number(duration) > 0 ? Number(duration) : (keepPrior ? Number(previous.duration) || 0 : 0),
    sourceName: sourceName || (keepPrior ? previous.sourceName || '' : ''),
  };
  if (type === 'tv') { next.season = Math.max(1, Number(season) || 1); next.episode = Math.max(1, Number(episode) || 1); }
  else { delete next.season; delete next.episode; }
  state.history = [next, ...state.history.filter(entry => !(Number(entry.id) === Number(item.id) && entry.media_type === type))].slice(0, 30);
  saveState();
  return next;
}
function pushHistory(item, options = {}) {
  return updateWatchHistory(item, options);
}
async function api(path) {
  const url = new URL(path, location.origin);
  if (url.pathname.startsWith('/api/')) url.searchParams.set('region', state.settings.region || 'NP');
  const requestPath = `${url.pathname}${url.search}`;
  if (state.cache.has(requestPath)) return state.cache.get(requestPath);
  const res = await fetch(requestPath);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  state.cache.set(requestPath, data);
  return data;
}

function resolveTheme(theme = state.settings.theme) {
  if (theme === 'system') return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  return theme === 'light' ? 'light' : 'dark';
}
function currentTheme() { return resolveTheme(state.settings.theme); }
function themeButton() {
  const dark = currentTheme() === 'dark';
  return `<button class="header-icon" id="theme-toggle" title="Switch to ${dark ? 'light' : 'dark'} mode" aria-label="Switch to ${dark ? 'light' : 'dark'} mode" aria-pressed="${dark}">${iconWrap(dark ? 'sun' : 'moon')}</button>`;
}
function applyTheme(theme) {
  state.settings.theme = theme === 'system' ? 'system' : (theme === 'light' ? 'light' : 'dark');
  const resolved = resolveTheme(state.settings.theme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = state.settings.theme;
  safeStorageSet('luma-theme', resolved);
  saveSettings();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#f0ede7' : '#11110f');
  const button = document.querySelector('#theme-toggle');
  if (button) {
    const dark = resolved === 'dark';
    button.innerHTML = iconWrap(dark ? 'sun' : 'moon');
    button.title = `Switch to ${dark ? 'light' : 'dark'} mode`;
    button.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
    button.setAttribute('aria-pressed', String(dark));
  }
  if (typeof applyGradient === 'function') applyGradient();
}
function applySettings() {
  applyTheme(state.settings.theme);
  applyAccent(state.settings.accent);
  applyGradient();
  document.documentElement.dataset.reduceMotion = shouldReduceMotion() ? 'true' : 'false';
  document.documentElement.dataset.imageLogos = state.settings.imageLogos ? 'true' : 'false';
}
function toggleTheme() { applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'); }
const ACCENT_OPTIONS = [
  { value:'sage-ink', label:'Sage / Ink', color:'#91a58b', secondary:'#d2c7a6', ink:'#11150f' },
  { value:'slate-teal', label:'Slate / Teal', color:'#6f8792', secondary:'#86b7aa', ink:'#0b1112' },
  { value:'plum-mauve', label:'Plum / Mauve', color:'#8d748f', secondary:'#bca1b6', ink:'#120d13' },
  { value:'navy-ice', label:'Navy / Ice', color:'#647d9f', secondary:'#a8bdcf', ink:'#0a1018' },
  { value:'forest-sand', label:'Forest / Sand', color:'#718b78', secondary:'#c4b38c', ink:'#0d130f' },
  { value:'terracotta-peach', label:'Terracotta / Peach', color:'#b97868', secondary:'#d8a28e', ink:'#170e0b' },
  { value:'burgundy-blush', label:'Burgundy / Blush', color:'#8d5967', secondary:'#c39aa2', ink:'#160b10' },
  { value:'coffee-copper', label:'Coffee / Copper', color:'#8b7465', secondary:'#bd9a75', ink:'#140f0b' },
  { value:'indigo-lavender', label:'Indigo / Lavender', color:'#7273a7', secondary:'#a7a2c3', ink:'#0e0f16' },
  { value:'ocean-mint', label:'Ocean / Mint', color:'#5f8790', secondary:'#8fb8a9', ink:'#081214' },
  { value:'charcoal-gold', label:'Charcoal / Gold', color:'#74746f', secondary:'#b3a17b', ink:'#12110d' },
  { value:'olive-rose', label:'Olive / Rose', color:'#7d866f', secondary:'#b88b8c', ink:'#10120d' },
  { value:'abyss-bloom', label:'Abyss Bloom', color:'#537db2', secondary:'#936db6', ink:'#09111c' },
  { value:'violet-current', label:'Violet Current', color:'#8b6bd0', secondary:'#d28aa9', ink:'#130c1d' },
  { value:'ember-veil', label:'Ember Veil', color:'#d36f50', secondary:'#bc638b', ink:'#1c0b08' },
  { value:'moss-afterdark', label:'Moss Afterdark', color:'#4c9974', secondary:'#b7a36a', ink:'#07150d' },
  { value:'blue-hour', label:'Blue Hour', color:'#4684bc', secondary:'#57b9bd', ink:'#06131c' },
  { value:'obsidian-rose', label:'Obsidian Rose', color:'#9e5a8d', secondary:'#c78ba0', ink:'#1b0916' },
  { value:'petrol-eclipse', label:'Petrol Eclipse', color:'#349c91', secondary:'#9668b9', ink:'#061613' },
  { value:'copper-night', label:'Copper Night', color:'#bd805b', secondary:'#a96fa7', ink:'#1a100b' },
  { value:'glacier-noir', label:'Glacier Noir', color:'#80b6d2', secondary:'#8293cb', ink:'#08141d' },
  { value:'mulberry-smoke', label:'Mulberry Smoke', color:'#a269b2', secondary:'#c77d9a', ink:'#1b0b1e' },
];
function hexToRgba(hex, alpha) {
  if (!validHexSetting(hex)) return `rgba(145,165,139,${alpha})`;
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${Math.max(0,Math.min(1,alpha))})`;
}
function isLightHex(hex) {
  if (!validHexSetting(hex)) return false;
  const n = Number.parseInt(hex.slice(1), 16);
  const linear = [((n>>16)&255),((n>>8)&255),(n&255)].map(v => { const c=v/255; return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4); });
  return .2126*linear[0]+.7152*linear[1]+.0722*linear[2] > .47;
}
function applyAccent(accent = state.settings.accent) {
  const preset = ACCENT_OPTIONS.find(x => x.value === accent);
  if (preset) {
    state.settings.accent = preset.value;
    state.settings.accentPrimary = preset.color;
    state.settings.accentSecondary = preset.secondary;
  } else {
    state.settings.accent = 'custom';
  }
  const primary = validHexSetting(state.settings.accentPrimary) ? state.settings.accentPrimary : '#91a58b';
  const secondary = validHexSetting(state.settings.accentSecondary) ? state.settings.accentSecondary : '#d2c7a6';
  document.documentElement.dataset.accent = preset ? preset.value : 'custom';
  document.documentElement.style.setProperty('--accent', primary);
  document.documentElement.style.setProperty('--accent-2', secondary);
  document.documentElement.style.setProperty('--accent-ink', isLightHex(primary) ? '#101115' : '#f8f8fc');
  document.documentElement.style.setProperty('--accent-soft', hexToRgba(primary, .15));
  document.documentElement.style.setProperty('--accent-glow', hexToRgba(secondary, .24));
  safeStorageSet('luma-accent', state.settings.accent);
  saveSettings();
}

const GRADIENT_PALETTES = [
  { name:'Abyss Bloom', tags:'blue violet teal midnight ocean', base:'#05070c', c1:'#17345a', c2:'#38204d', c3:'#0e4a43' },
  { name:'Violet Current', tags:'purple plum indigo night', base:'#06050c', c1:'#281744', c2:'#4a1f43', c3:'#142b4d' },
  { name:'Ember Veil', tags:'orange copper red rose fire warm', base:'#090605', c1:'#462014', c2:'#55213c', c3:'#34210f' },
  { name:'Moss Afterdark', tags:'green forest pine earth nature', base:'#050a08', c1:'#15382b', c2:'#293d20', c3:'#29203f' },
  { name:'Blue Hour', tags:'blue cyan petrol aqua sea', base:'#04070d', c1:'#163852', c2:'#26345e', c3:'#0b4a4a' },
  { name:'Obsidian Rose', tags:'pink rose burgundy purple dark', base:'#09060a', c1:'#381b30', c2:'#4d1e3d', c3:'#271c45' },
  { name:'Petrol Eclipse', tags:'teal petrol deep blue green', base:'#03090b', c1:'#124446', c2:'#1f2c53', c3:'#402044' },
  { name:'Copper Night', tags:'copper brown gold amber rust', base:'#090706', c1:'#3d241b', c2:'#2f172d', c3:'#473014' },
  { name:'Glacier Noir', tags:'ice blue cyan steel cold', base:'#04080c', c1:'#173849', c2:'#26314e', c3:'#16413f' },
  { name:'Mulberry Smoke', tags:'berry magenta purple plum', base:'#08050b', c1:'#341b42', c2:'#472238', c3:'#20294b' }
];
const GRADIENT_TEMPOS = [
  { label:'SLOW DRIFT', duration:54, state:'Slowly shifting' },
  { label:'SOFT FLOW', duration:42, state:'Soft flowing motion' },
  { label:'DEEP DRIFT', duration:32, state:'Deeper, faster drift' },
  { label:'QUICK CURRENT', duration:23, state:'Quick current' }
];
function applyGradient() {
  const g = state.settings.gradient || DEFAULT_GRADIENT;
  const root = document.documentElement;
  const theme = currentTheme();
  root.style.setProperty('--ambient-base', theme === 'light' ? '#f4f2ee' : (validHexSetting(g.base) ? g.base : DEFAULT_GRADIENT.base));
  root.style.setProperty('--gradient-c1', validHexSetting(g.c1) ? g.c1 : DEFAULT_GRADIENT.c1);
  root.style.setProperty('--gradient-c2', validHexSetting(g.c2) ? g.c2 : DEFAULT_GRADIENT.c2);
  root.style.setProperty('--gradient-c3', validHexSetting(g.c3) ? g.c3 : DEFAULT_GRADIENT.c3);
  root.style.setProperty('--gradient-intensity', String(Math.max(35, Math.min(100, Number(g.intensity) || 86)) / 100));
  root.style.setProperty('--gradient-duration', `${GRADIENT_TEMPOS[Math.max(0,Math.min(3,Number(g.tempo)||0))].duration}s`);
  root.dataset.gradientMotion = g.motion ? 'on' : 'off';
  root.dataset.gradientActivePalette = g.palette || 'Custom mix';
}
function gradientSettingsMarkup() {
  const g = state.settings.gradient || DEFAULT_GRADIENT;
  const tempoIndex = Math.max(0, Math.min(3, Number(g.tempo) || 0));
  return `<div class="gradient-settings-card">
    <div class="gradient-settings-head"><div><span class="gradient-mini-kicker">Ambient system</span><h3>Gradient background</h3><p>Customize the atmosphere across every LUMA page.</p></div><span class="gradient-current-name" id="gradient-current-name">${escapeHtml(g.palette || 'Custom mix')}</span></div>
    <div class="gradient-palette-search-wrap">
      <div class="liquid-search gradient-palette-search" id="gradient-palette-search">
        <div class="search-goo" aria-hidden="true"><b></b><i></i></div>
        <input id="gradient-palette-input" type="search" placeholder="Search gradient palettes" aria-label="Search gradient palettes" autocomplete="off" spellcheck="false" aria-controls="gradient-palette-results" aria-expanded="false">
        <button class="search-toggle" id="gradient-palette-toggle" type="button" aria-label="Open gradient palette search" aria-expanded="false">${iconWrap('search')}</button>
        <div class="search-results gradient-palette-results" id="gradient-palette-results" role="listbox" aria-label="Gradient palettes" hidden></div>
      </div>
    </div>
    <div class="gradient-colour-list">
      ${[['base','Base colour'],['c1','Colour 01'],['c2','Colour 02'],['c3','Colour 03']].map(([key,label])=>`<label class="gradient-colour-row"><span><strong>${label}</strong><small id="gradient-${key}-hex">${g[key].toUpperCase()}</small></span><input type="color" class="gradient-colour-picker" data-gradient-color="${key}" value="${g[key]}" aria-label="${label}"></label>`).join('')}
    </div>
    <div class="gradient-range-block"><div class="range-head"><label for="gradient-intensity">Gradient intensity</label><output id="gradient-intensity-output">${Number(g.intensity)||86}%</output></div><input id="gradient-intensity" type="range" min="35" max="100" step="1" value="${Number(g.intensity)||86}"><div class="gradient-range-scale"><span>Subtle</span><span>Atmospheric</span><span>Rich</span></div></div>
    <div class="gradient-motion-row"><div><strong>Ambient motion</strong><small id="gradient-motion-label">${g.motion ? GRADIENT_TEMPOS[tempoIndex].state : 'Motion paused'}</small></div><button class="liquid-switch gradient-motion-switch" id="gradient-motion-switch" type="button" role="switch" aria-checked="${Boolean(g.motion)}" aria-label="Toggle animated gradient"><i aria-hidden="true"></i><b aria-hidden="true"></b></button></div>
    <div class="gradient-tempo-block"><div class="gradient-tempo-title"><strong>Movement tempo</strong><span id="gradient-tempo-label">${String(tempoIndex+1).padStart(2,'0')} / ${GRADIENT_TEMPOS[tempoIndex].label}</span></div><div class="tempo-rail" id="gradient-tempo" role="group" aria-label="Choose gradient animation tempo"><div class="indicator-goo" aria-hidden="true"><i class="stretch-trail"></i><i class="stretch-pill"></i></div>${GRADIENT_TEMPOS.map((item,i)=>`<button type="button" data-gradient-tempo="${i}" aria-pressed="${i===tempoIndex}">${['Slow','Flow','Drift','Swift'][i]}</button>`).join('')}</div></div>
    <div class="gradient-settings-foot"><span class="gradient-saved-note" id="gradient-saved-note" role="status">Saved locally</span></div>
  </div>`;
}
function syncGradientControls() {
  const g = state.settings.gradient || DEFAULT_GRADIENT;
  ['base','c1','c2','c3'].forEach(key => {
    const picker = document.querySelector(`[data-gradient-color="${key}"]`);
    const label = document.querySelector(`#gradient-${key}-hex`);
    if (picker) picker.value = g[key];
    if (label) label.textContent = String(g[key]).toUpperCase();
  });
  const intensity = document.querySelector('#gradient-intensity');
  const output = document.querySelector('#gradient-intensity-output');
  if (intensity) intensity.value = String(g.intensity);
  if (output) output.textContent = `${g.intensity}%`;
  const name = document.querySelector('#gradient-current-name');
  if (name) name.textContent = g.palette || 'Custom mix';
  const tempoIndex = Math.max(0,Math.min(3,Number(g.tempo)||0));
  const tempoLabel = document.querySelector('#gradient-tempo-label');
  if (tempoLabel) tempoLabel.textContent = `${String(tempoIndex+1).padStart(2,'0')} / ${GRADIENT_TEMPOS[tempoIndex].label}`;
  const rail = document.querySelector('#gradient-tempo');
  const pill = rail?.querySelector('.stretch-pill');
  const trail = rail?.querySelector('.stretch-trail');
  if (pill) pill.style.left = `${tempoIndex*25}%`;
  if (trail) trail.style.left = `${tempoIndex*25}%`;
  rail?.querySelectorAll('[data-gradient-tempo]').forEach((button,index) => button.setAttribute('aria-pressed',String(index===tempoIndex)));
  const toggle = document.querySelector('#gradient-motion-switch');
  const label = document.querySelector('#gradient-motion-label');
  if (toggle) toggle.setAttribute('aria-checked',String(Boolean(g.motion)));
  if (label) label.textContent = g.motion ? GRADIENT_TEMPOS[tempoIndex].state : 'Motion paused';
  applyGradient();
}
function persistGradient(note = 'Saved locally') {
  saveSettings();
  const status = document.querySelector('#gradient-saved-note');
  if (status) status.textContent = note;
}
function applyGradientPalette(palette) {
  if (!palette) return;
  state.settings.gradient = { ...state.settings.gradient, base:palette.base, c1:palette.c1, c2:palette.c2, c3:palette.c3, palette:palette.name };
  syncGradientControls();
  persistGradient();
  const search = document.querySelector('#gradient-palette-search');
  const input = document.querySelector('#gradient-palette-input');
  const button = document.querySelector('#gradient-palette-toggle');
  const results = document.querySelector('#gradient-palette-results');
  search?.classList.remove('open');
  input?.setAttribute('aria-expanded','false');
  button?.setAttribute('aria-expanded','false');
  button?.setAttribute('aria-label','Open gradient palette search');
  if (results) results.hidden = true;
}
function renderGradientPaletteResults(rawQuery = '') {
  const host = document.querySelector('#gradient-palette-results');
  if (!host) return;
  const q = String(rawQuery || '').trim().toLowerCase();
  const matches = GRADIENT_PALETTES.filter(p => `${p.name} ${p.tags}`.toLowerCase().includes(q));
  host.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement('div'); empty.className = 'gradient-palette-empty'; empty.textContent = 'No palettes found. Try blue, rose or forest.'; host.appendChild(empty); host.hidden = false; return;
  }
  host.innerHTML = matches.map(p => `<button type="button" class="gradient-palette-result" role="option" aria-selected="${state.settings.gradient.palette===p.name}" data-gradient-palette="${escapeHtml(p.name)}"><span class="gradient-palette-swatch" style="--sw-base:${p.base};--sw-a:${p.c1};--sw-b:${p.c2};--sw-c:${p.c3}"></span><span class="gradient-palette-copy"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.tags.split(' ').slice(0,3).join(' / '))}</small></span>${iconWrap('chevron')}</button>`).join('');
  host.hidden = false;
}
function setGradientTempo(index, animate = false) {
  const tempoIndex = Math.max(0,Math.min(3,Number(index)||0));
  state.settings.gradient.tempo = tempoIndex;
  syncGradientControls();
  const pill = document.querySelector('#gradient-tempo .stretch-pill');
  if (animate && pill) {
    pill.classList.remove('stretch'); void pill.offsetWidth; pill.classList.add('stretch');
    clearTimeout(state.gradientStretchTimer);
    state.gradientStretchTimer = setTimeout(() => pill.classList.remove('stretch'), 650);
  }
  persistGradient();
}
function setGradientMotion(on, shouldSave = true) {
  state.settings.gradient.motion = Boolean(on);
  syncGradientControls();
  if (shouldSave) persistGradient();
}
function bindGradientSettings() {
  const paletteSearch = document.querySelector('#gradient-palette-search');
  const paletteInput = document.querySelector('#gradient-palette-input');
  const paletteToggle = document.querySelector('#gradient-palette-toggle');
  const paletteResults = document.querySelector('#gradient-palette-results');
  if (paletteToggle && paletteSearch) paletteToggle.addEventListener('click', () => {
    const open = !paletteSearch.classList.contains('open');
    paletteSearch.classList.toggle('open',open);
    paletteToggle.setAttribute('aria-expanded',String(open));
    paletteToggle.setAttribute('aria-label',open?'Close gradient palette search':'Open gradient palette search');
    paletteInput?.setAttribute('aria-expanded',String(open));
    if (open) { if (paletteResults) paletteResults.hidden = false; renderGradientPaletteResults(paletteInput?.value || ''); paletteInput?.focus({preventScroll:true}); }
    else { if (paletteResults) paletteResults.hidden = true; paletteToggle.focus({preventScroll:true}); }
  });
  paletteInput?.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); paletteSearch?.classList.remove('open'); if (paletteResults) paletteResults.hidden = true; paletteToggle?.setAttribute('aria-expanded','false'); paletteToggle?.focus({preventScroll:true}); }
    if (event.key === 'ArrowDown') { event.preventDefault(); paletteResults?.querySelector('button')?.focus({preventScroll:true}); }
    if (event.key === 'Enter') { event.preventDefault(); const first = paletteResults?.querySelector('button[data-gradient-palette]'); if (first) applyGradientPalette(GRADIENT_PALETTES.find(p=>p.name===first.dataset.gradientPalette)); }
  });
  paletteResults?.addEventListener('keydown', event => {
    const choices = [...paletteResults.querySelectorAll('button[data-gradient-palette]')];
    const i = choices.indexOf(document.activeElement);
    let target = null;
    if (event.key === 'Escape') { event.preventDefault(); paletteSearch?.classList.remove('open'); paletteResults.hidden = true; paletteToggle?.focus({preventScroll:true}); return; }
    if (event.key === 'ArrowDown') target = choices[Math.min(choices.length-1,i+1)];
    if (event.key === 'ArrowUp') target = i <= 0 ? paletteInput : choices[i-1];
    if (event.key === 'Home') target = choices[0];
    if (event.key === 'End') target = choices.at(-1);
    if (target) { event.preventDefault(); target.focus({preventScroll:true}); }
  });
  document.querySelectorAll('[data-gradient-color]').forEach(input => input.addEventListener('input', () => {
    const key = input.dataset.gradientColor;
    state.settings.gradient[key] = validHexSetting(input.value) ? input.value : DEFAULT_GRADIENT[key];
    state.settings.gradient.palette = 'Custom mix';
    syncGradientControls();
    persistGradient();
  }));
  document.querySelector('#gradient-intensity')?.addEventListener('input', event => {
    state.settings.gradient.intensity = Math.max(35,Math.min(100,Number(event.target.value)||86));
    syncGradientControls(); persistGradient();
  });
  renderGradientPaletteResults('');
  if (paletteResults) paletteResults.hidden = true;
}

function nav(active = '') {
  const links = [
    ['home', '/', 'Home', 'home'],
    ['browse', '/browse', 'Browse', 'layers'],
    ['movies', '/movies', 'Movies', 'film'],
    ['tv', '/tv', 'Series', 'tv'],
    ['library', '/my-list', 'My List', 'list'],
  ];
  const activeKey = active === 'history' ? 'library' : active;
  const activeIndex = Math.max(0, links.findIndex(([key]) => key === activeKey));
  const startIndex = Number.isInteger(state.navIndex) ? state.navIndex : activeIndex;
  state.navIndex = activeIndex;
  const currentClass = (key) => activeIndex === links.findIndex(link => link[0] === key) ? 'active' : '';
  requestAnimationFrame(() => document.querySelectorAll('.bottom-liquid-indicator').forEach(indicator => {
    indicator.style.setProperty('--nav-index', String(activeIndex));
    indicator.classList.add('animate');
  }));
  return `<a href="#main-content" class="skip-link">Skip to main content</a>
  <header class="site-header"><div class="header-inner">
    <a class="brand" href="/" data-link aria-label="LUMA home"><span class="brand-mark">L</span><span class="brand-word">LUMA</span></a>
    <div class="header-actions">
      <button class="header-icon" type="button" data-global-search-toggle title="Search" aria-label="Search movies, series and people" aria-haspopup="dialog">${iconWrap('search')}</button>
      <a class="header-icon ${active==='settings'?'active':''}" href="/settings" data-link title="Settings" aria-label="Settings">${iconWrap('settings')}</a>
      ${themeButton()}
    </div>
  </div></header>
  <nav class="bottom-liquid-nav" style="--nav-index:${startIndex}" data-nav-target="${activeIndex}" aria-label="Primary navigation">
    <span class="bottom-liquid-indicator" style="--nav-index:${startIndex}" aria-hidden="true"></span>
    ${links.map(([key,href,label,iconName])=>`<a class="bottom-nav-link ${currentClass(key)}" href="${href}" data-link ${currentClass(key)?'aria-current="page"':''}>${iconWrap(iconName)}<span>${label}</span></a>`).join('')}
  </nav>
  <div class="global-search-scrim" id="global-search-scrim" hidden></div>
  <section class="global-search-panel" id="global-search-panel" role="dialog" aria-modal="true" aria-label="Search LUMA" aria-hidden="true" hidden>
    <div class="global-search-header"><span class="gradient-mini-kicker">Find your next watch</span><button type="button" class="global-search-close" id="global-search-close" aria-label="Close search">${iconWrap('close')}</button></div>
    <div class="liquid-search global-liquid-search" id="global-liquid-search">
      <div class="search-goo" aria-hidden="true"><b></b><i></i></div>
      <label class="sr-only" for="global-search-input">Search movies, series and people</label>
      <input id="global-search-input" type="search" role="combobox" aria-autocomplete="list" aria-controls="global-search-results" aria-expanded="false" placeholder="Search movies, series, actors..." autocomplete="off" spellcheck="false">
    </div>
    <div class="global-search-status" id="global-search-status" role="status" aria-live="polite">Start typing to see movie and series suggestions.</div>
    <div class="search-results global-search-results" id="global-search-results" role="listbox" aria-label="Search suggestions" hidden></div>
  </section>`;
}
function footer() {

  return `<footer class="footer">
    <div class="footer-main">
      <div class="footer-brand-block">
        <a class="footer-brand" href="/" data-link><span class="footer-mark">L</span><span>LUMA</span></a>
        <p>A cinematic discovery interface built around fast browsing, clean metadata and a focused watch flow.</p>
      </div>
      <div class="footer-column"><span class="footer-label">Explore</span><a href="/movies" data-link>Movies</a><a href="/tv" data-link>Series</a><button type="button" class="footer-search-action" data-open-global-search>Search</button></div>
      <div class="footer-column"><span class="footer-label">Library</span><a href="/my-list" data-link>My List</a><a href="/history" data-link>History</a><a href="/about" data-link>About</a></div>
      <div class="footer-note"><span class="footer-label">Data & credits</span><p>LUMA uses the <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">TMDB API</a> for metadata, artwork and provider data. LUMA is not endorsed or certified by TMDB.</p></div>
    </div>
    <div class="footer-bottom"><span>© ${new Date().getFullYear()} LUMA</span><span>Built for discovery</span><button class="footer-top" data-top>Back to top ${iconWrap('arrowUp')}</button></div>
  </footer>`;
}

function card(item, options = {}) {
  const type = mediaType(item);
  const rank = options.rank;
  const image = item.poster || item.posterLarge || item.backdrop || '';
  if (type === 'person') {
    const department = item.known_for_department || 'Cast & crew';
    return `<a class="movie-card person-result-card" href="/person/${Number(item.id)}" data-link aria-label="Open ${escapeHtml(item.title)} profile">
      <div class="poster-wrap">
        ${image ? `<img loading="lazy" decoding="async" src="${image}" alt="${escapeHtml(item.title)} portrait">` : '<div class="poster-fallback">No portrait</div>'}
        <div class="card-hover-info"><div class="card-hover-title">${escapeHtml(item.title)}</div><div class="card-hover-meta">${escapeHtml(department)} · Person</div></div>
        <span class="person-kind">Person</span>
      </div>
      <div class="person-result-name">${escapeHtml(item.title)}</div><div class="person-result-department">${escapeHtml(department)}</div>
    </a>`;
  }
  const sub = `${year(item.release_date)}${item.vote_average ? ` • ${rating(item.vote_average)}` : ''} • ${type === 'tv' ? 'Series' : 'Movie'}`;
  return `<a class="movie-card" href="${detailHref(item)}" data-link aria-label="Open ${escapeHtml(item.title)}">
    ${rank ? `<div class="rank-mark">${String(rank).padStart(2,'0')}</div>` : ''}
    <div class="poster-wrap">
      ${image ? `<img loading="lazy" decoding="async" src="${image}" alt="${escapeHtml(item.title)} poster">` : '<div class="poster-fallback">No artwork</div>'}
      <div class="card-hover-info">
        <div class="card-hover-title">${escapeHtml(item.title)}</div>
        <div class="card-hover-meta">${escapeHtml(sub)}</div>
      </div>
      <span class="card-rating">${iconWrap('star')} ${rating(item.vote_average)}</span>
    </div>
  </a>`;
}
function cards(items = [], limit = 6) { return items.slice(0, limit).map(card).join(''); }
function skeletonCardsMarkup(count = 8) {
  return Array.from({ length: Math.max(1, Math.min(16, count)) }, () => `<div class="skeleton-card" aria-hidden="true"><div class="skeleton skeleton-poster"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div>`).join('');
}
function skeletonRail(title = 'Loading picks') {
  return `<section class="section skeleton-section" aria-busy="true"><div class="section-header"><div><span class="section-kicker">LUMA picks</span><h2>${escapeHtml(title)}</h2></div></div><div class="rail-wrap"><div class="card-row skeleton-row">${skeletonCardsMarkup(7)}</div></div></section>`;
}

function hero(item, index = state.heroIndex, total = state.heroItems.length) {
  const backdrop = item?.backdrop || item?.backdropLarge || item?.posterLarge || item?.poster;
  const canRotate = Array.isArray(state.heroItems) && state.heroItems.length > 1;
  return `<section class="hero" role="region" aria-roledescription="carousel" aria-label="Featured titles" data-rotation-paused="${shouldReduceMotion()}">
    <div class="hero-bg" aria-hidden="true">${backdrop ? `<img src="${escapeHtml(backdrop)}" alt="" decoding="async" fetchpriority="high">` : ''}</div><div class="hero-overlay"></div>
    <div class="hero-content" aria-live="off">
      <span class="eyebrow">Featured title${canRotate ? ` <span class="hero-count">${index + 1} / ${total}</span>` : ''}</span>
      <h1>${escapeHtml(item?.title || 'Find something worth watching.')}</h1>
      <div class="meta-row"><span>${year(item?.release_date)}</span><span class="dot"></span><span>${item?.media_type==='tv'?'Series':'Movie'}</span><span class="dot"></span><span>${iconWrap('star')} ${rating(item?.vote_average)}</span></div>
      <p class="hero-copy">${escapeHtml(item?.overview || 'Fresh titles, ready to discover.')}</p>
      <div class="hero-actions"><a class="btn primary" href="${item ? `/watch/${mediaType(item)}/${item.id}` : '/movies'}" data-link>${iconWrap('play')} Watch now</a>${item ? `<a class="btn secondary" href="${detailHref(item)}" data-link>${iconWrap('info')} More info</a>` : ''}</div>
    </div>
  </section>`;
}
function railKey(title) { return `rail-${String(title).toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${Math.random().toString(36).slice(2,7)}`; }
function railControls(id, href) {
  return `<div class="rail-tools">
    <button class="rail-btn" type="button" data-row-scroll="${id}" data-scroll-dir="-1" aria-label="Previous">${iconWrap('left')}</button>
    <button class="rail-btn" type="button" data-row-scroll="${id}" data-scroll-dir="1" aria-label="Next">${iconWrap('right')}</button>
    ${href ? `<a class="section-link" href="${href}" data-link>View all ${iconWrap('chevron')}</a>` : ''}
  </div>`;
}
function section(title, items, href, limit = 6) {
  if (!items?.length) return '';
  const id = railKey(title);
  return `<section class="section"><div class="section-header"><div><span class="section-kicker">LUMA picks</span><h2>${escapeHtml(title)}</h2></div>${railControls(id, href)}</div><div class="rail-wrap"><div id="${id}" class="card-row">${cards(items, limit)}</div></div></section>`;
}
function topTen(items) {
  if (!items?.length) return '';
  const id = railKey('top-10');
  const list = items.slice(0,10).map((item, i) => card(item, { rank: i + 1 })).join('');
  return `<section class="section top-ten-section"><div class="section-header"><div><span class="section-kicker">Daily ranking</span><h2>Top 10 today</h2></div>${railControls(id, '/movies?sort=popularity.desc')}</div><div class="rail-wrap"><div id="${id}" class="rank-row">${list}</div></div></section>`;
}
function providerBrand(name = '') {
  const value = String(name).toLowerCase();
  if (value.includes('netflix')) return 'netflix';
  if (value.includes('prime video') || value.includes('amazon prime')) return 'prime';
  if (value.includes('amc+')) return 'amc';
  if (value.includes('apple tv')) return 'apple';
  if (value.includes('crunchyroll')) return 'crunchyroll';
  if (value.includes('disney')) return 'disney';
  if (value.includes('hulu')) return 'hulu';
  if (value.includes('max') || value.includes('hbo')) return 'max';
  if (value.includes('paramount')) return 'paramount';
  if (value.includes('peacock')) return 'peacock';
  return 'generic';
}
const BUILT_IN_PROVIDERS = [
  { provider_id: 8, provider_name: 'Netflix', logo: '/assets/provider-logos/netflix.svg', display_priority: 1 },
  { provider_id: 9, provider_name: 'Prime Video', logo: '/assets/provider-logos/prime-video.svg', display_priority: 2 },
  { provider_id: 526, provider_name: 'AMC+', logo: '/assets/provider-logos/amc-plus.svg', display_priority: 3 },
  { provider_id: 350, provider_name: 'Apple TV+', logo: '/assets/provider-logos/apple-tv-plus.svg', display_priority: 4 },
  { provider_id: 283, provider_name: 'Crunchyroll', logo: '/assets/provider-logos/crunchyroll.svg', display_priority: 5 },
  { provider_id: 337, provider_name: 'Disney+', logo: '/assets/provider-logos/disney-plus.svg', display_priority: 6 },
  { provider_id: 15, provider_name: 'Hulu', logo: '/assets/provider-logos/hulu.svg', display_priority: 7 },
  { provider_id: 1899, provider_name: 'Max', logo: '/assets/provider-logos/max.svg', display_priority: 8 },
  { provider_id: 531, provider_name: 'Paramount+', logo: '/assets/provider-logos/paramount-plus.svg', display_priority: 9 },
  { provider_id: 386, provider_name: 'Peacock', logo: '/assets/provider-logos/peacock.svg', display_priority: 10 },
];
function mergeProviderLists(...lists) {
  const result = [];
  const seenIds = new Set();
  const seenBrands = new Set();
  for (const provider of lists.flat()) {
    if (!provider || !Number.isFinite(Number(provider.provider_id)) || !provider.provider_name) continue;
    const id = Number(provider.provider_id);
    const brand = providerBrand(provider.provider_name);
    const nameKey = String(provider.provider_name).trim().toLowerCase();
    if (seenIds.has(id) || (brand !== 'generic' ? seenBrands.has(brand) : result.some(item => String(item.provider_name).trim().toLowerCase() === nameKey))) continue;
    seenIds.add(id);
    if (brand !== 'generic') seenBrands.add(brand);
    result.push({ ...provider, provider_id: id });
  }
  for (const provider of BUILT_IN_PROVIDERS) {
    const brand = providerBrand(provider.provider_name);
    if (seenIds.has(provider.provider_id) || seenBrands.has(brand)) continue;
    seenIds.add(provider.provider_id);
    seenBrands.add(brand);
    result.push({ ...provider });
  }
  return result.sort((a, b) => Number(a.display_priority ?? 999) - Number(b.display_priority ?? 999));
}
function providerRow(providers = []) {
  providers = mergeProviderLists(providers);
  const id = railKey('providers');
  // Prefer crisp, transparent local wordmarks for the brands shown in the homepage
  // carousel. TMDB's provider logo_path is usually a square icon and would make the
  // wide, text-only logos look tiny or like they had disappeared.
  const localLogoByBrand = new Map(BUILT_IN_PROVIDERS.map(item => [providerBrand(item.provider_name), item.logo]));
  return `<section class="provider-section" aria-label="Streaming provider selector"><div class="section-header"><div><span class="section-kicker">Browse by provider</span><h2>Studios &amp; Platforms</h2></div>${railControls(id, '/movies')}</div><div class="rail-wrap"><div id="${id}" class="provider-row">${providers.map(p => {
    const brand = providerBrand(p.provider_name);
    const logo = localLogoByBrand.get(brand) || p.logo;
    const providerId = Number(p.provider_id);
    return `<a class="provider-tile provider-${providerBrand(p.provider_name)}" href="/movies?provider=${providerId}" data-link data-provider-browse="${providerId}" title="Browse movies on ${escapeHtml(p.provider_name)}" aria-label="Browse movies on ${escapeHtml(p.provider_name)}"><span class="provider-logo-frame">${logo ? `<img src="${escapeHtml(logo)}" loading="lazy" decoding="async" alt="${escapeHtml(p.provider_name)} logo">` : `<span class="provider-initials">${escapeHtml(p.provider_name).slice(0,2).toUpperCase()}</span>`}</span><strong>${escapeHtml(p.provider_name)}</strong></a>`;
  }).join('')}</div></div></section>`;
}
function providerCatalogSwitch(providerId, isTv, providers = []) {
  const id = Number(providerId);
  if (!Number.isSafeInteger(id) || id <= 0) return '';
  const provider = mergeProviderLists(providers).find(item => Number(item.provider_id) === id);
  const name = provider?.provider_name || `provider ${id}`;
  const moviesHref = `/movies?provider=${id}`;
  const seriesHref = `/tv?provider=${id}`;
  return `<nav class="provider-catalog-switch" aria-label="Browse ${escapeHtml(name)} catalogue"><span class="provider-catalog-label">Browsing ${escapeHtml(name)}</span><a class="provider-catalog-tab ${!isTv ? 'active' : ''}" href="${moviesHref}" data-link ${!isTv ? 'aria-current="page"' : ''}>Movies</a><a class="provider-catalog-tab ${isTv ? 'active' : ''}" href="${seriesHref}" data-link ${isTv ? 'aria-current="page"' : ''}>Series</a><a class="provider-catalog-clear" href="${isTv ? '/tv' : '/movies'}" data-link>Clear provider</a></nav>`;
}
function formatSeasonLabel(season) {
  const number = Math.max(0, Number(season?.season_number) || 0);
  const raw = String(season?.name || '').trim();
  const pattern = raw.match(/^season[\s_-]*(\d+(?:\.\d+)?)$/i);
  if (pattern) return `Season ${Math.max(0, Math.trunc(Number(pattern[1]) || number))}`;
  return raw || `Season ${number}`;
}
function continueWatchingSection() {
  // Older history entries may predate watchPath/resume metadata. Build their route
  // from the saved media type and episode so existing watch history remains visible.
  const entries = state.history.filter(entry => {
    if (!entry || !Number.isFinite(Number(entry.id)) || !(entry.title || entry.name)) return false;
    const progress = Number(entry.progress);
    return !Number.isFinite(progress) || progress < 96;
  }).slice(0, 10);
  if (!entries.length) {
    return `<section class="section continue-watching-section"><div class="section-header"><div><span class="section-kicker">Pick up where you left off</span><h2>Continue watching</h2></div></div><div class="continue-watching-empty"><span class="continue-empty-icon">${iconWrap('play')}</span><div><strong>Your next watch belongs here.</strong><p>Start a movie or episode and LUMA will keep your place here.</p></div><div class="continue-empty-actions"><a class="btn btn-secondary" href="/movies" data-link>Explore movies</a><a class="btn btn-secondary" href="/tv" data-link>Explore series</a></div></div></section>`;
  }
  const id = railKey('continue-watching');
  const cardsMarkup = entries.map(entry => {
    const type = entry.media_type === 'tv' ? 'tv' : 'movie';
    const season = Math.max(1, Number(entry.season) || 1);
    const episode = Math.max(1, Number(entry.episode) || 1);
    const href = watchPathFor(type, entry.id, season, episode);
    const progress = Math.max(0, Math.min(100, Number(entry.progress) || 0));
    const duration = Number(entry.duration) || 0;
    const position = Number(entry.resumeSeconds) || 0;
    const remaining = duration > position && position > 0 ? `${formatMinutes(Math.max(1, Math.ceil((duration - position) / 60)))} left` : '';
    const secondary = [type === 'tv' ? `Season ${season} · Episode ${episode}` : '', remaining || (progress > 0 ? `${Math.round(progress)}% watched` : 'Ready to resume')].filter(Boolean).join(' · ');
    const image = entry.poster || '';
    return `<a class="movie-card continue-card" href="${href}" data-link aria-label="Continue watching ${escapeHtml(entry.title)}${type === 'tv' ? ` season ${season}, episode ${episode}` : ''}"><div class="poster-wrap continue-poster-wrap">${image ? `<img loading="lazy" decoding="async" src="${escapeHtml(image)}" alt="${escapeHtml(entry.title)} poster">` : `<div class="poster-fallback">No artwork</div>`}<span class="continue-progress-track" aria-label="${Math.round(progress)} percent watched"><i style="width:${progress}%"></i></span><span class="continue-play">${iconWrap('play')}</span></div><div class="continue-card-copy"><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(secondary)}</span></div></a>`;
  }).join('');
  return `<section class="section continue-watching-section"><div class="section-header"><div><span class="section-kicker">Pick up where you left off</span><h2>Continue watching</h2></div>${railControls(id, '/history')}</div><div class="rail-wrap"><div id="${id}" class="card-row continue-row">${cardsMarkup}</div></div></section>`;
}
function bindRails() {
  document.querySelectorAll('.card-row,.rank-row,.provider-row').forEach(row => {
    row.addEventListener('scroll', () => updateRailButtons(row));
    updateRailButtons(row);
  });
}
function updateRailButtons(row) {
  const parent = row.closest('.section, .provider-section')?.querySelector('.section-header');
  if (!parent) return;
  const buttons = parent.querySelectorAll(`[data-row-scroll="${row.id}"]`);
  if (!buttons.length) return;
  const left = row.scrollLeft <= 4;
  const right = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
  buttons.forEach(btn => {
    if (btn.dataset.scrollDir === '-1') btn.disabled = left;
    else btn.disabled = right;
  });
}
function stopHeroCarousel() { if (state.heroTimer) clearInterval(state.heroTimer); state.heroTimer = null; }
function shouldReduceMotion() {
  return Boolean(state.settings.reduceMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}
function syncHeroControls() {
  const host = document.querySelector('.hero');
  if (!host) return;
  host.dataset.rotationPaused = String(state.heroPaused || shouldReduceMotion());
  const button = host.querySelector('[data-hero-toggle]');
  if (button) {
    const rotationPaused = state.heroPaused || shouldReduceMotion();
    button.setAttribute('aria-pressed', String(rotationPaused));
    button.setAttribute('aria-label', `${rotationPaused ? 'Resume' : 'Pause'} featured title rotation`);
    button.innerHTML = `${iconWrap(rotationPaused ? 'play' : 'pause')}<span>${rotationPaused ? 'Resume' : 'Pause'}</span>`;
    button.disabled = shouldReduceMotion();
    if (button.disabled) button.title = 'Disabled by Reduce Motion'; else button.removeAttribute('title');
  }
}
function bindHeroInteractions(host) {
  if (!host) return;
  host.addEventListener('focusin', () => stopHeroCarousel());
  host.addEventListener('focusout', event => {
    if (!host.contains(event.relatedTarget) && !shouldReduceMotion() && !document.hidden) startHeroCarousel();
  });
}
function showHeroSlide(index, { restart = true, focusSelector = null } = {}) {
  if (!state.heroItems.length) return;
  state.heroIndex = ((Number(index) % state.heroItems.length) + state.heroItems.length) % state.heroItems.length;
  const current = state.heroItems[state.heroIndex];
  const oldHero = document.querySelector('.hero');
  if (!oldHero || !current) return;
  const holder = document.createElement('div');
  holder.innerHTML = hero(current, state.heroIndex, state.heroItems.length);
  const newHero = holder.firstElementChild;
  if (!newHero) return;
  oldHero.replaceWith(newHero);
  bindHeroInteractions(newHero);
  syncHeroControls();
  if (focusSelector) newHero.querySelector(focusSelector)?.focus({ preventScroll: true });
  if (restart) startHeroCarousel();
}
function startHeroCarousel(items = state.heroItems) {
  stopHeroCarousel();
  if (!items || items.length < 2 || shouldReduceMotion() || document.hidden || document.querySelector('.hero')?.matches(':focus-within')) return;
  state.heroTimer = setInterval(() => {
    if (!document.querySelector('.hero')) return stopHeroCarousel();
    if (document.querySelector('.hero')?.matches(':focus-within')) return stopHeroCarousel();
    showHeroSlide(state.heroIndex + 1, { restart: false });
  }, 6800);
}

async function renderHome() {
  const renderSequence = state.renderSequence;
  stopHeroCarousel();
  app.innerHTML = `${nav('home')}<main id="main-content" tabindex="-1" class="page" aria-busy="true"><section class="hero hero-loading"><div class="hero-content"><div class="skeleton hero-skeleton-kicker"></div><div class="skeleton hero-skeleton-title"></div><div class="skeleton hero-skeleton-copy"></div><div class="skeleton hero-skeleton-actions"></div></div></section>${skeletonRail('Finding your next favorite')}${skeletonRail('Popular this week')}</main>`;
  try {
    const [homeData, mergedProviderData] = await Promise.all([
      api('/api/home'),
      api('/api/providers').catch(() => []),
    ]);
    state.home = homeData;
    const mergedProviders = Array.isArray(mergedProviderData) ? mergedProviderData : [];
    state.home.providers = mergeProviderLists(mergedProviders, Array.isArray(state.home.providers) ? state.home.providers : []);
    if (renderSequence !== state.renderSequence) return;
    const leadSet = (state.home.newReleases?.results || []).filter(x => x?.backdropLarge || x?.posterLarge);
    const fallback = state.home.trending.results.filter(x => x?.backdropLarge);
    state.heroItems = leadSet.length ? leadSet : fallback;
    state.heroIndex = Math.floor(Math.random() * Math.max(state.heroItems.length, 1));
    state.heroPaused = false;
    state.heroHoverPaused = false;
    const lead = state.heroItems[state.heroIndex];
    setPageMetadata({ title: 'Discover Movies & TV', description: 'Explore trending movies, popular series, top-rated picks and new releases with LUMA Stream.', image: lead?.backdrop || lead?.backdropLarge || null, path: '/', robots: 'index,follow', preloadImage: Boolean(lead?.backdrop || lead?.backdropLarge) });
    app.innerHTML = `${nav('home')}<main id="main-content" tabindex="-1" class="page">${hero(lead, state.heroIndex, state.heroItems.length)}${continueWatchingSection()}${providerRow(state.home.providers)}${section('Trending today', state.home.trending.results, '/movies?sort=popularity.desc', 8)}${topTen(state.home.trending.results)}${section('Popular movies', state.home.movies.results, '/movies?sort=popularity.desc', 8)}${section('Top rated', state.home.topMovies.results, '/movies?sort=vote_average.desc', 8)}${section('Popular series', state.home.tv.results, '/tv?sort=popularity.desc', 8)}${section('Top rated series', state.home.topTv.results, '/tv?sort=vote_average.desc', 8)}${footer()}</main>`;
    bindHeroInteractions(document.querySelector('.hero'));
    startHeroCarousel(state.heroItems);
    bindRails();
  } catch (e) {
    // Keep the homepage's persistent discovery sections available when the catalogue API
    // is unconfigured or temporarily unreachable. Provider wordmarks are local assets.
    if (renderSequence !== state.renderSequence) return;
    const empty = () => ({ results: [] });
    state.home = {
      trending: empty(), movies: empty(), tv: empty(), topMovies: empty(), topTv: empty(),
      newReleases: empty(), providers: mergeProviderLists(),
    };
    state.heroItems = [];
    state.heroIndex = 0;
    state.heroPaused = false;
    state.heroHoverPaused = false;
    setPageMetadata({ title: 'Discover Movies & TV', description: 'Explore movies, series and streaming platforms with LUMA Stream.', path: '/', robots: 'index,follow' });
    app.innerHTML = `${nav('home')}<main id="main-content" tabindex="-1" class="page">${hero(undefined, 0, 0)}${continueWatchingSection()}${providerRow(state.home.providers)}<p class="catalogue-unavailable" role="status">The live catalogue is temporarily unavailable. Your homepage sections and provider shortcuts are still available.</p>${footer()}</main>`;
    bindHeroInteractions(document.querySelector('.hero'));
    bindRails();
  }
}

async function renderBrowse() {
  app.innerHTML = `${nav('browse')}<main id="main-content" tabindex="-1" class="page-shell page"><div class="page-top"><div><span class="eyebrow">Browse</span><h1 class="page-title">Everything in one place.</h1><p class="page-intro">Jump straight into movies, series, top rated titles or provider-based discovery.</p></div></div><div class="browse-grid"><a class="browse-tile browse-wide" href="/movies?sort=popularity.desc" data-link><span class="section-kicker">Catalogue</span><strong>Movies</strong><span>New releases, popular titles and deep cuts.</span>${iconWrap('film')}</a><a class="browse-tile" href="/tv?sort=popularity.desc" data-link><span class="section-kicker">Catalogue</span><strong>Series</strong><span>Current shows and long-form stories.</span>${iconWrap('tv')}</a><a class="browse-tile" href="/movies?sort=vote_average.desc" data-link><span class="section-kicker">Curated</span><strong>Top rated</strong><span>Highly rated movies from TMDB.</span>${iconWrap('star')}</a><button type="button" class="browse-tile" data-open-global-search><span class="section-kicker">Find something</span><strong>Search</strong><span>Look up titles, actors and more.</span>${iconWrap('search')}</button></div>${footer()}</main>`;
}

function filterDropdown(key, label, options, current) {
  const currentLabel = options.find(o => String(o.value) === String(current))?.label || label;
  const accessibleLabel = ({ sort: 'Sort results', genre: 'Filter by genre', provider: 'Filter by provider', year: 'Filter by year', min_rating: 'Filter by minimum rating', min_votes: 'Filter by minimum vote count' })[key] || label;
  return `<div class="filter-control"><button type="button" class="filter-select" data-filter-select="${key}" aria-label="${escapeHtml(accessibleLabel)}: ${escapeHtml(currentLabel)}" aria-haspopup="listbox" aria-controls="filter-menu-${key}" aria-expanded="false"><span>${escapeHtml(currentLabel)}</span>${iconWrap('chevronDown')}</button><div id="filter-menu-${key}" class="filter-menu" data-filter-menu="${key}" role="listbox" aria-label="${escapeHtml(accessibleLabel)} options" tabindex="-1">${options.map(o=>`<button type="button" role="option" aria-selected="${String(o.value)===String(current)}" tabindex="-1" data-filter-option="${key}" data-value="${escapeHtml(String(o.value))}" class="${String(o.value)===String(current)?'active':''}">${o.icon?iconWrap(o.icon):''}<span>${escapeHtml(o.label)}</span></button>`).join('')}</div></div>`;
}
function catalogRoute(type) { return type === 'tv' ? '/tv' : '/movies'; }
function queryHref(path, params, page) {
  const next = new URLSearchParams(params);
  if (page <= 1) next.delete('page'); else next.set('page', String(page));
  const query = next.toString();
  return query ? `${path}?${query}` : path;
}
function paginationMarkup(path, params, page, totalPages, totalResults) {
  const maxPage = Math.max(1, Math.min(500, Number(totalPages) || 1));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), maxPage);
  const prev = currentPage > 1 ? `<a class="pagination-button" href="${queryHref(path, params, currentPage - 1)}" data-link rel="prev">Previous</a>` : '<span class="pagination-button disabled" aria-disabled="true">Previous</span>';
  const next = currentPage < maxPage ? `<a class="pagination-button" href="${queryHref(path, params, currentPage + 1)}" data-link rel="next">Next</a>` : '<span class="pagination-button disabled" aria-disabled="true">Next</span>';
  return `<nav class="catalog-pagination" aria-label="Pagination"><span class="pagination-status">Page ${currentPage} of ${maxPage}${Number.isFinite(Number(totalResults)) ? ` · ${Number(totalResults).toLocaleString()} results` : ''}</span><div class="pagination-actions">${prev}${next}</div></nav>`;
}
function usableItems(items, allowedTypes) {
  return (Array.isArray(items) ? items : []).filter(item => item && item.adult !== true
    && Number.isSafeInteger(Number(item.id)) && Number(item.id) > 0
    && typeof (item.title || item.name) === 'string' && String(item.title || item.name).trim().length > 0
    && (!allowedTypes || allowedTypes.includes(item.media_type)));
}
function rankSearchResults(items, query) {
  const normalizedQuery = String(query || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const score = item => {
    const title = String(item.title || item.name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const match = title === normalizedQuery ? 1000 : title.startsWith(normalizedQuery) ? 700 : title.includes(normalizedQuery) ? 400 : 0;
    const completeness = item.poster || item.profile || item.posterLarge ? 12 : 0;
    const votes = Math.min(50, Math.log10(Number(item.vote_count || 0) + 1) * 10);
    return match + Math.min(100, Number(item.popularity || 0)) + Number(item.vote_average || 0) * 2 + votes + completeness;
  };
  return usableItems(items, ['movie', 'tv', 'person']).sort((a,b) => score(b) - score(a));
}
function bindFilterDropdowns(type) {
  document.querySelectorAll('[data-filter-select]').forEach(btn=>btn.addEventListener('click',()=>toggleAccessibleDropdown(btn)));
  document.querySelectorAll('[data-filter-option]').forEach(btn=>btn.addEventListener('click',()=>{
    const qs=new URLSearchParams(location.search); const key=btn.dataset.filterOption; const value=btn.dataset.value;
    const queryKeys = { sort:'sort', genre:'genre', provider:'provider', year:'year', min_rating:'min_rating', min_votes:'min_votes' };
    const queryKey = queryKeys[key];
    if (queryKey) { if (value) qs.set(queryKey,value); else qs.delete(queryKey); }
    qs.delete('page'); navigate(queryHref(catalogRoute(type), qs, 1));
  }));
}

async function renderCatalog(type) {
  const renderSequence = state.renderSequence;
  const isTv = type === 'tv';
  const path = catalogRoute(type);
  const qs = new URLSearchParams(location.search);
  const sort = qs.get('sort') || 'popularity.desc';
  const genre = qs.get('genre') || '';
  const provider = qs.get('provider') || '';
  const selectedYear = qs.get('year') || '';
  const minRating = qs.get('min_rating') || '';
  const minVotes = qs.get('min_votes') || (sort.startsWith('vote_average') ? '50' : '');
  const page = Math.min(500, Math.max(1, Number.parseInt(qs.get('page') || '1', 10) || 1));
  app.innerHTML = `${nav(isTv ? 'tv' : 'movies')}<main id="main-content" tabindex="-1" class="page-shell page"><div class="catalog-hero"><div class="catalog-heading"><span class="eyebrow">Browse</span><h1 class="page-title">${isTv ? 'TV Series' : 'Movies'}</h1><p class="page-intro">Browse by genre, year, rating, popularity and provider.</p><div id="provider-catalog-switch-host"></div></div><div id="catalog-filters" class="filter-bar"><div class="filter-control filter-loading">Loading filters…</div></div></div><div id="catalog-summary" class="catalog-summary" aria-live="polite"></div><div id="catalog" class="grid" aria-busy="true">${skeletonCardsMarkup(12)}</div><div id="catalog-pagination"></div>${footer()}</main>`;
  try {
    const [genres, providers] = await Promise.all([
      api(`/api/genres/${isTv?'tv':'movie'}`),
      api('/api/providers').catch(() => [])
    ]);
    if (renderSequence !== state.renderSequence) return;
    const sortOptions = [
      {value:'popularity.desc',label:'Popular',icon:'star'},
      {value:'vote_average.desc',label:'Top Rated',icon:'star'},
      {value:isTv?'first_air_date.desc':'primary_release_date.desc',label:'Newest',icon:'calendar'}
    ];
    const genreOptions = [{value:'',label:'All Genres'}].concat((genres.genres||[]).map(g=>({value:g.id,label:g.name})));
    const mergedProviders = mergeProviderLists(Array.isArray(providers) ? providers : []);
    const providerOptions = [{value:'',label:'All Providers'}].concat(mergedProviders.map(p=>({value:p.provider_id,label:p.provider_name})));
    const providerSwitchHost = document.querySelector('#provider-catalog-switch-host');
    if (providerSwitchHost) providerSwitchHost.innerHTML = providerCatalogSwitch(provider, isTv, mergedProviders);
    const currentYear = new Date().getFullYear();
    const yearOptions = [{value:'',label:'Any Year'}].concat(Array.from({length: currentYear - 1899 + 3}, (_,i)=>currentYear+3-i).filter(y=>y>=1900).map(y=>({value:y,label:String(y)})));
    const ratingOptions = [{value:'',label:'Any Rating'}, ...[5,6,7,8,9].map(v=>({value:v,label:`${v}.0+ Rating`}))];
    const voteOptions = [{value:'0',label:'Any Votes'}, ...[50,100,500,1000].map(v=>({value:v,label:`${v.toLocaleString()}+ Votes`}))];
    document.querySelector('#catalog-filters').innerHTML = `${filterDropdown('sort','Popular',sortOptions,sort)}${filterDropdown('genre','All Genres',genreOptions,genre)}${filterDropdown('year','Any Year',yearOptions,selectedYear)}${filterDropdown('min_rating','Any Rating',ratingOptions,minRating)}${filterDropdown('min_votes','Any Votes',voteOptions,minVotes)}${filterDropdown('provider','All Providers',providerOptions,provider)}`;
    bindFilterDropdowns(type);
    const apiParams = new URLSearchParams({ sort_by: sort, page: String(page) });
    if (genre) apiParams.set('with_genres', genre);
    if (provider) apiParams.set('provider', provider);
    if (selectedYear) apiParams.set('year', selectedYear);
    if (minRating) apiParams.set('min_rating', minRating);
    if (minVotes) apiParams.set('min_votes', minVotes);
    const data = await api(`/api/discover/${type}?${apiParams.toString()}`);
    if (renderSequence !== state.renderSequence) return;
    const items = usableItems(data.results, [type]);
    const totalPages = Math.max(1, Math.min(500, Number(data.total_pages) || 1));
    if (page > totalPages) { navigate(queryHref(path, qs, totalPages)); return; }
    document.querySelector('#catalog-summary').textContent = `${Number(data.total_results || items.length).toLocaleString()} titles found`;
    document.querySelector('#catalog').innerHTML = items.length ? items.map(card).join('') : '<div class="empty" style="grid-column:1/-1">No matching titles. Try removing a filter or lowering the minimum rating.</div>';
    document.querySelector('#catalog').setAttribute('aria-busy', 'false');
    document.querySelector('#catalog-pagination').innerHTML = paginationMarkup(path, qs, page, totalPages, data.total_results || items.length);
    bindRails();
  } catch (e) {
    if (renderSequence !== state.renderSequence) return;
    const host = document.querySelector('#catalog');
    if (host) { host.innerHTML = `<div class="empty" style="grid-column:1/-1">${escapeHtml(e.message)}</div>`; host.setAttribute('aria-busy', 'false'); }
  }
}

function openGlobalSearch(query = '', opener = null) {
  const panel = document.querySelector('#global-search-panel');
  const scrim = document.querySelector('#global-search-scrim');
  const input = document.querySelector('#global-search-input');
  const liquid = document.querySelector('#global-liquid-search');
  if (!panel || !scrim || !input) return;
  clearTimeout(state.globalSearchCloseTimer);
  if (!panel.classList.contains('open')) state.globalSearchReturnFocus = document.activeElement;
  panel.hidden = false;
  scrim.hidden = false;
  // Anchor the collapsed panel to the control that opened it. The panel keeps its final
  // dimensions while scaled down, so its transform can expand from this exact point.
  const morphSource = opener || (state.globalSearchReturnFocus instanceof Element && state.globalSearchReturnFocus.matches('[data-global-search-toggle],[data-open-global-search]') ? state.globalSearchReturnFocus : null) || document.querySelector('[data-global-search-toggle]');
  if (morphSource?.getBoundingClientRect) {
    const sourceRect = morphSource.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || Math.min(730, window.innerWidth - 28);
    const panelLeft = Math.max(0, (window.innerWidth - panelWidth) / 2);
    const panelTop = Number.parseFloat(getComputedStyle(panel).top) || 78;
    panel.style.setProperty('--morph-origin-x', `${sourceRect.left + sourceRect.width / 2 - panelLeft}px`);
    panel.style.setProperty('--morph-origin-y', `${sourceRect.top + sourceRect.height / 2 - panelTop}px`);
  }
  liquid?.classList.add('open');
  input.setAttribute('aria-expanded', 'false');
  requestAnimationFrame(() => { panel.classList.add('open'); scrim.classList.add('open'); panel.setAttribute('aria-hidden','false'); input.value = String(query || ''); input.focus({preventScroll:true}); });
  if (query) runGlobalSearch(query); else {
    const results = document.querySelector('#global-search-results');
    if (results) { results.hidden = true; results.replaceChildren(); }
    const status = document.querySelector('#global-search-status');
    if (status) status.textContent = 'Start typing to see movie and series suggestions.';
  }
}
function closeGlobalSearch({ restoreFocus = true } = {}) {
  const panel = document.querySelector('#global-search-panel');
  const scrim = document.querySelector('#global-search-scrim');
  if (!panel || !scrim) return;
  clearTimeout(state.globalSearchTimer);
  panel.classList.remove('open'); scrim.classList.remove('open');
  document.querySelector('#global-liquid-search')?.classList.remove('open');
  const input = document.querySelector('#global-search-input');
  input?.setAttribute('aria-expanded', 'false');
  panel.setAttribute('aria-hidden','true');
  const seq = ++state.globalSearchSequence;
  state.globalSearchCloseTimer = window.setTimeout(() => {
    if (seq !== state.globalSearchSequence) return;
    panel.hidden = true; scrim.hidden = true;
  }, 690);
  if (restoreFocus) {
    const fallbackFocus = document.querySelector('[data-global-search-toggle]');
    const targetFocus = state.globalSearchReturnFocus?.isConnected ? state.globalSearchReturnFocus : fallbackFocus;
    targetFocus?.focus({preventScroll:true});
  }
  state.globalSearchReturnFocus = null;
}
function globalSearchResult(item) {
  const type = mediaType(item);
  const href = type === 'person' ? `/person/${Number(item.id)}` : detailHref(item);
  const image = item.poster || item.profile || item.posterLarge || '/assets/poster-fallback.svg';
  const subtype = type === 'person' ? (item.known_for_department || 'Cast and crew') : `${year(item.release_date)}${item.vote_average ? ` · ★ ${rating(item.vote_average)}` : ''} · ${type === 'tv' ? 'Series' : 'Movie'}`;
  return `<a class="global-search-item" role="option" tabindex="-1" href="${href}" data-link data-force-page="true" aria-label="Open ${escapeHtml(item.title)} ${type==='person'?'profile':'details'}"><img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async"><span class="global-search-item-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(subtype)}</small></span><span class="global-search-type">${type==='person'?'Person':type==='tv'?'Series':'Movie'}</span>${iconWrap('chevron')}</a>`;
}
function runGlobalSearch(rawQuery) {
  const query = String(rawQuery || '').trim();
  const input = document.querySelector('#global-search-input');
  const resultsHost = document.querySelector('#global-search-results');
  const status = document.querySelector('#global-search-status');
  if (!resultsHost || !status || !input) return;
  clearTimeout(state.globalSearchTimer);
  const sequence = ++state.globalSearchSequence;
  input.setAttribute('aria-expanded', query.length >= 2 ? 'true' : 'false');
  if (query.length < 2) { resultsHost.hidden = true; resultsHost.replaceChildren(); status.textContent = 'Type at least two characters to search.'; return; }
  status.textContent = 'Finding matching titles...';
  resultsHost.hidden = false;
  resultsHost.innerHTML = '<div class="global-search-loading"><span class="loading-orb"></span>Searching the catalogue</div>';
  state.globalSearchTimer = window.setTimeout(async () => {
    try {
      const data = await api(`/api/search?query=${encodeURIComponent(query)}&page=1`);
      if (sequence !== state.globalSearchSequence || !document.querySelector('#global-search-panel')?.classList.contains('open')) return;
      const items = rankSearchResults(usableItems(data.results, ['movie','tv','person']), query).slice(0, 8);
      resultsHost.innerHTML = items.length ? items.map(globalSearchResult).join('') : '<div class="global-search-empty">No matching titles. Try a shorter or different name.</div>';
      resultsHost.hidden = false;
      status.textContent = items.length ? `${items.length} suggestions found` : 'No suggestions found';
      input.setAttribute('aria-expanded', 'true');
    } catch (error) {
      if (sequence !== state.globalSearchSequence) return;
      resultsHost.innerHTML = `<div class="global-search-empty">${escapeHtml(error.message || 'Search is temporarily unavailable.')}</div>`;
      resultsHost.hidden = false; status.textContent = 'Search could not complete'; input.setAttribute('aria-expanded','true');
    }
  }, 220);
}
async function renderPersonDetails(id) {
  const renderSequence = state.renderSequence;
  app.innerHTML = `${nav('')}<main id="main-content" tabindex="-1" class="page-shell page"><div class="empty">Loading person profile…</div></main>`;
  try {
    const data = await api(`/api/person/${id}`);
    if (renderSequence !== state.renderSequence) return;
    const person = data.person || {};
    const credits = usableItems(data.credits?.results, ['movie', 'tv']).slice(0, 60);
    const portrait = person.profileLarge || person.profile || '';
    setPageMetadata({ title: `${person.name || 'Person'} - Filmography`, description: person.biography || `Explore film and television credits for ${person.name || 'this person'} on LUMA Stream.`, image: portrait || null, path: `/person/${id}`, robots: 'index,follow', preloadImage: false, type: 'profile' });
    app.innerHTML = `${nav('')}<main id="main-content" tabindex="-1" class="page-shell page person-page"><section class="person-profile"><div class="person-profile-art">${portrait ? `<img src="${portrait}" decoding="async" alt="Portrait of ${escapeHtml(person.name || 'person')}" loading="lazy">` : '<div class="poster-fallback">No portrait available</div>'}</div><div class="person-profile-copy"><span class="eyebrow">Cast & crew</span><h1 class="page-title">${escapeHtml(person.name || 'Person')}</h1><p class="person-department">${escapeHtml(person.known_for_department || 'Filmography')}</p>${person.birthday ? `<p class="person-facts">Born ${escapeHtml(person.birthday)}${person.place_of_birth ? ` · ${escapeHtml(person.place_of_birth)}` : ''}</p>` : ''}<p class="person-biography">${escapeHtml(person.biography || 'No biography is available for this person.')}</p></div></section><section class="person-filmography"><div class="section-header"><div><span class="section-kicker">Filmography</span><h2>Known credits</h2></div></div><div class="grid">${credits.length ? credits.map(card).join('') : '<div class="empty" style="grid-column:1/-1">No movie or series credits found.</div>'}</div></section>${footer()}</main>`;
  } catch (e) { if (renderSequence === state.renderSequence) renderError(e.message); }
}

function people(items, limit=12) {
  return (items || []).slice(0, limit).map(person => `<div class="person-card"><div class="person-photo">${person.profile_path ? `<img loading="lazy" src="https://image.tmdb.org/t/p/w185${person.profile_path}" alt="${escapeHtml(person.name)}">` : iconWrap('users')}</div><div class="person-name">${escapeHtml(person.name)}</div><div class="person-role">${escapeHtml(person.character || person.job || '')}</div></div>`).join('');
}
function renderCast(credits) {
  const cast = (credits?.cast || []).slice(0, 12);
  if (!cast.length) return '';
  return `<section class="info-panel cast-panel"><div class="panel-head"><div><span class="panel-kicker">People</span><h3>Cast</h3></div>${iconWrap('users')}</div><div class="people-row">${people(cast)}</div></section>`;
}
function renderProviders(providers) {
  const selectedRegion = state.settings.region || 'NP';
  const region = providers?.results?.[selectedRegion];
  if (!region) return '';
  const groups = [['Stream', region.flatrate || []], ['Rent', region.rent || []], ['Buy', region.buy || []]].filter(([, list]) => list.length);
  return groups.map(([label, list]) => `<div class="provider-group"><div class="mini-label">${label}</div><div class="provider-list">${dedupeBy(list, 'provider_id').slice(0, 6).map(p => `<div class="provider-chip"><img src="https://image.tmdb.org/t/p/w92${p.logo_path}" alt="" loading="lazy"><span>${escapeHtml(p.provider_name)}</span></div>`).join('')}</div></div>`).join('');
}
function trailerCard(video) {
  if (!video) return '';
  return `<a class="trailer-card" href="https://www.youtube.com/watch?v=${encodeURIComponent(video.key)}" target="_blank" rel="noreferrer"><div class="trailer-art" style="background-image:url('https://i.ytimg.com/vi/${encodeURIComponent(video.key)}/hqdefault.jpg')"><span class="trailer-play">${iconWrap('play')}</span></div><div class="trailer-copy"><span class="panel-kicker">Watch trailer</span><strong>${escapeHtml(video.name || 'Official trailer')}</strong><span>Open on YouTube ${iconWrap('external')}</span></div></a>`;
}
async function shareCurrent(title) {
  const url = location.href;
  try {
    if (navigator.share) await navigator.share({ title, url });
    else { await navigator.clipboard.writeText(url); showToast('Link copied to clipboard'); }
  } catch (error) { if (error?.name !== 'AbortError') showToast('Could not share this page'); }
}

async function renderDetails(type, id, mount = app) {
  const renderSequence = state.renderSequence;
  mount.innerHTML = `${nav(type === 'tv' ? 'tv' : 'movies')}<main id="main-content" tabindex="-1" class="page"><div class="empty" style="margin:110px 5vw 60px">Loading title…</div></main>`;
  try {
    const data = await api(`/api/${type}/${id}`);
    if (mount === app && renderSequence !== state.renderSequence) return;
    const item = data.details; const saved = isSaved(item.id, type);
    const trailer = item.videos?.results?.find(v => v.site === 'YouTube' && ['Trailer','Teaser'].includes(v.type));
    const creators = type === 'tv' ? dedupeBy(item.created_by || [], 'id').slice(0, 2) : dedupeBy((data.credits?.crew || []).filter(x => x.job === 'Director'), 'id').slice(0, 2);
    const genres = (item.genres || []).slice(0, 4); const synopsis = item.overview?.trim(); const providerHtml = renderProviders(data.providers);
    const logo = state.settings.imageLogos ? (item.images?.logos || []).find(x => ['en','en-US',null].includes(x.iso_639_1)) : null;
    if (mount === app) setPageMetadata({ title: `${item.title} - ${type === 'tv' ? 'TV Series' : 'Movie'}`, description: item.overview || `Discover ${item.title} on LUMA Stream.`, image: item.backdrop || item.backdropLarge || item.posterLarge || null, path: `/details/${type}/${id}`, robots: 'index,follow', preloadImage: true, type: type === 'tv' ? 'video.tv_show' : 'video.movie' });
    const titleMarkup = logo?.file_path ? `<img class="title-logo" src="https://image.tmdb.org/t/p/w500${logo.file_path}" alt="${escapeHtml(item.title)}">` : `<h1>${escapeHtml(item.title)}</h1>`;
    let episodesMarkup = '';
    if (type === 'tv') {
      episodesMarkup = `<section class="detail-episodes info-panel"><div class="panel-head"><div><span class="panel-kicker">Series</span><h3>Episodes</h3></div><div class="season-picker-wrap" id="detail-season-picker"></div></div><div id="detail-episode-row" class="episode-grid"></div></section>`;
    }
    const trailerMarkup = trailer ? (state.settings.trailers ? `<div class="trailer-video"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(trailer.key)}?autoplay=1&mute=1&controls=0&loop=1&playlist=${encodeURIComponent(trailer.key)}&rel=0" title="${escapeHtml(item.title)} trailer" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>` : trailerCard(trailer)) : '';
    const content = `<main id="main-content" tabindex="-1" class="page"><section class="details-hero"><div class="details-bg" style="background-image:url('${item.backdrop || item.backdropLarge || item.posterLarge || ''}')"></div><div class="details-shade"></div><div class="details-content"><div class="poster-stack"><img class="details-poster" src="${item.posterLarge || item.poster || ''}" decoding="async" alt="${escapeHtml(item.title)} poster"><span class="poster-score">${iconWrap('star')} ${rating(item.vote_average)}</span></div><div class="details-copy"><span class="eyebrow">${type === 'tv' ? 'Series' : 'Movie'}</span>${titleMarkup}<div class="meta-row detail-meta"><span>${year(item.release_date)}</span><span class="dot"></span><span>${type === 'tv' ? `${item.number_of_seasons || 0} season${item.number_of_seasons === 1 ? '' : 's'}` : formatMinutes(item.runtime)}</span><span class="dot"></span><span>${iconWrap('star')} ${rating(item.vote_average)}</span></div>${genres.length ? `<div class="tag-row">${genres.map(g => `<span class="tag">${escapeHtml(g.name)}</span>`).join('')}</div>` : ''}${creators.length ? `<div class="creator-inline"><span>${type === 'tv' ? 'Created by' : 'Directed by'}</span><strong>${creators.map(p => escapeHtml(p.name)).join(', ')}</strong></div>` : ''}${synopsis ? `<button type="button" class="synopsis-toggle" data-synopsis-toggle aria-expanded="false" aria-controls="title-synopsis">About this title ${iconWrap('chevronDown')}</button><p id="title-synopsis" class="details-overview hero-overview">${escapeHtml(synopsis)}</p>` : ''}<div class="hero-actions"><a class="btn primary" href="/watch/${type}/${item.id}" data-link>${iconWrap('play')} Watch now</a><button class="btn secondary" id="save-btn">${saved ? iconWrap('check') + ' In My List' : iconWrap('plus') + ' My List'}</button><button class="btn icon-only" id="share-btn" title="Share" aria-label="Share this title">${iconWrap('share')}</button>${trailer && !state.settings.trailers ? `<a class="btn ghost" href="https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}" target="_blank" rel="noreferrer">${iconWrap('playCircle')} Trailer</a>` : ''}</div></div></div></section><section class="detail-body"><div class="detail-main">${renderCast(data.credits)}${episodesMarkup}</div><aside class="detail-aside">${trailerMarkup}${providerHtml ? `<section class="info-panel"><div class="panel-head"><div><span class="panel-kicker">Availability</span><h3>Where to watch</h3></div>${iconWrap('globe')}</div><div class="provider-groups">${providerHtml}</div></section>` : ''}</aside></section>${section('More like this', data.recommendations?.results || [], `/${type}`, 8)}${footer()}</main>`;
    // For modal view, strip nested nav and footer and wrap body.
    const forcePageView = new URLSearchParams(location.search).get('view') === 'page';
    if (state.settings.detailView === 'modal' && mount === app && !forcePageView) {
      const modalOpener = document.activeElement;
      app.innerHTML = nav(type === 'tv' ? 'tv' : 'movies');
      const wrapper=document.createElement('div'); wrapper.className='modal-backdrop detail-modal-backdrop'; wrapper.setAttribute('role','dialog'); wrapper.setAttribute('aria-modal','true'); wrapper.setAttribute('aria-label', `${item.title} details`); wrapper.setAttribute('tabindex','-1'); wrapper._returnFocus = modalOpener;
      wrapper.innerHTML=`<button type="button" class="modal-close" data-modal-close aria-label="Close title details">${iconWrap('chevronDown')}</button><div class="detail-modal-content" id="main-content" tabindex="-1">${content.replace('<main id="main-content" tabindex="-1" class="page">','').replace('</main>','')}</div>`; app.append(wrapper);
      wrapper.addEventListener('click', event=>{ if(event.target===wrapper||event.target.closest('[data-modal-close]')) closeAccessibleModal(wrapper); });
      state.modalTrigger = modalOpener; document.body.classList.add('modal-open');
      requestAnimationFrame(() => wrapper.querySelector('[data-modal-close]')?.focus({ preventScroll: true }));
    } else {
      mount.innerHTML = `${nav(type === 'tv' ? 'tv' : 'movies')}${content}`;
    }
    document.querySelector('#save-btn')?.addEventListener('click', () => toggleList(item));
    document.querySelector('#share-btn')?.addEventListener('click', () => shareCurrent(item.title));
    if(type==='tv') bindDetailEpisodes(item);
    bindRails();
  } catch (e) { if (mount === app && renderSequence === state.renderSequence) renderError(e.message); }
}
function seasonPicker(seasons, active, scope) {
  if (!seasons.length) return '';
  if (scope === 'watch') {
    return `<div class="watch-season-tabs" role="tablist" aria-label="Choose season">${seasons.map(s=>`<button type="button" role="tab" aria-selected="${s.season_number===active}" class="season-tab ${s.season_number===active?'active':''}" data-season-option="watch" data-season-number="${s.season_number}">${escapeHtml(formatSeasonLabel(s))}</button>`).join('')}</div>`;
  }
  const current = seasons.find(s => s.season_number === active) || seasons[0];
  return `<div class="season-picker"><button type="button" class="season-picker-btn" data-season-select="${scope}" aria-haspopup="listbox" aria-controls="season-menu-${scope}" aria-expanded="false"><span>${escapeHtml(formatSeasonLabel(current))}</span>${iconWrap('chevronDown')}</button><div id="season-menu-${scope}" class="season-picker-menu" data-season-menu="${scope}" role="listbox" aria-label="Choose season" tabindex="-1">${seasons.map(s=>`<button type="button" role="option" aria-selected="${s.season_number===active}" tabindex="-1" class="season-option ${s.season_number===active?'active':''}" data-season-option="${scope}" data-season-number="${s.season_number}">${escapeHtml(formatSeasonLabel(s))}</button>`).join('')}</div></div>`;
}
async function bindDetailEpisodes(item) {
  const picker=document.querySelector('#detail-season-picker'); const host=document.querySelector('#detail-episode-row'); if(!picker||!host) return;
  const seasons=(item.seasons||[]).filter(s=>s.season_number>0); let active=seasons[0]?.season_number||1;
  const load=async (seasonNumber, { restoreFocus = false } = {})=>{
    active=seasonNumber; const data=await api(`/api/tv/${item.id}/season/${seasonNumber}`);
    if (!picker.isConnected || !host.isConnected) return;
    picker.innerHTML=seasonPicker(seasons, active, 'detail');
    const fallback = item.backdrop || item.backdropLarge || item.posterLarge || item.poster || '';
    host.innerHTML=(data.episodes||[]).map(ep=>{
      const still = ep.still || fallback;
      return `<a class="episode-pill" href="/watch/tv/${item.id}?season=${active}&episode=${ep.episode_number}" data-link title="${state.settings.spoilerFree ? `Episode ${ep.episode_number}` : escapeHtml(ep.name || `Episode ${ep.episode_number}`)}"><span class="episode-pill-number">E${String(ep.episode_number).padStart(2,'0')}</span><span class="episode-pill-name">${state.settings.spoilerFree ? `Episode ${String(ep.episode_number).padStart(2,'0')}` : escapeHtml(ep.name||`Episode ${ep.episode_number}`)}</span>${!state.settings.spoilerFree && ep.runtime ? `<small>${ep.runtime}m</small>` : ''}</a>`;
    }).join('');
    picker.querySelector('[data-season-select]')?.addEventListener('click',()=>toggleAccessibleDropdown(picker.querySelector('[data-season-select]')));
    picker.querySelectorAll('[data-season-option]').forEach(btn=>btn.addEventListener('click',()=>load(Number(btn.dataset.seasonNumber), { restoreFocus: true })));
    if (restoreFocus) picker.querySelector('[data-season-select]')?.focus({ preventScroll: true });
  };
  await load(active);
}

function officialFallbackMarkup(item, type, providers) {
  const query = encodeURIComponent(item.title || '');
  const regional = providers?.results?.[state.settings.region || 'NP'];
  const options = [
    { name: 'Netflix', url: `https://www.netflix.com/search?q=${query}` },
    { name: 'Prime Video', url: `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${query}` },
    { name: 'Apple TV', url: `https://tv.apple.com/search?term=${query}` },
    { name: 'YouTube', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${item.title || ''} ${type === 'tv' ? 'official episodes' : 'official movie'}`)}` },
    { name: 'Plex', url: `https://watch.plex.tv/search?q=${query}` },
  ];
  const providerNames = ['flatrate', 'free', 'ads', 'rent', 'buy']
    .flatMap(kind => (regional?.[kind] || []).map(provider => provider?.provider_name))
    .filter(Boolean);
  const availability = regional?.link
    ? `<a class="official-fallback-link availability-link" href="${escapeHtml(regional.link)}" target="_blank" rel="noopener noreferrer">${iconWrap('globe')} <span>Regional availability${providerNames.length ? ` · ${escapeHtml([...new Set(providerNames)].slice(0, 3).join(', '))}` : ''}</span>${iconWrap('external')}</a>`
    : `<p class="availability-note">No regional availability link was returned for ${escapeHtml(state.settings.region || 'NP')}.</p>`;
  return `<div class="official-fallback-area"><div class="fallback-heading"><span>Official watch options</span><small>Opens the service search. Availability varies by region and subscription.</small></div><div class="official-fallback-links">${options.map(option => `<a class="official-fallback-link" href="${option.url}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(option.name)}</span>${iconWrap('external')}</a>`).join('')}</div>${availability}<p class="provider-attribution">Streaming availability data powered by TMDB and JustWatch.</p></div>`;
}

function formatDownloadSize(bytes) {
  if (bytes === null || bytes === undefined || bytes === '') return 'Size unavailable';
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return 'Size unavailable';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = value / 1024;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${units[unit]}`;
}

// These links open the providers' own download pages. They are deliberately
// kept separate from LUMA's direct-file download API: an HTML page is not a video file.
function externalDownloadOptionsMarkup({ type, id, season, episode } = {}) {
  const mediaType = type === 'tv' ? 'tv' : type === 'movie' ? 'movie' : null;
  const mediaId = Number(id);
  if (!mediaType || !Number.isSafeInteger(mediaId) || mediaId <= 0) return '';

  let vidVaultUrl;
  if (mediaType === 'tv') {
    const seasonNumber = Number(season || 1);
    const episodeNumber = Number(episode || 1);
    if (!Number.isSafeInteger(seasonNumber) || seasonNumber <= 0 || !Number.isSafeInteger(episodeNumber) || episodeNumber <= 0) return '';
    vidVaultUrl = `https://vidvault.to/tv/${mediaId}/${seasonNumber}/${episodeNumber}`;
  } else {
    vidVaultUrl = `https://vidvault.to/movie/${mediaId}`;
  }
  return `<section class="download-provider-options" aria-label="Download provider"><div class="download-provider-heading"><strong>Download with VidVault</strong><span>Open VidVault to see the resolutions and mirrors currently available.</span></div><div class="download-provider-links"><a class="download-provider-link" href="${escapeHtml(vidVaultUrl)}" target="_blank" rel="noopener noreferrer"><span class="download-provider-icon">${iconWrap('download')}</span><span class="download-provider-copy"><strong>VidVault</strong><small>Resolution conversion &amp; downloads</small></span>${iconWrap('external')}</a></div></section>`;
}

async function openDownloadModal({ type, id, season, episode, title, provider, opener } = {}) {
  const trigger = opener || document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop download-modal-backdrop';
  overlay.innerHTML = `<div class="modal-card download-modal" role="dialog" aria-modal="true" aria-label="Download media" tabindex="-1"><button type="button" class="modal-close" data-modal-close aria-label="Close download dialog">${iconWrap('close')}</button><div class="empty" role="status">Checking available download files…</div></div>`;
  overlay._returnFocus = trigger;
  state.modalTrigger = trigger;
  document.body.append(overlay);
  document.body.classList.add('modal-open');
  overlay.addEventListener('click', event => { if (event.target === overlay) closeAccessibleModal(overlay); });
  overlay.querySelector('[data-modal-close]')?.addEventListener('click', () => closeAccessibleModal(overlay));
  requestAnimationFrame(() => overlay.querySelector('[data-modal-close]')?.focus({ preventScroll: true }));

  try {
    const query = new URLSearchParams();
    if (type === 'tv') { query.set('season', String(season || 1)); query.set('episode', String(episode || 1)); }
    if (provider) query.set('provider', String(provider));
    const data = await api(`/api/downloads/${type}/${id}${query.size ? `?${query.toString()}` : ''}`);
    if (!overlay.isConnected) return;
    const modal = overlay.querySelector('.download-modal');
    const providerDownloadOptions = externalDownloadOptionsMarkup({ type, id, season, episode });
    if (!data.available || !Array.isArray(data.qualities) || !data.qualities.length) {
      const providerStatus = data.providerConfigured
        ? (data.providerMessage || 'The configured source did not return a verifiable direct video file.')
        : 'This player provides an embedded playback page, not a direct downloadable video file. LUMA will not save a player page or rename a stream playlist as an MP4.';
      const officialOptions = document.querySelector('.official-fallback-area');
      const officialOptionsMarkup = officialOptions ? `<div class="download-official-options">${officialOptions.outerHTML}</div>` : '';
      modal.setAttribute('aria-labelledby', 'download-title');
      modal.innerHTML = `<button type="button" class="modal-close" data-modal-close aria-label="Close download dialog">${iconWrap('close')}</button><span class="eyebrow">Offline viewing</span><h2 id="download-title">Choose a download source</h2><p class="download-modal-intro">LUMA doesn't have a direct-file download for <strong>${escapeHtml(title || data.title || 'this title')}</strong>${type === 'tv' ? ` · Season ${Number(season) || 1}, episode ${Number(episode) || 1}` : ''}${provider ? ` from ${escapeHtml(provider)}` : ''}. You can still open the providers' own download pages below.</p><div class="download-empty-note"><span class="download-note-icon">${iconWrap('info')}</span><div><strong>Provider pages stay available.</strong><p>${escapeHtml(providerStatus)}</p></div></div>${providerDownloadOptions}<p class="download-setup-note">These options open the provider in a new tab. Available qualities and mirrors can change by title.</p>${officialOptionsMarkup}`;
      modal.querySelector('[data-modal-close]')?.addEventListener('click', () => closeAccessibleModal(overlay));
      requestAnimationFrame(() => modal.querySelector('[data-modal-close]')?.focus({ preventScroll: true }));
      return;
    }

    const qualities = data.qualities;
    const best = qualities[0];
    modal.setAttribute('aria-labelledby', 'download-title');
    const bestSource = best.provider ? (best.sourceName || provider || 'Provider') : 'LUMA library';
    const sourceText = best.provider ? `The highest verified direct-file quality from ${bestSource} is preselected.` : 'The highest available quality in LUMA’s local media library is preselected.';
    modal.innerHTML = `<button type="button" class="modal-close" data-modal-close aria-label="Close download dialog">${iconWrap('close')}</button><span class="eyebrow">Offline viewing</span><h2 id="download-title">Download ${escapeHtml(title || data.title || 'video')}</h2><p class="download-modal-intro">${escapeHtml(sourceText)}</p><label class="download-quality-label" for="download-quality">Video quality</label><select id="download-quality" class="download-quality-select">${qualities.map((quality, index) => `<option value="${index}" ${index === 0 ? 'selected' : ''}>${escapeHtml(quality.label)}${quality.height ? ` · ${quality.height}p` : ''}${quality.sourceName ? ` · ${escapeHtml(quality.sourceName)}` : ''} · ${escapeHtml(formatDownloadSize(quality.sizeBytes))}</option>`).join('')}</select><div class="download-file-summary" id="download-file-summary"><span class="download-summary-icon">${iconWrap('film')}</span><span><strong>${escapeHtml(best.filename)}</strong><small>${escapeHtml(best.label)} · ${escapeHtml(best.sourceName || bestSource)} · ${escapeHtml(formatDownloadSize(best.sizeBytes))}</small></span><span class="download-best-mark">Best available</span></div><a class="btn primary download-start" id="download-start" href="${escapeHtml(best.downloadUrl)}">${iconWrap('download')} Download ${escapeHtml(best.label)}</a><p class="download-footnote">The original video file is streamed to your browser without being buffered in full on the LUMA server. Provider links expire and are refreshed when you reopen this dialog.</p>${providerDownloadOptions}`;
    const qualitySelect = modal.querySelector('#download-quality');
    const summary = modal.querySelector('#download-file-summary');
    const downloadLink = modal.querySelector('#download-start');
    const updateDownload = () => {
      const selected = qualities[Number(qualitySelect.value)] || best;
      downloadLink.href = selected.downloadUrl;
      downloadLink.innerHTML = `${iconWrap('download')} Download ${escapeHtml(selected.label)}`;
      summary.innerHTML = `<span class="download-summary-icon">${iconWrap('film')}</span><span><strong>${escapeHtml(selected.filename)}</strong><small>${escapeHtml(selected.label)} · ${escapeHtml(selected.sourceName || (selected.provider ? provider || 'Provider' : 'LUMA library'))} · ${escapeHtml(formatDownloadSize(selected.sizeBytes))}</small></span>${selected.id === best.id ? '<span class="download-best-mark">Best available</span>' : '<span class="download-alternate-mark">Selected quality</span>'}`;
    };
    qualitySelect.addEventListener('change', updateDownload);
    downloadLink.addEventListener('click', () => window.setTimeout(() => closeAccessibleModal(overlay), 250));
    modal.querySelector('[data-modal-close]')?.addEventListener('click', () => closeAccessibleModal(overlay));
    requestAnimationFrame(() => qualitySelect.focus({ preventScroll: true }));
  } catch (error) {
    if (!overlay.isConnected) return;
    const modal = overlay.querySelector('.download-modal');
    const providerDownloadOptions = externalDownloadOptionsMarkup({ type, id, season, episode });
    modal.innerHTML = `<button type="button" class="modal-close" data-modal-close aria-label="Close download dialog">${iconWrap('close')}</button><span class="eyebrow">Offline viewing</span><h2>Couldn't check LUMA downloads</h2><p class="download-modal-intro">${escapeHtml(error.message || 'The download catalogue could not be checked.')}</p>${providerDownloadOptions}<p class="download-setup-note">LUMA's download check failed, but the provider pages can still be opened separately.</p>`;
    modal.querySelector('[data-modal-close]')?.addEventListener('click', () => closeAccessibleModal(overlay));
    requestAnimationFrame(() => modal.querySelector('[data-modal-close]')?.focus({ preventScroll: true }));
  }
}

function sourcePillsMarkup(sources, activeName = sources[0]?.name, expanded = false) {
  const active = sources.find(source => source.name === activeName) || sources[0];
  let visible = expanded ? sources : sources.slice(0, SOURCE_PREVIEW_LIMIT);
  // When a source from the expanded list is active, keep its pill visible after collapsing
  // without showing more than eight provider options at a time.
  if (!expanded && active && !visible.some(source => source.name === active.name)) {
    visible = [...sources.slice(0, SOURCE_PREVIEW_LIMIT - 1), active];
  }
  const pills = visible.map(source => `<button type="button" class="source-pill ${source.name === active?.name ? 'active' : ''}" data-src="${encodeURIComponent(source.url)}" data-source-name="${escapeHtml(source.name)}">${escapeHtml(source.name)}</button>`).join('');
  if (sources.length <= SOURCE_PREVIEW_LIMIT) return pills;
  const isExpanded = Boolean(expanded);
  const extraCount = Math.max(0, sources.length - SOURCE_PREVIEW_LIMIT);
  return `${pills}<button type="button" class="source-more-pill" data-toggle-source-list data-expanded="${isExpanded}" aria-expanded="${isExpanded}" aria-label="${isExpanded ? 'Show fewer streaming sources' : `Show ${extraCount} more streaming sources`}">${isExpanded ? 'Show less' : 'More'}${isExpanded ? '' : ` <span>+${extraCount}</span>`}</button>`;
}

async function renderWatch(type, id) {
  const renderSequence = state.renderSequence;
  app.innerHTML = `${nav(type === 'tv' ? 'tv' : 'movies')}<main id="main-content" tabindex="-1" class="watch-page page"><div class="empty" style="width:min(500px,90%)">Preparing player…</div></main>`;
  try {
    const [data, embedProviderData] = await Promise.all([
      api(`/api/${type}/${id}`),
      api('/api/embed-providers').catch(() => ({ providers: [] })),
    ]);
    configuredEmbedProviders = (Array.isArray(embedProviderData?.providers) ? embedProviderData.providers : [])
      .filter(provider => provider && typeof provider.name === 'string' && provider.name.trim())
      .filter((provider, index, list) => list.findIndex(item => item.name.toLowerCase() === provider.name.toLowerCase()) === index);
    if (renderSequence !== state.renderSequence) return;
    const item = data.details;
    const params = new URLSearchParams(location.search);
    setPageMetadata({ title: `Watch ${item.title}`, description: `Viewing options and episode navigation for ${item.title} on LUMA Stream.`, image: item.backdrop || item.backdropLarge || item.posterLarge || null, path: `/details/${type}/${id}`, robots: 'noindex,follow', preloadImage: false, type: type === 'tv' ? 'video.tv_show' : 'video.movie' });
    let season = Math.max(1, Number(params.get('season') || 1));
    let episode = Math.max(1, Number(params.get('episode') || 1));
    const isSeries = type === 'tv';
    const seasons = (item.seasons || []).filter(s => s.season_number > 0);
    const previousWatch = watchHistoryEntry(type, id);
    const sameSavedEpisode = Boolean(previousWatch && (!isSeries || (Number(previousWatch.season) === season && Number(previousWatch.episode) === episode)));
    const initialResumeSeconds = sameSavedEpisode && Number(previousWatch.resumeSeconds) > 15 && Number(previousWatch.progress) < 96 ? Number(previousWatch.resumeSeconds) : 0;
    pushHistory(item, {
      season: isSeries ? season : null,
      episode: isSeries ? episode : null,
      resumeSeconds: initialResumeSeconds,
      progress: sameSavedEpisode ? Number(previousWatch.progress) || 0 : 0,
      duration: sameSavedEpisode ? Number(previousWatch.duration) || 0 : 0,
      sourceName: sameSavedEpisode ? previousWatch.sourceName || '' : '',
      resetProgress: !sameSavedEpisode,
    });
    const initialSources = buildSources(type, id, season, episode, item, initialResumeSeconds);
    let activeSources = initialSources;
    let sourceListExpanded = false;
    let activeSourceName = initialSources[0]?.name || '';
    const initialSource = initialSources[0];
    if (!initialSource) throw new Error('No streaming source is configured. Check your source order in Settings.');

    app.innerHTML = `${nav(type === 'tv' ? 'tv' : 'movies')}<main id="main-content" tabindex="-1" class="watch-page page">
      <div class="watch-layout ${isSeries ? 'has-episodes' : 'movie-watch-layout'}">
        <section class="watch-primary" aria-label="Now playing">
          <div class="player-wrap"><iframe id="player-frame" class="player-frame" title="${escapeHtml(item.title)} player" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="origin-when-cross-origin"></iframe></div>
          <div class="watch-heading">
            <div class="watch-heading-copy"><span class="eyebrow">Now playing</span><h1 class="watch-title" id="watch-title">${escapeHtml(item.title)}${isSeries ? ` · S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}` : ''}</h1><div class="meta-row"><span>${year(item.release_date)}</span><span class="dot"></span><span>${iconWrap('star')} ${rating(item.vote_average)}</span></div></div>
            <div class="watch-heading-actions"><button class="btn secondary" type="button" data-open-download>${iconWrap('download')} Download</button><a class="btn ghost" href="${detailHref(item)}" data-link>${iconWrap('back')} Details</a></div>
          </div>
          <section class="info-panel streaming-source-panel" aria-label="Streaming source selector">
            <div class="panel-head source-panel-head"><div><span class="panel-kicker">Streaming source</span><h3><span id="active-source-label">${escapeHtml(initialSource.name)}</span></h3></div><span class="source-panel-status">Select a source if playback fails</span></div>
            <div class="source-pills" id="source-pills">${sourcePillsMarkup(initialSources, activeSourceName, sourceListExpanded)}</div>
            <p class="player-note">LUMA cannot inspect errors inside third-party players. Try another source below if the selected player does not load.</p>
            ${officialFallbackMarkup(item, type, data.providers)}
          </section>
        </section>
        ${isSeries ? `<aside class="watch-side" aria-label="Episode list"><section class="episode-panel info-panel"><div class="panel-head"><div><span class="panel-kicker">Continue watching</span><h3>Episodes</h3></div><div id="season-picker" class="season-picker-wrap"></div></div><div id="episode-grid" class="episode-grid" aria-live="polite"></div></section></aside>` : ''}
      </div>
      ${section('More like this', data.recommendations?.results || [], isSeries ? '/tv' : '/movies', 8)}${footer()}
    </main>`;

    const player = document.querySelector('#player-frame');
    const downloadButton = document.querySelector('[data-open-download]');
    downloadButton?.addEventListener('click', () => {
      const activeProvider = document.querySelector('#source-pills .source-pill.active')?.dataset.sourceName || activeSourceName || initialSource.name;
      openDownloadModal({ type, id, season, episode, title: item.title, provider: activeProvider, opener: downloadButton });
    });
    const sourceLabel = document.querySelector('#active-source-label');
    const sourcePillsHost = document.querySelector('#source-pills');
    const seasonPickerHost = document.querySelector('#season-picker');
    const episodeGrid = document.querySelector('#episode-grid');
    const watchTitle = document.querySelector('#watch-title');
    let episodeSequence = 0;
    let lastSavedEpisodeKey = '';
    let lastSavedTimeBucket = -1;

    const setSource = url => { if (player && url) player.src = url; };
    const refreshWatchTitle = () => {
      if (watchTitle) watchTitle.textContent = `${item.title}${isSeries ? ` · S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}` : ''}`;
    };
    const bindSources = () => {
      sourcePillsHost?.querySelectorAll('.source-pill').forEach(button => {
        button.addEventListener('click', () => {
          sourcePillsHost.querySelectorAll('.source-pill').forEach(sourceButton => sourceButton.classList.remove('active'));
          button.classList.add('active');
          activeSourceName = button.dataset.sourceName || button.textContent.trim();
          if (sourceLabel) sourceLabel.textContent = activeSourceName;
          setSource(decodeURIComponent(button.dataset.src));
        });
      });
      const moreButton = sourcePillsHost?.querySelector('[data-toggle-source-list]');
      moreButton?.addEventListener('click', () => {
        sourceListExpanded = moreButton.dataset.expanded !== 'true';
        sourcePillsHost.innerHTML = sourcePillsMarkup(activeSources, activeSourceName, sourceListExpanded);
        bindSources();
        sourcePillsHost.querySelector('[data-toggle-source-list]')?.focus({ preventScroll: true });
      });
    };

    const loadSeason = async (seasonNumber, { restoreFocus = false } = {}) => {
      if (!isSeries || !seasonPickerHost || !episodeGrid) return;
      const sequence = ++episodeSequence;
      let seasonData;
      try { seasonData = await api(`/api/tv/${id}/season/${seasonNumber}`); }
      catch { seasonData = { episodes: [] }; }
      if (!seasonPickerHost.isConnected || !episodeGrid.isConnected || sequence !== episodeSequence) return;
      seasonPickerHost.innerHTML = seasonPicker(seasons, seasonNumber, 'watch');
      const fallback = item.backdrop || item.backdropLarge || item.posterLarge || item.poster || '';
      episodeGrid.innerHTML = (seasonData.episodes || []).map(ep => {
        const number = String(ep.episode_number).padStart(2, '0');
        const episodeTitle = state.settings.spoilerFree ? `Episode ${number}` : `Episode ${ep.episode_number}${ep.name ? ` · ${ep.name}` : ''}`;
        const description = state.settings.spoilerFree ? 'Episode details are hidden.' : String(ep.overview || 'Episode summary unavailable.').trim().slice(0, 135);
        const still = ep.still || fallback;
        return `<button type="button" class="watch-episode ${ep.episode_number === episode ? 'active' : ''}" data-episode="${ep.episode_number}" aria-current="${ep.episode_number === episode ? 'true' : 'false'}" title="${escapeHtml(episodeTitle)}">
          <span class="watch-episode-thumb">${still ? `<img src="${escapeHtml(still)}" loading="lazy" decoding="async" alt="">` : `<span class="watch-episode-no-image">${iconWrap('tv')}</span>`}</span>
          <span class="watch-episode-copy"><strong>Episode ${ep.episode_number}</strong><small>S${String(seasonNumber).padStart(2, '0')} · E${number}${!state.settings.spoilerFree && ep.runtime ? ` · ${ep.runtime} min` : ''}</small><span>${escapeHtml(description)}</span></span><span class="watch-episode-play" aria-hidden="true">${iconWrap(ep.episode_number === episode ? 'play' : 'chevronRight')}</span>
        </button>`;
      }).join('') || '<p class="availability-note">No episode details are available for this season.</p>';
      seasonPickerHost.querySelectorAll('[data-season-option]').forEach(button => button.addEventListener('click', () => {
        updateWatchEpisode(Number(button.dataset.seasonNumber), 1, { restoreSeasonFocus: true });
      }));
      episodeGrid.querySelectorAll('[data-episode]').forEach(button => button.addEventListener('click', () => {
        updateWatchEpisode(seasonNumber, Number(button.dataset.episode));
      }));
      if (restoreFocus) seasonPickerHost.querySelector('[data-season-option][aria-selected="true"]')?.focus({ preventScroll: true });
    };

    const renderSourcesForEpisode = ({ reloadPlayer = false, resumeSeconds = 0 } = {}) => {
      const sourceToKeep = activeSourceName;
      activeSources = buildSources(type, id, season, episode, item, resumeSeconds);
      const selected = activeSources.find(source => source.name === sourceToKeep) || activeSources[0];
      if (selected) activeSourceName = selected.name;
      sourcePillsHost.innerHTML = sourcePillsMarkup(activeSources, activeSourceName, sourceListExpanded);
      if (sourceLabel) sourceLabel.textContent = activeSourceName;
      bindSources();
      if (reloadPlayer && selected) setSource(selected.url);
    };

    const updateWatchEpisode = async (newSeason, newEpisode, { restoreSeasonFocus = false } = {}) => {
      const targetSeason = Math.max(1, Number(newSeason) || 1);
      const targetEpisode = Math.max(1, Number(newEpisode) || 1);
      const sameEpisode = targetSeason === season && targetEpisode === episode;
      const previous = watchHistoryEntry(type, id);
      const resumeSeconds = sameEpisode && Number(previous?.resumeSeconds) > 15 && Number(previous?.progress) < 96 ? Number(previous.resumeSeconds) : 0;
      season = targetSeason;
      episode = targetEpisode;
      history.replaceState({}, '', watchPathFor('tv', id, season, episode));
      refreshWatchTitle();
      updateWatchHistory(item, {
        season, episode,
        progress: sameEpisode ? Number(previous?.progress) || 0 : 0,
        resumeSeconds,
        duration: sameEpisode ? Number(previous?.duration) || 0 : 0,
        sourceName: activeSourceName,
        resetProgress: !sameEpisode,
      });
      renderSourcesForEpisode({ reloadPlayer: true, resumeSeconds });
      await loadSeason(season, { restoreFocus: restoreSeasonFocus });
    };

    bindSources();
    setSource(initialSource.url);
    if (isSeries) await loadSeason(season);

    // VidKing documents PLAYER_EVENT messages with currentTime/duration and season/episode.
    // Accept messages only from the active iframe and its exact, known origin.
    if (state.watchMessageHandler) window.removeEventListener('message', state.watchMessageHandler);
    state.watchMessageHandler = event => {
      if (!player?.isConnected || event.source !== player.contentWindow || activeSourceName !== 'VidKing') return;
      if (!['https://www.vidking.net', 'https://vidking.net'].includes(event.origin)) return;
      let envelope = event.data;
      if (typeof envelope === 'string') {
        try { envelope = JSON.parse(envelope); } catch { return; }
      }
      if (!envelope || typeof envelope !== 'object' || envelope.type !== 'PLAYER_EVENT' || !envelope.data || typeof envelope.data !== 'object') return;
      const payload = envelope.data;
      if (String(payload.id ?? '') !== String(id)) return;
      if (payload.mediaType && !((isSeries && ['tv', 'series'].includes(String(payload.mediaType).toLowerCase())) || (!isSeries && String(payload.mediaType).toLowerCase() === 'movie'))) return;
      const eventName = String(payload.event || '').toLowerCase();
      if (!['timeupdate', 'play', 'pause', 'seeked', 'ended'].includes(eventName)) return;

      const reportedSeason = Number(payload.season);
      const reportedEpisode = Number(payload.episode);
      const hasEpisode = isSeries && Number.isInteger(reportedSeason) && reportedSeason > 0 && Number.isInteger(reportedEpisode) && reportedEpisode > 0;
      const episodeChanged = hasEpisode && (reportedSeason !== season || reportedEpisode !== episode);
      if (episodeChanged) {
        season = reportedSeason;
        episode = reportedEpisode;
        history.replaceState({}, '', watchPathFor('tv', id, season, episode));
        refreshWatchTitle();
        // Rebuild selector URLs and active states, but do not reload the iframe: VidKing
        // has already moved playback into the next episode in its own player.
        renderSourcesForEpisode({ reloadPlayer: false, resumeSeconds: 0 });
        void loadSeason(season);
        lastSavedTimeBucket = -1;
      }

      // Current VidKing builds use currentTime; accept timestamp only when it is a plausible
      // seconds offset (some player builds documented it under that name).
      const reportedTimestamp = Number(payload.timestamp);
      const reportedCurrentTime = payload.currentTime ?? (Number.isFinite(reportedTimestamp) && reportedTimestamp >= 0 && reportedTimestamp < 60 * 60 * 24 ? reportedTimestamp : undefined);
      const currentTime = Number(reportedCurrentTime);
      const duration = Number(payload.duration);
      const numericProgress = Number(payload.progress);
      let progress = Number.isFinite(numericProgress) ? Math.max(0, Math.min(100, numericProgress)) : (Number.isFinite(currentTime) && duration > 0 ? Math.max(0, Math.min(100, currentTime / duration * 100)) : undefined);
      if (eventName === 'ended') progress = 100;
      const safeCurrentTime = Number.isFinite(currentTime) && currentTime >= 0 && currentTime < 60 * 60 * 24 ? currentTime : undefined;
      const timeBucket = Number.isFinite(safeCurrentTime) ? Math.floor(safeCurrentTime / 5) : -1;
      const episodeKey = `${season}:${episode}`;
      const isImportantEvent = ['pause', 'seeked', 'ended'].includes(eventName) || episodeChanged || episodeKey !== lastSavedEpisodeKey;
      if (eventName !== 'timeupdate' || isImportantEvent || timeBucket !== lastSavedTimeBucket) {
        updateWatchHistory(item, {
          season: isSeries ? season : null,
          episode: isSeries ? episode : null,
          progress,
          resumeSeconds: safeCurrentTime,
          duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
          sourceName: 'VidKing',
        });
        lastSavedEpisodeKey = episodeKey;
        lastSavedTimeBucket = timeBucket;
      }
    };
    window.addEventListener('message', state.watchMessageHandler);
  } catch (error) {
    if (renderSequence === state.renderSequence) renderError(error.message);
  }
}
function buildSources(type, id, season, episode, details = null, resumeSeconds = 0) {
  const movie = type === 'movie';
  const encoded = encodeURIComponent(id);
  const s = Math.max(1, Number(season) || 1);
  const e = Math.max(1, Number(episode) || 1);
  const imdbId = details?.imdb_id || details?.external_ids?.imdb_id || '';
  const progressParam = Number(resumeSeconds) > 15 ? `&progress=${Math.floor(Number(resumeSeconds))}` : '';
  const map = {
    'VidKing': { name:'VidKing', url:movie ? `https://www.vidking.net/embed/movie/${encoded}?autoPlay=${state.settings.autoplay}&nextEpisode=true&episodeSelector=true${progressParam}` : `https://www.vidking.net/embed/tv/${encoded}/${s}/${e}?autoPlay=${state.settings.autoplay}&nextEpisode=true&episodeSelector=true${progressParam}` },
    'VidSrc': { name:'VidSrc', url:movie ? `https://vidsrc.sh/embed/movie/${encoded}` : `https://vidsrc.sh/embed/tv/${encoded}/${s}/${e}` },
    'VidSrc TW': { name:'VidSrc TW', url:movie ? `https://vidsrc.tw/embed/movie/${encoded}` : `https://vidsrc.tw/embed/tv/${encoded}/${s}/${e}` },
    'VidSrc Link': { name:'VidSrc Link', url:movie ? `https://vidsrc.link/embed/movie/${encoded}` : `https://vidsrc.link/embed/tv/${encoded}/${s}/${e}` },
    'VidSrc Wiki': { name:'VidSrc Wiki', url:movie ? `https://vidsrc.wiki/embed/movie/${encoded}` : `https://vidsrc.wiki/embed/tv/${encoded}/${s}/${e}` },
    'VidSrc API': { name:'VidSrc API', url:movie ? `https://vidsrc.sh/embed/movie?tmdb=${encoded}` : `https://vidsrc.sh/embed/tv?tmdb=${encoded}&season=${s}&episode=${e}` },
    'VidCore': { name:'VidCore', url:movie ? `https://vidcore.org/embed/movie/${encoded}?autoplay=false` : `https://vidcore.org/embed/tv/${encoded}/${s}/${e}?autoplay=false` },
  };
  const configured = configuredEmbedProviders.map(provider => {
    const template = movie ? provider.movie : provider.tv;
    if (typeof template !== 'string' || !template) return null;
    if (template.includes('{imdb}') && !imdbId) return null;
    const expanded = template
      .replaceAll('{id}', encoded)
      .replaceAll('{imdb}', encodeURIComponent(imdbId))
      .replaceAll('{season}', String(s))
      .replaceAll('{episode}', String(e));
    try {
      const url = new URL(expanded, location.origin);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      return { name: provider.name, url: url.href };
    } catch { return null; }
  }).filter(Boolean);
  for (const source of configured) {
    if (!Object.hasOwn(map, source.name)) map[source.name] = source;
  }
  const order = Array.isArray(state.settings.serverOrder) ? state.settings.serverOrder : DEFAULT_SERVER_ORDER;
  const preferred = order.map(name => map[name]).filter(Boolean);
  const used = new Set(preferred.map(source => source.name.toLowerCase()));
  const remaining = Object.values(map).filter(source => !used.has(source.name.toLowerCase()));
  return [...preferred, ...remaining];
}
function toggleList(item) {
  const type = mediaType(item);
  if (isSaved(item.id, type)) { state.list = state.list.filter(x => !(x.id === item.id && x.media_type === type)); showToast('Removed from My List'); }
  else { state.list.unshift({ id:item.id, media_type:type, title:item.title, poster:item.poster, release_date:item.release_date, vote_average:item.vote_average }); showToast('Added to My List'); }
  saveState(); const btn = document.querySelector('#save-btn'); if (btn) btn.innerHTML = isSaved(item.id,type) ? `${iconWrap('check')} In My List` : `${iconWrap('plus')} My List`;
}
function renderSavedPage(kind) {
  const isHistory = kind === 'history'; const items = (isHistory ? state.history : state.list).map(x => ({...x, media_type:x.media_type}));
  app.innerHTML = `${nav(isHistory?'history':'library')}<main id="main-content" tabindex="-1" class="page-shell page"><div class="page-top personal-top"><div><span class="eyebrow">Personal</span><h1 class="page-title">${isHistory?'History':'My List'}</h1><p class="page-intro">${isHistory?'Recently opened titles on this device.':'Saved titles stored locally in this browser.'}</p></div><div class="personal-tabs"><a class="${!isHistory?'active':''}" href="/my-list" data-link>${iconWrap('list')} My List</a><a class="${isHistory?'active':''}" href="/history" data-link>${iconWrap('clock')} History</a></div></div>${items.length ? `<div class="grid">${items.map(card).join('')}</div>` : `<div class="empty">${isHistory?'No watch history yet.':'Nothing saved yet.'}</div>`}${footer()}</main>`;
}
function settingToggleRow(key, title, description, checked = false) {
  return `<div class="setting-row"><div class="setting-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div><label class="switch"><input type="checkbox" data-setting-toggle="${key}" aria-label="${escapeHtml(title)}" ${checked ? 'checked' : ''}><span class="switch-track"><span class="switch-thumb"></span></span></label></div>`;
}
function settingChoice(key, title, description, options, value) {
  return `<div class="setting-row setting-choice-row"><div class="setting-copy"><strong id="setting-label-${key}">${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div><div class="setting-choice"><button type="button" class="setting-select" data-setting-select="${key}" aria-labelledby="setting-label-${key} setting-value-${key}" aria-haspopup="listbox" aria-controls="setting-menu-${key}" aria-expanded="false"><span id="setting-value-${key}" data-setting-value="${key}">${escapeHtml(options.find(x=>x.value===value)?.label || value)}</span>${iconWrap('chevronDown')}</button><div id="setting-menu-${key}" class="setting-menu" data-setting-menu="${key}" role="listbox" aria-label="${escapeHtml(title)} options" tabindex="-1">${options.map(o=>`<button type="button" role="option" aria-selected="${o.value===value}" tabindex="-1" data-setting-option="${key}" data-value="${escapeHtml(o.value)}" class="${o.value===value?'active':''}">${iconWrap(o.icon || 'check')}<span>${escapeHtml(o.label)}</span></button>`).join('')}</div></div></div>`;
}
function accentPalette(value) {
  const current = ACCENT_OPTIONS.find(o => o.value === value) || { label:'Custom colours', color:state.settings.accentPrimary, secondary:state.settings.accentSecondary };
  return `<div class="setting-row accent-setting-row"><div class="setting-copy"><strong id="setting-label-accent">Accent palette</strong><span>Search dual-tone palettes or choose any two colours for buttons, active states, glows and navigation.</span></div><div class="accent-choice">
    <div class="accent-current-line"><i id="accent-current-swatch" style="--sw1:${state.settings.accentPrimary};--sw2:${state.settings.accentSecondary}" aria-hidden="true"></i><strong id="accent-current-name">${escapeHtml(current.label)}</strong></div>
    <div class="liquid-search accent-palette-search" id="accent-palette-search"><div class="search-goo" aria-hidden="true"><b></b><i></i></div><label class="sr-only" for="accent-palette-input">Search accent palettes</label><input id="accent-palette-input" type="search" placeholder="Search accent palettes" autocomplete="off" spellcheck="false" aria-controls="accent-palette-results" aria-expanded="false"><button class="search-toggle" id="accent-palette-toggle" type="button" aria-label="Open accent palette search" aria-expanded="false">${iconWrap('search')}</button><div class="search-results accent-palette-results" id="accent-palette-results" role="listbox" aria-label="Accent palettes" hidden></div></div>
    <div class="accent-custom-colours"><label><span>Accent one</span><input type="color" id="accent-primary-picker" data-accent-color="accentPrimary" value="${state.settings.accentPrimary}" aria-label="Primary accent colour"></label><label><span>Accent two</span><input type="color" id="accent-secondary-picker" data-accent-color="accentSecondary" value="${state.settings.accentSecondary}" aria-label="Secondary accent colour"></label></div>
  </div></div>`;
}
function renderAccentPaletteResults(rawQuery = '') {
  const host = document.querySelector('#accent-palette-results');
  if (!host) return;
  const q = String(rawQuery || '').trim().toLowerCase();
  const matches = ACCENT_OPTIONS.filter(p => `${p.label} ${p.value}`.toLowerCase().replace(/[/-]/g, ' ').includes(q.replace(/[/-]/g, ' ')));
  host.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement('div'); empty.className = 'accent-palette-empty'; empty.textContent = 'No accent palettes found.'; host.appendChild(empty); host.hidden = false; return;
  }
  host.innerHTML = matches.map(p => `<button type="button" class="accent-palette-result" role="option" aria-selected="${state.settings.accent === p.value}" data-accent-palette="${p.value}"><i class="accent-option-swatch" style="--sw1:${p.color};--sw2:${p.secondary}" aria-hidden="true"></i><span class="accent-palette-copy"><strong>${escapeHtml(p.label)}</strong><small>${p.color.toUpperCase()} / ${p.secondary.toUpperCase()}</small></span>${iconWrap('chevron')}</button>`).join('');
  host.hidden = false;
}
function selectAccentPalette(value) {
  const preset = ACCENT_OPTIONS.find(p => p.value === value);
  if (!preset) return;
  state.settings.accent = preset.value;
  state.settings.accentPrimary = preset.color;
  state.settings.accentSecondary = preset.secondary;
  applyAccent(preset.value);
  const name = document.querySelector('#accent-current-name'); if (name) name.textContent = preset.label;
  const swatch = document.querySelector('#accent-current-swatch'); if (swatch) { swatch.style.setProperty('--sw1', preset.color); swatch.style.setProperty('--sw2', preset.secondary); }
  const primary = document.querySelector('#accent-primary-picker'); if (primary) primary.value = preset.color;
  const secondary = document.querySelector('#accent-secondary-picker'); if (secondary) secondary.value = preset.secondary;
  const note = document.querySelector('#accent-palette-note'); if (note) note.textContent = 'Saved locally';
  document.querySelectorAll('#accent-palette-results [data-accent-palette]').forEach(option => option.setAttribute('aria-selected', String(option.dataset.accentPalette === preset.value)));
  const search = document.querySelector('#accent-palette-search'); const input = document.querySelector('#accent-palette-input'); const toggle = document.querySelector('#accent-palette-toggle'); const results = document.querySelector('#accent-palette-results');
  search?.classList.remove('open'); input?.setAttribute('aria-expanded','false'); toggle?.setAttribute('aria-expanded','false'); toggle?.setAttribute('aria-label','Open accent palette search'); if (results) results.hidden = true;
  showToast(`${preset.label} accent saved`);
}
function bindAccentPaletteSearch() {
  const wrap = document.querySelector('#accent-palette-search'); const input = document.querySelector('#accent-palette-input'); const toggle = document.querySelector('#accent-palette-toggle'); const results = document.querySelector('#accent-palette-results');
  if (!wrap || !input || !toggle || !results) return;
  toggle.addEventListener('click', () => {
    const open = !wrap.classList.contains('open');
    wrap.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Close accent palette search' : 'Open accent palette search'); input.setAttribute('aria-expanded', String(open));
    if (open) { results.hidden = false; renderAccentPaletteResults(input.value); input.focus({preventScroll:true}); }
    else { results.hidden = true; toggle.focus({preventScroll:true}); }
  });
  input.addEventListener('input', () => renderAccentPaletteResults(input.value));
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); wrap.classList.remove('open'); results.hidden = true; input.setAttribute('aria-expanded','false'); toggle.setAttribute('aria-expanded','false'); toggle.focus({preventScroll:true}); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); results.querySelector('[data-accent-palette]')?.focus({preventScroll:true}); }
    else if (event.key === 'Enter') { event.preventDefault(); const option = results.querySelector('[data-accent-palette]'); if (option) selectAccentPalette(option.dataset.accentPalette); }
  });
  results.addEventListener('keydown', event => {
    const options = [...results.querySelectorAll('[data-accent-palette]')]; const index = options.indexOf(document.activeElement); let target = null;
    if (event.key === 'Escape') { event.preventDefault(); wrap.classList.remove('open'); results.hidden = true; toggle.focus({preventScroll:true}); return; }
    if (event.key === 'ArrowDown') target = options[Math.min(options.length - 1, index + 1)];
    if (event.key === 'ArrowUp') target = index <= 0 ? input : options[index - 1];
    if (event.key === 'Home') target = options[0];
    if (event.key === 'End') target = options.at(-1);
    if (target) { event.preventDefault(); target.focus({preventScroll:true}); }
  });
  renderAccentPaletteResults(''); results.hidden = true;
}
function settingsSection(id, iconName, title, intro, body, activeSection) {
  return `<section id="settings-${id}" class="settings-section ${activeSection===id?'is-active':''}"><div class="settings-section-head"><div class="settings-section-icon">${iconWrap(iconName)}</div><div><span class="section-kicker">Settings</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(intro)}</p></div></div>${body}</section>`;
}
function renderSettings() {
  const qs = new URLSearchParams(location.search); const requested = qs.get('section');
  const active = ['appearance','playback','servers','region'].includes(requested) ? requested : 'appearance';
  const s = state.settings;
  const tabs = [
    ['appearance','Appearance','palette'],['playback','Playback','sliders'],['servers','Source Order','server'],['region','Region','globe']
  ];
  const body = `
    ${settingsSection('appearance','palette','Appearance','Tune the visual system, browsing layout and motion.', `
      ${gradientSettingsMarkup()}
      ${settingChoice('theme','Theme','Choose the overall lightness of the interface.',[{value:'dark',label:'Dark',icon:'moon'},{value:'light',label:'Light',icon:'sun'},{value:'system',label:'System',icon:'monitor'}],s.theme)}
      ${accentPalette(s.accent)}
      ${settingChoice('detailView','Detail View Type','Choose the full-page title experience or the compact modal.',[{value:'page',label:'Page',icon:'monitor'},{value:'modal',label:'Modal',icon:'modal'}],s.detailView)}
      ${settingToggleRow('imageLogos','Use Image Logos','Use title artwork when TMDB provides a logo.',s.imageLogos)}
      ${settingToggleRow('trailers','Trailer Autoplay','Attempt autoplay for supported trailer previews; browsers may block autoplay.',s.trailers)}
      ${settingToggleRow('spoilerFree','Spoiler-Free Episodes','Hide episode titles and metadata in episode lists.',s.spoilerFree)}
      ${settingToggleRow('reduceMotion','Reduce Motion','Dial back the spring and transition effects.',s.reduceMotion)}
    `, active)}
    ${settingsSection('playback','sliders','Playback','Configure the parts of playback LUMA can control locally.', `
      ${settingToggleRow('autoplay','Autoplay on Supported Player','Pass the autoplay preference to VidKing. Other sources may ignore this setting.',s.autoplay)}
    `, active)}
    ${settingsSection('region','globe','Streaming Region','Choose the region used for provider availability and region-dependent catalogue requests.', `${settingChoice('region','Streaming Region','Provider availability differs by country.',[{value:'NP',label:'Nepal'},{value:'US',label:'United States'},{value:'GB',label:'United Kingdom'},{value:'IN',label:'India'},{value:'AU',label:'Australia'},{value:'CA',label:'Canada'}],s.region)}<p class="settings-note">Changing region refreshes the current page. Availability is supplied by TMDB and may not reflect every service plan.</p>`, active)}
    ${settingsSection('servers','server','Server Order','Choose the order in which source options are shown. LUMA cannot reliably detect failures inside third-party players.', `<div class="server-list" id="server-list" role="list" aria-label="Preferred player source order">${s.serverOrder.map((name,i)=>`<div class="server-item" role="listitem" aria-posinset="${i+1}" aria-setsize="${s.serverOrder.length}" draggable="true" data-server="${escapeHtml(name)}" tabindex="0"><span class="grip" aria-hidden="true">${iconWrap('grip')}</span><span class="server-index" aria-label="Position ${i+1}">${i+1}</span><strong>${escapeHtml(name)}</strong><span class="server-status">Unverified</span><span class="server-move-actions"><button type="button" class="server-move" data-server-move="up" aria-label="Move ${escapeHtml(name)} up" ${i===0?'disabled':''}>↑</button><button type="button" class="server-move" data-server-move="down" aria-label="Move ${escapeHtml(name)} down" ${i===s.serverOrder.length-1?'disabled':''}>↓</button></span></div>`).join('')}</div><p class="settings-note">This changes source display order only; it does not confirm availability or automatically detect playback failures.</p>`, active)}
  `;
  app.innerHTML = `${nav('settings')}<main id="main-content" tabindex="-1" class="page settings-page"><div class="settings-shell"><aside class="settings-sidebar"><div class="settings-title"><span class="eyebrow">LUMA</span><h1>Settings</h1><p>Keep the useful controls and nothing extra.</p></div><nav class="settings-tabs">${tabs.map(([id,label,ic])=>`<a class="settings-tab ${id===active?'active':''}" href="/settings?section=${id}" data-link>${iconWrap(ic)}<span>${label}</span></a>`).join('')}</nav></aside><div class="settings-content">${body}</div></div>${footer()}</main>`;
  bindSettings();
}
function dropdownTriggerSelector() { return '[data-setting-select],[data-filter-select],[data-season-select]'; }
function dropdownMenuFor(trigger) {
  const menuId = trigger?.getAttribute('aria-controls');
  return menuId ? document.getElementById(menuId) : trigger?.nextElementSibling;
}
function dropdownOptions(menu) { return menu ? [...menu.querySelectorAll('button')] : []; }
function closeAccessibleDropdown(trigger, { restoreFocus = false } = {}) {
  if (!trigger) return;
  trigger.setAttribute('aria-expanded', 'false');
  dropdownMenuFor(trigger)?.classList.remove('open');
  if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
}
function closeAllAccessibleDropdowns({ except = null } = {}) {
  document.querySelectorAll(dropdownTriggerSelector()).forEach(trigger => {
    if (trigger.getAttribute('aria-expanded') !== 'true') return;
    if (trigger !== except) closeAccessibleDropdown(trigger);
  });
}
function openAccessibleDropdown(trigger, { focusOption = true, direction = 1 } = {}) {
  if (!trigger) return;
  closeAllAccessibleDropdowns({ except: trigger });
  const menu = dropdownMenuFor(trigger);
  if (!menu) return;
  trigger.setAttribute('aria-expanded', 'true');
  menu.classList.add('open');
  if (focusOption) {
    const options = dropdownOptions(menu);
    const active = options.find(option => option.getAttribute('aria-selected') === 'true' || option.classList.contains('active'));
    const target = active || (direction < 0 ? options.at(-1) : options[0]);
    target?.focus({ preventScroll: true });
  }
}
function toggleAccessibleDropdown(trigger) {
  if (!trigger) return;
  const shouldOpen = trigger.getAttribute('aria-expanded') !== 'true';
  if (shouldOpen) openAccessibleDropdown(trigger, { focusOption: state.lastInputMethod === 'keyboard' });
  else closeAccessibleDropdown(trigger);
}
function bindServerMoveButtons() {
  const list = document.querySelector('#server-list');
  if (!list) return;
  list.querySelectorAll('[data-server-move]').forEach(button => button.addEventListener('click', () => {
    const item = button.closest('.server-item');
    const direction = button.dataset.serverMove;
    const neighbour = direction === 'up' ? item?.previousElementSibling : item?.nextElementSibling;
    if (!item || !neighbour) return;
    if (direction === 'up') list.insertBefore(item, neighbour); else list.insertBefore(neighbour, item);
    refreshServerNumbers();
    saveServerOrder();
    const focusTarget = item.querySelector(`[data-server-move="${direction}"]:not(:disabled)`) || item;
    focusTarget.focus({ preventScroll: true });
  }));
}
function refreshServerNumbers() {
  const list = document.querySelector('#server-list');
  list?.querySelectorAll('.server-item').forEach((el, i, all) => {
    el.querySelector('.server-index').textContent = i + 1;
    el.setAttribute('aria-posinset', String(i + 1));
    el.setAttribute('aria-setsize', String(all.length));
    el.querySelector('.server-index').setAttribute('aria-label', `Position ${i + 1}`);
    el.querySelector('[data-server-move="up"]')?.toggleAttribute('disabled', i === 0);
    el.querySelector('[data-server-move="down"]')?.toggleAttribute('disabled', i === all.length - 1);
  });
}
function saveServerOrder() {
  const list = document.querySelector('#server-list');
  if (!list) return;
  state.settings.serverOrder = [...list.querySelectorAll('.server-item')].map(el => el.dataset.server);
  saveSettings();
  showToast('Server order saved');
}
function bindSettings() {
  document.querySelectorAll('[data-setting-toggle]').forEach(input => input.addEventListener('change', () => {
    updateSetting(input.dataset.settingToggle, input.checked);
    if (input.dataset.settingToggle === 'reduceMotion') { applySettings(); if (shouldReduceMotion()) stopHeroCarousel(); else if (!state.heroPaused && !state.heroHoverPaused) startHeroCarousel(); syncHeroControls(); }
    if (input.dataset.settingToggle === 'imageLogos' || input.dataset.settingToggle === 'trailers' || input.dataset.settingToggle === 'spoilerFree') showToast(`${input.checked ? 'Enabled' : 'Disabled'} ${input.closest('.setting-row')?.querySelector('strong')?.textContent || 'setting'}`);
  }));
  document.querySelectorAll('[data-setting-select]').forEach(btn => btn.addEventListener('click', () => toggleAccessibleDropdown(btn)));
  document.querySelectorAll('[data-accent-color]').forEach(input => input.addEventListener('input', () => {
    state.settings[input.dataset.accentColor] = input.value;
    state.settings.accent = 'custom';
    applyAccent('custom');
    const node = document.querySelector('#accent-current-name'); if (node) node.textContent = 'Custom colours';
    const swatch = document.querySelector('#accent-current-swatch'); if (swatch) { swatch.style.setProperty('--sw1',state.settings.accentPrimary); swatch.style.setProperty('--sw2',state.settings.accentSecondary); }
    const value = document.querySelector('#accent-palette-note'); if (value) value.textContent = 'Custom colours saved';
  }));
  bindGradientSettings();
  bindAccentPaletteSearch();
  document.querySelectorAll('[data-setting-option]').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.settingOption; let value = btn.dataset.value;
    if (key === 'accent' && value !== 'custom') {
      const preset = ACCENT_OPTIONS.find(option => option.value === value);
      if (preset) { state.settings.accentPrimary = preset.color; state.settings.accentSecondary = preset.secondary; }
    }
    updateSetting(key, value);
    if (key==='theme') applyTheme(value);
    if (key==='accent') {
      applyAccent(value);
      const p = document.querySelector('#accent-primary-picker'); if (p) p.value = state.settings.accentPrimary;
      const q = document.querySelector('#accent-secondary-picker'); if (q) q.value = state.settings.accentSecondary;
    }
    const label = key === 'accent' ? (value === 'custom' ? 'Custom colours' : (ACCENT_OPTIONS.find(option => option.value === value)?.label || value)) : (btn.querySelector('span')?.textContent || value);
    const valueNode = document.querySelector(`[data-setting-value="${key}"]`);
    if (valueNode) valueNode.textContent = label;
    if (key === 'accent') {
      const selected = ACCENT_OPTIONS.find(x=>x.value===value) || { color:state.settings.accentPrimary, secondary:state.settings.accentSecondary, label:'Custom colours' };
      const node = document.querySelector('.accent-selected');
      if (node) node.innerHTML = `<i style="--sw1:${selected.color};--sw2:${selected.secondary}"></i>${escapeHtml(selected.label)}`;
      document.querySelectorAll('[data-setting-option="accent"]').forEach(el => { el.classList.toggle('active', el.dataset.value===value); el.setAttribute('aria-selected', String(el.dataset.value===value)); });
    }
    const trigger = document.querySelector(`[data-setting-select="${key}"]`);
    document.querySelectorAll(`[data-setting-option="${key}"]`).forEach(option => {
      const selected = option.dataset.value === value;
      option.classList.toggle('active', selected);
      option.setAttribute('aria-selected', String(selected));
    });
    closeAccessibleDropdown(trigger, { restoreFocus: key !== 'region' });
    if (key === 'region') { state.cache.clear(); showToast(`${label} region selected`); navigate(`${location.pathname}${location.search}`); }
    if (key==='detailView' || key==='accent' || key==='theme') showToast(`${label} saved`);
  }));
  bindServerDrag();
}
function bindServerDrag() {
  const list = document.querySelector('#server-list'); if (!list) return; let dragged = null;
  list.querySelectorAll('.server-item').forEach(item => {
    item.addEventListener('dragstart', event => {
      if (event.target.closest('.server-move')) { event.preventDefault(); return; }
      dragged = item; item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => { item.classList.remove('dragging'); if (dragged) saveServerOrder(); dragged = null; });
    item.addEventListener('dragover', event => {
      event.preventDefault(); if (!dragged || dragged === item) return;
      const rect = item.getBoundingClientRect(); const before = event.clientY < rect.top + rect.height / 2;
      list.insertBefore(dragged, before ? item : item.nextSibling); refreshServerNumbers();
    });
    item.addEventListener('keydown', event => {
      if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const button = item.querySelector(`[data-server-move="${event.key === 'ArrowUp' ? 'up' : 'down'}"]`);
      button?.click();
    });
  });
  bindServerMoveButtons();
  refreshServerNumbers();
}
function renderAbout() {
  app.innerHTML = `${nav()}<main id="main-content" tabindex="-1" class="page-shell page"><div class="page-top"><div><span class="eyebrow">Inside LUMA</span><h1 class="page-title">About</h1><p class="page-intro">A focused catalogue experience for discovery, local lists and a provider-agnostic watch layer.</p></div></div><div class="about-grid"><div class="info-panel"><div class="panel-head"><div><span class="panel-kicker">Interface</span><h3>Cinematic by default</h3></div>${iconWrap('layers')}</div><p>Large artwork, compact metadata, fast catalogue browsing and a simple player flow keep the interface focused on finding something worth watching.</p></div><div class="info-panel"><div class="panel-head"><div><span class="panel-kicker">Data</span><h3>TMDB powered</h3></div>${iconWrap('globe')}</div><p>This product uses the TMDB API for metadata and imagery but is not endorsed or certified by TMDB.</p></div></div>${footer()}</main>`;
}
function renderError(message) { app.innerHTML = `${nav()}<main id="main-content" tabindex="-1" class="page-shell page"><div class="empty"><div>${iconWrap('info')}</div><div>${escapeHtml(message)}</div><a class="btn secondary" href="/" data-link>Return home</a></div>${footer()}</main>`; }
function navigate(url) {
  history.pushState({}, '', url);
  const render = () => router();
  if (document.startViewTransition && !shouldReduceMotion()) {
    document.startViewTransition(render);
  } else {
    render();
  }
  requestAnimationFrame(() => window.scrollTo({ top:0, behavior: state.settings.reduceMotion ? 'auto' : 'smooth' }));
}
function routeParts() { return location.pathname.replace(/\/+$/, '').split('/').filter(Boolean); }
async function router() {
  if (state.watchMessageHandler) { window.removeEventListener('message', state.watchMessageHandler); state.watchMessageHandler = null; }
  state.renderSequence += 1;
  const parts = routeParts();
  if (parts[0] === 'search') {
    const query = new URLSearchParams(location.search).get('q') || '';
    history.replaceState({}, '', '/');
    await renderHome();
    openGlobalSearch(query);
    return;
  }
  const route = `/${parts.join('/')}`;
  const staticMeta = {
    '/': { title: 'Discover Movies & TV', description: 'Explore trending movies, popular series, top-rated picks and new releases with LUMA Stream.', robots: 'index,follow' },
    '/browse': { title: 'Browse Movies & Series', description: 'Explore movies, TV series, top-rated titles and streaming provider discovery on LUMA Stream.' },
    '/movies': { title: 'Movies', description: 'Browse movies by popularity, release year, rating, genre and provider on LUMA Stream.' },
    '/tv': { title: 'TV Series', description: 'Discover TV series by popularity, first-air year, rating, genre and provider on LUMA Stream.' },
    '/my-list': { title: 'My List', description: 'Your locally saved movies and series in LUMA Stream.', robots: 'noindex,nofollow' },
    '/history': { title: 'History', description: 'Recently opened titles in your LUMA Stream browsing history.', robots: 'noindex,nofollow' },
    '/settings': { title: 'Settings', description: 'Customize your LUMA Stream viewing, appearance and region preferences.', robots: 'noindex,nofollow' },
    '/about': { title: 'About LUMA Stream', description: 'Learn about LUMA Stream and its TMDB-powered discovery catalogue.' },
  };
  const safeMeta = staticMeta[route] || (parts[0] === 'person' ? { title: 'Cast & Crew Profile', description: 'Explore filmographies and screen credits on LUMA Stream.' } : parts[0] === 'details' ? { title: 'Title Details', description: 'Explore movie and television details on LUMA Stream.' } : parts[0] === 'watch' ? { title: 'Watch', description: 'Viewing options and episode navigation on LUMA Stream.', robots: 'noindex,follow' } : { title: 'Page Not Found', description: 'The requested LUMA Stream page could not be found.', robots: 'noindex,follow' });
  const isWatch = parts[0] === 'watch' && parts.length >= 3;
  const canonical = isWatch ? `/details/${parts[1]}/${parts[2]}` : (staticMeta[route] ? route : location.pathname);
  setPageMetadata({ ...safeMeta, path: canonical, image: null, preloadImage: false });
  if (!parts.length) return renderHome();
  if (parts[0] === 'browse') return renderBrowse();
  if (parts[0] === 'movies') return renderCatalog('movie');
  if (parts[0] === 'tv') return renderCatalog('tv');
  if (parts[0] === 'person' && parts.length >= 2) return renderPersonDetails(Number(parts[1]));
  if (parts[0] === 'my-list') return renderSavedPage('list');
  if (parts[0] === 'history') return renderSavedPage('history');
  if (parts[0] === 'settings') return renderSettings();
  if (parts[0] === 'about') return renderAbout();
  if (parts[0] === 'details' && parts.length >= 3) return renderDetails(parts[1], Number(parts[2]));
  if (parts[0] === 'watch' && parts.length >= 3) return renderWatch(parts[1], Number(parts[2]));
  renderError('Page not found.');
}

function closeAccessibleModal(overlay) {
  if (!overlay) return;
  const returnFocus = overlay._returnFocus || state.modalTrigger;
  overlay.remove();
  if (!document.querySelector('.modal-backdrop')) document.body.classList.remove('modal-open');
  state.modalTrigger = null;
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
}
function handleModalKeydown(event) {
  const overlay = [...document.querySelectorAll('.modal-backdrop')].at(-1);
  if (!overlay) return false;
  if (event.key === 'Escape') { event.preventDefault(); closeAccessibleModal(overlay); return true; }
  if (event.key !== 'Tab') return false;
  const focusable = [...overlay.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(element => element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
  if (!focusable.length) { event.preventDefault(); overlay.querySelector('[role="dialog"]')?.focus(); return true; }
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) { event.preventDefault(); last.focus(); return true; }
  if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) { event.preventDefault(); first.focus(); return true; }
  return false;
}
async function openDetailModal(type,id) {
  const opener = document.activeElement;
  const overlay=document.createElement('div'); overlay.className='modal-backdrop'; overlay.innerHTML=`<div class="modal-card detail-modal-loading" role="dialog" aria-modal="true" aria-label="Title details" tabindex="-1"><button type="button" class="modal-close" data-modal-close aria-label="Close title details">${iconWrap('chevronDown')}</button><div class="empty" role="status">Loading title…</div></div>`; overlay._returnFocus = opener; state.modalTrigger = opener; document.body.append(overlay); document.body.classList.add('modal-open');
  requestAnimationFrame(() => overlay.querySelector('[data-modal-close]')?.focus({ preventScroll: true }));
  overlay.addEventListener('click',event=>{if(event.target===overlay) closeAccessibleModal(overlay);});
  overlay.querySelector('[data-modal-close]')?.addEventListener('click', () => closeAccessibleModal(overlay));
  try {
    const data=await api(`/api/${type}/${id}`);
    if (!overlay.isConnected) return;
    const item=data.details; const trailer=item.videos?.results?.find(v=>v.site==='YouTube'&&['Trailer','Teaser'].includes(v.type)); const saved=isSaved(item.id,type); const creators=type==='tv'?dedupeBy(item.created_by||[],'id').slice(0,2):dedupeBy((data.credits?.crew||[]).filter(x=>x.job==='Director'),'id').slice(0,2); const genres=(item.genres||[]).slice(0,4);
    overlay.querySelector('.modal-card').className='modal-card detail-modal'; overlay.querySelector('.modal-card').setAttribute('aria-labelledby', 'detail-modal-title'); overlay.querySelector('.modal-card').removeAttribute('aria-label'); overlay.querySelector('.modal-card').innerHTML=`<button type="button" class="modal-close" data-modal-close aria-label="Close title details">${iconWrap('chevronDown')}</button><div class="detail-modal-grid"><img src="${item.posterLarge||item.poster||''}" alt="${escapeHtml(item.title)} poster"><div><span class="eyebrow">${type==='tv'?'Series':'Movie'}</span><h2 id="detail-modal-title">${escapeHtml(item.title)}</h2><div class="meta-row"><span>${year(item.release_date)}</span><span class="dot"></span><span>${type==='tv'?`${item.number_of_seasons||0} seasons`:formatMinutes(item.runtime)}</span><span class="dot"></span><span>${iconWrap('star')} ${rating(item.vote_average)}</span></div><div class="tag-row">${genres.map(g=>`<span class="tag">${escapeHtml(g.name)}</span>`).join('')}</div>${creators.length?`<div class="creator-inline"><span>${type==='tv'?'Created by':'Directed by'}</span><strong>${creators.map(p=>escapeHtml(p.name)).join(', ')}</strong></div>`:''}<p class="details-overview">${escapeHtml(item.overview||'No overview available.')}</p><div class="hero-actions"><a class="btn primary" href="/watch/${type}/${item.id}" data-link>${iconWrap('play')} Watch now</a><button class="btn secondary" id="modal-save">${saved?iconWrap('check')+' In My List':iconWrap('plus')+' My List'}</button><a class="btn ghost" href="${detailHref(item)}?view=page" data-link data-force-page="true">Open page</a></div></div></div>`;
    overlay.querySelector('#modal-save')?.addEventListener('click',()=>toggleList(item));
    overlay.querySelector('[data-modal-close]')?.addEventListener('click', () => closeAccessibleModal(overlay));
    requestAnimationFrame(() => overlay.querySelector('[data-modal-close]')?.focus({ preventScroll: true }));
  } catch(e) {
    if (!overlay.isConnected) return;
    const modal = overlay.querySelector('.modal-card');
    modal.setAttribute('aria-label', 'Unable to load title details'); modal.removeAttribute('aria-labelledby');
    modal.innerHTML=`<button type="button" class="modal-close" data-modal-close aria-label="Close title details">${iconWrap('chevronDown')}</button><div class="empty" role="alert">${escapeHtml(e.message)}</div>`;
    modal.querySelector('[data-modal-close]')?.addEventListener('click', () => closeAccessibleModal(overlay));
    requestAnimationFrame(() => modal.querySelector('[data-modal-close]')?.focus({ preventScroll: true }));
  }
}

document.addEventListener('click', event => {
  const searchOpener = event.target.closest('[data-global-search-toggle],[data-open-global-search]');
  if (searchOpener) { event.preventDefault(); openGlobalSearch('', searchOpener); return; }
  if (event.target.closest('#global-search-close') || event.target.closest('#global-search-scrim')) { event.preventDefault(); closeGlobalSearch(); return; }
  const gradientPaletteOption = event.target.closest('[data-gradient-palette]');
  if (gradientPaletteOption) { event.preventDefault(); const palette = GRADIENT_PALETTES.find(item => item.name === gradientPaletteOption.dataset.gradientPalette); if (palette) applyGradientPalette(palette); return; }
  const accentPaletteOption = event.target.closest('[data-accent-palette]');
  if (accentPaletteOption) { event.preventDefault(); selectAccentPalette(accentPaletteOption.dataset.accentPalette); return; }
  const gradientTempoButton = event.target.closest('[data-gradient-tempo]');
  if (gradientTempoButton) { event.preventDefault(); setGradientTempo(Number(gradientTempoButton.dataset.gradientTempo), true); return; }
  if (event.target.closest('#gradient-motion-switch')) { event.preventDefault(); setGradientMotion(!state.settings.gradient.motion, true); return; }
  const synopsisToggle = event.target.closest('[data-synopsis-toggle]');
  if (synopsisToggle) { const copy = synopsisToggle.closest('.details-copy'); const open = !copy?.classList.contains('synopsis-open'); copy?.classList.toggle('synopsis-open', open); synopsisToggle.setAttribute('aria-expanded', String(open)); return; }
  const railBtn = event.target.closest('[data-row-scroll]');
  if (railBtn) { event.preventDefault(); const row=document.getElementById(railBtn.dataset.rowScroll); if(row) row.scrollBy({left:Number(railBtn.dataset.scrollDir||1)*Math.max(row.clientWidth*.85,220),behavior:'smooth'}); return; }
  const selectedOption = event.target.closest('[data-setting-option],[data-filter-option],[data-season-option]');
  if (selectedOption) return;
  const insideDropdown = event.target.closest('.setting-choice,.filter-control,.season-picker');
  if (!insideDropdown) closeAllAccessibleDropdowns();
  const heroControl = event.target.closest('[data-hero-dot],[data-hero-prev],[data-hero-next],[data-hero-toggle]');
  if (heroControl && state.heroItems.length) {
    event.preventDefault();
    if (heroControl.hasAttribute('data-hero-toggle')) {
      state.heroPaused = !state.heroPaused;
      syncHeroControls();
      if (state.heroPaused) stopHeroCarousel(); else startHeroCarousel();
      document.querySelector('[data-hero-toggle]')?.focus({ preventScroll: true });
    } else {
      const nextIndex = heroControl.hasAttribute('data-hero-prev') ? state.heroIndex - 1
        : heroControl.hasAttribute('data-hero-next') ? state.heroIndex + 1 : Number(heroControl.dataset.heroDot);
      const normalized = ((nextIndex % state.heroItems.length) + state.heroItems.length) % state.heroItems.length;
      const focusSelector = heroControl.hasAttribute('data-hero-prev') ? '[data-hero-prev]'
        : heroControl.hasAttribute('data-hero-next') ? '[data-hero-next]' : `[data-hero-dot="${normalized}"]`;
      showHeroSlide(nextIndex, { focusSelector });
    }
    return;
  }
  if (event.target.closest('#theme-toggle')) { event.preventDefault(); toggleTheme(); return; }
  const link = event.target.closest('[data-link]');
  if (link) {
    const href = link.getAttribute('href');
    if (href?.startsWith('/details/') && state.settings.detailView === 'modal' && !link.dataset.forcePage) {
      event.preventDefault(); const parts = href.split('/').filter(Boolean); openDetailModal(parts[1], Number(parts[2])); return;
    }
    if (href?.startsWith('/')) {
      event.preventDefault();
      const activeModal = [...document.querySelectorAll('.modal-backdrop')].at(-1);
      if (activeModal && activeModal.contains(link)) closeAccessibleModal(activeModal);
      if (link.closest('#global-search-panel')) closeGlobalSearch({ restoreFocus: false });
      navigate(href); return;
    }
  }
  const top = event.target.closest('[data-top]');
  if (top) { event.preventDefault(); window.scrollTo({ top:0, behavior:'smooth' }); }
});
document.addEventListener('keydown', event => {
  state.lastInputMethod = 'keyboard';
  if (handleModalKeydown(event)) return;
  const trigger = event.target.closest(dropdownTriggerSelector());
  if (trigger && event.key === 'Escape' && trigger.getAttribute('aria-expanded') === 'true') {
    event.preventDefault(); closeAccessibleDropdown(trigger, { restoreFocus: true }); return;
  }
  if (trigger && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const menu = dropdownMenuFor(trigger);
    if (trigger.getAttribute('aria-expanded') !== 'true') openAccessibleDropdown(trigger, { focusOption: true, direction: event.key === 'ArrowUp' || event.key === 'End' ? -1 : 1 });
    else {
      const options = dropdownOptions(menu);
      const focusedIndex = options.findIndex(option => option === document.activeElement || option.contains(document.activeElement));
      const selectedIndex = options.findIndex(option => option.getAttribute('aria-selected') === 'true' || option.classList.contains('active'));
      let target;
      if (event.key === 'Home') target = options[0];
      else if (event.key === 'End') target = options.at(-1);
      else if (focusedIndex < 0) target = options[Math.max(0, selectedIndex)];
      else target = options[(focusedIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length];
      target?.focus({ preventScroll: true });
    }
    return;
  }
  const menu = event.target.closest('.setting-menu,.filter-menu,.season-picker-menu');
  if (menu) {
    const triggerForMenu = document.querySelector(`[aria-controls="${menu.id}"]`);
    if (event.key === 'Escape') { event.preventDefault(); closeAccessibleDropdown(triggerForMenu, { restoreFocus: true }); return; }
    const options = dropdownOptions(menu); const index = options.findIndex(option => option === event.target || option.contains(event.target));
    let next = null;
    if (event.key === 'ArrowDown') next = options[Math.min(options.length - 1, Math.max(0, index + 1))];
    if (event.key === 'ArrowUp') next = options[Math.max(0, index - 1)];
    if (event.key === 'Home') next = options[0];
    if (event.key === 'End') next = options.at(-1);
    if (next) { event.preventDefault(); next.focus({ preventScroll: true }); return; }
  }
  const searchPanel = document.querySelector('#global-search-panel');
  if (searchPanel?.classList.contains('open')) {
    const searchInput = document.querySelector('#global-search-input');
    const options = [...document.querySelectorAll('#global-search-results .global-search-item')];
    const optionIndex = options.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); closeGlobalSearch(); return; }
    if (event.key === 'ArrowDown' && (document.activeElement === searchInput || optionIndex >= 0)) { event.preventDefault(); options[Math.min(options.length - 1, optionIndex + 1)]?.focus({preventScroll:true}); return; }
    if (event.key === 'ArrowUp' && optionIndex >= 0) { event.preventDefault(); if (optionIndex === 0) searchInput?.focus({preventScroll:true}); else options[optionIndex - 1]?.focus({preventScroll:true}); return; }
    if (event.key === 'Enter' && document.activeElement === searchInput && options.length) { event.preventDefault(); options[0].click(); return; }
    if (event.key === 'Tab') {
      const focusable = [...searchPanel.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')].filter(element => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length) {
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !searchPanel.contains(document.activeElement))) { event.preventDefault(); last.focus({preventScroll:true}); return; }
        if (!event.shiftKey && (document.activeElement === last || !searchPanel.contains(document.activeElement))) { event.preventDefault(); first.focus({preventScroll:true}); return; }
      }
    }
  }
  if (event.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName) && !document.querySelector('.modal-backdrop')) { event.preventDefault(); openGlobalSearch(); }
});
document.addEventListener('input', event => {
  if (event.target?.id === 'global-search-input') runGlobalSearch(event.target.value);
  if (event.target?.id === 'gradient-palette-input') renderGradientPaletteResults(event.target.value);
});
document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || image.dataset.fallbackApplied) return;
  let source = '';
  try { source = new URL(image.currentSrc || image.src, location.origin).hostname; } catch { return; }
  if (source !== 'image.tmdb.org') return;
  image.dataset.fallbackApplied = 'true';
  image.src = '/assets/poster-fallback.svg';
  image.classList.add('image-fallback');
}, true);
let searchMagnetFrame = 0;
document.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch' || shouldReduceMotion() || !window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;
  if (searchMagnetFrame) cancelAnimationFrame(searchMagnetFrame);
  searchMagnetFrame = requestAnimationFrame(() => {
    document.querySelectorAll('.liquid-search').forEach(search => {
      const rect = search.getBoundingClientRect();
      const cx = rect.right - 25; const cy = rect.top + 25;
      const dx = event.clientX - cx; const dy = event.clientY - cy;
      const distance = Math.hypot(dx, dy);
      const strength = distance < 150 ? 1 - distance / 150 : 0;
      search.style.setProperty('--mx', `${(Math.max(-10, Math.min(10, dx * .12)) * strength).toFixed(1)}px`);
      search.style.setProperty('--my', `${(Math.max(-8, Math.min(8, dy * .12)) * strength).toFixed(1)}px`);
    });
  });
}, { passive: true });
document.addEventListener('pointerleave', event => {
  if (event.target === document.documentElement) document.querySelectorAll('.liquid-search').forEach(search => { search.style.setProperty('--mx','0px'); search.style.setProperty('--my','0px'); });
}, true);
document.addEventListener('pointerdown', () => { state.lastInputMethod = 'pointer'; }, true);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopHeroCarousel();
  else if (!state.heroPaused && !state.heroHoverPaused) startHeroCarousel();
});
window.addEventListener('popstate', () => { const modal = [...document.querySelectorAll('.modal-backdrop')].at(-1); if (modal) closeAccessibleModal(modal); router(); });
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => { if (state.settings.theme === 'system') applyTheme('system'); });
window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => { if (shouldReduceMotion()) stopHeroCarousel(); else if (!state.heroPaused && !state.heroHoverPaused) startHeroCarousel(); syncHeroControls(); });
async function bootApp() {
  try {
    const rawSettings = safeStorageGet(SETTINGS_KEY, '{}');
    const parsedSettings = JSON.parse(rawSettings || '{}');
    if (!parsedSettings || !parsedSettings.region) {
      const response = await fetch('/api/config');
      if (response.ok) {
        const config = await response.json();
        if (['NP', 'US', 'GB', 'IN', 'AU', 'CA'].includes(config.region)) state.settings.region = config.region;
      }
    }
  } catch { /* Keep the safe local default if configuration is unavailable. */ }
  applySettings();
  router();
}
bootApp();
