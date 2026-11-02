'use strict';

/**
 * routes/projects.route.js
 *
 * REST API routes for Project management and dynamic Slack Alerts.
 * Hierarchy: Project -> Server -> Service
 *
 * GET    /api/projects                         — List all projects with aggregated health & metrics
 * POST   /api/projects/test-webhook            — Send a test ping to a Slack webhook URL
 * GET    /api/projects/:id                     — Get detailed project view with full server objects
 * POST   /api/projects                         — Create a new project (with optional alerts)
 * PUT    /api/projects/:id                     — Update project details, servers, and alerts
 * DELETE /api/projects/:id                     — Delete a project
 * POST   /api/projects/:id/servers             — Add a server to project
 * DELETE /api/projects/:id/servers/:sid        — Remove a server from project
 * GET    /api/projects/:id/alerts              — Get list of alert rules for project
 * POST   /api/projects/:id/alerts              — Add a new alert rule to project
 * PUT    /api/projects/:id/alerts/:alertId     — Update an alert rule in project
 * DELETE /api/projects/:id/alerts/:alertId     — Delete an alert rule from project
 * PATCH  /api/projects/:id/alerts/:alertId/toggle — Toggle enable/disable alert rule
 */

const { Router } = require('express');
const {
  getAllProjects,
  getAllProjectsAsync,
  getProjectById,
  getProjectByIdAsync,
  createProject,
  updateProject,
  deleteProject,
  addServerToProject,
  removeServerFromProject,
  getProjectAlerts,
  addProjectAlert,
  updateProjectAlert,
  deleteProjectAlert,
  toggleProjectAlert,
} = require('../config/projects.config');
const { getAllServers, getServerById } = require('../config/servers.config');
const serversRouter = require('./servers.route');
const projectAiInsightService = require('../services/projectAiInsight.service');
const { testSlackWebhook } = require('../services/slackWebhook.service');

const router = Router();

/**
 * Enrich a project with server and service health metrics.
 * @param {object} project
 * @param {boolean} fullDetails - If true, run full buildServerResponse for each server
 */
async function enrichProject(project, fullDetails = false) {
  const allServers = getAllServers();
  const assignedServerIds = project.serverIds || [];

  // Match servers
  const matchingServers = allServers.filter((s) => assignedServerIds.includes(s.id));

  let builtServers = [];
  if (fullDetails && typeof serversRouter.buildServerResponse === 'function') {
    builtServers = await Promise.all(matchingServers.map((s) => serversRouter.buildServerResponse(s, false)));
  } else {
    builtServers = matchingServers.map((s) => ({
      id: s.id,
      name: s.name,
      displayName: s.displayName || s.name,
      host: s.host,
      port: s.port,
      status: s.status || 'Healthy',
      services: [],
      databases: [],
      system: s.system || null,
    }));
  }

  // Aggregate metrics
  const serverCount = builtServers.length;
  let totalServices = 0;
  let upServices = 0;
  let downServices = 0;
  let totalCpu = 0;
  let totalMemMb = 0;
  let usedMemMb = 0;
  let totalDiskGb = 0;
  let usedDiskGb = 0;

  for (const s of builtServers) {
    const svcs = Array.isArray(s.services) ? s.services : [];
    totalServices += svcs.length;
    upServices += svcs.filter((svc) => svc.status === 'UP').length;
    downServices += svcs.filter((svc) => svc.status === 'DOWN').length;

    const sys = s.system;
    if (sys) {
      if (sys.cpu?.usagePercent) totalCpu += sys.cpu.usagePercent;
      if (sys.memory?.totalMb) totalMemMb += sys.memory.totalMb;
      if (sys.memory?.usedMb) usedMemMb += sys.memory.usedMb;
      if (sys.disk?.totalGb) totalDiskGb += sys.disk.totalGb;
      if (sys.disk?.usedGb) usedDiskGb += sys.disk.usedGb;
    }
  }

  const avgCpuPercent = serverCount > 0 ? parseFloat((totalCpu / serverCount).toFixed(1)) : 0;
  const memUsedPercent = totalMemMb > 0 ? parseFloat(((usedMemMb / totalMemMb) * 100).toFixed(1)) : 0;
  const diskUsedPercent = totalDiskGb > 0 ? parseFloat(((usedDiskGb / totalDiskGb) * 100).toFixed(1)) : 0;

  let healthStatus = 'HEALTHY';
  if (totalServices === 0) {
    healthStatus = serverCount > 0 ? 'HEALTHY' : 'HEALTHY';
  } else if (upServices === totalServices) {
    healthStatus = 'HEALTHY';
  } else if (upServices > 0) {
    healthStatus = 'DEGRADED';
  } else {
    healthStatus = 'CRITICAL';
  }

  return {
    ...project,
    alerts: Array.isArray(project.alerts) ? project.alerts : [],
    serversCount: serverCount,
    servicesCount: totalServices,
    upServicesCount: upServices,
    downServicesCount: downServices,
    status: healthStatus,
    aggregateMetrics: {
      avgCpuPercent,
      totalMemoryMb: totalMemMb,
      usedMemoryMb: usedMemMb,
      memoryUsedPercent: memUsedPercent,
      totalDiskGb: parseFloat(totalDiskGb.toFixed(1)),
      usedDiskGb: parseFloat(usedDiskGb.toFixed(1)),
      diskUsedPercent,
    },
    servers: builtServers,
  };
}

