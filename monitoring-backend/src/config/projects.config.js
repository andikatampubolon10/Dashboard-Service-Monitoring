'use strict';

/**
 * config/projects.config.js
 *
 * Persistence and CRUD operations for Projects and their dynamic Slack Alert Rules.
 * Supports PostgreSQL and MySQL with synchronized in-memory caching and local JSON backup.
 *
 * Hierarchy: Project (id) -> Server (id, project_id) -> Service (id, server_id)
 * Each project contains an array of alerts (alerts_json) for targeted Slack notifications.
 */

const fs = require('fs');
const path = require('path');
const { query, dbType } = require('../database/db');

const PROJECTS_FILE = path.join(__dirname, '../../data/projects.json');

/** @type {Array<object>} */
let PROJECTS = [];
let isDbLoaded = false;

/**
 * Helper to execute SQL with '?' placeholders across both MySQL and PostgreSQL.
 * For PostgreSQL, automatically converts '?' to '$1, $2, $3...'.
 */
async function executeSql(sqlWithQuestionMarks, params = []) {
  if (dbType === 'mysql') {
    return await query(sqlWithQuestionMarks, params);
  }
  let paramIdx = 1;
  const pgSql = sqlWithQuestionMarks.replace(/\?/g, () => `$${paramIdx++}`);
  return await query(pgSql, params);
}

function mapAlertRow(r) {
  if (!r) return null;
  let triggers = { serverDown: true, serviceDown: true, onRecovery: true };
  try {
    if (typeof r.triggers_json === 'object' && r.triggers_json !== null) {
      triggers = r.triggers_json;
    } else if (typeof r.triggers_json === 'string') {
      triggers = JSON.parse(r.triggers_json);
    }
  } catch {}

  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name || 'Slack Alert Rule',
    webhookUrl: r.webhook_url || '',
    channelLabel: r.channel_label || '#monitoring-alerts',
    mentions: r.mentions || '',
    triggers,
    messageStyle: r.message_style || 'STANDARD',
    teamNote: r.team_note || '',
    useCustomTemplate: Boolean(r.use_custom_template),
    customTemplate: r.custom_template || '',
    isEnabled: r.is_enabled !== false,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
  };
}

function mapProjectRow(r) {
  if (!r) return null;
  let serverIds = [];
  try {
    if (Array.isArray(r.server_ids)) {
      serverIds = r.server_ids;
    } else if (typeof r.server_ids === 'string') {
      serverIds = JSON.parse(r.server_ids || '[]');
    }
  } catch {
    serverIds = [];
  }

  let alerts = [];
  try {
    if (Array.isArray(r.alerts_json)) {
      alerts = r.alerts_json;
    } else if (typeof r.alerts_json === 'string') {
      alerts = JSON.parse(r.alerts_json || '[]');
    } else if (Array.isArray(r.alerts)) {
      alerts = r.alerts;
    }
  } catch {
    alerts = [];
  }

  return {
    id: r.id,
    name: r.name,
    description: r.description || '',
    env: r.env || 'PRODUCTION',
    serverIds: Array.isArray(serverIds) ? serverIds : [],
    alerts: Array.isArray(alerts) ? alerts : [],
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
  };
}

/**
 * Load projects from database with fallback to local JSON file
 */
async function loadProjectsFromDb() {
  try {
    const res = await query('SELECT * FROM projects ORDER BY created_at ASC');
    if (Array.isArray(res.rows) && res.rows.length > 0) {
      const alertsByProject = new Map();
      try {
        const aRes = await query('SELECT * FROM project_alerts ORDER BY created_at ASC');
        if (Array.isArray(aRes.rows) && aRes.rows.length > 0) {
          for (const aRow of aRes.rows) {
            const mappedA = mapAlertRow(aRow);
            if (!alertsByProject.has(aRow.project_id)) {
              alertsByProject.set(aRow.project_id, []);
            }
            alertsByProject.get(aRow.project_id).push(mappedA);
          }
        }
      } catch (aErr) {
        // Table might not exist yet if before migration, ignore safely
      }

      PROJECTS = res.rows.map((r) => {
        const p = mapProjectRow(r);
        if (alertsByProject.has(p.id)) {
          p.alerts = alertsByProject.get(p.id);
        }
        return p;
      });
      isDbLoaded = true;
      syncToLocalJsonBackup();
      return [...PROJECTS];
    }
  } catch (err) {
    console.warn('[projects.config] Failed to fetch projects from DB, using local cache:', err.message);
  }

  // Fallback to local file
  if (!isDbLoaded) {
    loadProjectsFromFile();
  }
  return [...PROJECTS];
}

