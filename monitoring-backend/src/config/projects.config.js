'use strict';

/**
 * config/projects.config.js
 *
 * Persistence and CRUD operations for Projects.
 * Backed by online MySQL database (sotardoc_server_monitoring) on hosting,
 * with synchronized in-memory caching and local JSON backup for maximum resilience.
 *
 * Hierarchy: Project (id) -> Server (id, project_id) -> Service (id, server_id)
 */

const fs = require('fs');
const path = require('path');
const { query } = require('../database/db');

const PROJECTS_FILE = path.join(__dirname, '../../data/projects.json');

/** @type {Array<object>} */
let PROJECTS = [];
let isDbLoaded = false;

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

  return {
    id: r.id,
    name: r.name,
    description: r.description || '',
    env: r.env || 'PRODUCTION',
    serverIds: Array.isArray(serverIds) ? serverIds : [],
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
  };
}

/**
 * Load projects from MySQL database with fallback to local JSON file
 */
async function loadProjectsFromDb() {
  try {
    const res = await query('SELECT * FROM projects ORDER BY created_at ASC');
    if (Array.isArray(res.rows) && res.rows.length > 0) {
      PROJECTS = res.rows.map(mapProjectRow);
      isDbLoaded = true;
      syncToLocalJsonBackup();
      return [...PROJECTS];
    }
  } catch (err) {
    console.warn('[projects.config] Failed to fetch projects from MySQL, using local cache:', err.message);
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
        PROJECTS = data;
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
  // Trigger background refresh from DB if not loaded
  if (!isDbLoaded) {
    loadProjectsFromDb().catch(() => {});
  }
  return [...PROJECTS];
}

/**
 * Async version of getAllProjects (ensures latest from MySQL)
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
    const res = await query('SELECT * FROM projects WHERE id = ?', [id]);
    if (res.rows && res.rows[0]) {
      return mapProjectRow(res.rows[0]);
    }
  } catch (err) {
    console.warn(`[projects.config] getProjectByIdAsync error for ${id}:`, err.message);
  }
  return getProjectById(id);
}

/**
 * Create a new Project in MySQL and update cache/backup
 * @param {{ name: string, description?: string, env?: string, serverIds?: string[] }} data
 * @returns {Promise<object>}
 */
async function createProject({ name, description = '', env = 'PRODUCTION', serverIds = [] }) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const id = `project-${slug || Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const cleanServerIds = Array.isArray(serverIds) ? [...new Set(serverIds)] : [];
  const validEnv = ['PRODUCTION', 'STAGING', 'DEVELOPMENT'].includes(env) ? env : 'PRODUCTION';
  const now = new Date();

  const newProject = {
    id,
    name: name.trim(),
    description: description.trim(),
    env: validEnv,
    serverIds: cleanServerIds,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  try {
    await query(
      `INSERT INTO projects (id, name, description, env, server_ids, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        newProject.name,
        newProject.description,
        newProject.env,
        JSON.stringify(cleanServerIds),
        now,
        now,
      ]
    );

    // Relate assigned servers to this project via project_id
    if (cleanServerIds.length > 0) {
      await query(
        `UPDATE registered_servers SET project_id = ? WHERE id IN (${cleanServerIds.map(() => '?').join(',')})`,
        [id, ...cleanServerIds]
      );
    }
  } catch (err) {
    console.error('[projects.config] Failed to insert project into MySQL:', err.message);
  }

  PROJECTS.push(newProject);
  syncToLocalJsonBackup();
  return newProject;
}

/**
 * Update an existing Project in MySQL and cache
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
  const now = new Date();

  const updated = {
    ...current,
    name: updatedName,
    description: updatedDesc,
    env: updatedEnv,
    serverIds: updatedServerIds,
    updatedAt: now.toISOString(),
  };

  try {
    await query(
      `UPDATE projects SET name = ?, description = ?, env = ?, server_ids = ?, updated_at = ? WHERE id = ?`,
      [updatedName, updatedDesc, updatedEnv, JSON.stringify(updatedServerIds), now, id]
    );

    // Update relational links in registered_servers
    if (Array.isArray(updates.serverIds)) {
      // Unlink removed servers
      await query(
        `UPDATE registered_servers SET project_id = NULL WHERE project_id = ?`,
        [id]
      );
      // Link current servers
      if (updatedServerIds.length > 0) {
        await query(
          `UPDATE registered_servers SET project_id = ? WHERE id IN (${updatedServerIds.map(() => '?').join(',')})`,
          [id, ...updatedServerIds]
        );
      }
    }
  } catch (err) {
    console.error(`[projects.config] Failed to update project ${id} in MySQL:`, err.message);
  }

  const idx = PROJECTS.findIndex((p) => p.id === id);
  if (idx >= 0) {
    PROJECTS[idx] = updated;
  }
  syncToLocalJsonBackup();
  return updated;
}

/**
 * Delete a Project from MySQL and cache
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function deleteProject(id) {
  try {
    // Unlink servers first (foreign key will also SET NULL)
    await query('UPDATE registered_servers SET project_id = NULL WHERE project_id = ?', [id]);
    await query('DELETE FROM projects WHERE id = ?', [id]);
  } catch (err) {
    console.error(`[projects.config] Failed to delete project ${id} from MySQL:`, err.message);
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
 * Add a server to a project in MySQL and cache
 * @param {string} projectId
 * @param {string} serverId
 * @returns {Promise<object|null>}
 */
async function addServerToProject(projectId, serverId) {
  const project = getProjectById(projectId);
  if (!project) return null;

  if (!project.serverIds.includes(serverId)) {
    project.serverIds.push(serverId);
  }
  project.updatedAt = new Date().toISOString();

  try {
    await query(
      `UPDATE projects SET server_ids = ?, updated_at = NOW() WHERE id = ?`,
      [JSON.stringify(project.serverIds), projectId]
    );
    await query(
      `UPDATE registered_servers SET project_id = ? WHERE id = ?`,
      [projectId, serverId]
    );
  } catch (err) {
    console.error(`[projects.config] Failed to addServerToProject in MySQL:`, err.message);
  }

  syncToLocalJsonBackup();
  return project;
}


/**
 * Remove a server from a project in MySQL and cache
 * @param {string} projectId
 * @param {string} serverId
 * @returns {Promise<object|null>}
 */
async function removeServerFromProject(projectId, serverId) {
  const project = getProjectById(projectId);
  if (!project) return null;

  project.serverIds = project.serverIds.filter((id) => id !== serverId);
  project.updatedAt = new Date().toISOString();

  try {
    await query(
      `UPDATE projects SET server_ids = ?, updated_at = NOW() WHERE id = ?`,
      [JSON.stringify(project.serverIds), projectId]
    );
    await query(
      `UPDATE registered_servers SET project_id = NULL WHERE id = ? AND project_id = ?`,
      [serverId, projectId]
    );
  } catch (err) {
    console.error(`[projects.config] Failed to removeServerFromProject in MySQL:`, err.message);
  }

  syncToLocalJsonBackup();
  return project;
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
};
