'use strict';

/**
 * config/projects.config.js
 *
 * Persistence and CRUD operations for Projects.
 * A Project groups multiple Servers, and each Server contains Services.
 * Hierarchy: Project -> Server -> Service
 */

const fs = require('fs');
const path = require('path');

const PROJECTS_FILE = path.join(__dirname, '../../data/projects.json');

let PROJECTS = [];

/**
 * Load projects from disk.
 */
function loadProjects() {
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
    console.warn('[projects.config] Failed to read projects.json:', err.message);
  }

  // Fallback default
  PROJECTS = [
    {
      id: 'project-inaai-healthcare-ecosystem',
      name: 'InaAI Healthcare Ecosystem',
      description: 'Ekosistem platform layanan telekonsultasi AI, live consult dokter, profil kesehatan, dan rekam medis BPJS.',
      env: 'PRODUCTION',
      serverIds: [
        'server-node-34-101-207-115-server-1',
        'server-node-34-101-122-171-server-2',
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  saveProjects();
}

/**
 * Save projects to disk.
 */
function saveProjects() {
  try {
    const dir = path.dirname(PROJECTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(PROJECTS, null, 2), 'utf-8');
  } catch (err) {
    console.error('[projects.config] Failed to save projects.json:', err.message);
  }
}

// Immediately load on import
loadProjects();

/**
 * @returns {Array<object>}
 */
function getAllProjects() {
  loadProjects();
  return [...PROJECTS];
}

/**
 * @param {string} id
 * @returns {object|undefined}
 */
function getProjectById(id) {
  loadProjects();
  return PROJECTS.find((p) => p.id === id);
}

/**
 * Create a new Project.
 * @param {{ name: string, description?: string, env?: string, serverIds?: string[] }} data
 * @returns {object}
 */
function createProject({ name, description = '', env = 'PRODUCTION', serverIds = [] }) {
  loadProjects();
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const id = `project-${slug || Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const newProject = {
    id,
    name: name.trim(),
    description: description.trim(),
    env: ['PRODUCTION', 'STAGING', 'DEVELOPMENT'].includes(env) ? env : 'PRODUCTION',
    serverIds: Array.isArray(serverIds) ? [...new Set(serverIds)] : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  PROJECTS.push(newProject);
  saveProjects();
  return newProject;
}

/**
 * Update an existing Project.
 * @param {string} id
 * @param {object} updates
 * @returns {object|null}
 */
function updateProject(id, updates) {
  loadProjects();
  const idx = PROJECTS.findIndex((p) => p.id === id);
  if (idx === -1) return null;

  const current = PROJECTS[idx];
  const updated = {
    ...current,
    name: updates.name ? updates.name.trim() : current.name,
    description: updates.description !== undefined ? updates.description.trim() : current.description,
    env: updates.env && ['PRODUCTION', 'STAGING', 'DEVELOPMENT'].includes(updates.env) ? updates.env : current.env,
    serverIds: Array.isArray(updates.serverIds) ? [...new Set(updates.serverIds)] : current.serverIds,
    updatedAt: new Date().toISOString(),
  };

  PROJECTS[idx] = updated;
  saveProjects();
  return updated;
}

/**
 * Delete a Project.
 * @param {string} id
 * @returns {boolean}
 */
function deleteProject(id) {
  loadProjects();
  const beforeLen = PROJECTS.length;
  PROJECTS = PROJECTS.filter((p) => p.id !== id);
  if (PROJECTS.length !== beforeLen) {
    saveProjects();
    return true;
  }
  return false;
}

/**
 * Add a server to a project.
 * @param {string} projectId
 * @param {string} serverId
 * @returns {object|null}
 */
function addServerToProject(projectId, serverId) {
  loadProjects();
  const project = PROJECTS.find((p) => p.id === projectId);
  if (!project) return null;

  if (!project.serverIds.includes(serverId)) {
    project.serverIds.push(serverId);
    project.updatedAt = new Date().toISOString();
    saveProjects();
  }
  return project;
}

/**
 * Remove a server from a project.
 * @param {string} projectId
 * @param {string} serverId
 * @returns {object|null}
 */
function removeServerFromProject(projectId, serverId) {
  loadProjects();
  const project = PROJECTS.find((p) => p.id === projectId);
  if (!project) return null;

  project.serverIds = project.serverIds.filter((id) => id !== serverId);
  project.updatedAt = new Date().toISOString();
  saveProjects();
  return project;
}

module.exports = {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  addServerToProject,
  removeServerFromProject,
};
