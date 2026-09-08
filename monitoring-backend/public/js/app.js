/* ─── Chart.js defaults ──────────────────────────────── */
Chart.defaults.color = '#6B7A92';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';

/* ─── App State ─────────────────────────────────────── */
let currentServiceId = null;
let allServers = [];
const charts = {};

/* ─── Init ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initFilters();
  loadServers();
  loadServiceSidebar();
  setInterval(loadServers, 30_000);
});

/* ─── Navigation ────────────────────────────────────── */
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

  document.getElementById(`page-${page}`).classList.add('active');
  const navEl = document.getElementById(`nav-${page}`);
  if (navEl) navEl.classList.add('active');
}

/* ─── Tabs ───────────────────────────────────────────── */
function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.target).classList.add('active');
    });
  });
}

/* ─── Filters (requests table) ───────────────────────── */
function initFilters() {
  document.getElementById('search-requests').addEventListener('input', debounce(() => {
    if (currentServiceId) loadRequests(currentServiceId);
  }, 350));
  document.getElementById('filter-method').addEventListener('change', () => {
    if (currentServiceId) loadRequests(currentServiceId);
  });
}

/* ══════════════════════════════════════════════════════
   SERVER TABLE
══════════════════════════════════════════════════════ */
async function loadServers() {
  try {
    const res = await fetch('/api/servers');
    const data = await res.json();
    allServers = data.servers || [];
    renderServerTable(allServers);
  } catch (err) {
    console.error('Servers load error:', err);
  }
}

