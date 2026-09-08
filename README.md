# OBSERVEPULSE — Enterprise Service Monitoring Dashboard

A production-grade, highly performant microservice & infrastructure observability dashboard built with **React 18**, **TypeScript**, **Vite**, **Tailwind CSS**, **React Router v6**, **TanStack Query v5**, and **Recharts**.

---

## 🚀 Key Features

- 📊 **Executive Overview Dashboard**: High-level Golden Signals (Throughput, 1,850 Errors, Avg Latency, Uptime SLA), multi-series latency trends, service health distribution, and microservices status catalog.
- 🖥️ **Infrastructure Server Monitoring**: Node-level metrics (CPU, RAM, Disk IOPS, Network MB/s), process counts, and hosted container workloads.
- ⚡ **Microservice Deep-Dive (7 Scoped Sub-tabs per Service)**:
  1. **Overview**: Service Golden Signals, live dependency topology graph, and top exception breakdowns.
  2. **Requests Explorer**: Real-time request log with HTTP status, duration, and full Waterfall APM trace inspector modal.
  3. **Errors Tracking**: Exception stack trace inspector with breadcrumb timeline and occurrence frequency.
  4. **Latency & APM**: p50, p90, p95, p99 percentiles timeline and response time distribution histogram.
  5. **Logs Stream**: Live terminal log viewer with level filtering (ERROR/WARN/INFO/DEBUG), structured metadata inspector, regex search, and auto-scroll.
  6. **Dependencies**: Visual upstream & downstream topology graph with node click drill-down.
  7. **Alerts**: Real-time alert manager with Acknowledge and 1-hour Silence actions.
- 🔄 **Dynamic Global Controls**: Global Environment selector (`production`, `staging`, `development`), Server filter, Service filter, Time-Range Presets (`15m`, `1h`, `6h`, `24h`, `7d`), and configurable Auto-Refresh interval (Off, 5s, 10s, 30s, 60s).
- 🌓 **Dark & Light Mode Support**: Seamless theme switching with localStorage persistence.
- 🔌 **Pluggable Architecture (`IMonitoringProvider`)**: Zero component lock-in. Switch between `MockMonitoringProvider`, `PrometheusMonitoringProvider`, and `LokiLogProvider` via clean dependency injection.

---

## 📁 Directory Architecture

```text
src/
├── components/
│   ├── charts/         # LineChart, BarChart, DonutChart (Recharts)
│   ├── common/         # MetricCard, StatusBadge, SeverityBadge, Modal, Skeletons, EmptyState
│   ├── filters/        # GlobalFilter, TimeRangePicker, AutoRefreshControl
│   ├── monitoring/     # LogViewer, DependencyGraph, RequestDetail, ErrorDetail
│   ├── navigation/     # Sidebar, Topbar, Breadcrumbs
│   └── tables/         # DataTable (sortable, searchable, paginated), AlertTable
├── context/            # FilterContext, ThemeContext
├── hooks/              # Custom TanStack Query data-fetching hooks
├── layouts/            # DashboardLayout
├── mock/               # Single-source-of-truth relational mock database
├── pages/
│   ├── OverviewPage.tsx
│   ├── servers/        # ServerListPage, ServerDetailPage
│   └── services/       # ServiceListPage, ServiceDetailPage & 7 Sub-tabs
├── routes/             # React Router v6 configuration
├── services/           # IMonitoringProvider, MockProvider, Prometheus/Loki stubs, monitoringApi
├── types/              # Full TypeScript domain interfaces
└── utils/              # Formatters, Date helpers, Status color mappings
```

---

## 🛠️ Getting Started

### Local Development

1. **Install Dependencies**:
   ```sh
   npm install
   ```

2. **Run Development Server**:
   ```sh
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

3. **Build for Production**:
   ```sh
   npm run build
   ```

4. **Preview Production Build**:
   ```sh
   npm run preview
   ```

---

## 🐳 Docker Deployment

### Multi-Stage Docker Build

```sh
# Build and run container locally
docker build -t observepulse-dashboard -f docker/Dockerfile .
docker run -p 8080:80 observepulse-dashboard
```

### Docker Compose

- **Development**:
  ```sh
  docker compose -f docker/docker-compose.dev.yml up -d --build
  ```
- **Production**:
  ```sh
  docker compose -f docker/docker-compose.prod.yml up -d --build
  ```

---

## 🔄 CI/CD Jenkins Pipeline

The included `Jenkinsfile` provides automated validation and deployment:
1. SCM Checkout
2. Terraform validation & workspace planning
3. Development stack deployment
4. Interactive approval gate for production
5. Automated production deployment via Docker Compose