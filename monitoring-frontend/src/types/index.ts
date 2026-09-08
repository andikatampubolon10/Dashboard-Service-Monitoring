// Global Environment & Time Filter Types
export type Environment = 'all' | 'production' | 'staging' | 'development';
export type TimeRangePreset = '5m' | '15m' | '1h' | '6h' | '24h' | '7d' | 'custom';
export type HealthStatus = 'healthy' | 'warning' | 'degraded' | 'critical' | 'offline';
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'firing' | 'acknowledged' | 'silenced' | 'resolved';
export type LogLevel = 'FATAL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface GlobalFilterState {
  environment: Environment;
  serverId: string; // 'all' or specific server ID
  serviceId: string; // 'all' or specific service ID
  timeRange: TimeRangePreset;
  from?: string; // ISO string
  to?: string; // ISO string
  refreshInterval: number; // 0 (off), 5, 10, 30, 60 seconds
}

// 1. Server Node Interface
export interface Server {
  id: string;
  name: string;
  ip: string;
  env?: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT' | string;
  status: 'healthy' | 'warning' | 'degraded' | 'critical' | 'offline';
  os: string;
  region: string;
  uptime: string;
  cpuUsagePercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  networkInBytesPerSec: number;
  networkOutBytesPerSec: number;
  hostedServices: string[];
  
  // Placement & Allocation Rules properties
  maxCapacity?: number; // Maximum service slots this server can host (e.g. 3 or 4)
  tier?: 'critical' | 'standard' | 'internal'; // Security / workload isolation tier
  allowedStacks?: string[]; // e.g. ['nodejs'], ['go'], or ['nodejs', 'go']
  complianceStatus?: 'compliant' | 'warning' | 'violation';
  ruleViolations?: string[];

  // Real backend fields from monitoring-backend (/api/servers & /api/servers/:id)
  displayName?: string;
  host?: string;
  port?: number;
  isCustom?: boolean;
  probeResult?: { open: boolean; latencyMs?: number; message?: string };
  description?: string;
  isLocal?: boolean;
  servicesData?: Array<{
    id: string;
    name: string;
    stack: string;
    description: string;
    status: 'UP' | 'DOWN' | string;
    reqPerSecond: number | null;
    errorRatePercent: number | null;
    p99LatencyMs: number | null;
    lastScrapedAt: string | null;
  }>;
  databases?: Array<{
    id: string;
    name: string;
    host: string;
    port: number;
    status: 'UP' | 'DOWN' | string;
    latencyMs?: number | null;
  }>;
  upServices?: number;
  totalServices?: number;
  upDatabases?: number;
  totalDatabases?: number;
  system?: {
    cpu: { usagePercent: number; cores: number };
    memory: { usedMb: number; totalMb: number; usedPercent: number };
    disk: { usedGb: number; totalGb: number; usedPercent: number };
    uptime: { seconds: number; formatted: string };
    timestamp?: string;
  } | null;
  colocation?: {
    canShare: string[];
    cannotShare: string[];
  } | null;
}

export interface ServerDetail extends Server {
  cpuHistory: { timestamp: string; value: number }[];
  memoryHistory: { timestamp: string; value: number }[];
  diskIopsHistory: { timestamp: string; read: number; write: number }[];
  networkHistory: { timestamp: string; in: number; out: number }[];
  processesCount: number;
  kernelVersion: string;
}

export interface RegisterServerPayload {
  name: string;
  host: string;
  port: number;
  description?: string;
  env?: string;
  region?: string;
  serviceIds?: string[];
}

export type RuleSeverity = 'error' | 'warning' | 'info';

export interface PlacementRuleResult {
  ruleId: string;
  title: string;
  description: string;
  passed: boolean;
  severity: RuleSeverity;
  message: string;
}

export interface ServerComplianceSummary {
  status: 'compliant' | 'warning' | 'violation';
  isCompliant: boolean;
  violations: string[];
  warnings: string[];
  rulesEvaluated: PlacementRuleResult[];
}

