-- =============================================================================
-- Rollback for Migration 002 (NKB Cloud v2.1.0)
-- CAUTION: Destructive rollback script.
-- DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT SUPER ADMIN CONFIRMATION AND BACKUP.
-- =============================================================================

BEGIN;

-- Drop backwards compatibility views
DROP VIEW IF EXISTS storage_migrations;
DROP VIEW IF EXISTS agent_command_queue;

-- Drop newly created tables in reverse dependency order
DROP TABLE IF EXISTS dlp_test_evidence;
DROP TABLE IF EXISTS dlp_test_runs;
DROP TABLE IF EXISTS migration_file_results;
DROP TABLE IF EXISTS migration_jobs;
DROP TABLE IF EXISTS storage_integrity_results;
DROP TABLE IF EXISTS storage_integrity_jobs;
DROP TABLE IF EXISTS agent_command_results;
DROP TABLE IF EXISTS agent_commands;
DROP TABLE IF EXISTS storage_identity_conflicts;
DROP TABLE IF EXISTS storage_identity_observations;
DROP TABLE IF EXISTS storage_registrations;
DROP TABLE IF EXISTS agent_nonce_registry;
DROP TABLE IF EXISTS agent_credentials;

-- Remove added columns from storage_volumes and storage_devices if required
-- Note: It is generally safer to retain these columns to prevent data loss.
-- ALTER TABLE storage_volumes DROP COLUMN IF EXISTS volume_guid;
-- ALTER TABLE storage_volumes DROP COLUMN IF EXISTS partition_guid;
-- ALTER TABLE storage_volumes DROP COLUMN IF EXISTS filesystem_uuid;
-- ALTER TABLE storage_volumes DROP COLUMN IF EXISTS partition_offset_bytes;
-- ALTER TABLE storage_volumes DROP COLUMN IF EXISTS filesystem_type;

-- ALTER TABLE storage_devices DROP COLUMN IF EXISTS hardware_serial_evidence;
-- ALTER TABLE storage_devices DROP COLUMN IF EXISTS disk_unique_id_evidence;
-- ALTER TABLE storage_devices DROP COLUMN IF EXISTS identity_confidence;
-- ALTER TABLE storage_devices DROP COLUMN IF EXISTS first_discovered_at;
-- ALTER TABLE storage_devices DROP COLUMN IF EXISTS last_seen_at;

COMMIT;
