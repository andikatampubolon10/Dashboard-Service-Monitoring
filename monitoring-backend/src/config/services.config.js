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
  {
    id: 'ai-consultation',
    name: process.env.SERVICE_AI_CONSULTATION_NAME || 'AI Consultation Service',
    url: process.env.SERVICE_AI_CONSULTATION_URL || `http://${REMOTE_HOST}:4006`,
    metricsPath: METRICS_PATH,
    stack: 'nodejs',
    description: 'AI-powered consultation lifecycle, transcript persistence, audit publication',
    ...resolveServerMeta(process.env.SERVICE_AI_CONSULTATION_URL || `http://${REMOTE_HOST}:4006`),
  },
  {
    id: 'health-profile',
    name: process.env.SERVICE_HEALTH_PROFILE_NAME || 'Health Profile Service',
    url: process.env.SERVICE_HEALTH_PROFILE_URL || `http://${REMOTE_HOST}:3001`,
    metricsPath: METRICS_PATH,
    stack: 'nodejs',
    description: 'Owns BPJS participant health profile data and biometric enrollment',
    ...resolveServerMeta(process.env.SERVICE_HEALTH_PROFILE_URL || `http://${REMOTE_HOST}:3001`),
  },
  {
    id: 'node-exporter',
    name: process.env.SERVICE_NODE_EXPORTER_NAME || 'Node Exporter',
    url: process.env.SERVICE_NODE_EXPORTER_URL || `http://${REMOTE_HOST}:9100`,
    metricsPath: METRICS_PATH,
    stack: 'go',
    description: 'Host telemetry & hardware exporter (CPU, RAM, Disk, System load)',
    ...resolveServerMeta(process.env.SERVICE_NODE_EXPORTER_URL || `http://${REMOTE_HOST}:9100`),
  },
  {
    id: 'audit',
    name: process.env.SERVICE_AUDIT_NAME || 'Audit Service',
    url: process.env.SERVICE_AUDIT_URL || 'http://localhost:4005',
    metricsPath: METRICS_PATH,
    stack: 'go',
    description: 'Audit event consumer — persists activity events from Kafka',
    ...resolveServerMeta(process.env.SERVICE_AUDIT_URL || 'http://localhost:4005'),
  },
  {
    id: 'identity',
    name: process.env.SERVICE_IDENTITY_NAME || 'Identity Service',
    url: process.env.SERVICE_IDENTITY_URL || 'http://localhost:8081',
    metricsPath: METRICS_PATH,
    stack: 'go',
    description: 'Authentication, JWT issuance, user identity management',
    ...resolveServerMeta(process.env.SERVICE_IDENTITY_URL || 'http://localhost:8080'),
  },
  {
    id: 'lifestyle',
    name: process.env.SERVICE_LIFESTYLE_NAME || 'Lifestyle Service',
    url: process.env.SERVICE_LIFESTYLE_URL || 'http://localhost:4007',
    metricsPath: METRICS_PATH,
    stack: 'nodejs',
    description: 'Exercise catalog, completion tracking, women\'s health cycle data',
    ...resolveServerMeta(process.env.SERVICE_LIFESTYLE_URL || 'http://localhost:4007'),
  },
  {
    id: 'live-consult',
    name: process.env.SERVICE_LIVE_CONSULT_NAME || 'Live Consult Service',
    url: process.env.SERVICE_LIVE_CONSULT_URL || 'http://localhost:4004',
    metricsPath: METRICS_PATH,
    stack: 'go',
    description: 'Real-time WebSocket consultation sessions between patients and doctors',
    ...resolveServerMeta(process.env.SERVICE_LIVE_CONSULT_URL || 'http://localhost:4004'),
  },
  {
    id: 'medical-record',
    name: process.env.SERVICE_MEDICAL_RECORD_NAME || 'Medical Record Service',
    url: process.env.SERVICE_MEDICAL_RECORD_URL || 'http://localhost:3002',
    metricsPath: METRICS_PATH,
    stack: 'nodejs',
    description: 'System of record for patient medical history and Elasticsearch indexing',
    ...resolveServerMeta(process.env.SERVICE_MEDICAL_RECORD_URL || 'http://localhost:3002'),
  },
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
    isDynamic: true,
  });
  saveDynamicServices();
  return DYNAMIC_SERVICES.get(service.id);
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

