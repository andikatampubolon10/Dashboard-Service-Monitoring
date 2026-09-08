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
  ServiceEndpoint,
  ServiceChartData,
  PlacementRuleResult,
} from '../types';
import { INITIAL_SERVERS } from './servers';
import { INITIAL_SERVICES } from './services';
import { INITIAL_REQUESTS } from './requests';
import { INITIAL_ERRORS } from './errors';
import { INITIAL_LOGS } from './logs';
import { INITIAL_ALERTS } from './alerts';
import { INITIAL_TOPOLOGY } from './dependencies';
import { getTimeWindowMinutes } from '../utils/dateUtils';
import { validateServicePlacement } from '../utils/serverRules';

class MockDatabase {
  private servers: ServerDetail[] = [...INITIAL_SERVERS];
  private services: ServiceDetail[] = [...INITIAL_SERVICES];
  private requests: ServiceRequest[] = [...INITIAL_REQUESTS];
  private errors: ServiceError[] = [...INITIAL_ERRORS];
  private logs: LogEntry[] = [...INITIAL_LOGS];
  private alerts: Alert[] = [...INITIAL_ALERTS];
  private topology: DependencyGraphData = { ...INITIAL_TOPOLOGY };

  // Calculate high-level overview metrics consistently
  public getOverviewMetrics(filter: GlobalFilterState): OverviewMetrics {
    const minutes = getTimeWindowMinutes(filter.timeRange);
    const scaleFactor = minutes / 60; // 1h is baseline 1.0

    // Filter services if filtered by environment or server
    let filteredServices = this.services;
    if (filter.serverId && filter.serverId !== 'all') {
      filteredServices = filteredServices.filter((s) => s.serverId === filter.serverId);
    }
    if (filter.serviceId && filter.serviceId !== 'all') {
      filteredServices = filteredServices.filter((s) => s.id === filter.serviceId);
    }

    const baselineTotalErrors = filteredServices.reduce((sum, s) => sum + s.errorCount, 0);
    const scaledTotalErrors = Math.max(1, Math.round(baselineTotalErrors * Math.sqrt(scaleFactor)));

    const baselineTotalRequests = Math.round(1_248_500 * (filteredServices.length / 8));
    const scaledTotalRequests = Math.max(100, Math.round(baselineTotalRequests * scaleFactor));

    const avgRps = filteredServices.reduce((sum, s) => sum + s.throughputRps, 0);
    const avgErrorRate = (scaledTotalErrors / scaledTotalRequests) * 100;

    const healthyCount = filteredServices.filter((s) => s.status === 'healthy').length;
    const degradedCount = filteredServices.filter((s) => s.status === 'degraded').length;
    const criticalCount = filteredServices.filter((s) => s.status === 'critical').length;

    // Generate dynamic latency time-series according to the time range
    const pointsCount = 20;
    const latencyHistory: LatencyMetricSeries[] = Array.from({ length: pointsCount }, (_, i) => {
      const pointTime = new Date(Date.now() - (pointsCount - i) * (minutes / pointsCount) * 60 * 1000);
      const hourStr = pointTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      const jitter = Math.sin(i * 0.8) * 4;
      const spike = i > 12 && i < 17 ? 25 : 0; // Simulated latency anomaly during the window

      return {
        timestamp: hourStr,
        p50: Math.round(16 + jitter),
        p90: Math.round(26 + jitter * 1.2),
        p95: Math.round(40 + jitter * 1.5 + spike),
        p99: Math.round(100 + jitter * 2 + spike * 2.5),
        rps: Math.round(avgRps + Math.cos(i * 0.5) * 15),
      };
    });

    return {
      totalRequests: scaledTotalRequests,
      requestsDeltaPercent: 8.4,
      averageRps: avgRps,
      totalErrors: scaledTotalErrors,
      errorRatePercent: parseFloat(avgErrorRate.toFixed(2)),
      errorRateDeltaPercent: -12.3,
      latencyP50Ms: 18.2,
      latencyP90Ms: 28.5,
      latencyP95Ms: 42.8,
      latencyP99Ms: 112.4,
      activeAlertsCount: this.alerts.filter((a) => a.status === 'firing').length,
      activeIncidentsCount: 1,
      systemUptimePercent: 99.98,
      healthyServicesCount: healthyCount,
      degradedServicesCount: degradedCount,
      criticalServicesCount: criticalCount,
      totalServicesCount: filteredServices.length,
      serversCount: this.servers.length,
      latencyHistory,
    };
  }

