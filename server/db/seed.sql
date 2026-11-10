-- =============================================================================
-- NKB CLOUD - INITIAL SEED DATA (v2.1.0)
-- Organization: NKB Manufacturing
-- =============================================================================

-- 1. SYSTEM ROLES
INSERT INTO roles (id, name, description) VALUES
(1, 'SUPER ADMIN', 'Unrestricted administrative access to all files, storage drives, users, audit logs, and DLP suites'),
(2, 'ADMIN', 'Management of authorized department users, folders, and assigned storage areas'),
(3, 'STANDARD USER', 'Personal workspace, upload, download, and standard authorized sharing'),
(4, 'VIEWER', 'Read-only preview and authorized download privileges')
ON CONFLICT (id) DO NOTHING;

-- 2. SYSTEM PERMISSIONS
INSERT INTO permissions (name, module, description) VALUES
('storage:view', 'STORAGE', 'View storage drives, capacity, and health'),
('storage:manage', 'STORAGE', 'Register, replace, configure priority and offline states of storage drives'),
('storage:migrate', 'STORAGE', 'Authorize and approve safe file-level storage replacement migration'),
('storage:integrity', 'STORAGE', 'Initiate and review background SHA-256 storage integrity jobs'),
('users:view', 'USERS', 'View user accounts and departmental directory'),
('users:manage', 'USERS', 'Create, update, deactivate users and adjust storage quotas'),
('files:read', 'FILES', 'View and download accessible files'),
('files:upload', 'FILES', 'Upload files and create directories via binary streaming'),
('files:delete', 'FILES', 'Delete personal files and move to trash'),
('files:share', 'SHARING', 'Create sharing links and grant internal permissions'),
('audit:view', 'AUDIT', 'View system audit trails and download logs'),
('dlp:view', 'DLP', 'View Data-Loss Prevention test matrix and evidence results'),
('dlp:run', 'DLP', 'Execute DLP test suites and record cryptographic verification'),
('settings:manage', 'SETTINGS', 'Configure global system parameters and file policies')
ON CONFLICT (name) DO NOTHING;

-- 3. ROLE-PERMISSION MAPPINGS
-- Super Admin (All Permissions)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions
ON CONFLICT DO NOTHING;

-- Admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE name IN (
    'storage:view', 'storage:integrity', 'users:view', 'users:manage', 
    'files:read', 'files:upload', 'files:delete', 'files:share', 'audit:view', 'dlp:view'
)
ON CONFLICT DO NOTHING;

-- Standard User
INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE name IN (
    'files:read', 'files:upload', 'files:delete', 'files:share'
)
ON CONFLICT DO NOTHING;

-- Viewer
INSERT INTO role_permissions (role_id, permission_id)
SELECT 4, id FROM permissions WHERE name IN ('files:read')
ON CONFLICT DO NOTHING;

-- 4. DEPARTMENTS
INSERT INTO departments (id, name, code, description) VALUES
(1, 'Executive & Leadership', 'EXEC', 'Executive management and leadership team'),
(2, 'IT & Systems Infrastructure', 'IT', 'Information technology, cloud storage, and systems management'),
(3, 'Manufacturing & Operations', 'MFG', 'Plant operations, machine specs, and manufacturing records'),
(4, 'Quality Assurance & Control', 'QA', 'Quality inspections, ISO compliance, and audit records'),
(5, 'Engineering & Design', 'ENG', 'Product blueprints, CAD drawings, and technical specs'),
(6, 'Finance & Human Resources', 'FHR', 'Financial ledgers, payroll, and corporate compliance')
ON CONFLICT (id) DO NOTHING;

-- 5. DEFAULT SUPER ADMINISTRATOR (Password: Admin@NKB2026!)
INSERT INTO users (
    id,
    username,
    email,
    password_hash,
    full_name,
    role_id,
    department_id,
    status,
    storage_quota_bytes
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'superadmin',
    'admin@nkbmanufacturing.com',
    '$2a$10$BW5.KOJDCKbWnPqTxJbRHuEietCbjETW7G8zcyyuymgUS.4xuZtn6',
    'NKB Super Administrator',
    1,
    2,
    'ACTIVE',
    10995116277760
) ON CONFLICT (email) DO NOTHING;

-- 6. SYSTEM SETTINGS
INSERT INTO system_settings (setting_key, setting_value, data_type, category, description) VALUES
('app_name', 'NKB Cloud', 'STRING', 'BRANDING', 'Platform branding name'),
('storage_placement_policy', 'PRIORITY_POOL', 'STRING', 'STORAGE', 'Storage placement policy: PRIORITY_POOL, DEFAULT_DRIVE, or SELECT_PER_UPLOAD'),
('max_upload_size_bytes', '53687091200', 'INTEGER', 'STORAGE', 'Maximum file upload size in bytes (50 GB chunked limit)'),
('chunk_size_bytes', '10485760', 'INTEGER', 'PERFORMANCE', 'Binary chunk slice upload size (10 MB per chunk)'),
('agent_command_ttl_ms', '60000', 'INTEGER', 'SECURITY', 'Signed command envelope expiration window in milliseconds'),
('agent_nonce_ttl_seconds', '300', 'INTEGER', 'SECURITY', 'Cryptographic nonce validity window in seconds'),
('require_tls13', 'true', 'BOOLEAN', 'SECURITY', 'Enforce TLS 1.3 on all storage agent WebSocket connections'),
('allowlist_strict_mode', 'true', 'BOOLEAN', 'SECURITY', 'Reject operations attempting Windows alternate data streams or reparse points'),
('retention_recycle_days', '30', 'INTEGER', 'STORAGE', 'Days to preserve deleted files in recycle bin before purge'),
('require_share_passwords', 'false', 'BOOLEAN', 'SHARING', 'Require passwords on all public share links'),
('default_share_expiry_days', '7', 'INTEGER', 'SHARING', 'Default expiration days for generated share links'),
('backup_disclaimer_acknowledged', 'true', 'BOOLEAN', 'STORAGE', 'Explicit acknowledgment that pooling multiple drives is NOT a substitute for backup'),
('audit_chain_head', '0000000000000000000000000000000000000000000000000000000000000000', 'STRING', 'SECURITY', 'Cryptographic audit log hash chain head pointer')
ON CONFLICT (setting_key) DO NOTHING;

