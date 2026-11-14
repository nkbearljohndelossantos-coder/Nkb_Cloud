# NKB CLOUD v2.1.0 — INDEPENDENT EVIDENCE CHALLENGE & READINESS AUDIT

**Audit Reference:** `docs/ENTERPRISE_IMPLEMENTATION_EVIDENCE_PACKAGE.md`  
**Auditor Roles:** Principal Software Architect, PostgreSQL Security Auditor, Application Security Reviewer  
**Audit Standard:** Strict Read-Only Evidence Challenge  
**Target Environment:** Local Offline Staging (Windows 11 Loopback `127.0.0.1`, PostgreSQL 16 on Port 5433)  
**Database:** `nkb_cloud_local_test`  
**Git Branch / Commit:** `test/local-offline-env` / Commit `796c7fd`  
**Audit Date:** November 2026  
**Final Status Determination:** **NOT VERIFIED — DO NOT AUTHORIZE IMPLEMENTATION**

---

## 1. Executive Summary

An adversarial independent challenge was performed against every "VERIFIED" claim asserted in the previous evidence package. 

Under the **Seven Critical Verification Rules**:
1. *A drafted SQL script is NOT equivalent to an implemented database feature.*
2. *A syntactically validated SQL script is NOT proof of successful execution.*
3. *A proposed function is NOT proof that an API endpoint calls it.*
4. *A security design is NOT proof of an enforced security boundary.*
5. *A current row count is NOT proof of historical data preservation without a reliable baseline.*
6. *A read-only inspection is NOT proof that physical files were never modified.*
7. *A test that was not executed must be marked NOT TESTED.*

### Critical Findings Uncovered by This Challenge:
1. **CRITICAL — Rollback Script Causes Pre-Existing Data Loss**:
   The proposed `007_enterprise_departments_sharing_audit_rollback.sql` contains:
   `ALTER TABLE departments DROP COLUMN IF EXISTS created_at, DROP COLUMN IF EXISTS updated_at;`
   Inspection of `server/db/migrations/001_initial_schema.sql` (lines 35-36) proves that `created_at` and `updated_at` are **pre-existing baseline columns from Migration 001**. Executing this rollback would irreversibly destroy historical department timestamps!
2. **HIGH — Trigger Hash Nullification Bug in Proposed Migration 007**:
   In `compute_login_audit_hash_chain()` and `compute_file_activity_hash_chain()`, string concatenation with `||` does not completely wrap all nullable fields (`NEW.ip_address`, `NEW.failure_reason`, `NEW.result`) in `COALESCE`. In PostgreSQL, `'text' || NULL` yields `NULL`. An audit record inserted with any null parameter will compute a `NULL` hash digest, corrupting the cryptographic hash chain!
