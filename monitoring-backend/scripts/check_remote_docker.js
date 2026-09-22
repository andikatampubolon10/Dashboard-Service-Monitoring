const { Client } = require('ssh2');

function checkServer(host, name) {
  return new Promise((resolve) => {
    const conn = new Client();
    conn.on('ready', () => {
      console.log(`SSH connected to ${name} (${host})`);
      conn.exec('docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"', (err, stream) => {
        if (err) {
          console.error(err);
          conn.end();
          return resolve();
        }
        let out = '';
        stream.on('data', (d) => { out += d; });
        stream.on('close', () => {
          console.log(`--- ${name} Docker Containers ---`);
          console.log(out);
          conn.end();
          resolve();
        });
      });
    });
    conn.on('error', (e) => {
      console.log(`SSH error ${name}:`, e.message);
      resolve();
    });
    conn.connect({
      host,
      port: 22,
      username: 'InaAI',
      password: 'bpjs123!'
    });
  });
}

async function run() {
  await checkServer('34.101.207.115', 'Server 1');
  await checkServer('34.101.122.171', 'Server 2');
}

run();
