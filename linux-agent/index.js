import fs from 'fs';
import path from 'path';
import { LinuxAgentClient } from './src/agent-client.js';
import { LinuxDiskDetector } from './src/disk-detector.js';
import { LinuxLoopbackServer } from './src/loopback-server.js';

console.log('========================================================');
console.log('   NKB CLOUD — LINUX STORAGE AGENT DAEMON v2.1.0');
console.log('========================================================');

const configPaths = [
  '/etc/nkb-cloud/agent-config.json',
  path.join(process.cwd(), 'agent-config.json'),
  path.join(process.env.HOME || '/root', '.nkb-cloud', 'agent-config.json')
];

let config = null;
for (const p of configPaths) {
  if (fs.existsSync(p)) {
    try {
      config = JSON.parse(fs.readFileSync(p, 'utf8'));
      console.log(`[LinuxAgent] Loaded configuration from ${p}`);
      break;
    } catch (_) {}
  }
}

const loopback = new LinuxLoopbackServer(51248);
loopback.start();

const detector = new LinuxDiskDetector();
detector.scanDrives().then((res) => {
  console.log(`[LinuxAgent] Detected ${res.volumes.length} storage volumes and ${res.devices.length} block devices.`);
  for (const v of res.volumes) {
    console.log(`  - [${v.filesystem}] ${v.assignedName} (${v.mountPath}): ${(v.freeBytes / 1e9).toFixed(1)} GB free`);
  }
});

if (config && config.serverUrl && config.agentId && config.agentToken) {
  const client = new LinuxAgentClient({
    serverUrl: config.serverUrl,
    agentId: config.agentId,
    agentToken: config.agentToken,
    privateKeyPath: config.keyPath || '/etc/nkb-cloud/keys/device_private.pem',
    onStatusChange: (newStatus) => {
      loopback.setContext({ status: newStatus });
    }
  });

  client.connect();

  process.on('SIGINT', () => {
    console.log('\n[LinuxAgent] Shutting down cleanly...');
    client.disconnect();
    loopback.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[LinuxAgent] Terminated by systemd...');
    client.disconnect();
    loopback.stop();
    process.exit(0);
  });
} else {
  console.log('[LinuxAgent] No enrollment configuration found. Running in UNENROLLED discovery state.');
  console.log('Enroll this device by running the NKB Cloud Linux deployment script.');
}
