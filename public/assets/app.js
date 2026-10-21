const app = document.querySelector('#app');
const toastRoot = document.querySelector('#toast-root');

const SETTINGS_KEY = 'luma-settings';
const DEFAULT_SETTINGS = {
  theme: localStorage.getItem('luma-theme') || 'dark',
  accent: localStorage.getItem('luma-accent') || 'sage-ink',
  detailView: 'page',
  imageLogos: false,
  trailers: false,
  spoilerFree: false,
  reduceMotion: false,
  autoplay: true,
  serverOrder: ['VidKing', 'VidSrc', 'VidSrc TW', 'VidSrc Link', 'VidSrc Wiki', 'VidSrc API', 'VidSrc Hair', 'VidCore', 'AutoEmbed', 'MultiEmbed'],
  account: null,
};
function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    const savedOrder = Array.isArray(stored.serverOrder) ? stored.serverOrder : [];
    const mergedOrder = [...savedOrder.filter(name => DEFAULT_SETTINGS.serverOrder.includes(name)), ...DEFAULT_SETTINGS.serverOrder.filter(name => !savedOrder.includes(name))];
    return { ...DEFAULT_SETTINGS, ...stored, serverOrder: mergedOrder };
  } catch {
    return { ...DEFAULT_SETTINGS, serverOrder: [...DEFAULT_SETTINGS.serverOrder] };
  }
}
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}
function updateSetting(key, value, { persist = true, refresh = false } = {}) {
  state.settings[key] = value;
  if (persist) saveSettings();
  if (refresh) applySettings();
}
const state = {
  home: null,
  cache: new Map(),
  list: JSON.parse(localStorage.getItem('luma-list') || '[]'),
  history: JSON.parse(localStorage.getItem('luma-history') || '[]'),
  heroIndex: 0,
  heroTimer: null,
  heroItems: [],
  settings: loadSettings(),
};

const icon = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true" class="icon-fill"><path d="M8 5.4v13.2L19 12 8 5.4Z"/></svg>',
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


