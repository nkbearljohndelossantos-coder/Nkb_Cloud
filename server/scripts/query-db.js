import { Client } from 'ssh2';

const sql = process.argv[2] || 'SELECT id, username, email FROM users;';
const conn = new Client();
conn.on('ready', () => {
  conn.exec(`docker exec -i nkb_cloud_postgres psql -U nkb_cloud_admin -d nkb_cloud_production`, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => { conn.end(); process.exit(0); });
    stream.write(sql);
    stream.end();
  });
}).connect({ host: '187.77.143.211', port: 22, username: 'root', password: 'NkbManufacturing@2025' });
