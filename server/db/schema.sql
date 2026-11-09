-- =============================================================================
-- NKB CLOUD - PRODUCTION DATABASE SCHEMA (PostgreSQL 16)
-- Version: 2.1.0 - Identity, Security & Data Integrity
-- Organization: NKB Manufacturing
-- Target Database: PostgreSQL 16 on Hostinger VPS (AlmaLinux 10)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. ROLES & PERMISSIONS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL, -- 'SUPER ADMIN', 'ADMIN', 'STANDARD USER', 'VIEWER'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    module VARCHAR(50) NOT NULL, -- 'STORAGE', 'USERS', 'FILES', 'SHARING', 'AUDIT', 'SETTINGS', 'DLP'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- -----------------------------------------------------------------------------
-- 2. DEPARTMENTS & USERS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    avatar_url TEXT,
    role_id INT NOT NULL REFERENCES roles(id),
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    storage_quota_bytes BIGINT DEFAULT 107374182400, -- 100 GB default
    used_storage_bytes BIGINT DEFAULT 0,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_department_id ON users(department_id);

-- -----------------------------------------------------------------------------
-- 3. STORAGE AGENTS, CREDENTIALS & NONCE REGISTRY (WSS TLS 1.3 Handshake)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS storage_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name VARCHAR(100) NOT NULL,
    machine_name VARCHAR(100) NOT NULL,
    os_version VARCHAR(150),
    ip_address VARCHAR(45),
    agent_token VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'OFFLINE' CHECK (status IN ('ONLINE', 'OFFLINE', 'MAINTENANCE', 'REVOKED')),
    version VARCHAR(30) DEFAULT '2.1.0',
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Agent Cryptographic Credentials for Challenge-Response Authentication
CREATE TABLE IF NOT EXISTS agent_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES storage_agents(id) ON DELETE CASCADE,
    hmac_secret_hash VARCHAR(255) NOT NULL,
    key_version INT NOT NULL DEFAULT 1,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_credentials_lookup ON agent_credentials(agent_id, status);

