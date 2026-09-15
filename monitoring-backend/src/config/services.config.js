'use strict';

/**
 * Service Registry
 * Semua 7 microservice yang dimonitor, dibaca dari environment variables.
 * Default port sudah sesuai dengan konfigurasi masing-masing service.
 *
 * Port conflicts:
 *  - audit-service dan lifestyle-service keduanya default ke 4005.
 *    Lifestyle-service dikonfigurasi ke 4007 di .env (override via env).
 */

require('dotenv').config();

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
const SERVICES = [
  
];

const fs = require('fs');
const path = require('path');

const DYNAMIC_SERVICES_FILE = path.join(__dirname, '../../data/dynamic_services.json');
const REGISTERED_SERVERS_FILE = path.join(__dirname, '../../data/registered_servers.json');

/** @type {Map<string, ServiceConfig>} */
const DYNAMIC_SERVICES = new Map();

/**
 * Persist dynamic services to disk.
 */
function saveDynamicServices() {
  try {
    const list = Array.from(DYNAMIC_SERVICES.values());
    fs.writeFileSync(DYNAMIC_SERVICES_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('[services.config] Failed to save dynamic services:', err.message);
  }
}

/**
 * Load dynamic services from disk or self-heal from registered_servers.json.
 */
function loadDynamicServices() {
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
    console.error('[services.config] Failed to load dynamic services:', err.message);
  }

  // Self-heal / restore from registered_servers.json if dynamic services file is missing any
  try {
    if (fs.existsSync(REGISTERED_SERVERS_FILE)) {
      const raw = fs.readFileSync(REGISTERED_SERVERS_FILE, 'utf-8');
      const servers = JSON.parse(raw);
      if (Array.isArray(servers)) {
        let changed = false;
        for (const s of servers) {
          if (Array.isArray(s.serviceIds)) {
            for (const sid of s.serviceIds) {
              if (!DYNAMIC_SERVICES.has(sid)) {
                let port = 8080;
                let stack = 'nodejs';
                let svcName = sid;
                if (sid.startsWith('ai-consultation')) {
                  port = 4006;
                  stack = 'nodejs';
                  svcName = `AI Consultation (${s.name || s.host})`;
                } else if (sid.startsWith('health-profile')) {
                  port = 3001;
                  stack = 'nodejs';
                  svcName = `Health Profile (${s.name || s.host})`;
                } else if (sid.startsWith('node-exporter')) {
                  port = 9100;
                  stack = 'go';
                  svcName = `Node Exporter (${s.name || s.host})`;
                } else if (sid.startsWith('audit')) {
                  port = 4005;
                  stack = 'go';
                  svcName = `Audit Service (${s.name || s.host})`;
                } else if (sid.startsWith('lifestyle')) {
                  port = 4007;
                  stack = 'nodejs';
                  svcName = `Lifestyle Service (${s.name || s.host})`;
                } else if (sid.startsWith('live-consult')) {
                  port = 4004;
                  stack = 'go';
                  svcName = `Live Consult (${s.name || s.host})`;
                } else if (sid.startsWith('medical-record')) {
                  port = 3002;
                  stack = 'nodejs';
                  svcName = `Medical Record (${s.name || s.host})`;
                }

                DYNAMIC_SERVICES.set(sid, {
                  id: sid,
                  name: svcName,
                  url: `http://${s.host}:${port}`,
                  metricsPath: '/metrics',
                  stack,
                  description: `Discovered service on ${s.name || s.host} (${s.host}:${port})`,
                  serverId: s.id,
                  isDynamic: true,
                });
                changed = true;
              }
            }
          }
        }
        if (changed) {
          saveDynamicServices();
        }
      }
    }
  } catch (err) {
    console.error('[services.config] Self-heal check error:', err.message);
  }
}

// Immediately load on startup
loadDynamicServices();

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
 * Register or update a service dynamically (e.g. from remote laptop discovery).
 * @param {ServiceConfig & { serverId?: string }} service
 */
function registerService(service) {
  DYNAMIC_SERVICES.set(service.id, {
    id: service.id,
    name: service.name || service.id,
    url: service.url,
    metricsPath: service.metricsPath || '/metrics',
    stack: service.stack || 'nodejs',
    description: service.description || `Discovered service at ${service.url}`,
    serverId: service.serverId,
    databases: Array.isArray(service.databases) ? service.databases : undefined,
    isDynamic: true,
  });
  saveDynamicServices();
  return DYNAMIC_SERVICES.get(service.id);
}

/**
 * Set or update database references for a specific service.
 * @param {string} serviceId
 * @param {Array<{ id: string, name: string, host: string, port: number }>} databases
 */
function setServiceDatabases(serviceId, databases) {
  let svc = DYNAMIC_SERVICES.get(serviceId);
  if (!svc) {
    // If it's a built-in service, promote it to DYNAMIC_SERVICES with overridden databases
    const builtIn = SERVICES.find((s) => s.id === serviceId);
    if (builtIn) {
      svc = { ...builtIn, isDynamic: true };
      DYNAMIC_SERVICES.set(serviceId, svc);
    }
  }

  if (svc) {
    svc.databases = Array.isArray(databases) ? databases : [];
    saveDynamicServices();
    return svc;
  }
  return null;
}

/**
 * Remove all dynamic services associated with a specific serverId.
 * @param {string} serverId
 */
function removeServicesByServer(serverId) {
  for (const [id, svc] of DYNAMIC_SERVICES.entries()) {
    if (svc.serverId === serverId) {
      DYNAMIC_SERVICES.delete(id);
    }
  }
  saveDynamicServices();
}

/**
 * Update URLs of dynamic services when the parent server host changes.
 * @param {string} serverId
 * @param {string} newHost
 */
function updateServicesByServer(serverId, newHost) {
  if (!newHost) return;
  for (const [, svc] of DYNAMIC_SERVICES.entries()) {
    if (svc.serverId === serverId) {
      try {
        const u = new URL(svc.url);
        u.hostname = newHost;
        svc.url = u.toString().replace(/\/$/, '');
      } catch {
        // ignore malformed URLs
      }
    }
  }
  saveDynamicServices();
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
};

/**
 * @typedef {Object} ServiceConfig
 * @property {string} id - Unique service identifier (slug)
 * @property {string} name - Human-readable display name
 * @property {string} url - Base URL (e.g. http://localhost:4006)
 * @property {string} metricsPath - Path to Prometheus metrics endpoint
 * @property {'nodejs'|'go'} stack - Runtime stack
 * @property {string} description - Short service description
 * @property {string} [serverId] - Server ID hosting this service
 * @property {boolean} [isDynamic] - True if discovered at runtime
 */

