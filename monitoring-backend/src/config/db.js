'use strict';

/**
 * config/db.js
 * PostgreSQL (NeonDB / Cloud Database) Connection Pool and Initialization.
 */

const { Pool } = require('pg');

let pool = null;
let isConnected = false;

function getDatabaseUrl() {
  return process.env.DATABASE_URL || '';
}

function initPool() {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    console.log('[NeonDB] ⚠️ DATABASE_URL belum diatur di .env. Riwayat stress test sementara disimpan in-memory/file.');
    return null;
  }

  try {
    const isSslNeeded = dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=require');
    pool = new Pool({
      connectionString: dbUrl,
      ssl: isSslNeeded ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.error('[NeonDB Pool Error]', err.message);
      isConnected = false;
    });

    return pool;
  } catch (err) {
    console.error('[NeonDB Init Error]', err.message);
    return null;
  }
}

/**
 * Inisialisasi koneksi dan pastikan skema tabel stress_test_runs sudah siap
 */
async function initDb() {
  if (!pool) {
    pool = initPool();
  }

  if (!pool) return false;

  try {
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT NOW() AS connected_time, current_database() AS db_name');
      isConnected = true;
      console.log(`[NeonDB] ✅ Berhasil terhubung ke database "${res.rows[0].db_name}" pada ${res.rows[0].connected_time}`);

      // Auto-provision table jika belum ada
      const createTableSql = `
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
            error_rate_percent NUMERIC(5,2) DEFAULT 0.00,
            current_rps INT DEFAULT 0,
            p95_latency_ms INT DEFAULT 0,
            p90_latency_ms INT DEFAULT 0,
            avg_latency_ms INT DEFAULT 0,
            min_latency_ms INT DEFAULT 0,
            max_latency_ms INT DEFAULT 0,
            
            health_grade VARCHAR(16) DEFAULT 'HEALTHY',
            health_verdict TEXT,
            failure_point JSONB,
            
            checks JSONB DEFAULT '[]'::jsonb,
            target_endpoints JSONB DEFAULT '{}'::jsonb,
            k6_metrics JSONB DEFAULT '{}'::jsonb,
            
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_stress_runs_project ON stress_test_runs(project_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_stress_runs_created ON stress_test_runs(created_at DESC);
      `;

      await client.query(createTableSql);
      console.log('[NeonDB] 📊 Skema tabel "stress_test_runs" terverifikasi dan siap digunakan.');
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[NeonDB Connection Failed]', err.message);
    isConnected = false;
    return false;
  }
}

/**
 * Execute a query with safe error catch
 */
async function query(text, params) {
  if (!pool) {
    pool = initPool();
  }
  if (!pool) {
    throw new Error('Database pool belum diinisialisasi (DATABASE_URL belum diatur).');
  }
  return pool.query(text, params);
}

function isDbConnected() {
  return isConnected;
}

module.exports = {
  initDb,
  query,
  getPool: () => pool,
  isDbConnected,
};
