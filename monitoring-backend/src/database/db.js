'use strict';

require('dotenv').config();

const dbType = (process.env.DB_TYPE || 'postgres').toLowerCase();

let pool = null;

if (dbType === 'mysql') {
  const mysql = require('mysql2/promise');

  pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    database: process.env.MYSQL_DATABASE || 'monitoring',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

  console.log(`[Database] MySQL pool configured for ${process.env.MYSQL_USER}@${process.env.MYSQL_HOST}/${process.env.MYSQL_DATABASE}`);
} else {
  // PostgreSQL — mendukung DATABASE_URL (Neon, Supabase, dsb.) atau env terpisah
  const { Pool } = require('pg');

  const connectionConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        // SSL wajib untuk Neon pooler
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
    : {
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || '5432', 10),
        database: process.env.PG_DATABASE || 'monitoring',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      };

  pool = new Pool(connectionConfig);

  pool.on('error', (err) => {
    console.error('[PostgreSQL] Unexpected error on idle client:', err.message);
  });

  const dbLabel = process.env.DATABASE_URL
    ? `Neon (DATABASE_URL)`
    : `${process.env.PG_USER}@${process.env.PG_HOST}/${process.env.PG_DATABASE}`;

  console.log(`[Database] PostgreSQL pool configured → ${dbLabel}`);
}

/**
 * Unified query method: returns { rows } for both MySQL and PostgreSQL.
 *
 * MySQL uses `?` placeholders; PostgreSQL uses `$1, $2, ...`
 * Untuk kompatibilitas, caller HARUS sudah pakai format yang sesuai dbType,
 * ATAU gunakan helper `sql()` di bawah untuk auto-convert.
 *
 * @param {string} sql
 * @param {Array<any>} params
 */
async function query(sql, params = []) {
  if (dbType === 'mysql') {
    const [rows] = await pool.query(sql, params);
    return { rows: Array.isArray(rows) ? rows : [] };
  } else {
    return await pool.query(sql, params);
  }
}

module.exports = {
  query,
  pool,
  dbType,
};
