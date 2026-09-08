'use strict';

/**
 * test-backend.js
 * Comprehensive integration test for monitoring-backend.
 */

const http = require('http');
const axios = require('axios');
const { io: ioClient } = require('socket.io-client');
const { app, server } = require('./src/app');
const { SERVICES } = require('./src/config/services.config');
const { runScrapeCycle } = require('./src/collectors');
const { getLatest, getStatus, getHistory, getLatestSystemMetrics } = require('./src/store/metricsStore');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Monitoring Backend Verification Tests');
  console.log('====================================================\n');

  const BASE_URL = 'http://localhost:5000';

  // 1. Run a scrape cycle manually
  console.log('1. Testing Scrape Cycle across all 7 services...');
  await runScrapeCycle();
  console.log('✓ Scrape cycle completed.\n');

  // Check identity service result in store
  const identityLatest = getLatest('identity');
  console.log('2. Verifying identity-service metrics:');
  console.log(`  - Status: ${identityLatest?.status}`);
  console.log(`  - Latency: p50=${identityLatest?.metrics?.latency?.p50Ms}ms, p95=${identityLatest?.metrics?.latency?.p95Ms}ms, avg=${identityLatest?.metrics?.latency?.avgMs}ms`);
  console.log(`  - Requests: total=${identityLatest?.metrics?.throughput?.reqTotal}, rps=${identityLatest?.metrics?.throughput?.reqPerSecond}`);
  console.log(`  - Memory RSS: ${identityLatest?.metrics?.memory?.rssMb} MB, Go Alloc: ${identityLatest?.metrics?.memory?.goAllocMb} MB`);
  console.log(`  - Goroutines: ${identityLatest?.metrics?.connections?.goGoroutines}`);
  console.log(`  - Open FDs: ${identityLatest?.metrics?.connections?.openFds}`);

  if (identityLatest?.status !== 'UP') {
    throw new Error(`Expected identity service to be UP, got ${identityLatest?.status}`);
  }
  console.log('✓ Identity service metrics collected accurately.\n');

  // 2. Test system metrics in store
  console.log('3. Verifying System Metrics:');
  const sys = getLatestSystemMetrics();
  console.log(`  - CPU: ${sys?.cpu?.usagePercent}% (${sys?.cpu?.cores} cores)`);
  console.log(`  - Memory: ${sys?.memory?.usedMb} / ${sys?.memory?.totalMb} MB (${sys?.memory?.usedPercent}%)`);
  console.log(`  - Disk: ${sys?.disk?.usedGb} / ${sys?.disk?.totalGb} GB (${sys?.disk?.usedPercent}%)`);
  if (!sys || !sys.cpu || !sys.disk) {
    throw new Error('System metrics missing CPU or Disk data');
  }
  console.log('✓ System host metrics collected successfully.\n');

  // 3. Test HTTP Endpoints
  console.log('4. Testing REST API Endpoints...');

  // Health
  const resHealth = await axios.get(`${BASE_URL}/health`);
  console.log(`  ✓ GET /health: status=${resHealth.data.status}, servicesUp=${resHealth.data.monitoring.servicesUp}/${resHealth.data.monitoring.totalServices}`);

  // Services list
  const resServices = await axios.get(`${BASE_URL}/api/services`);
  console.log(`  ✓ GET /api/services: total=${resServices.data.total}, up=${resServices.data.upCount}, down=${resServices.data.downCount}`);

  // Single service
  const resSingle = await axios.get(`${BASE_URL}/api/services/identity`);
  console.log(`  ✓ GET /api/services/identity: id=${resSingle.data.service.id}, status=${resSingle.data.service.status}`);

  // Service metrics
  const resMetrics = await axios.get(`${BASE_URL}/api/services/identity/metrics`);
  console.log(`  ✓ GET /api/services/identity/metrics: status=${resMetrics.data.status}`);

  // Service history
  const resHistory = await axios.get(`${BASE_URL}/api/services/identity/metrics/history?range=300`);
  console.log(`  ✓ GET /api/services/identity/metrics/history: dataPoints=${resHistory.data.dataPoints}`);

  // Summary
  const resSummary = await axios.get(`${BASE_URL}/api/metrics/summary`);
  console.log(`  ✓ GET /api/metrics/summary: up=${resSummary.data.overview.up}, down=${resSummary.data.overview.down}`);

  // Alerts
  const resAlerts = await axios.get(`${BASE_URL}/api/metrics/alerts`);
  console.log(`  ✓ GET /api/metrics/alerts: alertCount=${resAlerts.data.alertCount}, critical=${resAlerts.data.criticalCount}, warning=${resAlerts.data.warningCount}`);

  // System
  const resSys = await axios.get(`${BASE_URL}/api/metrics/system`);
  console.log(`  ✓ GET /api/metrics/system: cpuCores=${resSys.data.system.cpu.cores}`);

  // 4. Test WebSocket realtime updates
  console.log('\n5. Testing WebSocket (Socket.IO) Real-time Updates...');
  const socket = ioClient(BASE_URL, {
    transports: ['websocket'],
    reconnection: false,
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket connection timeout')), 4000);

    socket.on('connect', () => {
      console.log(`  ✓ Socket connected: id=${socket.id}`);
      socket.emit('subscribe:all');
      socket.emit('subscribe:service', { serviceId: 'identity' });
    });

    socket.on('metrics:all_latest', (data) => {
      console.log(`  ✓ Received 'metrics:all_latest' event (${Object.keys(data).length} services)`);
    });

    socket.on('metrics:update', (data) => {
      if (data.serviceId === 'identity') {
        console.log(`  ✓ Received 'metrics:update' for identity (status=${data.status}, latency=${data.scrapeLatencyMs}ms)`);
        clearTimeout(timeout);
        socket.disconnect();
        resolve();
      }
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  console.log('\n====================================================');
  console.log('🎉 ALL BACKEND AND COLLECTOR TESTS PASSED!');
  console.log('====================================================');

  process.exit(0);
}

// Allow app to bind port before testing
setTimeout(() => {
  runTests().catch((err) => {
    console.error('\n❌ Test failed:', err.message);
    if (err.response) {
      console.error('Response data:', err.response.data);
    }
    process.exit(1);
  });
}, 1000);
