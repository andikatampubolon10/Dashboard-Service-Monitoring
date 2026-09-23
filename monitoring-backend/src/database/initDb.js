'use strict';

require('dotenv').config();
const { dbType, query } = require('./db');

async function initDatabase() {
  if (dbType === 'mysql') {
    const host = process.env.MYSQL_HOST || 'pahlawan.kencang.com';
    const targetDb = process.env.MYSQL_DATABASE || 'sotardoc_server_monitoring';
    const targetUser = process.env.MYSQL_USER || 'sotardoc_andika';

    console.log(`[DB Init] Initializing MySQL tables on ${host} for DB "${targetDb}" (user: ${targetUser})...`);

    // Table 1: server_metrics
    await query(`
      CREATE TABLE IF NOT EXISTS server_metrics (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        server_id VARCHAR(100) NOT NULL,
        server_name VARCHAR(100),
        cpu_percent DECIMAL(5,2),
        mem_used_mb DECIMAL(10,2),
        mem_total_mb DECIMAL(10,2),
        mem_cached_mb DECIMAL(10,2) DEFAULT 0,
        mem_buffers_mb DECIMAL(10,2) DEFAULT 0,
        disk_used_gb DECIMAL(10,2),
        disk_total_gb DECIMAL(10,2),
        load_1m DECIMAL(6,2) DEFAULT 0,
        load_5m DECIMAL(6,2) DEFAULT 0,
        load_15m DECIMAL(6,2) DEFAULT 0,
        net_rx_bytes_sec DECIMAL(15,2) DEFAULT 0,
        net_tx_bytes_sec DECIMAL(15,2) DEFAULT 0,
        disk_read_bytes_sec DECIMAL(15,2) DEFAULT 0,
        disk_write_bytes_sec DECIMAL(15,2) DEFAULT 0,
        recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_server_metrics_server_time (server_id, recorded_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Table 2: service_metrics
    await query(`
      CREATE TABLE IF NOT EXISTS service_metrics (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        service_id VARCHAR(100) NOT NULL,
        service_name VARCHAR(100),
        server_id VARCHAR(100),
        status VARCHAR(20) NOT NULL,
        response_time_ms DECIMAL(10,2),
        status_code INT,
        recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_service_metrics_service_time (service_id, recorded_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Table 3: stress_test_runs (k6 Stress & Load Testing History)
    await query(`
      CREATE TABLE IF NOT EXISTS stress_test_runs (
        id VARCHAR(64) PRIMARY KEY,
        project_id VARCHAR(64),
        project_name VARCHAR(255),
        flow_id VARCHAR(64),
        flow_name VARCHAR(255),
        test_type VARCHAR(32) DEFAULT 'load_test',
        target_vus INT NOT NULL DEFAULT 1,
        duration_sec INT NOT NULL DEFAULT 30,
        total_requests INT DEFAULT 0,
        success_requests INT DEFAULT 0,
        failed_requests INT DEFAULT 0,
        error_rate_percent DECIMAL(5,2) DEFAULT 0.00,
        current_rps INT DEFAULT 0,
        p95_latency_ms INT DEFAULT 0,
        p90_latency_ms INT DEFAULT 0,
        avg_latency_ms INT DEFAULT 0,
        min_latency_ms INT DEFAULT 0,
        max_latency_ms INT DEFAULT 0,
        health_grade VARCHAR(16) DEFAULT 'HEALTHY',
        health_verdict TEXT,
        failure_point JSON,
        checks JSON,
        target_endpoints JSON,
        k6_metrics JSON,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_stress_runs_project (project_id, created_at),
        INDEX idx_stress_runs_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log(`[DB Init] ✅ MySQL tables created/verified successfully in "${targetDb}"!`);
    return;
  }

  // PostgreSQL fallback
  const { Client } = require('pg');
  const host = process.env.PG_HOST || 'localhost';
  const port = parseInt(process.env.PG_PORT || '5432', 10);
  const targetDb = process.env.PG_DATABASE || 'sotardoc_server_monitoring';
  const targetUser = process.env.PG_USER || 'sotardoc_andika';
  const targetPassword = process.env.PG_PASSWORD || 'parlinggoman10';

  console.log(`[DB Init] Verifying PostgreSQL connection for ${targetUser}@${host}:${port}/${targetDb}...`);

  const client = new Client({
    host,
    port,
    database: targetDb,
    user: targetUser,
    password: targetPassword,
  });

  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS server_metrics (
      id BIGSERIAL PRIMARY KEY,
      server_id VARCHAR(100) NOT NULL,
      server_name VARCHAR(100),
      cpu_percent NUMERIC(5,2),
      mem_used_mb NUMERIC(10,2),
      mem_total_mb NUMERIC(10,2),
      mem_cached_mb NUMERIC(10,2) DEFAULT 0,
      mem_buffers_mb NUMERIC(10,2) DEFAULT 0,
      disk_used_gb NUMERIC(10,2),
      disk_total_gb NUMERIC(10,2),
      load_1m NUMERIC(6,2) DEFAULT 0,
      load_5m NUMERIC(6,2) DEFAULT 0,
      load_15m NUMERIC(6,2) DEFAULT 0,
      net_rx_bytes_sec NUMERIC(15,2) DEFAULT 0,
      net_tx_bytes_sec NUMERIC(15,2) DEFAULT 0,
      disk_read_bytes_sec NUMERIC(15,2) DEFAULT 0,
      disk_write_bytes_sec NUMERIC(15,2) DEFAULT 0,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_server_metrics_server_time 
      ON server_metrics (server_id, recorded_at DESC);

    CREATE TABLE IF NOT EXISTS service_metrics (
      id BIGSERIAL PRIMARY KEY,
      service_id VARCHAR(100) NOT NULL,
      service_name VARCHAR(100),
      server_id VARCHAR(100),
      status VARCHAR(20) NOT NULL,
      response_time_ms NUMERIC(10,2),
      status_code INT,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_service_metrics_service_time 
      ON service_metrics (service_id, recorded_at DESC);
  `);

  await client.end();
  console.log(`[DB Init] ✅ PostgreSQL tables verified successfully!`);
}

module.exports = {
  initDatabase,
};
