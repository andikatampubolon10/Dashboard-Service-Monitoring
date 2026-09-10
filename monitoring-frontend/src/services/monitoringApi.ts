import { IMonitoringProvider } from './IMonitoringProvider';
import { MockMonitoringProvider } from './mockProvider';
import { BackendMonitoringProvider } from './backendProvider';
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

/**
 * Monitoring API Service Layer
 * Delegates all data access to the active monitoring provider (default: BackendMonitoringProvider).
 * Seamlessly talks to monitoring-backend (http://localhost:5000) with graceful fallback to Mock.
 */
class MonitoringApiService {
  private provider: IMonitoringProvider;

  constructor(provider: IMonitoringProvider = new BackendMonitoringProvider()) {
    this.provider = provider;
  }

  // Switch provider dynamically at runtime if needed
  public setProvider(provider: IMonitoringProvider) {
    this.provider = provider;
  }

  public async getHealthStatus(): Promise<BackendHealthInfo> {
    return this.provider.getHealthStatus();
  }

  public async getMetricsSummary(): Promise<MetricsSummaryResponse> {
    return this.provider.getMetricsSummary();
  }

  public async getOverviewMetrics(filter: GlobalFilterState): Promise<OverviewMetrics> {
    return this.provider.getOverviewMetrics(filter);
  }

  public async getServers(filter: GlobalFilterState): Promise<Server[]> {
    return this.provider.getServers(filter);
  }

  public async getServerById(id: string): Promise<ServerDetail | null> {
    return this.provider.getServerById(id);
  }

  public async discoverServer(payload: DiscoverServerPayload): Promise<DiscoverServerResponse> {
    return this.provider.discoverServer(payload);
  }

  public async registerServer(payload: RegisterServerPayload): Promise<Server> {
    return this.provider.registerServer(payload);
  }

  public async updateServer(id: string, payload: UpdateServerPayload): Promise<Server> {
    return this.provider.updateServer(id, payload);
  }

  public async deleteServer(id: string): Promise<boolean> {
    return this.provider.deleteServer(id);
  }

  public async getServices(filter: GlobalFilterState): Promise<Service[]> {
    return this.provider.getServices(filter);
  }

  public async getServiceById(id: string): Promise<ServiceDetail | null> {
    return this.provider.getServiceById(id);
  }

  public async getServiceRequests(
    serviceId: string,
    filter?: GlobalFilterState,
    options?: { search?: string; method?: string; status?: string; page?: number; limit?: number }
  ): Promise<ServiceRequest[]> {
    return this.provider.getServiceRequests(serviceId, filter, options);
  }

  public async getServiceDailyRequests(
    serviceId: string,
    filter?: GlobalFilterState,
    granularity?: 'hourly' | 'daily' | '30d',
    days?: number
  ): Promise<RequestTimeSeriesPoint[]> {
    return this.provider.getServiceDailyRequests(serviceId, filter, granularity, days);
  }

  public async getRequestById(requestId: string): Promise<ServiceRequest | null> {
    return this.provider.getRequestById(requestId);
  }

  public async getServiceErrors(serviceId: string, filter: GlobalFilterState): Promise<ServiceError[]> {
    return this.provider.getServiceErrors(serviceId, filter);
  }

  public async getErrorById(errorId: string): Promise<ServiceError | null> {
    return this.provider.getErrorById(errorId);
  }

  public async getServiceLatency(serviceId: string, filter: GlobalFilterState): Promise<LatencyMetricSeries[]> {
    return this.provider.getServiceLatency(serviceId, filter);
  }

  public async getServiceCharts(serviceId: string, rangeSec?: number, points?: number): Promise<ServiceChartData> {
    return this.provider.getServiceCharts(serviceId, rangeSec, points);
  }

  public async getServiceEndpoints(serviceId: string): Promise<ServiceEndpoint[]> {
    return this.provider.getServiceEndpoints(serviceId);
  }

  public async getServiceLogs(serviceId: string, filter: GlobalFilterState): Promise<LogEntry[]> {
    return this.provider.getServiceLogs(serviceId, filter);
  }

  public async getServiceDependencies(serviceId: string): Promise<DependencyGraphData> {
    return this.provider.getServiceDependencies(serviceId);
  }

  public async getServiceAlerts(serviceId: string): Promise<Alert[]> {
    return this.provider.getServiceAlerts(serviceId);
  }

  public async acknowledgeAlert(alertId: string): Promise<boolean> {
    return this.provider.acknowledgeAlert(alertId);
  }

  public async silenceAlert(alertId: string, durationMinutes: number): Promise<boolean> {
    return this.provider.silenceAlert(alertId, durationMinutes);
  }
}

export const monitoringApi = new MonitoringApiService();
export { MockMonitoringProvider, BackendMonitoringProvider };
