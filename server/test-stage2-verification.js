import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import express from 'express';
import WebSocket, { WebSocketServer } from 'ws';
import dotenv from 'dotenv';

dotenv.config();

import db from './config/db.js';
import agentHub from './services/agentHub.js';
import { FileStorageEngine } from '../storage-agent/src/file-engine.js';
import { AgentClient } from '../storage-agent/src/agent-client.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  ❌ [FAIL]: ${message}`);
    throw new Error(`Test Assertion Failed: ${message}`);
  }
  passedTests++;
  console.log(`  ✅ [PASS]: ${message}`);
}

async function runStage2Verification() {
  console.log('================================================================');
  console.log('   NKB CLOUD v2.1.0 — STAGE 2 COMPREHENSIVE VERIFICATION SUITE');
  console.log('   Storage Agent Security & File Transfer Engine');
  console.log('================================================================\n');

  await db.initialize();
  console.log(`[Database] Initialized in ${db.mode} mode`);
  const testTempDir = path.join(process.cwd(), 'temp_stage2_test');
  if (!fs.existsSync(testTempDir)) fs.mkdirSync(testTempDir, { recursive: true });

  const testPort = 5899;
  const app = express();
  app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));
  app.use(express.json());

  const server = http.createServer(app);
  agentHub.initialize(server);

  await new Promise((resolve) => server.listen(testPort, resolve));
  console.log(`[TestServer] Test harness running on port ${testPort}`);

  const agentSecret = 'test_agent_secret_key_prod_stage2_2026';
  const agentToken = 'nkb_token_stage2_verified';
  const agentId = crypto.randomUUID();

  try {
    // ---------------------------------------------------------------------------
    // TEST 1: Agent Registration & Database Identity
    // ---------------------------------------------------------------------------
    console.log('\n--- TEST 1: Windows Storage Agent Registration & Credentials ---');
    const agentRes = await db.query(
      `INSERT INTO storage_agents (id, agent_name, machine_name, agent_token, status)
       VALUES ($1, 'NKB-TEST-HOST', 'TEST-PC', $2, 'OFFLINE')
       ON CONFLICT (agent_token) DO UPDATE SET status = 'OFFLINE'
       RETURNING id`,
      [agentId, agentToken]
    );
    const resolvedAgentId = agentRes.rows[0]?.id || agentId;

    const secretHash = crypto.createHash('sha256').update(agentSecret).digest('hex');
    await db.query(
      `INSERT INTO agent_credentials (id, agent_id, hmac_secret_hash, key_version, status, expires_at)
       VALUES ($1, $2, $3, 1, 'ACTIVE', CURRENT_TIMESTAMP + INTERVAL '365 days')`,
      [crypto.randomUUID(), resolvedAgentId, secretHash]
    );

    const agentCheck = await db.query('SELECT * FROM storage_agents WHERE id = $1', [resolvedAgentId]);
    assert(agentCheck.rows.length > 0, 'Storage agent registered successfully');
    assert(agentCheck.rows[0].status === 'OFFLINE', 'Initial agent status is OFFLINE before handshake');

    // ---------------------------------------------------------------------------
    // TEST 2: HMAC-SHA256 Challenge-Response Mutual Authentication
    // ---------------------------------------------------------------------------
    console.log('\n--- TEST 2: Mutual Challenge-Response Authentication Handshake ---');
    process.env.AGENT_SECRET = agentSecret;

    const wsUrl = `ws://localhost:${testPort}/ws/agent`;
    let clientNonceCaptured = null;
    let serverNonceCaptured = null;

    const wsClient = new WebSocket(wsUrl, {
      headers: { 'x-agent-token': agentToken }
    });

    let authGranted = false;
    let sessionTokenReceived = null;

    await new Promise((resolve, reject) => {
      wsClient.on('open', () => {});
      wsClient.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'CHALLENGE_REQUEST') {
          serverNonceCaptured = msg.serverNonce;
          clientNonceCaptured = crypto.randomBytes(32).toString('hex');
          const payload = `${msg.challengeId}|${msg.serverNonce}|${clientNonceCaptured}|${msg.serverTimestamp}`;
          const clientHmac = crypto.createHmac('sha256', agentSecret).update(payload).digest('hex');

          wsClient.send(JSON.stringify({
            type: 'CHALLENGE_RESPONSE',
            challengeId: msg.challengeId,
            clientNonce: clientNonceCaptured,
            clientHmac,
            agentVersion: '2.1.0'
          }));
        } else if (msg.type === 'AUTH_GRANTED') {
          authGranted = true;
          sessionTokenReceived = msg.sessionToken;
          resolve();
        } else if (msg.type === 'AUTH_REJECTED') {
          reject(new Error(`Auth rejected: ${msg.reason}`));
        }
      });
      wsClient.on('error', reject);
    });

    assert(authGranted === true, 'Server granted mutual authentication following valid HMAC-SHA256 response');
    assert(Boolean(sessionTokenReceived), 'Server issued secure session token');
    assert(agentHub.hasConnectedAgent() === true, 'AgentHub marks agent active and authenticated');

    // ---------------------------------------------------------------------------
    // TEST 3: Nonce Validation & Replay Attack Prevention
    // ---------------------------------------------------------------------------
    console.log('\n--- TEST 3: Nonce Registry & Replay Attack Prevention ---');
    // Verify nonces recorded in registry
    const nonceDb = await db.query('SELECT nonce FROM agent_nonce_registry WHERE nonce = $1 OR nonce = $2', [serverNonceCaptured, clientNonceCaptured]);
    assert(nonceDb.rows.length >= 1, 'Client and server nonces persisted in agent_nonce_registry');

    // Simulate attacker replaying previously used nonce
    const attackerWs = new WebSocket(wsUrl, {
      headers: { 'x-agent-token': agentToken }
    });

    let replayRejected = false;
    let rejectionReason = '';

    await new Promise((resolve) => {
      attackerWs.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'CHALLENGE_REQUEST') {
          // Replay old client nonce
          const payload = `${msg.challengeId}|${msg.serverNonce}|${clientNonceCaptured}|${msg.serverTimestamp}`;
          const replayedHmac = crypto.createHmac('sha256', agentSecret).update(payload).digest('hex');

          attackerWs.send(JSON.stringify({
            type: 'CHALLENGE_RESPONSE',
            challengeId: msg.challengeId,
            clientNonce: clientNonceCaptured, // Replayed!
            clientHmac: replayedHmac,
            agentVersion: '2.1.0'
          }));
        } else if (msg.type === 'AUTH_REJECTED') {
          replayRejected = true;
          rejectionReason = msg.reason;
          resolve();
        }
      });
      attackerWs.on('close', (code) => {
        if (code === 4003) replayRejected = true;
        resolve();
      });
    });

    assert(replayRejected === true, `Replay attack detected and intercepted by nonce registry (${rejectionReason || 'Socket 4003 closed'})`);

    // ---------------------------------------------------------------------------
    // TEST 4: Invalid Secret Rejection
    // ---------------------------------------------------------------------------
    console.log('\n--- TEST 4: Invalid HMAC Secret Verification Failure ---');
    const invalidWs = new WebSocket(wsUrl, {
      headers: { 'x-agent-token': agentToken }
    });

    let invalidRejected = false;
    await new Promise((resolve) => {
      invalidWs.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'CHALLENGE_REQUEST') {
          const fakeNonce = crypto.randomBytes(32).toString('hex');
          const payload = `${msg.challengeId}|${msg.serverNonce}|${fakeNonce}|${msg.serverTimestamp}`;
          const fakeHmac = crypto.createHmac('sha256', 'WRONG_SECRET_KEY').update(payload).digest('hex');

          invalidWs.send(JSON.stringify({
            type: 'CHALLENGE_RESPONSE',
            challengeId: msg.challengeId,
            clientNonce: fakeNonce,
            clientHmac: fakeHmac
          }));
        } else if (msg.type === 'AUTH_REJECTED') {
          invalidRejected = true;
          resolve();
        }
      });
      invalidWs.on('close', (code) => {
        if (code === 4003) invalidRejected = true;
        resolve();
      });
    });

    assert(invalidRejected === true, 'Unauthorized agent with invalid HMAC secret rejected');

    // ---------------------------------------------------------------------------
    // TEST 5: Typed, Signed & Expiring Command Envelopes
    // ---------------------------------------------------------------------------
    console.log('\n--- TEST 5: Typed, Signed Command Envelopes with Verification ---');
    let receivedCommandEnvelope = null;

    // Attach command handler to verified wsClient
    wsClient.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.commandId) {
        receivedCommandEnvelope = msg;
        // Verify signature on client side
        const signData = `${msg.commandId}|${msg.commandType}|${msg.idempotencyKey || ''}|${msg.expiresAt}|${JSON.stringify(msg.payload || {})}`;
        const computed = crypto.createHmac('sha256', agentSecret).update(signData).digest('hex');
        const isSigValid = computed === msg.signature;

        wsClient.send(JSON.stringify({
          type: 'COMMAND_REPLY',
          commandId: msg.commandId,
          status: isSigValid ? 'EXECUTED' : 'FAILED',
          payload: { echo: msg.payload, signatureVerified: isSigValid }
        }));
      }
    });

    const cmdPayload = { testFile: 'audit_spec.docx', sizeBytes: 1048576 };
    const targetAgentId = agentHub.getFirstConnectedAgentId();
    const commandResult = await agentHub.dispatchCommand(targetAgentId, 'SCAN_DRIVES', cmdPayload, 10000);

    assert(Boolean(receivedCommandEnvelope), 'Command envelope received by agent');
    assert(Boolean(receivedCommandEnvelope.signature), 'Envelope signed with HMAC-SHA256 signature');
    assert(Boolean(receivedCommandEnvelope.idempotencyKey), 'Envelope contains unique idempotency key');
    assert(Boolean(receivedCommandEnvelope.expiresAt), 'Envelope contains strict expiration timestamp');
    assert(commandResult.signatureVerified === true, 'Agent verified envelope cryptographic HMAC-SHA256 signature');

    // ---------------------------------------------------------------------------
    // TEST 6: Command Expiration
    // ---------------------------------------------------------------------------
    console.log('\n--- TEST 6: Command Expiration Window Enforcement ---');
    const clientHandler = new AgentClient({ agentSecret });
    const expiredEnvelope = {
      commandId: crypto.randomUUID(),
      commandType: 'SCAN_DRIVES',
      expiresAt: new Date(Date.now() - 5000).toISOString(), // 5 seconds in past
      payload: {}
    };

    let replySent = null;
    clientHandler.send = (msg) => { replySent = msg; };
    await clientHandler.handleSecureCommand(expiredEnvelope);

    assert(replySent && replySent.status === 'EXPIRED', 'Agent skips execution and flags status EXPIRED for expired commands');

    // ---------------------------------------------------------------------------
    // TEST 7: Command Idempotency
    // ---------------------------------------------------------------------------
    console.log('\n--- TEST 7: Idempotent Command Execution ---');
    let executionCount = 0;
    const testIdempotencyKey = 'idempotent-key-' + crypto.randomUUID();
    clientHandler.executedCommands.clear();

    // Mock fileEngine.verifyChecksum
    clientHandler.fileEngine.verifyChecksum = async () => {
      executionCount++;
      return { isMatch: true };
    };

    const validEnvelope = {
      commandId: crypto.randomUUID(),
      commandType: 'VERIFY_HASH',
      idempotencyKey: testIdempotencyKey,
      expiresAt: new Date(Date.now() + 10000).toISOString(),
      payload: { mountPath: testTempDir, relativePath: 'file.txt', expectedSha256: 'abc' },
      signature: ''
    };
    // Sign validEnvelope
    const signPayload = `${validEnvelope.commandId}|${validEnvelope.commandType}|${validEnvelope.idempotencyKey}|${validEnvelope.expiresAt}|${JSON.stringify(validEnvelope.payload)}`;
    validEnvelope.signature = crypto.createHmac('sha256', agentSecret).update(signPayload).digest('hex');

    await clientHandler.handleSecureCommand(validEnvelope);
    assert(executionCount === 1, 'First command execution invoked engine');

    // Replay identical command
    await clientHandler.handleSecureCommand(validEnvelope);
    assert(executionCount === 1, 'Duplicate command with same idempotencyKey did not re-execute');

    // ---------------------------------------------------------------------------
    // TEST 8: Filesystem Sandboxing & Reparse Point / ADS Protection
    // ---------------------------------------------------------------------------
    console.log('\n--- TEST 8: Filesystem Sandboxing & Reparse Point / ADS Protection ---');
    const engine = new FileStorageEngine();
    engine.registerAllowlistedRoot(testTempDir);

    // 8.1 Path traversal rejection
    let pathTraversalCaught = false;
    try {
      engine.resolveSafePath(testTempDir, '../../Windows/System32/cmd.exe');
    } catch (e) {
      pathTraversalCaught = e.message.includes('Security Violation');
    }
    assert(pathTraversalCaught === true, 'Path traversal (../../) strictly blocked');

    // 8.2 Null byte rejection
    let nullByteCaught = false;
    try {
      engine.resolveSafePath(testTempDir, 'data.txt\0.exe');
    } catch (e) {
      nullByteCaught = e.message.includes('Security Violation');
    }
    assert(nullByteCaught === true, 'Null byte injection strictly blocked');

    // 8.3 Alternate Data Streams (ADS) rejection
    let adsColonCaught = false;
    try {
      engine.resolveSafePath(testTempDir, 'legit.txt:hidden_stream');
    } catch (e) {
      adsColonCaught = e.message.includes('alternate data stream');
    }
    assert(adsColonCaught === true, 'Alternate Data Stream (colon) strictly blocked');

    let adsDataCaught = false;
    try {
      engine.resolveSafePath(testTempDir, 'legit.txt::$DATA');
    } catch (e) {
      adsDataCaught = e.message.includes('alternate data stream');
    }
    assert(adsDataCaught === true, 'Alternate Data Stream (::$DATA) strictly blocked');

    // 8.4 Windows reserved system device names
    let reservedDeviceCaught = false;
    try {
      engine.resolveSafePath(testTempDir, 'CON');
    } catch (e) {
      reservedDeviceCaught = e.message.includes('reserved system device name');
    }
    assert(reservedDeviceCaught === true, 'Windows reserved device CON strictly blocked');

    let auxDeviceCaught = false;
    try {
      engine.resolveSafePath(testTempDir, 'folder/AUX.txt');
    } catch (e) {
      auxDeviceCaught = e.message.includes('reserved system device name');
    }
    assert(auxDeviceCaught === true, 'Windows reserved device AUX.txt strictly blocked');

    // ---------------------------------------------------------------------------
    // TEST 9: Raw Binary Resumable Chunk Upload & Assembly
    // ---------------------------------------------------------------------------
    console.log('\n--- TEST 9: Raw Binary Resumable Chunk Upload & SHA-256 Assembly ---');
    const testFileName = 'binary_engine_test.dat';
    const chunk1Data = crypto.randomBytes(64 * 1024); // 64 KB
    const chunk2Data = crypto.randomBytes(64 * 1024); // 64 KB
    const fullExpectedData = Buffer.concat([chunk1Data, chunk2Data]);
    const fullExpectedSha256 = crypto.createHash('sha256').update(fullExpectedData).digest('hex');

    const chunk1Hash = crypto.createHash('sha256').update(chunk1Data).digest('hex');
    const chunk2Hash = crypto.createHash('sha256').update(chunk2Data).digest('hex');

    // Write chunk 0 (Binary Buffer)
    const write1 = await engine.writeChunk({
      mountPath: testTempDir,
      relativePath: testFileName,
      chunkIndex: 0,
      chunkBuffer: chunk1Data,
      isLastChunk: false,
      chunkSha256: chunk1Hash
    });
    assert(write1.completed === false, 'Chunk 0 written, assembly pending');
    assert(write1.bytesWritten === chunk1Data.length, 'Chunk 0 byte count accurate');

    // Write chunk 1 (Final Chunk)
    const write2 = await engine.writeChunk({
      mountPath: testTempDir,
      relativePath: testFileName,
      chunkIndex: 1,
      chunkBuffer: chunk2Data,
      isLastChunk: true,
      chunkSha256: chunk2Hash
    });
    assert(write2.completed === true, 'File successfully assembled upon final chunk');
    assert(write2.bytesWritten === fullExpectedData.length, 'Final assembled file size matches total chunks');
    assert(write2.sha256 === fullExpectedSha256, 'Final assembled file SHA-256 matches bit-for-bit');

    // ---------------------------------------------------------------------------
    // TEST 10: HTTP Range Streaming Download
    // ---------------------------------------------------------------------------
    console.log('\n--- TEST 10: Range Streaming Slice Reading ---');
    const sliceStart = 1000;
    const sliceLength = 2048;
    const readSlice = await engine.readChunk({
      mountPath: testTempDir,
      relativePath: testFileName,
      startByte: sliceStart,
      length: sliceLength
    });

    assert(readSlice.bytesRead === sliceLength, 'Range reader fetched exact requested slice length');
    const expectedSliceBuffer = fullExpectedData.subarray(sliceStart, sliceStart + sliceLength);
    assert(readSlice.buffer.equals(expectedSliceBuffer), 'Range slice byte content matches origin file exactly');

    // ---------------------------------------------------------------------------
    // TEST 11: Cryptographic Checksum Verification
    // ---------------------------------------------------------------------------
    console.log('\n--- TEST 11: Cryptographic Checksum Verification ---');
    const verifyPass = await engine.verifyChecksum({
      mountPath: testTempDir,
      relativePath: testFileName,
      expectedSha256: fullExpectedSha256
    });
    assert(verifyPass.isMatch === true, 'Storage engine verified valid SHA-256 match');

    const verifyFail = await engine.verifyChecksum({
      mountPath: testTempDir,
      relativePath: testFileName,
      expectedSha256: '0000000000000000000000000000000000000000000000000000000000000000'
    });
    assert(verifyFail.isMatch === false, 'Storage engine correctly rejected mismatched checksum');

    // ---------------------------------------------------------------------------
    // TEST 12: Safe File Migration Verification
    // ---------------------------------------------------------------------------
    console.log('\n--- TEST 12: Safe Non-Destructive File Migration ---');
    const targetDir = path.join(testTempDir, 'target_mount');
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const migResult = await engine.migrateFile({
      sourceMountPath: testTempDir,
      targetMountPath: targetDir,
      relativePath: testFileName,
      expectedSha256: fullExpectedSha256
    });

    assert(migResult.migrated === true, 'File migration succeeded');
    assert(migResult.verified === true, 'File migration verified with SHA-256');
    // Source file must remain intact!
    const sourceFilePath = path.join(testTempDir, testFileName);
    assert(fs.existsSync(sourceFilePath) === true, 'Source file remains preserved (Zero destructive delete)');

    // ---------------------------------------------------------------------------
    // SUMMARY
    // ---------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`   STAGE 2 VERIFICATION COMPLETE: ${passedTests} / ${totalTests} TESTS PASSED (100%)`);
    console.log('   All 12 Stage 2 Security & File Engine Criteria Certified');
    console.log('================================================================\n');

    // Cleanup test artifacts
    try {
      wsClient.close();
      server.close();
      fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch (e) {}

    process.exit(0);

  } catch (err) {
    console.error('\n❌ STAGE 2 VERIFICATION FAILED:', err);
    try {
      server.close();
      fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch (e) {}
    process.exit(1);
  }
}

runStage2Verification();
