'use strict';

/**
 * Service Registry
 * All microservices monitored by the system.
 * Backed by online MySQL database (sotardoc_server_monitoring) on hosting,
 * with synchronized in-memory caching and local JSON backup for maximum resilience.
 *
 * Hierarchy: Project (id) -> Server (id, project_id) -> Service (id, server_id)
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { query } = require('../database/db');

const METRICS_PATH = process.env.METRICS_PATH || '/metrics';
const REMOTE_HOST = process.env.REMOTE_HOST || '10.148.218.66';

/**
 * Determine server metadata from service URL.
 * @param {string} url
 */
function resolveServerMeta(url) {
  const isRemote = Boolean(url && (url.includes(REMOTE_HOST) || (!url.includes('localhost') && !url.includes('127.0.0.1'))));
  return {
    isRemote,
    serverName: isRemote ? 'Remote Server' : 'Server Host',
    serverHost: isRemote ? (url?.split('://')[1]?.split(':')[0] || REMOTE_HOST) : 'localhost',
  };
}

/** @type {ServiceConfig[]} */
const SERVICES = [];

const DYNAMIC_SERVICES_FILE = path.join(__dirname, '../../data/dynamic_services.json');

/** @type {Map<string, ServiceConfig>} */
const DYNAMIC_SERVICES = new Map();
let isDbLoaded = false;

function safeParseJson(val, fallback = []) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function mapServiceRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    metricsPath: r.metrics_path || METRICS_PATH,
    stack: r.stack || 'nodejs',
    description: r.description || '',
    serverId: r.server_id || null,
    port: r.port || null,
    databases: safeParseJson(r.databases_json, []),
    isDynamic: r.is_dynamic !== 0 && r.is_dynamic !== false,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
  };
}

/**
 * Load services from MySQL database
 */
async function loadDynamicServicesFromDb() {
  try {
    const res = await query('SELECT * FROM registered_services ORDER BY created_at ASC');
    if (Array.isArray(res.rows) && res.rows.length > 0) {
      DYNAMIC_SERVICES.clear();
      for (const row of res.rows) {
        const mapped = mapServiceRow(row);
        if (mapped && mapped.id) {
          DYNAMIC_SERVICES.set(mapped.id, mapped);
        }
      }
      isDbLoaded = true;
      syncToLocalJsonBackup();
      return Array.from(DYNAMIC_SERVICES.values());
    }
  } catch (err) {
    console.warn('[services.config] Failed to fetch services from MySQL, using local cache:', err.message);
  }

  if (!isDbLoaded) {
    loadDynamicServicesFromFile();
  }
  return Array.from(DYNAMIC_SERVICES.values());
}

/**
 * Load dynamic services from disk backup
 */
