import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  const cmd = `docker exec nkb_cloud_backend node -e "import('./config/db.js').then(async m => { const db = m.default; await db.query('ALTER TABLE file_shares DROP CONSTRAINT IF EXISTS file_shares_permission_level_check;'); await db.query('ALTER TABLE file_shares ADD CONSTRAINT file_shares_permission_level_check CHECK (permission_level IN (\\'VIEW\\', \\'EDIT\\', \\'DOWNLOAD_ONLY\\', \\'VIEWER\\', \\'EDITOR\\', \\'CONTRIBUTOR\\', \\'DOWNLOADER\\'));'); console.log('Constraint updated successfully'); process.exit(0); })"`;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
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