/**
 * Load projects from disk backup if DB is unreachable
 */
function loadProjectsFromFile() {
  try {
    if (fs.existsSync(PROJECTS_FILE)) {
      const raw = fs.readFileSync(PROJECTS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        PROJECTS = data.map((p) => ({
          ...p,
          alerts: Array.isArray(p.alerts) ? p.alerts : [],
        }));
        return;
      }
    }
  } catch (err) {
    console.warn('[projects.config] Failed to read projects.json backup:', err.message);
  }
}

/**
 * Keep local JSON file in sync as a resilient offline backup
 */
function syncToLocalJsonBackup() {
  try {
    const dir = path.dirname(PROJECTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(PROJECTS, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[projects.config] Failed to sync local projects.json backup:', err.message);
  }
}

// Initial eager load
loadProjectsFromFile();
loadProjectsFromDb().catch(() => {});

/**
 * @returns {Array<object>}
 */
function getAllProjects() {
  if (!isDbLoaded) {
    loadProjectsFromDb().catch(() => {});
  }
  return [...PROJECTS];
}

/**
 * Async version of getAllProjects (ensures latest from DB)
 */
async function getAllProjectsAsync() {
  return await loadProjectsFromDb();
}

/**
 * @param {string} id
 * @returns {object|undefined}
 */
function getProjectById(id) {
  return PROJECTS.find((p) => p.id === id);
}

/**
 * Async version of getProjectById
 */
async function getProjectByIdAsync(id) {
  try {
    const res = await executeSql('SELECT * FROM projects WHERE id = ?', [id]);
    if (res.rows && res.rows[0]) {
      return mapProjectRow(res.rows[0]);
    }
  } catch (err) {
    console.warn(`[projects.config] getProjectByIdAsync error for ${id}:`, err.message);
  }
  return getProjectById(id);
}

/**
 * Create a new Project in DB and update cache/backup
 * @param {{ name: string, description?: string, env?: string, serverIds?: string[], alerts?: any[] }} data
 * @returns {Promise<object>}
 */
async function createProject({ name, description = '', env = 'PRODUCTION', serverIds = [], alerts = [] }) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const id = `project-${slug || Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const cleanServerIds = Array.isArray(serverIds) ? [...new Set(serverIds)] : [];
  const validEnv = ['PRODUCTION', 'STAGING', 'DEVELOPMENT'].includes(env) ? env : 'PRODUCTION';
  const now = new Date();

  const cleanAlerts = Array.isArray(alerts)
    ? alerts.map((a) => ({
        id: a.id || `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        projectId: id,
        name: a.name ? a.name.trim() : 'Slack Alert Rule',
        webhookUrl: a.webhookUrl ? a.webhookUrl.trim() : '',
        channelLabel: a.channelLabel ? a.channelLabel.trim() : '#monitoring-alerts',
        mentions: a.mentions ? a.mentions.trim() : '',
        triggers: a.triggers || { serverDown: true, serviceDown: true, onRecovery: true },
        messageStyle: a.messageStyle || 'STANDARD',
        teamNote: a.teamNote ? a.teamNote.trim() : '',
        useCustomTemplate: Boolean(a.useCustomTemplate),
        customTemplate: a.customTemplate || '',
        isEnabled: a.isEnabled !== false,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }))
    : [];

  const newProject = {
    id,
    name: name.trim(),
    description: description.trim(),
    env: validEnv,
    serverIds: cleanServerIds,
    alerts: cleanAlerts,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  try {
    await executeSql(
      `INSERT INTO projects (id, name, description, env, server_ids, alerts_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        newProject.name,
        newProject.description,
        newProject.env,
        JSON.stringify(cleanServerIds),
        JSON.stringify(cleanAlerts),
        now,
        now,
      ]
    );

    // Relate assigned servers to this project via project_id
    if (cleanServerIds.length > 0) {
      await executeSql(
        `UPDATE registered_servers SET project_id = ? WHERE id IN (${cleanServerIds.map(() => '?').join(',')})`,
        [id, ...cleanServerIds]
      );
    }

    // Persist alerts to project_alerts table
    for (const a of cleanAlerts) {
      try {
        await executeSql(
          `INSERT INTO project_alerts (
             id, project_id, name, webhook_url, channel_label, mentions,
             triggers_json, message_style, team_note, use_custom_template, custom_template,
             is_enabled, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            a.id,
            id,
            a.name,
            a.webhookUrl,
            a.channelLabel,
            a.mentions,
            JSON.stringify(a.triggers),
            a.messageStyle,
            a.teamNote,
            a.useCustomTemplate,
            a.customTemplate,
            a.isEnabled,
            now,
            now,
          ]
        );
      } catch (alertErr) {
        console.warn(`[projects.config] Failed to insert alert ${a.id} into project_alerts:`, alertErr.message);
      }
    }
  } catch (err) {
    console.error('[projects.config] Failed to insert project into DB:', err.message);
  }

  PROJECTS.push(newProject);
  syncToLocalJsonBackup();
  return newProject;
}