// 2. Microservice Interface
export interface Service {
  id: string;
  name: string;
  description: string;
  env?: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT' | string;
  status: 'healthy' | 'warning' | 'degraded' | 'critical' | 'offline';
  serverId: string;
  throughputRps: number;
  errorCount: number;
  errorRatePercent: number;
  latencyP50Ms: number;
  latencyP90Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  uptimePercent: number;
  instancesCount: number;
  category: 'core' | 'gateway' | 'billing' | 'identity' | 'messaging' | 'storage';
  version?: string;
  uptime?: string;
  host?: string;

  // Real backend fields from monitoring-backend (/api/services & /api/metrics/summary)
  url?: string;
  metricsUrl?: string;
  stack?: 'nodejs' | 'go' | string;
  rawStatus?: 'UP' | 'DOWN' | string;
  lastScrapedAt?: string | null;
  scrapeLatencyMs?: number | null;
  error?: string | null;
  cpuPercent?: number;
  memoryRssMb?: number;
  memoryHeapUsedMb?: number;
  memoryHeapTotalMb?: number;
  latencyAvgMs?: number;
  reqTotal?: number;
  total5xx?: number;
  total4xx?: number;
  openFds?: number;
  activeConnections?: number;
}

export interface ServiceDetail extends Service {
  serverName: string;
  endpointsCount: number;
  lastDeployment: string;
  gitCommit: string;
  version: string;

  // Metrics breakdown directly from /api/services/:id
  metrics?: {
    throughput?: { reqPerSecond?: number; reqTotal?: number; deltaRequests?: number };
    latency?: { avgMs?: number; p50Ms?: number; p95Ms?: number; p99Ms?: number; totalObservations?: number };
    errorRate?: { percent?: number; total5xx?: number; total4xx?: number; delta5xx?: number; delta4xx?: number };
    connections?: { openFds?: number; activeSseSessions?: number; activeWsConnections?: number; activeSessions?: number; goGoroutines?: number };
    cpu?: { usagePercent?: number };
    memory?: { rssMb?: number; heapUsedMb?: number; heapTotalMb?: number; externalMb?: number; goAllocMb?: number; goSysMb?: number };
    routes?: unknown[];
    custom?: Record<string, unknown>;
  } | null;
}

// 3. Request Telemetry & Trace
export interface ServiceRequest {
  id: string;
  traceId: string;
  serviceId: string;
  serviceName: string;
  method: HttpMethod | string;
  path: string;
  statusCode: number;
  status?: number | string;
  durationMs: number;
  latencyMs?: number;
  timestamp: string;
  time?: string;
  clientIp: string;
  client?: string;
  userAgent?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  breakdown?: {
    dnsMs: number;
    tcpTlsMs: number;
    processingMs: number;
    dbMs?: number;
    externalApiMs?: number;
  };
}

// 4. Error & Stack Trace
export interface ServiceError {
  id: string;
  serviceId: string;
  serviceName: string;
  type: string;
  message: string;
  statusCode: number;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  stackTrace: string;
  affectedEndpoint: string;
  status: 'active' | 'resolved' | 'acknowledged';
  relatedTraceId?: string;
}

// 5. Latency & Performance Metric Time-Series
export interface LatencyMetricSeries {
  timestamp: string;
  time?: string;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  avg?: number;
  rps?: number;
  reqPerSecond?: number;
  deltaRequests?: number;
  errorRatePercent?: number;
  errors5xx?: number;
  errors4xx?: number;
}

// 5b. Request Volume & Daily Time-Series
export interface RequestTimeSeriesPoint {
  timestamp: string; // e.g. "Mon, 01 Sep", "14:00", etc.
  date: string; // "2026-09-01"
  displayDate?: string;
  totalRequests: number;
  successfulRequests: number; // 2xx/3xx
  success2xx?: number;
  clientErrors: number; // 4xx
  client4xx?: number;
  serverErrors: number; // 5xx
  server5xx?: number;
  rps?: number;
  avgDurationMs?: number;
  avgLatencyMs?: number;
  errorRatePercent?: number;
}

