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

/**
 * PrometheusMonitoringProvider (Stub for Stage 2 Production Integration)
 * Can execute PromQL queries against Prometheus / Thanos / VictoriaMetrics API.
 */
export class PrometheusMonitoringProvider implements IMonitoringProvider {
  protected _baseUrl: string;

  constructor(baseUrl = 'http://localhost:9090') {
    this._baseUrl = baseUrl;
  }

  async getHealthStatus(): Promise<BackendHealthInfo> {
    throw new Error('PrometheusMonitoringProvider getHealthStatus pending.');
  }

  async getMetricsSummary(): Promise<MetricsSummaryResponse> {
    throw new Error('PrometheusMonitoringProvider getMetricsSummary pending.');
  }

  async getOverviewMetrics(_filter: GlobalFilterState): Promise<OverviewMetrics> {
    // Example: fetch(`${this.baseUrl}/api/v1/query?query=sum(rate(http_requests_total[5m]))`)
    throw new Error('PrometheusMonitoringProvider is in stub mode. Please use MockMonitoringProvider.');
  }

  async getServers(_filter: GlobalFilterState): Promise<Server[]> {
    throw new Error('PrometheusMonitoringProvider node_exporter metrics integration pending.');
  }

  async getServerById(_id: string): Promise<ServerDetail | null> {
    throw new Error('PrometheusMonitoringProvider getServerById pending.');
  }

  async getServices(_filter: GlobalFilterState): Promise<Service[]> {
    throw new Error('PrometheusMonitoringProvider getServices pending.');
  }

  async getServiceById(_id: string): Promise<ServiceDetail | null> {
    throw new Error('PrometheusMonitoringProvider getServiceById pending.');
  }

  async getServiceRequests(_serviceId: string, _filter: GlobalFilterState): Promise<ServiceRequest[]> {
    throw new Error('Prometheus does not store raw trace events. Tracing is delegated to Jaeger / Tempo.');
  }

  async getServiceDailyRequests(_serviceId: string, _filter: GlobalFilterState): Promise<RequestTimeSeriesPoint[]> {
    throw new Error('Prometheus rate(http_requests_total) query pending.');
  }

  async getRequestById(_requestId: string): Promise<ServiceRequest | null> {
    throw new Error('Tracing is delegated to Jaeger / Tempo.');
  }

  async getServiceErrors(_serviceId: string, _filter: GlobalFilterState): Promise<ServiceError[]> {
    throw new Error('Error metrics query via PromQL rate(http_requests_total{status=~"5.."}[5m]) pending.');
  }

  async getErrorById(_errorId: string): Promise<ServiceError | null> {
    throw new Error('Prometheus getErrorById pending.');
  }

  async getServiceLatency(_serviceId: string, _filter: GlobalFilterState): Promise<LatencyMetricSeries[]> {
    throw new Error('PromQL histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) pending.');
  }

  async getServiceLogs(_serviceId: string, _filter: GlobalFilterState): Promise<LogEntry[]> {
    throw new Error('Logs are handled by LokiLogProvider.');
  }

  async getServiceDependencies(_serviceId: string): Promise<DependencyGraphData> {
    throw new Error('Prometheus getServiceDependencies pending.');
  }

  async getServiceAlerts(_serviceId: string): Promise<Alert[]> {
    throw new Error('Alertmanager API fetch(/api/v2/alerts) pending.');
  }

  async acknowledgeAlert(_alertId: string): Promise<boolean> {
    throw new Error('Alertmanager acknowledge pending.');
  }

  async silenceAlert(_alertId: string, _durationMinutes: number): Promise<boolean> {
    throw new Error('Alertmanager silence pending.');
  }
}
