import { Service } from 'node-windows';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svc = new Service({
  name: 'NKBCloudStorageAgent',
  script: path.join(__dirname, 'index.js')
});

svc.on('uninstall', () => {
  console.log('[Windows Service] NKB Cloud Storage Agent uninstalled successfully.');
});

svc.uninstall();
