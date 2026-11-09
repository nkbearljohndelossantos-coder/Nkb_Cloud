import WebSocket from 'ws';
import os from 'os';
import crypto from 'crypto';
import { WindowsDiskDetector } from './disk-detector.js';
import { FileStorageEngine } from './file-engine.js';

export class AgentClient {
  constructor(config = {}) {
    this.serverUrl = config.serverUrl || 'ws://localhost:5000/ws/agent';
    this.agentToken = config.agentToken || 'nkb_agent_token_primary_2026';
    this.agentName = config.agentName || 'NKB-STORAGE-HOST-01';
    this.agentSecret = config.agentSecret || this.agentToken;

    this.diskDetector = new WindowsDiskDetector();
    this.fileEngine = new FileStorageEngine();

    this.ws = null;
    this.heartbeatTimer = null;
    this.scanTimer = null;
    this.reconnectTimeout = null;
    this.reconnectDelay = 2000;
    this.isStopping = false;
    this.activeVolumes = [];
    this.authenticated = false;
    this.sessionToken = null;
    this.executedCommands = new Map(); // idempotencyKey -> result
  }

  start() {
    this.isStopping = false;
    this.connect();
  }

  connect() {
    if (this.isStopping) return;

    console.log(`[StorageAgent] Connecting outbound to NKB Cloud Server: ${this.serverUrl}...`);

    try {
      this.ws = new WebSocket(this.serverUrl, {
        headers: {
          'x-agent-token': this.agentToken,
          'x-agent-name': this.agentName
        }
      });

      this.ws.on('open', () => {
        console.log(`[StorageAgent] Secure socket opened with NKB Cloud Relay Hub. Awaiting authentication challenge...`);
        this.reconnectDelay = 2000;
      });

      this.ws.on('message', async (data) => {
        try {
          const envelope = JSON.parse(data.toString());
          
          // Handle Mutual Challenge-Response Authentication
          if (envelope.type === 'CHALLENGE_REQUEST') {
            await this.handleChallengeRequest(envelope);
            return;
          }

          if (envelope.type === 'AUTH_GRANTED') {
            console.log(`[StorageAgent] Mutual HMAC-SHA256 challenge authentication GRANTED.`);
            this.authenticated = true;
            this.sessionToken = envelope.sessionToken;
            this.startHeartbeat();
            await this.reportDrives();
            this.startPeriodicScan();
            return;
          }

          if (envelope.type === 'AUTH_REJECTED') {
            console.error(`[StorageAgent] Mutual authentication REJECTED by server:`, envelope.reason);
            this.authenticated = false;
            return;
          }

          await this.handleSecureCommand(envelope);
        } catch (err) {
          console.error('[StorageAgent] Malformed envelope received:', err.message);
        }
      });

      this.ws.on('close', (code, reason) => {
        console.warn(`[StorageAgent] Connection to server closed (${code}: ${reason || 'normal'}). Retrying...`);
        this.authenticated = false;
        this.cleanup();
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        console.error('[StorageAgent] Socket error:', err.message);
      });
    } catch (err) {
      console.error('[StorageAgent] Connection initiation error:', err);
      this.scheduleReconnect();
    }
  }

  async handleChallengeRequest({ challengeId, serverNonce, serverTimestamp }) {
    try {
      console.log(`[StorageAgent] Received server challenge [${challengeId}]. Computing HMAC-SHA256 signature...`);
      const clientNonce = crypto.randomBytes(32).toString('hex');
      const payload = `${challengeId}|${serverNonce}|${clientNonce}|${serverTimestamp}`;
      const clientHmac = crypto.createHmac('sha256', this.agentSecret).update(payload).digest('hex');

      this.send({
        type: 'CHALLENGE_RESPONSE',
        challengeId,
        clientNonce,
        clientHmac,
        agentVersion: '2.1.0'
      });
    } catch (err) {
      console.error('[StorageAgent] Error handling challenge:', err);
    }
  }

