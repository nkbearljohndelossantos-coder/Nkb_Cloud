import http from 'http';
import os from 'os';

export class LinuxLoopbackServer {
  constructor(port = 51248) {
    this.port = port;
    this.status = 'PENDING';
    this.version = '2.1.0';
    this.keyFingerprint = null;
    this.server = null;
  }

  setContext({ status, version, keyFingerprint }) {
    if (status) this.status = status;
    if (version) this.version = version;
    if (keyFingerprint) this.keyFingerprint = keyFingerprint;
  }

  start() {
    this.server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url === '/status') {
        const payload = {
          installed: true,
          agentVersion: this.version,
          platform: 'Linux',
          osRelease: `${os.type()} ${os.release()}`,
          machineName: os.hostname(),
          status: this.status,
          authenticated: this.status === 'ONLINE',
          keyFingerprint: this.keyFingerprint ? this.keyFingerprint.substring(0, 16) : null,
          loopbackPort: this.port
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      console.log(`[LinuxLoopback] Status probe listening on http://127.0.0.1:${this.port}/status`);
    });

    this.server.on('error', (err) => {
      console.warn(`[LinuxLoopback] Warning: Could not bind loopback port ${this.port}: ${err.message}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}
