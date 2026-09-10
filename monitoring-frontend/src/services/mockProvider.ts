import { IMonitoringProvider } from './IMonitoringProvider';
import {
  Server,
  ServerDetail,
  Service,
  ServiceDetail,
  ServiceRequest,
  ServiceError,
  LogEntry,
  Alert,
  DependencyGraphData,
  OverviewMetrics,
  GlobalFilterState,
  LatencyMetricSeries,
  RequestTimeSeriesPoint,
  BackendHealthInfo,
  MetricsSummaryResponse,
  ServiceEndpoint,
  ServiceChartData,
  RegisterServerPayload,
  DiscoverServerPayload,
  DiscoverServerResponse,
  UpdateServerPayload,
} from '../types';
import { mockDb } from '../mock/database';

// Simulate network latency for realistic loading states & skeletons
const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockMonitoringProvider implements IMonitoringProvider {
  async getHealthStatus(): Promise<BackendHealthInfo> {
    await delay(100);
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: 3600,
      monitoring: {
        totalServices: 7,
        servicesUp: 7,
        servicesDown: 0,
        hasMetricsData: true,
      },
    };
  }

  async getMetricsSummary(): Promise<MetricsSummaryResponse> {
    await delay(150);
    return {
      success: true,
      timestamp: new Date().toISOString(),
      overview: {
        total: 7,
        up: 7,
        down: 0,
        unknown: 0,
      },
      services: [],
    };
  }

  async getOverviewMetrics(filter: GlobalFilterState): Promise<OverviewMetrics> {
    await delay(200);
    return mockDb.getOverviewMetrics(filter);
  }

  async getServers(filter: GlobalFilterState): Promise<Server[]> {
    await delay(150);
    return mockDb.getServers(filter);
  }

  async getServerById(id: string): Promise<ServerDetail | null> {
    await delay(200);
    return mockDb.getServerById(id);
  }

  async discoverServer(payload: DiscoverServerPayload): Promise<DiscoverServerResponse> {
    await delay(400);
    return {
      success: true,
      host: payload.host,
      discoveryMode: payload.mode,
      os: payload.mode === 'ssh' ? 'Ubuntu 22.04 LTS (WSL2)' : 'Remote Linux Host',
      spec: {
        cores: 16,
        totalMemoryMb: 32768,
        usedMemoryMb: 11468,
        totalDiskGb: 500,
        usedDiskGb: 140,
        uptimeSeconds: 86400 * 3,
        uptimeFormatted: '3d 00h',
        os: payload.mode === 'ssh' ? 'Ubuntu 22.04 LTS (WSL2)' : 'Remote Linux Host',
      },
      services: [
        {
          id: 'live-consult',
          name: 'Live Consult Service',
          port: 4004,
          url: `http://${payload.host}:4004`,
          metricsPath: '/metrics',
          stack: 'go',
          description: 'Real-time WebSocket consultation sessions',
          status: 'UP',
          latencyMs: 12,
          hasMetrics: true,
        },
        {
          id: 'ai-consultation',
          name: 'AI Consultation Service',
          port: 4006,
          url: `http://${payload.host}:4006`,
          metricsPath: '/metrics',
          stack: 'nodejs',
          description: 'AI-powered consultation lifecycle & inference',
          status: 'UP',
          latencyMs: 15,
          hasMetrics: true,
        },
        {
          id: 'medical-record',
          name: 'Medical Record Service',
          port: 3002,
          url: `http://${payload.host}:3002`,
          metricsPath: '/metrics',
          stack: 'nodejs',
          description: 'Patient medical history and record indexing',
          status: 'UP',
          latencyMs: 8,
          hasMetrics: true,
        },
        {
          id: 'lifestyle',
          name: 'Lifestyle Service',
          port: 4007,
          url: `http://${payload.host}:4007`,
          metricsPath: '/metrics',
          stack: 'nodejs',
          description: 'Exercise catalog and completion tracking',
          status: 'UP',
          latencyMs: 10,
          hasMetrics: true,
        },
      ],
      dockerContainers: ['live-consult-app', 'ai-inference-worker', 'medical-record-api', 'lifestyle-api'],
    };
  }

  async registerServer(payload: RegisterServerPayload): Promise<Server> {
    await delay(200);
    const cleanSlug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const server: Server = {
      id: `server-${cleanSlug || Date.now()}`,
      name: payload.name,
      displayName: payload.name,
      ip: payload.host,
      host: payload.host,
      port: payload.port,
      isCustom: true,
      probeResult: { open: true, latencyMs: 12, message: `Port ${payload.port} reachable` },
      description: payload.description || `Target server node at ${payload.host}:${payload.port}`,
      status: 'healthy',
      os: 'Custom Host (Mock)',
      region: payload.region || 'jakarta-idc',
      env: payload.env || 'PRODUCTION',
      uptime: '1h 00m',
      cpuUsagePercent: 12,
      memoryUsedBytes: 4 * 1024 * 1024 * 1024,
      memoryTotalBytes: 16 * 1024 * 1024 * 1024,
      diskUsedBytes: 45 * 1024 * 1024 * 1024,
      diskTotalBytes: 200 * 1024 * 1024 * 1024,
      networkInBytesPerSec: 0,
      networkOutBytesPerSec: 0,
      hostedServices: payload.serviceIds || [],
      maxCapacity: 4,
    };
    return server;
  }

  async updateServer(id: string, payload: UpdateServerPayload): Promise<Server> {
    await delay(150);
    const existing = await this.getServerById(id);
    if (!existing) throw new Error('Server not found');
    return {
      ...existing,
      name: payload.name || existing.name,
      displayName: payload.displayName || payload.name || existing.displayName,
      host: payload.host || existing.host,
      ip: payload.host || existing.ip,
      port: payload.port !== undefined ? payload.port : existing.port,
      description: payload.description !== undefined ? payload.description : existing.description,
      env: payload.env || existing.env,
      region: payload.region || existing.region,
    };
  }

  async deleteServer(id: string): Promise<boolean> {
    await delay(150);
    return mockDb.deleteServer(id);
  }

  async getServices(filter: GlobalFilterState): Promise<Service[]> {
    await delay(150);
    return mockDb.getServices(filter);
  }

  async getServiceById(id: string): Promise<ServiceDetail | null> {
    await delay(200);
    return mockDb.getServiceById(id);
  }

  async getServiceRequests(
    serviceId: string,
    _filter?: GlobalFilterState,
    _options?: { search?: string; method?: string; status?: string; page?: number; limit?: number }
  ): Promise<ServiceRequest[]> {
    await delay(200);
    return mockDb.getServiceRequests(serviceId);
  }

  async getServiceDailyRequests(
    serviceId: string,
    filter?: GlobalFilterState,
    granularity?: 'hourly' | 'daily' | '30d',
    _days?: number
  ): Promise<RequestTimeSeriesPoint[]> {
    await delay(200);
    return mockDb.getServiceDailyRequests(serviceId, filter || { environment: 'all', serverId: 'all', serviceId, timeRange: '7d', refreshInterval: 0 }, granularity);
  }

  async getRequestById(requestId: string): Promise<ServiceRequest | null> {
    await delay(100);
    return mockDb.getRequestById(requestId);
  }

  async getServiceErrors(serviceId: string, _filter: GlobalFilterState): Promise<ServiceError[]> {
    await delay(200);
    return mockDb.getServiceErrors(serviceId);
  }

  async getErrorById(errorId: string): Promise<ServiceError | null> {
    await delay(100);
    return mockDb.getErrorById(errorId);
  }

  async getServiceLatency(serviceId: string, filter: GlobalFilterState): Promise<LatencyMetricSeries[]> {
    await delay(200);
    return mockDb.getServiceLatency(serviceId, filter);
  }

  async getServiceCharts(serviceId: string, rangeSec?: number, points?: number): Promise<ServiceChartData> {
    await delay(200);
    return mockDb.getServiceCharts(serviceId, rangeSec, points);
  }

  async getServiceEndpoints(serviceId: string): Promise<ServiceEndpoint[]> {
    await delay(150);
    return mockDb.getServiceEndpoints(serviceId);
  }

  async getServiceLogs(serviceId: string, _filter: GlobalFilterState): Promise<LogEntry[]> {
    await delay(150);
    return mockDb.getServiceLogs(serviceId);
  }

  async getServiceDependencies(serviceId: string): Promise<DependencyGraphData> {
    await delay(200);
    return mockDb.getServiceDependencies(serviceId);
  }

  async getServiceAlerts(serviceId: string): Promise<Alert[]> {
    await delay(150);
    return mockDb.getServiceAlerts(serviceId);
  }

  async acknowledgeAlert(alertId: string): Promise<boolean> {
    await delay(100);
    return mockDb.acknowledgeAlert(alertId);
  }

  async silenceAlert(alertId: string, durationMinutes: number): Promise<boolean> {
    await delay(100);
    return mockDb.silenceAlert(alertId, durationMinutes);
  }
}
