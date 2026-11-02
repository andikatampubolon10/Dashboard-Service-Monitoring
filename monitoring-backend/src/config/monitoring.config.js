'use strict';

require('dotenv').config();

/** @type {MonitoringConfig} */
const config = {
  pollIntervalSeconds: parseInt(process.env.POLL_INTERVAL_SECONDS || '5', 10),
  metricsRetentionMinutes: parseInt(process.env.METRICS_RETENTION_MINUTES || '60', 10),
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Service Metrics Feature Flags (Can be toggled at runtime)
  enableServiceMetrics: process.env.ENABLE_SERVICE_METRICS !== undefined
    ? process.env.ENABLE_SERVICE_METRICS === 'true'
    : false, // Default OFF if configured as false

  persistServiceMetricsToDb: process.env.PERSIST_SERVICE_METRICS_TO_DB !== undefined
    ? process.env.PERSIST_SERVICE_METRICS_TO_DB === 'true'
    : false,

  // Alerting thresholds
  alerts: {
    cpuPercent: parseFloat(process.env.ALERT_CPU_PERCENT || '80'),
    memoryPercent: parseFloat(process.env.ALERT_MEMORY_PERCENT || '85'),
    errorRatePercent: parseFloat(process.env.ALERT_ERROR_RATE_PERCENT || '5'),
    latencyP99Ms: parseFloat(process.env.ALERT_LATENCY_P99_MS || '1000'),
  },

  // Helper functions for runtime toggling
  isServiceMetricsEnabled() {
    return this.enableServiceMetrics;
  },
  setServiceMetricsEnabled(enabled) {
    this.enableServiceMetrics = Boolean(enabled);
    return this.enableServiceMetrics;
  },
  isPersistServiceMetricsEnabled() {
    return this.persistServiceMetricsToDb;
  },
  setPersistServiceMetricsEnabled(enabled) {
    this.persistServiceMetricsToDb = Boolean(enabled);
    return this.persistServiceMetricsToDb;
  },
};

// Max data points per service = retention / interval
config.maxDataPoints = Math.ceil(
  (config.metricsRetentionMinutes * 60) / config.pollIntervalSeconds,
);

module.exports = config;