3. **HIGH — Frontend-Backend Permission Mismatch (Check Constraint Failure)**:
   The proposed migration adds `CHECK (permission_level IN ('VIEWER', 'DOWNLOADER', 'CONTRIBUTOR', 'EDITOR'))`. However, the active frontend component [`client/src/components/ShareModal.jsx`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/client/src/components/ShareModal.jsx#L77-L79) emits legacy string values `'VIEW'`, `'EDIT'`, and `'DOWNLOAD_ONLY'`. Applying Migration 007 as currently proposed will cause all folder sharing operations in the UI to immediately fail with database constraint violations!
4. **HIGH — Proposed Security Boundary `verifyFileAccess` Does Not Exist in Live Code**:
   Inspection of [`server/controllers/fileController.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/fileController.js#L513-L525) reveals that `downloadFile` currently does **not** verify whether the requesting user owns the file or holds an active share. The proposed `verifyFileAccess` function was described in documentation but has **zero executable implementation** in the repository.

Because these critical and high-risk defects remain unresolved in the drafted migration and application design, authorization **must be withheld** until the required corrections are applied.

---

## 2. Files and Database Objects Inspected

### 2.1 Codebase & Schema Files Inspected
- Migration 001 Baseline: [`server/db/migrations/001_initial_schema.sql`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/migrations/001_initial_schema.sql#L30-L55)
- Migration 004 Protection: [`server/db/migrations/004_audit_log_protection.sql`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/migrations/004_audit_log_protection.sql)
- Migration 005 Concurrency: [`server/db/migrations/005_audit_chain_concurrency_and_privilege_hardening.sql`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/migrations/005_audit_chain_concurrency_and_privilege_hardening.sql)
- File Controller: [`server/controllers/fileController.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/fileController.js)
- Share Modal Component: [`client/src/components/ShareModal.jsx`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/client/src/components/ShareModal.jsx#L70-L81)
- Authentication Middleware: [`server/middleware/auth.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/middleware/auth.js)
- Admin Controller: [`server/controllers/adminController.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/adminController.js)

### 2.2 Live Database Objects Inspected (`nkb_cloud_local_test`)
- Migration Registry: `schema_migrations` (rows 001 through 006)
- System Settings: `system_settings` (`audit_chain_head`)
- Live Tables: `users` (1 row), `departments` (6 rows), `folders` (20 rows), `files` (0 rows), `audit_logs` (70 rows), `storage_devices` (38 rows), `storage_volumes` (12 rows).

---

## 3. Independent Challenge of "VERIFIED" Claims

### Challenge 1: Migration Registry & Migration 007 Status
- **Claimed**: Migration 007 is unique, collision-free, and ready for deployment.
- **Challenge Finding**: **SUPPORTED WITH LIVE EVIDENCE**.
  - Query: `SELECT * FROM schema_migrations WHERE version = '007';` returns 0 rows.
  - `server/db/migrations/` contains files up to `006_stage2_security_hardening.sql`. Version 007 is genuinely unallocated.
- **Status**: **VERIFIED**.

---

### Challenge 2: Complete Migration 007 SQL & Rollback Safety
- **Claimed**: Migration 007 and rollback scripts are verified and completely safe for execution.
- **Challenge Finding**: **CHALLENGED — CRITICAL DEFECTS IDENTIFIED**.
  1. *Baseline Column Dropping (Data Loss)*:
     The rollback script specifies:
     ```sql
     ALTER TABLE departments DROP COLUMN IF EXISTS created_at, DROP COLUMN IF EXISTS updated_at;
     ```
     `departments.created_at` and `departments.updated_at` are defined in `001_initial_schema.sql` (lines 35-36). Executing the rollback would permanently drop historical columns from the Stage 1 baseline!
  2. *Trigger Hash Nullification Bug*:
     In `007_enterprise_departments_sharing_audit.sql`, the hash chain trigger computes:
     ```sql
     payload := COALESCE(NEW.user_id::text, '') || '|' ||
                NEW.username_attempted || '|' ||
                NEW.event_type || '|' ||
                COALESCE(NEW.failure_reason, '') || '|' ||
                NEW.ip_address || '|' || ...
     ```
     If `NEW.ip_address` or `NEW.username_attempted` is `NULL`, PostgreSQL's `||` operator returns `NULL` for the entire expression. `encode(digest(NULL, 'sha256'), 'hex')` returns `NULL`, silently breaking the cryptographic chain!
- **Status**: **NOT VERIFIED — DEFECTS REQUIRE CORRECTION**.

---

### Challenge 3: Privilege Escalation Prevention in Sharing
- **Claimed**: Database check constraint guarantees system roles cannot be granted via folder shares.
- **Challenge Finding**: **CHALLENGED — FRONTEND INCOMPATIBILITY**.
  - The proposed constraint is:
    ```sql
    CHECK (permission_level IN ('VIEWER', 'DOWNLOADER', 'CONTRIBUTOR', 'EDITOR'))
    ```
  - However, in `client/src/components/ShareModal.jsx` (lines 77-79), the form options are:
    ```jsx
    <option value="VIEW">Viewer</option>
    <option value="EDIT">Editor</option>
    <option value="DOWNLOAD_ONLY">Download Only</option>
    ```
  - If a user shares a folder in the current UI, the frontend sends `'VIEW'` or `'DOWNLOAD_ONLY'`. PostgreSQL will reject the transaction with a `CHECK_VIOLATION` error (`chk_file_shares_perm_level`).
  - While privilege escalation to `ADMIN` is successfully blocked by the constraint, standard user sharing is broken until the frontend or API layer normalizes legacy values.
- **Status**: **PARTIALLY VERIFIED — REQUIRES COMPATIBILITY MAPPING**.

---

### Challenge 4: All Three Audit Streams Implementation
- **Claimed**: Three-stream cryptographic audit logging is verified.
- **Challenge Finding**: **CHALLENGED — STREAMS 2 AND 3 DO NOT EXIST IN LIVE DATABASE**.
  - Stream 1 (`audit_logs`): **Fully implemented & active** (70 rows verified in staging, append-only trigger active, `audit_chain_head` updating).
  - Stream 2 (`login_audit_events`): Table does not exist in PostgreSQL. Trigger does not exist.
  - Stream 3 (`file_activity_events`): Table does not exist in PostgreSQL. Trigger does not exist.
  - Applying Rule 1 (*"A drafted SQL script is NOT equivalent to an implemented database feature"*): Streams 2 and 3 are **DRAFTED SPECIFICATIONS ONLY**.
- **Status**: **NOT IMPLEMENTED IN LIVE DATABASE (DRAFTED ONLY)**.

---

### Challenge 5: Session Revocation & Token Fingerprint Verification
- **Claimed**: Two-tier session revocation is enforced on every protected request.
- **Challenge Finding**: **CHALLENGED — NOT IMPLEMENTED IN LIVE CODE**.
  - In `server/middleware/auth.js`:
    - Lines 28-32 verify `user.status !== 'ACTIVE'`. This is currently active.
    - `session_version` is **never checked** in `auth.js`.
    - `token_fingerprint` lookup in `user_sessions` does **not exist** in `auth.js`.
    - Table `user_sessions` does not exist in the database.
  - Applying Rule 4 (*"A security design is NOT proof of an enforced security boundary"*): Session revocation cannot be marked "VERIFIED" until implemented in code and tested.
- **Status**: **NOT IMPLEMENTED IN LIVE CODE (DRAFTED ONLY)**.

---

### Challenge 6: Permission Inheritance & `verifyFileAccess` Enforcement
- **Claimed**: `verifyFileAccess` protects every download, preview, listing, and Storage Agent execution path.
- **Challenge Finding**: **CHALLENGED — CRITICAL SECURITY GAP IN CURRENT CODEBASE**.
  - Inspection of `server/controllers/fileController.js` proves:
    - Function `verifyFileAccess` **does not exist anywhere in the file**.
    - In `downloadFile` (lines 518-522):
      ```javascript
      const fileRes = await db.query('SELECT * FROM files WHERE id = $1', [id]);
      if (!fileRes.rows || !fileRes.rows[0]) return res.status(404).json({ error: 'File record not found' });
      const file = fileRes.rows[0];
      ```
    - The endpoint only verifies if the file exists and if the storage volume is ONLINE. It **never checks** if `req.user.id === file.owner_id` or if a share exists in `file_shares`!
    - Any authenticated user can download any file by UUID.
  - Applying Rule 3 (*"A proposed function is NOT proof that an API endpoint calls it"*): `verifyFileAccess` is completely unverified in executable code.
- **Status**: **NOT IMPLEMENTED IN LIVE CODE (UNENFORCED)**.

---

### Challenge 7: My Drive Quarantine Filtering
- **Claimed**: My Drive excludes the 20 test folders.
- **Challenge Finding**: **CHALLENGED — NOT YET ACTIVE IN LIVE CODE OR DATABASE**.
  - In the live database: `folders` table does **not** have an `is_quarantined` or `is_test_data` column.
  - In `server/controllers/fileController.js` (line 102):
    ```javascript
    folderQuery += ' AND parent_id IS NULL AND is_shared_drive = FALSE AND owner_id = $1';
    ```
  - The query does not filter by quarantine flags. The 20 test folders are still actively returned in the live UI until Migration 007 and the controller update are applied.
- **Status**: **NOT IMPLEMENTED IN LIVE CODE (PENDING IMPLEMENTATION)**.

---

### Challenge 8: Data Preservation & Baseline Row Counts
- **Claimed**: 20 test folders, 70 audit logs, and storage identities are preserved.
- **Challenge Finding**: **SUPPORTED WITH LIVE EVIDENCE**.
  - Current live query on `nkb_cloud_local_test`:
    - `folders`: 20 rows (10 `Offline_Test_Folder`, 10 `Subfolder_Alpha`).
    - `audit_logs`: 70 rows (Hash chain verified from genesis to latest head `de013ac9...`).
    - `storage_devices`: 38 records with `VERIFIED` identity confidence.
    - `storage_volumes`: 12 records with active drive assignments (`J:`, `D:`, `G:`).
    - Physical drives `J:`, `D:`, and `G:` contain intact corporate directories.
  - Applying Rule 5: Because we have the exact database dump from prior stages and read-only query evidence, the baseline is empirically confirmed.
- **Status**: **VERIFIED BASELINE CONFIRMED**.

---

## 4. Unresolved Risk Register & Required Corrections

| Finding ID | Severity | File / Object | Description of Defect | Mandatory Correction Required |
|---|:---:|---|---|---|
| **CHAL-01** | **CRITICAL** | `007_rollback.sql` | Rollback drops baseline columns `created_at`, `updated_at` from `departments`. | Remove `DROP COLUMN IF EXISTS created_at, DROP COLUMN IF EXISTS updated_at` from `departments` rollback block. |
| **CHAL-02** | **HIGH** | `007_migration.sql` | Uncoalesced `||` concatenations in hash triggers produce `NULL` record hashes on nullable fields. | Wrap every operand in `COALESCE(NEW.field, '')` or use `concat_ws('\|', ...)` in `compute_login_audit_hash_chain` and `compute_file_activity_hash_chain`. |
| **CHAL-03** | **HIGH** | `007_migration.sql` & `ShareModal.jsx` | `chk_file_shares_perm_level` rejects frontend values (`VIEW`, `EDIT`, `DOWNLOAD_ONLY`). | Add normalization mapping in `shareController.js` (`VIEW -> VIEWER`, `DOWNLOAD_ONLY -> DOWNLOADER`, `EDIT -> EDITOR`) and update `ShareModal.jsx` options. |
| **CHAL-04** | **HIGH** | `fileController.js` | `downloadFile` and `preview` currently lack authorization checks; `verifyFileAccess` is absent. | Implement `verifyFileAccess` helper and bind it to all file routes before invoking Storage Agent. |
| **CHAL-05** | **MEDIUM** | `auth.js` | `session_version` and token fingerprint checks are absent from middleware. | Add `session_version` integer comparison and `user_sessions` validation to `authenticateToken`. |

---

## 5. Corrected Migration 007 & Rollback SQL

To eliminate CHAL-01 and CHAL-02, the SQL scripts must be revised as follows:

### 5.1 Corrected `007_enterprise_departments_sharing_audit.sql` (Extract of Fixed Triggers)
```sql
-- Fixed: Use concat_ws to guarantee NULL operands never nullify the entire payload
CREATE OR REPLACE FUNCTION compute_login_audit_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash VARCHAR(64);
    payload TEXT;
BEGIN
    SELECT setting_value INTO prev_hash
    FROM system_settings
    WHERE setting_key = 'login_audit_chain_head'
    FOR UPDATE;

    IF prev_hash IS NULL THEN
        prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
    END IF;

    NEW.previous_hash := prev_hash;
    payload := concat_ws('|',
        COALESCE(NEW.user_id::text, ''),
        COALESCE(NEW.username_attempted, ''),
        COALESCE(NEW.event_type, ''),
        COALESCE(NEW.failure_reason, ''),
        COALESCE(NEW.ip_address, ''),
        COALESCE(NEW.created_at::text, CURRENT_TIMESTAMP::text),
        NEW.previous_hash
    );
    NEW.record_hash := encode(digest(payload, 'sha256'), 'hex');

    UPDATE system_settings
    SET setting_value = NEW.record_hash, updated_at = CURRENT_TIMESTAMP
    WHERE setting_key = 'login_audit_chain_head';

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION compute_file_activity_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash VARCHAR(64);
    payload TEXT;
BEGIN
    SELECT setting_value INTO prev_hash
    FROM system_settings
    WHERE setting_key = 'file_activity_chain_head'
    FOR UPDATE;

    IF prev_hash IS NULL THEN
        prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
    END IF;

    NEW.previous_hash := prev_hash;
    payload := concat_ws('|',
        COALESCE(NEW.actor_user_id::text, ''),
        COALESCE(NEW.action, ''),
        COALESCE(NEW.entity_type, ''),
        COALESCE(NEW.entity_id::text, ''),
        COALESCE(NEW.result, ''),
        COALESCE(NEW.created_at::text, CURRENT_TIMESTAMP::text),
        NEW.previous_hash
    );
    NEW.record_hash := encode(digest(payload, 'sha256'), 'hex');

    UPDATE system_settings
    SET setting_value = NEW.record_hash, updated_at = CURRENT_TIMESTAMP
    WHERE setting_key = 'file_activity_chain_head';

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;
```

### 5.2 Corrected `007_enterprise_departments_sharing_audit_rollback.sql` (Fixed Data Preservation)
```sql
BEGIN;

-- 1. DROP AUDIT TRIGGERS & FUNCTIONS CREATED IN 007
DROP TRIGGER IF EXISTS trg_prevent_login_audit_mutation ON login_audit_events;
DROP TRIGGER IF EXISTS trg_compute_login_audit_hash_chain ON login_audit_events;
DROP FUNCTION IF EXISTS compute_login_audit_hash_chain();
DROP FUNCTION IF EXISTS prevent_login_audit_mutation();

DROP TRIGGER IF EXISTS trg_prevent_file_activity_mutation ON file_activity_events;
DROP TRIGGER IF EXISTS trg_compute_file_activity_hash_chain ON file_activity_events;
DROP FUNCTION IF EXISTS compute_file_activity_hash_chain();
DROP FUNCTION IF EXISTS prevent_file_activity_mutation();

-- 2. DROP TABLES CREATED IN 007
DROP TABLE IF EXISTS file_activity_events;
DROP TABLE IF EXISTS login_audit_events;
DROP TABLE IF EXISTS user_sessions;

-- 3. REMOVE ONLY CONSTRAINTS & COLUMNS INTRODUCED IN 007
ALTER TABLE file_shares DROP CONSTRAINT IF EXISTS chk_file_shares_perm_level;
ALTER TABLE file_shares DROP CONSTRAINT IF EXISTS chk_file_shares_target;
ALTER TABLE file_shares DROP COLUMN IF EXISTS sharing_note, DROP COLUMN IF EXISTS revoked_at, DROP COLUMN IF EXISTS revoked_by;

ALTER TABLE files DROP COLUMN IF EXISTS is_quarantined, DROP COLUMN IF EXISTS is_test_data;
ALTER TABLE folders DROP COLUMN IF EXISTS is_department_root, DROP COLUMN IF EXISTS is_quarantined, DROP COLUMN IF EXISTS is_test_data;

-- FIXED: Do NOT drop created_at and updated_at on departments (they belong to Migration 001)
ALTER TABLE departments DROP COLUMN IF EXISTS is_active, DROP COLUMN IF EXISTS manager_user_id;
ALTER TABLE users DROP COLUMN IF EXISTS session_version, DROP COLUMN IF EXISTS is_department_head;

-- 4. CLEANUP SYSTEM SETTINGS HEAD POINTERS
DELETE FROM system_settings WHERE setting_key IN ('login_audit_chain_head', 'file_activity_chain_head');

-- 5. UNREGISTER MIGRATION 007
DELETE FROM schema_migrations WHERE version = '007';

COMMIT;
```

---

## 6. Final Authorization Recommendation

# **FINAL STATUS: NOT VERIFIED — DO NOT AUTHORIZE IMPLEMENTATION**

### Justification:
1. **Rule 1 & 2 Enforced**: Migration 007 is drafted, not executed. Critical defects exist in the drafted triggers (`NULL` hash payload on nullable columns) and rollback script (accidental deletion of Migration 001 columns).
2. **Rule 3 & 4 Enforced**: `verifyFileAccess` and `session_version` validation are documented designs that currently have **zero executable code** in `fileController.js` and `auth.js`.
3. **Incompatibility Barrier**: The frontend UI is out of sync with the proposed `chk_file_shares_perm_level` constraint.
4. **Safety Mandate**: In accordance with the prompt's explicit instruction (*"If any critical or high-risk issue remains unresolved, or necessary evidence is unavailable: Choose: NOT VERIFIED — DO NOT AUTHORIZE IMPLEMENTATION"*), authorization must be withheld until the administrator reviews and approves the four mandatory corrections detailed above.

**Strict Read-Only Mode Status**: 100% Maintained. No database schema changes, code alterations, or file operations have been performed.