-- 7. INITIALIZE DLP TEST RUN BASELINE (All Initialized as NOT_TESTED)
INSERT INTO dlp_test_runs (
    id,
    test_suite_name,
    execution_id,
    overall_status
) VALUES (
    '00000000-0000-0000-0000-000000000099',
    'NKB Cloud Non-Negotiable DLP Test Matrix v2.1.0',
    'DLP-BASELINE-INIT-2026',
    'NOT_TESTED'
) ON CONFLICT (execution_id) DO NOTHING;

INSERT INTO dlp_test_evidence (
    id,
    test_run_id,
    requirement_key,
    test_procedure,
    expected_result,
    verification_status
) VALUES 
(
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000099',
    'DLP-01',
    'Scan connected disks via CIM; record device UUID and volume UUID; unmount; reconnect with new drive letter; verify volume re-identifies without data loss.',
    'Volume identified by Volume GUID and composite fingerprint; drive letter updated in storage_mount_history; zero file loss.',
    'NOT_TESTED'
),
(
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000099',
    'DLP-02',
    'Physically unplug USB drive; verify status transitions to OFFLINE; confirm database records retain all file metadata; confirm download returns HTTP 503.',
    'Drive marked OFFLINE; all file records preserved; file downloads return HTTP 503 Service Unavailable with UNAVAILABLE message.',
    'NOT_TESTED'
),
(
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000099',
    'DLP-03',
    'Plug USB drive back in; confirm status transitions to ONLINE; verify file download resumes immediate 200 OK with matched SHA-256.',
    'Drive transitions to ONLINE; download resumes successfully; byte stream and SHA-256 match original upload.',
    'NOT_TESTED'
),
(
    '00000000-0000-0000-0000-000000000104',
    '00000000-0000-0000-0000-000000000099',
    'DLP-04',
    'Connect foreign drive or repartitioned disk with conflicting Volume GUID; verify system halts auto-mount and flags IDENTITY_MISMATCH.',
    'Volume marked IDENTITY_MISMATCH; conflict logged in storage_identity_conflicts; read/write access blocked; metadata preserved.',
    'NOT_TESTED'
),
(
    '00000000-0000-0000-0000-000000000105',
    '00000000-0000-0000-0000-000000000099',
    'DLP-05',
    'Upload 50MB file across 5 chunks; interrupt network after chunk 2; resume transfer; verify chunks 0-1 skipped, chunk 2 resumed, SHA-256 matches.',
    'Resume status endpoint reports chunks 0-1 present; chunk 2 written without offset corruption; finalized file SHA-256 verified.',
    'NOT_TESTED'
),
(
    '00000000-0000-0000-0000-000000000106',
    '00000000-0000-0000-0000-000000000099',
    'DLP-06',
    'Intentionally send duplicate chunk with identical idempotency key; verify agent acknowledges without re-writing or corrupting adjacent bytes.',
    'Agent returns cached: true and 200 OK; byte offsets unaltered; final file passes SHA-256 integrity check.',
    'NOT_TESTED'
),
(
    '00000000-0000-0000-0000-000000000107',
    '00000000-0000-0000-0000-000000000099',
    'DLP-07',
    'Attempt path traversal (../../Windows/system32/cmd.exe), ADS (test.txt::$DATA), and junction links; verify all are rejected with HTTP 403/400.',
    'Path containment validator flags traversal/ADS attempt; throws unauthorized error; zero access outside allowlisted storage root.',
    'NOT_TESTED'
),
(
    '00000000-0000-0000-0000-000000000108',
    '00000000-0000-0000-0000-000000000099',
    'DLP-08',
    'Plan migration from Volume A to Volume B; verify require Super Admin approval; copy files; verify each via SHA-256; verify source preserved.',
    'Migration enters PENDING_APPROVAL; file copy executes only after approval; target SHA-256 verified against source; source untouched.',
    'NOT_TESTED'
),
(
    '00000000-0000-0000-0000-000000000109',
    '00000000-0000-0000-0000-000000000099',
    'DLP-09',
    'Retire migrated drive; verify status changes to RETIRED; verify zero files erased or formatted on physical media.',
    'Source drive status set to RETIRED; database records retained; zero disk format/erase commands issued to physical hardware.',
    'NOT_TESTED'
),
(
    '00000000-0000-0000-0000-000000000110',
    '00000000-0000-0000-0000-000000000099',
    'DLP-10',
    'Connect agent; verify HMAC challenge-response handshake; replay intercepted nonce; verify server rejects connection with replay error.',
    'First connection authenticated; replayed nonce rejected with INVALID_CREDENTIALS_OR_REPLAY; agent flagged in audit logs.',
    'NOT_TESTED'
),
(
    '00000000-0000-0000-0000-000000000111',
    '00000000-0000-0000-0000-000000000099',
    'DLP-11',
    'Verify that all login, mount, unmount, upload, download, migration, and retirement events generate permanent immutable audit records.',
    'Audit logs record timestamp, user ID, IP, action, entity type, and cryptographic evidence; audit records cannot be overwritten.',
    'NOT_TESTED'
)
ON CONFLICT (id) DO NOTHING;
