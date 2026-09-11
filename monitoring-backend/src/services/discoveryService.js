'use strict';

/**
 * discoveryService.js
 *
 * Remote Host & Microservice Discovery Engine.
 * Supports:
 *  1. Direct HTTP Port Probe (No-SSH) — Scans candidate ports, tests /metrics, fingerprints service.
 *  2. SSH Remote Inspection (WSL / Linux) — Connects via SSH to query hardware (/proc/meminfo, nproc),
 *     listening ports (ss/netstat), and inspects running containers/microservices.
 */

const net = require('net');
const axios = require('axios');
const { Client: SshClient } = require('ssh2');

// Empty catalogue for backward-compatibility with external callers
const KNOWN_SERVICES = [];

const DEFAULT_PROBE_PORTS = [8080, 8081, 3000, 3001, 3002, 4000, 4001, 4004, 4005, 4006, 4007, 5000, 8000, 8001, 8888, 9000, 9090, 9100];

// Standard database signatures for dynamic detection
const KNOWN_DB_PORTS = [
  { port: 5432, id: 'postgresql', name: 'PostgreSQL', pattern: /postgres/i },
  { port: 6379, id: 'redis', name: 'Redis', pattern: /redis/i },
  { port: 3306, id: 'mysql', name: 'MySQL / MariaDB', pattern: /mysql|mariadb/i },
  { port: 27017, id: 'mongodb', name: 'MongoDB', pattern: /mongo/i },
  { port: 9200, id: 'elasticsearch', name: 'Elasticsearch', pattern: /elastic/i },
];

/**
 * Test TCP reachability of a single host:port
 * @param {string} host
 * @param {number} port
 * @param {number} timeoutMs
 * @returns {Promise<{ open: boolean, latencyMs: number }>}
 */
function probeTcpPort(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let isResolved = false;

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      if (!isResolved) {
        isResolved = true;
        const latencyMs = Date.now() - start;
        socket.destroy();
        resolve({ open: true, latencyMs });
      }
    });

    socket.on('timeout', () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({ open: false, latencyMs: timeoutMs });
      }
    });

    socket.on('error', () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({ open: false, latencyMs: Date.now() - start });
      }
    });

    try {
      socket.connect(port, host);
    } catch {
      if (!isResolved) {
        isResolved = true;
        resolve({ open: false, latencyMs: 0 });
      }
    }
  });
}

/**
 * Detect runtime stack from live telemetry response
 * @param {string} text
 * @returns {'go' | 'nodejs' | 'python' | 'java'}
 */
function detectRuntimeStack(text = '') {
  const lower = (text || '').toLowerCase();
  if (
    lower.includes('go_goroutines') ||
    lower.includes('go_threads') ||
    lower.includes('promhttp_') ||
    lower.includes('go_gc_') ||
    lower.includes('go_info')
  ) {
    return 'go';
  }
  if (lower.includes('python_info') || lower.includes('python_gc_')) {
    return 'python';
  }
  if (lower.includes('jvm_') || lower.includes('java_lang_')) {
    return 'java';
  }
  if (lower.includes('nodejs_') || lower.includes('process_cpu_seconds_total')) {
    return 'nodejs';
  }
  return 'nodejs';
}

/**
 * Helper to clean and format a raw name into Title Case
 * e.g. "identity-service" -> "Identity Service"
 * e.g. "my_custom_api" -> "My Custom Api"
 */
function formatServiceName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/[-_]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Dynamically extract a custom metric namespace prefix from Prometheus text
 * e.g. # HELP bpjs_active_sessions -> "bpjs"
 * e.g. # HELP invoice_paid_total -> "invoice"
 * e.g. # HELP order_items_count -> "order"
 * Ignores standard runtime prefixes (go, nodejs, process, jvm, python, http, etc.)
 */