function iconWrap(name, cls = '') { return `<span class="icon ${cls}" aria-hidden="true">${icon[name] || ''}</span>`; }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
function year(v) { return v ? new Date(v).getFullYear() : '—'; }
function rating(v) { return Number(v || 0).toFixed(1); }
function mediaType(item) { return item.media_type === 'tv' || item.name ? 'tv' : 'movie'; }
function detailHref(item) { return `/details/${mediaType(item)}/${item.id}`; }
function saveState() {
  localStorage.setItem('luma-list', JSON.stringify(state.list));
  localStorage.setItem('luma-history', JSON.stringify(state.history.slice(0, 30)));
}
function isSaved(id, type) { return state.list.some(x => x.id === id && x.media_type === type); }
function formatMinutes(minutes) {
  const value = Number(minutes || 0);
  if (!value) return '—';
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
function pushHistory(item) {
  const type = mediaType(item);
  state.history = [{ id:item.id, media_type:type, title:item.title, poster:item.poster, release_date:item.release_date, vote_average:item.vote_average, at:Date.now() }, ...state.history.filter(x => !(x.id === item.id && x.media_type === type))].slice(0, 30);
  saveState();
}
async function api(path) {
  if (state.cache.has(path)) return state.cache.get(path);
  const res = await fetch(path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  state.cache.set(path, data);
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
  localStorage.setItem('luma-theme', resolved);
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
}
function applySettings() {
  applyTheme(state.settings.theme);
  applyAccent(state.settings.accent);
  document.documentElement.dataset.reduceMotion = state.settings.reduceMotion ? 'true' : 'false';
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
];
function applyAccent(accent = state.settings.accent) {
  const safe = ACCENT_OPTIONS.some(x => x.value === accent) ? accent : 'sage-ink';
  state.settings.accent = safe;
  document.documentElement.dataset.accent = safe;
  localStorage.setItem('luma-accent', safe);
  saveSettings();
}

function nav(active = '') {
  const links = [
    ['home', '/', 'Home', 'home'],
    ['browse', '/browse', 'Browse', 'layers'],
    ['movies', '/movies', 'Movies', 'film'],
    ['tv', '/tv', 'Series', 'tv'],
    ['library', '/my-list', 'My List', 'list'],
  ];
  return `<header class="site-header">
    <div class="header-inner">
      <a class="brand" href="/" data-link aria-label="LUMA home"><span class="brand-mark">L</span><span class="brand-word">LUMA</span></a>
      <nav class="desktop-nav" aria-label="Primary navigation">
        ${links.map(([key, href, label, iconName]) => `<a class="nav-link ${active===key || (key==='library' && active==='history') ? 'active' : ''}" href="${href}" data-link>${iconWrap(iconName)}<span>${label}</span></a>`).join('')}
      </nav>
      <div class="header-actions">
        <a class="header-icon ${active==='search'?'active':''}" href="/search" data-link title="Search" aria-label="Search">${iconWrap('search')}</a>
        <a class="header-icon ${active==='settings'?'active':''}" href="/settings" data-link title="Settings" aria-label="Settings">${iconWrap('settings')}</a>
        ${themeButton()}
      </div>
    </div>
    <div class="mobile-nav-strip" aria-label="Mobile navigation">
      ${links.map(([key, href, label, iconName]) => `<a class="mobile-nav-link ${active===key || (key==='library' && active==='history') ? 'active' : ''}" href="${href}" data-link>${iconWrap(iconName)}<span>${label}</span></a>`).join('')}
    </div>
  </header>`;
}
function footer() {

  return `<footer class="footer">
    <div class="footer-main">
      <div class="footer-brand-block">
        <a class="footer-brand" href="/" data-link><span class="footer-mark">L</span><span>LUMA</span></a>
        <p>A cinematic discovery interface built around fast browsing, clean metadata and a focused watch flow.</p>
      </div>
      <div class="footer-column"><span class="footer-label">Explore</span><a href="/movies" data-link>Movies</a><a href="/tv" data-link>Series</a><a href="/search" data-link>Search</a></div>
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
  const sub = `${year(item.release_date)}${item.vote_average ? ` • ${rating(item.vote_average)}` : ''} • ${type === 'tv' ? 'Series' : 'Movie'}`;
  return `<a class="movie-card" href="${detailHref(item)}" data-link aria-label="Open ${escapeHtml(item.title)}">
    ${rank ? `<div class="rank-mark">${String(rank).padStart(2,'0')}</div>` : ''}
    <div class="poster-wrap">
      ${image ? `<img loading="lazy" src="${image}" alt="${escapeHtml(item.title)} poster">` : '<div class="poster-fallback">No artwork</div>'}
      <div class="card-hover-info">
        <div class="card-hover-title">${escapeHtml(item.title)}</div>
        <div class="card-hover-meta">${escapeHtml(sub)}</div>
      </div>
      <span class="card-rating">${iconWrap('star')} ${rating(item.vote_average)}</span>
    </div>
  </a>`;
}
function cards(items = [], limit = 6) { return items.slice(0, limit).map(card).join(''); }

function hero(item) {
  const backdrop = item?.backdropLarge || item?.backdrop || item?.posterLarge || item?.poster;
  return `<section class="hero" style="--hero-image:url('${backdrop || ''}')">
    <div class="hero-bg"></div><div class="hero-overlay"></div>
    <div class="hero-content">
      <span class="eyebrow">New release</span>
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
function providerRow(providers = []) {
  if (!providers.length) return '';
  const id = railKey('providers');
  return `<section class="provider-section"><div class="section-header"><div><span class="section-kicker">Browse by provider</span><h2>Where you watch</h2></div>${railControls(id, '/movies')}</div><div class="rail-wrap"><div id="${id}" class="provider-row">${providers.map(p => `<a class="provider-tile" href="/movies?provider=${p.provider_id}" data-link title="${escapeHtml(p.provider_name)}">${p.logo ? `<img src="${p.logo}" alt="${escapeHtml(p.provider_name)} logo">` : `<span>${escapeHtml(p.provider_name).slice(0,2).toUpperCase()}</span>`}<strong>${escapeHtml(p.provider_name)}</strong></a>`).join('')}</div></div></section>`;
}
function bindRails() {
  document.querySelectorAll('.card-row,.rank-row,.provider-row').forEach(row => {
    row.addEventListener('scroll', () => updateRailButtons(row));
    updateRailButtons(row);
  });
}
function updateRailButtons(row) {
  const parent = row.closest('.rail-wrap, .provider-section')?.querySelector('.section-header');
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
function startHeroCarousel(items) {
  stopHeroCarousel();
  if (!items || items.length < 2) return;
  let lastId = items[0]?.id;
  state.heroTimer = setInterval(() => {
    if (!document.querySelector('.hero')) return stopHeroCarousel();
    const pool = items.filter(x => x?.id !== lastId);
    const current = pool[Math.floor(Math.random() * Math.max(pool.length, 1))] || items[0];
    lastId = current?.id;
    const holder = document.createElement('div'); holder.innerHTML = hero(current);
    const newHero = holder.firstElementChild;
    const host = document.querySelector('.hero');
    if (!host || !newHero) return;
    host.replaceWith(newHero);
    requestAnimationFrame(() => newHero.classList.add('is-ready'));
  }, 6500);
}

async function renderHome() {
  stopHeroCarousel();
  app.innerHTML = `${nav('home')}<main class="page"><div class="section"><div class="empty">Loading your cinema…</div></div></main>`;
  try {
    state.home = await api('/api/home');
    const leadSet = (state.home.newReleases?.results || []).filter(x => x?.backdropLarge || x?.posterLarge);
    const fallback = state.home.trending.results.filter(x => x?.backdropLarge);
    state.heroItems = leadSet.length ? leadSet : fallback;
    const lead = state.heroItems[Math.floor(Math.random() * Math.max(state.heroItems.length, 1))];
    app.innerHTML = `${nav('home')}<main class="page">${hero(lead)}${providerRow(state.home.providers)}${section('Trending today', state.home.trending.results, '/movies?sort=popularity.desc', 8)}${topTen(state.home.trending.results)}${section('Popular movies', state.home.movies.results, '/movies?sort=popularity.desc', 8)}${section('Top rated', state.home.topMovies.results, '/movies?sort=vote_average.desc', 8)}${section('Popular series', state.home.tv.results, '/tv?sort=popularity.desc', 8)}${section('Top rated series', state.home.topTv.results, '/tv?sort=vote_average.desc', 8)}${footer()}</main>`;
    startHeroCarousel(state.heroItems);
    bindRails();
  } catch (e) { renderError(e.message); }
}

async function renderBrowse() {
  app.innerHTML = `${nav('browse')}<main class="page-shell page"><div class="page-top"><div><span class="eyebrow">Browse</span><h1 class="page-title">Everything in one place.</h1><p class="page-intro">Jump straight into movies, series, top rated titles or provider-based discovery.</p></div></div><div class="browse-grid"><a class="browse-tile browse-wide" href="/movies?sort=popularity.desc" data-link><span class="section-kicker">Catalogue</span><strong>Movies</strong><span>New releases, popular titles and deep cuts.</span>${iconWrap('film')}</a><a class="browse-tile" href="/tv?sort=popularity.desc" data-link><span class="section-kicker">Catalogue</span><strong>Series</strong><span>Current shows and long-form stories.</span>${iconWrap('tv')}</a><a class="browse-tile" href="/movies?sort=vote_average.desc" data-link><span class="section-kicker">Curated</span><strong>Top rated</strong><span>Highly rated movies from TMDB.</span>${iconWrap('star')}</a><a class="browse-tile" href="/search" data-link><span class="section-kicker">Find something</span><strong>Search</strong><span>Look up titles, actors and more.</span>${iconWrap('search')}</a></div>${footer()}</main>`;
}

function filterDropdown(key, label, options, current) {
  const currentLabel = options.find(o => String(o.value) === String(current))?.label || label;
  return `<div class="filter-control"><button type="button" class="filter-select" data-filter-select="${key}" aria-expanded="false"><span>${escapeHtml(currentLabel)}</span>${iconWrap('chevronDown')}</button><div class="filter-menu" data-filter-menu="${key}">${options.map(o=>`<button type="button" data-filter-option="${key}" data-value="${escapeHtml(String(o.value))}" class="${String(o.value)===String(current)?'active':''}">${o.icon?iconWrap(o.icon):''}<span>${escapeHtml(o.label)}</span></button>`).join('')}</div></div>`;
}
function bindFilterDropdowns(type) {
  document.querySelectorAll('[data-filter-select]').forEach(btn=>btn.addEventListener('click',()=>{
    const open=btn.getAttribute('aria-expanded')==='true'; document.querySelectorAll('.filter-select[aria-expanded="true"]').forEach(other=>{other.setAttribute('aria-expanded','false');other.nextElementSibling?.classList.remove('open');});
    btn.setAttribute('aria-expanded',String(!open)); btn.nextElementSibling?.classList.toggle('open',!open);
  }));
  document.querySelectorAll('[data-filter-option]').forEach(btn=>btn.addEventListener('click',()=>{
    const qs=new URLSearchParams(location.search); const key=btn.dataset.filterOption; const value=btn.dataset.value;
    if(key==='sort') qs.set('sort',value); else if(key==='genre') qs.set('genre',value); else if(key==='provider') qs.set('provider',value);
    qs.delete('page'); navigate(`/${type}?${qs.toString()}`);
  }));
}

async function renderCatalog(type) {
  const isTv = type === 'tv';
  const qs = new URLSearchParams(location.search);
  const sort = qs.get('sort') || 'popularity.desc';
  const genre = qs.get('genre') || '';
  const provider = qs.get('provider') || '';
  const page = qs.get('page') || '1';
  app.innerHTML = `${nav(isTv ? 'tv' : 'movies')}<main class="page-shell page"><div class="catalog-hero"><div class="catalog-heading"><span class="eyebrow">Browse</span><h1 class="page-title">${isTv ? 'TV Series' : 'Movies'}</h1><p class="page-intro">Browse by genre, year, popularity, provider and more.</p></div><div id="catalog-filters" class="filter-bar"><div class="filter-control filter-loading">Loading filters…</div></div></div><div id="catalog" class="grid"><div class="empty" style="grid-column:1/-1">Loading catalogue…</div></div>${footer()}</main>`;
  try {
    const [genres, providers] = await Promise.all([api(`/api/genres/${isTv?'tv':'movie'}`), api('/api/providers')]);
    const sortOptions = [
      {value:'popularity.desc',label:'Popular',icon:'star'},
      {value:'vote_average.desc',label:'Top Rated',icon:'star'},
      {value:isTv?'first_air_date.desc':'primary_release_date.desc',label:'Newest',icon:'calendar'}
    ];
    const genreOptions = [{value:'',label:'All Genres'}].concat((genres.genres||[]).map(g=>({value:g.id,label:g.name})));
    const providerOptions = [{value:'',label:'All Providers'}].concat((providers||[]).map(p=>({value:p.provider_id,label:p.provider_name})));
    document.querySelector('#catalog-filters').innerHTML = `${filterDropdown('sort','Popular',sortOptions,sort)}${filterDropdown('genre','All Genres',genreOptions,genre)}${filterDropdown('provider','All Providers',providerOptions,provider)}`;
    bindFilterDropdowns(type);
    const data = await api(`/api/discover/${type}?sort_by=${encodeURIComponent(sort)}&with_genres=${encodeURIComponent(genre)}&provider=${encodeURIComponent(provider)}&page=${page}`);
    document.querySelector('#catalog').innerHTML = data.results.length ? data.results.map(card).join('') : '<div class="empty" style="grid-column:1/-1">Nothing matched those filters.</div>';
    bindRails();
  } catch (e) { document.querySelector('#catalog').innerHTML = `<div class="empty" style="grid-column:1/-1">${escapeHtml(e.message)}</div>`; }
}

async function renderSearch() {
  const q = new URLSearchParams(location.search).get('q') || '';
  app.innerHTML = `${nav('')}<main class="page-shell search-page page"><span class="eyebrow">Discover</span><h1 class="page-title">Search</h1><div class="search-big"><input id="big-search" value="${escapeHtml(q)}" placeholder="Search movies, series, actors…"><button id="search-submit" class="btn primary">${iconWrap('search')} Search</button></div><div id="search-results" class="grid"></div>${footer()}</main>`;
  const input = document.querySelector('#big-search'); const submit = document.querySelector('#search-submit');
  const run = () => { const term = input.value.trim(); if (term) navigate(`/search?q=${encodeURIComponent(term)}`); };
  submit.addEventListener('click', run); input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  if (!q) return;
  try {
    const data = await api(`/api/search?query=${encodeURIComponent(q)}`);
    document.querySelector('#search-results').innerHTML = data.results?.length ? data.results.filter(x => ['movie','tv'].includes(mediaType(x))).map(card).join('') : '<div class="empty" style="grid-column:1/-1">No results.</div>';
  } catch (e) { document.querySelector('#search-results').innerHTML = `<div class="empty" style="grid-column:1/-1">${escapeHtml(e.message)}</div>`; }
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
  const region = providers?.results?.NP || Object.values(providers?.results || {})[0];
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
  mount.innerHTML = `${nav(type === 'tv' ? 'tv' : 'movies')}<main class="page"><div class="empty" style="margin:110px 5vw 60px">Loading title…</div></main>`;
  try {
    const data = await api(`/api/${type}/${id}`);
    const item = data.details; const saved = isSaved(item.id, type);
    const trailer = item.videos?.results?.find(v => v.site === 'YouTube' && ['Trailer','Teaser'].includes(v.type));
    const creators = type === 'tv' ? dedupeBy(item.created_by || [], 'id').slice(0, 2) : dedupeBy((data.credits?.crew || []).filter(x => x.job === 'Director'), 'id').slice(0, 2);
    const genres = (item.genres || []).slice(0, 4); const synopsis = item.overview?.trim(); const providerHtml = renderProviders(data.providers);
    const logo = state.settings.imageLogos ? (item.images?.logos || []).find(x => ['en','en-US',null].includes(x.iso_639_1)) : null;
    document.title = `${item.title} · LUMA`;
    const titleMarkup = logo?.file_path ? `<img class="title-logo" src="https://image.tmdb.org/t/p/w500${logo.file_path}" alt="${escapeHtml(item.title)}">` : `<h1>${escapeHtml(item.title)}</h1>`;
    let episodesMarkup = '';
    if (type === 'tv') {
      episodesMarkup = `<section class="detail-episodes info-panel"><div class="panel-head"><div><span class="panel-kicker">Series</span><h3>Episodes</h3></div><div class="season-picker-wrap" id="detail-season-picker"></div></div><div id="detail-episode-row" class="episode-grid"></div></section>`;
    }
    const trailerMarkup = trailer ? (state.settings.trailers ? `<div class="trailer-video"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(trailer.key)}?autoplay=1&mute=1&controls=0&loop=1&playlist=${encodeURIComponent(trailer.key)}&rel=0" title="${escapeHtml(item.title)} trailer" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>` : trailerCard(trailer)) : '';
    const content = `<main class="page"><section class="details-hero"><div class="details-bg" style="background-image:url('${item.backdropLarge || item.posterLarge || ''}')"></div><div class="details-shade"></div><div class="details-content"><div class="poster-stack"><img class="details-poster" src="${item.posterLarge || item.poster || ''}" alt="${escapeHtml(item.title)} poster"><span class="poster-score">${iconWrap('star')} ${rating(item.vote_average)}</span></div><div class="details-copy"><span class="eyebrow">${type === 'tv' ? 'Series' : 'Movie'}</span>${titleMarkup}<div class="meta-row detail-meta"><span>${year(item.release_date)}</span><span class="dot"></span><span>${type === 'tv' ? `${item.number_of_seasons || 0} season${item.number_of_seasons === 1 ? '' : 's'}` : formatMinutes(item.runtime)}</span><span class="dot"></span><span>${iconWrap('star')} ${rating(item.vote_average)}</span></div>${genres.length ? `<div class="tag-row">${genres.map(g => `<span class="tag">${escapeHtml(g.name)}</span>`).join('')}</div>` : ''}${creators.length ? `<div class="creator-inline"><span>${type === 'tv' ? 'Created by' : 'Directed by'}</span><strong>${creators.map(p => escapeHtml(p.name)).join(', ')}</strong></div>` : ''}${synopsis ? `<p class="details-overview hero-overview">${escapeHtml(synopsis)}</p>` : ''}<div class="hero-actions"><a class="btn primary" href="/watch/${type}/${item.id}" data-link>${iconWrap('play')} Watch now</a><button class="btn secondary" id="save-btn">${saved ? iconWrap('check') + ' In My List' : iconWrap('plus') + ' My List'}</button><button class="btn icon-only" id="share-btn" title="Share" aria-label="Share this title">${iconWrap('share')}</button>${trailer && !state.settings.trailers ? `<a class="btn ghost" href="https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}" target="_blank" rel="noreferrer">${iconWrap('playCircle')} Trailer</a>` : ''}</div></div></div></section><section class="detail-body"><div class="detail-main">${renderCast(data.credits)}${episodesMarkup}</div><aside class="detail-aside">${trailerMarkup}${providerHtml ? `<section class="info-panel"><div class="panel-head"><div><span class="panel-kicker">Availability</span><h3>Where to watch</h3></div>${iconWrap('globe')}</div><div class="provider-groups">${providerHtml}</div></section>` : ''}</aside></section>${section('More like this', data.recommendations?.results || [], `/${type}`, 8)}${footer()}</main>`;
    // For modal view, strip nested nav and footer and wrap body.
    if (state.settings.detailView === 'modal' && mount === app) {
      app.innerHTML = nav(type === 'tv' ? 'tv' : 'movies');
      const wrapper=document.createElement('div'); wrapper.className='modal-backdrop detail-modal-backdrop'; wrapper.innerHTML=`<div class="detail-modal-content">${content.replace('<main class="page">','').replace('</main>','')}</div>`; app.append(wrapper);
      wrapper.addEventListener('click', e=>{ if(e.target===wrapper||e.target.closest('[data-modal-close]')) { wrapper.remove(); document.body.classList.remove('modal-open'); } });
      document.body.classList.add('modal-open');
    } else {
      mount.innerHTML = `${nav(type === 'tv' ? 'tv' : 'movies')}${content}`;
    }
    document.querySelector('#save-btn')?.addEventListener('click', () => toggleList(item));
    document.querySelector('#share-btn')?.addEventListener('click', () => shareCurrent(item.title));
    if(type==='tv') bindDetailEpisodes(item);
    bindRails();
  } catch (e) { renderError(e.message); }
}
function seasonPicker(seasons, active, scope) {
  if (!seasons.length) return '';
  const current = seasons.find(s => s.season_number === active) || seasons[0];
  return `<div class="season-picker"><button type="button" class="season-picker-btn" data-season-select="${scope}" aria-expanded="false"><span>${escapeHtml(current.name || `Season ${current.season_number}`)}</span>${iconWrap('chevronDown')}</button><div class="season-picker-menu" data-season-menu="${scope}">${seasons.map(s=>`<button type="button" class="season-option ${s.season_number===active?'active':''}" data-season-option="${scope}" data-season-number="${s.season_number}">${escapeHtml(s.name || `Season ${s.season_number}`)}</button>`).join('')}</div></div>`;
}
async function bindDetailEpisodes(item) {
  const picker=document.querySelector('#detail-season-picker'); const host=document.querySelector('#detail-episode-row'); if(!picker||!host) return;
  const seasons=(item.seasons||[]).filter(s=>s.season_number>0); let active=seasons[0]?.season_number||1;
  const load=async seasonNumber=>{
    active=seasonNumber; const data=await api(`/api/tv/${item.id}/season/${seasonNumber}`);
    picker.innerHTML=seasonPicker(seasons, active, 'detail');
    const fallback = item.backdropLarge || item.posterLarge || item.poster || '';
    host.innerHTML=(data.episodes||[]).map(ep=>{
      const still = ep.still || fallback;
      return `<a class="episode ${ep.episode_number===1?'':''}" href="/watch/tv/${item.id}?season=${active}&episode=${ep.episode_number}" data-link><div class="episode-media"><img class="episode-still" src="${still}" alt="Episode ${ep.episode_number} still" loading="lazy"><span class="episode-number">E${String(ep.episode_number).padStart(2,'0')}</span></div><div class="episode-copy"><div class="episode-name">${escapeHtml(ep.name||`Episode ${ep.episode_number}`)}</div><div class="episode-meta">${ep.runtime ? `${ep.runtime} min` : 'Episode'}${ep.air_date ? ` • ${escapeHtml(ep.air_date)}` : ''}</div></div></a>`;
    }).join('');
    picker.querySelector('[data-season-select]')?.addEventListener('click',()=>{ const btn=picker.querySelector('[data-season-select]'); const open=btn.getAttribute('aria-expanded')==='true'; btn.setAttribute('aria-expanded',String(!open)); picker.querySelector('.season-picker-menu')?.classList.toggle('open',!open); });
    picker.querySelectorAll('[data-season-option]').forEach(btn=>btn.addEventListener('click',()=>load(Number(btn.dataset.seasonNumber))));
  };
  await load(active);
}

async function renderWatch(type, id) {
  app.innerHTML = `${nav(type === 'tv' ? 'tv' : 'movies')}<main class="watch-page page"><div class="player-wrap"><div class="empty" style="width:min(500px,90%)">Preparing player…</div></div></main>`;
  try {
    const data = await api(`/api/${type}/${id}`); const item = data.details; const params = new URLSearchParams(location.search);
    let season = Math.max(1, Number(params.get('season') || 1)); let episode = Math.max(1, Number(params.get('episode') || 1));
    pushHistory(item); const initialSources = buildSources(type, id, season, episode);
    app.innerHTML = `${nav(type === 'tv' ? 'tv' : 'movies')}<main class="watch-page page"><div class="player-wrap"><iframe id="player-frame" class="player-frame" title="${escapeHtml(item.title)} player" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="origin-when-cross-origin"></iframe></div><div class="player-toolbar"><a class="btn ghost" href="${detailHref(item)}" data-link>${iconWrap('back')} Back</a><div class="source-pills" id="source-pills">${initialSources.map((s,i)=>`<button class="source-pill ${i===0?'active':''}" data-src="${encodeURIComponent(s.url)}">${escapeHtml(s.name)}</button>`).join('')}</div></div><section class="watch-content"><div class="watch-heading"><div><span class="eyebrow">Now playing</span><h1 class="watch-title">${escapeHtml(item.title)}${type==='tv' ? ` · S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}` : ''}</h1><div class="meta-row"><span>${year(item.release_date)}</span><span class="dot"></span><span>${iconWrap('star')} ${rating(item.vote_average)}</span></div></div><a class="btn secondary" href="${detailHref(item)}" data-link>${iconWrap('info')} Details</a></div><p class="player-note">Choose another source if a provider is unavailable. Provider availability can change independently of LUMA.</p>${type==='tv'?`<div class="episode-panel info-panel"><div class="panel-head"><div><span class="panel-kicker">Series</span><h3>Episodes</h3></div><div id="season-picker" class="season-picker-wrap"></div></div><div id="episode-grid" class="episode-grid"></div></div>`:''}</section>${section('More like this', data.recommendations.results, `/${type}`, 8)}${footer()}</main>`;
    const player = document.querySelector('#player-frame'); const setSource = url => { player.src = url; };
    const bindSources = () => document.querySelectorAll('.source-pill').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('.source-pill').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); setSource(decodeURIComponent(btn.dataset.src)); }));
    bindSources(); setSource(initialSources[0].url);
    if (type === 'tv') {
      const seasons = (item.seasons || []).filter(s => s.season_number > 0); const seasonPickerHost = document.querySelector('#season-picker'); const episodeGrid = document.querySelector('#episode-grid');
      const loadSeason = async seasonNumber => {
        season = seasonNumber; const seasonData = await api(`/api/tv/${id}/season/${season}`);
        seasonPickerHost.innerHTML = seasonPicker(seasons, season, 'watch');
        episodeGrid.className = 'episode-grid';
        const fallback = item.backdropLarge || item.posterLarge || item.poster || '';
        episodeGrid.innerHTML = (seasonData.episodes || []).map(ep => { const still = ep.still || fallback; return `<button class="episode ${ep.episode_number===episode?'active':''}" data-episode="${ep.episode_number}"><div class="episode-media"><img class="episode-still" src="${still}" alt="Episode ${ep.episode_number} still" loading="lazy"><span class="episode-number">E${String(ep.episode_number).padStart(2,'0')}</span></div><div class="episode-copy"><div class="episode-name">${escapeHtml(ep.name || `Episode ${ep.episode_number}`)}</div><div class="episode-meta">${ep.runtime ? `${ep.runtime} min` : 'Episode'}${ep.air_date ? ` • ${escapeHtml(ep.air_date)}` : ''}</div></div></button>`; }).join('');
        seasonPickerHost.querySelector('[data-season-select]')?.addEventListener('click',()=>{ const btn=seasonPickerHost.querySelector('[data-season-select]'); const open=btn.getAttribute('aria-expanded')==='true'; btn.setAttribute('aria-expanded',String(!open)); seasonPickerHost.querySelector('.season-picker-menu')?.classList.toggle('open',!open); });
        seasonPickerHost.querySelectorAll('[data-season-option]').forEach(btn=>btn.addEventListener('click',()=>updateWatchEpisode(Number(btn.dataset.seasonNumber),1)));
        episodeGrid.querySelectorAll('.episode').forEach(btn => btn.addEventListener('click', () => updateWatchEpisode(season, Number(btn.dataset.episode))));
      };
      const updateWatchEpisode = async (newSeason, newEpisode) => { season = newSeason; episode = newEpisode; history.replaceState({}, '', `/watch/tv/${id}?season=${season}&episode=${episode}`); const sources = buildSources('tv', id, season, episode); document.querySelector('#source-pills').innerHTML = sources.map((src,i)=>`<button class="source-pill ${i===0?'active':''}" data-src="${encodeURIComponent(src.url)}">${escapeHtml(src.name)}</button>`).join(''); document.querySelector('#player-frame').src = sources[0].url; document.querySelector('.watch-title').textContent = `${item.title} · S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}`; bindSources(); await loadSeason(season); };
      await loadSeason(season);
    }
  } catch (e) { renderError(e.message); }
}
function buildSources(type, id, season, episode) {
  const movie = type === 'movie'; const encoded = encodeURIComponent(id); const s = season || 1; const e = episode || 1;
  const map = {
    'VidKing': { name:'VidKing', url:movie ? `https://www.vidking.net/embed/movie/${encoded}?autoPlay=${state.settings.autoplay}&nextEpisode=true&episodeSelector=true` : `https://www.vidking.net/embed/tv/${encoded}/${s}/${e}?autoPlay=${state.settings.autoplay}&nextEpisode=true&episodeSelector=true` },
    'VidSrc': { name:'VidSrc', url:movie ? `https://vidsrc.to/embed/movie/${encoded}` : `https://vidsrc.to/embed/tv/${encoded}/${s}/${e}` },
    'VidSrc TW': { name:'VidSrc TW', url:movie ? `https://vidsrc.tw/embed/movie/${encoded}` : `https://vidsrc.tw/embed/tv/${encoded}/${s}/${e}` },
    'VidSrc Link': { name:'VidSrc Link', url:movie ? `https://vidsrc.link/embed/movie/${encoded}` : `https://vidsrc.link/embed/tv/${encoded}/${s}/${e}` },
    'VidSrc Wiki': { name:'VidSrc Wiki', url:movie ? `https://vidsrc.wiki/embed/movie/${encoded}` : `https://vidsrc.wiki/embed/tv/${encoded}/${s}/${e}` },
    'VidSrc API': { name:'VidSrc API', url:movie ? `https://vidsrcapi.com/embed/movie/${encoded}` : `https://vidsrcapi.com/embed/tv/${encoded}/${s}/${e}` },
    'VidSrc Hair': { name:'VidSrc Hair', url:movie ? `https://vidsrc.hair/embed/movie/${encoded}` : `https://vidsrc.hair/embed/tv/${encoded}/${s}/${e}` },
    'VidCore': { name:'VidCore', url:movie ? `https://vidcore.io/movie/${encoded}?autoPlay=false` : `https://vidcore.io/tv/${encoded}/${s}/${e}?autoPlay=false` },
    'AutoEmbed': { name:'AutoEmbed', url:movie ? `https://player.autoembed.app/embed/movie/${encoded}` : `https://player.autoembed.app/embed/tv/${encoded}/${s}/${e}` },
    'MultiEmbed': { name:'MultiEmbed', url:movie ? `https://multiembed.mov/directstream.php?video_id=${encoded}&tmdb=1` : `https://multiembed.mov/directstream.php?video_id=${encoded}&tmdb=1&s=${s}&e=${e}` },
  };
  return (state.settings.serverOrder || Object.keys(map)).map(name=>map[name]).filter(Boolean);
}
function toggleList(item) {
  const type = mediaType(item);
  if (isSaved(item.id, type)) { state.list = state.list.filter(x => !(x.id === item.id && x.media_type === type)); showToast('Removed from My List'); }
  else { state.list.unshift({ id:item.id, media_type:type, title:item.title, poster:item.poster, release_date:item.release_date, vote_average:item.vote_average }); showToast('Added to My List'); }
  saveState(); const btn = document.querySelector('#save-btn'); if (btn) btn.innerHTML = isSaved(item.id,type) ? `${iconWrap('check')} In My List` : `${iconWrap('plus')} My List`;
}
function renderSavedPage(kind) {
  const isHistory = kind === 'history'; const items = (isHistory ? state.history : state.list).map(x => ({...x, media_type:x.media_type}));
  app.innerHTML = `${nav(isHistory?'history':'library')}<main class="page-shell page"><div class="page-top personal-top"><div><span class="eyebrow">Personal</span><h1 class="page-title">${isHistory?'History':'My List'}</h1><p class="page-intro">${isHistory?'Recently opened titles on this device.':'Saved titles stored locally in this browser.'}</p></div><div class="personal-tabs"><a class="${!isHistory?'active':''}" href="/my-list" data-link>${iconWrap('list')} My List</a><a class="${isHistory?'active':''}" href="/history" data-link>${iconWrap('clock')} History</a></div></div>${items.length ? `<div class="grid">${items.map(card).join('')}</div>` : `<div class="empty">${isHistory?'No watch history yet.':'Nothing saved yet.'}</div>`}${footer()}</main>`;
}
function settingToggleRow(key, title, description, checked = false) {
  return `<div class="setting-row"><div class="setting-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div><label class="switch"><input type="checkbox" data-setting-toggle="${key}" ${checked ? 'checked' : ''}><span class="switch-track"><span class="switch-thumb"></span></span></label></div>`;
}
function settingChoice(key, title, description, options, value) {
  return `<div class="setting-row setting-choice-row"><div class="setting-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div><div class="setting-choice"><button type="button" class="setting-select" data-setting-select="${key}" aria-expanded="false"><span data-setting-value="${key}">${escapeHtml(options.find(x=>x.value===value)?.label || value)}</span>${iconWrap('chevronDown')}</button><div class="setting-menu" data-setting-menu="${key}">${options.map(o=>`<button type="button" data-setting-option="${key}" data-value="${escapeHtml(o.value)}" class="${o.value===value?'active':''}">${iconWrap(o.icon || 'check')}<span>${escapeHtml(o.label)}</span></button>`).join('')}</div></div></div>`;
}
function accentPalette(value) {
  const current = ACCENT_OPTIONS.find(o => o.value === value) || ACCENT_OPTIONS[0];
  return `<div class="setting-row accent-setting-row"><div class="setting-copy"><strong>Accent Palette</strong><span>Choose a restrained two-tone palette for buttons, active states, glows and navigation.</span></div><div class="setting-choice accent-choice"><button type="button" class="setting-select accent-select" data-setting-select="accent" aria-expanded="false"><span class="accent-selected"><i style="--sw1:${current.color};--sw2:${current.secondary}"></i>${escapeHtml(current.label)}</span>${iconWrap('chevronDown')}</button><div class="setting-menu accent-menu" data-setting-menu="accent">${ACCENT_OPTIONS.map(o=>`<button type="button" data-setting-option="accent" data-value="${o.value}" class="${o.value===value?'active':''}"><i class="accent-option-swatch" style="--sw1:${o.color};--sw2:${o.secondary}"></i><span>${escapeHtml(o.label)}</span>${o.value===value?iconWrap('check'):''}</button>`).join('')}</div></div></div>`;
}
function settingsSection(id, iconName, title, intro, body, activeSection) {
  return `<section id="settings-${id}" class="settings-section ${activeSection===id?'is-active':''}"><div class="settings-section-head"><div class="settings-section-icon">${iconWrap(iconName)}</div><div><span class="section-kicker">Settings</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(intro)}</p></div></div>${body}</section>`;
}
function renderSettings() {
  const qs = new URLSearchParams(location.search); const requested = qs.get('section');
  const active = ['appearance','playback','servers'].includes(requested) ? requested : 'appearance';
  const s = state.settings;
  const tabs = [
    ['appearance','Appearance','palette'],['playback','Playback','sliders'],['servers','Server Order','server']
  ];
  const body = `
    ${settingsSection('appearance','palette','Appearance','Tune the visual system, browsing layout and motion.', `
      ${settingChoice('theme','Theme','Choose the overall lightness of the interface.',[{value:'dark',label:'Dark',icon:'moon'},{value:'light',label:'Light',icon:'sun'},{value:'system',label:'System',icon:'monitor'}],s.theme)}
      ${accentPalette(s.accent)}
      ${settingChoice('detailView','Detail View Type','Choose the full-page title experience or the compact modal.',[{value:'page',label:'Page',icon:'monitor'},{value:'modal',label:'Modal',icon:'modal'}],s.detailView)}
      ${settingToggleRow('imageLogos','Use Image Logos','Use title artwork when TMDB provides a logo.',s.imageLogos)}
      ${settingToggleRow('trailers','Trailer Autoplay','Autoplay the trailer panel when a supported trailer exists.',s.trailers)}
      ${settingToggleRow('spoilerFree','Spoiler-Free Episodes','Hide episode names and details until you open them.',s.spoilerFree)}
      ${settingToggleRow('reduceMotion','Reduce Motion','Dial back the spring and transition effects.',s.reduceMotion)}
    `, active)}
    ${settingsSection('playback','sliders','Playback','Configure the parts of playback LUMA can control locally.', `
      ${settingToggleRow('autoplay','Autoplay Next Episode','Automatically continue with the next episode when possible.',s.autoplay)}
    `, active)}
    ${settingsSection('servers','server','Server Order','Choose the fallback order used when opening a title.', `<div class="server-list" id="server-list">${s.serverOrder.map((name,i)=>`<div class="server-item" draggable="true" data-server="${escapeHtml(name)}"><span class="grip">${iconWrap('grip')}</span><span class="server-index">${i+1}</span><strong>${escapeHtml(name)}</strong><span class="server-status">Ready</span></div>`).join('')}</div><p class="settings-note">Changes are stored locally and used for new watch sessions.</p>`, active)}
  `;
  app.innerHTML = `${nav('settings')}<main class="page settings-page"><div class="settings-shell"><aside class="settings-sidebar"><div class="settings-title"><span class="eyebrow">LUMA</span><h1>Settings</h1><p>Keep the useful controls and nothing extra.</p></div><nav class="settings-tabs">${tabs.map(([id,label,ic])=>`<a class="settings-tab ${id===active?'active':''}" href="/settings?section=${id}" data-link>${iconWrap(ic)}<span>${label}</span></a>`).join('')}</nav></aside><div class="settings-content">${body}</div></div>${footer()}</main>`;
  bindSettings();
}
function bindSettings() {
  document.querySelectorAll('[data-setting-toggle]').forEach(input => input.addEventListener('change', () => {
    updateSetting(input.dataset.settingToggle, input.checked);
    if (input.dataset.settingToggle === 'reduceMotion') applySettings();
    if (input.dataset.settingToggle === 'imageLogos' || input.dataset.settingToggle === 'trailers' || input.dataset.settingToggle === 'spoilerFree') showToast(`${input.checked ? 'Enabled' : 'Disabled'} ${input.closest('.setting-row')?.querySelector('strong')?.textContent || 'setting'}`);
  }));
  document.querySelectorAll('[data-setting-select]').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.settingSelect; const menu = document.querySelector(`[data-setting-menu="${key}"]`); const open = btn.getAttribute('aria-expanded') === 'true';
    document.querySelectorAll('.setting-select[aria-expanded="true"]').forEach(other=>{ other.setAttribute('aria-expanded','false'); other.nextElementSibling?.classList.remove('open'); });
    btn.setAttribute('aria-expanded', String(!open)); menu?.classList.toggle('open', !open);
  }));
  document.querySelectorAll('[data-setting-option]').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.settingOption; let value = btn.dataset.value;     updateSetting(key, value); if (key==='theme') applyTheme(value); if (key==='accent') applyAccent(value);
    const label = btn.querySelector('span')?.textContent || value;
    const valueNode = document.querySelector(`[data-setting-value="${key}"]`);
    if (valueNode) valueNode.textContent = label;
    if (key === 'accent') {
      const selected = ACCENT_OPTIONS.find(x=>x.value===value) || ACCENT_OPTIONS[0];
      const node = document.querySelector('.accent-selected');
      if (node) node.innerHTML = `<i style="--sw1:${selected.color};--sw2:${selected.secondary}"></i>${escapeHtml(selected.label)}`;
      document.querySelectorAll('[data-setting-option="accent"]').forEach(el => el.classList.toggle('active', el.dataset.value===value));
    }
    document.querySelector(`[data-setting-menu="${key}"]`)?.classList.remove('open'); document.querySelector(`[data-setting-select="${key}"]`)?.setAttribute('aria-expanded','false');
    if (key==='detailView' || key==='accent' || key==='theme') showToast(`${label} saved`);
  }));
  bindServerDrag();
}
function bindServerDrag() {
  const list = document.querySelector('#server-list'); if (!list) return; let dragged = null;
  list.querySelectorAll('.server-item').forEach(item => {
    item.addEventListener('dragstart', () => { dragged = item; item.classList.add('dragging'); });
    item.addEventListener('dragend', () => { item.classList.remove('dragging'); dragged = null; saveServerOrder(); });
    item.addEventListener('dragover', e => { e.preventDefault(); if (!dragged || dragged === item) return; const rect = item.getBoundingClientRect(); const before = e.clientY < rect.top + rect.height/2; list.insertBefore(dragged, before ? item : item.nextSibling); refreshServerNumbers(); });
  });
  function refreshServerNumbers(){ list.querySelectorAll('.server-item').forEach((el,i)=>el.querySelector('.server-index').textContent = i+1); }
  function saveServerOrder(){ state.settings.serverOrder = [...list.querySelectorAll('.server-item')].map(el=>el.dataset.server); saveSettings(); showToast('Server order saved'); }
}
function renderAbout() {
  app.innerHTML = `${nav()}<main class="page-shell page"><div class="page-top"><div><span class="eyebrow">Inside LUMA</span><h1 class="page-title">About</h1><p class="page-intro">A focused catalogue experience for discovery, local lists and a provider-agnostic watch layer.</p></div></div><div class="about-grid"><div class="info-panel"><div class="panel-head"><div><span class="panel-kicker">Interface</span><h3>Cinematic by default</h3></div>${iconWrap('layers')}</div><p>Large artwork, compact metadata, fast catalogue browsing and a simple player flow keep the interface focused on finding something worth watching.</p></div><div class="info-panel"><div class="panel-head"><div><span class="panel-kicker">Data</span><h3>TMDB powered</h3></div>${iconWrap('globe')}</div><p>This product uses the TMDB API for metadata and imagery but is not endorsed or certified by TMDB.</p></div></div>${footer()}</main>`;
}
function renderError(message) { app.innerHTML = `${nav()}<main class="page-shell page"><div class="empty"><div>${iconWrap('info')}</div><div>${escapeHtml(message)}</div><a class="btn secondary" href="/" data-link>Return home</a></div>${footer()}</main>`; }
function navigate(url) {
  history.pushState({}, '', url);
  const render = () => router();
  if (document.startViewTransition && !state.settings.reduceMotion) {
    document.startViewTransition(render);
  } else {
    render();
  }
  requestAnimationFrame(() => window.scrollTo({ top:0, behavior: state.settings.reduceMotion ? 'auto' : 'smooth' }));
}
function routeParts() { return location.pathname.replace(/\/+$/, '').split('/').filter(Boolean); }
async function router() {
  const parts = routeParts(); document.title = 'LUMA';
  if (!parts.length) return renderHome();
  if (parts[0] === 'browse') return renderBrowse();
  if (parts[0] === 'movies') return renderCatalog('movie');
  if (parts[0] === 'tv') return renderCatalog('tv');
  if (parts[0] === 'search') return renderSearch();
  if (parts[0] === 'my-list') return renderSavedPage('list');
  if (parts[0] === 'history') return renderSavedPage('history');
  if (parts[0] === 'settings') return renderSettings();
  if (parts[0] === 'about') return renderAbout();
  if (parts[0] === 'details' && parts.length >= 3) return renderDetails(parts[1], Number(parts[2]));
  if (parts[0] === 'watch' && parts.length >= 3) return renderWatch(parts[1], Number(parts[2]));
  renderError('Page not found.');
}

