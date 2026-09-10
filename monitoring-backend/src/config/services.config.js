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

/** @type {ServiceConfig[]} */
const SERVICES = [
  {
    id: 'ai-consultation',
    name: process.env.SERVICE_AI_CONSULTATION_NAME || 'AI Consultation Service',
    url: process.env.SERVICE_AI_CONSULTATION_URL || 'http://localhost:4006',
    metricsPath: METRICS_PATH,
    stack: 'nodejs',
    description: 'AI-powered consultation lifecycle, transcript persistence, audit publication',
  },
  {
    id: 'audit',
    name: process.env.SERVICE_AUDIT_NAME || 'Audit Service',
    url: process.env.SERVICE_AUDIT_URL || 'http://localhost:4005',
    metricsPath: METRICS_PATH,
    stack: 'go',
    description: 'Audit event consumer — persists activity events from Kafka',
  },
  {
    id: 'health-profile',
    name: process.env.SERVICE_HEALTH_PROFILE_NAME || 'Health Profile Service',
    url: process.env.SERVICE_HEALTH_PROFILE_URL || 'http://localhost:3001',
    metricsPath: METRICS_PATH,
    stack: 'nodejs',
    description: 'Owns BPJS participant health profile data and biometric enrollment',
  },
  {
    id: 'identity',
    name: process.env.SERVICE_IDENTITY_NAME || 'Identity Service',
    url: process.env.SERVICE_IDENTITY_URL || 'http://localhost:8081',
    metricsPath: METRICS_PATH,
    stack: 'go',
    description: 'Authentication, JWT issuance, user identity management',
  },
  {
    id: 'lifestyle',
    name: process.env.SERVICE_LIFESTYLE_NAME || 'Lifestyle Service',
    url: process.env.SERVICE_LIFESTYLE_URL || 'http://localhost:4007',
    metricsPath: METRICS_PATH,
    stack: 'nodejs',
    description: 'Exercise catalog, completion tracking, women\'s health cycle data',
  },
  {
    id: 'live-consult',
    name: process.env.SERVICE_LIVE_CONSULT_NAME || 'Live Consult Service',
    url: process.env.SERVICE_LIVE_CONSULT_URL || 'http://localhost:4004',
    metricsPath: METRICS_PATH,
    stack: 'go',
    description: 'Real-time WebSocket consultation sessions between patients and doctors',
  },
  {
    id: 'medical-record',
    name: process.env.SERVICE_MEDICAL_RECORD_NAME || 'Medical Record Service',
    url: process.env.SERVICE_MEDICAL_RECORD_URL || 'http://localhost:3002',
    metricsPath: METRICS_PATH,
    stack: 'nodejs',
    description: 'System of record for patient medical history and Elasticsearch indexing',
  },
];

/** @type {Map<string, ServiceConfig>} */
const DYNAMIC_SERVICES = new Map();

/**
 * Get all active services (both built-in and dynamically discovered).
 * @returns {ServiceConfig[]}
 */
function getAllActiveServices() {
  const mergedMap = new Map();
  for (const svc of SERVICES) {
    mergedMap.set(svc.id, svc);
  }
  for (const [id, svc] of DYNAMIC_SERVICES.entries()) {
    mergedMap.set(id, svc);
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