/**
 * Update an existing Project in DB and cache
 * @param {string} id
 * @param {object} updates
 * @returns {Promise<object|null>}
 */
async function updateProject(id, updates) {
  const current = getProjectById(id);
  if (!current) return null;

  const updatedName = updates.name ? updates.name.trim() : current.name;
  const updatedDesc = updates.description !== undefined ? updates.description.trim() : current.description;
  const updatedEnv = updates.env && ['PRODUCTION', 'STAGING', 'DEVELOPMENT'].includes(updates.env) ? updates.env : current.env;
  const updatedServerIds = Array.isArray(updates.serverIds) ? [...new Set(updates.serverIds)] : current.serverIds;
  const updatedAlerts = Array.isArray(updates.alerts) ? updates.alerts : current.alerts || [];
  const now = new Date();

  const updated = {
    ...current,
    name: updatedName,
    description: updatedDesc,
    env: updatedEnv,
    serverIds: updatedServerIds,
    alerts: updatedAlerts,
    updatedAt: now.toISOString(),
  };

  try {
    await executeSql(
      `UPDATE projects SET name = ?, description = ?, env = ?, server_ids = ?, alerts_json = ?, updated_at = ? WHERE id = ?`,
      [updatedName, updatedDesc, updatedEnv, JSON.stringify(updatedServerIds), JSON.stringify(updatedAlerts), now, id]
    );

    // Update relational links in registered_servers
    if (Array.isArray(updates.serverIds)) {
      await executeSql(`UPDATE registered_servers SET project_id = NULL WHERE project_id = ?`, [id]);
      if (updatedServerIds.length > 0) {
        await executeSql(
          `UPDATE registered_servers SET project_id = ? WHERE id IN (${updatedServerIds.map(() => '?').join(',')})`,
          [id, ...updatedServerIds]
        );
      }
    }

    // Sync relational alerts in project_alerts
    if (Array.isArray(updates.alerts)) {
      try {
        await executeSql('DELETE FROM project_alerts WHERE project_id = ?', [id]);
        for (const a of updatedAlerts) {
          await executeSql(
            `INSERT INTO project_alerts (
               id, project_id, name, webhook_url, channel_label, mentions,
               triggers_json, message_style, team_note, use_custom_template, custom_template,
               is_enabled, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              a.id || `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              id,
              a.name || 'Slack Alert Rule',
              a.webhookUrl || '',
              a.channelLabel || '#monitoring-alerts',
              a.mentions || '',
              JSON.stringify(a.triggers || {}),
              a.messageStyle || 'STANDARD',
              a.teamNote || '',
              Boolean(a.useCustomTemplate),
              a.customTemplate || '',
              a.isEnabled !== false,
              a.createdAt || now,
              now,
            ]
          );
        }
      } catch (alertSyncErr) {
        console.warn(`[projects.config] Failed to sync project_alerts for ${id}:`, alertSyncErr.message);
      }
    }
  } catch (err) {
    console.error(`[projects.config] Failed to update project ${id} in DB:`, err.message);
  }

  const idx = PROJECTS.findIndex((p) => p.id === id);
  if (idx >= 0) {
    PROJECTS[idx] = updated;
  }
  syncToLocalJsonBackup();
  return updated;
}

/**
 * Delete a Project from DB and cache
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function deleteProject(id) {
  try {
    await executeSql('DELETE FROM project_alerts WHERE project_id = ?', [id]);
    await executeSql('UPDATE registered_servers SET project_id = NULL WHERE project_id = ?', [id]);
    await executeSql('DELETE FROM projects WHERE id = ?', [id]);
  } catch (err) {
    console.error(`[projects.config] Failed to delete project ${id} from DB:`, err.message);
  }

  const beforeLen = PROJECTS.length;
  PROJECTS = PROJECTS.filter((p) => p.id !== id);
  if (PROJECTS.length !== beforeLen) {
    syncToLocalJsonBackup();
    return true;
  }
  return false;
}

/**
 * Add a server to a project
 */
