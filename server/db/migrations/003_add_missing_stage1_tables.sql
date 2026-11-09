-- =============================================================================
-- Migration 003: Add Missing Stage 1 Operational Tables
-- Description: Non-destructive addition of storage_mount_history, 
--              storage_health_logs, and agent_heartbeats to resolve audit AUD-02.
-- =============================================================================

BEGIN;

-- 1. AGENT HEARTBEATS (Operational vital signs & resource telemetry)
CREATE TABLE IF NOT EXISTS agent_heartbeats (
    id BIGSERIAL PRIMARY KEY,
    agent_id UUID NOT NULL REFERENCES storage_agents(id) ON DELETE CASCADE,
    cpu_usage_pct NUMERIC(5,2),
    memory_usage_pct NUMERIC(5,2),
    active_drives_count INT DEFAULT 0,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_logged ON agent_heartbeats(agent_id, logged_at DESC);

-- 2. STORAGE MOUNT HISTORY (Drive-letter remap audit and mount lifecycle)
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

-- 3. STORAGE HEALTH LOGS (S.M.A.R.T. metrics, temperature, and wear level)
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

-- 4. SCHEMA COMPATIBILITY ASSERTION
-- Ensure existing tables (if pre-created) are compatible and not invalid schemas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agent_heartbeats' AND column_name = 'agent_id'
    ) THEN
        RAISE EXCEPTION 'Table agent_heartbeats exists with incompatible schema definition!';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'storage_mount_history' AND column_name = 'volume_id'
    ) THEN
        RAISE EXCEPTION 'Table storage_mount_history exists with incompatible schema definition!';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'storage_health_logs' AND column_name = 'device_id'
    ) THEN
        RAISE EXCEPTION 'Table storage_health_logs exists with incompatible schema definition!';
    END IF;
END $$;

COMMIT;