function extractMetricNamespace(bodyText = '') {
  if (!bodyText) return null;
  const lines = bodyText.split('\n');
  const STANDARD_PREFIXES = new Set([
    'go', 'nodejs', 'process', 'jvm', 'python', 'http', 'promhttp', 'net', 'scrape', 'node', 'system'
  ]);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# HELP ') || trimmed.startsWith('# TYPE ')) {
      const metricName = trimmed.split(/\s+/)[2];
      if (metricName) {
        const parts = metricName.split('_');
        const prefix = parts[0]?.toLowerCase();
        if (prefix && !STANDARD_PREFIXES.has(prefix) && prefix.length >= 2) {
          if (parts.length >= 2 && ['session', 'consultation', 'profile', 'record', 'auth', 'user', 'order', 'payment', 'api', 'event', 'sync'].includes(parts[1]?.toLowerCase())) {
            return `${parts[0]}_${parts[1]}`;
          }
          return parts[0];
        }
      }
    }
  }
  return null;
}

/**
 * PURE DYNAMIC Service Identification
 * Completely independent of any hardcoded catalogue or pre-registered service list.
 * Autonomously deduces identity from:
 * 1. Docker container / process name
 * 2. /health or /info JSON self-identification
 * 3. Prometheus metric labels (app="...", service="...", job="...")
 * 4. Distinctive domain metric namespace prefix
 * 5. Live runtime stack (Go / Node.js / Python / Java)
 * 6. Neutral dynamic fallback: "Service on Port ${port}"
 *
 * @param {number} port
 * @param {string} bodyText - Raw Prometheus text or HTTP response body
 * @param {string} [containerName] - Container name from docker ps / process
 * @param {object|null} [healthData] - Parsed JSON from /health or /info
 * @returns {{ id: string, name: string, defaultPort: number, stack: string, description: string }}
 */
function identifyService(port, bodyText = '', containerName = '', healthData = null) {
  const lowerBody = (bodyText || '').toLowerCase();
  const stack = detectRuntimeStack(bodyText);

  // 1. Prometheus Node Exporter check
  if (lowerBody.includes('node_cpu_seconds_total') || lowerBody.includes('node_memory_memtotal_bytes')) {
    return {
      id: 'node-exporter',
      name: 'Node Exporter',
      defaultPort: port,
      stack: 'go',
      description: 'Prometheus Node Exporter system hardware telemetry agent',
    };
  }

  // 2. Extract identity from Container Name (Docker / Process)
  if (containerName && containerName.trim()) {
    let clean = containerName.trim()
      .replace(/-\d+$/, '')             // strip trailing -1, -2
      .replace(/-app(-\d+)?$/, '')       // strip -app, -app-1
      .replace(/^inaai-/, '');          // strip project prefix

    const serviceMatch = clean.match(/^([a-z0-9-]+-service)/i);
    if (serviceMatch) {
      clean = serviceMatch[1];
    }

    const id = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let displayName = formatServiceName(clean);
    if (!displayName.toLowerCase().includes('service')) {
      displayName += ' Service';
    }

    return {
      id,
      name: displayName,
      defaultPort: port,
      stack,
      description: `Container: ${containerName}`,
    };
  }

  // 3. Extract identity from /health or /info JSON self-identification
  if (healthData && typeof healthData === 'object') {
    const rawName = healthData.service || healthData.name || healthData.app || healthData.appName || healthData.title;
    if (rawName && typeof rawName === 'string') {
      const id = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      let displayName = formatServiceName(rawName);
      if (!displayName.toLowerCase().includes('service')) {
        displayName += ' Service';
      }
      return {
        id,
        name: displayName,
        defaultPort: port,
        stack,
        description: `Discovered from /health endpoint (${rawName})`,
      };
    }
  }

  // 4. Extract identity from Prometheus labels
  // e.g. app="...", service="...", service_name="...", job="..."
  const labelMatch = bodyText.match(/(?:app|service|service_name|job)="([^"]+)"/i);
  if (labelMatch && labelMatch[1]) {
    const labelVal = labelMatch[1].trim();
    if (labelVal && !['node', 'prometheus', 'default', 'metrics', 'exporter'].includes(labelVal.toLowerCase())) {
      const id = labelVal.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      let displayName = formatServiceName(labelVal);
      if (!displayName.toLowerCase().includes('service')) {
        displayName += ' Service';
      }
      return {
        id,
        name: displayName,
        defaultPort: port,
        stack,
        description: `Discovered from Prometheus metric label (${labelVal})`,
      };
    }
  }

  // 5. Extract identity dynamically from domain metric namespace prefix
  const domainNamespace = extractMetricNamespace(bodyText);
  if (domainNamespace) {
    const id = domainNamespace.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let displayName = formatServiceName(domainNamespace);
    if (!displayName.toLowerCase().includes('service')) {
      displayName += ' Service';
    }
    return {
      id,
      name: displayName,
      defaultPort: port,
      stack,
      description: `Discovered from domain metrics (${domainNamespace}_*)`,
    };
  }

  // 6. Neutral Dynamic Fallback (NO port-guessing, NO hardcoded assumptions)
  return {
    id: `service-${port}`,
    name: `Service on Port ${port}`,
    defaultPort: port,
    stack,
    description: `Active listening service on port ${port}`,
  };
}

