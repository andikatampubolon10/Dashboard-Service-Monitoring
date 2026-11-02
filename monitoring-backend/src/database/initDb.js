'use strict';

require('dotenv').config();
const { dbType, query, pool } = require('./db');

async function initDatabase() {
  const dbLabel = process.env.DATABASE_URL
    ? `Neon PostgreSQL (DATABASE_URL)`
    : `${process.env.PG_USER}@${process.env.PG_HOST}/${process.env.PG_DATABASE}`;

  console.log(`[DB Init] Initializing tables on ${dbLabel}...`);

  // ─── server_metrics ───────────────────────────────────────────────────────
  await query(`
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
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_server_metrics_server_time
      ON server_metrics (server_id, recorded_at DESC)
  `);

  // ─── service_metrics ──────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS service_metrics (
      id BIGSERIAL PRIMARY KEY,
      service_id VARCHAR(100) NOT NULL,
      service_name VARCHAR(100),
      server_id VARCHAR(100),
      status VARCHAR(20) NOT NULL,
      response_time_ms NUMERIC(10,2),
      status_code INT,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_service_metrics_service_time
      ON service_metrics (service_id, recorded_at DESC)
  `);

  // ─── stress_test_runs ─────────────────────────────────────────────────────
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
      checks JSONB,
      target_endpoints JSONB,
      k6_metrics JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_stress_runs_project
      ON stress_test_runs (project_id, created_at DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_stress_runs_created
      ON stress_test_runs (created_at DESC)
  `);

  // ─── stress_test_flows ────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS stress_test_flows (
      id VARCHAR(64) PRIMARY KEY,
      project_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      auth_config JSONB,
      steps JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_flow_project
      ON stress_test_flows (project_id)
  `);

  // ─── projects ─────────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS projects (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      env VARCHAR(32) DEFAULT 'PRODUCTION',
      server_ids JSONB,
      alerts_json JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE projects ADD COLUMN IF NOT EXISTS alerts_json JSONB DEFAULT '[]'::jsonb;
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_projects_env ON projects (env);

    CREATE TABLE IF NOT EXISTS project_alerts (
      id VARCHAR(64) PRIMARY KEY,
      project_id VARCHAR(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      webhook_url TEXT NOT NULL,
      channel_label VARCHAR(100) DEFAULT '#monitoring-alerts',
      mentions VARCHAR(64) DEFAULT '',
      triggers_json JSONB DEFAULT '{"serverDown": true, "serviceDown": true, "onRecovery": true}'::jsonb,
      message_style VARCHAR(32) DEFAULT 'STANDARD',
      team_note TEXT DEFAULT '',
      use_custom_template BOOLEAN DEFAULT FALSE,
      custom_template TEXT DEFAULT '',
      is_enabled BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_project_alerts_project ON project_alerts (project_id);
  `);

  // ─── registered_servers ───────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS registered_servers (
      id VARCHAR(100) PRIMARY KEY,
      project_id VARCHAR(64),
      name VARCHAR(255) NOT NULL,
      display_name VARCHAR(255),
      description TEXT,
      host VARCHAR(255) NOT NULL,
      port INT DEFAULT 22,
      env VARCHAR(32) DEFAULT 'PRODUCTION',
      region VARCHAR(64) DEFAULT 'jakarta-idc',
      is_custom BOOLEAN DEFAULT TRUE,
      spec JSONB,
      service_ids JSONB,
      databases_json JSONB,
      ssh JSONB,
      colocation JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_servers_project_id ON registered_servers (project_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_servers_host ON registered_servers (host)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_servers_env ON registered_servers (env)`);

  // ─── registered_services ──────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS registered_services (
      id VARCHAR(100) PRIMARY KEY,
      server_id VARCHAR(100),
      name VARCHAR(255) NOT NULL,
      url VARCHAR(500) NOT NULL,
      metrics_path VARCHAR(255) DEFAULT '/metrics',
      stack VARCHAR(64) DEFAULT 'nodejs',
      description TEXT,
      port INT,
      databases_json JSONB,
      is_dynamic BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_services_server_id ON registered_services (server_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_services_stack ON registered_services (stack)`);

    // ─── alert_history (Log Pengiriman Notifikasi & Insiden) ──────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS alert_history (
      id BIGSERIAL PRIMARY KEY,
      project_id VARCHAR(64),
      project_name VARCHAR(255),
      alert_id VARCHAR(64),
      target_type VARCHAR(32) NOT NULL,
      target_name VARCHAR(255) NOT NULL,
      target_host VARCHAR(255),
      severity VARCHAR(32) NOT NULL,
      event_type VARCHAR(32) NOT NULL,
      error_message TEXT,
      duration_sec INT DEFAULT 0,
      channel_label VARCHAR(100),
      status VARCHAR(32) DEFAULT 'SENT',
      dispatch_error TEXT,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_alert_history_project ON alert_history (project_id, sent_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_alert_history_time ON alert_history (sent_at DESC)`);

  console.log(`[DB Init] ✅ Semua tabel PostgreSQL berhasil dibuat/diverifikasi!`);

  // Auto-migrate dari JSON files jika tabel masih kosong
  await autoMigrateJsonFilesToPostgres();

  console.log(`[DB Init] ✅ Inisialisasi database selesai.`);
}

/**
 * Auto-migrate existing projects, servers, and services from local JSON files to PostgreSQL.
 * Hanya berjalan jika tabel masih kosong (first-run).
 */
async function autoMigrateJsonFilesToPostgres() {
  const fs = require('fs');
  const path = require('path');

  const PROJECTS_FILE = path.join(__dirname, '../../data/projects.json');
  const SERVERS_FILE = path.join(__dirname, '../../data/registered_servers.json');
  const SERVICES_FILE = path.join(__dirname, '../../data/dynamic_services.json');

  const toTs = (val) => {
    if (!val) return new Date();
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  try {
    // 1. Migrate Projects
    const projCountRes = await query('SELECT COUNT(*) AS cnt FROM projects');
    const projCount = parseInt(projCountRes.rows[0]?.cnt || 0, 10);
    let projectServerMap = new Map();

    if (projCount === 0 && fs.existsSync(PROJECTS_FILE)) {
      console.log('[DB Init] Migrating projects from projects.json to PostgreSQL...');
      const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf-8'));

      for (const p of projects) {
        if (!p.id || !p.name) continue;
        const serverIds = Array.isArray(p.serverIds) ? p.serverIds : [];
        for (const sid of serverIds) projectServerMap.set(sid, p.id);

        await query(
          `INSERT INTO projects (id, name, description, env, server_ids, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             env = EXCLUDED.env,
             server_ids = EXCLUDED.server_ids,
             updated_at = EXCLUDED.updated_at`,
          [p.id, p.name, p.description || '', p.env || 'PRODUCTION', JSON.stringify(serverIds), toTs(p.createdAt), toTs(p.updatedAt)]
        );
      }
      console.log(`[DB Init] ✅ Berhasil migrasi ${projects.length} projek.`);
    } else {
      const existingProjects = await query('SELECT id, server_ids FROM projects');
      for (const p of existingProjects.rows) {
        const sids = Array.isArray(p.server_ids) ? p.server_ids : (typeof p.server_ids === 'string' ? JSON.parse(p.server_ids || '[]') : []);
        for (const sid of sids) projectServerMap.set(sid, p.id);
      }
    }

    // 2. Migrate Registered Servers
    const serverCountRes = await query('SELECT COUNT(*) AS cnt FROM registered_servers');
    const serverCount = parseInt(serverCountRes.rows[0]?.cnt || 0, 10);

    if (serverCount === 0 && fs.existsSync(SERVERS_FILE)) {
      console.log('[DB Init] Migrating registered servers...');
      const servers = JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf-8'));

      for (const s of servers) {
        if (!s.id || !s.name || !s.host) continue;
        const assignedProjectId = s.projectId || projectServerMap.get(s.id) || null;

        await query(
          `INSERT INTO registered_servers (
             id, project_id, name, display_name, description, host, port, env, region,
             is_custom, spec, service_ids, databases_json, ssh, colocation, created_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           ON CONFLICT (id) DO UPDATE SET
             project_id = EXCLUDED.project_id,
             name = EXCLUDED.name,
             display_name = EXCLUDED.display_name,
             host = EXCLUDED.host,
             spec = EXCLUDED.spec,
             service_ids = EXCLUDED.service_ids,
             databases_json = EXCLUDED.databases_json,
             updated_at = EXCLUDED.updated_at`,
          [
            s.id, assignedProjectId, s.name, s.displayName || s.name,
            s.description || '', s.host, s.port || 22, s.env || 'PRODUCTION',
            s.region || 'jakarta-idc', s.isCustom !== false,
            JSON.stringify(s.spec || {}), JSON.stringify(s.serviceIds || []),
            JSON.stringify(s.databases || []), JSON.stringify(s.ssh || null),
            JSON.stringify(s.colocation || {}), toTs(s.createdAt), toTs(s.updatedAt),
          ]
        );
      }
      console.log(`[DB Init] ✅ Berhasil migrasi ${servers.length} server.`);
    }

    // 3. Migrate Dynamic Services
    const serviceCountRes = await query('SELECT COUNT(*) AS cnt FROM registered_services');
    const serviceCount = parseInt(serviceCountRes.rows[0]?.cnt || 0, 10);

    if (serviceCount === 0 && fs.existsSync(SERVICES_FILE)) {
      console.log('[DB Init] Migrating dynamic services...');
      const services = JSON.parse(fs.readFileSync(SERVICES_FILE, 'utf-8'));

      const validServersRes = await query('SELECT id FROM registered_servers');
      const validServerIds = new Set(validServersRes.rows.map((r) => r.id));

      for (const svc of services) {
        if (!svc.id || !svc.name || !svc.url) continue;

        let targetServerId = svc.serverId || null;
        if (targetServerId && !validServerIds.has(targetServerId)) {
          const normalized = targetServerId.replace(/-(server-[12])$/, '');
          targetServerId = validServerIds.has(normalized) ? normalized : null;
        }

        await query(
          `INSERT INTO registered_services (
             id, server_id, name, url, metrics_path, stack, description, port,
             databases_json, is_dynamic, created_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (id) DO UPDATE SET
             server_id = EXCLUDED.server_id,
             name = EXCLUDED.name,
             url = EXCLUDED.url,
             metrics_path = EXCLUDED.metrics_path,
             stack = EXCLUDED.stack,
             updated_at = EXCLUDED.updated_at`,
          [
            svc.id, targetServerId, svc.name, svc.url,
            svc.metricsPath || '/metrics', svc.stack || 'nodejs',
            svc.description || '', svc.port || null,
            JSON.stringify(svc.databases || []), svc.isDynamic !== false,
            toTs(svc.createdAt), toTs(svc.updatedAt),
          ]
        );
      }
      console.log(`[DB Init] ✅ Berhasil migrasi ${services.length} service.`);
    }
  } catch (err) {
    console.error('[DB Init] Warning selama auto-migration JSON→PostgreSQL:', err.message);
  }
}

module.exports = {
  initDatabase,
  autoMigrateJsonFilesToPostgres,
  // Alias lama agar tidak break import lain
  autoMigrateJsonFilesToMysql: autoMigrateJsonFilesToPostgres,
};
