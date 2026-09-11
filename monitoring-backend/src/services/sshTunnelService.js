'use strict';

/**
 * services/sshTunnelService.js
 *
 * Industrial-grade SSH Port Forwarding Tunnel for Remote Servers (AWS EC2 / VPS).
 * Creates local TCP proxy endpoints (127.0.0.1:localPort) mapped through SSH forwardOut
 * to target remote ports (e.g. 127.0.0.1:remotePort inside EC2).
 * 
 * Benefits:
 *  1. Bypasses public internet port blocks by local ISPs (IndiHome, Telkomsel, FirstMedia, etc.)
 *  2. No need to expose sensitive microservice / database ports to public internet (0.0.0.0/0).
 *  3. Fully automatic: prometheusCollector scrapes local tunnel, traffic flows inside encrypted SSH.
 */

const net = require('net');
const { Client: SshClient } = require('ssh2');

/** Map of serviceId -> local tunnel baseUrl (e.g. "http://127.0.0.1:41234") */
const serviceTunnelMap = new Map();

/** Map of serverId -> active SSH client & active local TCP servers */
const activeTunnels = new Map();

/**
 * Get active tunnel URL for a service (if mapped)
 * @param {string} serviceId
 * @returns {string|null}
 */
function getTunnelUrl(serviceId) {
  return serviceTunnelMap.get(serviceId) || null;
}

/**
 * Establish SSH tunnel for all services belonging to an SSH-managed server
 * @param {object} server
 * @param {Array<object>} [servicesList]
 */
function initServerTunnel(server, servicesList = []) {
  if (!server || !server.ssh || !server.ssh.username) {
    return;
  }

  // Teardown existing tunnel for this server if present
  teardownServerTunnel(server.id);

  const { host } = server;
  const sshPort = server.ssh.port || 22;
  const { username, password, privateKey } = server.ssh;

  const client = new SshClient();
  const managedServers = [];

  client.on('ready', () => {
    console.log(`[sshTunnel] ✅ SSH Session ready for server "${server.name}" (${host}:${sshPort})`);

    // Identify services belonging to this server
    const targetServices = servicesList.length > 0
      ? servicesList
      : (server.services || []);

    // Also parse from server.serviceIds if needed
    for (const svc of targetServices) {
      if (!svc || !svc.id) continue;

      // Extract remote port from service.url or svc.port
      let remotePort = svc.port;
      if (!remotePort && svc.url) {
        const m = svc.url.match(/:(\d{2,5})\b/);
        if (m) remotePort = parseInt(m[1], 10);
      }
      if (!remotePort) remotePort = 8080;

      // Create a local TCP proxy for this remote port
      const localServer = net.createServer((socket) => {
        client.forwardOut('127.0.0.1', socket.remotePort, '127.0.0.1', remotePort, (err, stream) => {
          if (err) {
            socket.destroy();
            return;
          }
          socket.pipe(stream).pipe(socket);
        });
      });

      localServer.listen(0, '127.0.0.1', () => {
        const localPort = localServer.address().port;
        const localBaseUrl = `http://127.0.0.1:${localPort}`;
        serviceTunnelMap.set(svc.id, localBaseUrl);
        managedServers.push(localServer);
        console.log(`[sshTunnel] 🚀 Tunnel active: [${svc.name || svc.id}] 127.0.0.1:${localPort} ➔ ${host}:${remotePort} (via SSH)`);
      });

      localServer.on('error', (err) => {
        console.warn(`[sshTunnel] Proxy server error for ${svc.id}:`, err.message);
      });
    }

    activeTunnels.set(server.id, { client, localServers: managedServers });
  });

  client.on('error', (err) => {
    console.warn(`[sshTunnel] SSH connection error for "${server.name}":`, err.message);
  });

  client.on('close', () => {
    console.log(`[sshTunnel] SSH connection closed for "${server.name}". Reconnecting in 10s...`);
    teardownServerTunnel(server.id);
    setTimeout(() => {
      initServerTunnel(server, servicesList);
    }, 10000);
  });

  const connectConfig = {
    host,
    port: sshPort,
    username,
    readyTimeout: 15000,
    keepaliveInterval: 10000,
    keepaliveCountMax: 3,
  };
  if (password) connectConfig.password = password;
  if (privateKey) connectConfig.privateKey = privateKey;

  client.connect(connectConfig);
}

/**
 * Teardown SSH tunnel and close local proxy ports
 * @param {string} serverId
 */
function teardownServerTunnel(serverId) {
  const tunnel = activeTunnels.get(serverId);
  if (tunnel) {
    if (Array.isArray(tunnel.localServers)) {
      for (const s of tunnel.localServers) {
        try { s.close(); } catch {}
      }
    }
    if (tunnel.client) {
      try { tunnel.client.end(); } catch {}
    }
    activeTunnels.delete(serverId);
  }
}

/**
 * Initialize tunnels for all registered servers that have SSH credentials
 * @param {Array<object>} servers
 * @param {Function} getAllServicesFn
 */
function initAllTunnels(servers = [], getAllServicesFn) {
  if (!Array.isArray(servers)) return;
  const allServices = typeof getAllServicesFn === 'function' ? getAllServicesFn() : [];

  for (const server of servers) {
    if (server.ssh && server.ssh.username) {
      const serverServices = allServices.filter((s) => s.serverId === server.id);
      initServerTunnel(server, serverServices);
    }
  }
}

module.exports = {
  getTunnelUrl,
  initServerTunnel,
  teardownServerTunnel,
  initAllTunnels,
};
