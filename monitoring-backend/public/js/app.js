// Global Chart Configuration
Chart.defaults.color = '#9CA3AF';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.borderColor = '#374151';

let currentServiceId = null;
let charts = {};

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  fetchServices();
  
  // Debounced search for requests table
  document.getElementById('search-requests').addEventListener('input', debounce((e) => {
    if (currentServiceId) loadRequests(currentServiceId, e.target.value);
  }, 400));
});

function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active from all tabs & panes
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      
      // Add active to clicked tab
      tab.classList.add('active');
      document.getElementById(tab.dataset.target).classList.add('active');
    });
  });
}

async function fetchServices() {
  try {
    const res = await fetch('/api/services');
    const data = await res.json();
    const nav = document.getElementById('service-list');
    nav.innerHTML = '';
    
    data.services.forEach((s, index) => {
      const div = document.createElement('div');
      div.className = 'nav-item';
      
      const statusColor = s.status === 'UP' ? '#22C55E' : '#EF4444';
      
      div.innerHTML = `
        <span>${s.name}</span>
        <span class="status-dot" style="background: ${statusColor}"></span>
      `;
      
      div.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        div.classList.add('active');
        selectService(s);
      });
      nav.appendChild(div);
      
      // Auto select the first service
      if (index === 0) {
        div.classList.add('active');
        selectService(s);
      }
    });
  } catch (err) {
    console.error('Failed to fetch services:', err);
  }
}

function selectService(service) {
  currentServiceId = service.id;
  document.getElementById('service-title').innerText = service.name;
  
  loadCharts(service.id);
  loadRequests(service.id);
}

async function loadCharts(id) {
  try {
    const [chartsRes, dailyRes] = await Promise.all([
      fetch(`/api/services/${id}/charts?range=3600&points=60`),
      fetch(`/api/services/${id}/daily?days=14`)
    ]);
    
    const chartsData = await chartsRes.json();
    const dailyData = await dailyRes.json();

    renderDailyChart(dailyData.history);
    renderLatencyChart(chartsData.latencyPercentiles);
    renderThroughputChart(chartsData.throughput);
    renderErrorsChart(chartsData.errors);
  } catch (err) {
    console.error('Failed to load charts:', err);
  }
}

async function loadRequests(id, search = '') {
  try {
    const res = await fetch(`/api/services/${id}/requests?limit=50&search=${encodeURIComponent(search)}`);
    const data = await res.json();
    
    const tbody = document.getElementById('requests-tbody');
    tbody.innerHTML = '';
    document.getElementById('row-count').innerText = `${data.total} rows`;

    data.rows.forEach(r => {
      const tr = document.createElement('tr');
      
      // Determine status color class
      let statusClass = 'status-2xx';
      if (r.status >= 400 && r.status < 500) statusClass = 'status-4xx';
      if (r.status >= 500) statusClass = 'status-5xx';

      tr.innerHTML = `
        <td style="font-weight:600">${r.method}</td>
        <td style="color:#D1D5DB">${r.path}</td>
        <td class="${statusClass}">${r.status}</td>
        <td>${r.latencyMs}ms</td>
        <td style="color:#9CA3AF">${r.client}</td>
        <td style="color:#9CA3AF">${r.time}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load requests:', err);
  }
}

/* ─── Chart Renderers ──────────────────────────────────────────────────────── */

function createOrUpdateChart(id, type, data, options) {
  const ctx = document.getElementById(id).getContext('2d');
  if (charts[id]) {
    charts[id].destroy();
  }
  charts[id] = new Chart(ctx, { type, data, options });
}

function renderDailyChart(history) {
  createOrUpdateChart('dailyChart', 'bar', {
    labels: history.map(d => d.displayDate),
    datasets: [{
      label: 'Total Requests',
      data: history.map(d => d.totalRequests),
      backgroundColor: 'rgba(249, 115, 22, 0.8)',
      hoverBackgroundColor: 'rgba(249, 115, 22, 1)',
      borderRadius: 4
    }]
  }, { 
    responsive: true, 
    plugins: { legend: { display: false } }
  });
}

function renderLatencyChart(latency) {
  createOrUpdateChart('latencyChart', 'line', {
    labels: latency.labels,
    datasets: [
      { label: 'p99', data: latency.p99, borderColor: '#EF4444', backgroundColor: 'transparent', tension: 0.4 },
      { label: 'p95', data: latency.p95, borderColor: '#F97316', backgroundColor: 'transparent', tension: 0.4 },
      { label: 'p50', data: latency.p50, borderColor: '#22C55E', backgroundColor: 'transparent', tension: 0.4 }
    ]
  }, { 
    responsive: true, 
    interaction: { intersect: false, mode: 'index' }
  });
}

function renderThroughputChart(throughput) {
  createOrUpdateChart('throughputChart', 'line', {
    labels: throughput.labels,
    datasets: [{
      label: 'Req/s',
      data: throughput.reqPerSecond,
      borderColor: '#3B82F6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      fill: true,
      tension: 0.4
    }]
  }, { 
    responsive: true, 
    plugins: { legend: { display: false } }
  });
}

function renderErrorsChart(errors) {
  createOrUpdateChart('errorsChart', 'line', {
    labels: errors.labels,
    datasets: [
      { label: '4xx', data: errors.errors4xx, borderColor: '#EAB308', backgroundColor: 'transparent', tension: 0.4 },
      { label: '5xx', data: errors.errors5xx, borderColor: '#EF4444', backgroundColor: 'transparent', tension: 0.4 }
    ]
  }, { 
    responsive: true, 
    interaction: { intersect: false, mode: 'index' }
  });
}

/* ─── Utils ────────────────────────────────────────────────────────────────── */

function debounce(func, timeout = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
}
