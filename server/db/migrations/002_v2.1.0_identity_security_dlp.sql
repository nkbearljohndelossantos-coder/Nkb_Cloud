-- =============================================================================
-- Migration 002: NKB Cloud v2.1.0 – Identity, Security & Data Integrity
-- Description: Non-destructive addition of 3-layer identity, agent security,
--              file-level migration, integrity auditing, and DLP test evidence.
-- =============================================================================

BEGIN;

-- 1. AGENT SECURITY: CREDENTIALS & NONCE REGISTRY
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

CREATE TABLE IF NOT EXISTS agent_nonce_registry (
    nonce VARCHAR(64) PRIMARY KEY,
    agent_id UUID NOT NULL REFERENCES storage_agents(id) ON DELETE CASCADE,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_nonce_expires ON agent_nonce_registry(expires_at);

-- 2. EXTEND STORAGE DEVICES (Layer 1)
ALTER TABLE storage_devices 
    ADD COLUMN IF NOT EXISTS hardware_serial_evidence VARCHAR(150),
    ADD COLUMN IF NOT EXISTS disk_unique_id_evidence VARCHAR(150),
    ADD COLUMN IF NOT EXISTS identity_confidence VARCHAR(40) DEFAULT 'VERIFIED',
    ADD COLUMN IF NOT EXISTS first_discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Backfill hardware_serial_evidence from hardware_serial if blank
UPDATE storage_devices 
SET hardware_serial_evidence = hardware_serial 
WHERE hardware_serial_evidence IS NULL AND hardware_serial IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_devices_confidence ON storage_devices(identity_confidence);

-- 3. EXTEND STORAGE VOLUMES (Layer 2)
ALTER TABLE storage_volumes 
    ADD COLUMN IF NOT EXISTS volume_guid VARCHAR(100),
    ADD COLUMN IF NOT EXISTS partition_guid VARCHAR(100),
    ADD COLUMN IF NOT EXISTS filesystem_uuid VARCHAR(100),
    ADD COLUMN IF NOT EXISTS partition_offset_bytes BIGINT,
    ADD COLUMN IF NOT EXISTS filesystem_type VARCHAR(30) DEFAULT 'NTFS';

-- Backfill volume_guid from volume_uuid if blank
UPDATE storage_volumes 
SET volume_guid = volume_uuid 
WHERE volume_guid IS NULL AND volume_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_storage_volumes_guid ON storage_volumes(volume_guid);

-- 4. ENTERPRISE STORAGE REGISTRATIONS (Layer 3)
CREATE TABLE IF NOT EXISTS storage_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nkb_asset_tag VARCHAR(100) UNIQUE NOT NULL,
    storage_device_id UUID NOT NULL REFERENCES storage_devices(id) ON DELETE RESTRICT,
    storage_volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE RESTRICT,
    assigned_name VARCHAR(100) NOT NULL,
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

-- Seed existing storage_volumes into storage_registrations if not already present
INSERT INTO storage_registrations (
    id, nkb_asset_tag, storage_device_id, storage_volume_id, assigned_name, storage_purpose, priority, is_default, registration_status
)
SELECT 
    gen_random_uuid(),
    'NKB-TAG-' || SUBSTRING(v.composite_identity, 1, 8),
    v.device_id,
    v.id,
    v.assigned_name,
    COALESCE(v.storage_purpose, 'GENERAL'),
    COALESCE(v.priority, 1),
    COALESCE(v.is_default, FALSE),
    'ACTIVE'
FROM storage_volumes v
WHERE NOT EXISTS (
    SELECT 1 FROM storage_registrations r WHERE r.storage_volume_id = v.id
);

-- 5. STORAGE IDENTITY OBSERVATIONS & CONFLICTS
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

CREATE TABLE IF NOT EXISTS storage_identity_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_device_id UUID NOT NULL REFERENCES storage_devices(id) ON DELETE CASCADE,
    storage_volume_id UUID REFERENCES storage_volumes(id) ON DELETE SET NULL,
    conflict_reason VARCHAR(100) NOT NULL,
    previous_snapshot JSONB NOT NULL,
    current_snapshot JSONB NOT NULL,
    status VARCHAR(30) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED_OVERWRITTEN', 'RESOLVED_REBOUND')),
    resolution_notes TEXT,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_conflicts_status ON storage_identity_conflicts(status);

-- 6. TYPED COMMAND ENVELOPES & RESULTS
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

-- 7. STORAGE INTEGRITY AUDITING JOBS
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

-- 8. SAFE RESUMABLE FILE-LEVEL MIGRATION
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

-- 9. DATA-LOSS PREVENTION (DLP) TEST SUITE & EVIDENCE
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
    requirement_key VARCHAR(50) NOT NULL,
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

-- 10. BACKWARDS COMPATIBILITY VIEWS
CREATE OR REPLACE VIEW agent_command_queue AS 
    SELECT c.id, c.agent_id, c.command_type, c.payload, c.status, 
           r.result_payload AS response_payload, r.error_message AS failure_reason,
           0 AS attempts, c.expires_at, c.created_at, r.executed_at
    FROM agent_commands c
    LEFT JOIN agent_command_results r ON c.id = r.command_id;

CREATE OR REPLACE VIEW storage_migrations AS
    SELECT * FROM migration_jobs;

COMMIT;
