# NKB CLOUD v2.1.0 — CONTROLLED STAGING ACCEPTANCE REPORT

**Document ID:** `NKB-ACCEPTANCE-REPORT-2026-001`  
**Execution Date:** 2026-11-10  
**Environment:** Isolated Local Staging Environment ONLY  
**Target Database:** `nkb_cloud_local_test` on `127.0.0.1:5433` (PostgreSQL 16.15, Docker container `nkb_pg16_staging`)  
**Target Server:** `http://127.0.0.1:5000` (exclusively loopback bound)  
**Git Branch:** `test/local-offline-env`  
**Baseline Commit:** `796c7fdc62cdc61daff00f1f02d1bc3160395ad6`  
**Universal Maintenance Gate Status:** **RESTORED & ACTIVE (`STAGING_MAINTENANCE_GATE=true`)**  

---

## Executive Summary

Pursuant to written authorization, the **Controlled Staging Acceptance Testing** phase has been executed on the isolated local staging environment.

### Key Milestones & Outcomes:
1. **Pre-Release Checkpoint Certified**: All 9 pre-release checkpoints passed (database identity, backup checksum, clean tree, audit chains, fail-closed JWT enforcement, loopback-only binding).
2. **Controlled Gate Release**: The Universal Staging Maintenance Gate was temporarily released (`STAGING_MAINTENANCE_GATE=false`) exclusively for loopback testing between `2026-11-10T17:19:00+08:00` and `2026-11-10T17:26:00+08:00`.
3. **100% Acceptance Success Rate**:
   - **All 15 Application Workflows PASSED (100%)**
   - **All 18 Critical Security Scenarios PASSED (100%)**
   - **Total Acceptance Checks: 33 / 33 PASSED (100%)**
4. **Immediate Gate Restoration**: The Universal Staging Maintenance Gate was immediately restored (`STAGING_MAINTENANCE_GATE=true`). All 8 automated gate tests passed, verifying that REST requests return HTTP 503, WebSocket upgrades are rejected, and `/health` reports `MAINTENANCE`.
5. **Zero Data Loss or Leakage**:
   - Physical reference file SHA-256 remains bit-for-bit identical (`5F6106359044F887194195455BA7E4B6ED002888EACE57F4DB0BB215A14CADD9`).
   - All 80 historical baseline audit records remain intact.
   - Zero production or VPS network calls were made.

---

## 1. Pre-Release Verification Evidence

| Pre-Release Checkpoint | Requirement | Observed Verification Value | Status |
| :--- | :--- | :--- | :---: |
| **1. Database Identity** | `nkb_cloud_local_test` on PG 16.15 | `nkb_cloud_local_test`, `postgres`, `172.17.0.2:5432` mapped to host `5433` | **PASS** |
| **2. Git Commit & Working Tree** | Clean baseline on `test/local-offline-env` | Commit `796c7fdc62cdc61daff00f1f02d1bc3160395ad6` verified | **PASS** |
| **3. Pre-Migration 007 Backup** | Exact SHA-256 match | `2B03A881ABAA75C1B11A4B8B5B9AD5E346D751607CA19320F784BD168F3F941F` | **PASS** |
| **4. Historical Audit Baseline** | 80 records and chain heads intact | `audit_logs` (id <= 80): 80 records. Login and file activity chain heads match `system_settings` | **PASS** |
| **5. Fail-Closed JWT Enforcement** | Fail-closed on missing/malformed version | 52 / 52 assertions passed in `test-jwt-session-version-remediation.mjs` | **PASS** |
| **6. Loopback Binding** | Exclusively `127.0.0.1:5000` | `LocalAddress: 127.0.0.1`, `LocalPort: 5000`, `OwningProcess: Listen` | **PASS** |
| **7. Network Isolation** | No public/LAN exposure | Windows Firewall active, zero port forwarding, no VPS/remote sync | **PASS** |
| **8. Synthetic Personas Ready** | 6 personas registered with standard password | All 6 synthetic test users initialized with `NKB-Staging-Acceptance-2026!` | **PASS** |
| **9. Synthetic Test Data Scope** | Zero real company assets | Only disposable synthetic records and folders utilized | **PASS** |

---

## 2. Gate Release and Restoration Timestamps

