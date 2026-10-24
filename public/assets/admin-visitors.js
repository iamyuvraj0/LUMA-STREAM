const byId = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const relativeTime = value => {
  const seconds = Math.max(0, Math.round((Date.now() - Number(value || 0)) / 1000));
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};
const clockTime = value => value ? new Date(Number(value)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const dateTime = value => value ? new Date(Number(value)).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const deviceIcon = device => ({ mobile: '▯', tablet: '▣', desktop: '▤' })[device] || '◫';
const displayLocation = visitor => visitor.location && visitor.location !== 'Location unavailable' ? visitor.location : [visitor.city, visitor.region, visitor.country].filter(Boolean).join(', ') || 'Location unavailable';
const locationDetail = visitor => visitor.locationSource || (displayLocation(visitor) === 'Location unavailable' ? 'IP estimate unavailable' : 'IP-based estimate');
const deviceSummary = visitor => [visitor.deviceModel, visitor.browser, visitor.os].filter(Boolean).join(' · ');
const visitorTag = visitor => `<span class="visitor-tag"><i>${deviceIcon(visitor.device)}</i>${escapeHtml(visitor.label || `Visitor ${visitor.id || ''}`)}</span>`;

function renderActive(data) {
  const active = Array.isArray(data.active) ? data.active : [];
  byId('active-visitors').innerHTML = active.length ? active.map(visitor => `
    <article class="visitor-row">
      <span class="device-icon" aria-hidden="true">${deviceIcon(visitor.device)}</span>
      <div class="visitor-main"><div class="visitor-name-line"><strong>${escapeHtml(visitor.label)}</strong><span class="session-dot" aria-label="Active"></span></div><strong class="visitor-title">${escapeHtml(visitor.title)}</strong><div class="visitor-path">${escapeHtml(visitor.path)}</div><div class="visitor-extra"><span class="accent">${escapeHtml(visitor.deviceModel || 'Model unavailable')}</span><br>${escapeHtml([visitor.browser, visitor.os].filter(Boolean).join(' · '))} · ${escapeHtml(displayLocation(visitor))}</div></div>
      <div class="visitor-meta"><span class="state-chip ${visitor.watching ? 'watching' : ''}">${visitor.watching ? 'Watch page' : 'Browsing'}</span><small>${relativeTime(visitor.lastSeen)}</small></div>
    </article>`).join('') : '<div class="empty-state">No active visitors right now. Open STREAM SUNAA in another tab to test the live monitor.</div>';
  byId('active-count').textContent = String(data.activeCount ?? active.length);
  byId('watch-count') && (byId('watch-count').textContent = String(active.filter(visitor => visitor.watching).length));
  byId('mobile-count').textContent = String(data.devices?.mobile ?? 0);
  byId('total-visitors').textContent = Number(data.totalVisitors || 0).toLocaleString();
  byId('total-pageviews').textContent = Number(data.totalPageViews || 0).toLocaleString();
  byId('returning-count').textContent = Number(data.returningVisitors || 0).toLocaleString();
  byId('country-count').textContent = String((data.countries || []).filter(item => item.country && item.country !== 'Location unavailable').length);
  byId('device-split').textContent = `Tablet ${data.devices?.tablet ?? 0} · Desktop ${data.devices?.desktop ?? 0}`;
  byId('active-pill').textContent = `${data.activeCount ?? active.length} active`;
}

function renderCountries(data) {
  const countries = (data.countries || []).filter(item => item.country && item.country !== 'Location unavailable');
  byId('country-list').innerHTML = countries.length ? countries.map(item => `
    <div class="country-row"><span class="country-orb">${escapeHtml(item.countryCode || '◎')}</span><div class="country-main"><strong>${escapeHtml(item.country)}</strong><small>Approximate IP location</small></div><span class="country-count">${Number(item.count || 0)}</span></div>`).join('') : '<div class="empty-state">No reliable country estimates yet. Some networks, VPNs and private IPs cannot be located.</div>';
}

function renderActivity(data) {
  const events = Array.isArray(data.activity) ? data.activity : [];
  byId('activity-rows').innerHTML = events.length ? events.map(event => `
    <tr><td>${visitorTag(event)}</td><td><span class="activity-action">${escapeHtml(event.action)}</span></td><td><strong class="activity-title">${escapeHtml(event.title)}</strong><small class="activity-path">${escapeHtml(event.path)}</small></td><td><span class="device-cell">${escapeHtml(event.deviceModel || event.device || 'Unknown')}<small>${escapeHtml([event.browser, event.os].filter(Boolean).join(' · '))}</small></span></td><td><span class="table-location">${escapeHtml(displayLocation(event))}</span><small class="source-note">${escapeHtml(locationDetail(event))}</small></td><td><time datetime="${new Date(Number(event.time)).toISOString()}">${clockTime(event.time)}</time><small>${relativeTime(event.time)}</small></td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">No recorded page changes yet. Activity appears after a browser opens the site.</td></tr>';
}

function updateStorageState(data) {
  const pill = byId('storage-pill');
  const warning = byId('storage-warning');
  const status = byId('dashboard-status');
  const storage = data.storage || 'memory';
  pill.className = `storage-pill ${storage === 'persistent' ? '' : storage}`;
  pill.textContent = storage === 'persistent' ? 'POSTGRES CONNECTED' : storage === 'unavailable' ? 'DATABASE OFFLINE' : 'TEMPORARY STORAGE';
  warning.hidden = !data.storageWarning;
  warning.textContent = data.storageWarning || '';
  if (storage === 'persistent') {
    status.textContent = `${data.activeCount || 0} active ${Number(data.activeCount) === 1 ? 'visitor' : 'visitors'} · persistent history connected`;
    status.classList.remove('error');
  } else if (storage === 'unavailable') {
    status.textContent = 'Live counts may be temporary while PostgreSQL is unreachable.';
    status.classList.add('error');
  } else {
    status.textContent = `${data.activeCount || 0} active ${Number(data.activeCount) === 1 ? 'visitor' : 'visitors'} · live mode only`;
    status.classList.remove('error');
  }
}

let loading = false;
async function refreshDashboard() {
  if (loading) return;
  loading = true;
  try {
    const response = await fetch('/admin/visitors/data', { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (response.status === 401) throw new Error('Admin authentication expired. Refresh and enter your admin credentials.');
    if (response.status === 503) throw new Error('Set ADMIN_PASSWORD in Render environment variables to enable the dashboard.');
    if (!response.ok) throw new Error(`Dashboard request failed (${response.status}).`);
    const data = await response.json();
    renderActive(data);
    renderCountries(data);
    renderActivity(data);
    updateStorageState(data);
    byId('last-updated').textContent = clockTime(data.generatedAt);
  } catch (error) {
    byId('dashboard-status').textContent = error.message || 'Could not load visitor data.';
    byId('dashboard-status').classList.add('error');
  } finally { loading = false; }
}

let historyOffset = 0;
const historyLimit = 50;
let historyTotal = 0;
let historyLoading = false;
function renderHistoryRows(visitors) {
  byId('history-rows').innerHTML = visitors.length ? visitors.map(visitor => `
    <tr><td>${visitorTag(visitor)}<small>First seen ${escapeHtml(dateTime(visitor.firstSeen))}</small></td><td><strong class="activity-title">${escapeHtml(visitor.title)}</strong><small class="activity-path">${escapeHtml(visitor.path)}</small></td><td><span class="device-cell">${escapeHtml(visitor.deviceModel || 'Model unavailable')}<small>${escapeHtml([visitor.device, visitor.browser, visitor.os].filter(Boolean).join(' · '))}</small></span></td><td><span class="table-location">${escapeHtml(displayLocation(visitor))}</span><small class="source-note">${escapeHtml(locationDetail(visitor))}</small></td><td><time datetime="${new Date(Number(visitor.lastSeen)).toISOString()}">${escapeHtml(dateTime(visitor.lastSeen))}</time><small>${escapeHtml(relativeTime(visitor.lastSeen))}</small></td><td><strong>${Number(visitor.visitCount || 1).toLocaleString()} visits</strong><small>${Number(visitor.pageViews || 0).toLocaleString()} page views</small></td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">No matching visitor records found.</td></tr>';
}
async function refreshHistory(reset = false) {
  if (historyLoading) return;
  if (reset) historyOffset = 0;
  historyLoading = true;
  const query = byId('history-search').value.trim();
  try {
    const url = new URL('/admin/visitors/history', location.origin);
    url.searchParams.set('offset', String(historyOffset));
    url.searchParams.set('limit', String(historyLimit));
    if (query) url.searchParams.set('q', query);
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(response.status === 503 ? 'Visitor history is unavailable. Check the PostgreSQL connection.' : `History request failed (${response.status}).`);
    const data = await response.json();
    historyTotal = Number(data.total || 0);
    renderHistoryRows(data.visitors || []);
    const start = historyTotal ? historyOffset + 1 : 0;
    const end = Math.min(historyOffset + historyLimit, historyTotal);
    byId('history-count').textContent = `${start.toLocaleString()}–${end.toLocaleString()} of ${historyTotal.toLocaleString()} recorded browsers${data.storage === 'memory' ? ' · temporary only' : ''}`;
    byId('history-prev').disabled = historyOffset <= 0;
    byId('history-next').disabled = historyOffset + historyLimit >= historyTotal;
  } catch (error) {
    byId('history-rows').innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(error.message || 'Could not load visitor history.')}</td></tr>`;
    byId('history-count').textContent = 'History unavailable';
    byId('history-prev').disabled = true;
    byId('history-next').disabled = true;
  } finally { historyLoading = false; }
}

byId('refresh-button').addEventListener('click', () => { refreshDashboard(); refreshHistory(); });
byId('history-search-button').addEventListener('click', () => refreshHistory(true));
byId('history-search').addEventListener('keydown', event => { if (event.key === 'Enter') refreshHistory(true); });
byId('history-prev').addEventListener('click', () => { historyOffset = Math.max(0, historyOffset - historyLimit); refreshHistory(); });
byId('history-next').addEventListener('click', () => { if (historyOffset + historyLimit < historyTotal) { historyOffset += historyLimit; refreshHistory(); } });
refreshDashboard();
refreshHistory();
window.setInterval(() => { if (!document.hidden) { refreshDashboard(); refreshHistory(); } }, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshDashboard(); refreshHistory(); } });
