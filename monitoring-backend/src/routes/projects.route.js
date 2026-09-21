'use strict';

/**
 * routes/projects.route.js
 *
 * REST API routes for Project management.
 * Hierarchy: Project -> Server -> Service
 *
 * GET    /api/projects                  — List all projects with aggregated health & metrics
 * GET    /api/projects/:id              — Get detailed project view with full server objects
 * POST   /api/projects                  — Create a new project
 * PUT    /api/projects/:id              — Update project details and server assignments
 * DELETE /api/projects/:id              — Delete a project
 * POST   /api/projects/:id/servers      — Add a server to project
 * DELETE /api/projects/:id/servers/:sid — Remove a server from project
 */

const { Router } = require('express');
const {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  addServerToProject,
  removeServerFromProject,
} = require('../config/projects.config');
const { getAllServers, getServerById } = require('../config/servers.config');
const serversRouter = require('./servers.route');
const projectAiInsightService = require('../services/projectAiInsight.service');

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
    builtServers = await Promise.all(
      matchingServers.map((s) => serversRouter.buildServerResponse(s, false))
    );
  } else if (typeof serversRouter.buildServerResponse === 'function') {
    // Quick summary build
    builtServers = await Promise.all(
      matchingServers.map((s) => serversRouter.buildServerResponse(s, false))
    );
  } else {
    builtServers = matchingServers.map((s) => ({
      id: s.id,
      name: s.name,
      displayName: s.displayName || s.name,
      host: s.host,
      env: s.env || project.env,
      status: 'Healthy',
      totalServices: (s.serviceIds || []).length,
      upServices: (s.serviceIds || []).length,
    }));
  }

  let totalServices = 0;
  let upServices = 0;
  let downServices = 0;
  let totalCpu = 0;
  let totalMemMb = 0;
  let usedMemMb = 0;
  let totalDiskGb = 0;
  let usedDiskGb = 0;

  for (const s of builtServers) {
    const srvCount = s.totalServices || (s.services ? s.services.length : 0);
    const upCount = s.upServices != null ? s.upServices : (s.services ? s.services.filter((x) => x.status === 'UP').length : 0);
    totalServices += srvCount;
    upServices += upCount;
    downServices += Math.max(0, srvCount - upCount);

    if (s.system) {
      if (s.system.cpu?.usagePercent) totalCpu += s.system.cpu.usagePercent;
      if (s.system.memory?.totalMb) totalMemMb += s.system.memory.totalMb;
      if (s.system.memory?.usedMb) usedMemMb += s.system.memory.usedMb;
      if (s.system.disk?.totalGb) totalDiskGb += s.system.disk.totalGb;
      if (s.system.disk?.usedGb) usedDiskGb += s.system.disk.usedGb;
    }
  }

  const serverCount = builtServers.length;
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
    const rawProjects = getAllProjects();
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

// ─── GET /api/projects/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const project = getProjectById(req.params.id);
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
// Generate or retrieve cached AI infrastructure insight for a specific project
router.post('/:id/ai-insight', async (req, res) => {
  try {
    const project = getProjectById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Projek tidak ditemukan.' });
    }

    const { forceRefresh = false } = req.body || {};
    const detailed = await enrichProject(project, true);

    const insight = await projectAiInsightService.generateProjectInfrastructureInsight(
      detailed,
      Boolean(forceRefresh)
    );

    res.json({
      success: true,
      data: insight,
    });
  } catch (err) {
    console.error(`[Project AI Route] Failed to generate insight for ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      error: `Gagal menghasilkan insight: ${err.message}`,
    });
  }
});

// ─── POST /api/projects ──────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, description = '', env = 'PRODUCTION', serverIds = [] } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nama projek wajib diisi.' });
    }

    const created = createProject({ name, description, env, serverIds });
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
    const { name, description, env, serverIds } = req.body;
    const updated = updateProject(req.params.id, { name, description, env, serverIds });

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
router.delete('/:id', (req, res) => {
  try {
    const deleted = deleteProject(req.params.id);
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

    const updated = addServerToProject(req.params.id, serverId);
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
    const updated = removeServerFromProject(req.params.id, req.params.serverId);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Projek tidak ditemukan.' });
    }

    const enriched = await enrichProject(updated, true);
    res.json({
      success: true,
      message: 'Server berhasil dikeluarkan dari projek.',
      project: enriched,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
