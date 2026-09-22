const { Client: SshClient } = require('ssh2');
const fs = require('fs');

const servers = JSON.parse(fs.readFileSync('./data/registered_servers.json', 'utf8'));
const s2 = servers.find(s => s.host === '34.101.122.171');

const client = new SshClient();
client.on('ready', () => {
  client.exec('which node_exporter || find /usr -name "*node_exporter*" 2>/dev/null || systemctl list-unit-files | grep exporter', (err, stream) => {
    let out = '';
    stream.on('data', d => out += d.toString());
    stream.on('close', () => {
      console.log('NODE EXPORTER CHECK ON SERVER 2:');
      console.log(out);
      client.end();
    });
  });
}).connect({
  host: s2.host,
  port: s2.ssh.port || 22,
  username: s2.ssh.username,
  password: s2.ssh.password,
  passphrase: s2.ssh.passphrase || s2.ssh.password,
  privateKey: s2.ssh.privateKey
});