// 5c. Discovered Service Endpoint & Accessed Path
export interface ServiceEndpoint {
  method: HttpMethod | string;
  path: string;
  status: number | string;
  count: number;
  avgLatencyMs: number;
}

// 5d. Service Pre-formatted Chart Data
export interface ServiceChartData {
  serviceId: string;
  range: string;
  dataPoints: number;
  latencyPercentiles: {
    labels: string[];
    p50: number[];
    p90: number[];
    p95: number[];
    p99: number[];
    avg: number[];
  };
  throughput: {
    labels: string[];
    reqPerSecond: number[];
    deltaRequests: number[];
  };
  errors: {
    labels: string[];
    errorRatePercent: number[];
    errors5xx: number[];
    errors4xx: number[];
  };
  timeline: LatencyMetricSeries[];
}

// 6. Log Entry
export interface LogEntry {
  id: string;
  serviceId: string;
  serviceName: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

// 7. Alert Rule & Trigger
export interface Alert {
  id: string;
  serviceId: string;
  serviceName: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  triggeredAt: string;
  resolvedAt?: string;
  threshold: string;
  currentValue: string;
}

// 8. Service Dependency Graph
export interface DependencyNode {
  id: string;
  name: string;
  type: 'service' | 'database' | 'external_api' | 'queue';
  status: 'healthy' | 'degraded' | 'critical';
  rps: number;
  latencyMs: number;
  errorRatePercent: number;
  x?: number;
  y?: number;
}

export interface DependencyEdge {
  id: string;
  source: string;
  target: string;
  protocol: 'HTTP' | 'HTTPS' | 'gRPC' | 'TCP' | 'AMQP' | 'WebSocket' | 'Kafka';
  rps: number;
  latencyMs: number;
  errorRatePercent: number;
}

export interface DependencyGraphData {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

// 9. Incident & RCA
export interface Incident {
  id: string;
  title: string;
  severity: 'SEV-1' | 'SEV-2' | 'SEV-3';
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  affectedServices: string[];
  startedAt: string;
  resolvedAt?: string;
  leadEngineer: string;
  summary: string;
  rootCause?: string;
}

// 10. Overview High-level Metrics
export interface OverviewMetrics {
  totalRequests: number;
  requestsDeltaPercent: number;
  averageRps: number;
  totalErrors: number;
  errorRatePercent: number;
  errorRateDeltaPercent: number;
  latencyP50Ms: number;
  latencyP90Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  activeAlertsCount: number;
  activeIncidentsCount: number;
  systemUptimePercent: number;
  healthyServicesCount: number;
  degradedServicesCount: number;
  criticalServicesCount: number;
  totalServicesCount: number;
  serversCount: number;
  latencyHistory: LatencyMetricSeries[];
}

// Pagination & Query Parameter Types
export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// 11. Backend Monitoring Health Info (/health)
export interface BackendHealthInfo {
  status: string;
  timestamp: string;
  uptimeSeconds: number;
  memoryUsage?: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  monitoring: {
    totalServices: number;
    servicesUp: number;
    servicesDown: number;
    hasMetricsData: boolean;
  };
}

// 12. Backend Metrics Summary Response (/api/metrics/summary)
export interface MetricsSummaryService {
  id: string;
  name: string;
  stack: 'nodejs' | 'go' | string;
  status: 'UP' | 'DOWN' | string;
  timestamp: string | null;
  scrapeLatencyMs: number | null;
  error: string | null;
  reqPerSecond: number;
  reqTotal: number;
  errorRatePercent: number;
  total5xx: number;
  total4xx: number;
  latencyAvgMs: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  cpuPercent: number;
  memoryRssMb: number;
  memoryHeapUsedMb: number;
  memoryHeapTotalMb?: number;
  openFds: number;
  activeConnections: number;
}

export interface MetricsSummaryResponse {
  success: boolean;
  timestamp: string;
  overview: {
    total: number;
    up: number;
    down: number;
    unknown?: number;
  };
  services: MetricsSummaryService[];
}

