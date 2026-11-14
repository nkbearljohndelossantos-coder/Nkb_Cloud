-- ============================================================================
-- MIGRATION 008: NKB DRIVE DESKTOP WORKSTATIONS & DELTA CHANGE JOURNAL
-- Nature: Strictly Additive (Zero changes to existing tables or records)
-- Compatible with PostgreSQL 16
-- ============================================================================

-- Sequence for cursor-based event numbering
CREATE SEQUENCE IF NOT EXISTS drive_change_seq START WITH 1 INCREMENT BY 1;

-- Table 1: Registered Windows Workstations & Laptops
CREATE TABLE IF NOT EXISTS nkb_drive_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    machine_name VARCHAR(255) NOT NULL,
    hardware_fingerprint VARCHAR(128) NOT NULL,
    os_version VARCHAR(255) NOT NULL,
    client_version VARCHAR(32) NOT NULL DEFAULT '2.1.0',
    target_drive_letter CHAR(2) NOT NULL DEFAULT 'N:',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    approval_status VARCHAR(32) NOT NULL DEFAULT 'APPROVED', -- 'PENDING', 'APPROVED', 'REJECTED', 'REVOKED'
    last_sync_at TIMESTAMPTZ,
    last_known_ip VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_hardware UNIQUE (user_id, hardware_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_drive_devices_user ON nkb_drive_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_drive_devices_active ON nkb_drive_devices(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_drive_devices_approval ON nkb_drive_devices(approval_status);

-- Table 2: Cursor-Based Delta Change Journal for Real-Time Synchronization
CREATE TABLE IF NOT EXISTS drive_change_journal (
    event_id BIGINT PRIMARY KEY DEFAULT nextval('drive_change_seq'),
    event_type VARCHAR(32) NOT NULL, -- 'FILE_CREATED', 'FILE_UPDATED', 'FILE_TRASHED', 'FILE_RESTORED', 'FILE_RENAMED', 'FILE_MOVED', 'FOLDER_CREATED', 'CONFLICT_FORKED'
    entity_type VARCHAR(16) NOT NULL, -- 'FILE', 'FOLDER'
    entity_id UUID NOT NULL,
    parent_id UUID,
    name VARCHAR(255) NOT NULL,
    size_bytes BIGINT DEFAULT 0,
    sha256 VARCHAR(64),
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    origin_device_id UUID REFERENCES nkb_drive_devices(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_change_journal_seq ON drive_change_journal(event_id);
CREATE INDEX IF NOT EXISTS idx_change_journal_created ON drive_change_journal(created_at);
CREATE INDEX IF NOT EXISTS idx_change_journal_entity ON drive_change_journal(entity_id);
