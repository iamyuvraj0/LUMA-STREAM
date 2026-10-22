const byId = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const relativeTime = value => {
  const seconds = Math.max(0, Math.round((Date.now() - Number(value || 0)) / 1000));
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
};
const clockTime = value => new Date(Number(value || 0)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const deviceIcon = device => ({ mobile: '▯', tablet: '▣', desktop: '▤' })[device] || '◫';

function renderActive(data) {
  byId('active-visitors').innerHTML = data.active.length ? data.active.map(visitor => `
    <article class="visitor-row">
      <span class="device-icon" aria-hidden="true">${deviceIcon(visitor.device)}</span>
      <div class="visitor-main"><div class="visitor-name-line"><strong>${escapeHtml(visitor.label)}</strong><span class="session-dot" aria-label="Active"></span></div><strong class="visitor-title">${escapeHtml(visitor.title)}</strong><div class="visitor-path">${escapeHtml(visitor.path)}</div></div>
      <div class="visitor-meta"><span class="state-chip ${visitor.watching ? 'watching' : ''}">${visitor.watching ? 'Watch page' : 'Browsing'}</span><small>${relativeTime(visitor.lastSeen)}</small></div>
    </article>`).join('') : '<div class="empty-state">No active visitors right now. Open STREAM SUNAA in another tab to test this dashboard.</div>';
  byId('active-count').textContent = String(data.activeCount);
  byId('watch-count').textContent = String(data.active.filter(visitor => visitor.watching).length);
  byId('mobile-count').textContent = String(data.devices.mobile);
  byId('desktop-count').textContent = String(data.devices.desktop);
  byId('tablet-count').textContent = String(data.devices.tablet);
  byId('device-mobile-count').textContent = String(data.devices.mobile);
  byId('device-desktop-count').textContent = String(data.devices.desktop);
  byId('active-pill').textContent = `${data.activeCount} active`;
}

function renderPopular(data) {
  byId('popular-pages').innerHTML = data.popularPages.length ? data.popularPages.map(page => `
    <div class="popular-row"><div><strong>${escapeHtml(page.title)}</strong><small>${escapeHtml(page.path)}</small></div><span class="popular-count">${page.count}</span></div>`).join('') : '<div class="empty-state">No active page data yet.</div>';
}

function renderActivity(data) {
  byId('activity-rows').innerHTML = data.activity.length ? data.activity.map(event => `
    <tr><td><strong>${escapeHtml(event.label)}</strong></td><td><span class="activity-action">${escapeHtml(event.action)}</span></td><td><strong class="activity-title">${escapeHtml(event.title)}</strong><small class="activity-path">${escapeHtml(event.path)}</small></td><td><span class="device-cell">${deviceIcon(event.device)} ${escapeHtml(event.device)}</span></td><td><time datetime="${new Date(event.time).toISOString()}">${clockTime(event.time)}</time><small>${relativeTime(event.time)}</small></td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">No page visits yet. Activity appears after an anonymous visitor opens the site.</td></tr>';
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
    renderPopular(data);
    renderActivity(data);
    byId('last-updated').textContent = clockTime(data.generatedAt);
    byId('dashboard-status').textContent = `${data.activeCount} active ${data.activeCount === 1 ? 'visitor' : 'visitors'} · polling every 5 seconds`;
    byId('dashboard-status').classList.remove('error');
    byId('retention-note').textContent = data.retention;
  } catch (error) {
    byId('dashboard-status').textContent = error.message || 'Could not load visitor data.';
    byId('dashboard-status').classList.add('error');
  } finally { loading = false; }
}

byId('refresh-button').addEventListener('click', refreshDashboard);
refreshDashboard();
window.setInterval(() => { if (!document.hidden) refreshDashboard(); }, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDashboard(); });
