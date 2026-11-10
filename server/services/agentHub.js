import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import db from '../config/db.js';
import { cryptoEngine, buildCanonicalCommandString, buildCanonicalHandshakeString } from './cryptoEngine.js';

class StorageAgentHub {
  constructor() {
    this.wss = null;
    this.agents = new Map(); // agentId -> { ws, agentRecord, agentSecret, sessionToken, authenticated, publicKey }
    this.pendingChallenges = new Map(); // challengeId -> { agent, serverNonce, serverTimestamp, secret, ws, timer }
    this.pendingCommands = new Map(); // commandId -> { resolve, reject, timer }
    this.crypto = cryptoEngine;
  }

  initialize(server) {
    this.wss = new WebSocketServer({ server, path: '/ws/agent' });

    this.wss.on('connection', async (ws, req) => {
      const url = new URL(req.url, 'http://localhost');
      const token = req.headers['x-agent-token'] || url.searchParams.get('token');
      const clientIp = req.socket.remoteAddress;

      console.log(`[AgentHub] Connection attempt from ${clientIp}`);

      if (!token) {
        ws.close(4001, 'Agent authentication token missing');
        return;
      }

      try {
        let agent = null;
        const res = await db.query('SELECT * FROM storage_agents WHERE agent_token = $1', [token]);
        if (res.rows && res.rows.length > 0) {
          agent = res.rows[0];
        } else {
          const newAgentId = crypto.randomUUID();
          await db.query(
            `INSERT INTO storage_agents (id, agent_name, machine_name, os_version, ip_address, agent_token, status, last_heartbeat)
             VALUES ($1, $2, $3, $4, $5, $6, 'OFFLINE', CURRENT_TIMESTAMP)`,
            [newAgentId, 'NKB-STORAGE-HOST', 'NKB-STORAGE-PC', 'Windows', clientIp, token]
          );
          agent = { id: newAgentId, agent_name: 'NKB-STORAGE-HOST', agent_token: token };
          console.log(`[AgentHub] Paired new storage agent: ${agent.id}`);
        }

        // Phase 2: SEC-02 Credential Lifecycle, Revocation and Expiration Verification
        const credRes = await db.query(
          `SELECT * FROM agent_credentials WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [agent.id]
        );

        if (credRes.rows && credRes.rows.length > 0) {
          const credential = credRes.rows[0];
          // Check explicit revocation
          if (credential.status === 'REVOKED' || credential.revoked_at) {
            console.warn(`[AgentHub] Rejected connection: Credential for agent ${agent.id} is REVOKED`);
            ws.send(JSON.stringify({
              type: 'AUTH_REJECTED',
              reason: 'Agent credential has been REVOKED by security policy'
            }));
            ws.close(4003, 'Credential revoked');
            return;
          }

          // Check expiration
          if (credential.expires_at && new Date(credential.expires_at) < new Date()) {
            console.warn(`[AgentHub] Rejected connection: Credential for agent ${agent.id} has EXPIRED`);
            ws.send(JSON.stringify({
              type: 'AUTH_REJECTED',
              reason: 'Agent credential has EXPIRED'
            }));
            ws.close(4003, 'Credential expired');
            return;
          }
        }

        // Mutual Challenge-Response Handshake: Issue CHALLENGE_REQUEST
        const challengeId = crypto.randomUUID();
        const serverNonce = this.crypto.generateSecureNonce(32);
        const serverTimestamp = Date.now();

        const challengeTimer = setTimeout(() => {
          if (this.pendingChallenges.has(challengeId)) {
            console.warn(`[AgentHub] Challenge ${challengeId} expired for agent ${agent.id}`);
            this.pendingChallenges.delete(challengeId);
            try { ws.close(4008, 'Authentication challenge timed out'); } catch (e) {}
          }
        }, 30000);

        this.pendingChallenges.set(challengeId, {
          agent,
          serverNonce,
          serverTimestamp,
          secret: process.env.AGENT_SECRET || agent.agent_token,
          ws,
          timer: challengeTimer
        });

        // Send challenge request to client with server's Ed25519 Public Key
        ws.send(JSON.stringify({
          type: 'CHALLENGE_REQUEST',
          challengeId,
          agentId: agent.id,
          serverNonce,
          serverTimestamp,
          serverPublicKey: this.crypto.serverPublicKey
        }));

        ws.on('message', async (data) => {
          try {
            const message = JSON.parse(data.toString());
            await this.handleAgentMessage(agent.id, message, ws);
          } catch (err) {
            console.error('[AgentHub] Error parsing agent message:', err.message);
          }
        });

        ws.on('close', async () => {
          if (this.agents.get(agent.id)?.ws === ws) {
            console.log(`[AgentHub] Agent ${agent.agent_name} [${agent.id}] disconnected.`);
            this.agents.delete(agent.id);
            await this.handleAgentDisconnect(agent.id);
          }
        });

        ws.on('error', (err) => {
          console.error(`[AgentHub] WebSocket error on agent ${agent.id}:`, err.message);
        });

      } catch (err) {
        console.error('[AgentHub] Agent handshake failed:', err);
        ws.close(4000, 'Handshake failure');
      }
    });

    setInterval(() => this.checkStaleAgents(), 30000);
    console.log('[AgentHub] Secure Outbound Agent Hub mounted on /ws/agent.');
  }

  async handleAgentMessage(agentId, message, ws) {
    const { type, challengeId, commandId, status, payload, error } = message;

    // Handle Mutual Challenge-Response Verification
    if (type === 'CHALLENGE_RESPONSE') {
      await this.verifyChallengeResponse(message, ws);
      return;
    }

    // Require authenticated session for all operational messages
    const session = this.agents.get(agentId);
    if (!session || !session.authenticated) {
      console.warn(`[AgentHub] Rejected message from unauthenticated agent [${agentId}]`);
      try { ws.close(4003, 'Unauthenticated operation rejected'); } catch (e) {}
      return;
    }

    if (type === 'COMMAND_REPLY' && commandId && this.pendingCommands.has(commandId)) {
      const { resolve, reject, timer } = this.pendingCommands.get(commandId);
      clearTimeout(timer);
      this.pendingCommands.delete(commandId);

      const isSuccess = status === 'EXECUTED';
      const resultId = crypto.randomUUID();

      try {
        await db.query(
          `INSERT INTO agent_command_results (id, command_id, success, result_payload, error_message, executed_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
          [resultId, commandId, isSuccess, JSON.stringify(payload || {}), error || null]
        );

        await db.query(
          `UPDATE agent_commands SET status = $1 WHERE id = $2`,
          [status, commandId]
        );
      } catch (dbErr) {
        console.error('[AgentHub] Command result recording notice:', dbErr.message);
      }

      if (isSuccess) {
        return resolve(payload);
      } else {
        return reject(new Error(error || `Agent command ${commandId} returned status ${status}`));
      }
    }

    switch (type) {
      case 'HEARTBEAT':
        await this.handleHeartbeat(agentId, payload);
        break;

      case 'DRIVES_INVENTORY':
        await this.handleDrivesInventory(agentId, payload);
        break;

      default:
        console.log(`[AgentHub] Unhandled message type: ${type}`);
    }
  }

  async verifyChallengeResponse(message, ws) {
    const { challengeId, clientNonce, clientHmac, clientSignature, clientPublicKey, keyFingerprint, agentVersion } = message;

    if (!challengeId || !this.pendingChallenges.has(challengeId)) {
      console.warn(`[AgentHub] Challenge response rejected: Invalid or expired challenge ID [${challengeId}]`);
      ws.send(JSON.stringify({ type: 'AUTH_REJECTED', reason: 'Invalid or expired challenge ID' }));
      ws.close(4003, 'Challenge invalid or expired');
      return;
    }

    const challenge = this.pendingChallenges.get(challengeId);
    clearTimeout(challenge.timer);
    this.pendingChallenges.delete(challengeId);

    // 1. Clock skew check (must be within 60 seconds)
    if (Math.abs(Date.now() - challenge.serverTimestamp) > 60000) {
      console.warn(`[AgentHub] Challenge timestamp expired for agent ${challenge.agent.id}`);
      ws.send(JSON.stringify({ type: 'AUTH_REJECTED', reason: 'Challenge window expired (>60s)' }));
      ws.close(4003, 'Challenge expired');
      return;
    }

    // 2. Phase 3: SEC-03 Atomic Nonce Registration (Zero Swallowed Errors)
    try {
      if (db.mode === 'postgres') {
        await db.query('BEGIN');
        await db.query(
          `INSERT INTO agent_nonce_registry (nonce, agent_id, expires_at)
           VALUES ($1, $3, CURRENT_TIMESTAMP + INTERVAL '300 seconds'),
                  ($2, $3, CURRENT_TIMESTAMP + INTERVAL '300 seconds')`,
          [challenge.serverNonce, clientNonce, challenge.agent.id]
        );
        await db.query('COMMIT');
      } else {
        // Embedded mode atomic check
        const store = db.embeddedStore;
        if (!store.agent_nonce_registry) store.agent_nonce_registry = [];
        const isDuplicate = store.agent_nonce_registry.some(
          r => r.nonce === challenge.serverNonce || r.nonce === clientNonce
        );
        if (isDuplicate) {
          throw new Error('Duplicate nonce violation in embedded store');
        }
        store.agent_nonce_registry.push(
          { nonce: challenge.serverNonce, agent_id: challenge.agent.id, expires_at: new Date(Date.now() + 300000).toISOString() },
          { nonce: clientNonce, agent_id: challenge.agent.id, expires_at: new Date(Date.now() + 300000).toISOString() }
        );
        db.saveEmbeddedStore();
      }
    } catch (regErr) {
      if (db.mode === 'postgres') {
        try { await db.query('ROLLBACK'); } catch (_) {}
      }
      console.error(`[AgentHub] REPLAY COLLISION DETECTED: Nonce violation (${regErr.code || regErr.message})`);
      ws.send(JSON.stringify({
        type: 'AUTH_REJECTED',
        reason: 'Replay attack detected: Nonce has already been consumed'
      }));
      try { ws.close(4003, 'Replay attack detected'); } catch (e) {}
      return;
    }

    // 3. Phase 2: SEC-02 Cryptographic Signature Verification (Canonical Ed25519 & Legacy HMAC)
    const canonicalAuthString = buildCanonicalHandshakeString({
      protocolVersion: '2.1.0',
      challengeId,
      agentId: challenge.agent.id,
      serverNonce: challenge.serverNonce,
      clientNonce,
      serverTimestamp: challenge.serverTimestamp
    });

    const legacyPayload = `${challengeId}|${challenge.serverNonce}|${clientNonce}|${challenge.serverTimestamp}`;
    let isAuthenticated = false;

    // Check Ed25519 Asymmetric Digital Signature
    if (clientSignature && clientPublicKey) {
      // Try canonical string first, fallback to legacy payload string
      if (
        this.crypto.verifySignature(canonicalAuthString, clientSignature, clientPublicKey) ||
        this.crypto.verifySignature(legacyPayload, clientSignature, clientPublicKey)
      ) {
        isAuthenticated = true;
        // Persist verified Ed25519 public key in PostgreSQL
        try {
          await db.query(
            `UPDATE storage_agents SET public_key = $1 WHERE id = $2`,
            [clientPublicKey, challenge.agent.id]
          );
          await db.query(
            `INSERT INTO agent_credentials (id, agent_id, public_key, signature_algorithm, key_fingerprint, key_version, status, expires_at)
             VALUES ($1, $2, $3, 'ed25519', $4, 1, 'ACTIVE', CURRENT_TIMESTAMP + INTERVAL '365 days')
             ON CONFLICT DO NOTHING`,
            [crypto.randomUUID(), challenge.agent.id, clientPublicKey, keyFingerprint || this.crypto.computeKeyFingerprint(clientPublicKey)]
          );
        } catch (saveErr) {
          console.warn('[AgentHub] Public key update notice:', saveErr.message);
        }
      }
    }

    // Fallback to HMAC-SHA256 if client is in legacy mode
    if (!isAuthenticated && clientHmac) {
      const expectedHmac = crypto.createHmac('sha256', challenge.secret).update(legacyPayload).digest('hex');
      const receivedBuf = Buffer.from(clientHmac || '');
      const expectedBuf = Buffer.from(expectedHmac);

      if (receivedBuf.length === expectedBuf.length && crypto.timingSafeEqual(receivedBuf, expectedBuf)) {
        isAuthenticated = true;
      }
    }

    if (!isAuthenticated) {
      console.error(`[AgentHub] Authentication failed for agent ${challenge.agent.id}: Signature mismatch`);
      ws.send(JSON.stringify({ type: 'AUTH_REJECTED', reason: 'Cryptographic challenge signature mismatch' }));
      ws.close(4003, 'Mutual authentication failed');
      return;
    }

    // 4. Establish Authenticated Session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    this.agents.set(challenge.agent.id, {
      ws,
      agentRecord: challenge.agent,
      agentSecret: challenge.secret,
      agentPublicKey: clientPublicKey || null,
      sessionToken,
      authenticated: true
    });

    await db.query(
      `UPDATE storage_agents SET status = 'ONLINE', last_heartbeat = CURRENT_TIMESTAMP WHERE id = $1`,
      [challenge.agent.id]
    );

    console.log(`[AgentHub] Agent ${challenge.agent.agent_name} [${challenge.agent.id}] mutual authentication SUCCEEDED (v2.1.0).`);

    ws.send(JSON.stringify({
      type: 'AUTH_GRANTED',
      agentId: challenge.agent.id,
      sessionToken,
      serverPublicKey: this.crypto.serverPublicKey,
      serverTimestamp: Date.now()
    }));
  }

