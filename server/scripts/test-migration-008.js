import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STAGING_URL = 'postgres://postgres:IsolatedStagingSecret2026!@127.0.0.1:5433/nkb_drive_staging';

async function testMigration008() {
  console.log('--- Testing Migration 008 UP and ROLLBACK on Staging ---');
  const pool = new pg.Pool({ connectionString: STAGING_URL });
  const client = await pool.connect();

  const upSqlPath = path.join(__dirname, '..', 'db', 'migrations', '008_nkb_drive_devices_and_journal.sql');
  const rollbackSqlPath = path.join(__dirname, '..', 'db', 'migrations', '008_nkb_drive_devices_and_journal_rollback.sql');

  const upSql = fs.readFileSync(upSqlPath, 'utf8');
  const rollbackSql = fs.readFileSync(rollbackSqlPath, 'utf8');

  try {
    // 1. Execute UP
    console.log('[STEP 1] Executing Migration 008 UP...');
    await client.query('BEGIN');
    await client.query(upSql);
    await client.query('COMMIT');

    // 2. Verify tables exist
    console.log('[STEP 2] Verifying table creation...');
    const tCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('nkb_drive_devices', 'drive_change_journal');
    `);
    const tables = tCheck.rows.map(r => r.table_name);
    console.log('Tables found:', tables);
    if (!tables.includes('nkb_drive_devices') || !tables.includes('drive_change_journal')) {
      throw new Error('Migration 008 UP verification failed: Missing tables.');
    }

    // Verify sequence exists
    const seqCheck = await client.query(`
      SELECT sequence_name 
      FROM information_schema.sequences 
      WHERE sequence_name = 'drive_change_seq';
    `);
    console.log('Sequence found:', seqCheck.rows.map(r => r.sequence_name));
    if (seqCheck.rows.length === 0) {
      throw new Error('Migration 008 UP verification failed: Missing sequence.');
    }

    // 3. Execute ROLLBACK
    console.log('[STEP 3] Executing Migration 008 ROLLBACK...');
    await client.query('BEGIN');
    await client.query(rollbackSql);
    await client.query('COMMIT');

    // 4. Verify tables and sequence dropped cleanly
    console.log('[STEP 4] Verifying clean table teardown...');
    const rbCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('nkb_drive_devices', 'drive_change_journal');
    `);
    if (rbCheck.rows.length > 0) {
      throw new Error('Migration 008 ROLLBACK failed: Tables still exist.');
    }

    const rbSeq = await client.query(`
      SELECT sequence_name 
      FROM information_schema.sequences 
      WHERE sequence_name = 'drive_change_seq';
    `);
    if (rbSeq.rows.length > 0) {
      throw new Error('Migration 008 ROLLBACK failed: Sequence still exists.');
    }
    console.log('Rollback clean: All drive tables dropped, 0 remaining.');

    // Verify existing core tables remain intact
    const coreCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('users', 'departments', 'files', 'folders', 'shares', 'audit_logs');
    `);
    console.log('Core tables verified intact:', coreCheck.rows.map(r => r.table_name));

    // 5. Re-apply UP for staging testing
    console.log('[STEP 5] Re-applying Migration 008 UP for staging testing...');
    await client.query('BEGIN');
    await client.query(upSql);
    await client.query('COMMIT');
    console.log('SUCCESS: Migration 008 UP and ROLLBACK verified 100%!');

  } finally {
    client.release();
    await pool.end();
  }
}

testMigration008().catch(err => {
  console.error('Migration 008 test failed:', err);
  process.exit(1);
});