async function openDetailModal(type,id) {
  const overlay=document.createElement('div'); overlay.className='modal-backdrop'; overlay.innerHTML=`<div class="modal-card detail-modal-loading"><button class="modal-close" data-modal-close aria-label="Close">${iconWrap('chevronDown')}</button><div class="empty">Loading title…</div></div>`; document.body.append(overlay); document.body.classList.add('modal-open');
  overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-modal-close]')){overlay.remove();document.body.classList.remove('modal-open');}});
  try {
    const data=await api(`/api/${type}/${id}`); const item=data.details; const trailer=item.videos?.results?.find(v=>v.site==='YouTube'&&['Trailer','Teaser'].includes(v.type)); const saved=isSaved(item.id,type); const creators=type==='tv'?dedupeBy(item.created_by||[],'id').slice(0,2):dedupeBy((data.credits?.crew||[]).filter(x=>x.job==='Director'),'id').slice(0,2); const genres=(item.genres||[]).slice(0,4);
    overlay.querySelector('.modal-card').className='modal-card detail-modal'; overlay.querySelector('.modal-card').innerHTML=`<button class="modal-close" data-modal-close aria-label="Close">${iconWrap('chevronDown')}</button><div class="detail-modal-grid"><img src="${item.posterLarge||item.poster||''}" alt="${escapeHtml(item.title)} poster"><div><span class="eyebrow">${type==='tv'?'Series':'Movie'}</span><h2>${escapeHtml(item.title)}</h2><div class="meta-row"><span>${year(item.release_date)}</span><span class="dot"></span><span>${type==='tv'?`${item.number_of_seasons||0} seasons`:formatMinutes(item.runtime)}</span><span class="dot"></span><span>${iconWrap('star')} ${rating(item.vote_average)}</span></div><div class="tag-row">${genres.map(g=>`<span class="tag">${escapeHtml(g.name)}</span>`).join('')}</div>${creators.length?`<div class="creator-inline"><span>${type==='tv'?'Created by':'Directed by'}</span><strong>${creators.map(p=>escapeHtml(p.name)).join(', ')}</strong></div>`:''}<p class="details-overview">${escapeHtml(item.overview||'No overview available.')}</p><div class="hero-actions"><a class="btn primary" href="/watch/${type}/${item.id}" data-link>${iconWrap('play')} Watch now</a><button class="btn secondary" id="modal-save">${saved?iconWrap('check')+' In My List':iconWrap('plus')+' My List'}</button><a class="btn ghost" href="${detailHref(item)}" data-link data-force-page="true">Open page</a></div></div></div>`;
    overlay.querySelector('#modal-save')?.addEventListener('click',()=>toggleList(item));
  } catch(e) { overlay.querySelector('.modal-card').innerHTML=`<button class="modal-close" data-modal-close aria-label="Close">${iconWrap('chevronDown')}</button><div class="empty">${escapeHtml(e.message)}</div>`; }
}

