-- =============================================================================
-- Migration 007 Rollback: Non-Destructive Inversion
-- GUARANTEE: Preserves baseline columns (departments.created_at/updated_at),
--            preserves post-migration shares, and cleanly restores schema.
-- =============================================================================

BEGIN;

-- 1. DROP AUDIT TRIGGERS AND FUNCTIONS INTRODUCED IN 007
DROP TRIGGER IF EXISTS trg_prevent_login_audit_mutation ON login_audit_events;
DROP TRIGGER IF EXISTS trg_compute_login_audit_hash_chain ON login_audit_events;
DROP FUNCTION IF EXISTS compute_login_audit_hash_chain();
DROP FUNCTION IF EXISTS prevent_login_audit_mutation();

DROP TRIGGER IF EXISTS trg_prevent_file_activity_mutation ON file_activity_events;
DROP TRIGGER IF EXISTS trg_compute_file_activity_hash_chain ON file_activity_events;
DROP FUNCTION IF EXISTS compute_file_activity_hash_chain();
DROP FUNCTION IF EXISTS prevent_file_activity_mutation();

DROP FUNCTION IF EXISTS encode_audit_field(text);

-- 2. DROP AUDIT AND SESSION TABLES IN STRICT DEPENDENCY ORDER
DROP TABLE IF EXISTS file_activity_events;
DROP TABLE IF EXISTS login_audit_events;
DROP TABLE IF EXISTS user_sessions;

-- 3. REMOVE CONSTRAINTS INTRODUCED IN 007 (Allows legacy strings during rollback)
ALTER TABLE file_shares DROP CONSTRAINT IF EXISTS chk_file_shares_perm_level;
ALTER TABLE file_shares DROP CONSTRAINT IF EXISTS chk_file_shares_target;

-- 4. DROP INVALIDATION TRIGGER BEFORE ROLLBACK UPDATE
-- (Ensures zero trigger side-effects during rollback restoration)
DROP TRIGGER IF EXISTS trg_invalidate_migration_provenance ON file_shares;
DROP FUNCTION IF EXISTS invalidate_migration_provenance();

-- 5. SELECTIVELY RESTORE ONLY UNTOUCHED LEGACY RECORDS
UPDATE file_shares s
SET permission_level = b.original_permission_level,
    updated_at = CURRENT_TIMESTAMP
FROM _migration_007_permission_backup b
WHERE s.id = b.share_id
  AND s.migration_provenance_token = b.migration_provenance_token;

-- 6. DROP TRACKING BACKUP TABLE AND PROVENANCE TOKEN COLUMN
DROP TABLE IF EXISTS _migration_007_permission_backup;
ALTER TABLE file_shares DROP COLUMN IF EXISTS migration_provenance_token;

-- 7. REMOVE OTHER COLUMNS INTRODUCED IN 007 (PRESERVES BASELINE COLUMNS)
ALTER TABLE file_shares DROP COLUMN IF EXISTS sharing_note, DROP COLUMN IF EXISTS revoked_at, DROP COLUMN IF EXISTS revoked_by;
ALTER TABLE files DROP COLUMN IF EXISTS is_quarantined, DROP COLUMN IF EXISTS is_test_data;
ALTER TABLE folders DROP COLUMN IF EXISTS is_department_root, DROP COLUMN IF EXISTS is_quarantined, DROP COLUMN IF EXISTS is_test_data;

-- PRESERVATION ENFORCED: Do NOT drop created_at or updated_at on departments!
ALTER TABLE departments DROP COLUMN IF EXISTS is_active, DROP COLUMN IF EXISTS manager_user_id;
ALTER TABLE users DROP COLUMN IF EXISTS session_version, DROP COLUMN IF EXISTS is_department_head;

-- 8. PURGE HEAD POINTERS EXCLUSIVELY INTRODUCED IN 007
DELETE FROM system_settings WHERE setting_key IN ('login_audit_chain_head', 'file_activity_chain_head');

-- 9. REMOVE REGISTRY ENTRY
DELETE FROM schema_migrations WHERE version = '007';

COMMIT;
