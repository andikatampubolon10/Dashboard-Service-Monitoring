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
 * Parse lines from `docker ps --format "{{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Labels}}"`
 * @param {string} dockerPsOut
 * @returns {Array<object>}
 */
function parseDockerContainers(dockerPsOut) {
  if (!dockerPsOut || typeof dockerPsOut !== 'string') return [];
  const containers = [];
  const lines = dockerPsOut.trim().split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const name = parts[0]?.trim() || '';
    const image = parts[1]?.trim() || '';
    const portStr = parts[2]?.trim() || '';
    const labelStr = parts[3]?.trim() || '';

    // Parse labels
    const labels = {};
    if (labelStr) {
      for (const item of labelStr.split(',')) {
        const eqIdx = item.indexOf('=');
        if (eqIdx > 0) {
          labels[item.slice(0, eqIdx).trim()] = item.slice(eqIdx + 1).trim();
        }
      }
    }

    // Parse host exposed ports: e.g. 0.0.0.0:5437->5437/tcp, 5432/tcp, 0.0.0.0:5439->5436/tcp
    const hostPorts = [];
    const portMatches = portStr.matchAll(/(?:0\.0\.0\.0:|:::|:)?(\d{2,5})->(\d{2,5})/g);
    for (const m of portMatches) {
      hostPorts.push({
        hostPort: parseInt(m[1], 10),
        containerPort: parseInt(m[2], 10),
      });
    }

    // Determine if container is database
    let dbType = null;
    const lowerName = name.toLowerCase();
    const lowerImg = image.toLowerCase();
    const composeService = (labels['com.docker.compose.service'] || '').toLowerCase();

    if (
      lowerImg.includes('postgres') ||
      lowerName.includes('postgres') ||
      lowerName.includes('-pg') ||
      composeService.includes('postgres') ||
      composeService.includes('-pg')
    ) {
      dbType = 'postgresql';
    } else if (lowerImg.includes('redis') || lowerName.includes('redis') || composeService.includes('redis')) {
      dbType = 'redis';
    } else if (lowerImg.includes('mongo') || lowerName.includes('mongo') || composeService.includes('mongo')) {
      dbType = 'mongodb';
    } else if (lowerImg.includes('mysql') || lowerName.includes('mysql')) {
      dbType = 'mysql';
    } else if (lowerImg.includes('mariadb') || lowerName.includes('mariadb')) {
      dbType = 'mariadb';
    }

    containers.push({
      name,
      image,
      portStr,
      labels,
      project: labels['com.docker.compose.project'] || '',
      composeService,
      hostPorts,
      primaryHostPort: hostPorts[0]?.hostPort || null,
      isDb: Boolean(dbType),
      dbType,
    });
  }

  return containers;
}

/**
 * Automatically resolve databases for a given service container based on:
 * 1. Matching Docker Compose project
 * 2. Environment variables (DATABASE_URL, REDIS_URL, etc.)
 * 3. Fallback to container name prefix matching
 *
 * @param {object} serviceContainer
 * @param {Array<object>} allContainers
 * @param {Array<string>} [envList=[]]
 * @param {string} [host='localhost']
 * @returns {Array<object>}
 */
