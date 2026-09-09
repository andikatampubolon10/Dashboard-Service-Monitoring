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

// Registry of known microservice signatures for auto-detection
const KNOWN_SERVICES = [
  {
    id: 'identity',
    name: 'Identity Service',
    defaultPort: 8080,
    stack: 'go',
    description: 'Authentication, JWT issuance, user identity management',
    signatures: ['identity', 'jwt', 'auth_', 'user_'],
  },
  {
    id: 'health-profile',
    name: 'Health Profile Service',
    defaultPort: 3001,
    stack: 'nodejs',
    description: 'BPJS participant health profile data & biometric enrollment',
    signatures: ['health_profile_service', 'participant_profile', 'biometric_enrollment'],
  },
  {
    id: 'medical-record',
    name: 'Medical Record Service',
    defaultPort: 3002,
    stack: 'nodejs',
    description: 'Patient medical history and record indexing',
    signatures: ['medical_record', 'medical', 'record_'],
  },
  {
    id: 'live-consult',
    name: 'Live Consult Service',
    defaultPort: 4004,
    stack: 'go',
    description: 'Real-time WebSocket consultation sessions',
    signatures: ['live_consult', 'consultation', 'session_', 'ws_'],
  },
  {
    id: 'audit',
    name: 'Audit Service',
    defaultPort: 4005,
    stack: 'go',
    description: 'Audit event consumer — activity events from Kafka',
    signatures: ['audit', 'kafka_consumer', 'audit_event'],
  },
  {
    id: 'ai-consultation',
    name: 'AI Consultation Service',
    defaultPort: 4006,
    stack: 'nodejs',
    description: 'AI-powered consultation lifecycle & transcript persistence',
    signatures: ['ai_consultation', 'ai_', 'inference', 'transcript'],
  },
  {
    id: 'lifestyle',
    name: 'Lifestyle Service',
    defaultPort: 4007,
    stack: 'nodejs',
    description: 'Exercise catalog, completion tracking & wellness',
    signatures: ['lifestyle', 'exercise', 'wellness'],
  },
  {
    id: 'node-exporter',
    name: 'Node Exporter Host Agent',
    defaultPort: 9100,
    stack: 'go',
    description: 'Prometheus Node Exporter system hardware metrics agent',
    signatures: ['node_cpu_seconds_total', 'node_memory_MemTotal_bytes'],
  },
];

const DEFAULT_PROBE_PORTS = [8080, 3001, 3002, 4004, 4005, 4006, 4007, 9100, 3000, 5000, 8000];

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
 * Identify microservice identity from /metrics body text, container name, or fallback to port matching
 * @param {number} port
 * @param {string} bodyText
 * @param {string} [containerName]
 * @returns {typeof KNOWN_SERVICES[0]}
 */
/**
 * Identify microservice identity from port matching, container name, or metrics signatures
 * @param {number} port
 * @param {string} bodyText
 * @param {string} [containerName]
 * @returns {typeof KNOWN_SERVICES[0]}
 */
function identifyService(port, bodyText = '', containerName = '') {
  const lowerBody = (bodyText + ' ' + containerName).toLowerCase();
  const lowerContainer = (containerName || '').toLowerCase();

  // 1. Primary: Exact default port matching (highest fidelity in our microservices ecosystem)
  const matchByPort = KNOWN_SERVICES.find((s) => s.defaultPort === port);
  if (matchByPort) {
    // If port 8080, it's definitely Identity Service (even if metrics mention health_profile_outbox)
    return matchByPort;
  }

  // 2. Container Name match
  if (lowerContainer) {
    for (const svc of KNOWN_SERVICES) {
      if (lowerContainer.includes(svc.id) || lowerContainer.includes(svc.name.toLowerCase().replace(/\s+/g, '-'))) {
        return svc;
      }
    }
  }

  // 3. Runtime Disambiguation: Go vs Node.js
  const isGoRuntime = lowerBody.includes('go_goroutines') || lowerBody.includes('go_threads') || lowerBody.includes('promhttp_');
  const isNodeRuntime = lowerBody.includes('nodejs_') || lowerBody.includes('process_cpu_seconds_total') && !isGoRuntime;

  // 4. Signature match in /metrics
  for (const svc of KNOWN_SERVICES) {
    if (svc.stack === 'go' && isNodeRuntime) continue;
    if (svc.stack === 'nodejs' && isGoRuntime) continue;

    for (const sig of svc.signatures) {
      if (lowerBody.includes(sig)) {
        return svc;
      }
    }
  }

  // 5. Custom / Unknown microservice
  return {
    id: `custom-svc-${port}`,
    name: containerName ? `Service (${containerName})` : `Service on Port ${port}`,
    defaultPort: port,
    stack: isGoRuntime ? 'go' : 'nodejs',
    description: `Discovered active service on port ${port}`,
    signatures: [],
  };
}

