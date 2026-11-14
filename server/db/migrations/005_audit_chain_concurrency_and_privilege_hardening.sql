-- =============================================================================
-- Migration 005: Audit Log Concurrency Serialization & Privilege Hardening
-- Description: Enforces transaction-safe concurrency serialization on audit hash
--              chains via system_settings row-level serialization and hardens the nkb_app
--              role to guarantee zero trigger-bypass or mutation capability.
-- =============================================================================

BEGIN;

-- 1. TRANSACTION-SAFE SERIALIZED AUDIT HASH CHAIN TRACKER
INSERT INTO system_settings (setting_key, setting_value, data_type, category, description)
VALUES ('audit_chain_head', '0000000000000000000000000000000000000000000000000000000000000000', 'STRING', 'SECURITY', 'Cryptographic audit log hash chain head pointer')
ON CONFLICT (setting_key) DO NOTHING;

-- Synchronize initial head with any existing audit records
DO $$
DECLARE
    latest VARCHAR(64);
BEGIN
    SELECT record_hash INTO latest FROM audit_logs ORDER BY id DESC LIMIT 1;
    IF latest IS NOT NULL THEN
        UPDATE system_settings SET setting_value = latest WHERE setting_key = 'audit_chain_head';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION compute_audit_log_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash VARCHAR(64);
    payload TEXT;
BEGIN
    -- Row-level locking on system_settings row guarantees concurrent transactions
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

-- 2. HARDEN NKB_APP ROLE AND PREVENT TRIGGER BYPASS
-- nkb_app MUST NOT be superuser, MUST NOT have bypassrls, and MUST NOT own audit_logs.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nkb_app') THEN
        ALTER ROLE nkb_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    ELSE
        CREATE ROLE nkb_app WITH LOGIN PASSWORD 'NKB_App_Secure_2026!' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END $$;

-- Table ownership strictly assigned to postgres superuser / dba role if role exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
        ALTER TABLE audit_logs OWNER TO postgres;
        ALTER TABLE dlp_test_evidence OWNER TO postgres;
    END IF;
END $$;

-- Sequence permissions for identity columns
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nkb_app;

-- Explicitly revoke privilege to alter, truncate, or manage triggers on audit_logs
REVOKE ALL ON audit_logs FROM nkb_app;
GRANT SELECT, INSERT ON audit_logs TO nkb_app;
REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER ON audit_logs FROM nkb_app;

-- Explicitly revoke privilege to alter, truncate, or manage triggers on dlp_test_evidence
REVOKE ALL ON dlp_test_evidence FROM nkb_app;
GRANT SELECT, INSERT ON dlp_test_evidence TO nkb_app;
REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER ON dlp_test_evidence FROM nkb_app;

COMMIT;
