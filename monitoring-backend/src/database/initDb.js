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
    // Table 3: projects (Domain Induk)
    await query(`
      CREATE TABLE IF NOT EXISTS projects (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        env VARCHAR(32) DEFAULT 'PRODUCTION',
        server_ids JSON,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_projects_env (env)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Table 4: registered_servers (Berelasi ke projects via project_id)
    await query(`
      CREATE TABLE IF NOT EXISTS registered_servers (
        id VARCHAR(100) PRIMARY KEY,
        project_id VARCHAR(64) NULL,
        name VARCHAR(255) NOT NULL,
        display_name VARCHAR(255),
        description TEXT,
        host VARCHAR(255) NOT NULL,
        port INT DEFAULT 22,
        env VARCHAR(32) DEFAULT 'PRODUCTION',
        region VARCHAR(64) DEFAULT 'jakarta-idc',
        is_custom BOOLEAN DEFAULT TRUE,
        spec JSON,
        service_ids JSON,
        databases_json JSON,
        ssh JSON,
        colocation JSON,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_servers_project_id (project_id),
        INDEX idx_servers_host (host),
        INDEX idx_servers_env (env),
        CONSTRAINT fk_servers_project FOREIGN KEY (project_id) 
          REFERENCES projects(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Table 5: registered_services (Berelasi ke registered_servers via server_id)
    await query(`
      CREATE TABLE IF NOT EXISTS registered_services (
        id VARCHAR(100) PRIMARY KEY,
        server_id VARCHAR(100) NULL,
        name VARCHAR(255) NOT NULL,
        url VARCHAR(500) NOT NULL,
        metrics_path VARCHAR(255) DEFAULT '/metrics',
        stack VARCHAR(64) DEFAULT 'nodejs',
        description TEXT,
        port INT,
        databases_json JSON,
        is_dynamic BOOLEAN DEFAULT TRUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_services_server_id (server_id),
        INDEX idx_services_stack (stack),
        CONSTRAINT fk_services_server FOREIGN KEY (server_id) 
          REFERENCES registered_servers(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Run auto-migration from local JSON files if tables are empty
    await autoMigrateJsonFilesToMysql();

    console.log(`[DB Init] ✅ Seluruh tabel MySQL (projects, servers, services, metrics) berhasil diverifikasi dan disinkronkan di "${targetDb}"!`);
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

/**
 * Auto-migrate existing projects, servers, and services from local JSON files to MySQL
 */
async function autoMigrateJsonFilesToMysql() {
  const fs = require('fs');
  const path = require('path');

  const PROJECTS_FILE = path.join(__dirname, '../../data/projects.json');
  const SERVERS_FILE = path.join(__dirname, '../../data/registered_servers.json');
  const SERVICES_FILE = path.join(__dirname, '../../data/dynamic_services.json');

  const toSqlDateTime = (val) => {
    if (!val) return new Date();
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  try {
    // 1. Migrate Projects
    const projCountRes = await query('SELECT COUNT(*) AS cnt FROM projects');
    const projCount = parseInt(projCountRes.rows[0]?.cnt || 0, 10);
    let projectServerMap = new Map(); // serverId -> projectId

    if (projCount === 0 && fs.existsSync(PROJECTS_FILE)) {
      console.log('[DB Init] Migrating projects from projects.json to MySQL...');
      const raw = fs.readFileSync(PROJECTS_FILE, 'utf-8');
      const projects = JSON.parse(raw);

      for (const p of projects) {
        if (!p.id || !p.name) continue;
        const serverIds = Array.isArray(p.serverIds) ? p.serverIds : [];
        for (const sid of serverIds) {
          projectServerMap.set(sid, p.id);
        }

        await query(
          `INSERT INTO projects (id, name, description, env, server_ids, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), env = VALUES(env), server_ids = VALUES(server_ids), updated_at = VALUES(updated_at)`,
          [
            p.id,
            p.name,
            p.description || '',
            p.env || 'PRODUCTION',
            JSON.stringify(serverIds),
            toSqlDateTime(p.createdAt),
            toSqlDateTime(p.updatedAt),
          ]
        );
      }
      console.log(`[DB Init] ✅ Berhasil migrasi ${projects.length} projek ke tabel "projects"!`);
    } else {
      // Build projectServerMap from existing MySQL projects table
      const existingProjects = await query('SELECT id, server_ids FROM projects');
      for (const p of existingProjects.rows) {
        const sids = typeof p.server_ids === 'string' ? JSON.parse(p.server_ids || '[]') : (p.server_ids || []);
        if (Array.isArray(sids)) {
          for (const sid of sids) {
            projectServerMap.set(sid, p.id);
          }
        }
      }
    }

    // 2. Migrate Registered Servers
    const serverCountRes = await query('SELECT COUNT(*) AS cnt FROM registered_servers');
    const serverCount = parseInt(serverCountRes.rows[0]?.cnt || 0, 10);

    if (serverCount === 0 && fs.existsSync(SERVERS_FILE)) {
      console.log('[DB Init] Migrating registered servers from registered_servers.json to MySQL...');
      const raw = fs.readFileSync(SERVERS_FILE, 'utf-8');
      const servers = JSON.parse(raw);

      for (const s of servers) {
        if (!s.id || !s.name || !s.host) continue;
        const assignedProjectId = s.projectId || projectServerMap.get(s.id) || null;

        await query(
          `INSERT INTO registered_servers (
            id, project_id, name, display_name, description, host, port, env, region,
            is_custom, spec, service_ids, databases_json, ssh, colocation, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            project_id = VALUES(project_id),
            name = VALUES(name),
            display_name = VALUES(display_name),
            description = VALUES(description),
            host = VALUES(host),
            port = VALUES(port),
            env = VALUES(env),
            spec = VALUES(spec),
            service_ids = VALUES(service_ids),
            databases_json = VALUES(databases_json),
            updated_at = VALUES(updated_at)`,
          [
            s.id,
            assignedProjectId,
            s.name,
            s.displayName || s.name,
            s.description || '',
            s.host,
            s.port || 22,
            s.env || 'PRODUCTION',
            s.region || 'jakarta-idc',
            s.isCustom !== false ? 1 : 0,
            JSON.stringify(s.spec || {}),
            JSON.stringify(s.serviceIds || []),
            JSON.stringify(s.databases || []),
            JSON.stringify(s.ssh || null),
            JSON.stringify(s.colocation || {}),
            toSqlDateTime(s.createdAt),
            toSqlDateTime(s.updatedAt),
          ]
        );
      }
      console.log(`[DB Init] ✅ Berhasil migrasi ${servers.length} server ke tabel "registered_servers"!`);
    }

    // 3. Migrate Dynamic Services
    const serviceCountRes = await query('SELECT COUNT(*) AS cnt FROM registered_services');
    const serviceCount = parseInt(serviceCountRes.rows[0]?.cnt || 0, 10);

    if (serviceCount === 0 && fs.existsSync(SERVICES_FILE)) {
      console.log('[DB Init] Migrating dynamic services from dynamic_services.json to MySQL...');
      const raw = fs.readFileSync(SERVICES_FILE, 'utf-8');
      const services = JSON.parse(raw);

      // Fetch all valid server IDs to ensure foreign key integrity
      const validServersRes = await query('SELECT id FROM registered_servers');
      const validServerIds = new Set(validServersRes.rows.map((r) => r.id));

      for (const svc of services) {
        if (!svc.id || !svc.name || !svc.url) continue;

        let targetServerId = svc.serverId || null;
        if (targetServerId && !validServerIds.has(targetServerId)) {
          const normalized = targetServerId.replace(/-(server-[12])$/, '');
          if (validServerIds.has(normalized)) {
            targetServerId = normalized;
          } else {
            targetServerId = null;
          }
        }

        await query(
          `INSERT INTO registered_services (
            id, server_id, name, url, metrics_path, stack, description, port, databases_json, is_dynamic, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            server_id = VALUES(server_id),
            name = VALUES(name),
            url = VALUES(url),
            metrics_path = VALUES(metrics_path),
            stack = VALUES(stack),
            description = VALUES(description),
            port = VALUES(port),
            databases_json = VALUES(databases_json),
            updated_at = VALUES(updated_at)`,
          [
            svc.id,
            targetServerId,
            svc.name,
            svc.url,
            svc.metricsPath || '/metrics',
            svc.stack || 'nodejs',
            svc.description || '',
            svc.port || null,
            JSON.stringify(svc.databases || []),
            svc.isDynamic !== false ? 1 : 0,
            toSqlDateTime(svc.createdAt),
            toSqlDateTime(svc.updatedAt),
          ]
        );
      }
      console.log(`[DB Init] ✅ Berhasil migrasi ${services.length} service ke tabel "registered_services"!`);
    }
  } catch (err) {
    console.error('[DB Init] Warning during JSON-to-MySQL auto-migration:', err.message);
  }
}

module.exports = {
  initDatabase,
  autoMigrateJsonFilesToMysql,
};

