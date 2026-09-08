'use strict';

/**
 * utils/databaseProber.js
 *
 * Lightweight TCP-based database health checker.
 * Does NOT require credentials — simply attempts to open a TCP socket
 * to the configured host:port. If the connection succeeds → UP, else → DOWN.
 *
 * Works for any TCP-based service: PostgreSQL, Redis, MongoDB, Elasticsearch, MySQL, etc.
 */

const net = require('net');

/**
 * Probe a single host:port via TCP.
 *
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutMs=2000]
 * @returns {Promise<boolean>} true = reachable, false = down/timeout
 */
function probePort(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (up) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(up);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));

    try {
      socket.connect(port, host);
    } catch {
      finish(false);
    }
  });
}

/**
 * Probe a single database config object.
 *
 * @param {{ id: string, name: string, host: string, port: number }} db
 * @returns {Promise<DatabaseProbeResult>}
 */
async function probeDatabase(db) {
  const start = Date.now();
  const up = await probePort(db.host, db.port);
  return {
    id: db.id,
    name: db.name,
    host: db.host,
    port: db.port,
    status: up ? 'UP' : 'DOWN',
    latencyMs: up ? Date.now() - start : null,
  };
}

/**
 * Probe an array of databases concurrently.
 *
 * @param {Array<{ id: string, name: string, host: string, port: number }>} databases
 * @returns {Promise<DatabaseProbeResult[]>}
 */
function probeDatabases(databases) {
  return Promise.all(databases.map(probeDatabase));
}

module.exports = { probePort, probeDatabase, probeDatabases };

/**
 * @typedef {Object} DatabaseProbeResult
 * @property {string} id
 * @property {string} name
 * @property {string} host
 * @property {number} port
 * @property {'UP'|'DOWN'} status
 * @property {number|null} latencyMs
 */