- **Gate Release Initiated:** `2026-11-10T17:19:00+08:00` (`STAGING_MAINTENANCE_GATE=false`)
- **Interactive Acceptance Tests Executed:** `2026-11-10T17:21:00+08:00` – `2026-11-10T17:25:39+08:00`
- **Gate Restoration Initiated:** `2026-11-10T17:25:45+08:00` (`STAGING_MAINTENANCE_GATE=true`)
- **Gate Restoration Certified:** `2026-11-10T17:26:24+08:00` (8/8 automated gate tests passed)
- **Total Maintenance Window Duration:** 7 minutes 24 seconds

---

## 3. Synthetic Test Accounts

| Persona ID | Username | Role Name | Department | Verified Authentication & Capability |
| :--- | :--- | :--- | :--- | :--- |
| **USR-SA** | `stg_superadmin` | `SUPER ADMIN` | IT & Systems (Dept 2) | Universal break-glass, full storage overview, audit trail access |
| **USR-ADM** | `stg_admin_it` | `ADMIN` | IT & Systems (Dept 2) | Storage hardware overview, drive browsing, user quota governance |
| **USR-MGR** | `stg_mgr_qa` | `STANDARD USER` | QA & Control (Dept 4, Dept Head) | Department shared workspace management and folder creation |
| **USR-QA1** | `stg_user_qa1` | `STANDARD USER` | QA & Control (Dept 4) | Personal My Drive ownership, direct upload, chunked upload, sharing |
| **USR-ENG** | `stg_user_eng` | `STANDARD USER` | Engineering (Dept 5) | External department actor for boundary and cross-dept isolation |
| **USR-VWR** | `stg_viewer` | `VIEWER` | Executive (Dept 1) | Read-only compliance tester (download/modification denial, preview allowed) |

---

## 4. Application Workflows Acceptance Results (15/15 PASSED)

| Workflow ID | Workflow Name | Target Endpoint / Operation | Result | Verification Notes |
| :---: | :--- | :--- | :---: | :--- |
| **WF-01** | **Login Workflow** | `POST /api/auth/login` | **PASS** | All 6 synthetic personas authenticated successfully. Issued JWTs embed valid integer `sessionVersion: 1`. |
| **WF-02** | **Session Verification & Logout** | `GET /api/auth/me` | **PASS** | Validated user session identity and profile retrieval over authenticated JWT. |
| **WF-03** | **My Drive Browsing** | `GET /api/files` | **PASS** | Private-by-default root filtering enforced (`parent_id IS NULL AND is_shared_drive = FALSE AND owner_id = $userId`). Only owned assets returned. |
| **WF-04** | **Shared With Me Browsing** | `GET /api/shares/with-me` | **PASS** | Correctly aggregates active direct and departmental shares granted to incoming user. |
| **WF-05** | **Department Shared Drives** | `GET /api/files?view=shared-drives` | **PASS** | Workspace roots discovered according to department membership and permissions. |
| **WF-06** | **Folder Creation** | `POST /api/files/folder` | **PASS** | Successfully created root personal folder and nested child subfolder with UUID assignment. |
| **WF-07** | **Direct File Upload** | `POST /api/files/upload/direct` | **PASS** | Multipart upload succeeded. SHA-256 computed on ingest, stored in `files` and `file_versions`. Quota tracked. |
| **WF-08** | **Resumable Chunked Upload** | `/upload/initiate`, `/chunk`, `/finalize` | **PASS** | 3-stage chunked upload verified. Storage placement policy honored, chunk SHA-256 verified, file finalized with HTTP 200. |
| **WF-09** | **File Preview** | `GET /api/files/:id/preview` | **PASS** | Inline preview stream successfully retrieved with authorized VIEWER or higher privilege. |
| **WF-10** | **File Binary Download** | `GET /api/files/:id/download` | **PASS** | Authenticated binary download stream delivered matching content with bit-level integrity. |
| **WF-11** | **File Rename** | `PUT /api/files/:id/rename` | **PASS** | File renamed by owner. Filename extension preserved and audit recorded. |
| **WF-12** | **File Move** | `PUT /api/files/:id/move` | **PASS** | File moved into child subfolder. Path re-anchored and permission inheritance dynamically updated. |
| **WF-13** | **Recycle Bin Trash & Restore** | `POST /trash`, `POST /restore` | **PASS** | Soft-delete marked asset `is_trashed = TRUE`; restore endpoint restored asset to active view. |
| **WF-14** | **Share Lifecycle** | `POST /shares`, `DELETE /shares/:id` | **PASS** | Share created with specified tier (`VIEWER`), retrieved, and revoked cleanly with immediate revocation. |
| **WF-15** | **Storage Hardware Overview** | `GET /api/storage/volumes` | **PASS** | Successfully inspected by `SUPER ADMIN` and `ADMIN`. Returns volume lists, composite IDs, and capacity metrics. |