async function addServerToProject(projectId, serverId) {
  const project = getProjectById(projectId);
  if (!project) return null;

  if (!project.serverIds.includes(serverId)) {
    project.serverIds.push(serverId);
  }
  project.updatedAt = new Date().toISOString();

  try {
    await executeSql(
      `UPDATE projects SET server_ids = ?, updated_at = NOW() WHERE id = ?`,
      [JSON.stringify(project.serverIds), projectId]
    );
    await executeSql(`UPDATE registered_servers SET project_id = ? WHERE id = ?`, [projectId, serverId]);
  } catch (err) {
    console.error(`[projects.config] Failed to addServerToProject:`, err.message);
  }

  syncToLocalJsonBackup();
  return project;
}

/**
 * Remove a server from a project
 */
async function removeServerFromProject(projectId, serverId) {
  const project = getProjectById(projectId);
  if (!project) return null;

  project.serverIds = project.serverIds.filter((id) => id !== serverId);
  project.updatedAt = new Date().toISOString();

  try {
    await executeSql(
      `UPDATE projects SET server_ids = ?, updated_at = NOW() WHERE id = ?`,
      [JSON.stringify(project.serverIds), projectId]
    );
    await executeSql(
      `UPDATE registered_servers SET project_id = NULL WHERE id = ? AND project_id = ?`,
      [serverId, projectId]
    );
  } catch (err) {
    console.error(`[projects.config] Failed to removeServerFromProject:`, err.message);
  }

  syncToLocalJsonBackup();
  return project;
}

// ─── DYNAMIC ALERT RULES MANAGEMENT ──────────────────────────────────────────

/**
 * Get all alert rules for a specific project
 * @param {string} projectId
 * @returns {Array<object>}
 */
function getProjectAlerts(projectId) {
  const project = getProjectById(projectId);
  return project ? Array.isArray(project.alerts) ? project.alerts : [] : [];
}

/**
 * Add a new alert rule to a project
 * @param {string} projectId
 * @param {object} alertData
 * @returns {Promise<object>} The added alert rule
 */
async function addProjectAlert(projectId, alertData) {
  const project = getProjectById(projectId);
  if (!project) throw new Error('Projek tidak ditemukan.');

  const alertId = alertData.id || `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date();

  const newAlert = {
    id: alertId,
    projectId,
    name: alertData.name ? alertData.name.trim() : 'Slack Alert Rule',
    webhookUrl: alertData.webhookUrl ? alertData.webhookUrl.trim() : '',
    channelLabel: alertData.channelLabel ? alertData.channelLabel.trim() : '#monitoring-alerts',
    mentions: alertData.mentions ? alertData.mentions.trim() : '',
    triggers: {
      serverDown: alertData.triggers?.serverDown !== false,
      serviceDown: alertData.triggers?.serviceDown !== false,
      highErrorRate: Boolean(alertData.triggers?.highErrorRate),
      highLatency: Boolean(alertData.triggers?.highLatency),
      highResourceUsage: Boolean(alertData.triggers?.highResourceUsage),
      onRecovery: alertData.triggers?.onRecovery !== false,
    },
    messageStyle: alertData.messageStyle || 'STANDARD',
    teamNote: alertData.teamNote ? alertData.teamNote.trim() : '',
    useCustomTemplate: Boolean(alertData.useCustomTemplate),
    customTemplate: alertData.customTemplate || '',
    isEnabled: alertData.isEnabled !== false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  try {
    await executeSql(
      `INSERT INTO project_alerts (
         id, project_id, name, webhook_url, channel_label, mentions,
         triggers_json, message_style, team_note, use_custom_template, custom_template,
         is_enabled, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newAlert.id,
        projectId,
        newAlert.name,
        newAlert.webhookUrl,
        newAlert.channelLabel,
        newAlert.mentions,
        JSON.stringify(newAlert.triggers),
        newAlert.messageStyle,
        newAlert.teamNote,
        newAlert.useCustomTemplate,
        newAlert.customTemplate,
        newAlert.isEnabled,
        now,
        now,
      ]
    );
  } catch (err) {
    console.warn(`[projects.config] Failed to insert alert into project_alerts:`, err.message);
  }

  const alerts = Array.isArray(project.alerts) ? [...project.alerts, newAlert] : [newAlert];
  await updateProject(projectId, { alerts });
  return newAlert;
}

