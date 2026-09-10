'use strict';

/**
 * app.js
 *
 * Entry point for the Dashboard Service Monitoring Backend.
 * Initializes Express, Socket.IO, Route handlers, and the Background Prometheus Scraper.
 */

require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const { setSocketServer, startCollector } = require('./collectors');
const { initSocket } = require('./socket/metricsSocket');

// Routes
const healthRoute = require('./routes/health.route');
const servicesRoute = require('./routes/services.route');
const metricsRoute = require('./routes/metrics.route');
const serversRoute = require('./routes/servers.route');
const { router: stressTestRoute, setSocketServer: setStressTestSocketServer } = require('./routes/stressTest.route');

// Middleware
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);

// Enable CORS for all incoming requests (dashboard frontend)
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(express.json());

// Serve static frontend files
const path = require('path');
app.use(express.static(path.join(__dirname, '../public')));

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Attach socket server to collectors for real-time broadcasts
setSocketServer(io);
setStressTestSocketServer(io);
initSocket(io);

// Mount API routes
app.use('/health', healthRoute);
app.use('/api/services', servicesRoute);
app.use('/api/metrics', metricsRoute);
app.use('/api/servers', serversRoute);
app.use('/api/stress-test', stressTestRoute);

// Centralized error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start HTTP & WebSocket server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Monitoring Backend running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Server ready`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Services API: http://localhost:${PORT}/api/services`);
  console.log(`📈 Metrics API: http://localhost:${PORT}/api/metrics/summary`);
  console.log(`====================================================`);

  // Start the background scraping process
  startCollector();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[App] Shutting down gracefully...');
  server.close(() => {
    console.log('[App] Server closed.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n[App] Received SIGTERM, shutting down...');
  server.close(() => {
    console.log('[App] Server closed.');
    process.exit(0);
  });
});

module.exports = { app, server };