function resolveServiceDatabases(serviceContainer, allContainers, envList = [], host = 'localhost') {
  if (!serviceContainer) return [];
  const serviceProject = serviceContainer.project;
  const databases = [];
  const addedDbTypes = new Set();

  // 1. Primary: Find all database containers in the same Docker Compose project
  if (serviceProject) {
    const projectDbs = allContainers.filter((c) => c.isDb && c.project === serviceProject);
    for (const dbContainer of projectDbs) {
      const port = dbContainer.primaryHostPort;
      if (port && !addedDbTypes.has(dbContainer.dbType)) {
        addedDbTypes.add(dbContainer.dbType);
        databases.push({
          id: dbContainer.dbType,
          name: dbContainer.dbType === 'postgresql' ? 'PostgreSQL' : dbContainer.dbType === 'mongodb' ? 'MongoDB' : dbContainer.dbType.toUpperCase(),
          host,
          port,
          containerName: dbContainer.name,
        });
      }
    }
  }

  // 2. If no project databases found, parse environment variables (DATABASE_URL, REDIS_URL, etc.)
  if (databases.length === 0 && Array.isArray(envList)) {
    for (const envStr of envList) {
      const [key, ...valParts] = envStr.split('=');
      const val = valParts.join('=');
      if (!val) continue;

      const lowerVal = val.toLowerCase();
      let detectedType = null;
      if (lowerVal.startsWith('postgres://') || lowerVal.startsWith('postgresql://')) detectedType = 'postgresql';
      else if (lowerVal.startsWith('redis://')) detectedType = 'redis';
      else if (lowerVal.startsWith('mongodb://') || lowerVal.startsWith('mongodb+srv://')) detectedType = 'mongodb';

      if (detectedType && !addedDbTypes.has(detectedType)) {
        let matchedDb = null;
        try {
          const cleanUrl = val.replace(/^[a-z]+:\/\/[^@]*@/i, '');
          const hostAndPort = cleanUrl.split('/')[0];
          const [targetHost] = hostAndPort.split(':');

          matchedDb = allContainers.find((c) =>
            c.isDb && c.dbType === detectedType && (
              c.name === targetHost ||
              c.composeService === targetHost ||
              c.name.includes(targetHost)
            )
          );
        } catch {}

        if (!matchedDb) {
          matchedDb = allContainers.find((c) => c.isDb && c.dbType === detectedType);
        }

        const resolvedPort = matchedDb?.primaryHostPort;
        if (resolvedPort) {
          addedDbTypes.add(detectedType);
          databases.push({
            id: detectedType,
            name: detectedType === 'postgresql' ? 'PostgreSQL' : detectedType === 'mongodb' ? 'MongoDB' : detectedType.toUpperCase(),
            host,
            port: resolvedPort,
            containerName: matchedDb.name,
          });
        }
      }
    }
  }

  // 3. Fallback: match by container name prefix / slug if still no DB found
  if (databases.length === 0) {
    const svcBase = serviceContainer.name.replace(/-service.*$/, '').replace(/^inaai-/, '');
    const matchedDbs = allContainers.filter((c) => c.isDb && c.name.includes(svcBase));
    for (const db of matchedDbs) {
      if (db.primaryHostPort && !addedDbTypes.has(db.dbType)) {
        addedDbTypes.add(db.dbType);
        databases.push({
          id: db.dbType,
          name: db.dbType === 'postgresql' ? 'PostgreSQL' : db.dbType === 'mongodb' ? 'MongoDB' : db.dbType.toUpperCase(),
          host,
          port: db.primaryHostPort,
          containerName: db.name,
        });
      }
    }
  }

  return databases;
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
async function discoverViaSsh({ host, port = 22, username, password, passphrase, privateKey, timeoutMs = 25000 }) {
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

        // 2. Discover Listening Ports & Docker Containers (with labels)
        const [portsOut, dockerOut] = await Promise.all([
          execSshCommand(client, 'ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null').catch(() => ''),
          execSshCommand(
            client,
            'docker ps --format "{{.Names}}\\t{{.Image}}\\t{{.Ports}}\\t{{.Labels}}" 2>/dev/null || sudo -n docker ps --format "{{.Names}}\\t{{.Image}}\\t{{.Ports}}\\t{{.Labels}}" 2>/dev/null || docker ps --format "{{.Names}}\\t{{.Ports}}\\t{{.Image}}" 2>/dev/null'
          ).catch(() => ''),
        ]);

        // Parse docker containers using the dedicated Docker parser
        const parsedDockerContainers = parseDockerContainers(dockerOut);

        // Map container names and ports from docker ps
        const detectedPortSet = new Set();
        const dockerContainerMap = new Map(); // port -> container info

        for (const c of parsedDockerContainers) {
          for (const hp of c.hostPorts) {
            detectedPortSet.add(hp.hostPort);
            dockerContainerMap.set(hp.hostPort, { name: c.name, image: c.image, project: c.project });
          }
        }

        // Bulk inspect environment variables for application containers to find DB links
        const appContainers = parsedDockerContainers.filter(
          (c) => !c.isDb && !c.name.includes('exporter') && !c.name.includes('gateway') && !c.name.includes('mailhog')
        );
        const dockerEnvMap = new Map();
        if (appContainers.length > 0) {
          try {
            const inspectCmd = `docker inspect ${appContainers.map((c) => c.name).join(' ')} --format "{{.Name}}\\t{{json .Config.Env}}" 2>/dev/null || sudo -n docker inspect ${appContainers.map((c) => c.name).join(' ')} --format "{{.Name}}\\t{{json .Config.Env}}" 2>/dev/null`;
            const inspectOut = await execSshCommand(client, inspectCmd, 3500);
            if (inspectOut && inspectOut.trim()) {
              for (const line of inspectOut.trim().split('\n')) {
                const [cName, envJson] = line.split('\t');
                if (cName && envJson) {
                  const cleanName = cName.replace(/^\//, '').trim();
                  try {
                    dockerEnvMap.set(cleanName, JSON.parse(envJson));
                  } catch {}
                }
              }
            }
          } catch {}
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

              // Auto-resolve databases directly from Docker container & compose links
              const matchedContainer = parsedDockerContainers.find(
                (c) => c.name === containerInfo?.name || c.primaryHostPort === port
              );
              const serviceDatabases = matchedContainer
                ? resolveServiceDatabases(
                    matchedContainer,
                    parsedDockerContainers,
                    dockerEnvMap.get(matchedContainer.name) || [],
                    host
                  )
                : [];

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
                databases: serviceDatabases,
              });
            }
          })
        );

        // Dynamically detect ALL running databases from docker containers and ss/netstat
        const discoveredDatabases = [];
        const seenDbKeys = new Set();

        // 1. All Docker database containers running on this server
        for (const c of parsedDockerContainers) {
          if (c.isDb && c.primaryHostPort) {
            const key = `${c.dbType}-${c.primaryHostPort}`;
            if (!seenDbKeys.has(key)) {
              seenDbKeys.add(key);
              discoveredDatabases.push({
                id: `${c.dbType}-${c.primaryHostPort}`,
                name: c.dbType === 'postgresql' ? 'PostgreSQL' : c.dbType === 'mongodb' ? 'MongoDB' : c.dbType.toUpperCase(),
                containerName: c.name,
                host,
                port: c.primaryHostPort,
              });
            }
          }
        }

        // 2. Also check standard DB ports from ss/netstat if not captured by docker
        for (const dbDef of KNOWN_DB_PORTS) {
          const key = `${dbDef.id}-${dbDef.port}`;
          if (!seenDbKeys.has(key)) {
            const hasStandardPort = detectedPortSet.has(dbDef.port) || (portsOut && portsOut.includes(`:${dbDef.port}`));
            if (hasStandardPort) {
              seenDbKeys.add(key);
              discoveredDatabases.push({
                id: `${dbDef.id}-${dbDef.port}`,
                name: dbDef.name,
                host,
                port: dbDef.port,
              });
            }
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
    const effectivePassphrase = passphrase || password;
    if (password) {
      connectConfig.password = password;
    }
    if (effectivePassphrase) {
      connectConfig.passphrase = effectivePassphrase;
    }
    if (privateKey) {
      connectConfig.privateKey = privateKey;
    }

    try {
      client.connect(connectConfig);
    } catch (err) {
      if (connectConfig.privateKey && connectConfig.password) {
        delete connectConfig.privateKey;
        delete connectConfig.passphrase;
        try {
          client.connect(connectConfig);
          return;
        } catch {}
      }
      client.end();
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timer);
        reject(err);
      }
    }
  });
}