  async handleHeartbeat(agentId, payload) {
    const { cpuUsage, memoryUsage, activeDrivesCount } = payload || {};
    try {
      await db.query(
        `INSERT INTO agent_heartbeats (agent_id, cpu_usage_pct, memory_usage_pct, active_drives_count, logged_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [agentId, cpuUsage || 0, memoryUsage || 0, activeDrivesCount || 0]
      );

      await db.query(
        `UPDATE storage_agents SET last_heartbeat = CURRENT_TIMESTAMP, status = 'ONLINE' WHERE id = $1`,
        [agentId]
      );
    } catch (err) {
      console.error('[AgentHub] Error logging heartbeat:', err.message);
    }
  }

  async handleDrivesInventory(agentId, payload) {
    const { devices, volumes } = payload || {};
    if (!devices || !volumes) return;

    try {
      for (const dev of devices) {
        const existing = await db.query(
          `SELECT id FROM storage_devices WHERE agent_id = $1 AND hardware_serial_evidence = $2`,
          [agentId, dev.hardwareSerial || 'UNKNOWN']
        );

        let deviceId;
        if (existing.rows && existing.rows[0]) {
          deviceId = existing.rows[0].id;
          await db.query(
            `UPDATE storage_devices SET 
               status = 'ONLINE', last_seen_at = CURRENT_TIMESTAMP,
               total_capacity_bytes = $1, media_type = $2, bus_type = $3
             WHERE id = $4`,
            [dev.capacityBytes || 0, dev.mediaType || 'UNKNOWN', dev.busType || 'UNKNOWN', deviceId]
          );
        } else {
          deviceId = crypto.randomUUID();
          await db.query(
            `INSERT INTO storage_devices (
               id, agent_id, hardware_serial, hardware_serial_evidence, disk_unique_id_evidence,
               vendor, model, bus_type, media_type, total_capacity_bytes,
               identity_confidence, status
             ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, 'VERIFIED', 'ONLINE')`,
            [
              deviceId, agentId, dev.hardwareSerial || 'UNKNOWN', dev.diskId || 'UNKNOWN',
              dev.vendor || 'NKB Generic', dev.model || 'External Storage',
              dev.busType || 'USB', dev.mediaType || 'SSD', dev.capacityBytes || 0
            ]
          );
        }

        const devVolumes = volumes.filter(v => v.diskNumber === dev.diskNumber || v.deviceId === dev.id || v.diskIndex === dev.deviceIndex);
        for (const vol of devVolumes) {
          const volExisting = await db.query(
            `SELECT id FROM storage_volumes WHERE device_id = $1 AND (mount_path = $2 OR volume_uuid = $3)`,
            [deviceId, vol.mountPath, vol.volumeUuid || vol.volumeGuid || vol.mountPath]
          );

          if (volExisting.rows && volExisting.rows[0]) {
            await db.query(
              `UPDATE storage_volumes SET 
                 status = 'ONLINE', last_verified_at = CURRENT_TIMESTAMP,
                 mount_path = $1, free_bytes = $2, total_bytes = $3
               WHERE id = $4`,
              [vol.mountPath, vol.freeBytes || 0, vol.totalBytes || 0, volExisting.rows[0].id]
            );
          } else {
            const compId = vol.compositeIdentity || crypto.createHash('sha256').update(`${dev.hardwareSerial || 'UNKNOWN'}:${vol.volumeGuid || vol.mountPath}`).digest('hex');
            await db.query(
              `INSERT INTO storage_volumes (
                 id, device_id, composite_identity, volume_uuid, hardware_serial, assigned_name,
                 mount_path, filesystem, filesystem_type, total_bytes, free_bytes,
                 status, is_default
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, 'ONLINE', false)
               ON CONFLICT (composite_identity) DO UPDATE SET
                 status = 'ONLINE', mount_path = $7, free_bytes = $10, updated_at = CURRENT_TIMESTAMP`,
              [
                crypto.randomUUID(), deviceId, compId, vol.volumeUuid || vol.volumeGuid || vol.mountPath,
                dev.hardwareSerial || 'UNKNOWN',
                vol.volumeLabel || vol.label || `Volume-${vol.driveLetter || 'X'}`,
                vol.mountPath, vol.filesystem || 'NTFS',
                vol.totalBytes || 0, vol.freeBytes || 0
              ]
            );
          }
        }
      }
    } catch (err) {
      console.error('[AgentHub] Error updating drives inventory:', err.message);
    }
  }

  async handleAgentDisconnect(agentId) {
    try {
      await db.query(
        `UPDATE storage_agents SET status = 'OFFLINE' WHERE id = $1`,
        [agentId]
      );
      await db.query(
        `UPDATE storage_volumes SET status = 'OFFLINE'
         WHERE device_id IN (SELECT id FROM storage_devices WHERE agent_id = $1)`,
        [agentId]
      );
    } catch (err) {
      console.error('[AgentHub] Disconnect handler notice:', err.message);
    }
  }

  async checkStaleAgents() {
    try {
      const timeoutThreshold = new Date(Date.now() - 45000);
      const staleAgents = await db.query(
        `SELECT id FROM storage_agents WHERE status = 'ONLINE' AND last_heartbeat < $1`,
        [timeoutThreshold]
      );

      for (const row of staleAgents.rows || []) {
        console.warn(`[AgentHub] Heartbeat timeout for agent ${row.id}. Marking OFFLINE.`);
        await this.handleAgentDisconnect(row.id);
        const session = this.agents.get(row.id);
        if (session) {
          try { session.ws.close(4008, 'Heartbeat timeout'); } catch (e) {}
          this.agents.delete(row.id);
        }
      }
    } catch (err) {
      console.error('[AgentHub] Stale agent check notice:', err.message);
    }
  }

  // Phase 1: SEC-01 & Phase 2: SEC-02 Typed, Canonical Command Dispatch with Ed25519
  async dispatchCommand(agentId, commandType, payload = {}, timeoutMs = 30000) {
    const agentSession = this.agents.get(agentId);
    if (!agentSession || !agentSession.authenticated) {
      throw new Error(`Storage Agent ${agentId} is not connected or not authenticated`);
    }

    const commandId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    const nonce = this.crypto.generateSecureNonce(16);
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + timeoutMs).toISOString();

    const schemaCommandTypeMap = {
      'SCAN_DRIVES': 'SCAN_DRIVES',
      'WRITE_CHUNK': 'WRITE_CHUNK_STREAM',
      'WRITE_CHUNK_STREAM': 'WRITE_CHUNK_STREAM',
      'READ_CHUNK': 'READ_CHUNK_STREAM',
      'READ_CHUNK_STREAM': 'READ_CHUNK_STREAM',
      'VERIFY_HASH': 'VERIFY_HASH',
      'MIGRATE_COPY_CHUNK': 'MIGRATE_FILE',
      'MIGRATE_FILE': 'MIGRATE_FILE',
      'DELETE_PAYLOAD': 'DELETE_RETIRED_PAYLOAD',
      'DELETE_RETIRED_PAYLOAD': 'DELETE_RETIRED_PAYLOAD'
    };
    const dbCommandType = schemaCommandTypeMap[commandType] || commandType;

    // Build Canonical Command Payload Covering All Required Sensitive Fields
    const canonicalCommandEnvelope = {
      protocolVersion: '2.1.0',
      commandId,
      agentId,
      commandType,
      nonce,
      keyVersion: 1,
      issuedAt,
      expiresAt,
      payload
    };

    // Cryptographic Signature via Server Ed25519 Private Key
    const signature = this.crypto.signCanonicalCommand(canonicalCommandEnvelope);

    // Legacy HMAC signature for backward compatible test harnesses
    const legacySignData = `${commandId}|${commandType}|${idempotencyKey}|${expiresAt}|${JSON.stringify(payload)}`;
    const hmacSignature = crypto.createHmac('sha256', agentSession.agentSecret).update(legacySignData).digest('hex');

    await db.query(
      `INSERT INTO agent_commands (id, agent_id, command_type, idempotency_key, payload, status, issued_at, expires_at, dispatched_at)
       VALUES ($1, $2, $3, $4, $5, 'DISPATCHED', CURRENT_TIMESTAMP, $6, CURRENT_TIMESTAMP)`,
      [commandId, agentId, dbCommandType, idempotencyKey, JSON.stringify(payload), expiresAt]
    );

    return new Promise((resolve, reject) => {
      const timer = setTimeout(async () => {
        this.pendingCommands.delete(commandId);
        try {
          await db.query("UPDATE agent_commands SET status = 'EXPIRED' WHERE id = $1", [commandId]);
        } catch (e) {}
        reject(new Error(`Command ${commandType} [${commandId}] timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingCommands.set(commandId, { resolve, reject, timer });

      agentSession.ws.send(JSON.stringify({
        ...canonicalCommandEnvelope,
        idempotencyKey,
        signature,
        hmacSignature,
        serverPublicKey: this.crypto.serverPublicKey
      }));
    });
  }

