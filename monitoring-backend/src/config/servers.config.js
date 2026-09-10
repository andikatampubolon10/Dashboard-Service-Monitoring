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

const fs = require('fs');
const path = require('path');

const STORAGE_FILE = path.join(__dirname, '../../data/registered_servers.json');

/** @type {ServerConfig[]} */
const SERVERS = [];

let CUSTOM_SERVERS = [];

function loadPersistedServers() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        CUSTOM_SERVERS = data;
      }
    }
  } catch (err) {
    console.warn('[servers.config] Failed to load persisted servers:', err.message);
  }
}

function savePersistedServers() {
  try {
    const dir = path.dirname(STORAGE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(CUSTOM_SERVERS, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[servers.config] Failed to save persisted servers:', err.message);
  }
}

// Load on startup
loadPersistedServers();

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
  savePersistedServers();
  return server;
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function removeServer(id) {
  const customIdx = CUSTOM_SERVERS.findIndex((s) => s.id === id);
  if (customIdx >= 0) {
    CUSTOM_SERVERS.splice(customIdx, 1);
    savePersistedServers();
    return true;
  }
  const defaultIdx = SERVERS.findIndex((s) => s.id === id);
  if (defaultIdx >= 0) {
    SERVERS.splice(defaultIdx, 1);
    savePersistedServers();
    return true;
  }
  return false;
}

/**
 * @param {string} id
 * @param {Partial<ServerConfig>} updates
 * @returns {ServerConfig|null}
 */
function updateServer(id, updates) {
  const target = getServerById(id);
  if (!target) return null;

  if (updates.name && updates.name.trim()) {
    target.name = updates.name.trim();
    target.displayName = updates.displayName ? updates.displayName.trim() : target.name;
  }
  if (updates.displayName && updates.displayName.trim()) {
    target.displayName = updates.displayName.trim();
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

  savePersistedServers();
  return target;
}

module.exports = { SERVERS, getAllServers, getServerById, registerServer, removeServer, updateServer };

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