  // Servers
  public getServers(filter: GlobalFilterState): Server[] {
    if (filter.serverId && filter.serverId !== 'all') {
      return this.servers.filter((s) => s.id === filter.serverId);
    }
    return this.servers;
  }

  public getServerById(id: string): ServerDetail | null {
    return this.servers.find((s) => s.id === id) || null;
  }

  public assignServiceToServer(
    serverId: string,
    serviceId: string
  ): { success: boolean; message: string; results?: PlacementRuleResult[] } {
    const server = this.getServerById(serverId);
    const service = this.getServiceById(serviceId);
    if (!server || !service) {
      return { success: false, message: 'Server atau Service tidak ditemukan.' };
    }

    const currentServices = this.services.filter((s) => server.hostedServices.includes(s.id));
    const validation = validateServicePlacement(server, service, currentServices);

    if (!validation.allowed) {
      return {
        success: false,
        message: validation.blockingReasons.join(' | '),
        results: validation.results,
      };
    }

    // Add to server's hostedServices
    if (!server.hostedServices.includes(serviceId)) {
      server.hostedServices.push(serviceId);
      service.serverId = serverId;
    }

    return {
      success: true,
      message: `Service ${service.name} berhasil dialokasikan ke ${server.name}.`,
      results: validation.results,
    };
  }

  public removeServiceFromServer(serverId: string, serviceId: string): boolean {
    const server = this.getServerById(serverId);
    if (server) {
      server.hostedServices = server.hostedServices.filter((id) => id !== serviceId);
      const svc = this.getServiceById(serviceId);
      if (svc && svc.serverId === serverId) {
        svc.serverId = '';
      }
      return true;
    }
    return false;
  }

  // Services
  public getServices(filter: GlobalFilterState): Service[] {
    let list = this.services;
    if (filter.serverId && filter.serverId !== 'all') {
      list = list.filter((s) => s.serverId === filter.serverId);
    }
    if (filter.serviceId && filter.serviceId !== 'all') {
      list = list.filter((s) => s.id === filter.serviceId);
    }
    return list;
  }

  public getServiceById(id: string): ServiceDetail | null {
    return this.services.find((s) => s.id === id) || null;
  }

  // Requests
  public getServiceRequests(serviceId: string): ServiceRequest[] {
    if (!serviceId || serviceId === 'all') {
      return this.requests;
    }
    return this.requests.filter((r) => r.serviceId === serviceId);
  }

