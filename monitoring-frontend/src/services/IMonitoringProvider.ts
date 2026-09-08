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
  getServices(filter: GlobalFilterState): Promise<Service[]>;
  getServiceById(id: string): Promise<ServiceDetail | null>;
  getServiceRequests(serviceId: string, filter: GlobalFilterState): Promise<ServiceRequest[]>;
  getServiceDailyRequests(
    serviceId: string,
    filter: GlobalFilterState,
    granularity?: 'hourly' | 'daily' | '30d'
  ): Promise<RequestTimeSeriesPoint[]>;
  getRequestById(requestId: string): Promise<ServiceRequest | null>;
  getServiceErrors(serviceId: string, filter: GlobalFilterState): Promise<ServiceError[]>;
  getErrorById(errorId: string): Promise<ServiceError | null>;
  getServiceLatency(serviceId: string, filter: GlobalFilterState): Promise<LatencyMetricSeries[]>;
  getServiceLogs(serviceId: string, filter: GlobalFilterState): Promise<LogEntry[]>;
  getServiceDependencies(serviceId: string): Promise<DependencyGraphData>;
  getServiceAlerts(serviceId: string): Promise<Alert[]>;
  acknowledgeAlert(alertId: string): Promise<boolean>;
  silenceAlert(alertId: string, durationMinutes: number): Promise<boolean>;
}

