'use strict';

/**
 * middleware/errorHandler.js
 *
 * Centralized error handling and 404 middleware for Express.
 */

function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
  });
}

function errorHandler(err, req, res, next) {
  console.error('[Error]', err.stack || err.message);

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
