import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const conn = new Client();

console.log('[DEPLOY] Connecting to VPS 187.77.143.211...');

conn.on('ready', () => {
  console.log('[DEPLOY] Connected to VPS. Initializing SFTP...');

  conn.sftp((err, sftp) => {
    if (err) {
      console.error('[SFTP ERROR]', err);
      conn.end();
      return;
    }

    async function uploadFile(localPath, remotePath) {
      return new Promise((resolve, reject) => {
        sftp.fastPut(localPath, remotePath, (err) => {
          if (err) {
            console.error(`[UPLOAD FAILED] ${localPath} -> ${remotePath}:`, err.message);
            reject(err);
          } else {
            console.log(`[UPLOAD OK] ${path.basename(localPath)} -> ${remotePath}`);
            resolve();
          }
        });
      });
    }

    async function ensureRemoteDir(remoteDir) {
      return new Promise((resolve) => {
        sftp.mkdir(remoteDir, () => resolve());
      });
    }

    async function uploadDir(localDir, remoteDir) {
      await ensureRemoteDir(remoteDir);
      const entries = fs.readdirSync(localDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullLocal = path.join(localDir, entry.name);
        const fullRemote = remoteDir + '/' + entry.name;
        if (entry.isDirectory()) {
          await uploadDir(fullLocal, fullRemote);
        } else {
          await uploadFile(fullLocal, fullRemote);
        }
      }
    }

    async function runDeploy() {
      try {
        console.log('[DEPLOY] 1. Uploading backend files...');
        await uploadFile(
          path.join(rootDir, 'server', 'controllers', 'driveController.js'),
          '/opt/nkb-cloud/server/controllers/driveController.js'
        );
        await uploadFile(
          path.join(rootDir, 'server', 'routes', 'api.js'),
          '/opt/nkb-cloud/server/routes/api.js'
        );

        console.log('[DEPLOY] 2. Uploading frontend dist bundle...');
        await uploadDir(
          path.join(rootDir, 'client', 'dist'),
          '/opt/nkb-cloud/frontend'
        );

        console.log('[DEPLOY] 3. Executing docker container sync and restart...');
        const remoteCmd = `
          docker cp /opt/nkb-cloud/server/controllers/driveController.js nkb_cloud_backend:/app/controllers/driveController.js &&
          docker cp /opt/nkb-cloud/server/routes/api.js nkb_cloud_backend:/app/routes/api.js &&
          docker restart nkb_cloud_backend &&
          docker restart nkb_cloud_frontend &&
          sleep 2 &&
          docker ps
        `;

        conn.exec(remoteCmd, (err, stream) => {
          if (err) {
            console.error('[EXEC ERROR]', err);
            conn.end();
            return;
          }
          stream.on('close', (code) => {
            console.log(`[DEPLOY FINISHED] Remote commands finished with exit code ${code}`);
            conn.end();
          }).on('data', (data) => {
            console.log(data.toString());
          }).stderr.on('data', (data) => {
            console.error('[STDERR]', data.toString());
          });
        });

      } catch (uploadErr) {
        console.error('[DEPLOY ABORTED]', uploadErr);
        conn.end();
      }
    }

    runDeploy();
  });
}).on('error', (err) => {
  console.error('[SSH ERROR]', err.message);
}).connect({
  host: '187.77.143.211',
  port: 22,
  username: 'root',
  password: 'NkbManufacturing@2025',
  readyTimeout: 30000
});
