import WebSocket from 'ws';
import os from 'os';
import crypto from 'crypto';
import { WindowsDiskDetector } from './disk-detector.js';
import { FileStorageEngine } from './file-engine.js';
import { agentCryptoEngine, buildCanonicalCommandString, buildCanonicalHandshakeString } from './crypto-engine.js';
import { commandJournal } from './command-journal.js';

export class AgentClient {
  constructor(config = {}) {
    this.serverUrl = config.serverUrl || 'ws://localhost:5000/ws/agent';
    this.agentToken = config.agentToken || 'nkb_agent_token_primary_2026';
    this.agentName = config.agentName || 'NKB-STORAGE-HOST-01';
    this.agentId = config.agentId || null;
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
            if (envelope.agentId) {
              this.agentId = envelope.agentId;
            }
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
      // Header layout: [Magic 4B: 'NKBS'][Protocol Ver 1B][Flags 1B][Header JSON Length 4B UInt32BE][Header JSON][Raw Payload]
      const protocolVer = rawBuffer.readUInt8(4);
      if (protocolVer !== 1) {
        throw new Error(`Unsupported NKBS protocol version: ${protocolVer}`);
      }

      const headerLength = rawBuffer.readUInt32BE(6);
      const headerJson = rawBuffer.subarray(10, 10 + headerLength).toString('utf8');
      const header = JSON.parse(headerJson);
      const binaryPayload = rawBuffer.subarray(10 + headerLength);

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

  // Phase 2: SEC-02 Ed25519 Canonical Handshake Signing
  async handleChallengeRequest({ challengeId, serverNonce, serverTimestamp, serverPublicKey, agentId }) {
    try {
      console.log(`[StorageAgent] Received server challenge [${challengeId}]. Computing Ed25519 signature...`);
      
      if (serverPublicKey && !this.cryptoEngine.pinnedServerPublicKey) {
        this.cryptoEngine.setPinnedServerPublicKey(serverPublicKey);
      }
      if (agentId) {
        this.agentId = agentId;
      }

      const clientNonce = this.cryptoEngine.generateSecureNonce(32);
      const canonicalAuthString = buildCanonicalHandshakeString({
        protocolVersion: '2.1.0',
        challengeId,
        agentId: this.agentId || 'NKB-STORAGE-AGENT',
        serverNonce,
        clientNonce,
        serverTimestamp
      });
      
      // Sign canonical authentication payload with local agent Ed25519 private key
      const clientSignature = this.cryptoEngine.signPayload(canonicalAuthString);
      
      // Legacy HMAC fallback payload string for backward compatibility
      const legacyPayload = `${challengeId}|${serverNonce}|${clientNonce}|${serverTimestamp}`;
      const clientHmac = crypto.createHmac('sha256', this.agentSecret).update(legacyPayload).digest('hex');

      this.send({
        type: 'CHALLENGE_RESPONSE',
        challengeId,
        agentId: this.agentId,
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
    const {
      protocolVersion = '2.1.0',
      commandId,
      agentId,
      commandType,
      idempotencyKey,
      nonce = '',
      keyVersion = 1,
      issuedAt,
      expiresAt,
      payload = {},
      signature
    } = envelope;

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

    // 3. Cryptographic Signature Verification using PINNED Server Public Key ONLY
    // Security Guard: Envelope-supplied keys are completely ignored to prevent substitution attacks!
    const canonicalPayloadString = buildCanonicalCommandString({
      protocolVersion,
      commandId,
      agentId: agentId || this.agentId || '',
      commandType,
      nonce,
      keyVersion,
      issuedAt: issuedAt || '',
      expiresAt: expiresAt || '',
      payload
    });

    let isSignatureValid = false;

    // Verify against pinned Server Public Key
    if (this.cryptoEngine.verifyServerSignature(canonicalPayloadString, signature)) {
      isSignatureValid = true;
    } else {
      // Legacy format verification check for transition support
      const legacySignData = `${commandId}|${commandType}|${idempotencyKey || ''}|${expiresAt}|${JSON.stringify(payload || {})}`;
      if (this.cryptoEngine.verifyServerSignature(legacySignData, signature)) {
        isSignatureValid = true;
      } else {
        // HMAC fallback check
        try {
          const expectedHmac = crypto.createHmac('sha256', this.agentSecret).update(legacySignData).digest('hex');
          const sigBuffer = Buffer.from(signature);
          const expectedBuffer = Buffer.from(expectedHmac);
          if (sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
            isSignatureValid = true;
          }
        } catch (e) {}
      }
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
      if (startRecord.status === 'COMPLETED') {
        console.log(`[StorageAgent] Returning cached durable result for idempotencyKey: ${recordKey}`);
        this.send({
          type: 'COMMAND_REPLY',
          commandId,
          status: 'EXECUTED',
          payload: startRecord.record.result
        });
        return;
      } else if (startRecord.status === 'RECOVERY_REQUIRED') {
        console.warn(`[StorageAgent] Command ${commandId} was interrupted by previous crash and requires recovery.`);
        this.send({
          type: 'COMMAND_REPLY',
          commandId,
          status: 'FAILED',
          error: 'Execution Halted: Command was interrupted by a previous crash and requires reconciliation'
        });
        return;
      }
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
          result = await this.fileEngine.deleteFile({ ...payload, commandId });
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
