const state = document.getElementById('analytics-state');
const toggle = document.getElementById('analytics-toggle');
function updateAnalyticsControl() {
  let disabled = false;
  try { disabled = localStorage.getItem('sunaa-analytics-opt-out') === '1'; } catch { state.textContent = 'Browser storage is unavailable, so this preference cannot be saved.'; toggle.disabled = true; return; }
  state.textContent = disabled ? 'Analytics are currently disabled in this browser.' : 'Anonymous analytics are currently enabled in this browser.';
  toggle.textContent = disabled ? 'Re-enable analytics' : 'Opt out of analytics';
}
toggle.addEventListener('click', () => {
  try {
    if (localStorage.getItem('sunaa-analytics-opt-out') === '1') localStorage.removeItem('sunaa-analytics-opt-out');
    else localStorage.setItem('sunaa-analytics-opt-out', '1');
  } catch { state.textContent = 'Could not save this preference in this browser.'; return; }
  updateAnalyticsControl();
});
updateAnalyticsControl();