-- Agent Nonce Registry (Replay Attack Prevention)
CREATE TABLE IF NOT EXISTS agent_nonce_registry (
    nonce VARCHAR(64) PRIMARY KEY,
    agent_id UUID NOT NULL REFERENCES storage_agents(id) ON DELETE CASCADE,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_nonce_expires ON agent_nonce_registry(expires_at);

-- Heartbeat monitoring logs
CREATE TABLE IF NOT EXISTS agent_heartbeats (
    id BIGSERIAL PRIMARY KEY,
    agent_id UUID NOT NULL REFERENCES storage_agents(id) ON DELETE CASCADE,
    cpu_usage_pct NUMERIC(5,2),
    memory_usage_pct NUMERIC(5,2),
    active_drives_count INT DEFAULT 0,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_logged ON agent_heartbeats(agent_id, logged_at DESC);

-- -----------------------------------------------------------------------------
-- 4. 3-LAYER STORAGE IDENTITIES: DEVICES, VOLUMES & REGISTRATIONS
-- -----------------------------------------------------------------------------

-- Layer 1: Physical Storage Devices
CREATE TABLE IF NOT EXISTS storage_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES storage_agents(id) ON DELETE CASCADE,
    hardware_serial_evidence VARCHAR(150) NOT NULL, -- Hardware serial evidence, NOT primary key
    disk_unique_id_evidence VARCHAR(150),
    vendor VARCHAR(100),
    model VARCHAR(150),
    bus_type VARCHAR(50), -- 'NVMe', 'SATA', 'USB', 'SCSI'
    media_type VARCHAR(50), -- 'SSD', 'HDD', 'NVMe SSD'
    total_capacity_bytes BIGINT NOT NULL,
    identity_confidence VARCHAR(40) DEFAULT 'VERIFIED' CHECK (
        identity_confidence IN ('VERIFIED', 'PARTIALLY_IDENTIFIED', 'MANUAL_VERIFICATION_REQUIRED', 'IDENTITY_MISMATCH')
    ),
    status VARCHAR(30) DEFAULT 'ONLINE' CHECK (status IN ('ONLINE', 'OFFLINE', 'DEGRADED', 'REPLACED')),
    health_status VARCHAR(50) DEFAULT 'GOOD',
    first_discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (agent_id, hardware_serial_evidence)
);
CREATE INDEX IF NOT EXISTS idx_devices_confidence ON storage_devices(identity_confidence);

-- Layer 2: Filesystem Volumes
CREATE TABLE IF NOT EXISTS storage_volumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES storage_devices(id) ON DELETE RESTRICT,
    volume_guid VARCHAR(100) NOT NULL, -- Windows Volume GUID (\\?\Volume{...}\)
    partition_guid VARCHAR(100),
    filesystem_uuid VARCHAR(100),
    partition_offset_bytes BIGINT,
    filesystem_type VARCHAR(30) DEFAULT 'NTFS',
    current_drive_letter VARCHAR(10),
    mount_path VARCHAR(255) NOT NULL,
    composite_identity VARCHAR(64) UNIQUE NOT NULL, -- SHA-256(HardwareSerial + VolumeGUID + DiskSize + PartitionOffset)
    total_bytes BIGINT NOT NULL,
    used_bytes BIGINT DEFAULT 0,
    free_bytes BIGINT NOT NULL,
    status VARCHAR(30) DEFAULT 'ONLINE' CHECK (
        status IN ('ONLINE', 'OFFLINE', 'MAINTENANCE', 'RETIRED', 'IDENTITY_MISMATCH', 'PENDING_ADMIN_REVIEW')
    ),
    last_verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_storage_volumes_composite ON storage_volumes(composite_identity);
CREATE INDEX IF NOT EXISTS idx_storage_volumes_guid ON storage_volumes(volume_guid);
CREATE INDEX IF NOT EXISTS idx_storage_volumes_status ON storage_volumes(status);

-- Layer 3: Enterprise Storage Registrations
CREATE TABLE IF NOT EXISTS storage_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nkb_asset_tag VARCHAR(100) UNIQUE NOT NULL, -- e.g. 'NKB-TAG-SSD01'
    storage_device_id UUID NOT NULL REFERENCES storage_devices(id) ON DELETE RESTRICT,
    storage_volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE RESTRICT,
    assigned_name VARCHAR(100) NOT NULL, -- e.g. 'NKB-SSD-01'
    storage_purpose VARCHAR(50) DEFAULT 'GENERAL' CHECK (
        storage_purpose IN ('PRIMARY', 'DOCUMENTS', 'ARCHIVE', 'ADDITIONAL', 'BACKUP', 'GENERAL')
    ),
    priority INT DEFAULT 1,
    is_default BOOLEAN DEFAULT FALSE,
    registration_status VARCHAR(40) DEFAULT 'ACTIVE' CHECK (
        registration_status IN ('ACTIVE', 'MAINTENANCE', 'MIGRATING', 'RETIRED', 'SUSPENDED')
    ),
    notes TEXT,
    registered_by UUID REFERENCES users(id),
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_registrations_purpose ON storage_registrations(storage_purpose);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON storage_registrations(registration_status);

-- Identity Observations & Hardware Inspection History
CREATE TABLE IF NOT EXISTS storage_identity_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES storage_agents(id) ON DELETE CASCADE,
    storage_device_id UUID REFERENCES storage_devices(id) ON DELETE SET NULL,
    storage_volume_id UUID REFERENCES storage_volumes(id) ON DELETE SET NULL,
    raw_device_payload JSONB NOT NULL,
    observed_drive_letter VARCHAR(10),
    observed_volume_guid VARCHAR(100),
    computed_confidence VARCHAR(40) NOT NULL CHECK (
        computed_confidence IN ('VERIFIED', 'PARTIALLY_IDENTIFIED', 'MANUAL_VERIFICATION_REQUIRED', 'IDENTITY_MISMATCH')
    ),
    reconciliation_verdict VARCHAR(100) NOT NULL,
    observed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_observations_time ON storage_identity_observations(observed_at DESC);

-- Identity Conflicts & Reformatting Safeguards
CREATE TABLE IF NOT EXISTS storage_identity_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_device_id UUID NOT NULL REFERENCES storage_devices(id) ON DELETE CASCADE,
    storage_volume_id UUID REFERENCES storage_volumes(id) ON DELETE SET NULL,
    conflict_reason VARCHAR(100) NOT NULL, -- 'VOLUME_GUID_ALTERED', 'FILESYSTEM_REFORMATTED', 'DUPLICATE_SERIAL'
    previous_snapshot JSONB NOT NULL,
    current_snapshot JSONB NOT NULL,
    status VARCHAR(30) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED_OVERWRITTEN', 'RESOLVED_REBOUND')),
    resolution_notes TEXT,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_conflicts_status ON storage_identity_conflicts(status);

-- Mount History
CREATE TABLE IF NOT EXISTS storage_mount_history (
    id BIGSERIAL PRIMARY KEY,
    volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE CASCADE,
    previous_drive_letter VARCHAR(10),
    new_drive_letter VARCHAR(10),
    event_type VARCHAR(50) NOT NULL, -- 'MOUNTED', 'UNMOUNTED', 'LETTER_CHANGED', 'VERIFIED'
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mount_history_volume ON storage_mount_history(volume_id, created_at DESC);

-- Health & SMART Logs
CREATE TABLE IF NOT EXISTS storage_health_logs (
    id BIGSERIAL PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES storage_devices(id) ON DELETE CASCADE,
    temperature_celsius INT,
    health_status VARCHAR(50) NOT NULL,
    wear_level_pct INT,
    error_count INT DEFAULT 0,
    raw_smart_data JSONB,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_health_logs_device ON storage_health_logs(device_id, checked_at DESC);

-- -----------------------------------------------------------------------------
-- 5. AGENT COMMANDS & COMMAND RESULTS (Signed Envelopes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES storage_agents(id) ON DELETE CASCADE,
    command_type VARCHAR(50) NOT NULL CHECK (
        command_type IN ('SCAN_DRIVES', 'WRITE_CHUNK_STREAM', 'READ_CHUNK_STREAM', 'VERIFY_HASH', 'MIGRATE_FILE', 'DELETE_RETIRED_PAYLOAD')
    ),
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(30) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DISPATCHED', 'EXECUTED', 'FAILED', 'EXPIRED')),
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    dispatched_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_commands_agent_status ON agent_commands(agent_id, status);

CREATE TABLE IF NOT EXISTS agent_command_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    command_id UUID UNIQUE NOT NULL REFERENCES agent_commands(id) ON DELETE CASCADE,
    success BOOLEAN NOT NULL,
    result_payload JSONB,
    error_message TEXT,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 6. FOLDERS & DIRECTORY HIERARCHY
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    is_shared_drive BOOLEAN DEFAULT FALSE,
    is_starred BOOLEAN DEFAULT FALSE,
    is_trashed BOOLEAN DEFAULT FALSE,
    preferred_volume_id UUID REFERENCES storage_volumes(id) ON DELETE SET NULL,
    color VARCHAR(20) DEFAULT '#0F172A',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_owner_id ON folders(owner_id);

-- -----------------------------------------------------------------------------
-- 7. FILES & INTEGRITY CHECKSUMS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(150) NOT NULL,
    extension VARCHAR(50),
    size_bytes BIGINT NOT NULL,
    category VARCHAR(50) DEFAULT 'OTHER' CHECK (
        category IN ('DOCUMENTS', 'PHOTOS', 'VIDEOS', 'AUDIO', 'ARCHIVES', 'OTHER')
    ),
    
    -- Physical Storage Association (RESTRICT delete: never wipe file record if volume referenced)
    storage_volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE RESTRICT,
    relative_path VARCHAR(1000) NOT NULL,
    current_version_num INT DEFAULT 1,
    
    -- Status & Integrity
    status VARCHAR(50) DEFAULT 'AVAILABLE' CHECK (
        status IN ('AVAILABLE', 'UNAVAILABLE_DRIVE_OFFLINE', 'SYNCING', 'CORRUPTED')
    ),
    is_starred BOOLEAN DEFAULT FALSE,
    is_trashed BOOLEAN DEFAULT FALSE,
    trashed_at TIMESTAMP WITH TIME ZONE,
    sha256_hash VARCHAR(64) NOT NULL,
    last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
CREATE INDEX IF NOT EXISTS idx_files_volume ON files(storage_volume_id);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256_hash);

CREATE TABLE IF NOT EXISTS file_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    version_num INT NOT NULL,
    storage_volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE RESTRICT,
    relative_path VARCHAR(1000) NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    change_summary VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (file_id, version_num)
);

CREATE TABLE IF NOT EXISTS file_checksums (
    id BIGSERIAL PRIMARY KEY,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    version_num INT NOT NULL,
    expected_sha256 VARCHAR(64) NOT NULL,
    actual_sha256 VARCHAR(64) NOT NULL,
    is_match BOOLEAN NOT NULL,
    checked_by_agent_id UUID REFERENCES storage_agents(id),
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 8. RESUMABLE & IDEMPOTENT UPLOADS (Binary Streaming)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS upload_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
    storage_volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE RESTRICT,
    file_name VARCHAR(255) NOT NULL,
    total_size_bytes BIGINT NOT NULL,
    total_chunks INT NOT NULL,
    uploaded_chunks INT DEFAULT 0,
    expected_sha256 VARCHAR(64),
    status VARCHAR(30) DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABORTED', 'EXPIRED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
);

CREATE TABLE IF NOT EXISTS file_chunks (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    chunk_size_bytes INT NOT NULL,
    chunk_sha256 VARCHAR(64),
    is_verified BOOLEAN DEFAULT FALSE,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (session_id, chunk_index)
);

-- -----------------------------------------------------------------------------
-- 9. SHARING & PERMISSIONS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS file_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES files(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    shared_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_with_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    shared_with_department_id INT REFERENCES departments(id) ON DELETE CASCADE,
    share_token VARCHAR(128) UNIQUE,
    permission_level VARCHAR(20) NOT NULL DEFAULT 'VIEW' CHECK (permission_level IN ('VIEW', 'EDIT', 'DOWNLOAD_ONLY')),
    allow_download BOOLEAN DEFAULT TRUE,
    password_hash VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE,
    access_count INT DEFAULT 0,
    is_revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_file_or_folder CHECK (
        (file_id IS NOT NULL AND folder_id IS NULL) OR 
        (file_id IS NULL AND folder_id IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS file_permissions (
    id SERIAL PRIMARY KEY,
    file_id UUID REFERENCES files(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    can_view BOOLEAN DEFAULT TRUE,
    can_download BOOLEAN DEFAULT TRUE,
    can_edit BOOLEAN DEFAULT FALSE,
    can_delete BOOLEAN DEFAULT FALSE,
    can_share BOOLEAN DEFAULT FALSE,
    granted_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (file_id, user_id),
    UNIQUE (folder_id, user_id)
);

-- -----------------------------------------------------------------------------
-- 10. STORAGE INTEGRITY AUDITING JOBS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS storage_integrity_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE CASCADE,
    status VARCHAR(30) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
    total_files_scanned BIGINT DEFAULT 0,
    total_bytes_scanned BIGINT DEFAULT 0,
    corrupt_files_count INT DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS storage_integrity_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES storage_integrity_jobs(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    recorded_sha256 VARCHAR(64) NOT NULL,
    actual_sha256 VARCHAR(64) NOT NULL,
    is_match BOOLEAN NOT NULL,
    error_message TEXT,
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_integrity_match ON storage_integrity_results(job_id, is_match);

-- -----------------------------------------------------------------------------
-- 11. SAFE FILE-LEVEL RESUMABLE MIGRATION
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS migration_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE RESTRICT,
    target_volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE RESTRICT,
    status VARCHAR(30) DEFAULT 'PENDING_APPROVAL' CHECK (
        status IN ('PENDING_APPROVAL', 'IN_PROGRESS', 'VERIFYING', 'COMPLETED', 'ABORTED', 'FAILED')
    ),
    total_files BIGINT DEFAULT 0,
    migrated_files BIGINT DEFAULT 0,
    total_bytes BIGINT DEFAULT 0,
    verified_bytes BIGINT DEFAULT 0,
    initiated_by UUID NOT NULL REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    retirement_approved BOOLEAN DEFAULT FALSE,
    notes TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_migration_status ON migration_jobs(status);

CREATE TABLE IF NOT EXISTS migration_file_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    migration_job_id UUID NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    source_sha256 VARCHAR(64) NOT NULL,
    target_sha256 VARCHAR(64),
    file_size_bytes BIGINT NOT NULL,
    status VARCHAR(30) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COPIED', 'VERIFIED_COPIED', 'FAILED')),
    error_message TEXT,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mig_file_status ON migration_file_results(migration_job_id, status);

-- -----------------------------------------------------------------------------
-- 12. AUDIT TRAIL, LOGS & RECYCLE BIN
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recycle_bin (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_type VARCHAR(20) NOT NULL,
    item_id UUID NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    original_parent_id UUID,
    deleted_by UUID NOT NULL REFERENCES users(id),
    original_size_bytes BIGINT DEFAULT 0,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    auto_delete_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')
);

CREATE TABLE IF NOT EXISTS download_logs (
    id BIGSERIAL PRIMARY KEY,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    share_token VARCHAR(128),
    ip_address VARCHAR(45),
    user_agent TEXT,
    bytes_downloaded BIGINT,
    downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    details JSONB,
    ip_address VARCHAR(45),
    previous_hash VARCHAR(64) DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
    record_hash VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

-- Audit Log Immutability Protection & Cryptographic Hash Chaining Triggers
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'NKB Cloud Security Policy: audit_logs records are append-only. UPDATE and DELETE operations are strictly prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_mutation ON audit_logs;
CREATE TRIGGER trg_prevent_audit_log_mutation
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE OR REPLACE FUNCTION compute_audit_log_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash VARCHAR(64);
    payload TEXT;
BEGIN
    -- Row-level serialization lock on system_settings guarantees concurrent transactions
    -- serialize strictly during chain calculation with zero deadlocks and zero table proliferation.
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

DROP TRIGGER IF EXISTS trg_compute_audit_log_hash_chain ON audit_logs;
CREATE TRIGGER trg_compute_audit_log_hash_chain
BEFORE INSERT ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION compute_audit_log_hash_chain();

-- -----------------------------------------------------------------------------
-- 13. DATA-LOSS PREVENTION (DLP) TEST SUITE & EVIDENCE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dlp_test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_suite_name VARCHAR(100) NOT NULL,
    execution_id VARCHAR(100) UNIQUE NOT NULL,
    agent_id UUID REFERENCES storage_agents(id) ON DELETE SET NULL,
    overall_status VARCHAR(30) DEFAULT 'NOT_TESTED' CHECK (
        overall_status IN ('NOT_TESTED', 'IN_PROGRESS', 'PASS', 'FAIL', 'BLOCKED')
    ),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dlp_test_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID NOT NULL REFERENCES dlp_test_runs(id) ON DELETE CASCADE,
    requirement_key VARCHAR(50) NOT NULL, -- e.g. 'DLP-01' to 'DLP-11'
    test_procedure TEXT NOT NULL,
    expected_result TEXT NOT NULL,
    actual_result TEXT,
    verification_status VARCHAR(30) DEFAULT 'NOT_TESTED' CHECK (
        verification_status IN ('NOT_TESTED', 'IN_PROGRESS', 'PASS', 'FAIL', 'BLOCKED')
    ),
    relevant_sha256 VARCHAR(64),
    database_proof TEXT,
    audit_log_id BIGINT REFERENCES audit_logs(id) ON DELETE SET NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dlp_req_status ON dlp_test_evidence(requirement_key, verification_status);

-- -----------------------------------------------------------------------------
-- 14. SYSTEM SETTINGS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    data_type VARCHAR(30) DEFAULT 'STRING',
    category VARCHAR(50) DEFAULT 'GENERAL',
    description TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Backwards compatibility views
CREATE OR REPLACE VIEW agent_command_queue AS 
    SELECT c.id, c.agent_id, c.command_type, c.payload, c.status, 
           r.result_payload AS response_payload, r.error_message AS failure_reason,
           0 AS attempts, c.expires_at, c.created_at, r.executed_at
    FROM agent_commands c
    LEFT JOIN agent_command_results r ON c.id = r.command_id;

CREATE OR REPLACE VIEW storage_migrations AS
    SELECT * FROM migration_jobs;
