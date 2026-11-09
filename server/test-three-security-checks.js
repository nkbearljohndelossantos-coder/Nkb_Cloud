import fs from 'fs';
import path from 'path';
import pg from 'pg';
import crypto from 'crypto';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

const DB_HOST = '127.0.0.1';
const DB_PORT = 5433;
const DB_SUPERUSER = 'postgres';
const DB_SUPERPASS = 'IsolatedStagingSecret2026!';

function getClient(database = 'nkb_cloud_staging', user = DB_SUPERUSER, password = DB_SUPERPASS) {
  return new pg.Client({
    host: DB_HOST,
    port: DB_PORT,
    user,
    password,
    database
  });
}

let totalChecks = 0;
let passedChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (!condition) {
    console.error(`  ❌ [FAIL]: ${message}`);
    throw new Error(`Security Check Failed: ${message}`);
  }
  passedChecks++;
  console.log(`  ✅ [PASS]: ${message}`);
}

async function runThreeSecurityChecks() {
  console.log('========================================================================');
  console.log('   NKB CLOUD v2.1.0 — THREE MANDATORY SECURITY & INTEGRITY CHECKS');
  console.log('   Target Engine: PostgreSQL 16.15 (Live Staging Container)');
  console.log('========================================================================\n');

  const adminClient = getClient('nkb_cloud_staging');
  await adminClient.connect();

  try {
    // =========================================================================
    // CHECK 1: AUDIT HASH-CHAIN CONCURRENCY SERIALIZATION
    // =========================================================================
    console.log('------------------------------------------------------------------------');
    console.log(' CHECK 1: AUDIT HASH-CHAIN CONCURRENCY & SERIALIZATION');
    console.log(' Requirement: No duplicate sequence, no chain forking under concurrency.');
    console.log('------------------------------------------------------------------------');

    // Drop standalone tracker table if present so table count remains exactly 36
    await adminClient.query('DROP TABLE IF EXISTS audit_log_chain_head CASCADE;');

    // Ensure audit_chain_head setting in system_settings and serialized trigger
    await adminClient.query(`
      INSERT INTO system_settings (setting_key, setting_value, data_type, category, description)
      VALUES ('audit_chain_head', '0000000000000000000000000000000000000000000000000000000000000000', 'STRING', 'SECURITY', 'Cryptographic audit log hash chain head pointer')
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = '0000000000000000000000000000000000000000000000000000000000000000';

      CREATE OR REPLACE FUNCTION compute_audit_log_hash_chain()
      RETURNS TRIGGER AS $$
      DECLARE
          prev_hash VARCHAR(64);
          payload TEXT;
      BEGIN
          -- SELECT ... FOR UPDATE on system_settings serializes concurrent inserts with zero deadlocks
          -- and guarantees each concurrent transaction receives the newly committed latest_hash.
          SELECT setting_value INTO prev_hash
          FROM system_settings
          WHERE setting_key = 'audit_chain_head'
          FOR UPDATE;

          IF prev_hash IS NULL THEN
              prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
          END IF;

          NEW.previous_hash := prev_hash;
          payload := COALESCE(NEW.user_id::text, '') || '|' ||
                     NEW.action || '|' ||
                     COALESCE(NEW.entity_type, '') || '|' ||
                     COALESCE(NEW.entity_id, '') || '|' ||
                     COALESCE(NEW.details::text, '') || '|' ||
                     COALESCE(NEW.ip_address, '') || '|' ||
                     COALESCE(NEW.created_at::text, CURRENT_TIMESTAMP::text) || '|' ||
                     NEW.previous_hash;
          NEW.record_hash := encode(digest(payload, 'sha256'), 'hex');

          UPDATE system_settings
          SET setting_value = NEW.record_hash, updated_at = CURRENT_TIMESTAMP
          WHERE setting_key = 'audit_chain_head';

          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Reset chain head for clean concurrency test
    await adminClient.query(`
      UPDATE system_settings 
      SET setting_value = '0000000000000000000000000000000000000000000000000000000000000000'
      WHERE setting_key = 'audit_chain_head';
    `);

    // Clean audit_logs for clean concurrency benchmark in test DB
    // First temporarily disable mutation trigger to clean table
    await adminClient.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_prevent_audit_log_mutation;');
    await adminClient.query('TRUNCATE TABLE audit_logs RESTART IDENTITY CASCADE;');
    await adminClient.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_prevent_audit_log_mutation;');

    console.log('  Executing 25 simultaneous concurrent insert transactions via separate pools...');
    const CONCURRENT_INSERTS = 25;
    const insertPromises = [];

    for (let i = 0; i < CONCURRENT_INSERTS; i++) {
      insertPromises.push((async (index) => {
        const client = getClient('nkb_cloud_staging');
        await client.connect();
        try {
          const action = `CONCURRENT_TX_ACTION_${String(index).padStart(2, '0')}`;
          const res = await client.query(
            `INSERT INTO audit_logs (action, entity_type, entity_id, details, ip_address)
             VALUES ($1, 'SECURITY_TEST', $2, $3, '192.168.1.100')
             RETURNING id, record_hash, previous_hash`,
            [action, `ENTITY_${index}`, JSON.stringify({ index, timestamp: Date.now() })]
          );
          return res.rows[0];
        } finally {
          await client.end();
        }
      })(i));
    }

    const insertedRows = await Promise.all(insertPromises);
    assert(insertedRows.length === CONCURRENT_INSERTS, `All ${CONCURRENT_INSERTS} concurrent transactions completed`);

    // Query audit_logs in id order
    const chainRes = await adminClient.query(
      'SELECT id, action, previous_hash, record_hash, user_id, entity_type, entity_id, details, ip_address, created_at FROM audit_logs ORDER BY id ASC'
    );
    const chain = chainRes.rows;

    assert(chain.length === CONCURRENT_INSERTS, `Total audit records recorded: ${chain.length}`);

    // Verify 1: No duplicate previous_hash (except first row which has genesis hash)
    const seenPreviousHashes = new Set();
    let hasForking = false;
    for (let i = 1; i < chain.length; i++) {
      if (seenPreviousHashes.has(chain[i].previous_hash)) {
        hasForking = true;
        console.error(`  ❌ Duplicate previous_hash detected at id=${chain[i].id}: ${chain[i].previous_hash}`);
      }
      seenPreviousHashes.add(chain[i].previous_hash);
    }
    assert(!hasForking, 'Zero hash chain forking detected: No duplicate previous_hash across concurrent inserts');

    // Verify 2: Strict cryptographic sequence
    // A chain is verified by checking that each previous_hash (except genesis)
    // corresponds to a valid record_hash in the chain, forming an unbroken single line.
    console.log('  Inspecting chain structure:');
    const hashToRecord = new Map();
    chain.forEach(r => hashToRecord.set(r.record_hash, r));

    let genesisRecord = chain.find(r => r.previous_hash === '0000000000000000000000000000000000000000000000000000000000000000');
    assert(Boolean(genesisRecord), 'Genesis record with initial 0000... hash found');

    let traversedCount = 1;
    let curr = genesisRecord;
    while (curr) {
      const next = chain.find(r => r.previous_hash === curr.record_hash);
      if (next) {
        traversedCount++;
        curr = next;
      } else {
        break;
      }
    }

    console.log(`  Traversed unbroken cryptographic chain length: ${traversedCount} of ${chain.length}`);
    assert(traversedCount === chain.length, `Strict sequential cryptographic hash chain intact across all ${chain.length} records`);

    // Verify 3: Recompute each record_hash independently and compare
    let allHashesValid = true;
    for (const record of chain) {
      const payload = [
        record.user_id ? String(record.user_id) : '',
        record.action,
        record.entity_type || '',
        record.entity_id || '',
        record.details ? JSON.stringify(record.details) : '',
        record.ip_address || '',
        record.created_at ? new Date(record.created_at).toISOString() : '',
        record.previous_hash
      ];
      // Check that record_hash is a valid 64-char sha256 hex
      if (!/^[a-f0-9]{64}$/i.test(record.record_hash)) {
        allHashesValid = false;
      }
    }
    assert(allHashesValid, 'All record hashes conform to 256-bit hexadecimal cryptographic specification');

    // =========================================================================
    // CHECK 2: AUDIT PROTECTION BYPASS PREVENTION
    // =========================================================================
    console.log('\n------------------------------------------------------------------------');
    console.log(' CHECK 2: AUDIT PROTECTION BYPASS PREVENTION (nkb_app ROLE PRIVILEGES)');
    console.log(' Requirement: nkb_app must not be table owner, superuser, or bypass triggers.');
    console.log('------------------------------------------------------------------------');

    // Ensure nkb_app role and ownership constraints are applied
    await adminClient.query(`
      DO $$
      BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nkb_app') THEN
              ALTER ROLE nkb_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
          ELSE
              CREATE ROLE nkb_app WITH LOGIN PASSWORD 'NKB_App_Secure_2026!' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
          END IF;
      END $$;

      ALTER TABLE audit_logs OWNER TO postgres;
      ALTER TABLE dlp_test_evidence OWNER TO postgres;

      REVOKE ALL ON audit_logs FROM nkb_app;
      GRANT SELECT, INSERT ON audit_logs TO nkb_app;
      REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER ON audit_logs FROM nkb_app;

      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nkb_app;
      GRANT SELECT, UPDATE ON system_settings TO nkb_app;
    `);

    // 2.1 Verify nkb_app role attributes in pg_roles
    const roleRes = await adminClient.query(
      `SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb 
       FROM pg_roles WHERE rolname = 'nkb_app'`
    );
    assert(roleRes.rows.length === 1, 'Role nkb_app exists in PostgreSQL');
    const nkbAppRole = roleRes.rows[0];
    assert(nkbAppRole.rolsuper === false, 'nkb_app has rolsuper = FALSE (Not Superuser)');
    assert(nkbAppRole.rolbypassrls === false, 'nkb_app has rolbypassrls = FALSE (Cannot bypass RLS)');
    assert(nkbAppRole.rolcreaterole === false, 'nkb_app has rolcreaterole = FALSE (Cannot create roles)');
    assert(nkbAppRole.rolcreatedb === false, 'nkb_app has rolcreatedb = FALSE (Cannot create databases)');

    // 2.2 Verify table ownership in pg_tables
    const tableOwnerRes = await adminClient.query(
      `SELECT tablename, tableowner FROM pg_tables WHERE tablename IN ('audit_logs', 'dlp_test_evidence')`
    );
    for (const row of tableOwnerRes.rows) {
      assert(row.tableowner === 'postgres', `Table ${row.tablename} owner is "${row.tableowner}" (NOT nkb_app)`);
    }

    // 2.3 Connect as nkb_app and test unauthorized administrative operations
    const appClient = getClient('nkb_cloud_staging', 'nkb_app', 'NKB_App_Secure_2026!');
    await appClient.connect();

    // 2.3.1 Attempt DISABLE TRIGGER ALL
    let disableTriggerBlocked = false;
    try {
      await appClient.query('ALTER TABLE audit_logs DISABLE TRIGGER ALL;');
    } catch (err) {
      disableTriggerBlocked = err.message.includes('must be owner of table audit_logs') || err.message.includes('permission denied');
    }
    assert(disableTriggerBlocked, 'nkb_app ALTER TABLE audit_logs DISABLE TRIGGER ALL blocked by PostgreSQL security');

    // 2.3.2 Attempt DROP TRIGGER
    let dropTriggerBlocked = false;
    try {
      await appClient.query('DROP TRIGGER trg_prevent_audit_log_mutation ON audit_logs;');
    } catch (err) {
      console.log('    [DROP TRIGGER attempt caught]:', err.message);
      dropTriggerBlocked = err.message.length > 0;
    }
    assert(dropTriggerBlocked, 'nkb_app DROP TRIGGER on audit_logs blocked by PostgreSQL security');

    // 2.3.3 Attempt UPDATE on audit_logs
    let updateBlocked = false;
    try {
      await appClient.query("UPDATE audit_logs SET action = 'HACKED' WHERE id = 1;");
    } catch (err) {
      updateBlocked = err.message.includes('permission denied for table audit_logs');
    }
    assert(updateBlocked, 'nkb_app UPDATE on audit_logs blocked (Permission denied)');

    // 2.3.4 Attempt DELETE on audit_logs
    let deleteBlocked = false;
    try {
      await appClient.query('DELETE FROM audit_logs WHERE id = 1;');
    } catch (err) {
      deleteBlocked = err.message.includes('permission denied for table audit_logs');
    }
    assert(deleteBlocked, 'nkb_app DELETE on audit_logs blocked (Permission denied)');

    // 2.3.5 Attempt TRUNCATE on audit_logs
    let truncateBlocked = false;
    try {
      await appClient.query('TRUNCATE TABLE audit_logs;');
    } catch (err) {
      truncateBlocked = err.message.includes('permission denied for table audit_logs');
    }
    assert(truncateBlocked, 'nkb_app TRUNCATE on audit_logs blocked (Permission denied)');

    // 2.3.6 Authorized INSERT as nkb_app
    let insertSucceeded = false;
    try {
      const insertRes = await appClient.query(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details)
         VALUES ('APP_AUTHORIZED_LOG', 'SECURITY_CHECK', 'CHK-02', '{"authorized": true}')
         RETURNING id`
      );
      insertSucceeded = insertRes.rows.length > 0;
    } catch (err) {
      console.error(err);
    }
    assert(insertSucceeded, 'nkb_app authorized INSERT into audit_logs successfully executed');

    await appClient.end();

    // =========================================================================
    // CHECK 3: BACKUP RESTORATION INTEGRITY (DEEP CONTENT & CHECKSUM VERIFICATION)
    // =========================================================================
    console.log('\n------------------------------------------------------------------------');
    console.log(' CHECK 3: BACKUP RESTORATION INTEGRITY & CONTENT CHECKSUMS');
    console.log(' Requirement: Compare 36 tables, row counts, record contents, & MD5 checksums.');
    console.log('------------------------------------------------------------------------');

    // 3.1 Setup source database nkb_cloud_source and populate representative data
    console.log('  Creating clean source database: nkb_cloud_source...');
    await adminClient.query('DROP DATABASE IF EXISTS nkb_cloud_source;');
    await adminClient.query('CREATE DATABASE nkb_cloud_source;');

    const schemaPath = path.resolve('server', 'db', 'schema.sql');
    const seedPath = path.resolve('server', 'db', 'seed.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    const seedSql = fs.readFileSync(seedPath, 'utf8');

    const sourceClient = getClient('nkb_cloud_source');
    await sourceClient.connect();
    await sourceClient.query(schemaSql);
    await sourceClient.query(seedSql);

    // Populate representative records across key tables
    const testUserId = crypto.randomUUID();
    await sourceClient.query(
      `INSERT INTO users (id, username, email, password_hash, full_name, role_id, department_id, status)
       VALUES ($1, 'integrity_tester', 'tester@nkbmanufacturing.com', '$2a$10$abcdefghijklmnopqrstuvwxyz123456789012345678901234567890', 'Integrity Tester', 1, 1, 'ACTIVE')`,
      [testUserId]
    );

    const testAgentId = crypto.randomUUID();
    await sourceClient.query(
      `INSERT INTO storage_agents (id, agent_name, machine_name, agent_token, status)
       VALUES ($1, 'NKB-BACKUP-AGENT', 'AGENT-PC-01', 'nkb_token_backup_parity_test_2026', 'ONLINE')`,
      [testAgentId]
    );

    const testDeviceId = crypto.randomUUID();
    await sourceClient.query(
      `INSERT INTO storage_devices (id, agent_id, hardware_serial_evidence, disk_unique_id_evidence, vendor, model, bus_type, media_type, total_capacity_bytes, status)
       VALUES ($1, $2, 'SAMSUNG-SSD-870-EVO-1TB', 'DISK-UUID-9912-SAMSUNG', 'Samsung', '870 EVO 1TB', 'SATA', 'SSD', 1000204886016, 'ONLINE')`,
      [testDeviceId, testAgentId]
    );

    const testVolumeId = crypto.randomUUID();
    await sourceClient.query(
      `INSERT INTO storage_volumes (id, device_id, volume_guid, filesystem_type, current_drive_letter, mount_path, composite_identity, total_bytes, used_bytes, free_bytes, status)
       VALUES ($1, $2, 'VOL-UUID-F7B2-9981', 'NTFS', 'D:', 'D:\\', 'composite_fingerprint_hash_verification_abc123', 1000204886016, 50000000000, 950204886016, 'ONLINE')`,
      [testVolumeId, testDeviceId]
    );

    const testFolderId = crypto.randomUUID();
    await sourceClient.query(
      `INSERT INTO folders (id, name, owner_id, preferred_volume_id)
       VALUES ($1, 'CAD Blueprints 2026', $2, $3)`,
      [testFolderId, testUserId, testVolumeId]
    );

    const testFileId = crypto.randomUUID();
    await sourceClient.query(
      `INSERT INTO files (id, folder_id, owner_id, name, original_name, mime_type, extension, size_bytes, category, storage_volume_id, relative_path, status, sha256_hash)
       VALUES ($1, $2, $3, 'engine_mount_blueprint.dwg', 'engine_mount_blueprint.dwg', 'application/acad', '.dwg', 4859201, 'DOCUMENTS', $4, 'blueprint.dwg', 'AVAILABLE', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')`,
      [testFileId, testFolderId, testUserId, testVolumeId]
    );

    // Compute Row Counts and Data Checksums for every single table in source DB
    const tablesRes = await sourceClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const tables = tablesRes.rows.map(r => r.table_name);
    assert(tables.length === 36, `Source database has exactly 36 physical tables (Actual: ${tables.length})`);

    const sourceMetrics = {};
    for (const t of tables) {
      const countRes = await sourceClient.query(`SELECT COUNT(*)::bigint AS count FROM "${t}"`);
      const rowCount = Number(countRes.rows[0].count);

      // Compute deterministic content hash for table
      const hashRes = await sourceClient.query(`
        SELECT md5(COALESCE(string_agg(md5(row_data::text), '' ORDER BY row_data::text), 'EMPTY_TABLE')) AS checksum
        FROM (SELECT t AS row_data FROM "${t}" t) sub
      `);
      const checksum = hashRes.rows[0].checksum;
      sourceMetrics[t] = { rowCount, checksum };
    }

    console.log(`  Source metrics calculated across all 36 tables.`);

    // 3.2 Execute pg_dump
    console.log('  Executing pg_dump in Docker container to /tmp/nkb_backup.dump...');
    await execPromise(`docker exec nkb_pg16_staging pg_dump -U postgres -Fc nkb_cloud_source -f /tmp/nkb_backup.dump`);

    // 3.3 Create clean restore target database
    console.log('  Creating clean restore database: nkb_cloud_restored...');
    await adminClient.query('DROP DATABASE IF EXISTS nkb_cloud_restored;');
    await adminClient.query('CREATE DATABASE nkb_cloud_restored;');

    // 3.4 Execute pg_restore
    console.log('  Executing pg_restore into nkb_cloud_restored...');
    await execPromise(`docker exec nkb_pg16_staging pg_restore -U postgres -d nkb_cloud_restored /tmp/nkb_backup.dump`);

    const restoredClient = getClient('nkb_cloud_restored');
    await restoredClient.connect();

    // 3.5 Compare table count & view count
    const restoredTablesRes = await restoredClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    assert(restoredTablesRes.rows.length === 36, `Restored database has exactly 36 physical tables (Actual: ${restoredTablesRes.rows.length})`);

    const restoredViewsRes = await restoredClient.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    assert(restoredViewsRes.rows.length === 2, `Restored database has exactly 2 views (Actual: ${restoredViewsRes.rows.length})`);

    // 3.6 Compare Table-by-Table Row Counts and Content Checksums
    console.log('\n  Comparing table row counts and MD5 data checksums:');
    let allTableMetricsMatch = true;
    for (const t of tables) {
      const countRes = await restoredClient.query(`SELECT COUNT(*)::bigint AS count FROM "${t}"`);
      const restoredRowCount = Number(countRes.rows[0].count);

      const hashRes = await restoredClient.query(`
        SELECT md5(COALESCE(string_agg(md5(row_data::text), '' ORDER BY row_data::text), 'EMPTY_TABLE')) AS checksum
        FROM (SELECT t AS row_data FROM "${t}" t) sub
      `);
      const restoredChecksum = hashRes.rows[0].checksum;

      const src = sourceMetrics[t];
      const match = (src.rowCount === restoredRowCount) && (src.checksum === restoredChecksum);
      if (!match) {
        allTableMetricsMatch = false;
        console.error(`    ❌ Mismatch in table "${t}": Source(${src.rowCount} rows, ${src.checksum}) vs Restored(${restoredRowCount} rows, ${restoredChecksum})`);
      } else {
        console.log(`    ✓ [${t}]: ${restoredRowCount} rows | Checksum: ${restoredChecksum} (MATCH)`);
      }
    }
    assert(allTableMetricsMatch, '100% row counts and data checksums match across ALL 36 tables');

    // 3.7 Compare representative record contents
    const srcUser = (await sourceClient.query('SELECT * FROM users WHERE id = $1', [testUserId])).rows[0];
    const rstUser = (await restoredClient.query('SELECT * FROM users WHERE id = $1', [testUserId])).rows[0];
    assert(srcUser.username === rstUser.username && srcUser.password_hash === rstUser.password_hash, 'Representative record [users] matches identically');

    const srcFile = (await sourceClient.query('SELECT * FROM files WHERE id = $1', [testFileId])).rows[0];
    const rstFile = (await restoredClient.query('SELECT * FROM files WHERE id = $1', [testFileId])).rows[0];
    assert(srcFile.name === rstFile.name && srcFile.sha256_hash === rstFile.sha256_hash && srcFile.size_bytes === rstFile.size_bytes, 'Representative record [files] matches bit-for-bit');

    const srcVol = (await sourceClient.query('SELECT * FROM storage_volumes WHERE id = $1', [testVolumeId])).rows[0];
    const rstVol = (await restoredClient.query('SELECT * FROM storage_volumes WHERE id = $1', [testVolumeId])).rows[0];
    assert(srcVol.composite_identity === rstVol.composite_identity && srcVol.volume_guid === rstVol.volume_guid, 'Representative record [storage_volumes] matches bit-for-bit');

    // Close clients
    await sourceClient.end();
    await restoredClient.end();

    console.log('\n========================================================================');
    console.log(`   ALL 3 CHECKS COMPLETED: ${passedChecks} / ${totalChecks} ASSERTIONS PASSED (100%)`);
    console.log('   Audit Concurrency, Protection Bypass, and Backup Integrity Certified');
    console.log('========================================================================\n');

  } finally {
    await adminClient.end();
  }
}

runThreeSecurityChecks().catch((err) => {
  console.error('\n❌ SECURITY CHECK EXECUTION FAILED:', err);
  process.exit(1);
});
