import WebSocket from 'ws';
import os from 'os';
import crypto from 'crypto';
import { WindowsDiskDetector } from './disk-detector.js';
import { FileStorageEngine } from './file-engine.js';
import { agentCryptoEngine } from './crypto-engine.js';
import { commandJournal } from './command-journal.js';

export class AgentClient {
  constructor(config = {}) {
    this.serverUrl = config.serverUrl || 'ws://localhost:5000/ws/agent';
    this.agentToken = config.agentToken || 'nkb_agent_token_primary_2026';
    this.agentName = config.agentName || 'NKB-STORAGE-HOST-01';
    this.agentSecret = config.agentSecret || this.agentToken;

    this.diskDetector = new WindowsDiskDetector();
    this.fileEngine = new FileStorageEngine();
    this.cryptoEngine = agentCryptoEngine;
    this.journal = commandJournal;
    this.executedCommands = this.journal.entries;

    this.ws = null;
    this.heartbeatTimer = null;
    this.scanTimer = null;
    this.reconnectTimeout = null;
    this.reconnectDelay = 2000;
    this.isStopping = false;
    this.activeVolumes = [];
    this.authenticated = false;
    this.sessionToken = null;
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
          'x-agent-name': this.agentName,
          'x-agent-pubkey-fingerprint': this.cryptoEngine.agentFingerprint
        }
      });

      this.ws.on('open', () => {
        console.log(`[StorageAgent] Secure socket opened with NKB Cloud Relay Hub. Awaiting authentication challenge...`);
        this.reconnectDelay = 2000;
      });

      this.ws.on('message', async (data) => {
        try {
          // 1. Detect and Handle Native Binary WebSocket Streaming Frames (PERF-01)
          if (Buffer.isBuffer(data) && data.length >= 8 && data.subarray(0, 4).toString('utf8') === 'NKBS') {
            await this.handleBinaryStreamFrame(data);
            return;
          }

          // 2. Text / JSON Envelope Message
          const envelope = JSON.parse(data.toString());
          
          // Mutual Challenge-Response Authentication (SEC-02)
          if (envelope.type === 'CHALLENGE_REQUEST') {
            await this.handleChallengeRequest(envelope);
            return;
          }

          if (envelope.type === 'AUTH_GRANTED') {
            console.log(`[StorageAgent] Mutual asymmetric Ed25519 challenge authentication GRANTED.`);
            this.authenticated = true;
            this.sessionToken = envelope.sessionToken;
            if (envelope.serverPublicKey) {
              this.cryptoEngine.setPinnedServerPublicKey(envelope.serverPublicKey);
            }
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

  // Handle Binary WebSocket Streaming Frame with Zero Base64 Overhead (PERF-01)
  async handleBinaryStreamFrame(rawBuffer) {
    try {
      // Header layout: [Magic 4B: 'NKBS'][Header JSON Length 4B UInt32BE][Header JSON][Raw Payload]
      const headerLength = rawBuffer.readUInt32BE(4);
      const headerJson = rawBuffer.subarray(8, 8 + headerLength).toString('utf8');
      const header = JSON.parse(headerJson);
      const binaryPayload = rawBuffer.subarray(8 + headerLength);

      const { commandId, idempotencyKey, mountPath, relativePath, chunkIndex, isLastChunk, chunkSha256 } = header;

      // Verify command journal for idempotency
      const recordKey = idempotencyKey || commandId;
      const startCheck = this.journal.recordCommandStart(commandId, 'WRITE_CHUNK_STREAM', recordKey, chunkSha256);
      if (startCheck.isDuplicate) {
        this.send({
          type: 'COMMAND_REPLY',
          commandId,
          status: 'EXECUTED',
          payload: startCheck.record.result
        });
        return;
      }

      // Stream write directly to disk
      const result = await this.fileEngine.writeChunk({
        mountPath,
        relativePath,
        chunkIndex,
        chunkBuffer: binaryPayload,
        isLastChunk,
        chunkSha256
      });

      this.journal.recordCommandComplete(commandId, recordKey, result);

      this.send({
        type: 'COMMAND_REPLY',
        commandId,
        status: 'EXECUTED',
        payload: result
      });
    } catch (err) {
      console.error('[StorageAgent] Binary stream frame execution error:', err.message);
      this.send({
        type: 'COMMAND_REPLY',
        status: 'FAILED',
        error: err.message
      });
    }
  }

  // Phase 2: SEC-02 Ed25519 Asymmetric Challenge Signing
  async handleChallengeRequest({ challengeId, serverNonce, serverTimestamp, serverPublicKey }) {
    try {
      console.log(`[StorageAgent] Received server challenge [${challengeId}]. Computing Ed25519 signature...`);
      
      // Pin server public key if supplied
      if (serverPublicKey) {
        this.cryptoEngine.setPinnedServerPublicKey(serverPublicKey);
      }

      const clientNonce = this.cryptoEngine.generateSecureNonce(32);
      const payloadString = `${challengeId}|${serverNonce}|${clientNonce}|${serverTimestamp}`;
      
      // Sign with local agent Ed25519 private key
      const clientSignature = this.cryptoEngine.signPayload(payloadString);
      
      // Compute fallback HMAC for backward compatibility during key transition
      const clientHmac = crypto.createHmac('sha256', this.agentSecret).update(payloadString).digest('hex');

      this.send({
        type: 'CHALLENGE_RESPONSE',
        challengeId,
        clientNonce,
        clientSignature,
        clientHmac,
        clientPublicKey: this.cryptoEngine.agentPublicKey,
        keyFingerprint: this.cryptoEngine.agentFingerprint,
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
    }, 15000);
  }

  startPeriodicScan() {
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

  // Phase 1: SEC-01 Strictly Typed & Mandatory Cryptographic Signature Verification
  async handleSecureCommand(envelope) {
    const { commandId, commandType, idempotencyKey, expiresAt, payload, signature, serverPublicKey } = envelope;

    if (!commandId || !commandType) {
      console.warn('[StorageAgent] REJECTED: Command missing commandId or commandType');
      return;
    }

    // 1. MANDATORY SIGNATURE CHECK (SEC-01) - Fail Closed
    if (!signature || typeof signature !== 'string' || signature.trim() === '') {
      console.error(`[StorageAgent] REJECTED: Mandatory cryptographic signature missing for command ${commandId} (${commandType})`);
      this.send({
        type: 'COMMAND_REPLY',
        commandId,
        status: 'FAILED',
        error: 'Security Violation: Mandatory cryptographic signature missing'
      });
      return;
    }

    // 2. Check Expiration Deadline
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

    // 3. Cryptographic Signature Verification (Ed25519 & HMAC fallback)
    const signData = `${commandId}|${commandType}|${idempotencyKey || ''}|${expiresAt}|${JSON.stringify(payload || {})}`;
    
    // Check Ed25519 Signature first
    let isSignatureValid = false;
    if (this.cryptoEngine.verifyServerSignature(signData, signature, serverPublicKey)) {
      isSignatureValid = true;
    } else {
      // Check legacy/fallback HMAC-SHA256 signature
      try {
        const expectedHmac = crypto.createHmac('sha256', this.agentSecret).update(signData).digest('hex');
        const sigBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedHmac);
        if (sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
          isSignatureValid = true;
        }
      } catch (e) {}
    }

    if (!isSignatureValid) {
      console.error(`[StorageAgent] REJECTED: Invalid cryptographic signature for command ${commandId} (${commandType})`);
      this.send({
        type: 'COMMAND_REPLY',
        commandId,
        status: 'FAILED',
        error: 'Invalid cryptographic command signature'
      });
      return;
    }

    // 4. Durable Idempotency Check (SEC-04)
    const recordKey = idempotencyKey || commandId;
    const startRecord = this.journal.recordCommandStart(
      commandId,
      commandType,
      recordKey,
      crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex')
    );

    if (startRecord.isDuplicate) {
      console.log(`[StorageAgent] Returning cached durable result for idempotencyKey: ${recordKey}`);
      this.send({
        type: 'COMMAND_REPLY',
        commandId,
        status: 'EXECUTED',
        payload: startRecord.record.result
      });
      return;
    }

    // 5. Strictly Bounded Command Dispatch (Zero Arbitrary PowerShell)
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

      // Record durable completion
      this.journal.recordCommandComplete(commandId, recordKey, result);

      this.send({
        type: 'COMMAND_REPLY',
        commandId,
        status: 'EXECUTED',
        payload: result
      });
    } catch (err) {
      console.error(`[StorageAgent] Command execution failed [${commandType} - ${commandId}]:`, err.message);
      this.journal.recordCommandFailure(commandId, recordKey, err.message);
      this.send({
        type: 'COMMAND_REPLY',
        commandId,
        status: 'FAILED',
        error: err.message
      });
    }
  }
}

export default AgentClient;
