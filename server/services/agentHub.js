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
      const activeDeviceIds = new Set();
      const activeVolumeIds = new Set();

      for (const dev of devices) {
        const rawSerial = (dev.hardwareSerial || 'UNKNOWN').trim();
        const rawUniqueId = (dev.diskUniqueId || 'UNKNOWN').trim();
        const rawModel = (dev.model || 'UNKNOWN').trim();
        const isGenericSerial = !rawSerial || rawSerial === 'UNKNOWN' || /^0+$/.test(rawSerial);

        // Calculate identity confidence
        let confidence = 'VERIFIED';
        if (isGenericSerial) {
          if (rawUniqueId && rawUniqueId !== 'UNKNOWN') {
            confidence = 'PARTIALLY_IDENTIFIED';
          } else {
            confidence = 'MANUAL_VERIFICATION_REQUIRED';
          }
        }

        // For devices with generic serials, use uniqueId or diskNumber to prevent agent_id,hardware_serial unique collision
        const dbHardwareSerial = isGenericSerial
          ? `GENERIC-${(rawUniqueId !== 'UNKNOWN' ? crypto.createHash('sha256').update(rawUniqueId).digest('hex').substring(0, 12) : dev.diskNumber)}`
          : rawSerial;

        // Check for existing device record
        const existing = await db.query(
          `SELECT id, hardware_serial, model, vendor, disk_unique_id_evidence, identity_confidence
           FROM storage_devices 
           WHERE agent_id = $1 AND (hardware_serial = $2 OR hardware_serial_evidence = $3)`,
          [agentId, dbHardwareSerial, rawSerial]
        );

        let deviceId;
        if (existing.rows && existing.rows[0]) {
          const prev = existing.rows[0];
          deviceId = prev.id;

          // Detect IDENTITY_MISMATCH: if genuine non-generic serial suddenly has completely different model
          if (!isGenericSerial && prev.model && prev.model !== rawModel && !rawModel.includes(prev.model) && !prev.model.includes(rawModel)) {
            confidence = 'IDENTITY_MISMATCH';
            console.warn(`[AgentHub] IDENTITY_MISMATCH detected for serial ${rawSerial}: Previous '${prev.model}' vs Current '${rawModel}'`);
            
            // Record conflict
            await db.query(
              `INSERT INTO storage_identity_conflicts (
                 storage_device_id, conflict_reason, previous_snapshot, current_snapshot, status
               ) VALUES ($1, $2, $3, $4, 'OPEN')`,
              [
                deviceId,
                'HARDWARE_MODEL_CHANGE_FOR_SERIAL',
                JSON.stringify({ serial: prev.hardware_serial, model: prev.model, vendor: prev.vendor }),
                JSON.stringify({ serial: rawSerial, model: rawModel, vendor: dev.vendor }),
              ]
            );
          }

          await db.query(
            `UPDATE storage_devices SET 
               status = 'ONLINE',
               last_seen_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP,
               total_capacity_bytes = $1,
               media_type = $2,
               bus_type = $3,
               vendor = $4,
               model = $5,
               health_status = $6,
               hardware_serial_evidence = $7,
               disk_unique_id_evidence = $8,
               identity_confidence = $9
             WHERE id = $10`,
            [
              dev.totalCapacityBytes || dev.capacityBytes || 0,
              dev.mediaType || 'UNKNOWN',
              dev.busType || 'UNKNOWN',
              dev.vendor || 'UNKNOWN',
              rawModel,
              dev.healthStatus || 'Healthy',
              rawSerial,
              rawUniqueId,
              confidence,
              deviceId
            ]
          );
        } else {
          deviceId = crypto.randomUUID();
          await db.query(
            `INSERT INTO storage_devices (
               id, agent_id, hardware_serial, hardware_serial_evidence, disk_unique_id_evidence,
               vendor, model, bus_type, media_type, total_capacity_bytes,
               health_status, identity_confidence, status, registered_at, updated_at, last_seen_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ONLINE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
              deviceId,
              agentId,
              dbHardwareSerial,
              rawSerial,
              rawUniqueId,
              dev.vendor || 'UNKNOWN',
              rawModel,
              dev.busType || 'UNKNOWN',
              dev.mediaType || 'UNKNOWN',
              dev.totalCapacityBytes || dev.capacityBytes || 0,
              dev.healthStatus || 'Healthy',
              confidence
            ]
          );
        }

        activeDeviceIds.add(deviceId);

        // Record identity observation for this physical disk
        await db.query(
          `INSERT INTO storage_identity_observations (
             agent_id, storage_device_id, raw_device_payload, computed_confidence, reconciliation_verdict
           ) VALUES ($1, $2, $3, $4, $5)`,
          [
            agentId,
            deviceId,
            JSON.stringify(dev),
            confidence,
            `Device index ${dev.diskNumber} (${rawModel}) reconciled as ${confidence}`
          ]
        );

        // Process volumes associated with this physical disk
        const devVolumes = volumes.filter(
          v => v.diskNumber === dev.diskNumber || v.diskIndex === dev.deviceIndex
        );

        for (const vol of devVolumes) {
          const volGuid = vol.volumeGuid || vol.volumeUuid || 'UNKNOWN_GUID';
          const compId = vol.compositeIdentity || crypto.createHash('sha256').update(`${dbHardwareSerial}:${volGuid}:${vol.partitionOffset || 0}`).digest('hex');
          const driveLetter = vol.driveLetter || null;
          const assignedName = vol.label || vol.volumeLabel || (driveLetter ? `Drive ${driveLetter}` : `Partition ${vol.partitionNumber}`);

          const volExisting = await db.query(
            `SELECT id, current_drive_letter, mount_path, volume_uuid, volume_guid
             FROM storage_volumes 
             WHERE composite_identity = $1 OR (device_id = $2 AND volume_uuid = $3)`,
            [compId, deviceId, volGuid]
          );

          let volumeId;
          if (volExisting.rows && volExisting.rows[0]) {
            const existingVol = volExisting.rows[0];
            volumeId = existingVol.id;

            // Detect changed drive letter
            if (driveLetter && existingVol.current_drive_letter && existingVol.current_drive_letter !== driveLetter) {
              console.log(`[AgentHub] Volume drive letter change: was '${existingVol.current_drive_letter}', now '${driveLetter}' (Volume UUID: ${volGuid})`);
              await db.query(
                `INSERT INTO storage_identity_observations (
                   agent_id, storage_device_id, storage_volume_id, raw_device_payload,
                   observed_drive_letter, observed_volume_guid, computed_confidence, reconciliation_verdict
                 ) VALUES ($1, $2, $3, $4, $5, $6, 'VERIFIED', $7)`,
                [
                  agentId,
                  deviceId,
                  volumeId,
                  JSON.stringify(vol),
                  driveLetter,
                  volGuid,
                  `Drive letter reassigned from ${existingVol.current_drive_letter} to ${driveLetter}; composite identity preserved`
                ]
              );
            }

            await db.query(
              `UPDATE storage_volumes SET 
                 device_id = $1,
                 status = 'ONLINE',
                 last_verified_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP,
                 current_drive_letter = $2,
                 mount_path = $3,
                 label = $4,
                 filesystem = $5,
                 filesystem_type = $5,
                 total_bytes = $6,
                 free_bytes = $7,
                 used_bytes = $8,
                 volume_guid = $9
               WHERE id = $10`,
              [
                deviceId,
                driveLetter,
                vol.mountPath,
                assignedName,
                vol.filesystem || 'NTFS',
                vol.totalBytes || 0,
                vol.freeBytes || 0,
                vol.usedBytes || 0,
                volGuid,
                volumeId
              ]
            );
          } else {
            volumeId = crypto.randomUUID();
            await db.query(
              `INSERT INTO storage_volumes (
                 id, device_id, composite_identity, volume_uuid, volume_guid, hardware_serial,
                 partition_unique_id, partition_offset_bytes, label, assigned_name,
                 storage_purpose, filesystem, filesystem_type, current_drive_letter, mount_path,
                 total_bytes, used_bytes, free_bytes, status, is_default, priority,
                 last_verified_at, created_at, updated_at
               ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $8, 'GENERAL', $9, $9, $10, $11, $12, $13, $14, 'ONLINE', false, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
               ON CONFLICT (composite_identity) DO UPDATE SET
                 device_id = $2,
                 status = 'ONLINE',
                 label = $8,
                 assigned_name = $8,
                 current_drive_letter = $10,
                 mount_path = $11,
                 total_bytes = $12,
                 free_bytes = $14,
                 used_bytes = $13,
                 updated_at = CURRENT_TIMESTAMP`,
              [
                volumeId,
                deviceId,
                compId,
                volGuid,
                dbHardwareSerial,
                vol.partitionUniqueId || `PART-${dev.diskNumber}-${vol.partitionNumber}`,
                vol.partitionOffset || 0,
                assignedName,
                vol.filesystem || 'NTFS',
                driveLetter,
                vol.mountPath,
                vol.totalBytes || 0,
                vol.usedBytes || 0,
                vol.freeBytes || 0
              ]
            );

            // Layer 3: Ensure enterprise registration entry exists
            const assetTag = `NKB-TAG-${compId.substring(0, 8).toUpperCase()}`;
            await db.query(
              `INSERT INTO storage_registrations (
                 nkb_asset_tag, storage_device_id, storage_volume_id, assigned_name,
                 storage_purpose, priority, is_default, registration_status, registered_at, updated_at
               ) VALUES ($1, $2, $3, $4, 'GENERAL', 1, false, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
               ON CONFLICT (nkb_asset_tag) DO NOTHING`,
              [assetTag, deviceId, volumeId, assignedName]
            );
          }

          activeVolumeIds.add(volumeId);
        }
      }

      // Mark unobserved devices belonging to this agent as OFFLINE
      if (activeDeviceIds.size > 0) {
        const idList = Array.from(activeDeviceIds);
        await db.query(
          `UPDATE storage_devices SET status = 'OFFLINE', updated_at = CURRENT_TIMESTAMP
           WHERE agent_id = $1 AND NOT (id = ANY($2::uuid[]))`,
          [agentId, idList]
        );
      }

      // Mark unobserved volumes belonging to these devices as OFFLINE
      if (activeVolumeIds.size > 0) {
        const volIdList = Array.from(activeVolumeIds);
        await db.query(
          `UPDATE storage_volumes SET status = 'OFFLINE', updated_at = CURRENT_TIMESTAMP
           WHERE device_id = ANY($1::uuid[]) AND NOT (id = ANY($2::uuid[]))`,
          [Array.from(activeDeviceIds), volIdList]
        );
      }

    } catch (err) {
      console.error('[AgentHub] Error updating drives inventory:', err);
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
      'LIST_DIRECTORY': 'SCAN_DRIVES',
      'GET_FILE_INFO': 'SCAN_DRIVES',
      'READ_TEXT_PREVIEW': 'READ_CHUNK_STREAM',
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

  // Actual Drive Content Browser: Browse directory contents via Storage Agent
  async browseVolumeDirectory(volumeId, { relativePath = '', page = 1, limit = 50, sortBy = 'name', sortOrder = 'asc', search = '' }) {
    const volRes = await db.query(
      `SELECT v.*, d.agent_id, d.status as device_status, d.identity_confidence, d.hardware_serial, d.model as device_model
       FROM storage_volumes v
       JOIN storage_devices d ON v.device_id = d.id
       WHERE v.id = $1`,
      [volumeId]
    );

    if (!volRes.rows || !volRes.rows[0]) {
      throw new Error('Storage volume not found');
    }

    const volume = volRes.rows[0];
    if (volume.status !== 'ONLINE' || volume.device_status !== 'ONLINE') {
      throw new Error(`Storage drive "${volume.assigned_name || volume.current_drive_letter}" is currently OFFLINE`);
    }

    if (volume.identity_confidence === 'IDENTITY_MISMATCH') {
      throw new Error(`Security Violation: Storage volume belongs to a drive flagged with IDENTITY_MISMATCH. Access is blocked until manual verification.`);
    }

    const agentId = volume.agent_id;
    const hasLetter = volume.current_drive_letter && volume.current_drive_letter.trim() !== '';
    const volumeRoot = hasLetter ? `${volume.current_drive_letter}\\` : volume.mount_path;

    const result = await this.dispatchCommand(agentId, 'LIST_DIRECTORY', {
      volumeRoot,
      relativePath,
      page,
      limit,
      sortBy,
      sortOrder,
      search
    }, 20000);

    return {
      volume: {
        id: volume.id,
        assignedName: volume.assigned_name,
        currentDriveLetter: volume.current_drive_letter,
        filesystem: volume.filesystem,
        totalBytes: volume.total_bytes,
        freeBytes: volume.free_bytes,
        usedBytes: volume.used_bytes,
        status: volume.status,
        deviceModel: volume.device_model,
        identityConfidence: volume.identity_confidence
      },
      ...result
    };
  }

  // Actual Drive Content Browser: Get file metadata and fingerprint
  async getVolumeFileInfo(volumeId, relativePath) {
    const volRes = await db.query(
      `SELECT v.*, d.agent_id, d.status as device_status, d.identity_confidence
       FROM storage_volumes v
       JOIN storage_devices d ON v.device_id = d.id
       WHERE v.id = $1`,
      [volumeId]
    );

    if (!volRes.rows || !volRes.rows[0]) throw new Error('Storage volume not found');
    const volume = volRes.rows[0];
    if (volume.status !== 'ONLINE') throw new Error(`Drive is OFFLINE`);
    if (volume.identity_confidence === 'IDENTITY_MISMATCH') throw new Error(`IDENTITY_MISMATCH violation`);

    const hasLetter = volume.current_drive_letter && volume.current_drive_letter.trim() !== '';
    const volumeRoot = hasLetter ? `${volume.current_drive_letter}\\` : volume.mount_path;

    return await this.dispatchCommand(volume.agent_id, 'GET_FILE_INFO', {
      volumeRoot,
      relativePath
    }, 15000);
  }

  // Actual Drive Content Browser: Read text preview safely
  async readVolumeTextPreview(volumeId, relativePath) {
    const volRes = await db.query(
      `SELECT v.*, d.agent_id, d.status as device_status, d.identity_confidence
       FROM storage_volumes v
       JOIN storage_devices d ON v.device_id = d.id
       WHERE v.id = $1`,
      [volumeId]
    );

    if (!volRes.rows || !volRes.rows[0]) throw new Error('Storage volume not found');
    const volume = volRes.rows[0];
    if (volume.status !== 'ONLINE') throw new Error(`Drive is OFFLINE`);

    const hasLetter = volume.current_drive_letter && volume.current_drive_letter.trim() !== '';
    const volumeRoot = hasLetter ? `${volume.current_drive_letter}\\` : volume.mount_path;

    return await this.dispatchCommand(volume.agent_id, 'READ_TEXT_PREVIEW', {
      volumeRoot,
      relativePath
    }, 15000);
  }

  // Actual Drive Content Browser: Read binary file chunk for download/preview streaming
  async streamVolumeFile(volumeId, relativePath, startByte = 0, length = null) {
    const volRes = await db.query(
      `SELECT v.*, d.agent_id, d.status as device_status, d.identity_confidence
       FROM storage_volumes v
       JOIN storage_devices d ON v.device_id = d.id
       WHERE v.id = $1`,
      [volumeId]
    );

    if (!volRes.rows || !volRes.rows[0]) throw new Error('Storage volume not found');
    const volume = volRes.rows[0];
    if (volume.status !== 'ONLINE') throw new Error(`Drive is OFFLINE`);
    if (volume.identity_confidence === 'IDENTITY_MISMATCH') throw new Error(`IDENTITY_MISMATCH violation`);

    const hasLetter = volume.current_drive_letter && volume.current_drive_letter.trim() !== '';
    const volumeRoot = hasLetter ? `${volume.current_drive_letter}\\` : volume.mount_path;

    const result = await this.dispatchCommand(volume.agent_id, 'READ_CHUNK', {
      mountPath: volumeRoot,
      relativePath,
      startByte,
      length
    }, 30000);

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
