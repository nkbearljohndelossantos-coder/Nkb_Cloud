-- =============================================================================
-- Migration 006: Stage 2 Security Hardening & Asymmetric Key Authentication
-- Description: Adds Ed25519 public key support, key lifecycle management,
--              replaces plaintext credentials with asymmetric cryptography,
--              and expands command status for crash recovery.
-- =============================================================================

BEGIN;

-- 1. Add Ed25519 public key and signature algorithm to agent_credentials
ALTER TABLE agent_credentials ADD COLUMN IF NOT EXISTS public_key TEXT;
ALTER TABLE agent_credentials ADD COLUMN IF NOT EXISTS signature_algorithm VARCHAR(50) DEFAULT 'ed25519';
ALTER TABLE agent_credentials ADD COLUMN IF NOT EXISTS key_fingerprint VARCHAR(128);
ALTER TABLE agent_credentials ALTER COLUMN hmac_secret_hash DROP NOT NULL;

-- 2. Add public_key and enrollment tracking to storage_agents
ALTER TABLE storage_agents ADD COLUMN IF NOT EXISTS public_key TEXT;
ALTER TABLE storage_agents ADD COLUMN IF NOT EXISTS enrollment_token VARCHAR(255);
ALTER TABLE storage_agents ALTER COLUMN agent_token DROP NOT NULL;

-- 3. Expand agent_commands status constraint to support RUNNING and RECOVERY_REQUIRED
ALTER TABLE agent_commands DROP CONSTRAINT IF EXISTS agent_commands_status_check;
ALTER TABLE agent_commands ADD CONSTRAINT agent_commands_status_check CHECK (
    status IN ('PENDING', 'DISPATCHED', 'RUNNING', 'EXECUTED', 'FAILED', 'EXPIRED', 'RECOVERY_REQUIRED')
);

-- 4. Store Server Ed25519 Public Key in system_settings
INSERT INTO system_settings (setting_key, setting_value, data_type, category, description)
VALUES ('server_ed25519_public_key', '', 'STRING', 'SECURITY', 'Public key for server-originated command envelopes')
ON CONFLICT (setting_key) DO NOTHING;

COMMIT;
