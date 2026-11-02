
'use strict';

/**
 * services/alertManager.service.js
 *
 * Central Alert & State Management Engine.
 * Features:
 *  - Anti-Flapping (requires 3 consecutive failures before firing DOWN)
 *  - Anti-Spam Throttling (30-minute cooldown on active incidents)
 *  - Multi-Project Routing (maps server/service to parent Project & dispatches to matching Slack webhooks)
 *  - Auto-Recovery Notifications with Downtime calculation
 *  - Persisted Alert History Logging (alert_history table)
 */

const { getAllProjects } = require('../config/projects.config');
const { sendSlackAlert, formatDuration, formatLocalTime } = require('./slackWebhook.service');
const { query } = require('../database/db');

async function recordAlertHistory(data) {
  try {
    await query(
      `INSERT INTO alert_history (
        project_id, project_name, alert_id, target_type, target_name, target_host,
        severity, event_type, error_message, duration_sec, channel_label, status, dispatch_error
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        data.projectId || null,
        data.projectName || 'System',
        data.alertId || null,
        data.targetType || 'SERVER',
        data.targetName || 'Node',
        data.targetHost || '',
        data.severity || 'CRITICAL',
        data.eventType || 'DOWN',
        data.errorMessage || '',
        data.durationSec || 0,
        data.channelLabel || '#alerts',
        data.status || 'SENT',
        data.dispatchError || null,
      ]
    );
  } catch (err) {
    // Non-blocking log persistence
  }
}

// State trackers in-memory
// targetKey -> { failCount: number, status: 'UP'|'DOWN', isAlertActive: boolean, downSince: number|null, lastAlertSentAt: number|null }
const targetStates = new Map();

// Configuration constants
const CONSECUTIVE_FAILURES_THRESHOLD = 3;
const COOLDOWN_MINUTES = 30;
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;

/**
 * Ensure a state entry exists for a target key
 * @param {string} targetKey
 * @returns {object}
 */
function getOrCreateState(targetKey) {
  if (!targetStates.has(targetKey)) {
    targetStates.set(targetKey, {
      failCount: 0,
      status: 'UP',
      isAlertActive: false,
      downSince: null,
      lastAlertSentAt: null,
    });
  }
  return targetStates.get(targetKey);
}

/**
 * Find all parent projects for a server or service.
 * Supports servers assigned to multiple projects or matching by serverId/serviceId/host.
 * @param {object} params
 * @param {string} [params.serverId]
 * @param {string} [params.serviceId]
 * @param {string} [params.host]
 * @param {string} [params.projectId]
 * @returns {Array<object>} Projects
 */
function findParentProjects({ serverId, serviceId, host, projectId }) {
  const projects = getAllProjects();
  if (!projects || projects.length === 0) return [];

  const matched = new Set();

  // 1. Match directly by server's assigned projectId
  if (projectId) {
    const p = projects.find((x) => x.id === projectId);
    if (p) matched.add(p);
  }

  // 2. Scan projects for serverId, serviceId, or host
  for (const p of projects) {
    const sids = Array.isArray(p.serverIds) ? p.serverIds : [];

    if (serverId && sids.includes(serverId)) {
      matched.add(p);
      continue;
    }

    if (serviceId && sids.some((sid) => serviceId.includes(sid) || sid.includes(serviceId))) {
      matched.add(p);
      continue;
    }

    if (host && sids.some((sid) => sid.includes(host))) {
      matched.add(p);
      continue;
    }
  }

  // 3. Fallback: If no match found, find any project that has alert rules configured
  if (matched.size === 0) {
    const withAlerts = projects.filter((p) => Array.isArray(p.alerts) && p.alerts.length > 0);
    if (withAlerts.length > 0) {
      return withAlerts;
    }
    if (projects.length === 1) {
      matched.add(projects[0]);
    }
  }

  return Array.from(matched);
}

// Backward-compatible single project getter (prioritizes projects with active alerts)
function findParentProject(params) {
  const list = findParentProjects(params);
  if (list.length === 0) return null;
  const withAlerts = list.find((p) => Array.isArray(p.alerts) && p.alerts.length > 0);
  return withAlerts || list[0];
}

/**
 * Dispatch an incident to all matching alert rules in the project
 * @param {object} project
 * @param {object} incidentCtx
 * @param {string} triggerKey - 'serverDown' | 'serviceDown' | 'highErrorRate' | 'highLatency' | 'highResourceUsage' | 'onRecovery'
 */
async function dispatchProjectAlerts(project, incidentCtx, triggerKey) {
  if (!project) return;

  const alerts = Array.isArray(project.alerts) ? project.alerts : [];
  if (alerts.length === 0) return;

  for (const alertRule of alerts) {
    // Check if alert rule is enabled
    if (alertRule.isEnabled === false) continue;

    // Check if this alert rule listens for this trigger
    const triggers = alertRule.triggers || {};
    if (triggerKey && triggers[triggerKey] !== true) {
      continue;
    }

    if (!alertRule.webhookUrl) continue;

    // Send asynchronously and record audit history log
    sendSlackAlert(alertRule.webhookUrl, incidentCtx, alertRule)
      .then((res) => {
        recordAlertHistory({
          projectId: project.id,
          projectName: project.name,
          alertId: alertRule.id,
          targetType: incidentCtx.targetType,
          targetName: incidentCtx.targetName,
          targetHost: incidentCtx.targetHost,
          severity: incidentCtx.severity,
          eventType: triggerKey === 'onRecovery' ? 'RECOVERY' : 'DOWN',
          errorMessage: incidentCtx.errorMessage,
          durationSec: incidentCtx.durationSec || 0,
          channelLabel: alertRule.channelLabel || '#alerts',
          status: res?.success ? 'SENT' : 'FAILED',
          dispatchError: res?.error || null,
        });
      })
      .catch((err) => {
        console.warn(`[AlertManager] Error dispatching to ${alertRule.webhookUrl}:`, err.message);
        recordAlertHistory({
          projectId: project.id,
          projectName: project.name,
          alertId: alertRule.id,
          targetType: incidentCtx.targetType,
          targetName: incidentCtx.targetName,
          targetHost: incidentCtx.targetHost,
          severity: incidentCtx.severity,
          eventType: triggerKey === 'onRecovery' ? 'RECOVERY' : 'DOWN',
          errorMessage: incidentCtx.errorMessage,
          durationSec: incidentCtx.durationSec || 0,
          channelLabel: alertRule.channelLabel || '#alerts',
          status: 'FAILED',
          dispatchError: err.message,
        });
      });
  }
}

/**
 * Record TCP probe result for a Server
 * @param {object} server
 * @param {boolean} isUp
 * @param {string} [probeMessage]
 */
async function recordServerProbeResult(server, isUp, probeMessage = '') {
  if (!server || !server.id) return;

  const targetKey = `server:${server.id}`;
  const state = getOrCreateState(targetKey);
  const now = Date.now();

  const projects = findParentProjects({ serverId: server.id, host: server.host, projectId: server.projectId });
  if (projects.length === 0) return;

  if (!isUp) {
    // Probe failed
    state.failCount += 1;

    // Trigger alert only when consecutive failure threshold is reached
    if (state.failCount >= CONSECUTIVE_FAILURES_THRESHOLD) {
      state.status = 'DOWN';

      if (!state.downSince) {
        state.downSince = now;
      }

      // Check anti-spam cooldown: send if first time OR cooldown expired
      const shouldSend = !state.isAlertActive || !state.lastAlertSentAt || now - state.lastAlertSentAt >= COOLDOWN_MS;

      if (shouldSend) {
        state.isAlertActive = true;
        state.lastAlertSentAt = now;

        for (const project of projects) {
          const incidentCtx = {
            projectName: project.name,
            environment: project.env || server.env || 'PRODUCTION',
            targetType: 'SERVER',
            targetId: server.id,
            targetName: server.displayName || server.name || server.id,
            targetHost: `${server.host || 'unknown'}:${server.port || 22}`,
            severity: 'CRITICAL',
            errorMessage: probeMessage || 'TCP Connection Refused or Timed Out (Port unreachable)',
            timestamp: new Date().toISOString(),
            time: formatLocalTime(now),
          };

          console.log(`[AlertManager] 🚨 Triggering SERVER_DOWN alert for ${server.id} (Project: ${project.name})`);
          dispatchProjectAlerts(project, incidentCtx, 'serverDown');
        }
      }
    }
  } else {
    // Probe succeeded
    const wasDown = state.isAlertActive && state.status === 'DOWN';

    if (wasDown) {
      // Calculate downtime
      const downtimeSec = state.downSince ? Math.max(1, (now - state.downSince) / 1000) : 0;
      const durationText = formatDuration(downtimeSec);

      console.log(`[AlertManager] 🟢 Server ${server.id} RECOVERED after ${durationText}`);

      for (const project of projects) {
        const recoveryCtx = {
          projectName: project.name,
          environment: project.env || server.env || 'PRODUCTION',
          targetType: 'SERVER',
          targetId: server.id,
          targetName: server.displayName || server.name || server.id,
          targetHost: `${server.host || 'unknown'}:${server.port || 22}`,
          severity: 'RESOLVED',
          errorMessage: 'Semua koneksi TCP dan health check telah normal kembali.',
          timestamp: new Date().toISOString(),
          time: formatLocalTime(now),
          durationSec: downtimeSec,
          durationText,
        };

        dispatchProjectAlerts(project, recoveryCtx, 'onRecovery');
      }
    }

    // Reset failure counter and active state
    state.failCount = 0;
    state.status = 'UP';
    state.isAlertActive = false;
    state.downSince = null;
    state.lastAlertSentAt = null;
  }
}

/**
 * Record Prometheus / HTTP scrape result for a Microservice
 * @param {object} service
 * @param {object} scrapeResult
 */
async function recordServiceResult(service, scrapeResult) {
  if (!service || !service.id || !scrapeResult) return;

  const targetKey = `service:${service.id}`;
  const state = getOrCreateState(targetKey);
  const now = Date.now();

  const isUp = scrapeResult.status === 'UP';
  const projects = findParentProjects({ serviceId: service.id, serverId: service.serverId, host: service.host });
  if (projects.length === 0) return;

  if (!isUp) {
    state.failCount += 1;

    if (state.failCount >= CONSECUTIVE_FAILURES_THRESHOLD) {
      state.status = 'DOWN';
      if (!state.downSince) state.downSince = now;

      const shouldSend = !state.isAlertActive || !state.lastAlertSentAt || now - state.lastAlertSentAt >= COOLDOWN_MS;

      if (shouldSend) {
        state.isAlertActive = true;
        state.lastAlertSentAt = now;

        for (const project of projects) {
          const incidentCtx = {
            projectName: project.name,
            environment: project.env || 'PRODUCTION',
            targetType: 'SERVICE',
            targetId: service.id,
            targetName: service.name || service.id,
            targetHost: service.url || service.metricsUrl || 'http://localhost',
            severity: 'CRITICAL',
            errorMessage: scrapeResult.error || 'HTTP Scrape Connection Refused (Status DOWN)',
            timestamp: new Date().toISOString(),
            time: formatLocalTime(now),
          };

          console.log(`[AlertManager] 🚨 Triggering SERVICE_DOWN alert for ${service.id} (Project: ${project.name})`);
          dispatchProjectAlerts(project, incidentCtx, 'serviceDown');
        }
      }
    }
  } else {
    // Service is UP
    const wasDown = state.isAlertActive && state.status === 'DOWN';

    if (wasDown) {
      const downtimeSec = state.downSince ? Math.max(1, (now - state.downSince) / 1000) : 0;
      const durationText = formatDuration(downtimeSec);

      console.log(`[AlertManager] 🟢 Service ${service.id} RECOVERED after ${durationText}`);

      for (const project of projects) {
        const recoveryCtx = {
          projectName: project.name,
          environment: project.env || 'PRODUCTION',
          targetType: 'SERVICE',
          targetId: service.id,
          targetName: service.name || service.id,
          targetHost: service.url || service.metricsUrl || 'http://localhost',
          severity: 'RESOLVED',
          errorMessage: 'Microservice telah kembali merespons request dengan normal.',
          timestamp: new Date().toISOString(),
          time: formatLocalTime(now),
          durationSec: downtimeSec,
          durationText,
        };

        dispatchProjectAlerts(project, recoveryCtx, 'onRecovery');
      }
    }

    state.failCount = 0;
    state.status = 'UP';
    state.isAlertActive = false;
    state.downSince = null;
    state.lastAlertSentAt = null;

    // Check Anomaly thresholds (Error rate & Latency)
    const metrics = scrapeResult.metrics;
    if (metrics) {
      // 1. High Error Rate (> 5%)
      const errorRate = metrics.errorRate?.percent || 0;
      if (errorRate > 5) {
        const warnKey = `service:errorRate:${service.id}`;
        const warnState = getOrCreateState(warnKey);
        if (!warnState.lastAlertSentAt || now - warnState.lastAlertSentAt >= COOLDOWN_MS) {
          warnState.lastAlertSentAt = now;
          for (const project of projects) {
            const warnCtx = {
              projectName: project.name,
              environment: project.env || 'PRODUCTION',
              targetType: 'SERVICE',
              targetName: service.name,
              targetHost: service.url,
              severity: 'WARNING',
              errorMessage: `Error rate 5xx melonjak mencapai ${errorRate.toFixed(1)}% (Ambang batas normal: 5.0%)`,
              timestamp: new Date().toISOString(),
              time: formatLocalTime(now),
            };
            dispatchProjectAlerts(project, warnCtx, 'highErrorRate');
          }
        }
      }

      // 2. High Latency P99 (> 1000ms)
      const p99 = metrics.latency?.p99Ms || 0;
      if (p99 > 1000) {
        const latKey = `service:latency:${service.id}`;
        const latState = getOrCreateState(latKey);
        if (!latState.lastAlertSentAt || now - latState.lastAlertSentAt >= COOLDOWN_MS) {
          latState.lastAlertSentAt = now;
          for (const project of projects) {
            const warnCtx = {
              projectName: project.name,
              environment: project.env || 'PRODUCTION',
              targetType: 'SERVICE',
              targetName: service.name,
              targetHost: service.url,
              severity: 'WARNING',
              errorMessage: `Latensi respons P99 mencapai ${Math.round(p99)}ms (Ambang batas normal: 1,000ms)`,
              timestamp: new Date().toISOString(),
              time: formatLocalTime(now),
            };
            dispatchProjectAlerts(project, warnCtx, 'highLatency');
          }
        }
      }
    }
  }
}

/**
 * Get internal state for diagnostics
 */
function getAllTargetStates() {
  const result = {};
  for (const [k, v] of targetStates.entries()) {
    result[k] = { ...v };
  }
  return result;
}

module.exports = {
  recordServerProbeResult,
  recordServiceResult,
  dispatchProjectAlerts,
  getAllTargetStates,
};

