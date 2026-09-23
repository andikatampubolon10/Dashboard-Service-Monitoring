'use strict';

/**
 * config/servers.config.js
 *
 * Defines logical "Server" groups — each server hosts one or more microservices.
 * Backed by online MySQL database (sotardoc_server_monitoring) on hosting,
 * with synchronized in-memory caching and local JSON backup for maximum resilience.
 *
 * Hierarchy: Project (id) -> Server (id, project_id) -> Service (id, server_id)
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { query } = require('../database/db');

const STORAGE_FILE = path.join(__dirname, '../../data/registered_servers.json');

/** @type {ServerConfig[]} */
const SERVERS = [];
let CUSTOM_SERVERS = [];
let isDbLoaded = false;

function safeParseJson(val, fallback = null) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function mapServerRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    projectId: r.project_id || null,
    name: r.name,
    displayName: r.display_name || r.name,
    description: r.description || '',
    host: r.host,
    port: r.port != null ? parseInt(r.port, 10) : 22,
    env: r.env || 'PRODUCTION',
    region: r.region || 'jakarta-idc',
    isCustom: r.is_custom !== 0 && r.is_custom !== false,
    spec: safeParseJson(r.spec, {}),
    serviceIds: safeParseJson(r.service_ids, []),
    databases: safeParseJson(r.databases_json, []),
    ssh: safeParseJson(r.ssh, null),
    colocation: safeParseJson(r.colocation, { canShare: ['Multi-node container placement active.'], cannotShare: [] }),
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
  };
}

/**
 * Load servers from MySQL database
 */
async function loadServersFromDb() {
  try {
    const res = await query('SELECT * FROM registered_servers ORDER BY created_at ASC');
    if (Array.isArray(res.rows) && res.rows.length > 0) {
      CUSTOM_SERVERS = res.rows.map(mapServerRow);
      isDbLoaded = true;
      syncToLocalJsonBackup();
      return [...SERVERS, ...CUSTOM_SERVERS];
    }
  } catch (err) {
    console.warn('[servers.config] Failed to fetch servers from MySQL, using local cache:', err.message);
  }

  if (!isDbLoaded) {
    loadPersistedServersFromFile();
  }
  return [...SERVERS, ...CUSTOM_SERVERS];
}

/**
 * Load persisted servers from local file backup
 */
function loadPersistedServersFromFile() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        CUSTOM_SERVERS = data;
      }
    }
  } catch (err) {
    console.warn('[servers.config] Failed to load persisted servers from file:', err.message);
  }
}

/**
 * Keep local JSON file in sync as resilient offline backup
 */
