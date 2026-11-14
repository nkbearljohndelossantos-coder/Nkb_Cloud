import pg from 'pg';
import fs from 'fs';

async function main() {
  const pool = new pg.Pool({ connectionString: 'postgres://postgres:IsolatedStagingSecret2026!@127.0.0.1:5433/nkb_drive_staging' });
  const devRes = await pool.query("SELECT * FROM storage_devices");
  console.log('Current devices:', devRes.rows);
  const connectedAgentId = 'abe104a1-82f3-4b3b-b214-43af205c33c4';
  await pool.query("UPDATE storage_devices SET agent_id = $1", [connectedAgentId]);
  console.log('Updated storage_devices agent_id to', connectedAgentId);

  // Also make sure mount_path directory exists
  if (!fs.existsSync('C:\\NKB-Storage-Staging')) {
    fs.mkdirSync('C:\\NKB-Storage-Staging', { recursive: true });
  }

  await pool.end();
}

main().catch(console.error);
