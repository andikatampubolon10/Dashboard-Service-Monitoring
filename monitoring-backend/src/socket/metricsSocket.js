'use strict';

/**
 * socket/metricsSocket.js
 *
 * Socket.IO event handler for real-time dashboard client connections.
 *
 * Client can subscribe to:
 *  - 'subscribe:service' { serviceId } : get immediate snapshot + room stream
 *  - 'subscribe:all'                   : get all latest snapshots + room stream
 *  - 'subscribe:system'                : get latest system info + room stream
 */

const { getLatest, getAllLatest, getLatestSystemMetrics } = require('../store/metricsStore');
const { getServiceById } = require('../config/services.config');

/**
 * Initialize Socket.IO connection handling.
 * @param {import('socket.io').Server} io
 */
function initSocket(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Subscribe to a specific service
    socket.on('subscribe:service', ({ serviceId }) => {
      if (!serviceId) return;
      socket.join(`service:${serviceId}`);
      console.log(`[Socket] ${socket.id} subscribed to service:${serviceId}`);

      // Send immediate snapshot if available
      const latest = getLatest(serviceId);
      const service = getServiceById(serviceId);
      if (latest && service) {
        socket.emit('metrics:update', {
          serviceId,
          serviceName: service.name,
          timestamp: latest.timestamp,
          status: latest.status,
          scrapeLatencyMs: latest.scrapeLatencyMs,
          metrics: latest.metrics,
          error: latest.error,
        });
      }
    });

    // Unsubscribe from a service
    socket.on('unsubscribe:service', ({ serviceId }) => {
      if (!serviceId) return;
      socket.leave(`service:${serviceId}`);
      console.log(`[Socket] ${socket.id} unsubscribed from service:${serviceId}`);
    });

    // Subscribe to all services updates
    socket.on('subscribe:all', () => {
      socket.join('all');
      console.log(`[Socket] ${socket.id} subscribed to all services`);

      // Immediately send current state of all services
      const allLatest = getAllLatest();
      socket.emit('metrics:all_latest', allLatest);
    });

    // Subscribe to system host metrics
    socket.on('subscribe:system', () => {
      socket.join('system');
      console.log(`[Socket] ${socket.id} subscribed to system metrics`);

      const sysLatest = getLatestSystemMetrics();
      if (sysLatest) {
        socket.emit('system:update', sysLatest);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Client disconnected: ${socket.id} (${reason})`);
    });
  });
}

module.exports = { initSocket };