  // Daily / Hourly Time-series Request Volume Breakdown
  public getServiceDailyRequests(
    serviceId: string,
    filter: GlobalFilterState,
    granularity?: 'hourly' | 'daily' | '30d'
  ): RequestTimeSeriesPoint[] {
    const service = serviceId && serviceId !== 'all' ? this.getServiceById(serviceId) : null;
    const baseRps = service ? service.throughputRps : 380; // aggregate RPS if all
    const baseErrorRate = service ? service.errorRatePercent : 0.45;
    const avgLatency = service ? service.latencyP50Ms : 18;

    const selectedGranularity = granularity || (filter.timeRange === '7d' ? 'daily' : 'hourly');

    if (selectedGranularity === 'daily' || filter.timeRange === '7d') {
      // 7-day daily breakdown
      const days = ['Mon, Sep 01', 'Tue, Sep 02', 'Wed, Sep 03', 'Thu, Sep 04', 'Fri, Sep 05', 'Sat, Sep 06', 'Sun, Sep 07'];
      return days.map((dayLabel, index) => {
        const dayIso = `2026-09-0${index + 1}`;
        // Daily variation (weekend dip on Sat/Sun)
        const dayFactor = index >= 5 ? 0.75 : 1.0 + Math.sin(index * 0.8) * 0.15;
        const dayRps = parseFloat((baseRps * dayFactor).toFixed(1));
        const totalRequests = Math.round(dayRps * 86400); // requests in 24 hours
        
        // Error rate variation
        const dayErrorRate = (baseErrorRate * (1 + Math.sin(index * 1.2) * 0.3)) / 100;
        const totalErrors = Math.round(totalRequests * dayErrorRate);
        const clientErrors = Math.round(totalErrors * 0.65);
        const serverErrors = Math.max(0, totalErrors - clientErrors);
        const successfulRequests = totalRequests - totalErrors;

        return {
          timestamp: dayLabel,
          date: dayIso,
          totalRequests,
          successfulRequests,
          clientErrors,
          serverErrors,
          rps: dayRps,
          avgDurationMs: parseFloat((avgLatency * (1 + (index % 2) * 0.1)).toFixed(1)),
        };
      });
    }

    if (selectedGranularity === '30d') {
      // 30-day daily breakdown
      return Array.from({ length: 30 }, (_, i) => {
        const d = new Date(Date.now() - (29 - i) * 86400 * 1000);
        const dayLabel = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
        const dayIso = d.toISOString().slice(0, 10);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const factor = (isWeekend ? 0.72 : 1.05) + Math.sin(i * 0.4) * 0.1;
        const dayRps = parseFloat((baseRps * factor).toFixed(1));
        const totalRequests = Math.round(dayRps * 86400);

        const dayErrorRate = (baseErrorRate * (1 + Math.sin(i * 0.7) * 0.25)) / 100;
        const totalErrors = Math.round(totalRequests * dayErrorRate);
        const clientErrors = Math.round(totalErrors * 0.68);
        const serverErrors = Math.max(0, totalErrors - clientErrors);
        const successfulRequests = totalRequests - totalErrors;

        return {
          timestamp: dayLabel,
          date: dayIso,
          totalRequests,
          successfulRequests,
          clientErrors,
          serverErrors,
          rps: dayRps,
          avgDurationMs: parseFloat((avgLatency * (1 + (i % 3) * 0.05)).toFixed(1)),
        };
      });
    }

    // Default hourly points: 24 hours of telemetry
    const pointsCount = 24;
    const minutes = 24 * 60; // 24 hours

    return Array.from({ length: pointsCount }, (_, i) => {
      const pointTime = new Date(Date.now() - (pointsCount - 1 - i) * (minutes / pointsCount) * 60 * 1000);
      const timeStr = pointTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      const dateStr = pointTime.toISOString().slice(0, 10);

      // Hourly wave curve (higher in mid-day, lower late night)
      const hourOfDay = pointTime.getHours();
      const wave = hourOfDay >= 8 && hourOfDay <= 20 
        ? 1.2 + Math.sin(((hourOfDay - 8) / 12) * Math.PI) * 0.4 
        : 0.45 + (hourOfDay / 24) * 0.2;
      
      const pointRps = parseFloat((baseRps * wave).toFixed(1));
      const intervalSeconds = 3600; // 1 hour interval
      const totalRequests = Math.round(pointRps * intervalSeconds);

      const errRate = (baseErrorRate * (1 + Math.cos(i * 0.6) * 0.35)) / 100;
      const totalErrors = Math.round(totalRequests * errRate);
      const clientErrors = Math.round(totalErrors * 0.7);
      const serverErrors = Math.max(0, totalErrors - clientErrors);
      const successfulRequests = Math.max(0, totalRequests - totalErrors);

      return {
        timestamp: timeStr,
        date: dateStr,
        totalRequests,
        successfulRequests,
        clientErrors,
        serverErrors,
        rps: pointRps,
        avgDurationMs: parseFloat((avgLatency * (1 + Math.sin(i * 0.5) * 0.15)).toFixed(1)),
      };
    });
  }

