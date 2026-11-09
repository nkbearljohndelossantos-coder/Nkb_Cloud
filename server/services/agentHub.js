import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import db from '../config/db.js';

class StorageAgentHub {
  constructor() {
    this.wss = null;
    this.agents = new Map(); // agentId -> { ws, agentRecord, agentSecret, sessionToken, authenticated }
    this.pendingChallenges = new Map(); // challengeId -> { agent, serverNonce, serverTimestamp, secret, ws, timeout }
    this.pendingCommands = new Map(); // commandId -> { resolve, reject, timer }
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

        // Retrieve or initialize agent secret in agent_credentials
        const agentSecret = process.env.AGENT_SECRET || agent.agent_token;
        const secretHash = crypto.createHash('sha256').update(agentSecret).digest('hex');

        try {
          const credRes = await db.query('SELECT * FROM agent_credentials WHERE agent_id = $1 AND status = \'ACTIVE\'', [agent.id]);
          if (!credRes.rows || credRes.rows.length === 0) {
            await db.query(
              `INSERT INTO agent_credentials (id, agent_id, hmac_secret_hash, key_version, status, expires_at)
               VALUES ($1, $2, $3, 1, 'ACTIVE', CURRENT_TIMESTAMP + INTERVAL '365 days')`,
              [crypto.randomUUID(), agent.id, secretHash]
            );
          }
        } catch (credErr) {
          console.warn('[AgentHub] agent_credentials record notice:', credErr.message);
        }

        // Mutual Challenge-Response Handshake: Issue CHALLENGE_REQUEST
        const challengeId = crypto.randomUUID();
        const serverNonce = crypto.randomBytes(32).toString('hex');
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
          secret: agentSecret,
          ws,
          timer: challengeTimer
        });

        // Send challenge request to client
        ws.send(JSON.stringify({
          type: 'CHALLENGE_REQUEST',
          challengeId,
          serverNonce,
          serverTimestamp
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
    const { challengeId, clientNonce, clientHmac, agentVersion } = message;

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

    // 2. Nonce Replay Attack Prevention (check agent_nonce_registry)
    try {
      const nonceCheck = await db.query(
        'SELECT nonce FROM agent_nonce_registry WHERE nonce = $1 OR nonce = $2',
        [challenge.serverNonce, clientNonce]
      );

      if (nonceCheck.rows && nonceCheck.rows.length > 0) {
        console.error(`[AgentHub] REPLAY ATTACK DETECTED! Nonce was previously registered: ${nonceCheck.rows[0].nonce}`);
        ws.send(JSON.stringify({ type: 'AUTH_REJECTED', reason: 'Replay attack detected: Nonce has already been consumed' }));
        ws.close(4003, 'Replay attack detected');
        return;
      }
    } catch (nonceErr) {
      console.error('[AgentHub] Nonce check error:', nonceErr.message);
    }

    // 3. Cryptographic HMAC-SHA256 Signature Verification
    const expectedPayload = `${challengeId}|${challenge.serverNonce}|${clientNonce}|${challenge.serverTimestamp}`;
    const expectedHmac = crypto.createHmac('sha256', challenge.secret).update(expectedPayload).digest('hex');

    const receivedBuf = Buffer.from(clientHmac || '');
    const expectedBuf = Buffer.from(expectedHmac);

    if (receivedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(receivedBuf, expectedBuf)) {
      console.error(`[AgentHub] Challenge HMAC signature mismatch for agent ${challenge.agent.id}`);
      ws.send(JSON.stringify({ type: 'AUTH_REJECTED', reason: 'HMAC challenge signature mismatch' }));
      ws.close(4003, 'Mutual authentication failed');
      return;
    }

    // 4. Register Nonces with 300-second expiration to prevent future replay attacks
    try {
      await db.query(
        `INSERT INTO agent_nonce_registry (nonce, agent_id, expires_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '300 seconds')`,
        [challenge.serverNonce, challenge.agent.id]
      );
      await db.query(
        `INSERT INTO agent_nonce_registry (nonce, agent_id, expires_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '300 seconds')`,
        [clientNonce, challenge.agent.id]
      );
    } catch (regErr) {
      console.warn('[AgentHub] Nonce registration notice:', regErr.message);
    }

    // 5. Establish Authenticated Session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    this.agents.set(challenge.agent.id, {
      ws,
      agentRecord: challenge.agent,
      agentSecret: challenge.secret,
      sessionToken,
      authenticated: true
    });

    await db.query(
      `UPDATE storage_agents SET status = 'ONLINE', last_heartbeat = CURRENT_TIMESTAMP WHERE id = $1`,
      [challenge.agent.id]
    );

    console.log(`[AgentHub] Agent ${challenge.agent.agent_name} [${challenge.agent.id}] mutual HMAC authentication SUCCEEDED (v${agentVersion || '2.1.0'}).`);

    // 6. Send AUTH_GRANTED envelope
    ws.send(JSON.stringify({
      type: 'AUTH_GRANTED',
      sessionToken,
      heartbeatInterval: 15000,
      commandTtlMs: 30000
    }));

    // 7. Dispatch initial hardware and storage volume scan
    this.dispatchCommand(challenge.agent.id, 'SCAN_DRIVES', {}).catch(err => {
      console.warn('[AgentHub] Initial drive scan dispatch notice:', err.message);
    });
  }

  async handleHeartbeat(agentId, payload) {
    const { cpuUsage, memoryUsage, activeDrivesCount } = payload || {};
    try {
      await db.query(
        `UPDATE storage_agents SET last_heartbeat = CURRENT_TIMESTAMP, status = 'ONLINE' WHERE id = $1`,
        [agentId]
      );
      await db.query(
        `INSERT INTO agent_heartbeats (agent_id, cpu_usage_pct, memory_usage_pct, active_drives_count)
         VALUES ($1, $2, $3, $4)`,
        [agentId, cpuUsage || 0, memoryUsage || 0, activeDrivesCount || 0]
      );
    } catch (err) {
      console.error('[AgentHub] Error recording heartbeat:', err.message);
    }
  }

  async handleDrivesInventory(agentId, payload) {
    const { devices = [], volumes = [] } = payload;
    console.log(`[AgentHub] Reconciling drives: ${devices.length} devices, ${volumes.length} volumes.`);

    for (const dev of devices) {
      try {
        const existing = await db.query(
          'SELECT id FROM storage_devices WHERE agent_id = $1 AND (hardware_serial = $2 OR hardware_serial_evidence = $2)',
          [agentId, dev.hardwareSerial]
        );

        let deviceId;
        if (existing.rows && existing.rows.length > 0) {
          deviceId = existing.rows[0].id;
          await db.query(
            `UPDATE storage_devices SET vendor = $1, model = $2, bus_type = $3, media_type = $4,
             total_capacity_bytes = $5, status = 'ONLINE', health_status = $6, updated_at = CURRENT_TIMESTAMP
             WHERE id = $7`,
            [dev.vendor, dev.model, dev.busType, dev.mediaType, dev.totalCapacityBytes, dev.healthStatus || 'GOOD', deviceId]
          );
        } else {
          deviceId = crypto.randomUUID();
          await db.query(
            `INSERT INTO storage_devices (id, agent_id, hardware_serial, hardware_serial_evidence, disk_unique_id_evidence, vendor, model, bus_type, media_type, total_capacity_bytes, identity_confidence, status, health_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'VERIFIED', 'ONLINE', $11)`,
            [deviceId, agentId, dev.hardwareSerial, dev.hardwareSerial, dev.diskUniqueId || 'N/A', dev.vendor, dev.model, dev.busType, dev.mediaType, dev.totalCapacityBytes, dev.healthStatus || 'GOOD']
          );
        }
        dev.dbId = deviceId;
      } catch (err) {
        console.error('[AgentHub] Device reconciliation error:', err.message);
      }
    }

    const detectedVolumeCompositeIds = new Set();

    for (const vol of volumes) {
      detectedVolumeCompositeIds.add(vol.compositeIdentity);

      try {
        const parentDev = devices.find(d => d.deviceIndex === vol.diskIndex) || devices[0];
        const deviceId = parentDev ? parentDev.dbId : null;
        if (!deviceId) continue;

        let existingVol = await db.query(
          'SELECT * FROM storage_volumes WHERE composite_identity = $1 OR volume_uuid = $2',
          [vol.compositeIdentity, vol.volumeUuid]
        );

        if (existingVol.rows && existingVol.rows.length > 0) {
          const oldVol = existingVol.rows[0];

          if (oldVol.current_drive_letter !== vol.driveLetter) {
            console.log(`[AgentHub] Volume "${oldVol.assigned_name}" letter reassigned: ${oldVol.current_drive_letter} -> ${vol.driveLetter}`);
            await db.query(
              `INSERT INTO storage_mount_history (volume_id, previous_drive_letter, new_drive_letter, event_type, details)
               VALUES ($1, $2, $3, 'LETTER_CHANGED', 'Windows dynamically shifted drive letter. Composite identity matched.')`,
              [oldVol.id, oldVol.current_drive_letter, vol.driveLetter]
            );
          }

          await db.query(
            `UPDATE storage_volumes SET
             composite_identity = $1, current_drive_letter = $2, mount_path = $3,
             total_bytes = $4, free_bytes = $5, used_bytes = $6, status = 'ONLINE',
             last_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = $7`,
            [vol.compositeIdentity, vol.driveLetter, vol.mountPath, vol.totalBytes, vol.freeBytes, vol.usedBytes, oldVol.id]
          );

          await db.query(
            `UPDATE files SET status = 'AVAILABLE' WHERE storage_volume_id = $1 AND status = 'UNAVAILABLE_DRIVE_OFFLINE'`,
            [oldVol.id]
          );
        } else {
          const newVolId = crypto.randomUUID();
          const assignedName = vol.label && !vol.label.startsWith('Drive') ? vol.label : `NKB-VOL-${vol.driveLetter.replace(':', '')}`;
          await db.query(
            `INSERT INTO storage_volumes (
              id, device_id, composite_identity, volume_uuid, hardware_serial, partition_unique_id,
              label, assigned_name, storage_purpose, filesystem, current_drive_letter, mount_path,
              total_bytes, used_bytes, free_bytes, is_default, priority, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
            [
              newVolId, deviceId, vol.compositeIdentity, vol.volumeUuid, vol.hardwareSerial, vol.partitionUniqueId,
              vol.label, assignedName, 'GENERAL', vol.fileSystem || 'NTFS', vol.driveLetter,
              vol.mountPath, vol.totalBytes, vol.usedBytes, vol.freeBytes, false, 1, 'ONLINE'
            ]
          );
          console.log(`[AgentHub] Registered new volume: ${assignedName} [${vol.compositeIdentity.substring(0, 8)}]`);
        }
      } catch (err) {
        console.error('[AgentHub] Volume reconciliation error:', err.message);
      }
    }

    try {
      const allRegistered = await db.query("SELECT * FROM storage_volumes WHERE status = 'ONLINE'");
      for (const reg of (allRegistered.rows || [])) {
        if (!detectedVolumeCompositeIds.has(reg.composite_identity)) {
          console.warn(`[AgentHub] Drive "${reg.assigned_name}" (${reg.current_drive_letter}) is missing. Marking OFFLINE.`);
          await db.query("UPDATE storage_volumes SET status = 'OFFLINE', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [reg.id]);
          await db.query("UPDATE files SET status = 'UNAVAILABLE_DRIVE_OFFLINE' WHERE storage_volume_id = $1 AND status = 'AVAILABLE'", [reg.id]);
          await db.query(
            `INSERT INTO storage_mount_history (volume_id, previous_drive_letter, new_drive_letter, event_type, details)
             VALUES ($1, $2, NULL, 'UNMOUNTED', 'Storage drive physically disconnected. File metadata strictly preserved.')`,
            [reg.id, reg.current_drive_letter]
          );
        }
      }
    } catch (e) {}
  }

  async handleAgentDisconnect(agentId) {
    try {
      await db.query("UPDATE storage_agents SET status = 'OFFLINE', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [agentId]);
      const volRes = await db.query(
        `SELECT v.id, v.assigned_name FROM storage_volumes v
         JOIN storage_devices d ON v.device_id = d.id
         WHERE d.agent_id = $1 AND v.status = 'ONLINE'`,
        [agentId]
      );

      for (const vol of (volRes.rows || [])) {
        await db.query("UPDATE storage_volumes SET status = 'OFFLINE' WHERE id = $1", [vol.id]);
        await db.query("UPDATE files SET status = 'UNAVAILABLE_DRIVE_OFFLINE' WHERE storage_volume_id = $1 AND status = 'AVAILABLE'", [vol.id]);
      }
    } catch (err) {
      console.error('[AgentHub] Disconnect handler error:', err.message);
    }
  }

  async checkStaleAgents() {
    try {
      const res = await db.query(
        `SELECT id, agent_name FROM storage_agents WHERE status = 'ONLINE' AND last_heartbeat < (CURRENT_TIMESTAMP - INTERVAL '45 seconds')`
      );
      for (const agent of (res.rows || [])) {
        console.warn(`[AgentHub] Agent ${agent.agent_name} missed heartbeat. Marking OFFLINE.`);
        await this.handleAgentDisconnect(agent.id);
      }
    } catch (e) {}
  }

  async dispatchCommand(agentId, commandType, payload = {}, timeoutMs = 30000) {
    const agentSession = this.agents.get(agentId);
    if (!agentSession || !agentSession.authenticated || agentSession.ws.readyState !== 1) {
      throw new Error(`Storage host agent [${agentId}] is OFFLINE or unauthenticated. Cannot dispatch ${commandType}.`);
    }

    const commandId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + timeoutMs).toISOString();

    // Map commandType to canonical schema enum
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

    // Sign envelope with HMAC-SHA256
    const signData = `${commandId}|${commandType}|${idempotencyKey}|${expiresAt}|${JSON.stringify(payload)}`;
    const signature = crypto.createHmac('sha256', agentSession.agentSecret).update(signData).digest('hex');

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
        commandId,
        commandType,
        idempotencyKey,
        expiresAt,
        payload,
        signature
      }));
    });
  }

  async writeChunkToStorage(volumeId, relativePath, chunkIndex, chunkData, isLastChunk, chunkSha256) {
    const volRes = await db.query('SELECT * FROM storage_volumes WHERE id = $1', [volumeId]);
    if (!volRes.rows || !volRes.rows[0]) throw new Error('Storage volume not found');
    const volume = volRes.rows[0];
    if (volume.status !== 'ONLINE') {
      throw new Error(`Storage drive "${volume.assigned_name}" is currently OFFLINE`);
    }

    const devRes = await db.query('SELECT agent_id FROM storage_devices WHERE id = $1', [volume.device_id]);
    const agentId = devRes.rows[0]?.agent_id;

    // Handle both Buffer and Base64 string chunk data
    const chunkBase64 = Buffer.isBuffer(chunkData) ? chunkData.toString('base64') : chunkData;

    return await this.dispatchCommand(agentId, 'WRITE_CHUNK', {
      mountPath: volume.mount_path,
      relativePath,
      chunkIndex,
      chunkBase64,
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

    // Provide both buffer and base64 representation
    const buffer = result.dataBase64 ? Buffer.from(result.dataBase64, 'base64') : Buffer.alloc(0);
    return {
      buffer,
      dataBase64: result.dataBase64,
      bytesRead: result.bytesRead || buffer.length,
      totalBytes: result.totalBytes,
      startByte: result.startByte || startByte
    };
  }

  async verifyChecksumOnStorage(volumeId, relativePath, expectedSha256) {
    const volRes = await db.query('SELECT * FROM storage_volumes WHERE id = $1', [volumeId]);
    const volume = volRes.rows[0];
    const devRes = await db.query('SELECT agent_id FROM storage_devices WHERE id = $1', [volume.device_id]);
    const agentId = devRes.rows[0]?.agent_id;

    return await this.dispatchCommand(agentId, 'VERIFY_HASH', {
      mountPath: volume.mount_path,
      relativePath,
      expectedSha256
    });
  }

  async migrateFileOnStorage(sourceVolumeId, targetVolumeId, relativePath, expectedSha256) {
    const srcRes = await db.query('SELECT * FROM storage_volumes WHERE id = $1', [sourceVolumeId]);
    const tgtRes = await db.query('SELECT * FROM storage_volumes WHERE id = $1', [targetVolumeId]);
    const srcVol = srcRes.rows[0];
    const tgtVol = tgtRes.rows[0];

    const devRes = await db.query('SELECT agent_id FROM storage_devices WHERE id = $1', [srcVol.device_id]);
    const agentId = devRes.rows[0]?.agent_id;

    return await this.dispatchCommand(agentId, 'MIGRATE_COPY_CHUNK', {
      sourceMountPath: srcVol.mount_path,
      targetMountPath: tgtVol.mount_path,
      relativePath,
      expectedSha256
    }, 60000);
  }

  hasConnectedAgent() {
    for (const [_, agent] of this.agents) {
      if (agent.authenticated && agent.ws.readyState === 1) return true;
    }
    return false;
  }

  getFirstConnectedAgentId() {
    for (const [id, agent] of this.agents) {
      if (agent.authenticated && agent.ws.readyState === 1) return id;
    }
    return null;
  }
}

const agentHub = new StorageAgentHub();
export default agentHub;
