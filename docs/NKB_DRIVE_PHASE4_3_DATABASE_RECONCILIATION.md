# NKB DRIVE — PHASE 4.3 DATABASE RECONCILIATION REPORT
## Database Architecture, Schema Mapping, and Data Integrity Standards

**Document Version:** 1.0.0  
**Date:** November 13, 2026  
**Auditor / Architect:** Antigravity AI Engine  
**Central Database:** PostgreSQL 16.8 (Debian container `nkb_pg16_staging`, Host Port `5433`)  
**Target Staging Database:** `nkb_drive_staging` (45 tables)  
**Untouched Staging Database:** `nkb_cloud_staging` (39 tables, 100% Preserved)  
**Client Desktop Database:** Native Windows SQLite (`metadata.db` via `winsqlite3.dll`)  
**Mandatory Constraint:** STRICTLY SELF-HOSTED — ZERO SUPABASE / ZERO FIREBASE  
**Status:** RECONCILED & FACTUALLY VERIFIED  

---

## 1. CENTRAL POSTGRESQL 16 ARCHITECTURAL DECISION

In strict compliance with the **Master Implementation Architecture**, NKB Drive operates as an additional enterprise client to NKB Cloud Enterprise v2.1.0. 
- **NO SUPABASE:** No Supabase Database, Auth, Storage, or Realtime.
- **NO FIREBASE:** No Firebase Auth, Firestore, or Cloud Functions.
- **NO DUPLICATE STORAGE:** All file payloads reside on physical volumes managed by NKB Cloud storage agents.
- **SINGLE SOURCE OF TRUTH:** The central PostgreSQL 16 database holds all authoritative folder structures, file metadata, permissions, audit logs, device records, and change journals.

---

## 2. REUSED CORE POSTGRESQL SCHEMAS

The desktop client leverages existing PostgreSQL tables without modifying their definitions, constraints, or existing rows:

### 2.1 Identity & Access Control
- **`users`**:
  - `id` (UUID PK): Authoritative user identifier.
  - `email` (VARCHAR): Login identifier.
  - `password_hash` (VARCHAR): Bcrypt-hashed password.
  - `session_version` (INT): Fail-closed revocation counter. When incremented, instantly revokes all active desktop tokens.
  - `department_id` (INT FK): Primary organizational assignment.
  - `role` (VARCHAR): Role-based access control (`SUPER ADMIN`, `ADMIN`, `USER`, `GUEST`).
  - `status` (VARCHAR): `'ACTIVE'` or `'INACTIVE'`.

- **`departments`**:
  - `id` (INT PK): Department ID.
  - `name` (VARCHAR): Department name (e.g. "IT STAFF", "Engineering", "Finance").
  - `code` (VARCHAR): Organizational shorthand.

- **`file_shares`**:
  - `id` (UUID PK): Unique share record.
  - `folder_id` / `file_id` (UUID FK): Targeted resource.
  - `shared_with_user_id` / `shared_with_department_id` (UUID/INT FK).
  - `permission_level` (VARCHAR): `'VIEWER'`, `'DOWNLOADER'`, `'CONTRIBUTOR'`, `'EDITOR'`.

---

### 2.2 Hierarchical Folder & File Storage
- **`folders`**:
  - `id` (UUID PK): Folder GUID.
  - `name` (VARCHAR): Folder display name.
  - `parent_id` (UUID FK, Nullable): Self-referential tree structure. Root folders have `parent_id IS NULL`.
  - `owner_id` (UUID FK): Creator user ID.
  - `department_id` (INT FK): Enforcing department isolation.
  - `is_shared_drive` (BOOLEAN): Distinction between personal folders and department drives.
  - `is_trashed` (BOOLEAN): Soft-delete flag for Recycle Bin.
  - `preferred_volume_id` (UUID FK): Targeted physical disk partition.

- **`files`**:
  - `id` (UUID PK): Canonical file GUID. Stable across renames and moves.
  - `name` (VARCHAR): Current file name in Explorer.
  - `folder_id` (UUID FK): Containing parent folder.
  - `size_bytes` (BIGINT): File byte length.
  - `sha256_hash` (VARCHAR(64)): Cryptographic content hash for integrity and version check.
  - `storage_volume_id` (UUID FK): Physical volume partition where payload is stored.
  - `relative_path` (VARCHAR): Sanitized storage path on physical volume.
  - `is_trashed` (BOOLEAN): Soft-delete flag.
  - `version` (INT): Monotonic version counter.
  - `created_at` / `updated_at` (TIMESTAMPTZ): Concurrency timestamps.

