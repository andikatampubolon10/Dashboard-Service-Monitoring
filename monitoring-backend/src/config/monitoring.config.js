'use strict';

require('dotenv').config();

/** @type {MonitoringConfig} */
const config = {
  pollIntervalSeconds: parseInt(process.env.POLL_INTERVAL_SECONDS || '5', 10),
  metricsRetentionMinutes: parseInt(process.env.METRICS_RETENTION_MINUTES || '60', 10),
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Alerting thresholds
  alerts: {
    cpuPercent: parseFloat(process.env.ALERT_CPU_PERCENT || '80'),
    memoryPercent: parseFloat(process.env.ALERT_MEMORY_PERCENT || '85'),
    errorRatePercent: parseFloat(process.env.ALERT_ERROR_RATE_PERCENT || '5'),
    latencyP99Ms: parseFloat(process.env.ALERT_LATENCY_P99_MS || '1000'),
  },
};

// Max data points per service = retention / interval
config.maxDataPoints = Math.ceil(
  (config.metricsRetentionMinutes * 60) / config.pollIntervalSeconds,
);

module.exports = config;

/**
 * @typedef {Object} MonitoringConfig
 * @property {number} pollIntervalSeconds
 * @property {number} metricsRetentionMinutes
 * @property {number} maxDataPoints
 * @property {number} port
 * @property {string} nodeEnv
 * @property {AlertThresholds} alerts
 */

/**
 * @typedef {Object} AlertThresholds
 * @property {number} cpuPercent
 * @property {number} memoryPercent
 * @property {number} errorRatePercent
 * @property {number} latencyP99Ms
 */