  public getRequestById(id: string): ServiceRequest | null {
    return this.requests.find((r) => r.id === id || r.traceId === id) || null;
  }

  // Errors
  public getServiceErrors(serviceId: string): ServiceError[] {
    if (!serviceId || serviceId === 'all') {
      return this.errors;
    }
    return this.errors.filter((e) => e.serviceId === serviceId);
  }

  public getErrorById(id: string): ServiceError | null {
    return this.errors.find((e) => e.id === id) || null;
  }

  // Logs
  public getServiceLogs(serviceId: string): LogEntry[] {
    if (!serviceId || serviceId === 'all') {
      return this.logs;
    }
    return this.logs.filter((l) => l.serviceId === serviceId);
  }

  // Latency Series for a specific service
  public getServiceLatency(serviceId: string, filter: GlobalFilterState): LatencyMetricSeries[] {
    const service = this.getServiceById(serviceId);
    const p50Base = service ? service.latencyP50Ms : 18;
    const p95Base = service ? service.latencyP95Ms : 42;
    const p99Base = service ? service.latencyP99Ms : 110;
    const rpsBase = service ? service.throughputRps : 40;

    const minutes = getTimeWindowMinutes(filter.timeRange);
    const pointsCount = 20;

    return Array.from({ length: pointsCount }, (_, i) => {
      const pointTime = new Date(Date.now() - (pointsCount - i) * (minutes / pointsCount) * 60 * 1000);
      const hourStr = pointTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      const jitter = Math.sin(i * 0.7) * (p50Base * 0.15);

      return {
        timestamp: hourStr,
        p50: parseFloat((p50Base + jitter).toFixed(1)),
        p90: parseFloat((p50Base * 1.5 + jitter * 1.2).toFixed(1)),
        p95: parseFloat((p95Base + jitter * 1.5).toFixed(1)),
        p99: parseFloat((p99Base + jitter * 2.0).toFixed(1)),
        rps: parseFloat((rpsBase + Math.cos(i * 0.6) * (rpsBase * 0.1)).toFixed(1)),
      };
    });
  }

  // Dependencies
  public getServiceDependencies(serviceId: string): DependencyGraphData {
    if (!serviceId || serviceId === 'all') {
      return this.topology;
    }
    // Filter nodes and edges related to this service
    const relatedEdges = this.topology.edges.filter(
      (e) => e.source === serviceId || e.target === serviceId
    );
    const nodeIds = new Set<string>();
    nodeIds.add(serviceId);
    relatedEdges.forEach((e) => {
      nodeIds.add(e.source);
      nodeIds.add(e.target);
    });

    const relatedNodes = this.topology.nodes.filter((n) => nodeIds.has(n.id));

    return {
      nodes: relatedNodes,
      edges: relatedEdges,
    };
  }

  // Alerts
  public getServiceAlerts(serviceId: string): Alert[] {
    if (!serviceId || serviceId === 'all') {
      return this.alerts;
    }
    return this.alerts.filter((a) => a.serviceId === serviceId);
  }

