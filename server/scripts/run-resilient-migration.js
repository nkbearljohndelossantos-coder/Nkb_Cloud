import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', () => {
  const sql = `
    ALTER TABLE files ADD COLUMN IF NOT EXISTS needs_agent_sync BOOLEAN DEFAULT FALSE;
    ALTER TABLE files ADD COLUMN IF NOT EXISTS target_volume_id UUID;
    ALTER TABLE files ADD COLUMN IF NOT EXISTS fallback_synced_at TIMESTAMP WITH TIME ZONE;

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

    INSERT INTO storage_devices (id, agent_id, hardware_serial_evidence, model, vendor, status, identity_confidence, total_capacity_bytes)
    VALUES (
      '00000000-0000-0000-0000-000000000098',
      '00000000-0000-0000-0000-000000000097',
      'VPS-NVME-STAGING-01',
      'VPS Local NVMe Staging',
      'Cloud VPS',
      'ONLINE',
      'VERIFIED',
      107374182400
    )
    ON CONFLICT (id) DO UPDATE SET status = 'ONLINE';

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
  `;

  // Make sure fallback storage directory exists on the VPS host and in container
  const cmd = `mkdir -p /opt/nkb-cloud/data/fallback_storage && docker exec -i nkb_cloud_postgres psql -U nkb_cloud_admin -d nkb_cloud_production -c "${sql.replace(/"/g, '\\"')}"`;

  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', (code) => {
      conn.end();
      process.exit(code || 0);
    });
  });
}).on('error', (err) => {
  console.error('[SSH ERROR]', err.message);
  process.exit(1);
}).connect({
  host: '187.77.143.211',
  port: 22,
  username: 'root',
  password: 'NkbManufacturing@2025'
});
