-- =============================================================================
-- Migration 004: Audit Log Hardening & Cryptographic Chain Integrity
-- Description: Enforces database-level immutability rules, cryptographic hash
--              chaining, and role-based privilege restrictions on audit_logs.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ADD CRYPTOGRAPHIC CHAIN COLUMNS
ALTER TABLE audit_logs 
    ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64) DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
    ADD COLUMN IF NOT EXISTS record_hash VARCHAR(64);

-- 2. TRIGGER: PREVENT ALL UPDATE OR DELETE OPERATIONS ON AUDIT_LOGS
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

-- 3. TRIGGER: AUTOMATIC TAMPER-EVIDENT CRYPTOGRAPHIC HASH CHAINING
CREATE OR REPLACE FUNCTION compute_audit_log_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash VARCHAR(64);
    payload TEXT;
BEGIN
    -- Query latest record_hash in chain
    SELECT record_hash INTO prev_hash FROM audit_logs ORDER BY id DESC LIMIT 1;
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
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compute_audit_log_hash_chain ON audit_logs;
CREATE TRIGGER trg_compute_audit_log_hash_chain
BEFORE INSERT ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION compute_audit_log_hash_chain();

-- 4. APPLICATION ROLE PRIVILEGE SEPARATION
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nkb_app') THEN
        CREATE ROLE nkb_app WITH LOGIN PASSWORD 'NKB_App_Secure_2026!';
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO nkb_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nkb_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nkb_app;

-- Strictly REVOKE UPDATE and DELETE on audit_logs and dlp evidence from the application role
REVOKE UPDATE, DELETE ON audit_logs FROM nkb_app;
REVOKE UPDATE, DELETE ON dlp_test_evidence FROM nkb_app;

COMMIT;
