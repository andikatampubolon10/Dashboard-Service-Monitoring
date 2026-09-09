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
} from '../types';

/**
 * Standard contract for all monitoring data providers.
 * Implementations can be Mock, Prometheus, Loki, OpenTelemetry, etc.
 */
export interface IMonitoringProvider {
  getHealthStatus(): Promise<BackendHealthInfo>;
  getMetricsSummary(): Promise<MetricsSummaryResponse>;
  getOverviewMetrics(filter: GlobalFilterState): Promise<OverviewMetrics>;
  getServers(filter: GlobalFilterState): Promise<Server[]>;
  getServerById(id: string): Promise<ServerDetail | null>;
  discoverServer(payload: DiscoverServerPayload): Promise<DiscoverServerResponse>;
  registerServer(payload: RegisterServerPayload): Promise<Server>;
  getServices(filter: GlobalFilterState): Promise<Service[]>;
  getServiceById(id: string): Promise<ServiceDetail | null>;
  getServiceRequests(
    serviceId: string,
    filter?: GlobalFilterState,
    options?: { search?: string; method?: string; status?: string; page?: number; limit?: number }
  ): Promise<ServiceRequest[]>;
  getServiceDailyRequests(
    serviceId: string,
    filter?: GlobalFilterState,
    granularity?: 'hourly' | 'daily' | '30d',
    days?: number
  ): Promise<RequestTimeSeriesPoint[]>;
  getRequestById(requestId: string): Promise<ServiceRequest | null>;
  getServiceErrors(serviceId: string, filter: GlobalFilterState): Promise<ServiceError[]>;
  getErrorById(errorId: string): Promise<ServiceError | null>;
  getServiceLatency(serviceId: string, filter: GlobalFilterState): Promise<LatencyMetricSeries[]>;
  getServiceCharts(serviceId: string, rangeSec?: number, points?: number): Promise<ServiceChartData>;
  getServiceEndpoints(serviceId: string): Promise<ServiceEndpoint[]>;
  getServiceLogs(serviceId: string, filter: GlobalFilterState): Promise<LogEntry[]>;
  getServiceDependencies(serviceId: string): Promise<DependencyGraphData>;
  getServiceAlerts(serviceId: string): Promise<Alert[]>;
  acknowledgeAlert(alertId: string): Promise<boolean>;
  silenceAlert(alertId: string, durationMinutes: number): Promise<boolean>;
}