function syncToLocalJsonBackup() {
  try {
    const dir = path.dirname(STORAGE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(CUSTOM_SERVERS, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[servers.config] Failed to save persisted servers to file:', err.message);
  }
}

// Initial eager load
loadPersistedServersFromFile();
loadServersFromDb().catch(() => {});

/**
 * @returns {ServerConfig[]}
 */
function getAllServers() {
  if (!isDbLoaded) {
    loadServersFromDb().catch(() => {});
  }
  return [...SERVERS, ...CUSTOM_SERVERS];
}

/**
 * Async version of getAllServers
 */
async function getAllServersAsync() {
  return await loadServersFromDb();
}

/**
 * @param {string} id
 * @returns {ServerConfig|undefined}
 */
function getServerById(id) {
  return getAllServers().find((s) => s.id === id);
}

/**
 * Async version of getServerById
 */
async function getServerByIdAsync(id) {
  try {
    const res = await query('SELECT * FROM registered_servers WHERE id = ?', [id]);
    if (res.rows && res.rows[0]) {
      return mapServerRow(res.rows[0]);
    }
  } catch (err) {
    console.warn(`[servers.config] getServerByIdAsync error for ${id}:`, err.message);
  }
  return getServerById(id);
}

/**
 * Register a server in MySQL and local cache
 * @param {ServerConfig} server
 * @returns {Promise<ServerConfig>}
 */
async function registerServer(server) {
  const existingIdx = CUSTOM_SERVERS.findIndex((s) => s.id === server.id);
  if (existingIdx >= 0) {
    CUSTOM_SERVERS[existingIdx] = server;
  } else {
    CUSTOM_SERVERS.push(server);
  }

  try {
    await query(
      `INSERT INTO registered_servers (
        id, project_id, name, display_name, description, host, port, env, region,
        is_custom, spec, service_ids, databases_json, ssh, colocation, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        project_id = VALUES(project_id),
        name = VALUES(name),
        display_name = VALUES(display_name),
        description = VALUES(description),
        host = VALUES(host),
        port = VALUES(port),
        env = VALUES(env),
        region = VALUES(region),
        is_custom = VALUES(is_custom),
        spec = VALUES(spec),
        service_ids = VALUES(service_ids),
        databases_json = VALUES(databases_json),
        ssh = VALUES(ssh),
        colocation = VALUES(colocation),
        updated_at = NOW()`,
      [
        server.id,
        server.projectId || null,
        server.name,
        server.displayName || server.name,
        server.description || '',
        server.host,
        server.port || 22,
        server.env || 'PRODUCTION',
        server.region || 'jakarta-idc',
        server.isCustom !== false ? 1 : 0,
        JSON.stringify(server.spec || {}),
        JSON.stringify(server.serviceIds || []),
        JSON.stringify(server.databases || []),
        JSON.stringify(server.ssh || null),
        JSON.stringify(server.colocation || {}),
      ]
    );
  } catch (err) {
    console.error(`[servers.config] Failed to persist server ${server.id} to MySQL:`, err.message);
  }

  syncToLocalJsonBackup();
  return server;
}

/**
 * Remove a server from MySQL and cache
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function removeServer(id) {
  try {
    await query('DELETE FROM registered_servers WHERE id = ?', [id]);
  } catch (err) {
    console.error(`[servers.config] Failed to delete server ${id} from MySQL:`, err.message);
  }

  const customIdx = CUSTOM_SERVERS.findIndex((s) => s.id === id);
  if (customIdx >= 0) {
    CUSTOM_SERVERS.splice(customIdx, 1);
    syncToLocalJsonBackup();
    return true;
  }
  const defaultIdx = SERVERS.findIndex((s) => s.id === id);
  if (defaultIdx >= 0) {
    SERVERS.splice(defaultIdx, 1);
    syncToLocalJsonBackup();
    return true;
  }
  return false;
}

/**
 * Update server details in MySQL and cache
 * @param {string} id
 * @param {Partial<ServerConfig>} updates
 * @returns {Promise<ServerConfig|null>}
 */
async function updateServer(id, updates) {
  const target = getServerById(id);
  if (!target) return null;

  if (updates.name && updates.name.trim()) {
    target.name = updates.name.trim();
    target.displayName = updates.displayName ? updates.displayName.trim() : target.name;
  }
  if (updates.displayName && updates.displayName.trim()) {
    target.displayName = updates.displayName.trim();
  }
  if (updates.projectId !== undefined) {
    target.projectId = updates.projectId || null;
  }
  if (updates.host && updates.host.trim()) {
    target.host = updates.host.trim();
  }
  if (updates.port !== undefined && updates.port !== null) {
    target.port = parseInt(updates.port, 10) || null;
  }
  if (updates.description !== undefined) {
    target.description = updates.description.trim();
  }
  if (updates.env && updates.env.trim()) {
    target.env = updates.env.trim().toUpperCase();
  }
  if (updates.region && updates.region.trim()) {
    target.region = updates.region.trim().toLowerCase();
  }
  if (updates.serviceIds && Array.isArray(updates.serviceIds)) {
    target.serviceIds = [...new Set(updates.serviceIds)];
  }
  if (updates.databases && Array.isArray(updates.databases)) {
    target.databases = updates.databases;
  }

  try {
    await query(
      `UPDATE registered_servers SET
        project_id = ?,
        name = ?,
        display_name = ?,
        description = ?,
        host = ?,
        port = ?,
        env = ?,
        region = ?,
        service_ids = ?,
        databases_json = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [
        target.projectId || null,
        target.name,
        target.displayName,
        target.description,
        target.host,
        target.port || 22,
        target.env || 'PRODUCTION',
        target.region || 'jakarta-idc',
        JSON.stringify(target.serviceIds || []),
        JSON.stringify(target.databases || []),
        id,
      ]
    );
  } catch (err) {
    console.error(`[servers.config] Failed to update server ${id} in MySQL:`, err.message);
  }

  syncToLocalJsonBackup();
  return target;
}

module.exports = {
  SERVERS,
  getAllServers,
  getAllServersAsync,
  getServerById,
  getServerByIdAsync,
  registerServer,
  removeServer,
  updateServer,
  loadServersFromDb,
};
