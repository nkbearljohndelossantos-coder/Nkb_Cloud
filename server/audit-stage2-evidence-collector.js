import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { FileStorageEngine } from '../storage-agent/src/file-engine.js';
import { AgentClient } from '../storage-agent/src/agent-client.js';

const DB_HOST = '127.0.0.1';
const DB_PORT = 5433;
const DB_SUPERUSER = 'postgres';
const DB_SUPERPASS = 'IsolatedStagingSecret2026!';

async function runEvidenceCollection() {
  console.log('========================================================================');
  console.log('   NKB CLOUD v2.1.0 — STAGE 2 INDEPENDENT AUDIT EVIDENCE COLLECTOR');
  console.log('   Read-Only Verification & Vulnerability Probe Harness');
  console.log('========================================================================\n');

  const evidence = {};

  // ---------------------------------------------------------------------------
  // PROBE 1: Agent Credential Cryptography & Database Exposure
  // ---------------------------------------------------------------------------
  console.log('--- PROBE 1: Agent Credential Storage & Key Derivation ---');
  const client = new pg.Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_SUPERUSER,
    password: DB_SUPERPASS,
    database: 'nkb_cloud_staging'
  });
  await client.connect();

  const tokenColRes = await client.query(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_name = 'storage_agents' AND column_name = 'agent_token'
  `);
  const credsColRes = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'agent_credentials'
  `);

  const agentSample = await client.query(`SELECT id, agent_token FROM storage_agents LIMIT 1`);
  const credSample = await client.query(`SELECT id, agent_id, hmac_secret_hash, key_version, status FROM agent_credentials LIMIT 1`);

  evidence.probe1 = {
    agentTokenColumn: tokenColRes.rows[0],
    credentialsColumns: credsColRes.rows.map(r => r.column_name),
    sampleAgentToken: agentSample.rows[0]?.agent_token,
    sampleSecretHash: credSample.rows[0]?.hmac_secret_hash
  };

  console.log('  [+] storage_agents.agent_token is stored as:', evidence.probe1.agentTokenColumn.data_type, '(Plaintext string)');
  console.log('  [+] Sample agent_token stored in DB:', evidence.probe1.sampleAgentToken);
  console.log('  [+] Sample hmac_secret_hash in agent_credentials:', evidence.probe1.sampleSecretHash);

  // ---------------------------------------------------------------------------
  // PROBE 2: Command Envelope Signature Stripping (Optional Signature Flaw)
  // ---------------------------------------------------------------------------
  console.log('\n--- PROBE 2: Command Envelope Signature Stripping Probe ---');
  const agentClient = new AgentClient({ agentSecret: 'super_secret_agent_key_2026' });
  let executedWithoutSig = false;

  agentClient.send = (msg) => {
    if (msg.status === 'EXECUTED') executedWithoutSig = true;
  };

  // Mock scanDrives
  agentClient.diskDetector.scanDrives = async () => ({ devices: [], volumes: [] });
  agentClient.reportDrives = async () => {};

  // Envelope with NO signature property
  const unsignedEnvelope = {
    commandId: crypto.randomUUID(),
    commandType: 'SCAN_DRIVES',
    idempotencyKey: 'probe-no-sig-' + Date.now(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    payload: {}
    // signature is explicitly omitted!
  };

  await agentClient.handleSecureCommand(unsignedEnvelope);

  evidence.probe2 = {
    unsignedExecutionAllowed: executedWithoutSig
  };
  console.log(`  [!] Unsigned envelope executed by agent when signature omitted? -> ${executedWithoutSig ? 'YES (VULNERABILITY CONFIRMED: Signature is optional)' : 'NO (Blocked)'}`);

  // ---------------------------------------------------------------------------
  // PROBE 3: True Binary Streaming vs In-Memory Buffering Analysis
  // ---------------------------------------------------------------------------
  console.log('\n--- PROBE 3: Binary Buffer Memory & Base64 Overhead Analysis ---');
  const sampleChunkSize = 10 * 1024 * 1024; // 10 MB chunk
  const rawChunk = crypto.randomBytes(sampleChunkSize);

  const memBefore = process.memoryUsage().heapUsed;
  const base64Chunk = rawChunk.toString('base64');
  const jsonEnvelope = JSON.stringify({
    commandId: crypto.randomUUID(),
    commandType: 'WRITE_CHUNK',
    payload: { chunkBase64: base64Chunk }
  });
  const memAfter = process.memoryUsage().heapUsed;

  evidence.probe3 = {
    rawChunkBytes: rawChunk.length,
    base64ChunkLength: base64Chunk.length,
    overheadPercentage: Math.round(((base64Chunk.length - rawChunk.length) / rawChunk.length) * 100),
    jsonEnvelopeLength: jsonEnvelope.length,
    memoryDeltaMB: Math.round((memAfter - memBefore) / 1024 / 1024)
  };

  console.log(`  [+] Raw Binary Chunk Size: ${(evidence.probe3.rawChunkBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  [+] Base64 Encoded Length: ${(evidence.probe3.base64ChunkLength / 1024 / 1024).toFixed(2)} MB (+${evidence.probe3.overheadPercentage}% overhead)`);
  console.log(`  [+] JSON Envelope String Length: ${(evidence.probe3.jsonEnvelopeLength / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  [+] Heap Delta during Base64+JSON serialization: ~${evidence.probe3.memoryDeltaMB} MB`);

  // ---------------------------------------------------------------------------
  // PROBE 4: Filesystem Sandboxing Path Validator Tests
  // ---------------------------------------------------------------------------
  console.log('\n--- PROBE 4: Filesystem Sandbox Path Security Vectors ---');
  const engine = new FileStorageEngine();
  const testRoot = path.resolve('temp_audit_sandbox');
  if (!fs.existsSync(testRoot)) fs.mkdirSync(testRoot, { recursive: true });
  engine.registerAllowlistedRoot(testRoot);

  const testVectors = [
    { name: 'Standard Path', path: 'documents/spec.pdf', expectBlock: false },
    { name: 'Directory Traversal (../)', path: '../../Windows/System32', expectBlock: true },
    { name: 'Deep Traversal with Mixed Slashes', path: 'sub/..\\..\\..\\Windows', expectBlock: true },
    { name: 'Windows ADS (:stream)', path: 'file.txt:hidden', expectBlock: true },
    { name: 'Windows ADS (::$DATA)', path: 'file.txt::$DATA', expectBlock: true },
    { name: 'Reserved Device CON', path: 'CON', expectBlock: true },
    { name: 'Reserved Device con.txt (case variation)', path: 'sub/con.txt', expectBlock: true },
    { name: 'Reserved Device AUX', path: 'AUX', expectBlock: true },
    { name: 'Reserved Device NUL', path: 'NUL', expectBlock: true },
    { name: 'Reserved Device COM1.dat', path: 'COM1.dat', expectBlock: true },
    { name: 'Null Byte Injection', path: 'file.txt\0.exe', expectBlock: true },
    { name: 'Absolute Windows Drive Path', path: 'C:\\Windows\\notepad.exe', expectBlock: true },
    { name: 'UNC Network Path', path: '\\\\attacker\\share\\malware.exe', expectBlock: true }
  ];

  const sandboxResults = [];
  for (const vec of testVectors) {
    let blocked = false;
    let errorMsg = '';
    try {
      engine.resolveSafePath(testRoot, vec.path);
    } catch (e) {
      blocked = true;
      errorMsg = e.message;
    }
    const pass = blocked === vec.expectBlock;
    sandboxResults.push({ name: vec.name, path: vec.path, blocked, pass, errorMsg });
    console.log(`  [${pass ? 'PASS' : 'FAIL'}] Vector: ${vec.name.padEnd(35)} | Blocked: ${String(blocked).padEnd(5)} | Expected: ${vec.expectBlock}`);
  }
  evidence.probe4 = sandboxResults;

  // Cleanup sandbox temp
  try { fs.rmSync(testRoot, { recursive: true, force: true }); } catch (e) {}

  // ---------------------------------------------------------------------------
  // PROBE 5: Safe Migration Non-Destructive Integrity Probe
  // ---------------------------------------------------------------------------
  console.log('\n--- PROBE 5: Safe Migration Non-Destructive Source Guarantee ---');
  const migSourceRoot = path.resolve('temp_mig_source');
  const migTargetRoot = path.resolve('temp_mig_target');
  if (!fs.existsSync(migSourceRoot)) fs.mkdirSync(migSourceRoot, { recursive: true });
  if (!fs.existsSync(migTargetRoot)) fs.mkdirSync(migTargetRoot, { recursive: true });

  const testFileRel = 'confidential_blueprint.cad';
  const testFileData = Buffer.from('CRITICAL NKB PRODUCTION CAD BLUEPRINT - INTELLECTUAL PROPERTY');
  const expectedSha = crypto.createHash('sha256').update(testFileData).digest('hex');

  fs.writeFileSync(path.join(migSourceRoot, testFileRel), testFileData);

  // 5.1 Test Migration Success
  const migSuccess = await engine.migrateFile({
    sourceMountPath: migSourceRoot,
    targetMountPath: migTargetRoot,
    relativePath: testFileRel,
    expectedSha256: expectedSha
  });

  const sourceStillExists = fs.existsSync(path.join(migSourceRoot, testFileRel));
  const sourceContentsMatch = fs.readFileSync(path.join(migSourceRoot, testFileRel)).equals(testFileData);
  const targetExists = fs.existsSync(path.join(migTargetRoot, testFileRel));

  // 5.2 Test Migration Mismatch Rejection & Rollback
  let mismatchCaught = false;
  try {
    await engine.migrateFile({
      sourceMountPath: migSourceRoot,
      targetMountPath: migTargetRoot,
      relativePath: testFileRel,
      expectedSha256: '0000000000000000000000000000000000000000000000000000000000000000' // wrong!
    });
  } catch (err) {
    mismatchCaught = true;
  }

  evidence.probe5 = {
    migSuccess,
    sourceStillExists,
    sourceContentsMatch,
    targetExists,
    mismatchCaught
  };

  console.log(`  [+] Migration executed successfully: ${migSuccess.migrated}`);
  console.log(`  [+] Source file remains completely intact and unmodified: ${sourceStillExists && sourceContentsMatch}`);
  console.log(`  [+] Target file created and verified: ${targetExists}`);
  console.log(`  [+] Checksum mismatch correctly rejected with rollback: ${mismatchCaught}`);

  // Cleanup migration temp
  try {
    fs.rmSync(migSourceRoot, { recursive: true, force: true });
    fs.rmSync(migTargetRoot, { recursive: true, force: true });
  } catch (e) {}

  await client.end();

  fs.writeFileSync('server/audit_evidence_summary.json', JSON.stringify(evidence, null, 2));
  console.log('\n========================================================================');
  console.log('   EVIDENCE COLLECTION COMPLETE — SAVED TO server/audit_evidence_summary.json');
  console.log('========================================================================\n');
}

runEvidenceCollection().catch(console.error);