function loadDynamicServicesFromFile() {
  DYNAMIC_SERVICES.clear();
  try {
    if (fs.existsSync(DYNAMIC_SERVICES_FILE)) {
      const raw = fs.readFileSync(DYNAMIC_SERVICES_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const svc of list) {
          if (svc && svc.id) {
            DYNAMIC_SERVICES.set(svc.id, svc);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[services.config] Failed to load dynamic services from file:', err.message);
  }
}

/**
 * Keep local JSON backup file in sync
 */
function syncToLocalJsonBackup() {
  try {
    const list = Array.from(DYNAMIC_SERVICES.values());
    const dir = path.dirname(DYNAMIC_SERVICES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DYNAMIC_SERVICES_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[services.config] Failed to sync local dynamic_services.json:', err.message);
  }
}

// Initial eager load
loadDynamicServicesFromFile();
loadDynamicServicesFromDb().catch(() => {});

/**
 * Load dynamic services (compatible sync export)
 */
function loadDynamicServices() {
  if (!isDbLoaded) {
    loadDynamicServicesFromDb().catch(() => {});
  }
}

/**
 * Get all active services (both built-in and dynamically discovered).
 * @returns {ServiceConfig[]}
 */
function getAllActiveServices() {
  loadDynamicServices();
  const mergedMap = new Map();
  for (const svc of SERVICES) {
    mergedMap.set(svc.id, {
      ...svc,
      ...resolveServerMeta(svc.url),
    });
  }
  for (const [id, svc] of DYNAMIC_SERVICES.entries()) {
    mergedMap.set(id, {
      ...svc,
      ...resolveServerMeta(svc.url),
    });
  }
  return Array.from(mergedMap.values());
}

/**
 * Register or update a service in MySQL and local cache
 * @param {ServiceConfig & { serverId?: string }} service
 * @returns {Promise<ServiceConfig>}
 */
async function registerService(service) {
  const serviceObj = {
    id: service.id,
    name: service.name || service.id,
    url: service.url,
    metricsPath: service.metricsPath || '/metrics',
    stack: service.stack || 'nodejs',
    description: service.description || `Service at ${service.url}`,
    serverId: service.serverId || null,
    port: service.port || null,
    databases: Array.isArray(service.databases) ? service.databases : [],
    isDynamic: true,
  };

  DYNAMIC_SERVICES.set(service.id, serviceObj);

  try {
    await query(
      `INSERT INTO registered_services (
        id, server_id, name, url, metrics_path, stack, description, port, databases_json, is_dynamic, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        server_id = VALUES(server_id),
        name = VALUES(name),
        url = VALUES(url),
        metrics_path = VALUES(metrics_path),
        stack = VALUES(stack),
        description = VALUES(description),
        port = VALUES(port),
        databases_json = VALUES(databases_json),
        updated_at = NOW()`,
      [
        serviceObj.id,
        serviceObj.serverId,
        serviceObj.name,
        serviceObj.url,
        serviceObj.metricsPath,
        serviceObj.stack,
        serviceObj.description,
        serviceObj.port,
        JSON.stringify(serviceObj.databases),
      ]
    );

    // If serverId is present, ensure server's service_ids array in MySQL has this service
    if (serviceObj.serverId) {
      const serverRes = await query('SELECT service_ids FROM registered_servers WHERE id = ?', [serviceObj.serverId]);
      if (serverRes.rows && serverRes.rows[0]) {
        let sids = safeParseJson(serverRes.rows[0].service_ids, []);
        if (!sids.includes(serviceObj.id)) {
          sids.push(serviceObj.id);
          await query('UPDATE registered_servers SET service_ids = ?, updated_at = NOW() WHERE id = ?', [
            JSON.stringify(sids),
            serviceObj.serverId,
          ]);
        }
      }
    }
  } catch (err) {
    console.error(`[services.config] Failed to persist service ${service.id} to MySQL:`, err.message);
  }

  syncToLocalJsonBackup();
  return DYNAMIC_SERVICES.get(service.id);
}

/**
 * Set or update database references for a specific service in MySQL
 * @param {string} serviceId
 * @param {Array<{ id: string, name: string, host: string, port: number }>} databases
 */
async function setServiceDatabases(serviceId, databases) {
  let svc = DYNAMIC_SERVICES.get(serviceId);
  if (!svc) {
    const builtIn = SERVICES.find((s) => s.id === serviceId);
    if (builtIn) {
      svc = { ...builtIn, isDynamic: true };
      DYNAMIC_SERVICES.set(serviceId, svc);
    }
  }

  if (svc) {
    svc.databases = Array.isArray(databases) ? databases : [];
    try {
      await query(
        `UPDATE registered_services SET databases_json = ?, updated_at = NOW() WHERE id = ?`,
        [JSON.stringify(svc.databases), serviceId]
      );
    } catch (err) {
      console.error(`[services.config] Failed to update databases for service ${serviceId} in MySQL:`, err.message);
    }

    syncToLocalJsonBackup();
    return svc;
  }
  return null;
}

/**
 * Remove all dynamic services associated with a specific serverId in MySQL and cache
 * @param {string} serverId
 */
async function removeServicesByServer(serverId) {
  try {
    await query('DELETE FROM registered_services WHERE server_id = ?', [serverId]);
  } catch (err) {
    console.error(`[services.config] Failed to delete services for server ${serverId} from MySQL:`, err.message);
  }

  for (const [id, svc] of DYNAMIC_SERVICES.entries()) {
    if (svc.serverId === serverId) {
      DYNAMIC_SERVICES.delete(id);
    }
  }
  syncToLocalJsonBackup();
}

/**
 * Update URLs of dynamic services when the parent server host changes
 * @param {string} serverId
 * @param {string} newHost
 */
async function updateServicesByServer(serverId, newHost) {
  if (!newHost) return;
  for (const [, svc] of DYNAMIC_SERVICES.entries()) {
    if (svc.serverId === serverId) {
      try {
        const u = new URL(svc.url);
        u.hostname = newHost;
        svc.url = u.toString().replace(/\/$/, '');

        await query('UPDATE registered_services SET url = ?, updated_at = NOW() WHERE id = ?', [svc.url, svc.id]);
      } catch {
        // ignore malformed URLs
      }
    }
  }
  syncToLocalJsonBackup();
}

/**
 * Lookup service by ID across all active services.
 * @param {string} id
 * @returns {ServiceConfig | undefined}
 */
function getServiceById(id) {
  return getAllActiveServices().find((s) => s.id === id);
}

module.exports = {
  SERVICES,
  getAllActiveServices,
  registerService,
  removeServicesByServer,
  updateServicesByServer,
  getServiceById,
  setServiceDatabases,
  loadDynamicServices,
  loadDynamicServicesFromDb,
};
