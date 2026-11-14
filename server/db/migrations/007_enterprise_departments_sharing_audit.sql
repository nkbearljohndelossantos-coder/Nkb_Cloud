-- =============================================================================
-- Migration 007: Enterprise Departments, User Accounts, Folder Sharing, RBAC & Audit System
-- Description: Adds enterprise RBAC, session revocation, 3-stream audit, 
--              and test fixture quarantine with database engine-enforced provenance token protection.
-- =============================================================================

BEGIN;

-- 1. EXCLUSIVELY LOCK TABLES TO PREVENT CONCURRENT WRITES DURING MIGRATION
LOCK TABLE file_shares IN EXCLUSIVE MODE;

-- 2. CANONICAL TLV AUDIT SERIALIZATION FUNCTION
CREATE OR REPLACE FUNCTION encode_audit_field(val TEXT)
RETURNS TEXT AS $$
BEGIN
    IF val IS NULL THEN
        RETURN 'N;';
    ELSE
        RETURN 'S' || octet_length(val)::text || ':' || val || ';';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp;

-- 3. USER SESSIONS TABLE (Active Session Revocation)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    token_fingerprint VARCHAR(64) NOT NULL UNIQUE,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    device_type VARCHAR(50),
    os_name VARCHAR(50),
    browser_name VARCHAR(50),
    approx_location VARCHAR(100) DEFAULT 'Local Offline Staging',
    is_revoked BOOLEAN DEFAULT FALSE NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoked_reason VARCHAR(100),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_activity_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_lookup ON user_sessions(user_id, is_revoked);
CREATE INDEX IF NOT EXISTS idx_user_sessions_fingerprint ON user_sessions(token_fingerprint);