/**
 * Discover microservices on a remote host via HTTP Port Probing
 * @param {object} params
 * @param {string} params.host
 * @param {number[]} [params.candidatePorts]
 * @param {number} [params.timeoutMs]
 */
async function discoverViaHttpProbe({ host, candidatePorts = DEFAULT_PROBE_PORTS, exporterPort = 9100, timeoutMs = 2500 }) {
  const expPort = parseInt(exporterPort, 10) || 9100;
  const basePorts = Array.isArray(candidatePorts) && candidatePorts.length > 0 ? candidatePorts : DEFAULT_PROBE_PORTS;
  const uniquePorts = Array.from(new Set([...basePorts, expPort].filter((p) => p > 0 && p <= 65535)));
  const discovered = [];
  let hostSpecs = null;

  // Probe all ports in parallel
  await Promise.all(
    uniquePorts.map(async (port) => {
      const tcpResult = await probeTcpPort(host, port, 2000);
      if (!tcpResult.open) return;

      // Port is open! Try /metrics
      const targetUrl = `http://${host}:${port}`;
      try {
        const metricsRes = await axios.get(`${targetUrl}/metrics`, {
          timeout: timeoutMs,
          headers: { Accept: 'text/plain' },
          validateStatus: (s) => s < 500,
        });

        const rawText = typeof metricsRes.data === 'string' ? metricsRes.data : String(metricsRes.data || '');
        const matched = identifyService(port, rawText);

        // Check if this is node-exporter (can derive real specs!)
        if (matched.id === 'node-exporter' && rawText.includes('node_memory_MemTotal_bytes')) {
          const memMatch = rawText.match(/node_memory_MemTotal_bytes\s+([0-9e+.]+)/);
          const memAvailMatch = rawText.match(/node_memory_MemAvailable_bytes\s+([0-9e+.]+)/);
          const cpuMatches = rawText.match(/node_cpu_seconds_total\{cpu="([0-9]+)"/g);

          if (memMatch) {
            const totalBytes = parseFloat(memMatch[1]);
            const availBytes = memAvailMatch ? parseFloat(memAvailMatch[1]) : totalBytes * 0.4;
            const cores = cpuMatches ? new Set(cpuMatches.map((m) => m.match(/cpu="([0-9]+)"/)[1])).size : 16;
            hostSpecs = {
              cores: cores || 16,
              totalMemoryMb: Math.round(totalBytes / 1024 / 1024),
              usedMemoryMb: Math.round((totalBytes - availBytes) / 1024 / 1024),
              totalDiskGb: 500,
              usedDiskGb: 120,
              os: 'Linux Node (Prometheus Exporter)',
            };
          }
        }

        discovered.push({
          id: matched.id,
          name: matched.name,
          port,
          url: targetUrl,
          metricsPath: '/metrics',
          stack: matched.stack,
          description: matched.description,
          status: 'UP',
          latencyMs: tcpResult.latencyMs,
          hasMetrics: true,
        });
        return;
      } catch {
        // Port open, but /metrics didn't respond. Try /health or root
      }

      try {
        const healthRes = await axios.get(`${targetUrl}/health`, { timeout: 1500, validateStatus: () => true });
        const healthPayload = typeof healthRes.data === 'object' ? healthRes.data : null;
        const matched = identifyService(port, typeof healthRes.data === 'string' ? healthRes.data : '', '', healthPayload);
        discovered.push({
          id: matched.id,
          name: matched.name,
          port,
          url: targetUrl,
          metricsPath: '/metrics',
          stack: matched.stack,
          description: matched.description,
          status: 'UP',
          latencyMs: tcpResult.latencyMs,
          hasMetrics: false,
        });
      } catch {
        // Port is open on raw TCP, check if it responds to HTTP root
        try {
          const rootRes = await axios.get(targetUrl, { timeout: 1500, validateStatus: () => true });
          const matched = identifyService(port, typeof rootRes.data === 'string' ? rootRes.data : '', '');
          discovered.push({
            id: matched.id,
            name: matched.name,
            port,
            url: targetUrl,
            metricsPath: '/metrics',
            stack: matched.stack,
            description: matched.description,
            status: 'UP',
            latencyMs: tcpResult.latencyMs,
            hasMetrics: false,
          });
        } catch {
          // Port is listening on TCP, register as active listening service
          const matched = identifyService(port, '', '');
          discovered.push({
            id: matched.id,
            name: matched.name,
            port,
            url: targetUrl,
            metricsPath: '/metrics',
            stack: matched.stack,
            description: matched.description || `Listening TCP service on port ${port}`,
            status: 'UP',
            latencyMs: tcpResult.latencyMs,
            hasMetrics: false,
          });
        }
      }
    })
  );

  // Probe standard database ports dynamically
  const discoveredDatabases = [];
  await Promise.all(
    KNOWN_DB_PORTS.map(async (dbDef) => {
      const tcp = await probeTcpPort(host, dbDef.port, 1500);
      if (tcp.open) {
        discoveredDatabases.push({
          id: dbDef.id,
          name: dbDef.name,
          host,
          port: dbDef.port,
        });
      }
    })
  );

  return {
    host,
    discoveryMode: 'probe',
    servicesCount: discovered.length,
    services: discovered,
    databases: discoveredDatabases,
    spec: hostSpecs || {
      cores: 16,
      totalMemoryMb: 32768,
      usedMemoryMb: Math.round(32768 * 0.42),
      totalDiskGb: 512,
      usedDiskGb: 184,
      os: 'Remote Host Node (TCP Discovered)',
    },
  };
}

/**
 * Run a command over an established SSH connection and return stdout
 * @param {import('ssh2').Client} client
 * @param {string} cmd
 * @returns {Promise<string>}
 */
function execSshCommand(client, cmd, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let resolved = false;
    const t = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve('');
      }
    }, timeoutMs);

    client.exec(cmd, (err, stream) => {
      if (err) {
        clearTimeout(t);
        if (!resolved) {
          resolved = true;
          return resolve('');
        }
        return;
      }
      let stdout = '';
      stream.on('data', (d) => { stdout += d.toString(); });
      stream.on('close', () => {
        clearTimeout(t);
        if (!resolved) {
          resolved = true;
          resolve(stdout.trim());
        }
      });
      stream.on('error', () => {
        clearTimeout(t);
        if (!resolved) {
          resolved = true;
          resolve('');
        }
      });
    });
  });
}

