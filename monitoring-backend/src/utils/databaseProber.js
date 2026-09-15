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
let SshClient;
try {
  SshClient = require('ssh2').Client;
} catch {}

/**
 * Probe port via SSH forwardOut if direct TCP fails.
 * Useful when cloud firewalls block database ports from public IP.
 *
 * @param {object} server
 * @param {number} port
 * @param {number} [timeoutMs=3000]
 * @returns {Promise<boolean>}
 */
function probePortViaSsh(server, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (!SshClient || !server || !server.ssh || !server.ssh.username) {
      return resolve(false);
    }

    const client = new SshClient();
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        try { client.end(); } catch {}
        resolve(false);
      }
    }, timeoutMs);

    client.once('ready', () => {
      client.forwardOut('127.0.0.1', 12345, '127.0.0.1', port, (err, stream) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          try { if (stream) stream.end(); } catch {}
          try { client.end(); } catch {}
          resolve(!err);
        }
      });
    });

    client.once('error', () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(false);
      }
    });

    try {
      const connectConfig = {
        host: server.host,
        port: server.port || 22,
        username: server.ssh.username,
        readyTimeout: 3000,
      };
      if (server.ssh.privateKey) {
        connectConfig.privateKey = server.ssh.privateKey;
        if (server.ssh.password) connectConfig.passphrase = server.ssh.password;
      } else if (server.ssh.password) {
        connectConfig.password = server.ssh.password;
      }
      client.connect(connectConfig);
    } catch {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(false);
      }
    }
  });
}

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
 * @param {{ id: string, name: string, host: string, port: number, server?: object }} db
 * @returns {Promise<DatabaseProbeResult>}
 */
async function probeDatabase(db) {
  const start = Date.now();
  let up = await probePort(db.host, db.port, 1500);
  let latencyMs = up ? Date.now() - start : null;

  // If public TCP failed, fallback to probing through SSH if server credentials are available
  if (!up && db.server) {
    const sshStart = Date.now();
    up = await probePortViaSsh(db.server, db.port, 3000);
    if (up) {
      latencyMs = Date.now() - sshStart;
    }
  }

  return {
    id: db.id,
    name: db.name,
    containerName: db.containerName,
    host: db.host,
    port: db.port,
    status: up ? 'UP' : 'DOWN',
    latencyMs,
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
