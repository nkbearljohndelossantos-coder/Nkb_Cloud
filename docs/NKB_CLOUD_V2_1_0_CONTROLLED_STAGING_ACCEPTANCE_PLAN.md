# NKB CLOUD v2.1.0 — CONTROLLED STAGING ACCEPTANCE TEST PLAN

**Document Date:** November 10, 2026  
**Status:** **PLANNING & PREPARATION ONLY — NOT EXECUTED**  
**Target Environment:** Isolated Local Staging (`nkb_cloud_local_test` on `127.0.0.1:5433`, PostgreSQL 16.15)  
**Docker Container:** `nkb_pg16_staging`  
**Git Baseline Commit:** `796c7fdc62cdc61daff00f1f02d1bc3160395ad6`  
**Active Branch:** `test/local-offline-env`  
**Current Operating State:** **Universal Maintenance Gate ACTIVE (`STAGING_MAINTENANCE_GATE=true`)**  
**Execution Authorization:** **STRICT READ-ONLY PREPARATION — NO GATE RELEASE OR TRAFFIC AUTHORIZED**  

---

## 1. PURPOSE & SCOPE

This document defines the comprehensive, step-by-step acceptance test plan for validating real user workflows in NKB Cloud v2.1.0 on the isolated local staging environment following the successful application of Migration 007.

The objectives of this plan are:
1. Provide a rigorous, verifiable acceptance testing framework covering all user roles (`SUPER ADMIN`, `ADMIN`, `DEPARTMENT_MANAGER`, `STANDARD USER`, `VIEWER`).
2. Validate user privacy (private-by-default), departmental isolation, sharing tier boundaries (`VIEWER`, `DOWNLOADER`, `CONTRIBUTOR`, `EDITOR`), instant revocation, and metadata quarantine.
3. Establish a strictly controlled, fully reversible procedure for temporarily releasing the Universal Staging Maintenance Gate for interactive testing, with an immediate, verified restoration protocol.
4. Guarantee zero modification, leakage, or loss of existing company physical storage files on drives `J:`, `D:`, `G:`, or `C:`.

> [!IMPORTANT]
> **This plan is completely unexecuted.** In accordance with the non-negotiable operational restrictions, the staging maintenance gate remains active and normal user access remains completely blocked until separate written authorization is granted.

---

## 2. EXISTING APPLICATION WORKFLOW INSPECTION

An adversarial read-only inspection of the active application source code ([`server/server.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/server.js), [`server/routes/api.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/routes/api.js), controllers, and React UI components) established the baseline workflows:

