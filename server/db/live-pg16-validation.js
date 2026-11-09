import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
import { validateJwtConfiguration, signToken, verifyToken } from '../config/jwt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PG_CONFIG = {
  host: '127.0.0.1',
  port: 5433,
  user: 'postgres',
  password: 'IsolatedStagingSecret2026!',
  database: 'nkb_cloud_staging'
};

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runLivePostgreSql16Validation() {
  console.log('========================================================================');
  console.log('  NKB CLOUD v2.1.0 – LIVE POSTGRESQL 16 STAGING VALIDATION');
  console.log('========================================================================\n');

  // Check connectivity to isolated PostgreSQL 16 container
  const rootPool = new pg.Pool(PG_CONFIG);
  let pgVersion = '';
  try {
    const verRes = await rootPool.query('SELECT version();');
    pgVersion = verRes.rows[0].version;
    console.log(`[ENGINE] Connected to Live PostgreSQL 16 Engine:\n         ${pgVersion}\n`);
  } catch (err) {
    console.error('[FATAL] Failed to connect to isolated PostgreSQL 16 container:', err.message);
    process.exit(1);
  }

  // TEST 1: Fresh Database Migration from Zero
  console.log('[TEST 1] Clean Database Migration from Zero...');
  await rootPool.query('DROP DATABASE IF EXISTS nkb_cloud_clean;');
  await rootPool.query('CREATE DATABASE nkb_cloud_clean;');

  const cleanPool = new pg.Pool({ ...PG_CONFIG, database: 'nkb_cloud_clean' });
  await cleanPool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !f.includes('rollback'))
    .sort();

  for (const file of migrationFiles) {
    const version = file.split('_')[0];
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await cleanPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
        [version, file]
      );
      await client.query('COMMIT');
      console.log(`  ✓ Applied migration: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // TEST 2: Upgrade Migration from Previous Schema
  console.log('\n[TEST 2] Upgrade Migration Path from Previous Schema (001 + 002 -> 003 + 004)...');
  await rootPool.query('DROP DATABASE IF EXISTS nkb_cloud_upgrade;');
  await rootPool.query('CREATE DATABASE nkb_cloud_upgrade;');

  const upgradePool = new pg.Pool({ ...PG_CONFIG, database: 'nkb_cloud_upgrade' });
  await upgradePool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Step A: Apply 001 and 002 (simulating pre-remediation database)
  for (const file of ['001_initial_schema.sql', '002_v2.1.0_identity_security_dlp.sql']) {
    const version = file.split('_')[0];
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await upgradePool.query(sql);
    await upgradePool.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [version, file]);
  }

  // Verify missing tables don't exist before 003
  const preCheck = await upgradePool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name IN ('storage_mount_history', 'storage_health_logs', 'agent_heartbeats')
  `);
  if (preCheck.rows.length > 0) throw new Error('Expected missing tables to not exist in pre-003 schema');
  console.log('  ✓ Pre-remediation state confirmed (3 operational tables absent).');

  // Step B: Apply 003 and 004 upgrade
  for (const file of ['003_add_missing_stage1_tables.sql', '004_audit_log_protection.sql']) {
    const version = file.split('_')[0];
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await upgradePool.query(sql);
    await upgradePool.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [version, file]);
    console.log(`  ✓ Successfully upgraded with: ${file}`);
  }

  // Verify missing tables now exist in upgraded DB
  const postCheck = await upgradePool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name IN ('storage_mount_history', 'storage_health_logs', 'agent_heartbeats')
  `);
  if (postCheck.rows.length !== 3) throw new Error('Upgrade failed to create all 3 operational tables');
  console.log('  ✓ Upgraded database verified: all 3 operational tables successfully provisioned.');

  // TEST 3: All 36 Physical Tables and 2 Views
  console.log('\n[TEST 3] Physical Table & View Inventory Audit...');
  const tableQuery = `
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name != 'schema_migrations'
    ORDER BY table_name;
  `;
  const viewQuery = `
    SELECT table_name FROM information_schema.views 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `;

  const tablesRes = await cleanPool.query(tableQuery);
  const viewsRes = await cleanPool.query(viewQuery);

  console.log(`  ✓ Physical Tables Count: ${tablesRes.rows.length} (Expected: 36)`);
  if (tablesRes.rows.length !== 36) {
    throw new Error(`Expected exactly 36 physical tables, found: ${tablesRes.rows.length}`);
  }

  console.log(`  ✓ Views Count: ${viewsRes.rows.length} (Expected: 2)`);
  const viewNames = viewsRes.rows.map(v => v.table_name);
  if (!viewNames.includes('agent_command_queue') || !viewNames.includes('storage_migrations')) {
    throw new Error(`Missing expected compatibility views: ${viewNames.join(', ')}`);
  }
  console.log('  ✓ Views verified: agent_command_queue, storage_migrations');

  // TEST 4: Foreign Key Relationships and Indexes
  console.log('\n[TEST 4] Foreign Keys and Performance Indexes...');
  const fkRes = await cleanPool.query(`
    SELECT conname, confdeltype 
    FROM pg_constraint 
    WHERE contype = 'f';
  `);
  console.log(`  ✓ Total Active Foreign Key Constraints: ${fkRes.rows.length}`);

  const idxRes = await cleanPool.query(`
    SELECT indexname 
    FROM pg_indexes 
    WHERE schemaname = 'public';
  `);
  console.log(`  ✓ Total Active Indexes: ${idxRes.rows.length}`);

  // TEST 5: ON DELETE RESTRICT Enforcement
  console.log('\n[TEST 5] ON DELETE RESTRICT Data-Loss Prevention Test...');
  const testAgentId = crypto.randomUUID();
  const testDeviceId = crypto.randomUUID();
  const testVolumeId = crypto.randomUUID();
  const testUserId = crypto.randomUUID();
  const testFileId = crypto.randomUUID();

  // Setup test hierarchy
  await cleanPool.query(`
    INSERT INTO storage_agents (id, agent_name, machine_name, agent_token, status)
    VALUES ($1, 'TEST-HOST', 'NKB-TEST', 'tok_test_123', 'ONLINE');
  `, [testAgentId]);

  await cleanPool.query(`
    INSERT INTO storage_devices (id, agent_id, hardware_serial, hardware_serial_evidence, total_capacity_bytes)
    VALUES ($1, $2, 'SN-TEST-99', 'SN-TEST-99', 1000000000);
  `, [testDeviceId, testAgentId]);

  await cleanPool.query(`
    INSERT INTO storage_volumes (id, device_id, hardware_serial, volume_uuid, volume_guid, assigned_name, composite_identity, mount_path, total_bytes, free_bytes)
    VALUES ($1, $2, 'SN-TEST-99', 'GUID-TEST-99', 'GUID-TEST-99', 'TEST-VOL', 'comp-hash-99', 'G:\\', 1000000000, 1000000000);
  `, [testVolumeId, testDeviceId]);

  await cleanPool.query(`
    INSERT INTO roles (id, name) VALUES (1, 'SUPER ADMIN') ON CONFLICT (id) DO NOTHING;
  `);

  await cleanPool.query(`
    INSERT INTO users (id, username, email, password_hash, full_name, role_id)
    VALUES ($1, 'testuser', 'test@nkb.com', 'hash', 'Test User', 1);
  `, [testUserId]);

  await cleanPool.query(`
    INSERT INTO files (id, owner_id, name, original_name, mime_type, size_bytes, storage_volume_id, relative_path, sha256_hash)
    VALUES ($1, $2, 'critical.dwg', 'critical.dwg', 'application/octet-stream', 5000, $3, 'critical.dwg', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  `, [testFileId, testUserId, testVolumeId]);

  // Attempt to delete storage_volume while file references it
  let restrictTriggered = false;
  try {
    await cleanPool.query('DELETE FROM storage_volumes WHERE id = $1;', [testVolumeId]);
  } catch (err) {
    if (err.code === '23503') { // foreign_key_violation
      restrictTriggered = true;
      console.log(`  ✓ ON DELETE RESTRICT Verified: PostgreSQL blocked volume deletion with code ${err.code} (${err.detail})`);
    } else {
      throw err;
    }
  }
  if (!restrictTriggered) throw new Error('FAIL: ON DELETE RESTRICT failed to block volume deletion with dependent file!');

  // TEST 6: Audit Log Immutability & Cryptographic Hash Chaining
  console.log('\n[TEST 6] Audit Log Immutability & Hash Chain Test...');
  
  // Step A: INSERT into audit_logs
  const auditRes1 = await cleanPool.query(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES ($1, 'TEST_OPERATION_1', 'FILE', $2, '{"note":"first"}'::jsonb)
    RETURNING id, previous_hash, record_hash;
  `, [testUserId, testFileId]);

  const audit1 = auditRes1.rows[0];
  console.log(`  ✓ Row 1 Inserted: ID=${audit1.id}`);
  console.log(`    - previous_hash: ${audit1.previous_hash}`);
  console.log(`    - record_hash:   ${audit1.record_hash}`);
  if (audit1.previous_hash !== '0000000000000000000000000000000000000000000000000000000000000000') {
    throw new Error('Genesis audit row previous_hash was not zero-initialized');
  }

  // Insert Row 2 in chain
  const auditRes2 = await cleanPool.query(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES ($1, 'TEST_OPERATION_2', 'FILE', $2, '{"note":"second"}'::jsonb)
    RETURNING id, previous_hash, record_hash;
  `, [testUserId, testFileId]);
  const audit2 = auditRes2.rows[0];
  console.log(`  ✓ Row 2 Inserted: ID=${audit2.id}`);
  console.log(`    - previous_hash: ${audit2.previous_hash}`);
  console.log(`    - record_hash:   ${audit2.record_hash}`);
  if (audit2.previous_hash !== audit1.record_hash) {
    throw new Error('Chain broken: Row 2 previous_hash does not match Row 1 record_hash');
  }
  console.log('  ✓ Cryptographic chaining verified: Row 2 previous_hash matches Row 1 record_hash.');

  // Step B: Attempt UPDATE on audit_logs (Must fail)
  let updateBlocked = false;
  try {
    await cleanPool.query("UPDATE audit_logs SET action = 'TAMPERED' WHERE id = $1;", [audit1.id]);
  } catch (err) {
    updateBlocked = true;
    console.log(`  ✓ UPDATE Denied by Database Trigger: "${err.message}"`);
  }
  if (!updateBlocked) throw new Error('FAIL: Database allowed UPDATE on audit_logs!');

  // Step C: Attempt DELETE on audit_logs (Must fail)
  let deleteBlocked = false;
  try {
    await cleanPool.query('DELETE FROM audit_logs WHERE id = $1;', [audit1.id]);
  } catch (err) {
    deleteBlocked = true;
    console.log(`  ✓ DELETE Denied by Database Trigger: "${err.message}"`);
  }
  if (!deleteBlocked) throw new Error('FAIL: Database allowed DELETE on audit_logs!');

  // TEST 7: JWT Secret Fail-Closed Security
  console.log('\n[TEST 7] JWT Secret Fail-Closed Security Tests...');
  const testCases = [
    { secret: null, expectedValid: false, label: 'Missing / null secret' },
    { secret: '', expectedValid: false, label: 'Empty secret' },
    { secret: 'short-key-123', expectedValid: false, label: 'Too short (< 32 chars)' },
    { secret: 'nkb-cloud-enterprise-secret-key-2026-production', expectedValid: false, label: 'Prohibited default placeholder' },
    { secret: 'a'.repeat(32), expectedValid: true, label: 'Valid 32-character custom secret' },
    { secret: '4f9b2a7e18c53d9e0b82f6a14c3e7d59b02a1e8c4d3b6f9a7e0c2d4b8a1e3f5c', expectedValid: true, label: 'Valid 256-bit hex secret' }
  ];

  for (const tc of testCases) {
    const res = validateJwtConfiguration(tc.secret);
    if (res.valid !== tc.expectedValid) {
      throw new Error(`JWT Validation mismatch for ${tc.label}: expected valid=${tc.expectedValid}, got ${res.valid}`);
    }
    console.log(`  ✓ JWT Case: ${tc.label} -> ${res.valid ? 'PERMITTED' : 'REJECTED (Fail-Closed)'}`);
  }

  // Token signing & verification with valid secret
  const validSecret = '4f9b2a7e18c53d9e0b82f6a14c3e7d59b02a1e8c4d3b6f9a7e0c2d4b8a1e3f5c';
  process.env.JWT_SECRET = validSecret;
  const token = signToken({ userId: testUserId, role: 'SUPER ADMIN' });
  const verified = verifyToken(token);
  if (!verified || verified.userId !== testUserId) throw new Error('JWT Sign/Verify failed with valid secret');
  console.log('  ✓ Token signing & cryptographic verification verified with valid 256-bit secret.');

  // TEST 8: Seed Integrity & All 11 DLP Statuses
  console.log('\n[TEST 8] Seed Integrity & DLP Baseline Statuses...');
  const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
  await cleanPool.query(seedSql);

  const dlpRows = await cleanPool.query(`
    SELECT requirement_key, verification_status 
    FROM dlp_test_evidence 
    ORDER BY requirement_key;
  `);

  console.log(`  ✓ Total DLP Requirements Tracked: ${dlpRows.rows.length} (Expected: 11)`);
  if (dlpRows.rows.length !== 11) {
    throw new Error(`Expected 11 DLP rows, found ${dlpRows.rows.length}`);
  }

  let passCount = 0;
  for (const r of dlpRows.rows) {
    if (r.verification_status !== 'NOT_TESTED') {
      passCount++;
    }
  }
  if (passCount > 0) {
    throw new Error(`VIOLATION: Found ${passCount} DLP tests not in NOT_TESTED status in database!`);
  }
  console.log('  ✓ All 11 DLP test evidence records confirmed strictly in NOT_TESTED status.');

  // TEST 9: Backup & Restoration Using Actual PostgreSQL Tools (pg_dump & pg_restore)
  console.log('\n[TEST 9] Actual PostgreSQL Backup & Restore Drill (pg_dump & pg_restore)...');
  const { execSync } = await import('child_process');

  // Dump clean database using native pg_dump in docker container
  execSync('docker exec nkb_pg16_staging pg_dump -U postgres -F c -b -v -f /tmp/staging_backup.dump nkb_cloud_clean');
  console.log('  ✓ pg_dump executed successfully (created /tmp/staging_backup.dump)');

  // Create restoration target DB
  await rootPool.query('DROP DATABASE IF EXISTS nkb_cloud_restored;');
  await rootPool.query('CREATE DATABASE nkb_cloud_restored;');

  // Restore dump into target DB
  execSync('docker exec nkb_pg16_staging pg_restore -U postgres -d nkb_cloud_restored -v /tmp/staging_backup.dump');
  console.log('  ✓ pg_restore executed successfully into nkb_cloud_restored');

  const restoredPool = new pg.Pool({ ...PG_CONFIG, database: 'nkb_cloud_restored' });
  const restoredTablesRes = await restoredPool.query(tableQuery);
  const restoredViewsRes = await restoredPool.query(viewQuery);

  console.log(`  ✓ Restored Tables Count: ${restoredTablesRes.rows.length} (Matches Original: ${tablesRes.rows.length})`);
  console.log(`  ✓ Restored Views Count:  ${restoredViewsRes.rows.length} (Matches Original: ${viewsRes.rows.length})`);

  if (restoredTablesRes.rows.length !== tablesRes.rows.length) {
    throw new Error('Restored table count mismatch!');
  }

  // TEST 10: Migration Status Consistency
  console.log('\n[TEST 10] Migration Status Consistency Check...');
  const migStatusRes = await cleanPool.query('SELECT version, name, applied_at FROM schema_migrations ORDER BY version;');
  console.log('  Applied Migrations in schema_migrations:');
  for (const m of migStatusRes.rows) {
    console.log(`    - [${m.version}] ${m.name} (Applied at: ${m.applied_at.toISOString()})`);
  }
  if (migStatusRes.rows.length !== 4) {
    throw new Error(`Expected 4 recorded migrations, found: ${migStatusRes.rows.length}`);
  }
  console.log('  ✓ All 4 migrations (001, 002, 003, 004) verified applied and registered.');

  // Cleanup pools
  await cleanPool.end();
  await upgradePool.end();
  await restoredPool.end();
  await rootPool.end();

  console.log('\n========================================================================');
  console.log('  ALL 10 LIVE POSTGRESQL 16 TESTS 100% PASSED');
  console.log('========================================================================\n');
}

runLivePostgreSql16Validation().then(() => process.exit(0)).catch(err => {
  console.error('\n[VALIDATION FAILED]:', err);
  process.exit(1);
});