  // Phase 5: PERF-01 High-Performance Binary WebSocket Streaming Frame (Zero Base64 Overhead)
  async writeChunkToStorage(volumeId, relativePath, chunkIndex, chunkData, isLastChunk, chunkSha256) {
    const volRes = await db.query('SELECT * FROM storage_volumes WHERE id = $1', [volumeId]);
    if (!volRes.rows || !volRes.rows[0]) throw new Error('Storage volume not found');
    const volume = volRes.rows[0];
    if (volume.status !== 'ONLINE') {
      throw new Error(`Storage drive "${volume.assigned_name}" is currently OFFLINE`);
    }

    const devRes = await db.query('SELECT agent_id FROM storage_devices WHERE id = $1', [volume.device_id]);
    const agentId = devRes.rows[0]?.agent_id;
    const agentSession = this.agents.get(agentId);

    if (!agentSession || !agentSession.authenticated) {
      throw new Error(`Storage Agent for drive "${volume.assigned_name}" is currently offline`);
    }

    // Direct Binary WebSocket Frame if chunkData is a Buffer (0% Base64 overhead)
    if (Buffer.isBuffer(chunkData)) {
      const commandId = crypto.randomUUID();
      const idempotencyKey = crypto.randomUUID();
      const headerObj = {
        commandId,
        idempotencyKey,
        mountPath: volume.mount_path,
        relativePath,
        chunkIndex,
        isLastChunk,
        chunkSha256
      };
      const headerBuf = Buffer.from(JSON.stringify(headerObj), 'utf8');
      const magicBuf = Buffer.from('NKBS', 'utf8');
      const verBuf = Buffer.from([0x01]); // Protocol version 1
      const flagsBuf = Buffer.from([isLastChunk ? 0x01 : 0x00]);
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32BE(headerBuf.length, 0);

      const binaryFrame = Buffer.concat([magicBuf, verBuf, flagsBuf, lenBuf, headerBuf, chunkData]);

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingCommands.delete(commandId);
          reject(new Error(`Binary chunk write command [${commandId}] timed out`));
        }, 45000);