### 2.1 Authentication & Session Management
- **Login (`POST /api/auth/login`):** Validates email or username and bcrypt password hash against `users`. Verifies `status === 'ACTIVE'`. Updates `last_login_at`. Generates signed JWT (`JWT_SECRET`, default 7-day expiration). Records `USER_LOGIN` in `audit_logs` and advances `login_audit_events` hash chain.
- **Session Verification (`GET /api/auth/me`):** Authenticates Bearer token via [`server/middleware/auth.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/middleware/auth.js). Queries database for current `users` row. Validates `status === 'ACTIVE'`. Checks `session_version` against token claim (rejects with 401 `SESSION_REVOKED` if incremented).
- **Password Change (`PUT /api/auth/change-password`):** Verifies current password, hashes new password with bcrypt (salt rounds 10), updates `password_hash`, increments `session_version` to invalidate concurrent sessions across other devices.
- **Logout:** Client-side purge of `nkb_token` and `nkb_user` from `localStorage`. Optional session record marked `revoked_at` in `user_sessions`.

### 2.2 Role Capabilities & Navigation
- **SUPER ADMIN (Role ID 1):**
  - Unrestricted access across all files, folders, and departmental workspaces (`SUPER_ADMIN_UNIVERSAL`).
  - Exclusive access to **Audit Trail** (`/api/admin/audit-logs`, [`AuditLogsView.jsx`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/client/src/pages/AuditLogsView.jsx)).
  - Exclusive access to system settings, agent pairing tokens, agent key rotation, placement policies, and storage migration approval/retirement.
  - Break-glass compliance access to quarantined test assets.
- **ADMIN (Role ID 2):**
  - Access to **Storage & Hardware** ([`StorageManagementView.jsx`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/client/src/pages/StorageManagementView.jsx)) and **Drive Browser** ([`DriveBrowserView.jsx`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/client/src/pages/DriveBrowserView.jsx)).
  - Access to **User Accounts** management ([`UsersView.jsx`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/client/src/pages/UsersView.jsx)) to view directory, register users, and update quotas.
  - Cannot access Audit Trail or approve drive retirement.
- **DEPARTMENT_MANAGER (Role 3 with `is_department_head = TRUE`):**
  - Inherits full manager privileges (rank 4 / Editor) over the root department shared drive.
  - Authorized to grant departmental shares to internal users and external departments.
- **STANDARD USER (Role ID 3):**
  - Standard user workspace: **My Drive**, **Shared with me**, **Shared Drives** (member view).
  - Can create folders, upload files, download owned files, create shares on owned assets, and trash/restore personal files.
  - Blocked from administrative pages (`/admin/*`, `/storage/*`).
- **VIEWER (Role ID 4):**
  - Restricted to preview and read-only inspection.
  - File downloads, uploads, folder creation, renaming, moving, and trashing are denied by authorization gates.

### 2.3 Storage Views & Data Workflows
- **My Drive (`GET /api/files` with default view):** Root queries enforce `parent_id IS NULL AND is_shared_drive = FALSE AND owner_id = $userId`. Users only see files and folders they own. Subfolders traverse via `verifyFolderAccess`.
- **Shared With Me (`GET /api/shares/with-me`):** Queries `file_shares` for active grants matching `shared_with_user_id = $userId` or `shared_with_department_id = $deptId`. Returns aggregated lists of shared files and folders with permission tiers.
- **Shared Drives (`GET /api/files?view=shared-drives`):** Queries `folders` where `is_shared_drive = TRUE AND parent_id IS NULL`. Evaluates department root workspace access (`DEPARTMENT_WORKSPACE_MEMBER`) based on user's active department assignment.
- **File Upload:**
  - *Direct Upload (`POST /api/files/upload/direct`):* Used for files up to 50MB. Checks `verifyFolderAccess(..., 'CONTRIBUTOR')`.
  - *Chunked Resumable Upload (`/api/files/upload/initiate`, `/chunk`, `/finalize`):* Multi-part streaming with client SHA-256 integrity check. Bounded memory consumption (16MB max chunk buffer).
- **Preview (`GET /api/files/:id/preview`):** Evaluates `verifyFileAccess(..., 'VIEWER')`. Serves inline HTTP response for PDF, images, and text documents.
- **Download (`GET /api/files/:id/download`):** Evaluates `verifyFileAccess(..., 'DOWNLOADER')`. Strictly rejected if user holds only `VIEWER` permission.
- **Rename & Move (`PUT /api/files/:id/rename`, `PUT /api/files/:id/move`):** Evaluates `verifyFolderAccess` / `verifyFileAccess` requiring `EDITOR` (rank 4). Target destination folder for move requires `CONTRIBUTOR` (rank 3).
- **Trash & Recycle Bin (`POST /api/files/:id/trash`, `POST /api/files/:id/restore`):** Moves item to `recycle_bin` table and sets `is_trashed = TRUE`. Restoring clears `is_trashed`. Requires `EDITOR` or owner privileges. Permanent deletion (`DELETE /api/files/:id/permanent`) restricted to `SUPER ADMIN`.
- **Physical Drive Browser (`/api/storage/volumes/:volumeId/browse`):** Outbound relay to Windows Storage Agent via WebSocket. Allows admins to inspect physical filesystem directories with strict read-only guarantees (UNC path traversal, ADS, and system folder blacklists enforced).

---

## 3. TEST ACCOUNT & DATA SCENARIO PLAN

To ensure zero risk to actual enterprise credentials or employee data, the staging acceptance test must utilize **exclusively synthetic test identities**:

### 3.1 Synthetic User Personas
| Persona ID | Username | Role Name | Role ID | Department Name | Dept ID | Dept Head? | Purpose / Focus Area |
| :--- | :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| **USR-SA** | `stg_superadmin` | `SUPER ADMIN` | 1 | IT & Systems Infrastructure | 2 | No | Administrative governance, audit, break-glass |
| **USR-ADM** | `stg_admin_it` | `ADMIN` | 2 | IT & Systems Infrastructure | 2 | No | Storage overview, hardware, drive browser, user mgmt |
| **USR-MGR** | `stg_mgr_qa` | `STANDARD USER` | 3 | Quality Assurance & Control | 4 | **Yes** | Department workspace administration & sharing grants |
| **USR-QA1** | `stg_user_qa1` | `STANDARD USER` | 3 | Quality Assurance & Control | 4 | No | Primary content creator & owner in QA |
| **USR-ENG** | `stg_user_eng` | `STANDARD USER` | 3 | Engineering & Design | 5 | No | External department actor for cross-dept isolation |
| **USR-VWR** | `stg_viewer` | `VIEWER` | 4 | Executive & Leadership | 1 | No | Read-only compliance tester (download/write denial) |

### 3.2 Password & Credential Rules
- **Standardized Synthetic Staging Password:** `NKB-Staging-Acceptance-2026!`
- **Bcrypt Hash:** Generated with 10 salt rounds prior to insertion.
- **Production Credentials:** **STRICTLY PROHIBITED**. No production or VPS usernames/passwords will be loaded into staging.
- **Credential Storage:** Staged test users are registered with status `ACTIVE` and `session_version = 1`.

### 3.3 Synthetic Test Data Workspaces
```text
[QA Department Workspace Root] (Shared Drive: Dept 4)
  ├── QA_Standard_Operating_Procedure.pdf (Owned by USR-MGR, Inherited)
  └── [Audit_Checklists_Folder] (Subfolder)
        └── Calibration_Report_Q4.docx (Owned by USR-QA1)

[USR-QA1 Personal Workspace] (My Drive)
  ├── [Private_QA_Notes] (Private-by-Default Folder)
  │     └── internal_notes.txt (Private-by-Default File)
  └── [Collaborative_Project] (Folder shared externally to USR-ENG)
        └── shared_spec.pdf
```

---

## 4. SECURITY ACCEPTANCE TEST MATRIX

All 12 critical security requirements are structured below as formal test cases with exact verification criteria.

> [!NOTE]
> All tests are currently **[NOT EXECUTED]**.

### 4.1 Test Case Matrix
| Test ID | Security Requirement | Persona | Action / Endpoint | Expected Result | Execution Status |
| :---: | :--- | :---: | :--- | :--- | :---: |
| **SEC-01** | Private-by-Default Isolation | `stg_user_eng` | Query `/api/files?folderId=<Private_QA_Notes_ID>` | HTTP 403 `Access denied: INSUFFICIENT_PERMISSION`. File/folder metadata completely hidden. | **NOT EXECUTED** |
| **SEC-02** | Department Workspace Isolation | `stg_user_eng` | Access QA Department Shared Drive without grant | HTTP 403 `INSUFFICIENT_PERMISSION`. Engineering user cannot browse QA root workspace. | **NOT EXECUTED** |
| **SEC-03** | VIEWER Download Denial | `stg_viewer` | `GET /api/files/:id/download` on VIEWER-shared file | HTTP 403 `Access denied: INSUFFICIENT_PERMISSION`. Binary stream aborted. | **NOT EXECUTED** |
| **SEC-04** | VIEWER Preview Allowance | `stg_viewer` | `GET /api/files/:id/preview` on VIEWER-shared file | HTTP 200 OK with `Content-Type: application/pdf` or image. Inline view succeeds. | **NOT EXECUTED** |
| **SEC-05** | DOWNLOADER Upload Denial | User with `DOWNLOADER` | `POST /api/files/upload/direct` into shared folder | HTTP 403 `Access denied: INSUFFICIENT_PERMISSION`. File upload rejected. | **NOT EXECUTED** |
| **SEC-06** | CONTRIBUTOR Rename Denial | User with `CONTRIBUTOR` | `PUT /api/files/:id/rename` on existing shared file | HTTP 403 `Access denied: INSUFFICIENT_PERMISSION`. Existing asset immutable. | **NOT EXECUTED** |
| **SEC-07** | CONTRIBUTOR Upload Success | User with `CONTRIBUTOR` | `POST /api/files/upload/direct` into shared folder | HTTP 200 OK. New file created with contributor as owner. | **NOT EXECUTED** |
| **SEC-08** | EDITOR Full Modification | User with `EDITOR` | `PUT /api/files/:id/rename`, `/move`, `/trash` | HTTP 200 OK for rename, move, and trash. | **NOT EXECUTED** |
| **SEC-09** | Privilege Escalation Defense | `stg_user_qa1` | `POST /api/shares` granting `SUPER ADMIN` or `EDITOR` on unowned file | HTTP 400 `Invalid permission level` or HTTP 403 `Only file owner or Super Admin may grant shares`. | **NOT EXECUTED** |
| **SEC-10** | Immediate Revocation Traversal | `stg_user_eng` | Access child subfolder immediately after parent share revoked | HTTP 403 `INSUFFICIENT_PERMISSION` on immediate subsequent request. No cache lag. | **NOT EXECUTED** |
| **SEC-11** | Share Expiration Boundary | `stg_user_eng` | Access shared asset where `expires_at < NOW()` | HTTP 403 `INSUFFICIENT_PERMISSION`. Timestamp check rejects expired access. | **NOT EXECUTED** |
| **SEC-12** | Session Invalidation (Revocation) | `stg_user_qa1` | User password changed; old JWT token re-presented to API | HTTP 401 `SESSION_REVOKED`. Inactive session immediately denied. | **NOT EXECUTED** |
| **SEC-13** | Account Suspension | Suspended user | Present valid JWT for account with `status = 'SUSPENDED'` | HTTP 403 `Your account is inactive or suspended`. | **NOT EXECUTED** |
| **SEC-14** | Metadata Quarantine Denial | Standard user | Attempt download or preview of quarantined legacy file | HTTP 403 `Access denied: QUARANTINED_TEST_DATA`. | **NOT EXECUTED** |
| **SEC-15** | Super Admin Quarantine Override | `stg_superadmin`| Preview quarantined legacy file | HTTP 200 OK. Break-glass compliance review allowed. | **NOT EXECUTED** |
| **SEC-16** | Storage Hardware Admin-Only | Standard user | `GET /api/storage/volumes`, `/api/storage/hardware` | HTTP 403 `Insufficient permission for this operation`. Blocked at middleware. | **NOT EXECUTED** |
| **SEC-17** | Drive Browser Traversal Defense | `stg_admin_it` | Drive browser query containing `\\attacker\share` or `..` | HTTP 500/400 `Security Violation: UNC network paths or illegal traversal forbidden`. | **NOT EXECUTED** |
| **SEC-18** | Direct API vs UI Parity | Direct HTTP/curl | Send raw curl request bypassing UI forms with invalid token | Direct API enforces identical authorization checks as UI. | **NOT EXECUTED** |

---

## 5. CONTROLLED MAINTENANCE GATE RELEASE & RESTORATION PROCEDURE

This section specifies the exact, reversible, local-only operational procedure to be followed **ONLY WHEN SEPARATELY AUTHORIZED** to enable interactive user acceptance testing.

### 5.1 Pre-Release Verification Checklist
Before modifying any configuration:
- [ ] Database verified as `nkb_cloud_local_test` on `127.0.0.1:5433` (PostgreSQL 16.15).
- [ ] Pre-migration 007 backup verified on disk:
      `C:\NKB-Cloud-Offline-Test\Logs\pre_migration_007_backup_20261110_112100.dump` (SHA-256: `2B03A881ABAA75C1...`).
- [ ] Post-migration 007 validation verified (140/140 assertions passed).
- [ ] Reference file `J:\NKB_Storage_Root\1ba77ec9-1997-4492-b83f-8184cc6dd89c.jpg` verified bit-identical.
- [ ] Git status confirmed clean on `test/local-offline-env`.
- [ ] Confirmed zero external bindings: Server configured on `127.0.0.1` only.

### 5.2 Gate Release Execution (DO NOT EXECUTE)
1. Edit [`server/.env.local`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/.env.local):
   ```ini
   # Toggle Universal Maintenance Gate for staging acceptance testing
   STAGING_MAINTENANCE_GATE=false
   ```
2. Restart the background server process:
   ```powershell
   # Terminate running server background task (e.g. task-3215)
   # Restart server with local environment configuration:
   node --env-file=server/.env.local server/server.js
   ```
3. Confirm gate release locally:
   ```powershell
   curl.exe -i http://127.0.0.1:5000/health
   # Expected response: HTTP 200 with {"status":"ONLINE","maintenanceGate":false}
   ```
4. Verify external isolation:
   - Confirm server is bound to `127.0.0.1` / `localhost`.
   - Confirm Windows Firewall blocks incoming external port 5000 connections.
   - Confirm zero VPS or remote synchronization scripts are running.

### 5.3 Immediate Gate Restoration Protocol
Immediately upon completion of testing (or upon any unexpected failure):
1. Re-edit [`server/.env.local`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/.env.local):
   ```ini
   STAGING_MAINTENANCE_GATE=true
   ```
2. Restart server process:
   ```powershell
   node --env-file=server/.env.local server/server.js
   ```
3. Verify gate restoration:
   ```powershell
   # Health diagnostic:
   curl.exe -i http://127.0.0.1:5000/health
   # Must return: HTTP 200 with status: MAINTENANCE, maintenanceGate: true

   # User route interception:
   curl.exe -i http://127.0.0.1:5000/api/files
   # Must return: HTTP 503 STAGING_MAINTENANCE_GATE_ACTIVE

   # Automated gate verification test:
   node "scratch\test_maintenance_gate.mjs"
   # Must pass 8/8 tests
   ```
4. WebSocket & Active Session Severance:
   - Restarting the process severs all active WebSocket connections.
   - The maintenance gate middleware immediately rejects any new HTTP requests from existing JWT tokens with HTTP 503, preventing any lingering sessions from executing commands.

---

## 6. ROLLBACK & EMERGENCY STOP RUNBOOK

If any acceptance test fails or unexpected data mutation occurs:

### 6.1 Emergency Stop Trigger Conditions
- Any standard user accesses an unshared private file or folder.
- A VIEWER successfully downloads a file.
- Any test attempts to write or delete files on `J:\NKB_Storage_Root`.
- An audit hash chain computation fails or breaks.
- Any unhandled exception occurs in database migration triggers.

### 6.2 Emergency Stop Actions
1. **Immediate Gate Lock:** Ensure `STAGING_MAINTENANCE_GATE=true` in `server/.env.local` and kill Node process.
2. **Halt All Testing:** Do not proceed with subsequent test cases.
3. **Preserve Evidence:** Capture current database state, server logs, and Docker container logs.
4. **Physical File Re-Hash:** Re-verify `J:\NKB_Storage_Root\1ba77ec9-1997-4492-b83f-8184cc6dd89c.jpg` against baseline SHA-256.
5. **Database Rollback:** If database corruption is suspected, restore from verified pre-migration backup:
   ```powershell
   docker exec -i nkb_pg16_staging pg_restore -U postgres -d nkb_cloud_local_test --clean --if-exists "C:\NKB-Cloud-Offline-Test\Logs\pre_migration_007_backup_20261110_112100.dump"
   ```

---

## 7. UNRESOLVED RISKS & ARCHITECTURAL OBSERVATIONS

1. **JWT Session Version Claim in `authController.login`**:
   - *Observation:* During the workflow review, it was noted that [`server/controllers/authController.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/authController.js#L43-L48) signs tokens with `{ id, email, username, role }`, omitting `sessionVersion`. While [`server/middleware/auth.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/middleware/auth.js#L38-L42) is fully capable of validating `sessionVersion`, it only triggers if `decoded.sessionVersion !== undefined`.
   - *Recommendation:* Prior to production deployment, `sessionVersion: user.session_version` should be included in the signed JWT payload during login so that incrementing `users.session_version` immediately revokes existing web sessions.
2. **Drive Browser Read-Only Assurance**:
   - The Drive Browser UI component is strictly read-only. Physical storage modification tests must never be run through the browser interface.
3. **Quarantine Metadata Cleanup (Phase 2 Post-Release)**:
   - The 20 quarantined folders and 1 file remain safely hidden under `is_quarantined = TRUE`. They should remain in quarantine throughout staging acceptance testing.

---

## 8. CONCLUSION & CURRENT STATUS

This Controlled Staging Acceptance Plan is finalized, comprehensive, and verified against the actual application architecture.

- **Status:** **PLANNING ONLY (ALL TESTS LABELED NOT EXECUTED)**
- **Operating State:** **STAGING_MAINTENANCE_GATE=true (LOCKED)**
- **Zero code, database, physical files, or configuration have been modified.**

**STOPPED.** Standing by for your review and separate written authorization before taking any further action.
