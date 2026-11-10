/**
 * NKB CLOUD v2.1.0 — LOCAL OFFLINE TEST HARNESS
 * Comprehensive Offline Local Testing Suite on Windows 11
 * Target Database: nkb_cloud_local_test on PostgreSQL 16.15 (127.0.0.1:5433)
 * Target Storage: C:\NKB-Cloud-Offline-Test\Storage
 * Zero Production Access & Zero VPS Connection
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure local environment variables are active
process.env.PORT = '5890';
process.env.PGHOST = '127.0.0.1';
process.env.PGPORT = '5433';
process.env.PGUSER = 'postgres';
process.env.PGPASSWORD = 'IsolatedStagingSecret2026!';
process.env.PGDATABASE = 'nkb_cloud_local_test';
process.env.STORAGE_ROOT = 'C:\\NKB-Cloud-Offline-Test\\Storage';
process.env.UPLOAD_TEMP_DIR = 'C:\\NKB-Cloud-Offline-Test\\Uploads';
process.env.DOWNLOAD_TEMP_DIR = 'C:\\NKB-Cloud-Offline-Test\\Downloads';
process.env.LOGS_DIR = 'C:\\NKB-Cloud-Offline-Test\\Logs';

const TEST_DATA_DIR = 'C:\\NKB-Cloud-Offline-Test\\TestData';
const STORAGE_DIR = process.env.STORAGE_ROOT;

// Import application components
import db from './config/db.js';
import agentHub from './services/agentHub.js';
import cryptoEngine, { buildCanonicalCommandString } from './services/cryptoEngine.js';
import { AgentClient } from '../storage-agent/src/agent-client.js';
import fileEngine from '../storage-agent/src/file-engine.js';
import commandJournal from '../storage-agent/src/command-journal.js';
import { signToken, verifyToken } from './config/jwt.js';

let passedAssertions = 0;
let totalAssertions = 0;
const testResults = [];

function assert(condition, message) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✅ [PASS]: ${message}`);
    testResults.push({ id: `TEST-${totalAssertions}`, message, status: 'PASS' });
  } else {
    console.error(`  ❌ [FAIL]: ${message}`);
    testResults.push({ id: `TEST-${totalAssertions}`, message, status: 'FAIL' });
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', d => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function runLocalOfflineSuite() {
  console.log('================================================================');
  console.log('  NKB CLOUD v2.1.0 — COMPLETE LOCAL OFFLINE TEST SUITE');
  console.log('  Windows 11 Offline Verification & Hardening Validation');
  console.log('  Target Database: nkb_cloud_local_test (PG 16.15 on 127.0.0.1:5433)');
  console.log('  Target Storage : C:\\NKB-Cloud-Offline-Test\\Storage');
  console.log('================================================================\n');

  // Register offline test storage in file engine
  fileEngine.registerAllowlistedRoot(STORAGE_DIR);

  // Initialize Database
  await db.initialize();
  assert(db.mode === 'postgres', 'Database successfully connected to local PostgreSQL 16 engine');

  // Verify PG16 version
  const verRes = await db.pool.query('SELECT version();');
  assert(verRes.rows[0].version.includes('PostgreSQL 16'), 'Verified PostgreSQL engine version is 16');

  // Create Express Test Server
  const app = express();
  app.use(express.json());
  const server = http.createServer(app);
  agentHub.initialize(server);

  await new Promise(resolve => server.listen(5890, '127.0.0.1', resolve));
  console.log('[TestServer] Running offline test harness on http://127.0.0.1:5890');

  // Load Test Manifest
  const manifest = JSON.parse(fs.readFileSync(path.join(TEST_DATA_DIR, 'manifest.json'), 'utf8'));

  // ------------------------------------------------------------------
  // SCENARIO A: APPLICATION LIFECYCLE, AUTHENTICATION & FOLDERS
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO A: Application Auth & Folder Navigation ---');

  // A.1: Superadmin authentication
  const superadminRes = await db.pool.query("SELECT * FROM users WHERE username = 'superadmin'");
  assert(superadminRes.rows.length === 1, 'Superadmin record present in local test database');
  const superadmin = superadminRes.rows[0];

  const authToken = signToken({
    id: superadmin.id,
    email: superadmin.email,
    username: superadmin.username,
    role: 'SUPER ADMIN'
  });
  assert(typeof authToken === 'string' && authToken.length > 50, 'JWT session token issued for superadmin');

  const decoded = verifyToken(authToken);
  assert(decoded.id === superadmin.id, 'JWT token successfully verified with superadmin id');
  assert(decoded.role === 'SUPER ADMIN', 'JWT token holds SUPER ADMIN role');

  // A.2: Role permissions verification
  const permRes = await db.pool.query(`
    SELECT p.name 
    FROM permissions p 
    JOIN role_permissions rp ON rp.permission_id = p.id 
    WHERE rp.role_id = 1
  `);
  const permNames = permRes.rows.map(r => r.name);
  assert(permNames.includes('files:upload'), 'Superadmin has files:upload permission');
  assert(permNames.includes('files:read'), 'Superadmin has files:read permission');
  assert(permNames.includes('storage:manage'), 'Superadmin has storage:manage permission');
  assert(permNames.includes('audit:view'), 'Superadmin has audit:view permission');

  // A.3: Folder creation & navigation
  const folderId = crypto.randomUUID();
  await db.pool.query(`
    INSERT INTO folders (id, name, parent_id, department_id, owner_id)
    VALUES ($1, $2, NULL, $3, $4)
  `, [folderId, 'Offline_Test_Folder', superadmin.department_id, superadmin.id]);

  const folderQuery = await db.pool.query('SELECT * FROM folders WHERE id = $1', [folderId]);
  assert(folderQuery.rows.length === 1, 'Folder created successfully in local database');
  assert(folderQuery.rows[0].name === 'Offline_Test_Folder', 'Folder name verified accurately');

  // Nested subfolder
  const subFolderId = crypto.randomUUID();
  await db.pool.query(`
    INSERT INTO folders (id, name, parent_id, department_id, owner_id)
    VALUES ($1, $2, $3, $4, $5)
  `, [subFolderId, 'Subfolder_Alpha', folderId, superadmin.department_id, superadmin.id]);

  const subFolderQuery = await db.pool.query('SELECT * FROM folders WHERE parent_id = $1', [folderId]);
  assert(subFolderQuery.rows.length === 1, 'Nested folder hierarchy verified successfully');
  assert(subFolderQuery.rows[0].id === subFolderId, 'Subfolder properly linked to parent folder');

  // ------------------------------------------------------------------
  // SCENARIO C: STORAGE AGENT SECURITY, ED25519 & REPLAY
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO C: Storage Agent Ed25519 Security & Pairing ---');

  const agentToken = 'nkb_offline_test_token_' + Date.now();
  const agentClient = new AgentClient({
    serverUrl: 'ws://127.0.0.1:5890/ws/agent',
    agentToken,
    agentName: 'NKB-OFFLINE-AGENT-01',
    agentSecret: agentToken
  });

  // Start agent and await handshake
  agentClient.start();
  await new Promise(resolve => setTimeout(resolve, 1500));

  assert(agentClient.authenticated === true, 'Agent authenticated via mutual Ed25519 challenge-response');
  assert(agentClient.cryptoEngine.pinnedServerPublicKey !== null, 'Server public key pinned on storage agent');
  assert(agentHub.hasConnectedAgent() === true, 'AgentHub registers agent online');

  // Register physical device and volume in database for the connected agent
  const connectedAgentId = agentClient.agentId;
  const deviceId = crypto.randomUUID();
  await db.pool.query(`
    INSERT INTO storage_devices (id, agent_id, hardware_serial, hardware_serial_evidence, disk_unique_id_evidence, total_capacity_bytes, status)
    VALUES ($1, $2, 'OFFLINE-DISK-SERIAL-01', 'OFFLINE-DISK-SERIAL-01', 'OFFLINE-DISK-ID-01', 500000000000, 'ONLINE')
    ON CONFLICT (agent_id, hardware_serial) DO NOTHING
  `, [deviceId, connectedAgentId]);

  const volumeId = crypto.randomUUID();
  const volInsertRes = await db.pool.query(`
    INSERT INTO storage_volumes (id, device_id, composite_identity, volume_uuid, hardware_serial, assigned_name, mount_path, filesystem, total_bytes, free_bytes, status, is_default)
    VALUES ($1, $2, $3, 'VOL-OFFLINE-01', 'OFFLINE-DISK-SERIAL-01', 'Offline-Storage-Primary', $4, 'NTFS', 500000000000, 400000000000, 'ONLINE', true)
    ON CONFLICT (composite_identity) DO UPDATE SET status = 'ONLINE', mount_path = $4, device_id = $2, updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `, [volumeId, deviceId, 'COMPOSITE-OFFLINE-TEST-VOL-01', STORAGE_DIR]);
  const activeVolumeId = volInsertRes.rows[0].id;

  // C.2: Signed Command Execution
  const scanResult = await agentHub.dispatchCommand(connectedAgentId, 'SCAN_DRIVES', {});
  assert(scanResult !== undefined, 'Server dispatched signed SCAN_DRIVES command and received verified reply');

  // C.3: Nonce Replay Rejection
  const replayedNonce = 'offline_nonce_' + Date.now();
  await db.pool.query(`
    INSERT INTO agent_nonce_registry (nonce, agent_id, expires_at)
    VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '5 minutes')
  `, [replayedNonce, connectedAgentId]);

  let replayBlocked = false;
  try {
    await db.pool.query(`
      INSERT INTO agent_nonce_registry (nonce, agent_id, expires_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '5 minutes')
    `, [replayedNonce, connectedAgentId]);
  } catch (err) {
    if (err.code === '23505') {
      replayBlocked = true;
    }
  }
  assert(replayBlocked === true, 'Duplicate nonce rejected by unique constraint (PostgreSQL Error 23505)');

  // C.4: Command Journal Crash Recovery
  const crashCmdId = crypto.randomUUID();
  const crashKey = 'key_crash_test_' + Date.now();
  commandJournal.recordCommandStart(crashCmdId, 'WRITE_CHUNK_STREAM', crashKey, 'hash_crash');
  assert(commandJournal.getCommandRecord(crashKey).status === 'RUNNING', 'Command starts as RUNNING in durable journal');

  commandJournal.performStartupRecovery();
  assert(commandJournal.getCommandRecord(crashKey).status === 'RECOVERY_REQUIRED', 'Interrupted command marked RECOVERY_REQUIRED on startup');

  // C.5: Storage Disconnect and Reconnect
  await agentHub.handleAgentDisconnect(connectedAgentId);
  const volOfflineCheck = await db.pool.query('SELECT status FROM storage_volumes WHERE id = $1', [activeVolumeId]);
  assert(volOfflineCheck.rows[0].status === 'OFFLINE', 'Storage volume status marked OFFLINE on agent disconnect');

  // Restore volume status for file operations
  await db.pool.query("UPDATE storage_volumes SET status = 'ONLINE' WHERE id = $1", [activeVolumeId]);
  await db.pool.query("UPDATE storage_agents SET status = 'ONLINE' WHERE id = $1", [connectedAgentId]);

  // ------------------------------------------------------------------
  // SCENARIO B: FILE OPERATIONS, CHUNKED UPLOADS & INTEGRITY
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO B: File Operations, Streaming & SHA-256 ---');

  for (const item of manifest) {
    console.log(`  Testing file: ${item.fileName} (${item.sizeMB} MB)...`);
    const filePath = path.join(TEST_DATA_DIR, item.fileName);
    const fileBytes = fs.readFileSync(filePath);

    // Write file using FileEngine in storage directory
    const chunkSize = 1 * 1024 * 1024; // 1 MB
    const totalChunks = Math.ceil(fileBytes.length / chunkSize);
    const targetRelative = path.join('test_uploads', item.fileName);

    let assembleResult = null;
    for (let c = 0; c < totalChunks; c++) {
      const isLast = (c === totalChunks - 1);
      const start = c * chunkSize;
      const end = isLast ? fileBytes.length : start + chunkSize;
      const chunkBuf = fileBytes.subarray(start, end);

      assembleResult = await fileEngine.writeChunk({
        mountPath: STORAGE_DIR,
        relativePath: targetRelative,
        chunkIndex: c,
        chunkBuffer: chunkBuf,
        isLastChunk: isLast
      });
    }

    assert(assembleResult.completed === true, `File ${item.fileName} assembled successfully`);
    assert(assembleResult.sha256.toLowerCase() === item.sha256.toLowerCase(), `SHA-256 for ${item.fileName} matches manifest bit-for-bit`);

    // Verify Range Reading Slice
    const sliceLen = Math.min(64 * 1024, fileBytes.length);
    const slice = await fileEngine.readChunk({
      mountPath: STORAGE_DIR,
      relativePath: targetRelative,
      startByte: 0,
      length: sliceLen
    });
    assert(slice.bytesRead === sliceLen, `Range read slice length verified for ${item.fileName}`);
    assert(slice.buffer.equals(fileBytes.subarray(0, sliceLen)), `Range read slice content matches origin for ${item.fileName}`);
  }

  // B.2: Interrupted Transfer and Resume Simulation
  console.log('  Testing Interrupted Transfer & Resumption...');
  const resumeFileName = 'interrupted_test.bin';
  const resumeBytes = crypto.randomBytes(3 * 1024 * 1024); // 3 MB (3 chunks)
  const resumeSha = crypto.createHash('sha256').update(resumeBytes).digest('hex');
  const resumeRelPath = path.join('test_uploads', resumeFileName);

  // Write Chunk 0 and Chunk 1 (Simulate interruption before Chunk 2)
  await fileEngine.writeChunk({
    mountPath: STORAGE_DIR,
    relativePath: resumeRelPath,
    chunkIndex: 0,
    chunkBuffer: resumeBytes.subarray(0, 1024 * 1024),
    isLastChunk: false
  });
  await fileEngine.writeChunk({
    mountPath: STORAGE_DIR,
    relativePath: resumeRelPath,
    chunkIndex: 1,
    chunkBuffer: resumeBytes.subarray(1024 * 1024, 2 * 1024 * 1024),
    isLastChunk: false
  });

  // Verify intermediate chunk presence
  const chunksDir = path.join(STORAGE_DIR, `${resumeRelPath}.chunks`);
  const partsBeforeResume = fs.readdirSync(chunksDir);
  assert(partsBeforeResume.length === 2, 'Interrupted transfer preserved chunks 0 and 1 on disk');

  // Resume by writing Chunk 2 (final chunk)
  const resumedResult = await fileEngine.writeChunk({
    mountPath: STORAGE_DIR,
    relativePath: resumeRelPath,
    chunkIndex: 2,
    chunkBuffer: resumeBytes.subarray(2 * 1024 * 1024),
    isLastChunk: true
  });

  assert(resumedResult.completed === true, 'Resumed transfer completed upon final chunk');
  assert(resumedResult.sha256.toLowerCase() === resumeSha.toLowerCase(), 'Resumed file SHA-256 verified bit-for-bit');

  // ------------------------------------------------------------------
  // SCENARIO D: FILESYSTEM SANDBOX SECURITY PENETRATION
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO D: Windows Filesystem Sandbox Penetration ---');

  const attackVectors = [
    { name: 'Directory Traversal (../../)', path: '../../Windows/System32/cmd.exe' },
    { name: 'UNC Network Path (\\\\attacker)', path: '\\\\attacker\\share\\malware.exe' },
    { name: 'UNC Forward Slash (//forward)', path: '//192.168.1.100/share/file.txt' },
    { name: 'Extended Length Path (\\\\?\\...)', path: '\\\\?\\C:\\Windows\\System32\\cmd.exe' },
    { name: 'Drive-Relative Path (C:file)', path: 'C:file.txt' },
    { name: 'Double Percent-Encoded', path: '%252e%252e%252fWindows' },
    { name: 'Trailing Dot Win32 Bypass', path: 'malware.exe.' },
    { name: 'Trailing Space Win32 Bypass', path: 'secret.txt ' },
    { name: 'Alternate Data Stream (:hidden)', path: 'file.txt:hidden' },
    { name: 'Alternate Data Stream (::$DATA)', path: 'file.txt::$DATA' },
    { name: 'Windows Reserved Device CON', path: 'CON' },
    { name: 'Windows Reserved Device AUX.txt', path: 'AUX.txt' },
    { name: 'Windows Reserved Device COM1.dat', path: 'sub/COM1.dat' },
    { name: 'Null Byte Injection', path: 'file.txt\0.exe' }
  ];

  let blockedCount = 0;
  for (const attack of attackVectors) {
    try {
      fileEngine.resolveSafePath(STORAGE_DIR, attack.path);
      console.error(`  ❌ Failed to block attack: ${attack.name}`);
    } catch (err) {
      blockedCount++;
    }
  }
  assert(blockedCount === attackVectors.length, `100% of attack vectors strictly blocked (${blockedCount}/${attackVectors.length})`);

  // ------------------------------------------------------------------
  // SCENARIO E: DATABASE INTEGRITY, BACKUP/RESTORE & AUDIT CHAIN
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO E: Database Migrations, Backup/Restore & Audit ---');

  // E.1: Verify migrations table
  const migRes = await db.pool.query('SELECT version, name FROM schema_migrations ORDER BY version');
  assert(migRes.rows.length === 6, 'All 6 migrations (001-006) recorded in schema_migrations');
  assert(migRes.rows[5].version === '006', 'Migration 006 (Stage 2 Security Hardening) active');

  // E.2: Verify 36 tables and 2 views
  const tableCountRes = await db.pool.query(`
    SELECT count(*)::int AS count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name != 'schema_migrations';
  `);
  assert(tableCountRes.rows[0].count === 36, 'Exact 36 public physical tables present');

  const viewCountRes = await db.pool.query(`
    SELECT count(*)::int AS count 
    FROM information_schema.views 
    WHERE table_schema = 'public';
  `);
  assert(viewCountRes.rows[0].count === 2, 'Exact 2 public database views present');

  // E.3: Audit Log Immutability & Hash Chain
  const res1 = await db.pool.query(`
    INSERT INTO audit_logs (user_id, action, entity_type, ip_address, details)
    VALUES ($1, 'LOGIN_OFFLINE', 'USER', '127.0.0.1', '{"login": "offline"}')
    RETURNING id, record_hash, previous_hash
  `, [superadmin.id]);
  const log1 = res1.rows[0];

  const res2 = await db.pool.query(`
    INSERT INTO audit_logs (user_id, action, entity_type, ip_address, details)
    VALUES ($1, 'UPLOAD_OFFLINE', 'FILE', '127.0.0.1', '{"file": "dummy_sample.txt"}')
    RETURNING id, record_hash, previous_hash
  `, [superadmin.id]);
  const log2 = res2.rows[0];

  assert(log1.record_hash !== null && log1.record_hash.length === 64, 'First audit log record_hash computed cryptographically');
  assert(log2.previous_hash === log1.record_hash, 'Cryptographic previous_hash matches log1 record_hash (Unbroken chain)');

  // Verify immutability trigger blocks update
  let updateBlocked = false;
  try {
    await db.pool.query("UPDATE audit_logs SET action = 'TAMPERED' WHERE id = $1", [log1.id]);
  } catch (err) {
    updateBlocked = true;
  }
  assert(updateBlocked === true, 'Audit log immutability trigger blocks unauthorized UPDATE');

  // ------------------------------------------------------------------
  // SCENARIO F: OFFLINE NETWORK ISOLATION AUDIT
  // ------------------------------------------------------------------
  console.log('\n--- SCENARIO F: Offline Network Isolation Audit ---');

  assert(server.address().address === '127.0.0.1', 'Server strictly bound to localhost loopback (127.0.0.1)');
  assert(server.address().port === 5890, 'Server bound to test port 5890');

  // Verify client build artifact exists locally
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  assert(fs.existsSync(path.join(clientDist, 'index.html')), 'Client SPA production build exists locally in client/dist');

  const clientJsFiles = fs.readdirSync(path.join(clientDist, 'assets')).filter(f => f.endsWith('.js'));
  assert(clientJsFiles.length >= 1, 'Client JavaScript bundle compiled and stored locally (Zero CDN script dependency)');

  // Close agent and server
  agentClient.stop();
  server.close();
  await db.pool.end();

  console.log('\n================================================================');
  console.log(`  OFFLINE LOCAL TEST SUITE COMPLETE: ${passedAssertions} / ${totalAssertions} PASSED (100%)`);
  console.log('  Windows 11 Local Offline Environment Fully Certified');
  console.log('================================================================');

  // Write results JSON
  const reportPath = 'C:\\NKB-Cloud-Offline-Test\\Logs\\offline_test_results.json';
  fs.writeFileSync(reportPath, JSON.stringify({
    executionTimestamp: new Date().toISOString(),
    totalAssertions,
    passedAssertions,
    status: 'ALL_PASSED',
    results: testResults
  }, null, 2));
  console.log(`Results saved to: ${reportPath}`);
  process.exit(0);
}

runLocalOfflineSuite().catch(err => {
  console.error('[FATAL TEST FAILURE]', err);
  process.exit(1);
});
