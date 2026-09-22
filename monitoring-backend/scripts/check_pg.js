const { Client } = require('pg');
require('dotenv').config();

async function run() {
  const client = new Client({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: 'sotardoc_server_monitoring',
    user: 'sotardoc_andika',
    password: process.env.PG_PASSWORD || 'parlinggoman10'
  });

  try {
    await client.connect();
    console.log('Connected successfully!');
    
    // Check current database & schema & search_path
    const cur = await client.query('SELECT current_database(), current_schema(), current_user, inet_server_port(), inet_server_addr()');
    console.log('Context:', JSON.stringify(cur.rows[0]));

    const sp = await client.query('SHOW search_path');
    console.log('search_path:', JSON.stringify(sp.rows[0]));

    // Check all tables across schemas
    const tables = await client.query(`
      SELECT table_catalog, table_schema, table_name, table_type 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
    `);
    console.log('Tables in sotardoc_server_monitoring:', JSON.stringify(tables.rows));

    // Check table owners and grants
    const pgtables = await client.query("SELECT schemaname, tablename, tableowner FROM pg_tables WHERE schemaname = 'public'");
    console.log('pg_tables:', JSON.stringify(pgtables.rows));

    const grants = await client.query("SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE table_name IN ('server_metrics', 'service_metrics')");
    console.log('Grants:', JSON.stringify(grants.rows));

    // Sample data from server_metrics
    const sample = await client.query("SELECT id, server_id, cpu_percent, mem_used_mb, recorded_at FROM server_metrics ORDER BY recorded_at DESC LIMIT 5");
    console.log('Sample rows in server_metrics:', JSON.stringify(sample.rows));

    const countRes = await client.query("SELECT COUNT(*) FROM server_metrics");
    console.log('Total server_metrics count:', countRes.rows[0].count);

    // Also grant permissions to postgres & PUBLIC so phpPgAdmin can view everything regardless of user
    await client.query("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, sotardoc_andika");
    await client.query("GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, sotardoc_andika");
    await client.query("GRANT ALL ON SCHEMA public TO PUBLIC");
    await client.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC");
    console.log('Granted permissions to postgres, sotardoc_andika, and PUBLIC on schema public.');

    // List all databases in this Postgres cluster
    const dbs = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
    console.log('Databases in cluster:', JSON.stringify(dbs.rows.map(r => r.datname)));

  } catch (err) {
    console.error('Connection error:', err);
  } finally {
    await client.end();
  }
}

run();
