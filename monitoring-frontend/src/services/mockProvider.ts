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

  async getServices(filter: GlobalFilterState): Promise<Service[]> {
    await delay(150);
    return mockDb.getServices(filter);
  }

  async getServiceById(id: string): Promise<ServiceDetail | null> {
    await delay(200);
    return mockDb.getServiceById(id);
  }

  async getServiceRequests(serviceId: string, _filter: GlobalFilterState): Promise<ServiceRequest[]> {
    await delay(200);
    return mockDb.getServiceRequests(serviceId);
  }

  async getServiceDailyRequests(
    serviceId: string,
    filter: GlobalFilterState,
    granularity?: 'hourly' | 'daily' | '30d'
  ): Promise<RequestTimeSeriesPoint[]> {
    await delay(200);
    return mockDb.getServiceDailyRequests(serviceId, filter, granularity);
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