/**
 * Update an existing alert rule in a project
 * @param {string} projectId
 * @param {string} alertId
 * @param {object} updates
 * @returns {Promise<object|null>}
 */
async function updateProjectAlert(projectId, alertId, updates) {
  const project = getProjectById(projectId);
  if (!project) throw new Error('Projek tidak ditemukan.');

  const alerts = Array.isArray(project.alerts) ? [...project.alerts] : [];
  const idx = alerts.findIndex((a) => a.id === alertId);
  if (idx === -1) throw new Error('Alert rule tidak ditemukan.');

  const existing = alerts[idx];
  const now = new Date();

  const updatedAlert = {
    ...existing,
    name: updates.name ? updates.name.trim() : existing.name,
    webhookUrl: updates.webhookUrl ? updates.webhookUrl.trim() : existing.webhookUrl,
    channelLabel: updates.channelLabel !== undefined ? updates.channelLabel.trim() : existing.channelLabel,
    mentions: updates.mentions !== undefined ? updates.mentions.trim() : existing.mentions,
    triggers: updates.triggers ? { ...existing.triggers, ...updates.triggers } : existing.triggers,
    messageStyle: updates.messageStyle || existing.messageStyle || 'STANDARD',
    teamNote: updates.teamNote !== undefined ? updates.teamNote.trim() : (existing.teamNote || ''),
    useCustomTemplate: updates.useCustomTemplate !== undefined ? Boolean(updates.useCustomTemplate) : existing.useCustomTemplate,
    customTemplate: updates.customTemplate !== undefined ? updates.customTemplate : existing.customTemplate,
    isEnabled: updates.isEnabled !== undefined ? Boolean(updates.isEnabled) : existing.isEnabled,
    updatedAt: now.toISOString(),
  };

  try {
    await executeSql(
      `UPDATE project_alerts SET
         name = ?, webhook_url = ?, channel_label = ?, mentions = ?,
         triggers_json = ?, message_style = ?, team_note = ?,
         use_custom_template = ?, custom_template = ?, is_enabled = ?, updated_at = ?
       WHERE id = ? AND project_id = ?`,
      [
        updatedAlert.name,
        updatedAlert.webhookUrl,
        updatedAlert.channelLabel,
        updatedAlert.mentions,
        JSON.stringify(updatedAlert.triggers),
        updatedAlert.messageStyle,
        updatedAlert.teamNote,
        updatedAlert.useCustomTemplate,
        updatedAlert.customTemplate,
        updatedAlert.isEnabled,
        now,
        alertId,
        projectId,
      ]
    );
  } catch (err) {
    console.warn(`[projects.config] Failed to update project_alerts:`, err.message);
  }

  alerts[idx] = updatedAlert;
  await updateProject(projectId, { alerts });
  return updatedAlert;
}

/**
 * Delete an alert rule from a project
 * @param {string} projectId
 * @param {string} alertId
 * @returns {Promise<boolean>}
 */
async function deleteProjectAlert(projectId, alertId) {
  const project = getProjectById(projectId);
  if (!project) throw new Error('Projek tidak ditemukan.');

  try {
    await executeSql('DELETE FROM project_alerts WHERE id = ? AND project_id = ?', [alertId, projectId]);
  } catch (err) {
    console.warn(`[projects.config] Failed to delete from project_alerts:`, err.message);
  }

  const alerts = Array.isArray(project.alerts) ? project.alerts.filter((a) => a.id !== alertId) : [];
  await updateProject(projectId, { alerts });
  return true;
}

/**
 * Toggle enable/disable status of an alert rule
 * @param {string} projectId
 * @param {string} alertId
 * @param {boolean} isEnabled
 * @returns {Promise<object>}
 */
async function toggleProjectAlert(projectId, alertId, isEnabled) {
  return await updateProjectAlert(projectId, alertId, { isEnabled });
}

module.exports = {
  getAllProjects,
  getAllProjectsAsync,
  getProjectById,
  getProjectByIdAsync,
  createProject,
  updateProject,
  deleteProject,
  addServerToProject,
  removeServerFromProject,
  loadProjectsFromDb,
  // Alert rules functions
  getProjectAlerts,
  addProjectAlert,
  updateProjectAlert,
  deleteProjectAlert,
  toggleProjectAlert,
};