/**
 * Discover microservices on a remote host via HTTP Port Probing
 * @param {object} params
 * @param {string} params.host
 * @param {number[]} [params.candidatePorts]
 * @param {number} [params.timeoutMs]
 */
async function discoverViaHttpProbe({ host, candidatePorts = DEFAULT_PROBE_PORTS, timeoutMs = 2500 }) {
  const uniquePorts = Array.from(new Set(candidatePorts.filter((p) => p > 0 && p <= 65535)));
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
        await axios.get(`${targetUrl}/health`, { timeout: 1500, validateStatus: () => true });
        const matched = identifyService(port, '');
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
          await axios.get(targetUrl, { timeout: 1500, validateStatus: () => true });
          const matched = identifyService(port, '');
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
          // If port is not responding to any HTTP request, do not falsely identify as a web microservice
        }
      }
    })
  );

  return {
    host,
    discoveryMode: 'probe',
    servicesCount: discovered.length,
    services: discovered,
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
function execSshCommand(client, cmd) {
  return new Promise((resolve, reject) => {
    client.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('data', (d) => { stdout += d.toString(); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); });
      stream.on('close', () => { resolve(stdout.trim()); });
      stream.on('error', (e) => reject(e));
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
async function discoverViaSsh({ host, port = 22, username, password, privateKey, timeoutMs = 10000 }) {
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
          execSshCommand(client, 'docker ps --format "{{.Names}}\t{{.Ports}}\t{{.Image}}" 2>/dev/null || sudo docker ps --format "{{.Names}}\t{{.Ports}}\t{{.Image}}" 2>/dev/null').catch(() => ''),
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

              // Match container names directly to known microservices (e.g. identity, audit, redis, postgres)
              for (const known of KNOWN_SERVICES) {
                if (
                  containerName.toLowerCase().includes(known.id) ||
                  imageStr.toLowerCase().includes(known.id)
                ) {
                  detectedPortSet.add(known.defaultPort);
                  if (!dockerContainerMap.has(known.defaultPort)) {
                    dockerContainerMap.set(known.defaultPort, { name: containerName, image: imageStr });
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

        const candidatePorts = Array.from(detectedPortSet);

        // 3. Inspect endpoints with local curl/wget or process verification inside remote host
        const discoveredServices = [];
        const seenServiceIds = new Set();

        for (const port of candidatePorts) {
          const containerInfo = dockerContainerMap.get(port);
          let inspectedText = '';

          try {
            // Try curl first, fallback to wget
            inspectedText = await execSshCommand(
              client,
              `curl -s -m 2 http://127.0.0.1:${port}/metrics 2>/dev/null || wget -q -O - -T 2 http://127.0.0.1:${port}/metrics 2>/dev/null | head -n 30`
            );
          } catch {
            // curl / wget failed
          }

          if (!inspectedText) {
            try {
              inspectedText = await execSshCommand(
                client,
                `curl -s -m 2 http://127.0.0.1:${port}/health 2>/dev/null || wget -q -O - -T 2 http://127.0.0.1:${port}/health 2>/dev/null`
              );
            } catch {}
          }

          const hasMetrics = Boolean(inspectedText && inspectedText.trim().length > 5);

          // STRICT CHECK: Service must EITHER have responded with valid HTTP text, OR have a verified running container in docker ps
          if (!hasMetrics && !containerInfo) {
            continue; // Skip inactive ports!
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
    if (privateKey) {
      connectConfig.privateKey = privateKey;
    } else {
      connectConfig.password = password;
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
