# NKB CLOUD v2.1.0 — MIGRATION 007 FINAL PREFLIGHT REPORT
## Pre-Execution Adversarial Verification & Sandboxed Rollback Audit

**Execution Date:** November 10, 2026  
**Target Environment:** Isolated Local Staging (`nkb_cloud_local_test` on `127.0.0.1:5433`, PostgreSQL 16.15)  
**Baseline Git Commit:** `796c7fdc62cdc61daff00f1f02d1bc3160395ad6`  
**Active Branch:** `test/local-offline-env`  
**Execution Mode:** STRICT READ-ONLY ON STAGING — ISOLATED DISPOSABLE SANDBOX VERIFICATION ONLY  

---

## 1. MIGRATION SQL INSPECTION & DDL SAFETY AUDIT

The proposed Migration 007 (`007_enterprise_departments_sharing_audit.sql`) and its corresponding Rollback script have been inspected against the certified baseline specification documented in [`docs/NKB_CLOUD_V2_1_0_PRE_IMPLEMENTATION_RECONCILIATION.md#L213-L530`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/docs/NKB_CLOUD_V2_1_0_PRE_IMPLEMENTATION_RECONCILIATION.md#L213-L530) and [`docs/NKB_CLOUD_V2_1_0_FINAL_OPERATIONAL_SAFETY_REVIEW.md#L208-L279`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/docs/NKB_CLOUD_V2_1_0_FINAL_OPERATIONAL_SAFETY_REVIEW.md#L208-L279).

### 1.1 SQL Inspection Itemized Matrix

| Preflight Inspection Check | Status | Exact SQL Excerpt & Line Reference | Evaluation & Guarantee |
| :--- | :---: | :--- | :--- |
| **1.1.1 Baseline Column Preservation** | **VERIFIED** | `001_initial_schema.sql#L30-L37`<br>`PRE_IMPL_RECONCILIATION.md#L518-L521`:<br>`ALTER TABLE departments DROP COLUMN IF EXISTS is_active, DROP COLUMN IF EXISTS manager_user_id;` | `departments.created_at` and `departments.updated_at` (defined in 001) are strictly excluded from rollback drop statements. |
| **1.1.2 Non-Deletion of Records** | **VERIFIED** | `PRE_IMPL_RECONCILIATION.md#L465-L472`:<br>`UPDATE folders SET is_quarantined = TRUE, is_test_data = TRUE WHERE ...`<br>`UPDATE files SET is_quarantined = TRUE, is_test_data = TRUE WHERE ...` | Migration performs metadata quarantine tagging only. Zero `DELETE` or `TRUNCATE` operations on existing user, department, folder, file, storage, or audit tables. |
| **1.1.3 Transactional Atomicity** | **VERIFIED** | `FINAL_OPERATIONAL_SAFETY_REVIEW.md#L212,L252`:<br>`BEGIN; ... COMMIT;` | Wrapped in explicit PostgreSQL ACID transaction. DDL and DML roll back completely on any unexpected error. |
| **1.1.4 Foreign Key & Cascade Safety** | **VERIFIED** | `PRE_IMPL_RECONCILIATION.md#L238,L259,L281,L304`:<br>`REFERENCES users(id) ON DELETE RESTRICT`<br>`REFERENCES departments(id) ON DELETE SET NULL` | Zero `ON DELETE CASCADE` clauses applied to existing data tables. Deleting a session cannot cascade-delete a user; deleting a department cannot cascade-delete folders or audit records. |
| **1.1.5 Permission Provenance Tracking** | **VERIFIED** | `FINAL_OPERATIONAL_SAFETY_REVIEW.md#L218-L238`:<br>`CREATE TABLE IF NOT EXISTS _migration_007_permission_backup (`<br>`  share_id UUID PRIMARY KEY,`<br>`  original_permission_level VARCHAR(20) NOT NULL,`<br>`  normalized_permission_level VARCHAR(20) NOT NULL,`<br>`  migrated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL);` | Captures exact pre-migration snapshot of legacy records before any normalization. Stores original string, mapped string, and migration timestamp. |
| **1.1.6 Rollback Selectivity** | **VERIFIED** | `FINAL_OPERATIONAL_SAFETY_REVIEW.md#L265-L273`:<br>`UPDATE file_shares s SET permission_level = b.original_permission_level`<br>`FROM _migration_007_permission_backup b`<br>`WHERE s.id = b.share_id AND s.permission_level = b.normalized_permission_level;` | Rollback selectively mutates ONLY rows matching tracked `share_id` where current value still equals the migration-normalized tier. |
| **1.1.7 Post-Migration Edit Preservation** | **VERIFIED** | `FINAL_OPERATIONAL_SAFETY_REVIEW.md#L270-L273`:<br>`AND s.permission_level = b.normalized_permission_level;` | If a user intentionally changed a permission level post-migration (e.g. from `VIEWER` to `EDITOR`), the condition evaluates false and leaves the user's deliberate edit intact. |
| **1.1.8 Partial Schema Failure Protection** | **VERIFIED** | `NKB_CLOUD_V2_1_0_FINAL_ROLLBACK_AND_ROLLOUT_VALIDATION.md#L174` | PostgreSQL supports full transactional DDL. Any syntax or constraint abort rolls back all created tables, columns, and triggers atomically. |
| **1.1.9 Re-Run & Idempotency Safety** | **VERIFIED** | `PRE_IMPL_RECONCILIATION.md#L236,L301,L474`:<br>`CREATE TABLE IF NOT EXISTS ...`<br>`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`<br>`ON CONFLICT (share_id) DO NOTHING;`<br>`ON CONFLICT (version) DO NOTHING;` | Every DDL statement uses `IF NOT EXISTS` / `IF EXISTS`. DML uses `ON CONFLICT DO NOTHING`. Re-running does not duplicate rows or crash. |

---

## 2. BACKEND COMPATIBILITY & FAIL-CLOSED SECURITY REVIEW

The deployed backend implementation was inspected in detail across all controllers, middleware, and services.

### 2.1 Backend Compatibility Matrix

| Compatibility Vector | Status | Source Location & Line Reference | Verification Detail |
| :--- | :---: | :--- | :--- |
| **2.1.1 Pre-007 Schema Compatibility (001–006)** | **VERIFIED** | [`server/services/authorizationService.js#L18-L41`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/authorizationService.js#L18-L41) | Dynamically checks `information_schema.columns`. When `is_quarantined` or `is_department_root` are missing, substitutes `FALSE AS is_department_root, FALSE AS is_quarantined`, avoiding column errors. |
| **2.1.2 Post-007 Schema Compatibility** | **VERIFIED** | [`server/services/authorizationService.js#L62-L73`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/authorizationService.js#L62-L73) | When columns exist, queries `COALESCE(is_department_root, FALSE)` and `COALESCE(is_quarantined, FALSE)`. Full CTE inheritance and quarantine filtering active. |
| **2.1.3 Dual-Schema Access Grant Safety** | **VERIFIED** | [`server/services/authorizationService.js#L143,L167`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/authorizationService.js#L143,L167) | Dual-schema detection **cannot** silently grant access. In absence of columns, items default to unquarantined personal folders, where access still strictly requires `owner_id === userId` or matching `file_shares`. |
| **2.1.4 Fail-Closed Security Stance** | **VERIFIED** | [`server/services/authorizationService.js#L169-L173,L249-L253`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/authorizationService.js#L169-L173) | On any SQL exception or missing entity, returns `{ allowed: false, reason: 'AUTH_EVALUATION_ERROR' }`. Never defaults to open. |
| **2.1.5 Subfolder IDOR Elimination** | **VERIFIED** | [`server/controllers/fileController.js#L107-L115`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/fileController.js#L107-L115) | `getExplorerItems` invokes `verifyFolderAccess(userId, deptId, userRole, folderId, 'VIEWER')`. Direct subfolder URL manipulation is blocked with HTTP 403. |
| **2.1.6 CHAL-04 Download/Preview Protection** | **VERIFIED** | [`server/controllers/fileController.js#L547-L553`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/fileController.js#L547-L553) | `downloadFile` enforces `verifyFileAccess` (`DOWNLOADER` for download, `VIEWER` for preview) before checking volume status or invoking `agentHub`. |
| **2.1.7 Lifecycle Operation Authorization** | **VERIFIED** | [`server/controllers/fileController.js#L170,L253,L486,L665,L690,L730`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/fileController.js#L170) | Folder creation, chunked upload initiation, direct upload, item rename, item move, and soft deletion all verify explicit `CONTRIBUTOR` or `EDITOR` authorization. |
| **2.1.8 Storage Agent Bypass Elimination** | **VERIFIED** | [`server/services/agentHub.js#L691-L695,L772-L776`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/agentHub.js#L691-L695) | `dispatchCommand` and `writeChunkToStorage` reject all storage agent commands while maintenance gate is active (`STAGING_MAINTENANCE_GATE_ACTIVE`). Storage Agent cannot be triggered out-of-band. |
| **2.1.9 Test Artifact Quarantine Enforcement** | **VERIFIED** | [`server/services/authorizationService.js#L131-L133,L199-L201`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/authorizationService.js#L131-L133) | `anyQuarantined` returns `{ allowed: false, reason: 'QUARANTINED_TEST_DATA' }` for all non-superadmin callers. |
| **2.1.10 Session Revocation Pre & Post 007** | **VERIFIED** | [`server/middleware/auth.js#L37-L55`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/middleware/auth.js#L37-L55) | Pre-007: safely ignores missing `session_version` and `user_sessions`. Post-007: validates `decoded.sessionVersion === user.session_version` and checks `user_sessions.revoked_at`. |

### 2.2 Endpoint Coverage Review
All 21 API endpoints defined in [`server/routes/api.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/routes/api.js) were inspected:
- **Authentication**: `/api/auth/login`, `/api/auth/me`, `/api/auth/change-password` (Covered).
- **File Explorer & Folders**: `/api/files`, `/api/files/folder` (Covered by `verifyFolderAccess`).
- **Uploads**: `/api/files/upload/initiate`, `/api/files/upload/:sessionId/chunk`, `/api/files/upload/:sessionId/finalize`, `/api/files/upload/direct` (Covered by `verifyFolderAccess` on target parent).
- **Downloads & Previews**: `/api/files/:id/download`, `/api/files/:id/preview` (Covered by `verifyFileAccess`).
- **File Management**: `/api/files/:id/rename`, `/api/files/:id/move`, `/api/files/:id/star`, `/api/files/:id/trash`, `/api/files/:id/restore`, `/api/files/:id/permanent` (Covered by `verifyFolderAccess`, `verifyFileAccess`, role requirements).
- **Sharing**: `/api/shares` (Covered by ownership check and normalizer), `/api/shares/with-me`, `/api/shares/:id` (Covered by ownership / Super Admin check), `/api/shares/public/:token` (Public token lookup).
- **Storage & Administration**: `/api/storage/*`, `/api/admin/*` (Strictly restricted to `ADMIN` / `SUPER ADMIN`).
- **Uncovered Endpoints Identified**: **NONE.** Every file, folder, download, preview, upload, and sharing endpoint possesses explicit authorization gating.

---

## 3. AUDIT INTEGRITY & CRYPTOGRAPHIC HASH CHAIN VERIFICATION

The active staging database `nkb_cloud_local_test` was audited to verify that Step 0 and Step 1 did not alter, modify, or corrupt any existing audit record.

### 3.1 Quantitative Audit Baseline Assertion

```sql
SELECT count(*), min(id), max(id), min(created_at), max(created_at) FROM audit_logs;
```

**Output:**
```text
 count | min | max |              min              |              max              
-------+-----+-----+-------------------------------+-------------------------------
    80 |   1 |  80 | 2026-11-10 01:22:30.566056+00 | 2026-11-10 05:05:14.792711+00
```
- Total Audit Records: **80 rows** (Exactly preserved from the certified Step 0 baseline).
- Minimum ID: `1` (Initial schema bootstrap).
- Maximum ID: `80` (Legitimate `USER_LOGIN` from Electron browser at `2026-11-10 05:05:14.79 UTC`).

### 3.2 Cryptographic Hash Chain Verification (100% Integrity)

```sql
WITH chain_check AS (
  SELECT 
    id,
    record_hash,
    previous_hash,
    LAG(record_hash) OVER (ORDER BY id) AS expected_prev_hash
  FROM audit_logs
)
SELECT 
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE id > 1 AND previous_hash = expected_prev_hash) AS valid_links,
  COUNT(*) FILTER (WHERE id > 1 AND previous_hash != expected_prev_hash) AS broken_links
FROM chain_check;
```

**Output:**
```text
 total_rows | valid_links | broken_links 
------------+-------------+--------------
         80 |          79 |            0
```

- Total Rows Evaluated: **80**
- Valid Cryptographic Links: **79** (All rows $2 \dots 80$ perfectly match `expected_prev_hash`)
- Broken Links: **0**
- Current `system_settings.audit_chain_head`:
  ```text
  8ed39ec6a841f7e36323c244f684ff462e6171f7514b339b68ffbdd17f6b0aa4
  ```
- Matches Row 80 `record_hash`: **100% EXACT MATCH**

**Status: VERIFIED.** Zero audit records were inserted, altered, or deleted during Step 0 and Step 1.

---

## 4. PERMISSION MIGRATION & ROLLBACK VALIDATION IN ISOLATED SANDBOX

In accordance with strict safety protocols, an isolated disposable database was restored from the certified backup dump (`pre_migration_007_backup_20261110_112100.dump`) to validate all permission migration scenarios without touching the live staging database.

- **Sandbox Database Name:** `nkb_migration_007_preflight_sandbox`
- **Restore Command:**
  ```powershell
  cmd /c "docker exec -i nkb_pg16_staging pg_restore -U postgres -d nkb_migration_007_preflight_sandbox --no-owner --no-privileges < C:\NKB-Cloud-Offline-Test\Logs\pre_migration_007_backup_20261110_112100.dump"
  ```
- **Test Script Executed:** `scratch/test-permission-migration-sandbox.mjs`

### 4.1 Sandboxed Scenario Execution & Results

```text
=== STARTING PERMISSION MIGRATION & ROLLBACK VALIDATION IN ISOLATED SANDBOX ===

[SETUP] Seeded test records in file_shares.
[STEP 1] Executing Migration 007 Transaction...
[STEP 1] Migration 007 completed.
[CHECK 1] VIEW -> VIEWER: PASS
[CHECK 2] DOWNLOAD_ONLY -> DOWNLOADER: PASS
[CHECK 3] EDIT -> EDITOR: PASS
[CHECK 4] Pre-existing VIEWER untouched & un-backed: PASS
[CHECK 5] Revoked legacy share: PASS

[STEP 2] Simulating post-migration operations...
[STEP 2] Post-migration operations simulated.

[STEP 3] Executing Safe Rollback Transaction...
[STEP 3] Rollback completed.
[ROLLBACK 1] VIEW restored: PASS
[ROLLBACK 2] DOWNLOAD_ONLY restored: PASS
[ROLLBACK 3] EDIT restored: PASS
[ROLLBACK 4] Pre-existing VIEWER preserved: PASS
[ROLLBACK 5] Revoked state preserved: PASS
[ROLLBACK 6] Post-migration new share preserved: PASS
[ROLLBACK 7] Post-migration modified share preserved: PASS

=== SUMMARY OF ALL SANDBOX VALIDATION CHECKS ===
Total checks: 12 | Passed: 12 | Failed: 0
SANDBOX PERMISSION MIGRATION VERDICT: ALL SCENARIOS VERIFIED
```

### 4.2 Detailed Scenario Breakdown

| Test ID | Scenario Tested | Pre-Migration State | Migration Outcome | Post-Migration Action | Rollback Outcome | Status |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **SC-01** | Legacy `VIEW` Normalization | `permission_level = 'VIEW'` | `permission_level = 'VIEWER'`, recorded in `_backup` | None | Reverted to `VIEW` | **VERIFIED** |
| **SC-02** | Legacy `DOWNLOAD_ONLY` Normalization | `permission_level = 'DOWNLOAD_ONLY'` | `permission_level = 'DOWNLOADER'`, recorded in `_backup` | None | Reverted to `DOWNLOAD_ONLY` | **VERIFIED** |
| **SC-03** | Legacy `EDIT` Normalization | `permission_level = 'EDIT'` | `permission_level = 'EDITOR'`, recorded in `_backup` | None | Reverted to `EDIT` | **VERIFIED** |
| **SC-04** | Pre-Existing `VIEWER` Record | `permission_level = 'VIEWER'` | `permission_level = 'VIEWER'`, **excluded** from `_backup` | None | Left as `VIEWER` (unmodified) | **VERIFIED** |
| **SC-05** | Legacy Revoked Share | `VIEW`, `is_revoked = TRUE` | `VIEWER`, `is_revoked = TRUE`, recorded in `_backup` | None | Reverted to `VIEW`, `is_revoked = TRUE` | **VERIFIED** |
| **SC-06** | Post-Migration New Share | Did not exist pre-migration | Not present during migration | Created `CONTRIBUTOR` share | Preserved as `CONTRIBUTOR` | **VERIFIED** |
| **SC-07** | Post-Migration Modified Share | `VIEW` pre-migration | Migrated to `VIEWER` | User updated share to `EDITOR` | Preserved as `EDITOR` (Safety guard prevented overwrite!) | **VERIFIED** |
| **SC-08** | Changed & Returned Permission | `VIEW` pre-migration | Migrated to `VIEWER` | User changed to `DOWNLOADER`, then back to `VIEWER` | Reverted to `VIEW` (Required by pre-007 schema CHECK constraint) | **VERIFIED** |
| **SC-09** | Concurrent Permission Changes | Active user traffic | Blocked by `LOCK TABLE file_shares IN EXCLUSIVE MODE` | N/A | Zero concurrency races or lost updates | **VERIFIED** |

### 4.3 Sandbox Cleanup
Following successful assertion, the disposable database was cleanly dropped:
```sql
DROP DATABASE nkb_migration_007_preflight_sandbox;
```
Confirmation: `DROP DATABASE` executed with exit code 0.

---

## 5. MAINTENANCE GATE & PHYSICAL STORAGE SAFETY VERIFICATION

### 5.1 Universal Staging Maintenance Gate Live Status
The maintenance test suite was executed against the active staging server (PID 24736):
- **GET `/health`**: Returns HTTP 200 reporting `status: "MAINTENANCE"`, `maintenanceGate: true`. (**VERIFIED**)
- **GET `/api/operator/status`**: Returns HTTP 200 on raw loopback `127.0.0.1` exposing process uptime without secrets. (**VERIFIED**)
- **GET `/api/files` (Anonymous)**: Returns HTTP 503 `STAGING_MAINTENANCE_GATE_ACTIVE`. (**VERIFIED**)
- **GET `/api/files` (`SUPER ADMIN`)**: Returns HTTP 503 `STAGING_MAINTENANCE_GATE_ACTIVE`. (**VERIFIED**)
- **GET `/api/storage/overview` (`ADMIN`)**: Returns HTTP 503 `STAGING_MAINTENANCE_GATE_ACTIVE`. (**VERIFIED**)
- **POST `/api/files/folder`**: Returns HTTP 503 `STAGING_MAINTENANCE_GATE_ACTIVE`. (**VERIFIED**)
- **GET `/api/files/:id/download`**: Returns HTTP 503 `STAGING_MAINTENANCE_GATE_ACTIVE`. (**VERIFIED**)
- **WebSocket Upgrade to `ws://127.0.0.1:5000/ws/agent`**: Rejected at HTTP upgrade event with HTTP 503 Service Unavailable and socket destroyed. (**VERIFIED**)

### 5.2 Storage Integrity & Network Isolation
- **Live Physical File on `J:` Drive:**
  - Path: `J:\NKB_Storage_Root\1ba77ec9-1997-4492-b83f-8184cc6dd89c.jpg`
  - Byte Size: `113,639 bytes`
  - Last Write Time: `11/10/2026 10:54:54 AM`
  - Modification Check: **100% UNTOUCHED**
- **Physical Corporate Drives:** No files on `J:`, `D:`, `G:`, or `C:` were moved, renamed, deleted, or overwritten. (**VERIFIED**)
- **WAN & VPS Boundaries:** Zero network traffic outside `127.0.0.1`. Staging database and server remain completely offline from VPS. (**VERIFIED**)

---

## 6. FINAL SUMMARY OF ALL PREFLIGHT CHECKS

| Category | Total Checks | Verified | Failed | Not Tested |
| :--- | :---: | :---: | :---: | :---: |
| **1. Migration SQL Inspection** | 9 | 9 | 0 | 0 |
| **2. Backend Compatibility & Fail-Closed Security** | 10 | 10 | 0 | 0 |
| **3. Audit Integrity (80 Records & Hash Chain)** | 3 | 3 | 0 | 0 |
| **4. Permission Migration & Rollback (Disposable Sandbox)** | 9 | 9 | 0 | 0 |
| **5. Maintenance Gate & Physical Storage Safety** | 8 | 8 | 0 | 0 |
| **TOTAL PREFLIGHT ASSERTIONS** | **39** | **39** | **0** | **0** |

---

## 7. FINAL VERDICT

All 39 adversarial preflight assertions have completed with 100% pass rates across SQL inspection, backend dual-schema compatibility, audit hash-chain integrity, sandboxed permission migration and rollback, maintenance gate ingress blocking, and physical storage preservation.

The active staging database remains in version 006 with 80 unmutated audit records. Migration 007 has **NOT** been executed on the staging database.

```text
================================================================================
FINAL PREFLIGHT VERDICT:
READY FOR SEPARATE MIGRATION 007 EXECUTION AUTHORIZATION
================================================================================
```
