import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

const conn = new Client();

function run(cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => process.stdout.write(d.toString()));
      stream.stderr.on('data', d => process.stderr.write(d.toString()));
      stream.on('close', code => code === 0 ? resolve(out) : reject(new Error(`Exit ${code}: ${cmd}`)));
    });
  });
}

function sftpUpload(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    const rs = fs.createReadStream(localPath);
    const ws = sftp.createWriteStream(remotePath);
    ws.on('close', resolve);
    ws.on('error', reject);
    rs.on('error', reject);
    rs.pipe(ws);
  });
}

conn.on('ready', async () => {
  try {
    console.log('[PUSH] Uploading git bundle to VPS...');
    const sftp = await new Promise((res, rej) => conn.sftp((err, s) => err ? rej(err) : res(s)));
    await sftpUpload(sftp, 'nkb_drive.bundle', '/tmp/nkb_drive.bundle');

    console.log('[PUSH] Updating git repository on VPS and pushing to GitHub origin main...');
    await run(`
      cd /opt/nkb-cloud
      git fetch /tmp/nkb_drive.bundle main
      git reset --hard FETCH_HEAD
      git push origin main
      rm -f /tmp/nkb_drive.bundle
      git log -1 --oneline
    `);

    console.log('[PUSH] Successfully synced to VPS and pushed to GitHub main branch!');
    conn.end();
  } catch (err) {
    console.error('[PUSH ERROR]', err.message);
    conn.end();
  }
}).on('error', (err) => {
  console.error('[SSH ERROR]', err.message);
}).connect({
  host: '187.77.143.211',
  port: 22,
  username: 'root',
  password: 'NkbManufacturing@2025'
});