  public acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.status = 'acknowledged';
      return true;
    }
    return false;
  }

  public silenceAlert(alertId: string, durationMinutes: number): boolean {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.status = 'silenced';
      alert.resolvedAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
      return true;
    }
    return false;
  }

  // Endpoints & Accessed Routes
  public getServiceEndpoints(serviceId: string): ServiceEndpoint[] {
    const service = this.getServiceById(serviceId);
    const baseLatency = service ? service.latencyP50Ms : 25;
    return [
      { method: 'GET', path: `/api/v1/${serviceId}/health`, status: 200, count: 1240, avgLatencyMs: 4 },
      { method: 'GET', path: `/api/v1/${serviceId}/status`, status: 200, count: 850, avgLatencyMs: Math.round(baseLatency * 0.8) },
      { method: 'POST', path: `/api/v1/${serviceId}/action`, status: 200, count: 420, avgLatencyMs: baseLatency },
      { method: 'GET', path: `/api/v1/${serviceId}/details`, status: 200, count: 310, avgLatencyMs: Math.round(baseLatency * 1.2) },
      { method: 'PUT', path: `/api/v1/${serviceId}/update`, status: 200, count: 95, avgLatencyMs: Math.round(baseLatency * 1.5) },
      { method: 'POST', path: `/api/v1/${serviceId}/fail`, status: 500, count: 12, avgLatencyMs: Math.round(baseLatency * 2.1) },
    ];
  }

  // Preformatted Chart Data
  public getServiceCharts(serviceId: string, _rangeSec = 3600, points = 30): ServiceChartData {
    const service = this.getServiceById(serviceId);
    const p50Base = service ? service.latencyP50Ms : 20;
    const p90Base = service ? service.latencyP90Ms : 45;
    const p95Base = service ? service.latencyP95Ms : 65;
    const p99Base = service ? service.latencyP99Ms : 120;
    const rpsBase = service ? service.throughputRps : 35;
    const errRateBase = service ? service.errorRatePercent : 0.5;

    const labels: string[] = [];
    const p50: number[] = [];
    const p90: number[] = [];
    const p95: number[] = [];
    const p99: number[] = [];
    const avg: number[] = [];
    const reqPerSecond: number[] = [];
    const deltaRequests: number[] = [];
    const errorRatePercent: number[] = [];
    const errors5xx: number[] = [];
    const errors4xx: number[] = [];
    const timeline: LatencyMetricSeries[] = [];

    const now = Date.now();
    for (let i = 0; i < points; i++) {
      const pointDate = new Date(now - (points - 1 - i) * 60000);
      const timeLabel = pointDate.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const jitter = Math.sin(i * 0.5) * 4;

      const curP50 = Math.max(1, Math.round(p50Base + jitter));
      const curP90 = Math.max(curP50 + 2, Math.round(p90Base + jitter * 1.3));
      const curP95 = Math.max(curP90 + 2, Math.round(p95Base + jitter * 1.6));
      const curP99 = Math.max(curP95 + 4, Math.round(p99Base + jitter * 2));
      const curAvg = Math.round((curP50 + curP90) / 2);
      const curRps = Math.max(0.1, parseFloat((rpsBase + Math.cos(i * 0.4) * (rpsBase * 0.2)).toFixed(2)));
      const curDelta = Math.round(curRps * 60);
      const curErrRate = Math.max(0, parseFloat((errRateBase + Math.sin(i * 0.3) * 0.2).toFixed(2)));
      const cur5xx = curErrRate > 0.6 ? 1 : 0;
      const cur4xx = curErrRate > 0.3 ? 2 : 0;

      labels.push(timeLabel);
      p50.push(curP50);
      p90.push(curP90);
      p95.push(curP95);
      p99.push(curP99);
      avg.push(curAvg);
      reqPerSecond.push(curRps);
      deltaRequests.push(curDelta);
      errorRatePercent.push(curErrRate);
      errors5xx.push(cur5xx);
      errors4xx.push(cur4xx);

      timeline.push({
        timestamp: pointDate.toISOString(),
        time: timeLabel,
        p50: curP50,
        p90: curP90,
        p95: curP95,
        p99: curP99,
        avg: curAvg,
        rps: curRps,
        reqPerSecond: curRps,
        deltaRequests: curDelta,
        errorRatePercent: curErrRate,
        errors5xx: cur5xx,
        errors4xx: cur4xx,
      });
    }

    return {
      serviceId,
      range: '3600s',
      dataPoints: points,
      latencyPercentiles: { labels, p50, p90, p95, p99, avg },
      throughput: { labels, reqPerSecond, deltaRequests },
      errors: { labels, errorRatePercent, errors5xx, errors4xx },
      timeline,
    };
  }
}

export const mockDb = new MockDatabase();