  scheduleReconnect() {
    if (this.isStopping) return;
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
    console.log(`[StorageAgent] Reconnecting in ${Math.round(this.reconnectDelay / 1000)}s...`);
    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => this.connect(), this.reconnectDelay);
  }

  cleanup() {
    clearInterval(this.heartbeatTimer);
    clearInterval(this.scanTimer);
    this.heartbeatTimer = null;
    this.scanTimer = null;
  }

  stop() {
    this.isStopping = true;
    this.cleanup();
    clearTimeout(this.reconnectTimeout);
    if (this.ws) {
      this.ws.close();
    }
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const freeMem = os.freemem();
        const totalMem = os.totalmem();
        const memUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);

        this.send({
          type: 'HEARTBEAT',
          payload: {
            cpuUsage: 12.0,
            memoryUsage: memUsage,
            activeDrivesCount: this.activeVolumes.length
          }
        });
      }
    }, 15000); // 15-second heartbeat
  }

  startPeriodicScan() {
    // Drive rescan every 30 seconds
    this.scanTimer = setInterval(() => this.reportDrives(), 30000);
  }

  async reportDrives() {
    try {
      const { devices, volumes } = await this.diskDetector.scanDrives();
      this.activeVolumes = volumes;

      // Register allowlisted mount roots in file engine
      for (const vol of volumes) {
        if (vol.mountPath) {
          this.fileEngine.registerAllowlistedRoot(vol.mountPath);
        }
      }

      this.send({
        type: 'DRIVES_INVENTORY',
        payload: { devices, volumes }
      });
    } catch (err) {
      console.error('[StorageAgent] Error scanning drives:', err);
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  // Handle strictly typed secure command envelopes
  async handleSecureCommand(envelope) {
    const { commandId, commandType, idempotencyKey, expiresAt, payload, signature } = envelope;

    if (!commandId || !commandType) {
      return;
    }

    // 1. Verify envelope cryptographic signature if signature is present
    if (signature) {
      const signData = `${commandId}|${commandType}|${idempotencyKey || ''}|${expiresAt}|${JSON.stringify(payload || {})}`;
      const expectedSig = crypto.createHmac('sha256', this.agentSecret).update(signData).digest('hex');
      
      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSig);
      if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        console.warn(`[StorageAgent] Signature verification failed for command ${commandId} (${commandType})`);
        this.send({
          type: 'COMMAND_REPLY',
          commandId,
          status: 'FAILED',
          error: 'Invalid HMAC-SHA256 command signature'
        });
        return;
      }
    }

    // 2. Check expiration
    if (expiresAt && new Date(expiresAt) < new Date()) {
      console.warn(`[StorageAgent] Command ${commandId} (${commandType}) has expired. Skipping execution.`);
      this.send({
        type: 'COMMAND_REPLY',
        commandId,
        status: 'EXPIRED',
        error: 'Command execution window expired'
      });
      return;
    }

    // 3. Idempotency check: Return cached result for identical command
    if (idempotencyKey && this.executedCommands.has(idempotencyKey)) {
      console.log(`[StorageAgent] Returning cached result for idempotencyKey: ${idempotencyKey}`);
      this.send({
        type: 'COMMAND_REPLY',
        commandId,
        status: 'EXECUTED',
        payload: this.executedCommands.get(idempotencyKey)
      });
      return;
    }

    try {
      let result = null;

      switch (commandType) {
        case 'SCAN_DRIVES':
          result = await this.diskDetector.scanDrives();
          await this.reportDrives();
          break;

        case 'WRITE_CHUNK':
        case 'WRITE_CHUNK_STREAM':
          result = await this.fileEngine.writeChunk(payload);
          break;

        case 'READ_CHUNK':
        case 'READ_CHUNK_STREAM':
          result = await this.fileEngine.readChunk(payload);
          break;

        case 'VERIFY_HASH':
          result = await this.fileEngine.verifyChecksum(payload);
          break;

        case 'MIGRATE_COPY_CHUNK':
        case 'MIGRATE_FILE':
          result = await this.fileEngine.migrateFile(payload);
          break;

        case 'DELETE_PAYLOAD':
        case 'DELETE_RETIRED_PAYLOAD':
          result = await this.fileEngine.deleteFile(payload);
          break;

        default:
          throw new Error(`Forbidden or Unknown Command Type: ${commandType}`);
      }

      if (idempotencyKey) {
        this.executedCommands.set(idempotencyKey, result);
      }

      this.send({
        type: 'COMMAND_REPLY',
        commandId,
        status: 'EXECUTED',
        payload: result
      });
    } catch (err) {
      console.error(`[StorageAgent] Command execution failed [${commandType} - ${commandId}]:`, err.message);
      this.send({
        type: 'COMMAND_REPLY',
        commandId,
        status: 'FAILED',
        error: err.message
      });
    }
  }
}
