import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://nkb_admin:NkbCloud2026SecureAdminPass@localhost:5432/nkb_cloud_production'
});

async function run() {
  await client.connect();
  console.log('[MIGRATION] Connected to PostgreSQL');

  console.log('[MIGRATION] 1. Adding resilient fallback columns to files table...');
  await client.query(`
    ALTER TABLE files ADD COLUMN IF NOT EXISTS needs_agent_sync BOOLEAN DEFAULT FALSE;
    ALTER TABLE files ADD COLUMN IF NOT EXISTS target_volume_id UUID;
    ALTER TABLE files ADD COLUMN IF NOT EXISTS fallback_synced_at TIMESTAMP WITH TIME ZONE;
  `);

  console.log('[MIGRATION] 2. Ensuring VPS System Fallback Storage Agent...');
  await client.query(`
    INSERT INTO storage_agents (id, agent_name, machine_name, os_version, ip_address, agent_token, status, last_heartbeat)
    VALUES (
      '00000000-0000-0000-0000-000000000097',
      'VPS-LOCAL-HOST',
      'VPS-NKB-CLOUD',
      'Linux Ubuntu',
      '127.0.0.1',
      'system-vps-resilient-token',
      'ONLINE',
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (id) DO UPDATE SET status = 'ONLINE', last_heartbeat = CURRENT_TIMESTAMP;
  `);

  console.log('[MIGRATION] 3. Ensuring VPS System Fallback Device...');
  await client.query(`
    INSERT INTO storage_devices (id, agent_id, hardware_serial_evidence, model, vendor, status, identity_confidence)
    VALUES (
      '00000000-0000-0000-0000-000000000098',
      '00000000-0000-0000-0000-000000000097',
      'VPS-NVME-STAGING-01',
      'VPS Local NVMe Staging',
      'Cloud VPS',
      'ONLINE',
      'VERIFIED'
    )
    ON CONFLICT (id) DO UPDATE SET status = 'ONLINE';
  `);

  console.log('[MIGRATION] 4. Ensuring VPS System Fallback Volume...');
  await client.query(`
    INSERT INTO storage_volumes (
      id, device_id, volume_guid, assigned_name, composite_identity,
      mount_path, filesystem_type, current_drive_letter, total_bytes, free_bytes, used_bytes, status
    )
    VALUES (
      '00000000-0000-0000-0000-000000000099',
      '00000000-0000-0000-0000-000000000098',
      'VPS-RESILIENT-FALLBACK-V1',
      'VPS Resilient Fallback Storage',
      'VPS-RESILIENT-FALLBACK-COMPOSITE-IDENTITY-V1',
      '/opt/nkb-cloud/data/fallback_storage',
      'LOCAL',
      'VPS',
      107374182400,
      85899345920,
      0,
      'ONLINE'
    )
    ON CONFLICT (id) DO UPDATE SET status = 'ONLINE';
  `);

  console.log('[MIGRATION] Done! Verifying volumes:');
  const res = await client.query('SELECT id, assigned_name, status, mount_path FROM storage_volumes');
  console.table(res.rows);

  await client.end();
}

run().catch(err => {
  console.error('[MIGRATION ERROR]', err);
  process.exit(1);
});
