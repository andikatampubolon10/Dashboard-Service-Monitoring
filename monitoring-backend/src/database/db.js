'use strict';

require('dotenv').config();

const dbType = (process.env.DB_TYPE || 'mysql').toLowerCase();

let pool = null;

if (dbType === 'mysql') {
  const mysql = require('mysql2/promise');

  pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'pahlawan.kencang.com',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    database: process.env.MYSQL_DATABASE || 'sotardoc_server_monitoring',
    user: process.env.MYSQL_USER || 'sotardoc_andika',
    password: process.env.MYSQL_PASSWORD || 'parlinggoman10',
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

  console.log(`[Database] MySQL pool configured for ${process.env.MYSQL_USER}@${process.env.MYSQL_HOST}/${process.env.MYSQL_DATABASE}`);
} else {
  const { Pool } = require('pg');

  pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'sotardoc_server_monitoring',
    user: process.env.PG_USER || 'sotardoc_andika',
    password: process.env.PG_PASSWORD || 'parlinggoman10',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    console.error('[PostgreSQL] Unexpected error on idle client:', err.message);
  });

  console.log(`[Database] PostgreSQL pool configured for ${process.env.PG_USER}@${process.env.PG_HOST}/${process.env.PG_DATABASE}`);
}

/**
 * Unified query method: returns { rows } for both MySQL and PostgreSQL
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