-- 4. DEDICATED LOGIN SECURITY AUDIT EVENTS
CREATE TABLE IF NOT EXISTS login_audit_events (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    username_attempted VARCHAR(100) NOT NULL,
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    failure_reason VARCHAR(100),
    ip_address VARCHAR(45) NOT NULL,
    device_type VARCHAR(50),
    os_name VARCHAR(50),
    browser_name VARCHAR(50),
    user_agent TEXT,
    approx_location VARCHAR(100) DEFAULT 'Local Offline Staging (Windows 11)',
    session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
    previous_hash VARCHAR(64) DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
    record_hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_audit_user ON login_audit_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_audit_event_type ON login_audit_events(event_type, created_at DESC);

-- 5. DEDICATED FILE ACTIVITY AUDIT EVENTS
CREATE TABLE IF NOT EXISTS file_activity_events (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(30) NOT NULL,
    entity_id UUID NOT NULL,
    target_name VARCHAR(255) NOT NULL,
    parent_folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
    source_ip VARCHAR(45) NOT NULL,
    result VARCHAR(20) DEFAULT 'SUCCESS' NOT NULL,
    error_message TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    previous_hash VARCHAR(64) DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
    record_hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_file_activity_actor ON file_activity_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_activity_entity ON file_activity_events(entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_activity_action ON file_activity_events(action, created_at DESC);

-- 6. USER & DEPARTMENT SCHEMA EXTENSIONS
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INT DEFAULT 1 NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_department_head BOOLEAN DEFAULT FALSE NOT NULL;

ALTER TABLE departments ADD COLUMN IF NOT EXISTS manager_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL;

-- 7. FOLDERS & FILES SCHEMA EXTENSIONS
ALTER TABLE folders ADD COLUMN IF NOT EXISTS is_department_root BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE folders ADD COLUMN IF NOT EXISTS is_quarantined BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE folders ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT FALSE NOT NULL;

ALTER TABLE files ADD COLUMN IF NOT EXISTS is_quarantined BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE files ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT FALSE NOT NULL;

-- 8. FILE SHARES SCHEMA EXTENSIONS, PROVENANCE TRACKING & MIGRATION
ALTER TABLE file_shares ADD COLUMN IF NOT EXISTS sharing_note TEXT;
ALTER TABLE file_shares ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE file_shares ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE file_shares ADD COLUMN IF NOT EXISTS migration_provenance_token VARCHAR(64);

-- Dedicated migration provenance tracking backup table
CREATE TABLE IF NOT EXISTS _migration_007_permission_backup (
    share_id UUID PRIMARY KEY,
    original_permission_level VARCHAR(20) NOT NULL,
    normalized_permission_level VARCHAR(20) NOT NULL,
    migration_provenance_token VARCHAR(64) NOT NULL,
    migrated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Snapshot legacy shares and assign cycle provenance token
DO $$
DECLARE
    v_token VARCHAR(64) := 'MIG-007-' || gen_random_uuid()::text;
BEGIN
    INSERT INTO _migration_007_permission_backup (
        share_id, 
        original_permission_level, 
        normalized_permission_level, 
        migration_provenance_token
    )
    SELECT 
        id, 
        permission_level,
        CASE permission_level
            WHEN 'VIEW' THEN 'VIEWER'
            WHEN 'DOWNLOAD_ONLY' THEN 'DOWNLOADER'
            WHEN 'EDIT' THEN 'EDITOR'
            ELSE permission_level
        END,
        v_token
    FROM file_shares
    WHERE permission_level IN ('VIEW', 'DOWNLOAD_ONLY', 'EDIT')
    ON CONFLICT (share_id) DO NOTHING;

    -- Update legacy records with normalized levels and provenance token
    UPDATE file_shares s
    SET permission_level = b.normalized_permission_level,
        migration_provenance_token = b.migration_provenance_token,
        updated_at = CURRENT_TIMESTAMP
    FROM _migration_007_permission_backup b
    WHERE s.id = b.share_id;
END $$;

-- Database engine trigger: invalidates provenance token on any permission change
CREATE OR REPLACE FUNCTION invalidate_migration_provenance()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.permission_level IS DISTINCT FROM NEW.permission_level THEN
        NEW.migration_provenance_token := NULL;
    ELSIF NEW.migration_provenance_token IS DISTINCT FROM OLD.migration_provenance_token THEN
        -- Prevent arbitrary modification or forgery of provenance token
        NEW.migration_provenance_token := OLD.migration_provenance_token;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invalidate_migration_provenance ON file_shares;
CREATE TRIGGER trg_invalidate_migration_provenance
    BEFORE UPDATE ON file_shares
    FOR EACH ROW
    EXECUTE FUNCTION invalidate_migration_provenance();

-- Enterprise constraints on file_shares
ALTER TABLE file_shares DROP CONSTRAINT IF EXISTS chk_file_shares_perm_level;
ALTER TABLE file_shares ADD CONSTRAINT chk_file_shares_perm_level 
    CHECK (permission_level IN ('VIEWER', 'DOWNLOADER', 'CONTRIBUTOR', 'EDITOR'));

ALTER TABLE file_shares DROP CONSTRAINT IF EXISTS chk_file_shares_target;
ALTER TABLE file_shares ADD CONSTRAINT chk_file_shares_target 
    CHECK (
        (shared_with_user_id IS NOT NULL AND shared_with_department_id IS NULL) OR
        (shared_with_user_id IS NULL AND shared_with_department_id IS NOT NULL) OR
        (share_token IS NOT NULL)
    );

-- 9. SYSTEM SETTINGS CHAIN HEAD POINTER INITIALIZATION
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES 
    ('login_audit_chain_head', '0000000000000000000000000000000000000000000000000000000000000000', 'SHA-256 chain head for login security events'),
    ('file_activity_chain_head', '0000000000000000000000000000000000000000000000000000000000000000', 'SHA-256 chain head for file activity events')
ON CONFLICT (setting_key) DO NOTHING;

-- 10. TLV CRYPTOGRAPHIC TRIGGERS FOR LOGIN AUDIT
CREATE OR REPLACE FUNCTION compute_login_audit_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash VARCHAR(64);
    canonical_payload TEXT;
BEGIN
    SELECT setting_value INTO prev_hash
    FROM system_settings
    WHERE setting_key = 'login_audit_chain_head'
    FOR UPDATE;

    IF prev_hash IS NULL THEN
        prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
    END IF;

    NEW.previous_hash := prev_hash;

    canonical_payload := 
        encode_audit_field(NEW.user_id::text) ||
        encode_audit_field(NEW.username_attempted) ||
        encode_audit_field(NEW.department_id::text) ||
        encode_audit_field(NEW.event_type) ||
        encode_audit_field(NEW.failure_reason) ||
        encode_audit_field(NEW.ip_address) ||
        encode_audit_field(COALESCE(NEW.created_at::text, CURRENT_TIMESTAMP::text)) ||
        encode_audit_field(NEW.previous_hash);

    NEW.record_hash := encode(digest(canonical_payload, 'sha256'), 'hex');

    UPDATE system_settings
    SET setting_value = NEW.record_hash, updated_at = CURRENT_TIMESTAMP
    WHERE setting_key = 'login_audit_chain_head';

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Audit Integrity Violation: Login audit hash chain computation failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION prevent_login_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Cryptographic Audit Integrity Violation: Modifying or deleting login audit logs is strictly prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compute_login_audit_hash_chain ON login_audit_events;
CREATE TRIGGER trg_compute_login_audit_hash_chain
    BEFORE INSERT ON login_audit_events
    FOR EACH ROW
    EXECUTE FUNCTION compute_login_audit_hash_chain();

DROP TRIGGER IF EXISTS trg_prevent_login_audit_mutation ON login_audit_events;
CREATE TRIGGER trg_prevent_login_audit_mutation
    BEFORE UPDATE OR DELETE ON login_audit_events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_login_audit_mutation();

-- 11. TLV CRYPTOGRAPHIC TRIGGERS FOR FILE ACTIVITY AUDIT
CREATE OR REPLACE FUNCTION compute_file_activity_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash VARCHAR(64);
    canonical_payload TEXT;
BEGIN
    SELECT setting_value INTO prev_hash
    FROM system_settings
    WHERE setting_key = 'file_activity_chain_head'
    FOR UPDATE;

    IF prev_hash IS NULL THEN
        prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
    END IF;

    NEW.previous_hash := prev_hash;

    canonical_payload := 
        encode_audit_field(NEW.actor_user_id::text) ||
        encode_audit_field(NEW.department_id::text) ||
        encode_audit_field(NEW.action) ||
        encode_audit_field(NEW.entity_type) ||
        encode_audit_field(NEW.entity_id::text) ||
        encode_audit_field(NEW.target_name) ||
        encode_audit_field(NEW.result) ||
        encode_audit_field(NEW.source_ip) ||
        encode_audit_field(COALESCE(NEW.created_at::text, CURRENT_TIMESTAMP::text)) ||
        encode_audit_field(NEW.previous_hash);

    NEW.record_hash := encode(digest(canonical_payload, 'sha256'), 'hex');

    UPDATE system_settings
    SET setting_value = NEW.record_hash, updated_at = CURRENT_TIMESTAMP
    WHERE setting_key = 'file_activity_chain_head';

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Audit Integrity Violation: File activity hash chain computation failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION prevent_file_activity_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Cryptographic Audit Integrity Violation: Modifying or deleting file activity audit logs is strictly prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compute_file_activity_hash_chain ON file_activity_events;
CREATE TRIGGER trg_compute_file_activity_hash_chain
    BEFORE INSERT ON file_activity_events
    FOR EACH ROW
    EXECUTE FUNCTION compute_file_activity_hash_chain();

DROP TRIGGER IF EXISTS trg_prevent_file_activity_mutation ON file_activity_events;
CREATE TRIGGER trg_prevent_file_activity_mutation
    BEFORE UPDATE OR DELETE ON file_activity_events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_file_activity_mutation();

-- 12. TEST ARTIFACT QUARANTINE (Clean My Drive without file destruction)
UPDATE folders
SET is_quarantined = TRUE, is_test_data = TRUE
WHERE name IN ('Offline_Test_Folder', 'Subfolder_Alpha');

UPDATE files
SET is_quarantined = TRUE, is_test_data = TRUE
WHERE name LIKE '%.bin' OR name LIKE 'dummy_%' OR name LIKE '889652510%';

-- 13. REGISTRY ENTRY
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('007', '007_enterprise_departments_sharing_audit.sql', CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;

COMMIT;
