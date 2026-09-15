const { Client } = require('ssh2');
const fs = require('fs');
const servers = JSON.parse(fs.readFileSync('./data/registered_servers.json', 'utf8'));
const s = servers.find(x => x.host === '34.101.207.115');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('df -h / && echo "--- DOCKER DISK ---" && docker system df', (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
}).connect({
  host: s.host,
  port: s.ssh.port,
  username: s.ssh.username,
  privateKey: s.ssh.privateKey,
  passphrase: s.ssh.password
});