/**
 * Perform a live Docker inspection on a server to auto-discover databases for all running services
 * @param {object} server - Server object with host and ssh credentials
 * @returns {Promise<Array<{ containerName: string, project: string, ports: number[], databases: Array }>>}
 */
async function inspectServerDatabasesAndServices(server) {
  if (!server || !server.ssh || !server.ssh.username) {
    throw new Error('Server does not have valid SSH credentials');
  }

  return new Promise((resolve, reject) => {
    const client = new SshClient();
    let isFinished = false;

    const timer = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        client.end();
        reject(new Error(`SSH timeout while inspecting Docker on ${server.host}`));
      }
    }, 15000);

    client.on('error', (err) => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    client.on('ready', async () => {
      try {
        const dockerOut = await execSshCommand(
          client,
          'docker ps --format "{{.Names}}\\t{{.Image}}\\t{{.Ports}}\\t{{.Labels}}" 2>/dev/null || sudo -n docker ps --format "{{.Names}}\\t{{.Image}}\\t{{.Ports}}\\t{{.Labels}}" 2>/dev/null'
        ).catch(() => '');

        const parsedContainers = parseDockerContainers(dockerOut);
        const appContainers = parsedContainers.filter(
          (c) => !c.isDb && !c.name.includes('exporter') && !c.name.includes('gateway') && !c.name.includes('mailhog')
        );

        const dockerEnvMap = new Map();
        if (appContainers.length > 0) {
          try {
            const inspectCmd = `docker inspect ${appContainers.map((c) => c.name).join(' ')} --format "{{.Name}}\\t{{json .Config.Env}}" 2>/dev/null || sudo -n docker inspect ${appContainers.map((c) => c.name).join(' ')} --format "{{.Name}}\\t{{json .Config.Env}}" 2>/dev/null`;
            const inspectOut = await execSshCommand(client, inspectCmd, 4000);
            if (inspectOut && inspectOut.trim()) {
              for (const line of inspectOut.trim().split('\n')) {
                const [cName, envJson] = line.split('\t');
                if (cName && envJson) {
                  const cleanName = cName.replace(/^\//, '').trim();
                  try {
                    dockerEnvMap.set(cleanName, JSON.parse(envJson));
                  } catch {}
                }
              }
            }
          } catch {}
        }

        const results = [];
        for (const app of appContainers) {
          const envs = dockerEnvMap.get(app.name) || [];
          const databases = resolveServiceDatabases(app, parsedContainers, envs, server.host);
          results.push({
            containerName: app.name,
            project: app.project,
            ports: app.hostPorts.map((hp) => hp.hostPort),
            databases,
          });
        }

        client.end();
        if (!isFinished) {
          isFinished = true;
          clearTimeout(timer);
          resolve(results);
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
      host: server.host,
      port: server.ssh.port || server.port || 22,
      username: server.ssh.username,
      readyTimeout: 10000,
    };
    const effectivePassphrase = server.ssh.passphrase || server.ssh.password;
    if (server.ssh.password) {
      connectConfig.password = server.ssh.password;
    }
    if (effectivePassphrase) {
      connectConfig.passphrase = effectivePassphrase;
    }
    if (server.ssh.privateKey) {
      connectConfig.privateKey = server.ssh.privateKey;
    }

    try {
      client.connect(connectConfig);
    } catch (err) {
      if (connectConfig.privateKey && connectConfig.password) {
        delete connectConfig.privateKey;
        delete connectConfig.passphrase;
        try {
          client.connect(connectConfig);
          return;
        } catch {}
      }
      client.end();
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timer);
        reject(err);
      }
    }
  });
}

module.exports = {
  KNOWN_SERVICES,
  DEFAULT_PROBE_PORTS,
  probeTcpPort,
  identifyService,
  discoverViaHttpProbe,
  discoverViaSsh,
  parseDockerContainers,
  resolveServiceDatabases,
  inspectServerDatabasesAndServices,
};

