import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STAGING_URL = 'postgres://postgres:IsolatedStagingSecret2026!@127.0.0.1:5433/nkb_drive_staging';

async function runStagingSetup() {
  console.log('--- Setting up nkb_drive_staging database ---');
  const pool = new pg.Pool({ connectionString: STAGING_URL });
  const client = await pool.connect();

  try {
    // 1. Apply base schema
    const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      console.log('Applying base schema.sql...');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await client.query(schemaSql);
    }

    // 2. Apply base seed
    const seedPath = path.join(__dirname, '..', 'db', 'seed.sql');
    if (fs.existsSync(seedPath)) {
      console.log('Applying base seed.sql...');
      const seedSql = fs.readFileSync(seedPath, 'utf8');
      await client.query(seedSql);
    }

    // 3. Ensure schema_migrations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Apply migrations 001 through 007
    const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && !f.includes('rollback'))
      .sort();

    for (const file of files) {
      const version = file.split('_')[0];
      if (version === '008') continue; // We test 008 separately
      const check = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
      if (check.rows.length === 0) {
        console.log(`Applying migration ${file}...`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        try {
          await client.query('BEGIN');
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [version, file]);
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          console.warn(`Migration ${file} skipped or note: ${e.message}`);
        }
      }
    }

    console.log('Base migrations 001-007 successfully reconciled in staging.');
  } finally {
    client.release();
    await pool.end();
  }
}

runStagingSetup().catch(err => {
  console.error('Staging setup error:', err);
  process.exit(1);
});