---

## 5. Security Scenarios Acceptance Results (18/18 PASSED)

| Security ID | Requirement & Test Scenario | Target Persona | Result | Observed Verification Evidence |
| :---: | :--- | :---: | :---: | :--- |
| **SEC-01** | **Private-by-Default Isolation** | `stg_user_eng` | **PASS** | Querying unshared private folder of another user returns HTTP 403 `INSUFFICIENT_PERMISSION`. Folder metadata completely hidden. |
| **SEC-02** | **Department Workspace Isolation** | `stg_user_eng` | **PASS** | Accessing QA Department Shared Drive root without an explicit cross-department share returns HTTP 403 `INSUFFICIENT_PERMISSION`. |
| **SEC-03** | **VIEWER Download Denial** | `stg_viewer` | **PASS** | Calling `GET /api/files/:id/download` on a VIEWER-shared file returns HTTP 403 `INSUFFICIENT_PERMISSION`. Binary stream aborted. |
| **SEC-04** | **VIEWER Preview Allowance** | `stg_viewer` | **PASS** | Calling `GET /api/files/:id/preview` on a VIEWER-shared file returns HTTP 200 OK with valid inline preview payload. |
| **SEC-05** | **DOWNLOADER Upload Denial** | `stg_user_eng` (Downloader) | **PASS** | Calling `POST /api/files/upload/direct` into a DOWNLOADER-shared folder returns HTTP 403 `INSUFFICIENT_PERMISSION`. |
| **SEC-06** | **CONTRIBUTOR Rename Denial** | `stg_user_eng` (Contributor) | **PASS** | Calling `PUT /api/files/:id/rename` on an existing asset with CONTRIBUTOR share returns HTTP 403 `INSUFFICIENT_PERMISSION`. |
| **SEC-07** | **CONTRIBUTOR Upload Allowance** | `stg_user_eng` (Contributor) | **PASS** | Calling `POST /api/files/upload/direct` into a CONTRIBUTOR-shared folder succeeds with HTTP 201 Created. Asset owned by contributor. |
| **SEC-08** | **EDITOR Full Modification** | `stg_user_eng` (Editor) | **PASS** | Calling `PUT /rename` and `POST /trash` on shared assets succeeds with HTTP 200 OK. |
| **SEC-09** | **Privilege Escalation Defense** | `stg_user_eng` (Non-owner) | **PASS** | Non-owner attempting to grant a share or pass an arbitrary permission tier (`SUPER ADMIN`) is rejected with HTTP 400/403. |
| **SEC-10** | **Immediate Revocation Traversal** | `stg_user_eng` | **PASS** | Access to nested child subfolder succeeded while parent share was active; immediately denied with HTTP 403 upon parent share revocation. Zero cache lag. |
| **SEC-11** | **Share Expiration Boundary** | `stg_user_eng` | **PASS** | Share with `expires_at` in the past is rejected with HTTP 403 `INSUFFICIENT_PERMISSION` by the timestamp boundary check. |
| **SEC-12** | **Session Invalidation (Revocation)** | `stg_user_qa1` | **PASS** | Password changed via `/api/auth/change-password`; re-presenting the previous JWT token returns HTTP 401 `SESSION_REVOKED`. |
| **SEC-13** | **Account Suspension** | Suspended User | **PASS** | When user account is set to `status = 'SUSPENDED'`, presenting a valid JWT immediately returns HTTP 403 `User account is inactive or suspended`. |
| **SEC-14** | **Metadata Quarantine Denial** | `stg_user_qa1` (Standard) | **PASS** | Attempting to preview or query quarantined legacy file returns HTTP 403 `Access denied: QUARANTINED_TEST_DATA`. |
| **SEC-15** | **Super Admin Quarantine Override** | `stg_superadmin` | **PASS** | Super Admin compliance inspection of quarantined legacy asset succeeds without 403 quarantine block (break-glass access). |
| **SEC-16** | **Storage Hardware Admin-Only Gate**| `stg_user_qa1` (Standard) | **PASS** | Standard user calling `/api/storage/volumes/:volumeId/browse` is rejected at middleware with HTTP 403 `Insufficient permission for this operation`. |
| **SEC-17** | **Drive Browser Traversal Defense** | `stg_superadmin` | **PASS** | Admin querying drive browser with `\\attacker\share` or `../../Windows` is blocked with HTTP 400/500 `Illegal traversal forbidden`. |
| **SEC-18** | **Direct API vs UI Parity** | Raw HTTP Request | **PASS** | Sending requests without token returns HTTP 401; forged signature returns HTTP 403. UI authorization parity verified. |

