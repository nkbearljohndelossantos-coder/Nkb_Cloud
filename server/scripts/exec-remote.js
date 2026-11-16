import { Client } from 'ssh2';

const cmd = process.argv[2] || 'docker ps';

const conn = new Client();
conn.on('ready', () => {
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', (code) => {
      conn.end();
      process.exit(code || 0);
    });
  });
}).on('error', (err) => {
  console.error('[SSH ERROR]', err.message);
  process.exit(1);
}).connect({
  host: '187.77.143.211',
  port: 22,
  username: 'root',
  password: 'NkbManufacturing@2025'
});
