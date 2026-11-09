import { Service } from 'node-windows';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svc = new Service({
  name: 'NKBCloudStorageAgent',
  description: 'NKB Cloud Background Storage Service for Local HDDs & SSDs',
  script: path.join(__dirname, 'index.js'),
  nodeOptions: ['--harmony'],
  wait: 2,
  grow: .5
});

svc.on('install', () => {
  console.log('[Windows Service] NKB Cloud Storage Agent installed successfully.');
  console.log('[Windows Service] Starting service now...');
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('[Windows Service] Service is already installed.');
});

svc.install();
