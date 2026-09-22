const { Client } = require('ssh2');
const fs = require('fs');

const servers = JSON.parse(fs.readFileSync('d:/Dashboard-Service-Monitoring/monitoring-backend/data/registered_servers.json', 'utf8'));

async function inspect(srv) {
  return new Promise((resolve) => {
    const conn = new Client();
    conn.on('ready', () => {
      console.log(`SSH ready on ${srv.host}`);
      conn.exec('uname -a; psql --version || true; which psql; netstat -tlpn || ss -tlpn', (err, stream) => {
        if (err) { console.error(err); conn.end(); return resolve(); }
        let out = '';
        stream.on('data', d => out += d);
        stream.on('close', () => {
          console.log(`=== Output from ${srv.host} ===\n${out}`);
          conn.end();
          resolve();
        });
      });
    });
    conn.on('error', err => {
      console.log(`Error on ${srv.host}:`, err.message);
      resolve();
    });
    conn.connect({
      host: srv.host,
      port: srv.ssh.port || 22,
      username: srv.ssh.username,
      privateKey: srv.ssh.privateKey,
      passphrase: srv.ssh.passphrase || srv.ssh.password
    });
  });
}

async function main() {
  for (const s of servers) {
    await inspect(s);
  }
}

main();