function renderServerTable(servers) {
  const tbody = document.getElementById('servers-tbody');
  document.getElementById('servers-row-count').textContent = `${servers.length} rows`;

  // Search filter
  const q = (document.getElementById('search-servers')?.value || '').toLowerCase();
  const filtered = q ? servers.filter(s => s.name.toLowerCase().includes(q) || s.host.toLowerCase().includes(q)) : servers;

  tbody.innerHTML = '';
  filtered.forEach(server => {
    const allUp = server.upServices === server.totalServices;
    const allDown = server.upServices === 0;
    const badgeClass = allUp ? 'badge-healthy' : allDown ? 'badge-critical' : 'badge-degraded';
    const badgeText  = allUp ? '● Healthy'     : allDown ? '● Critical'    : '● Degraded';

    const sys     = server.system;
    const cpuPct  = sys?.cpu?.usagePercent   ?? 0;
    const ramPct  = sys?.memory?.usedPercent ?? 0;
    const uptime  = sys?.uptime?.formatted   ?? '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="server-name-cell">
          <span class="server-icon">▣</span>
          <span class="server-name-text">${escHtml(server.name)}</span>
        </div>
      </td>
      <td><span class="badge ${badgeClass}">${badgeText}</span></td>
      <td>${miniBar(cpuPct)}</td>
      <td>${miniBar(ramPct)}</td>
      <td><span class="svc-count">${server.upServices}<span style="color:var(--text-muted);font-weight:400"> / ${server.totalServices}</span></span></td>
      <td style="color:var(--text-muted)">${uptime}</td>
    `;
    tr.addEventListener('click', () => openServerDetail(server.id));
    tbody.appendChild(tr);
  });
}

function miniBar(pct) {
  const cls = pct < 60 ? 'bar-green' : pct < 85 ? 'bar-orange' : 'bar-red';
  return `<div class="usage-mini">
    <div class="usage-mini-bar"><div class="usage-mini-fill ${cls}" style="width:${Math.min(pct,100)}%"></div></div>
    <span class="usage-mini-pct">${pct.toFixed(0)}%</span>
  </div>`;
}

// Search on server table
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('search-servers').addEventListener('input', debounce(() => {
    renderServerTable(allServers);
  }, 300));
});

/* ══════════════════════════════════════════════════════
   SERVER DETAIL PANEL
══════════════════════════════════════════════════════ */
async function openServerDetail(serverId) {
  try {
    const res = await fetch(`/api/servers/${serverId}`);
    const data = await res.json();
    if (!data.success) return;
    renderDetailPanel(data.server);
  } catch (err) {
    console.error('Server detail error:', err);
  }
}

function renderDetailPanel(server) {
  const sys = server.system;

  // Header
  document.getElementById('detail-name').textContent = server.displayName || server.name;
  document.getElementById('detail-host').textContent = `host: ${server.host}`;

  // System metrics
  const metricsEl = document.getElementById('detail-metrics');
  if (sys) {
    const cpuPct  = sys.cpu?.usagePercent   ?? 0;
    const ramPct  = sys.memory?.usedPercent ?? 0;
    const diskPct = sys.disk?.usedPercent   ?? 0;
    const ramUsed = ((sys.memory?.usedMb ?? 0) / 1024).toFixed(1);
    const ramTot  = ((sys.memory?.totalMb ?? 0) / 1024).toFixed(1);
    const diskU   = sys.disk?.usedGb  ?? 0;
    const diskT   = sys.disk?.totalGb ?? 0;

    metricsEl.innerHTML = `
      ${detailMetric('CPU', cpuPct.toFixed(1), '%', `${sys.cpu?.cores ?? 0} cores`, cpuPct)}
      ${detailMetric('Memory', ramPct.toFixed(1), '%', `${ramUsed} / ${ramTot} GB`, ramPct)}
      ${detailMetric('Disk', diskPct.toFixed(1), '%', `${diskU} / ${diskT} GB`, diskPct)}
    `;
  } else {
    metricsEl.innerHTML = `<div style="color:var(--text-muted);font-size:12px;grid-column:1/-1">Host metrics unavailable for remote servers.</div>`;
  }

  // Services
  const svcsEl = document.getElementById('detail-services');
  document.getElementById('detail-svc-title').textContent = `Services (${server.upServices}/${server.totalServices} UP)`;
  svcsEl.innerHTML = '';
  server.services.forEach(s => {
    const dot    = s.status === 'UP' ? 'dot-up' : 'dot-down';
    const stack  = (s.stack || 'unknown').toLowerCase().includes('go') ? 'stack-go' : 'stack-nodejs';
    const stackL = (s.stack || 'unknown').toLowerCase().includes('go') ? 'Go' : 'Node.js';
    const rps    = s.reqPerSecond != null ? `${s.reqPerSecond} req/s` : '—';
    const lat    = s.p99LatencyMs  != null ? `p99 ${s.p99LatencyMs}ms` : '—';
    const err    = s.errorRatePercent != null ? `${s.errorRatePercent}% err` : '—';

    const row = document.createElement('div');
    row.className = 'detail-svc-row clickable';
    row.title = `Click to inspect ${s.name}`;
    row.innerHTML = `
      <div class="detail-svc-left">
        <span class="status-dot ${dot}"></span>
        <div>
          <div class="detail-svc-name">${escHtml(s.name)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${escHtml(s.description || '')}</div>
        </div>
        <span class="stack-tag ${stack}">${stackL}</span>
      </div>
      <div class="detail-svc-right">
        <span>${rps}</span>
        <span>${lat}</span>
        <span>${err}</span>
        <span class="badge ${s.status === 'UP' ? 'badge-healthy' : 'badge-critical'}">${s.status}</span>
        <span style="color:var(--text-muted);font-size:14px;padding-left:4px">→</span>
      </div>
    `;
    row.addEventListener('click', () => {
      closeDetail();
      selectService(s);
    });
    svcsEl.appendChild(row);
  });

  // Databases
  const dbEl = document.getElementById('detail-databases');
  document.getElementById('detail-db-title').textContent = `Databases (${server.upDatabases}/${server.totalDatabases} UP)`;
  dbEl.innerHTML = server.databases.map(db => `
    <span class="db-badge ${db.status === 'UP' ? 'db-badge-up' : 'db-badge-down'}">
      ${db.status === 'UP' ? '✓' : '✗'} ${escHtml(db.name)}
      ${db.latencyMs ? `<span style="opacity:0.6;font-size:10px">${db.latencyMs}ms</span>` : ''}
    </span>
  `).join('');

  // Co-location rules
  const col = server.colocation;
  if (col) {
    document.getElementById('detail-can-share').innerHTML =
      col.canShare.map(r => `<li>${escHtml(r)}</li>`).join('');
    document.getElementById('detail-cannot-share').innerHTML =
      col.cannotShare.map(r => `<li>${escHtml(r)}</li>`).join('');
  }

  // Open panel
  document.getElementById('detail-overlay').classList.add('open');
  document.getElementById('detail-panel').classList.add('open');
}

function closeDetail() {
  document.getElementById('detail-overlay').classList.remove('open');
  document.getElementById('detail-panel').classList.remove('open');
}

function detailMetric(label, value, unit, sub, pct) {
  const cls = pct < 60 ? 'bar-green' : pct < 85 ? 'bar-orange' : 'bar-red';
  return `
    <div class="detail-metric">
      <div class="dm-label">${label}</div>
      <div class="dm-value">${value}<span class="dm-unit">${unit}</span></div>
      <div class="dm-sub">${sub}</div>
      <div class="dm-bar"><div class="dm-fill ${cls}" style="width:${Math.min(pct,100)}%"></div></div>
    </div>
  `;
}

/* ══════════════════════════════════════════════════════
   SERVICE SIDEBAR + VIEW
══════════════════════════════════════════════════════ */
async function loadServiceSidebar() {
  try {
    const res = await fetch('/api/services');
    const data = await res.json();
    const nav = document.getElementById('service-list');
    nav.innerHTML = '';
    data.services.forEach(s => {
      const dot = s.status === 'UP' ? 'dot-up' : s.status === 'DOWN' ? 'dot-down' : 'dot-unknown';
      const item = document.createElement('div');
      item.className = 'nav-item';
      item.innerHTML = `
        <span class="nav-label">${escHtml(s.name.replace(' Service', ''))}</span>
        <span class="status-dot ${dot}"></span>
      `;
      item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        selectService(s);
      });
      nav.appendChild(item);
    });
  } catch (err) {
    console.error('Service list error:', err);
  }
}

function selectService(service) {
  currentServiceId = service.id;
  navigateTo('service');
  document.getElementById('svc-title').textContent = service.name;
  document.getElementById('svc-desc').textContent  = service.description || '';

  // Reset tabs
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-target="tab-overview"]').classList.add('active');
  document.getElementById('tab-overview').classList.add('active');

  loadCharts(service.id);
  loadRequests(service.id);
}

/* ══════════════════════════════════════════════════════
   CHARTS
══════════════════════════════════════════════════════ */
async function loadCharts(id) {
  try {
    const [cr, dr] = await Promise.all([
      fetch(`/api/services/${id}/charts?range=3600&points=60`),
      fetch(`/api/services/${id}/daily?days=14`),
    ]);
    const c = await cr.json();
    const d = await dr.json();
    renderDailyChart(d.history || []);
    renderLatencyChart(c.latencyPercentiles || {});
    renderThroughputChart(c.throughput || {});
    renderErrorsChart(c.errors || {});
  } catch (err) { console.error('Charts error:', err); }
}

function mkChart(id, type, data, opts = {}) {
  if (charts[id]) charts[id].destroy();
  const ctx = document.getElementById(id)?.getContext('2d');
  if (!ctx) return;
  charts[id] = new Chart(ctx, {
    type,
    data,
    options: { responsive: true, maintainAspectRatio: false, ...opts },
  });
}

function line(label, data, color, dashed = false) {
  return { label, data: data || [], borderColor: color, backgroundColor: 'transparent',
    tension: 0.4, pointRadius: 0, borderWidth: dashed ? 1.5 : 2,
    borderDash: dashed ? [4,4] : [] };
}

function renderDailyChart(h) {
  mkChart('dailyChart', 'bar', {
    labels: h.map(d => d.displayDate),
    datasets: [{ label: 'Requests', data: h.map(d => d.totalRequests),
      backgroundColor: 'rgba(249,115,22,0.7)', hoverBackgroundColor: '#F97316', borderRadius: 3 }],
  }, { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } });
}

function renderLatencyChart(l) {
  mkChart('latencyChart', 'line', {
    labels: l.labels || [],
    datasets: [line('p99', l.p99, '#EF4444'), line('p95', l.p95, '#F97316'),
               line('p50', l.p50, '#10B981'), line('avg', l.avg, '#3B82F6', true)],
  }, { interaction: { intersect: false, mode: 'index' }, scales: { y: { beginAtZero: true } } });
}

function renderThroughputChart(t) {
  mkChart('throughputChart', 'line', {
    labels: t.labels || [],
    datasets: [{ label: 'req/s', data: t.reqPerSecond || [],
      borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.08)',
      fill: true, tension: 0.4, pointRadius: 0 }],
  }, { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } },
       interaction: { intersect: false, mode: 'index' } });
}

function renderErrorsChart(e) {
  mkChart('errorsChart', 'line', {
    labels: e.labels || [],
    datasets: [line('4xx', e.errors4xx, '#F59E0B'), line('5xx', e.errors5xx, '#EF4444')],
  }, { interaction: { intersect: false, mode: 'index' }, scales: { y: { beginAtZero: true } } });
}

/* ══════════════════════════════════════════════════════
   REQUESTS TABLE
══════════════════════════════════════════════════════ */
async function loadRequests(id) {
  const search = document.getElementById('search-requests').value.trim();
  const method = document.getElementById('filter-method').value;
  const params = new URLSearchParams({ limit: 50 });
  if (search) params.set('search', search);
  if (method) params.set('method', method);
  try {
    const res  = await fetch(`/api/services/${id}/requests?${params}`);
    const data = await res.json();
    document.getElementById('row-count').textContent = `${data.total} rows`;
    const tbody = document.getElementById('requests-tbody');
    tbody.innerHTML = '';
    data.rows.forEach(r => {
      const sc = r.status >= 500 ? 'status-5xx' : r.status >= 400 ? 'status-4xx' : 'status-2xx';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="method-tag method-${r.method}">${r.method}</span></td>
        <td style="color:#CBD5E1;font-family:monospace">${escHtml(r.path)}</td>
        <td class="${sc}">${r.status}</td>
        <td>${r.latencyMs}ms</td>
        <td style="color:var(--text-muted);font-family:monospace">${r.client}</td>
        <td style="color:var(--text-muted)">${r.time}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) { console.error('Requests error:', err); }
}

/* ══════════════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════════════ */
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
