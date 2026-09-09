'use strict';

/**
 * config/servers.config.js
 *
 * Defines logical "Server" groups — each server hosts one or more microservices.
 *
 * ── CO-LOCATION RULES ────────────────────────────────────────────────────────
 *
 * Services CAN share a server when:
 *  1. They share the same database technology (avoids network hop for DB access).
 *  2. Their combined resource footprint is within server capacity.
 *  3. They have compatible runtime stacks (same language/runtime = simpler ops).
 *  4. They have high inter-service call frequency (reducing internal latency).
 *  5. They have low/medium traffic individually (together they fill the server).
 *
 * Services CANNOT share a server when:
 *  1. One service is extremely resource-intensive (e.g., AI inference — needs dedicated GPU/CPU).
 *  2. A service is security-critical and must be network-isolated (e.g., Identity/Auth).
 *  3. A service has unpredictable traffic spikes that could starve co-tenants.
 *  4. Services have conflicting port or runtime requirements.
 *  5. SLA requirements differ: a critical service should not share fate with a lower-priority one.
 *
 * ── CURRENT GROUPING RATIONALE ───────────────────────────────────────────────
 *
 *  Server Alpha (Authentication & Data Layer)
 *    - identity-service     : Auth/JWT — Go, PostgreSQL, Redis. Low-medium CPU. Security boundary owner.
 *    - health-profile-service: Node.js, PostgreSQL. Shares DB with identity (same PG instance).
 *    - audit-service        : Go, event-driven (Kafka consumer). Very low CPU, DB writes only.
 *    WHY TOGETHER: All three use PostgreSQL + Redis. Low combined resource usage.
 *                  Audit service is stateless and adds negligible load.
 *
 *  Server Beta (Real-time & Heavy Computation)
 *    - live-consult-service    : Go, WebSocket-heavy. Needs dedicated network bandwidth.
 *    - ai-consultation-service : Node.js, AI inference. High CPU/memory burst.
 *    - medical-record-service  : Node.js, MongoDB + Elasticsearch. High I/O.
 *    - lifestyle-service       : Node.js, MongoDB. Low CPU, high read traffic.
 *    WHY TOGETHER: All use MongoDB. Note: ai-consultation should ideally be isolated;
 *                  it is co-located here as a staging trade-off (insufficient servers).
 *                  In production, ai-consultation SHOULD have its own server.
 */

require('dotenv').config();

/** @type {ServerConfig[]} */
const SERVERS = [
  {
    id: 'server-alpha',
    name: 'server-alpha',
    displayName: 'Server Alpha',
    description: 'Authentication, health data & audit layer',
    host: process.env.SERVER_ALPHA_HOST || '10.0.1.10',
    agentUrl: process.env.SERVER_ALPHA_AGENT_URL || null,
    spec: {
      cores: 32,
      totalMemoryMb: 65536,
      usedMemoryMb: 22350,
      totalDiskGb: 1024,
      usedDiskGb: 312.4,
      cpuUsagePercent: 22.4,
      uptimeSeconds: 1234567,
      uptimeFormatted: '14d 06h',
      os: 'Ubuntu 22.04 LTS (Docker Host)',
    },
    serviceIds: ['identity', 'health-profile', 'audit'],
    databases: [
      {
        id: 'postgres',
        name: 'PostgreSQL',
        host: process.env.DB_POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.DB_POSTGRES_PORT || '5432', 10),
      },
      {
        id: 'redis',
        name: 'Redis',
        host: process.env.DB_REDIS_HOST || 'localhost',
        port: parseInt(process.env.DB_REDIS_PORT || '6379', 10),
      },
    ],
    colocation: {
      canShare: [
        'All three services use the same PostgreSQL + Redis instance — no extra network hop.',
        'Combined resource usage is low-medium, well within a single server\'s capacity.',
        'Audit service is stateless (Kafka consumer), adding minimal load.',
        'Identity and Health Profile share user-related data models, benefiting from locality.',
      ],
      cannotShare: [
        'AI Consultation is excluded — it has CPU/memory bursts that would starve auth latency.',
        'Live Consult is excluded — its WebSocket connections need dedicated bandwidth.',
        'Medical Record is excluded — its Elasticsearch indexing causes I/O spikes.',
      ],
    },
  },
  {
    id: 'server-beta',
    name: 'server-beta',
    displayName: 'Server Beta',
    description: 'Real-time consultations, AI & medical data services',
    host: process.env.SERVER_BETA_HOST || '10.0.1.20',
    agentUrl: process.env.SERVER_BETA_AGENT_URL || null,
    spec: {
      cores: 64,
      totalMemoryMb: 131072,
      usedMemoryMb: 86400,
      totalDiskGb: 2048,
      usedDiskGb: 1184.2,
      cpuUsagePercent: 58.7,
      uptimeSeconds: 2456789,
      uptimeFormatted: '28d 10h',
      os: 'Ubuntu 22.04 LTS (Docker Compute Host)',
    },
    serviceIds: ['ai-consultation', 'live-consult', 'medical-record', 'lifestyle'],
    databases: [
      {
        id: 'mongodb',
        name: 'MongoDB',
        host: process.env.DB_MONGO_HOST || 'localhost',
        port: parseInt(process.env.DB_MONGO_PORT || '27017', 10),
      },
      {
        id: 'elasticsearch',
        name: 'Elasticsearch',
        host: process.env.DB_ES_HOST || 'localhost',
        port: parseInt(process.env.DB_ES_PORT || '9200', 10),
      },
    ],
    colocation: {
      canShare: [
        'All four services use MongoDB as primary store — shared DB instance reduces infra cost.',
        'Medical Record and AI Consultation share patient data context, benefiting from locality.',
        'Lifestyle service has predictable, low CPU usage — does not compete with others.',
        'Live Consult and AI Consultation are functionally coupled (AI assists live sessions).',
      ],
      cannotShare: [
        'In production, AI Consultation should be on its own server (GPU-optimised instance).',
        'Identity/Auth is excluded — security isolation is mandatory for auth services.',
        'Audit service is excluded — it belongs to the PostgreSQL cluster on Server Alpha.',
      ],
    },
  },
];

const CUSTOM_SERVERS = [];

/**
 * @returns {ServerConfig[]}
 */
function getAllServers() {
  return [...SERVERS, ...CUSTOM_SERVERS];
}

/**
 * @param {string} id
 * @returns {ServerConfig|undefined}
 */
function getServerById(id) {
  return getAllServers().find((s) => s.id === id);
}

/**
 * @param {ServerConfig} server
 * @returns {ServerConfig}
 */
function registerServer(server) {
  const existingIdx = CUSTOM_SERVERS.findIndex((s) => s.id === server.id);
  if (existingIdx >= 0) {
    CUSTOM_SERVERS[existingIdx] = server;
  } else {
    CUSTOM_SERVERS.push(server);
  }
  return server;
}

module.exports = { SERVERS, getAllServers, getServerById, registerServer };

/**
 * @typedef {Object} DatabaseConfig
 * @property {string} id
 * @property {string} name
 * @property {string} host
 * @property {number} port
 */

/**
 * @typedef {Object} ColocationRules
 * @property {string[]} canShare
 * @property {string[]} cannotShare
 */

/**
 * @typedef {Object} ServerConfig
 * @property {string} id
 * @property {string} name
 * @property {string} displayName
 * @property {string} description
 * @property {string} host
 * @property {string|null} agentUrl
 * @property {string[]} serviceIds
 * @property {DatabaseConfig[]} databases
 * @property {ColocationRules} colocation
 */
