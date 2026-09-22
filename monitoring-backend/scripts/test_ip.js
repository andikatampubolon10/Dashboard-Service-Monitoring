const { Client } = require('pg');

async function testCred(host, port, user, password, database) {
  const client = new Client({ host, port, user, password, database });
  try {
    await client.connect();
    const v = await client.query('SELECT version(), current_user, current_database()');
    console.log(`SUCCESS [${host}:${port}] user=${user} db=${database} =>`, v.rows[0]);
    
    // Check tables
    const t = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('Tables in public schema on this DB:', t.rows);

    await client.end();
    return true;
  } catch (err) {
    console.log(`FAIL [${host}:${port}] user=${user} db=${database} => ${err.message}`);
    try { await client.end(); } catch {}
    return false;
  }
}

async function main() {
  console.log('Testing 127.0.0.200...');
  await testCred('127.0.0.200', 5432, 'sotardoc', 'parlinggoman10', 'sotardoc_server_monitoring');
  await testCred('127.0.0.200', 5432, 'sotardoc_andika', 'parlinggoman10', 'sotardoc_server_monitoring');
  await testCred('127.0.0.200', 5432, 'postgres', 'parlinggoman10', 'sotardoc_server_monitoring');
  await testCred('127.0.0.200', 5432, 'sotardoc', 'parlinggoman10', 'postgres');
  await testCred('127.0.0.200', 5432, 'postgres', 'postgres', 'postgres');
}

main();