        this.pendingCommands.set(commandId, { resolve, reject, timer });
        agentSession.ws.send(binaryFrame);
      });
    }

    // Fallback for string/Base64 chunk data
    return await this.dispatchCommand(agentId, 'WRITE_CHUNK', {
      mountPath: volume.mount_path,
      relativePath,
      chunkIndex,
      chunkBase64: chunkData,
      isLastChunk,
      chunkSha256
    }, 45000);
  }

  async readChunkFromStorage(volumeId, relativePath, startByte = 0, length) {
    const volRes = await db.query('SELECT * FROM storage_volumes WHERE id = $1', [volumeId]);
    const volume = volRes.rows[0];
    if (!volume || volume.status !== 'ONLINE') {
      throw new Error(`Drive "${volume ? volume.assigned_name : 'Unknown'}" is OFFLINE`);
    }

    const devRes = await db.query('SELECT agent_id FROM storage_devices WHERE id = $1', [volume.device_id]);
    const agentId = devRes.rows[0]?.agent_id;

    const result = await this.dispatchCommand(agentId, 'READ_CHUNK', {
      mountPath: volume.mount_path,
      relativePath,
      startByte,
      length
    });

    const buffer = result.dataBuffer ? Buffer.from(result.dataBuffer) : (result.dataBase64 ? Buffer.from(result.dataBase64, 'base64') : Buffer.alloc(0));
    return {
      buffer,
      startByte: result.startByte,
      endByte: result.endByte,
      fileSize: result.fileSize
    };
  }

  hasConnectedAgent() {
    return Array.from(this.agents.values()).some(a => a.authenticated);
  }

  getFirstConnectedAgentId() {
    for (const [id, session] of this.agents.entries()) {
      if (session.authenticated) return id;
    }
    return null;
  }
}

export const agentHub = new StorageAgentHub();
export default agentHub;