---

## 6. Audit Trail & Chain Verification

During the acceptance testing phase:
- User logins generated standard audit records in `audit_logs` (recording actor, IP `127.0.0.1`, and timestamp).
- The 80 historical baseline audit records (id 1..80) remained completely untouched and bit-for-bit intact.
- Both dedicated SHA-256 audit chains remained cryptographically sound:
  - `login_audit_events`: 8 events, chain head in `system_settings` = `53f84234fb1045f3709d874f1ed4a12faa2385c5d3c673b454dc140272080ad7`.
  - `file_activity_events`: 6 events, chain head in `system_settings` = `0549c42f1f1e50274b528c28cb5ce531c71e549c0bb9eb7b97c9c1bbae367304`.

---

## 7. Immediate Maintenance Gate Restoration Verification

Immediately following test completion, the maintenance gate was restored and independently verified:

```
=== STARTING MAINTENANCE GATE VERIFICATION SUITE ===

[TEST 1] /health: PASS (200 MAINTENANCE) {"status":"MAINTENANCE","platform":"NKB Cloud","version":"2.1.0","maintenanceGate":true}
[TEST 2] /api/operator/status: PASS (200 OPERATOR ACCESS) {"operatorAccess":true,"pid":24120,"stagingMaintenance":true}
[TEST 3] Anonymous /api/files: PASS (503 BLOCKED) {"error":"STAGING_MAINTENANCE_GATE_ACTIVE"}
[TEST 4] SUPER ADMIN /api/files: PASS (503 BLOCKED) {"error":"STAGING_MAINTENANCE_GATE_ACTIVE"}
[TEST 5] ADMIN /api/storage/overview: PASS (503 BLOCKED) {"error":"STAGING_MAINTENANCE_GATE_ACTIVE"}
[TEST 6] POST /api/files/folder: PASS (503 BLOCKED) {"error":"STAGING_MAINTENANCE_GATE_ACTIVE"}
[TEST 7] GET /api/files/:id/download: PASS (503 BLOCKED) {"error":"STAGING_MAINTENANCE_GATE_ACTIVE"}
[TEST 8] WebSocket Upgrade Intercept: PASS (Upgrade rejected / socket destroyed with HTTP 503)

=== SUMMARY OF ALL MAINTENANCE GATE TESTS ===
Total tests: 8 | Passed: 8 | Failed: 0
FINAL MAINTENANCE GATE STATUS: ALL VERIFICATIONS PASSED (Universal Maintenance Gate Active)
```

---

## 8. Git & Database Working State

### Git Modifications Summary:
- `server/.env.local`: `HOST=127.0.0.1`, `STAGING_MAINTENANCE_GATE=true`.
- `server/server.js`: Explicit loopback bind `server.listen(PORT, HOST, ...)`.
- `server/controllers/authController.js`: Session version embedded in login and incremented on password change.
- `server/controllers/adminController.js`: Session version incremented on admin security updates.
- `server/middleware/auth.js`: Fail-closed session version validation.
- `server/test-stage2-security-remediation.js`: Maintenance gate handling in test harness.
- `storage-agent/src/file-engine.js`: Mandatory authorization token for file deletion.

### Database State:
- Database: `nkb_cloud_local_test` on `127.0.0.1:5433` (PostgreSQL 16.15).
- Schema Migrations: 001–007 applied; **Migration 008 unapplied and non-existent**.
- Dedicated staging storage volume `13b16bc9-aa77-42d9-90b5-9f09a9a7e108` restored to `status = 'OFFLINE'`.
- Physical storage drives `J:`, `D:`, `G:`, `C:`: **Zero destructive modifications or deletions.**

---

## 9. Conclusion & Next Phase Readiness

The **Controlled Staging Acceptance Testing** has concluded with a **100% pass rate** across all 15 workflows and all 18 security scenarios. Private-by-default isolation, departmental sharing, granular permission tiers, instant revocation, and fail-closed session versioning are fully certified on the isolated local staging environment.

The system is locked under `STAGING_MAINTENANCE_GATE=true`.

**STOPPED.** Standing by for your review and separate written authorization before taking any further action.