- **`storage_volumes`**:
  - `id` (UUID PK): Physical drive partition GUID.
  - `assigned_name` (VARCHAR): Human-readable drive label.
  - `current_drive_letter` (VARCHAR): Windows physical drive letter (e.g. `J:\`, `D:\`).
  - `total_capacity_bytes` / `available_free_bytes` (BIGINT): Disk metrics.
  - `status` (VARCHAR): `'ONLINE'`, `'DEGRADED'`, `'DISCONNECTED'`.

- **`audit_logs`**:
  - `id` (BIGINT PK): Monotonic audit log ID.
  - `user_id` (UUID FK): Acting user.
  - `action` (VARCHAR): E.g. `DRIVE_DEVICE_REGISTERED`, `FOLDER_CREATED`, `FILE_TRASHED`.
  - `entity_type` / `entity_id` (VARCHAR / UUID).
  - `details` (JSONB): Structured contextual metadata.
  - `created_at` (TIMESTAMPTZ): Server timestamp.

---

## 3. ADDITIVE DRIVE SCHEMAS (MIGRATION 008)

To support desktop workstation enrollment, change journals, and conflict detection without touching core tables, Migration 008 introduced two additive tables and one sequence:

```sql
-- Monotonic Sequence for Real-Time Change Tracking
CREATE SEQUENCE IF NOT EXISTS drive_change_seq START WITH 1 INCREMENT BY 1;

-- Table 1: Desktop Workstation Registrations
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

-- Table 2: Cursor-Based Incremental Change Journal
CREATE TABLE IF NOT EXISTS drive_change_journal (
    event_id BIGINT PRIMARY KEY DEFAULT nextval('drive_change_seq'),
    event_type VARCHAR(32) NOT NULL, -- 'FILE_CREATED', 'FILE_UPDATED', 'FILE_TRASHED', 'FILE_RESTORED', 'ITEM_RENAMED', 'ITEM_MOVED', 'FOLDER_CREATED', 'CONFLICT_FORKED'
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
```

### 3.1 Rollback Procedure
If required, rolling back Migration 008 is strictly non-destructive to existing data:
```sql
DROP TABLE IF EXISTS drive_change_journal CASCADE;
DROP TABLE IF EXISTS nkb_drive_devices CASCADE;
DROP SEQUENCE IF EXISTS drive_change_seq CASCADE;
```
Core NKB Cloud tables (`files`, `folders`, `users`, etc.) remain completely intact.

---

## 4. LOCAL CLIENT SQLITE SCHEMA (`metadata.db`)

The desktop client requires an ACID-compliant local metadata store for offline operation, optimistic locking, and background sync queues. It uses `C:\Windows\System32\winsqlite3.dll` via P/Invoke.

### 4.1 Schema Definition (7 Local Tables)

```sql
-- 1. Local Cached Files & State
CREATE TABLE IF NOT EXISTS local_files (
    file_id TEXT PRIMARY KEY,
    relative_path TEXT NOT NULL,
    name TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    sync_state TEXT NOT NULL, -- 'ONLINE_ONLY', 'LOCAL_CACHED', 'OFFLINE_PINNED', 'SYNC_PENDING', 'CONFLICT'
    server_updated_at TEXT NOT NULL,
    local_updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_local_files_state ON local_files(sync_state);
CREATE INDEX IF NOT EXISTS idx_local_files_path ON local_files(relative_path);

-- 2. Persistent Sync Queue (Survives Reboots)
CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id TEXT,
    operation TEXT NOT NULL, -- 'UPLOAD', 'DOWNLOAD', 'RENAME', 'MOVE', 'TRASH', 'FOLDER_CREATE'
    local_path TEXT NOT NULL,
    target_path TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_time TEXT,
    status TEXT DEFAULT 'QUEUED', -- 'QUEUED', 'PROCESSING', 'FAILED', 'COMPLETED'
    error_message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);

-- 3. Monotonic Server Sync Cursor
CREATE TABLE IF NOT EXISTS sync_cursor (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_cursor INTEGER NOT NULL DEFAULT 0,
    last_sync_timestamp TEXT NOT NULL
);

-- 4. User Offline Pinned Items
CREATE TABLE IF NOT EXISTS offline_pins (
    item_id TEXT PRIMARY KEY,
    item_type TEXT NOT NULL, -- 'FILE', 'FOLDER'
    pinned_at TEXT NOT NULL,
    pinned_by_user TEXT NOT NULL
);

-- 5. Local Cache Eviction Tracker
CREATE TABLE IF NOT EXISTS local_cache (
    file_id TEXT PRIMARY KEY,
    cache_path TEXT NOT NULL,
    cached_size_bytes INTEGER NOT NULL,
    last_accessed_at TEXT NOT NULL,
    is_dirty INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_local_cache_accessed ON local_cache(last_accessed_at);

-- 6. Sync Conflict Log
CREATE TABLE IF NOT EXISTS sync_conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_file_id TEXT NOT NULL,
    conflict_file_name TEXT NOT NULL,
    base_sha256 TEXT NOT NULL,
    server_sha256 TEXT NOT NULL,
    local_sha256 TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    resolution_status TEXT DEFAULT 'FORKED'
);

-- 7. Local Workstation Device Enrollment State
CREATE TABLE IF NOT EXISTS device_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    device_id TEXT,
    machine_name TEXT,
    hardware_fingerprint TEXT,
    approval_status TEXT,
    target_drive_letter TEXT DEFAULT 'N:',
    last_sync_at TEXT
);
```

---

## 5. RECONCILIATION SUMMARY & INTEGRITY PROOF

| Requirement | Implementation Validation |
| :--- | :--- |
| **No External Database** | Strictly local PostgreSQL 16 on port 5433 and local Windows SQLite. |
| **No Production Mod** | Verified targeting `nkb_drive_staging`. Database `nkb_cloud_staging` untouched. |
| **Zero Table Drop** | Migration 008 is 100% additive. No existing columns altered. |
| **Monotonic Cursors** | `drive_change_seq` guarantees sequential integer cursor ordering. |
| **Backup Verification** | Verified export and successful restoration into disposable verification database. |
