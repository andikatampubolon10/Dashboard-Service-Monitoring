import { LogEntry, GlobalFilterState } from '../types';

/**
 * LokiLogProvider (Stub for Stage 2 Log Aggregator Integration)
 * Queries Grafana Loki REST API via LogQL (e.g. `{service="payment-service"} |= "error"`).
 */
export class LokiLogProvider {
  protected _baseUrl: string;

  constructor(baseUrl = 'http://localhost:3100') {
    this._baseUrl = baseUrl;
  }

  async queryLogs(_serviceId: string, _filter: GlobalFilterState, _searchQuery?: string): Promise<LogEntry[]> {
    // Example: fetch(`${this._baseUrl}/loki/api/v1/query_range?query={service="${_serviceId}"}`)
    throw new Error('LokiLogProvider is in stub mode. Please use MockMonitoringProvider.');
  }

  async streamLogs(_serviceId: string, _onMessage: (log: LogEntry) => void): Promise<() => void> {
    // WebSocket connection to Loki: new WebSocket(`${this._baseUrl.replace('http', 'ws')}/loki/api/v1/tail`)
    return () => {
      // Disconnect
    };
  }
}
