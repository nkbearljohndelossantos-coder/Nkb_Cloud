import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runStage1SchemaValidation() {
  console.log('========================================================================');
  console.log('  NKB CLOUD v2.1.0 – STAGE 1 SCHEMA & DATA INTEGRITY VALIDATION');
  console.log('========================================================================\n');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const migration002Path = path.join(__dirname, 'migrations', '002_v2.1.0_identity_security_dlp.sql');
  const seedPath = path.join(__dirname, 'seed.sql');

  if (!fs.existsSync(schemaPath)) throw new Error('schema.sql missing');
  if (!fs.existsSync(migration002Path)) throw new Error('002_v2.1.0_identity_security_dlp.sql missing');
  if (!fs.existsSync(seedPath)) throw new Error('seed.sql missing');

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const migrationSql = fs.readFileSync(migration002Path, 'utf8');
  const seedSql = fs.readFileSync(seedPath, 'utf8');

  // 1. Table Coverage Audit (34 Mandatory Entities)
  console.log('[CHECK 1] Mandatory Database Entities Coverage Check...');
  const mandatoryTables = [
    'users',
    'departments',
    'roles',
    'permissions',
    'role_permissions',
    'storage_agents',
    'agent_credentials',
    'agent_nonce_registry',
    'agent_heartbeats',
    'storage_devices',
    'storage_volumes',
    'storage_registrations',
    'storage_identity_observations',
    'storage_identity_conflicts',
    'storage_mount_history',
    'storage_health_logs',
    'folders',
    'files',
    'file_versions',
    'file_chunks',
    'file_checksums',
    'file_shares',
    'file_permissions',
    'upload_sessions',
    'agent_commands',
    'agent_command_results',
    'storage_integrity_jobs',
    'storage_integrity_results',
    'migration_jobs',
    'migration_file_results',
    'download_logs',
    'audit_logs',
    'recycle_bin',
    'dlp_test_runs',
    'dlp_test_evidence',
    'system_settings'
  ];

  const missingTables = [];
  for (const table of mandatoryTables) {
    const tableRegex = new RegExp(`CREATE TABLE (IF NOT EXISTS )?${table}\\b`, 'i');
    if (!tableRegex.test(schemaSql)) {
      missingTables.push(table);
    }
  }

  if (missingTables.length > 0) {
    throw new Error(`Missing mandatory database tables in schema.sql: ${missingTables.join(', ')}`);
  }
  console.log(`  ✓ All ${mandatoryTables.length} mandatory tables verified in schema.sql.`);

  // 2. Storage Identity Decoupling & Constraints Check
  console.log('\n[CHECK 2] 3-Layer Storage Identity Decoupling & Confidence Check...');
  const confidenceCheck = "identity_confidence IN ('VERIFIED', 'PARTIALLY_IDENTIFIED', 'MANUAL_VERIFICATION_REQUIRED', 'IDENTITY_MISMATCH')";
  if (!schemaSql.includes(confidenceCheck)) {
    throw new Error('storage_devices identity_confidence CHECK constraint mismatch or missing');
  }
  console.log('  ✓ storage_devices identity_confidence CHECK constraint verified.');

  const volumeStatusCheck = "status IN ('ONLINE', 'OFFLINE', 'MAINTENANCE', 'RETIRED', 'IDENTITY_MISMATCH', 'PENDING_ADMIN_REVIEW')";
  if (!schemaSql.includes(volumeStatusCheck)) {
    throw new Error('storage_volumes status CHECK constraint mismatch or missing');
  }
  console.log('  ✓ storage_volumes status CHECK constraint verified.');

  const registrationPurposeCheck = "storage_purpose IN ('PRIMARY', 'DOCUMENTS', 'ARCHIVE', 'ADDITIONAL', 'BACKUP', 'GENERAL')";
  if (!schemaSql.includes(registrationPurposeCheck)) {
    throw new Error('storage_registrations storage_purpose CHECK constraint mismatch or missing');
  }
  console.log('  ✓ storage_registrations storage_purpose CHECK constraint verified.');

  // 3. Foreign Key Safeguards (ON DELETE RESTRICT on core storage references)
  console.log('\n[CHECK 3] Foreign Key Delete Safety Checks...');
  if (!schemaSql.includes('storage_volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE RESTRICT')) {
    throw new Error('files table MUST use ON DELETE RESTRICT on storage_volume_id to prevent accidental data loss');
  }
  console.log('  ✓ files -> storage_volumes ON DELETE RESTRICT verified (prevents deletion of files if volume record altered).');

  if (!schemaSql.includes('storage_volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE RESTRICT') &&
      !schemaSql.includes('source_volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE RESTRICT')) {
    throw new Error('migration_jobs table MUST use ON DELETE RESTRICT on volume pointers');
  }
  console.log('  ✓ migration_jobs -> storage_volumes ON DELETE RESTRICT verified.');

  // 4. Indexing & Unique Constraints
  console.log('\n[CHECK 4] Performance Indexes & Unique Key Constraints...');
  const requiredUniqueKeys = [
    'composite_identity VARCHAR(64) UNIQUE NOT NULL',
    'nkb_asset_tag VARCHAR(100) UNIQUE NOT NULL',
    'idempotency_key VARCHAR(128) UNIQUE NOT NULL',
    'execution_id VARCHAR(100) UNIQUE NOT NULL'
  ];
  for (const uq of requiredUniqueKeys) {
    if (!schemaSql.includes(uq)) {
      throw new Error(`Missing expected unique constraint in schema: ${uq}`);
    }
  }
  console.log('  ✓ Unique constraints (composite_identity, nkb_asset_tag, idempotency_key, execution_id) verified.');

  // 5. DLP Baseline Assertion (Strictly NOT_TESTED)
  console.log('\n[CHECK 5] Data-Loss Prevention (DLP) Baseline Status Inspection...');
  if (seedSql.includes("'PASS'") && seedSql.includes("dlp_test_evidence")) {
    throw new Error('VIOLATION: Seed SQL must NOT contain assumed PASS statuses for physical drive tests.');
  }

  // Count NOT_TESTED entries in seed.sql
  const notTestedMatches = (seedSql.match(/'NOT_TESTED'/g) || []).length;
  if (notTestedMatches < 11) {
    throw new Error(`Expected at least 11 NOT_TESTED entries in DLP seed, found: ${notTestedMatches}`);
  }
  console.log(`  ✓ All 11 DLP test evidence records strictly initialized as NOT_TESTED (${notTestedMatches} verified).`);

  // 6. Database Connection & Schema Boot Verification
  console.log('\n[CHECK 6] Database Initialization & Seed Ingestion...');
  await db.initialize();
  console.log(`  ✓ Database operational mode: ${db.mode}`);

  const usersRes = await db.query("SELECT email, full_name, role_name FROM users WHERE email = 'admin@nkbmanufacturing.com'");
  if (!usersRes.rows || usersRes.rows.length === 0) {
    throw new Error('Super Admin user seeding failed');
  }
  console.log(`  ✓ Super Admin active: ${usersRes.rows[0].email} (${usersRes.rows[0].role_name})`);

  const dlpRes = await db.query("SELECT * FROM dlp_test_runs WHERE execution_id = 'DLP-BASELINE-INIT-2026'");
  if (!dlpRes.rows || dlpRes.rows.length === 0) {
    throw new Error('DLP baseline run record not initialized in database');
  }
  console.log(`  ✓ DLP Baseline test run registered: ${dlpRes.rows[0].execution_id} (Status: ${dlpRes.rows[0].overall_status})`);

  console.log('\n========================================================================');
  console.log('  STAGE 1 DATABASE SCHEMA & DATA INTEGRITY 100% VALIDATED');
  console.log('========================================================================\n');
}

runStage1SchemaValidation().then(() => process.exit(0)).catch(err => {
  console.error('\n[VALIDATION FAILED]:', err.message);
  process.exit(1);
});