// ─── GET /api/projects ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const rawProjects = await getAllProjectsAsync();
    const enriched = await Promise.all(rawProjects.map((p) => enrichProject(p, false)));

    res.json({
      success: true,
      total: enriched.length,
      projects: enriched,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/projects/test-webhook (Test Slack Incoming Webhook) ───────────
router.post('/test-webhook', async (req, res) => {
  try {
    const { webhookUrl, channelLabel } = req.body || {};
    if (!webhookUrl || !webhookUrl.trim()) {
      return res.status(400).json({
        success: false,
        error: 'URL Webhook Slack wajib diisi untuk melakukan pengujian.',
      });
    }

    const result = await testSlackWebhook(webhookUrl.trim(), channelLabel || '#alerts');
    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      error: `Uji coba webhook gagal: ${err.message}`,
    });
  }
});

// ─── GET /api/projects/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const project = await getProjectByIdAsync(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Projek tidak ditemukan.' });
    }

    const detailed = await enrichProject(project, true);
    res.json({
      success: true,
      project: detailed,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/projects/:id/ai-insight ───────────────────────────────────────
router.post('/:id/ai-insight', async (req, res) => {
  try {
    const project = await getProjectByIdAsync(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Projek tidak ditemukan.' });
    }

    const { forceRefresh = false } = req.body || {};
    const detailed = await enrichProject(project, true);

    const insight = await projectAiInsightService.generateProjectInfrastructureInsight(
      detailed,
      Boolean(forceRefresh),
    );

    res.json({
      success: true,
      insight,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: `Gagal menghasilkan insight: ${err.message}`,
    });
  }
});

// ─── POST /api/projects ──────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, description = '', env = 'PRODUCTION', serverIds = [], alerts = [] } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nama projek wajib diisi.' });
    }

    const created = await createProject({ name, description, env, serverIds, alerts });
    const enriched = await enrichProject(created, true);

    res.status(201).json({
      success: true,
      message: `Projek "${created.name}" berhasil dibuat.`,
      project: enriched,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PUT /api/projects/:id ───────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { name, description, env, serverIds, alerts } = req.body;
    const updated = await updateProject(req.params.id, { name, description, env, serverIds, alerts });

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Projek tidak ditemukan untuk diperbarui.' });
    }

    const enriched = await enrichProject(updated, true);
    res.json({
      success: true,
      message: `Projek "${updated.name}" berhasil diperbarui.`,
      project: enriched,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/projects/:id ────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteProject(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Projek tidak ditemukan untuk dihapus.' });
    }

    res.json({
      success: true,
      message: 'Projek berhasil dihapus. Server fisik tetap aman.',
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/projects/:id/servers ──────────────────────────────────────────
router.post('/:id/servers', async (req, res) => {
  try {
    const { serverId } = req.body;
    if (!serverId) {
      return res.status(400).json({ success: false, error: 'serverId wajib dikirim.' });
    }

    const updated = await addServerToProject(req.params.id, serverId);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Projek tidak ditemukan.' });
    }

    const enriched = await enrichProject(updated, true);
    res.json({
      success: true,
      message: 'Server berhasil ditambahkan ke projek.',
      project: enriched,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/projects/:id/servers/:serverId ──────────────────────────────
router.delete('/:id/servers/:serverId', async (req, res) => {
  try {
    const updated = await removeServerFromProject(req.params.id, req.params.serverId);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Projek tidak ditemukan.' });
    }

    const enriched = await enrichProject(updated, true);
    res.json({
      success: true,
      message: 'Server berhasil dilepas dari projek.',
      project: enriched,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DYNAMIC ALERT RULES ENDPOINTS ───────────────────────────────────────────

// GET /api/projects/:id/alerts — Get all alerts for project
router.get('/:id/alerts', (req, res) => {
  try {
    const alerts = getProjectAlerts(req.params.id);
    res.json({
      success: true,
      total: alerts.length,
      alerts,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/projects/:id/alerts — Add an alert rule to project
router.post('/:id/alerts', async (req, res) => {
  try {
    const { name, webhookUrl, channelLabel, mentions, triggers, useCustomTemplate, customTemplate, isEnabled } = req.body;

    if (!webhookUrl || !webhookUrl.trim()) {
      return res.status(400).json({ success: false, error: 'Slack Webhook URL wajib diisi.' });
    }

    const newAlert = await addProjectAlert(req.params.id, {
      name,
      webhookUrl,
      channelLabel,
      mentions,
      triggers,
      useCustomTemplate,
      customTemplate,
      isEnabled,
    });

    res.status(201).json({
      success: true,
      message: 'Alert rule berhasil ditambahkan ke projek.',
      alert: newAlert,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/projects/:id/alerts/:alertId — Update an alert rule
router.put('/:id/alerts/:alertId', async (req, res) => {
  try {
    const updated = await updateProjectAlert(req.params.id, req.params.alertId, req.body);
    res.json({
      success: true,
      message: 'Alert rule berhasil diperbarui.',
      alert: updated,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/projects/:id/alerts/:alertId — Delete an alert rule
router.delete('/:id/alerts/:alertId', async (req, res) => {
  try {
    await deleteProjectAlert(req.params.id, req.params.alertId);
    res.json({
      success: true,
      message: 'Alert rule berhasil dihapus dari projek.',
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PATCH /api/projects/:id/alerts/:alertId/toggle — Toggle enable/disable
router.patch('/:id/alerts/:alertId/toggle', async (req, res) => {
  try {
    const { isEnabled } = req.body;
    const updated = await toggleProjectAlert(req.params.id, req.params.alertId, isEnabled);
    res.json({
      success: true,
      message: `Alert rule berhasil ${updated.isEnabled ? 'diaktifkan' : 'dinonaktifkan'}.`,
      alert: updated,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/projects/:id/alert-history — Get recent notification logs for this project
router.get('/:id/alert-history', async (req, res) => {
  try {
    const { query } = require('../database/db');
    const result = await query(
      `SELECT * FROM alert_history WHERE project_id = $1 ORDER BY sent_at DESC LIMIT 50`,
      [req.params.id]
    );
    res.json({
      success: true,
      history: result.rows || [],
    });
  } catch (err) {
    res.json({ success: true, history: [] });
  }
});

// POST /api/projects/:id/trigger-test-alert — Simulate sending a real incident alert to Slack
router.post('/:id/trigger-test-alert', async (req, res) => {
  try {
    const project = await getProjectByIdAsync(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Projek tidak ditemukan.' });
    }
    const { dispatchProjectAlerts } = require('../services/alertManager.service');
    const { formatLocalTime } = require('../services/slackWebhook.service');
    const { targetType = 'SERVER', targetName = 'Node-Test-Server', errorMessage = 'Simulasi uji coba insiden (Outage Test Trigger)' } = req.body || {};

    const incidentCtx = {
      projectName: project.name,
      environment: project.env || 'PRODUCTION',
      targetType: targetType.toUpperCase(),
      targetId: 'simulated-target-1',
      targetName,
      targetHost: '103.187.146.73:22',
      severity: 'CRITICAL',
      errorMessage,
      timestamp: new Date().toISOString(),
      time: formatLocalTime(new Date()),
    };

    await dispatchProjectAlerts(project, incidentCtx, targetType.toUpperCase() === 'SERVER' ? 'serverDown' : 'serviceDown');

    res.json({
      success: true,
      message: `Simulasi notifikasi insiden darurat telah dikirimkan ke webhook projek "${project.name}".`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