/**
 * Discover remote hardware and microservices via SSH (WSL / Linux Node)
 * @param {object} params
 * @param {string} params.host - IP or hostname of remote laptop
 * @param {number} [params.port=22] - SSH port (usually 22 or 2222)
 * @param {string} params.username - SSH username
 * @param {string} [params.password] - SSH password
 * @param {string} [params.privateKey] - SSH Private key (PEM)
 * @param {number} [params.timeoutMs=8000]
 */
async function discoverViaSsh({ host, port = 22, username, password, privateKey, timeoutMs = 25000 }) {
  return new Promise((resolve, reject) => {
    const client = new SshClient();
    let isFinished = false;

    const timer = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        client.end();
        reject(new Error(`SSH Connection timed out after ${timeoutMs}ms to ${host}:${port}`));
      }
    }, timeoutMs);

    client.on('error', (err) => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timer);
        reject(new Error(`SSH Error (${host}:${port}): ${err.message}`));
      }
    });

    client.on('ready', async () => {
      try {
        // 1. Gather System Hardware Specs
        const [nprocOut, meminfoOut, dfOut, osOut, uptimeOut] = await Promise.all([
          execSshCommand(client, 'nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo').catch(() => '8'),
          execSshCommand(client, 'cat /proc/meminfo 2>/dev/null').catch(() => ''),
          execSshCommand(client, 'df -k / | awk "NR==2 {print \\$2, \\$3}"').catch(() => '524288000 157286400'),
          execSshCommand(client, 'cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\' 2>/dev/null || uname -srm').catch(() => 'Linux WSL Node'),
          execSshCommand(client, 'cat /proc/uptime | awk "{print \\$1}" 2>/dev/null').catch(() => '86400'),
        ]);

        const cores = parseInt(nprocOut, 10) || 8;

        // Parse Meminfo
        let totalMemMb = 16384;
        let freeMemMb = 8192;
        const memTotalMatch = meminfoOut.match(/MemTotal:\s+(\d+)\s+kB/i);
        const memAvailMatch = meminfoOut.match(/MemAvailable:\s+(\d+)\s+kB/i);
        if (memTotalMatch) {
          totalMemMb = Math.round(parseInt(memTotalMatch[1], 10) / 1024);
        }
        if (memAvailMatch) {
          freeMemMb = Math.round(parseInt(memAvailMatch[1], 10) / 1024);
        }
        const usedMemMb = Math.max(0, totalMemMb - freeMemMb);

        // Parse Disk
        const [totalDiskKb, usedDiskKb] = dfOut.split(/\s+/).map((v) => parseInt(v, 10) || 0);
        const totalDiskGb = parseFloat((totalDiskKb / 1024 / 1024).toFixed(1)) || 256;
        const usedDiskGb = parseFloat((usedDiskKb / 1024 / 1024).toFixed(1)) || 64;

        // Parse Uptime
        const uptimeSec = Math.floor(parseFloat(uptimeOut)) || 86400;
        const uptimeDays = Math.floor(uptimeSec / 86400);
        const uptimeHours = Math.floor((uptimeSec % 86400) / 3600);
        const uptimeFormatted = uptimeDays > 0 ? `${uptimeDays}d ${uptimeHours}h` : `${uptimeHours}h`;

        // 2. Discover Listening Ports & Docker Containers
        const [portsOut, dockerOut] = await Promise.all([
          execSshCommand(client, 'ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null').catch(() => ''),
          execSshCommand(client, 'docker ps --format "{{.Names}}\t{{.Ports}}\t{{.Image}}" 2>/dev/null || sudo -n docker ps --format "{{.Names}}\t{{.Ports}}\t{{.Image}}" 2>/dev/null').catch(() => ''),
        ]);

        // Map container names and ports from docker ps
        const detectedPortSet = new Set();
        const dockerContainerMap = new Map(); // port -> container info

        if (dockerOut && dockerOut.trim()) {
          const lines = dockerOut.split('\n');
          for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length >= 1 && parts[0].trim()) {
              const containerName = parts[0].trim();
              const portStr = parts[1] || '';
              const imageStr = parts[2] || '';

              // Find mapped ports: e.g. 0.0.0.0:8080->8080/tcp or :8080->
              const portMatches = portStr.match(/(?:0\.0\.0\.0:|:::|:)?(\d{2,5})->/g) || portStr.match(/:(\d{2,5})\b/g);
              if (portMatches) {
                for (const pm of portMatches) {
                  const p = parseInt(pm.replace(/[^0-9]/g, ''), 10);
                  if (p > 0 && p <= 65535) {
                    detectedPortSet.add(p);
                    dockerContainerMap.set(p, { name: containerName, image: imageStr });
                  }
                }
              }
            }
          }
        }

        // Extract active TCP listening ports from ss / netstat
        const portRegex = /:(3\d{3}|4\d{3}|5\d{3}|80\d{2}|9100)\b/g;
        let m;
        while ((m = portRegex.exec(portsOut)) !== null) {
          detectedPortSet.add(parseInt(m[1], 10));
        }

        // Also check DEFAULT_PROBE_PORTS in case ss / netstat output omitted them
        for (const p of DEFAULT_PROBE_PORTS) {
          detectedPortSet.add(p);
        }

        // Exclude database, redis, kafka, mailhog, and ssh ports to prevent probing delays
        const IGNORE_PORTS = new Set([
          5432, 5436, 5437, 5438, 5439, 5440, 5441,
          6379, 6380, 6382,
          27017, 27018, 9092, 1025, 8025, 22, 2221, 2222
        ]);
        const candidatePorts = Array.from(detectedPortSet).filter((p) =>
          p >= 1000 && p <= 65535 && !IGNORE_PORTS.has(p)
        );

        // 3. Inspect endpoints with local curl inside remote host concurrently
        const discoveredServices = [];
        const seenServiceIds = new Set();

        await Promise.all(
          candidatePorts.map(async (port) => {
            const containerInfo = dockerContainerMap.get(port);
            let inspectedText = '';

            try {
              inspectedText = await execSshCommand(
                client,
                `curl -s -m 1 http://127.0.0.1:${port}/metrics 2>/dev/null | head -n 20`,
                1500
              );
            } catch {}

            if (!inspectedText && containerInfo) {
              try {
                inspectedText = await execSshCommand(
                  client,
                  `curl -s -m 1 http://127.0.0.1:${port}/health 2>/dev/null | head -n 10`,
                  1500
                );
              } catch {}
            }

            const hasMetrics = Boolean(inspectedText && inspectedText.trim().length > 5);

            // STRICT CHECK: Service must EITHER have responded with valid HTTP text, OR have a verified running container in docker ps
            if (!hasMetrics && !containerInfo) {
              return; // Skip inactive ports
            }

            const matched = identifyService(port, inspectedText, containerInfo?.name || '');

            if (!seenServiceIds.has(matched.id)) {
              seenServiceIds.add(matched.id);
              discoveredServices.push({
                id: matched.id,
                name: containerInfo ? `${matched.name}` : matched.name,
                port,
                url: `http://${host}:${port}`,
                metricsPath: '/metrics',
                stack: matched.stack,
                description: matched.description || (containerInfo ? `Container: ${containerInfo.name}` : `Port ${port}`),
                status: 'UP',
                hasMetrics,
              });
            }
          })
        );

        // Dynamically detect running databases from ss/netstat and docker
        const discoveredDatabases = [];
        for (const dbDef of KNOWN_DB_PORTS) {
          const hasPort = detectedPortSet.has(dbDef.port) || (portsOut && portsOut.includes(`:${dbDef.port}`));
          const containerMatch = dockerOut && dbDef.pattern.test(dockerOut);
          if (hasPort || containerMatch) {
            discoveredDatabases.push({
              id: dbDef.id,
              name: dbDef.name,
              host,
              port: dbDef.port,
            });
          }
        }

        client.end();
        if (!isFinished) {
          isFinished = true;
          clearTimeout(timer);
          resolve({
            host,
            discoveryMode: 'ssh',
            os: `${osOut.trim()} (WSL2 Distro)`,
            spec: {
              cores,
              totalMemoryMb: totalMemMb,
              usedMemoryMb: usedMemMb,
              totalDiskGb: totalDiskGb,
              usedDiskGb: usedDiskGb,
              uptimeSeconds: uptimeSec,
              uptimeFormatted,
              os: `${osOut.trim()} (WSL2 Distro)`,
            },
            dockerContainers: dockerOut ? dockerOut.split('\n').filter(Boolean) : [],
            servicesCount: discoveredServices.length,
            services: discoveredServices,
            databases: discoveredDatabases,
          });
        }
      } catch (err) {
        client.end();
        if (!isFinished) {
          isFinished = true;
          clearTimeout(timer);
          reject(err);
        }
      }
    });

    const connectConfig = {
      host,
      port,
      username,
      readyTimeout: timeoutMs,
    };
    if (password) {
      connectConfig.password = password;
      connectConfig.passphrase = password;
    }
    if (privateKey) {
      connectConfig.privateKey = privateKey;
    }

    client.connect(connectConfig);
  });
}

module.exports = {
  KNOWN_SERVICES,
  DEFAULT_PROBE_PORTS,
  probeTcpPort,
  identifyService,
  discoverViaHttpProbe,
  discoverViaSsh,
};
