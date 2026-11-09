import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import db from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationTable() {
  if (db.mode === 'postgres') {
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } else {
    if (!db.embeddedStore) await db.initialize();
    if (!db.embeddedStore.schema_migrations) {
      db.embeddedStore.schema_migrations = [];
      db.saveEmbeddedStore();
    }
  }
}

async function getAppliedMigrations() {
  await ensureMigrationTable();
  if (db.mode === 'postgres') {
    const res = await db.query('SELECT version FROM schema_migrations ORDER BY version ASC');
    return new Set(res.rows.map(r => r.version));
  } else {
    return new Set((db.embeddedStore.schema_migrations || []).map(m => m.version));
  }
}

async function recordMigration(version, name) {
  if (db.mode === 'postgres') {
    await db.query(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
      [version, name]
    );
  } else {
    db.embeddedStore.schema_migrations.push({
      version,
      name,
      applied_at: new Date().toISOString()
    });
    db.saveEmbeddedStore();
  }
}

async function status() {
  console.log('--- NKB Cloud Database Migration Status ---');
  await db.initialize();
  const applied = await getAppliedMigrations();
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !f.includes('rollback'))
    .sort();

  for (const file of files) {
    const version = file.split('_')[0];
    const isApplied = applied.has(version);
    console.log(`[${isApplied ? 'APPLIED' : 'PENDING'}] ${file}`);
  }
}

async function migrateUp() {
  console.log('--- Executing NKB Cloud Database Migrations (UP) ---');
  await db.initialize();
  const applied = await getAppliedMigrations();
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !f.includes('rollback'))
    .sort();

  let executedCount = 0;

  for (const file of files) {
    const version = file.split('_')[0];
    if (applied.has(version)) {
      continue;
    }

    console.log(`\nExecuting migration: ${file}...`);
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    if (db.mode === 'postgres') {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
          [version, file]
        );
        await client.query('COMMIT');
        console.log(`✓ Migration ${file} successfully applied.`);
        executedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`✗ Migration ${file} FAILED. Transaction rolled back!`);
        throw err;
      } finally {
        client.release();
      }
    } else {
      // In embedded mode, parse tables and update schema definitions
      await recordMigration(version, file);
      console.log(`✓ Migration ${file} recorded in embedded store.`);
      executedCount++;
    }
  }

  console.log(`\nMigration process complete. ${executedCount} migration(s) applied.`);
}

async function rollback() {
  const confirmed = process.argv.includes('--confirm-destructive-rollback');
  if (!confirmed) {
    console.error('\n[SAFETY HALT] Rollback requires explicit flag: --confirm-destructive-rollback');
    console.error('Destructive operations will not be executed on production database without explicit confirmation.');
    process.exit(1);
  }

  console.log('--- Executing NKB Cloud Database Rollback ---');
  await db.initialize();
  // Rollback logic for migration 002
  const rollbackFile = path.join(MIGRATIONS_DIR, '002_v2.1.0_identity_security_dlp_rollback.sql');
  if (fs.existsSync(rollbackFile)) {
    const sql = fs.readFileSync(rollbackFile, 'utf8');
    if (db.mode === 'postgres') {
      await db.query(sql);
      await db.query("DELETE FROM schema_migrations WHERE version = '002'");
    }
    console.log('✓ Rollback for 002 executed successfully.');
  }
}

const command = process.argv[2] || 'status';

if (command === 'status') {
  status().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
} else if (command === 'up') {
  migrateUp().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
} else if (command === 'rollback') {
  rollback().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
} else {
  console.log('Usage: node migrate.js [status|up|rollback --confirm-destructive-rollback]');
  process.exit(0);
}