document.addEventListener('click', event => {
  const railBtn = event.target.closest('[data-row-scroll]');
  if (railBtn) { event.preventDefault(); const row=document.getElementById(railBtn.dataset.rowScroll); if(row) row.scrollBy({left:Number(railBtn.dataset.scrollDir||1)*Math.max(row.clientWidth*.85,220),behavior:'smooth'}); return; }
  const settingOption = event.target.closest('[data-setting-option]');
  if (settingOption) return;
  if (!event.target.closest('.setting-choice')) document.querySelectorAll('.setting-menu.open').forEach(m=>m.classList.remove('open'));
  if (!event.target.closest('.filter-control')) document.querySelectorAll('.filter-menu.open').forEach(m=>m.classList.remove('open'));
  const heroDot = event.target.closest('[data-hero-dot]');
  if (heroDot && state.heroItems.length) {
    event.preventDefault();
    state.heroIndex = Number(heroDot.dataset.heroDot);
    const current = state.heroItems[state.heroIndex];
    const host = document.querySelector('.hero');
    if (host && current) {
      const holder = document.createElement('div');
      holder.innerHTML = hero(current, state.heroIndex, state.heroItems.length);
      host.replaceWith(holder.firstElementChild);
      startHeroCarousel(state.heroItems);
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
    if (href?.startsWith('/')) { event.preventDefault(); navigate(href); return; }
  }
  const top = event.target.closest('[data-top]');
  if (top) { event.preventDefault(); window.scrollTo({ top:0, behavior:'smooth' }); }
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); navigate(location.pathname.startsWith('/search') ? location.pathname : '/search'); setTimeout(() => document.querySelector('#big-search')?.focus(), 60); }
});
window.addEventListener('popstate', router);
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => { if (state.settings.theme === 'system') applyTheme('system'); });
applySettings();
router();
