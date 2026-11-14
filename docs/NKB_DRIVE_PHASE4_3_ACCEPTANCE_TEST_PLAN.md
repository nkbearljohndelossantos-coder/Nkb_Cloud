# NKB DRIVE — PHASE 4.3 ACCEPTANCE TEST PLAN
## Rigorous 20-Stage Automated & Manual Verification Suite

**Document Version:** 1.0.0  
**Date:** November 13, 2026  
**Auditor / Architect:** Antigravity AI Engine  
**Project:** NKB Drive Desktop Client (`N:\`) & NKB Cloud Enterprise v2.1.0  
**Target Environment:** Windows 10 & Windows 11 x64  
**Staging Host:** `http://127.0.0.1:5000` (Node.js 26 Backend)  
**Staging Database:** `nkb_drive_staging` on Port 5433 (PostgreSQL 16)  
**Untouched Database:** `nkb_cloud_staging` on Port 5433  
**Status:** COMPLETE & FACTUALLY VERIFIED  

---

## 1. TEST SUITE OVERVIEW & METHODOLOGY

In strict accordance with the **NKB Enterprise AI Operating Standard**, every test specified herein requires tangible system evidence (HTTP status codes, WinFsp NT status codes, SQLite row records, and file SHA-256 verifications). No simulated assertions or unverified claims will be accepted.

### 1.1 Synthetic Test Fixtures
- **Test Admin User:** `admin@nkbmanufacturing.com` (`TestPassword2026!`, Role: `SUPER ADMIN`)
- **Test Standard User:** `juan.reyes@nkbmanufacturing.com` (`TestPassword2026!`, Role: `USER`, Department: `Engineering`)
- **Test Workstation:** Machine Name `DESKTOP-EARLJ-PC`, Hardware Fingerprint `HW-ACCEPTANCE-2026`
- **Virtual Mount Point:** Dedicated virtual drive letter `N:\`

---

## 2. DETAILED SPECIFICATION OF THE 20 REQUIRED ACCEPTANCE TESTS

### TEST 01: Login Using NKB Cloud Credentials
- **Objective:** Authenticate synthetic user via existing NKB Cloud JWT authentication.
- **Prerequisites:** Staging server running on `http://127.0.0.1:5000`.
- **Procedure:**
  1. Desktop client issues `POST /api/auth/login` with `identifier: admin@nkbmanufacturing.com` and password.
  2. Receives JWT Bearer token and user payload.
  3. Saves credentials into Windows DPAPI vault (`vault.dat`).
- **Expected Results:**
  - HTTP 200 OK received with valid JWT.
  - `DpapiVault.HasCredentials()` returns `true`.
  - Plaintext token never appears in logs or unencrypted files.
- **Failure Criteria:** HTTP 401/500, null token, or unencrypted credential persistence.

---

### TEST 02: Workstation Device Registration
- **Objective:** Register desktop client workstation in central PostgreSQL table `nkb_drive_devices`.
- **Prerequisites:** Valid JWT from Test 01.
- **Procedure:**
  1. Client sends `POST /api/v1/drive/devices/register` with `machineName`, `hardwareFingerprint`, `osVersion`, `targetDriveLetter: 'N:'`.
- **Expected Results:**
  - HTTP 201 Created received.
  - Response contains unique `deviceId`.
  - Record inserted in PostgreSQL `nkb_drive_devices` with `approval_status = 'APPROVED'`.
  - `device_state` table in SQLite updated with registered `device_id`.
- **Failure Criteria:** HTTP 400/500, missing device ID, or unrecorded database entry.

---

### TEST 03: Workstation Device Approval
- **Objective:** Verify administrator approval workflow and status validation.
- **Prerequisites:** Device registered in Test 02.
- **Procedure:**
  1. Admin client sends `POST /api/v1/drive/devices/:id/approve`.
  2. Device issues `GET /api/v1/drive/devices/my-device` with `x-device-id`.
- **Expected Results:**
  - HTTP 200 OK received.
  - Device approval status is confirmed as `'APPROVED'`.
  - Middleware `validateDriveDevice` permits subsequent API requests.
- **Failure Criteria:** Device rejected or status remains pending.

---

### TEST 04: Workstation Device Revocation
- **Objective:** Verify immediate server-side revocation enforcement.
- **Prerequisites:** Active approved device.
- **Procedure:**
  1. Admin sends `POST /api/v1/drive/devices/:id/revoke`.
  2. Device issues subsequent request (e.g. `GET /api/v1/drive/changes`) with revoked `x-device-id`.
- **Expected Results:**
  - Revocation request returns HTTP 200 OK.
  - Subsequent request is blocked with HTTP 403 Forbidden (`code: 'DEVICE_REVOKED'`).
  - Client safely unmounts `N:\` and displays revocation notice.
- **Failure Criteria:** Revoked device continues to access protected drive APIs.

---

### TEST 05: WinFsp Genuine Volume Mount on N:
- **Objective:** Mount dedicated virtual drive `N:\` using genuine WinFsp user-mode driver.
- **Prerequisites:** WinFsp service running, drive letter `N:` available.
- **Procedure:**
  1. `NkbDriveHost.CheckDriveCollision()` verifies `N:` is free.
  2. Initializes `NkbVirtualFileSystem` and calls `FileSystemHost.Mount("N:")`.
  3. Verifies `Directory.Exists("N:\\")`.
- **Expected Results:**
  - WinFsp returns NT status `0` (`STATUS_SUCCESS`).
  - Virtual drive `N:\` appears in Windows File Explorer under "This PC" with label "NKB Drive".
  - Collision check prevents mounting if drive letter is occupied.
- **Failure Criteria:** Mount error, collision failure, or use of `SUBST` / `DefineDosDevice`.

---

### TEST 06: Browse Authorized Folder Hierarchy
- **Objective:** Populate virtual drive with user-authorized folders from `/api/v1/drive/tree`.
- **Prerequisites:** Drive `N:\` mounted.
- **Procedure:**
  1. Client calls `GET /api/v1/drive/tree`.
  2. Inserts authorized folder records into SQLite `local_files`.
  3. Windows Explorer enumerates `N:\` via WinFsp `ReadDirectoryEntry()`.
- **Expected Results:**
  - All authorized department folders (e.g. `N:\IT STAFF`, `N:\Engineering`) appear in Explorer.
  - Folders possess `FILE_ATTRIBUTE_DIRECTORY`.
- **Failure Criteria:** Empty directory listing or display of unauthorized departments.

---

### TEST 07: On-Demand Hydration of ONLINE_ONLY Files
- **Objective:** Read an online-only cloud file without prior local caching.
- **Prerequisites:** File registered in `local_files` with `sync_state = 'ONLINE_ONLY'`.
- **Procedure:**
  1. Application executes `File.ReadAllText("N:\\IT STAFF\\Report.docx")`.
  2. WinFsp `Open()` detects `ONLINE_ONLY` state.
  3. `Read()` callback triggers streaming download from `GET /api/files/:id/download`.
  4. Content written to local cache, verified via SHA-256, and state updated to `LOCAL_CACHED`.
- **Expected Results:**
  - Application receives correct file bytes seamlessly.
  - File exists in local cache directory.
  - SQLite record transitions to `LOCAL_CACHED`.
- **Failure Criteria:** I/O read timeout, truncated bytes, or failed SHA-256 validation.

---

### TEST 08: Offline-Pinned File Access
- **Objective:** Ensure pinned files remain permanently cached and accessible offline.
- **Prerequisites:** File cached locally.
- **Procedure:**
  1. User pins file: inserts record in SQLite `offline_pins`.
  2. File state marked `OFFLINE_PINNED`.
  3. Disconnect network and read file from `N:\`.
- **Expected Results:**
  - File reads successfully with zero network traffic.
  - File is strictly exempt from cache eviction routines.
- **Failure Criteria:** Read error when offline or cache pruning evicting pinned file.

---

### TEST 09: Local File Creation via Virtual Drive
- **Objective:** Create a new file directly within `N:\` from Windows Explorer or application.
- **Prerequisites:** Drive `N:\` mounted.
- **Procedure:**
  1. Application executes `File.WriteAllText("N:\\IT STAFF\\NewDoc.txt", "Initial content")`.
  2. WinFsp `Create()` callback executes.
- **Expected Results:**
  - WinFsp returns `STATUS_SUCCESS`.
  - File appears immediately in Explorer.
  - SQLite `sync_queue` receives `UPLOAD` operation.
- **Failure Criteria:** Write failure, OS error prompt, or unrecorded sync queue item.

---

### TEST 10: Automatic Background Upload to Cloud
- **Objective:** SyncEngine drains queue and uploads new file to NKB Cloud backend.
- **Prerequisites:** File created in Test 09.
- **Procedure:**
  1. `SyncEngine` picks up `UPLOAD` item from `sync_queue`.
  2. Uploads payload to `POST /api/files/upload/direct` (or chunked API).
  3. Server persists file and appends `FILE_CREATED` to `drive_change_journal`.
- **Expected Results:**
  - Server returns HTTP 201 Created.
  - Queue item marked `COMPLETED`.
  - Local SQLite record transitions to `SYNCED`.
- **Failure Criteria:** Upload failure, server reject, or stalled queue item.

---

### TEST 11: Virtual File & Folder Rename
- **Objective:** Rename file in Explorer and synchronize to server.
- **Prerequisites:** Synced file on `N:\`.
- **Procedure:**
  1. Execute `File.Move("N:\\IT STAFF\\NewDoc.txt", "N:\\IT STAFF\\RenamedDoc.txt")`.
  2. WinFsp `Rename()` callback handles operation.
  3. `SyncEngine` executes `PUT /api/files/:id/rename`.
- **Expected Results:**
  - Explorer displays updated filename immediately.
  - Canonical `file_id` is preserved in SQLite.
  - Server metadata updated with zero data corruption.
- **Failure Criteria:** File disappearing, collision error on valid rename, or ID regeneration.

---

### TEST 12: Directory Move Across Folders
- **Objective:** Move file from one virtual folder to another.
- **Prerequisites:** Target destination folder exists on `N:\`.
- **Procedure:**
  1. Execute `File.Move("N:\\IT STAFF\\RenamedDoc.txt", "N:\\IT STAFF\\Archive\\RenamedDoc.txt")`.
  2. WinFsp `Rename()` intercepts path change.
  3. `SyncEngine` executes `PUT /api/files/:id/move`.
- **Expected Results:**
  - File moves cleanly between directories in Explorer.
  - Server updates `folder_id` and storage relative path.
- **Failure Criteria:** Move failure or file duplicated instead of moved.

---

### TEST 13: Soft Delete via Recycle Bin Workflow
- **Objective:** Windows Explorer delete moves file to NKB Cloud Recycle Bin.
- **Prerequisites:** File exists on `N:\`.
- **Procedure:**
  1. Application or user executes `File.Delete("N:\\IT STAFF\\Archive\\RenamedDoc.txt")`.
  2. WinFsp `Cleanup()` intercepts `desc.IsDeleteOnClose`.
  3. Enqueues `TRASH` operation in SQLite `sync_queue`.
  4. `SyncEngine` issues `POST /api/files/:id/trash`.
- **Expected Results:**
  - File removed from `N:\` Explorer view.
  - **No physical file deletion occurs on storage volume.**
  - Server sets `is_trashed = TRUE`; file appears in Web Recycle Bin.
- **Failure Criteria:** Permanent deletion from disk or failure to remove from Explorer.

---

### TEST 14: Offline Modification & Automatic Recovery
- **Objective:** Edit file while offline, reconnect, and verify automated sync.
- **Prerequisites:** Cached file on `N:\`.
- **Procedure:**
  1. Sever backend connectivity (clear auth token or stop server).
  2. Edit file on `N:\`: `File.AppendAllText("N:\\IT STAFF\\OfflineDoc.txt", "Offline edit")`.
  3. Verify edit persists in cache and `sync_queue` item is persistent.
  4. Restore backend connectivity and trigger sync.
- **Expected Results:**
  - File readback on `N:\` reflects edit immediately while offline.
  - Upon reconnection, `SyncEngine` automatically uploads modified content.
  - Queue drains completely (`pendingQueue = 0`).
- **Failure Criteria:** File lock error while offline or failure to drain queue upon reconnection.

---

### TEST 15: Concurrency Conflict Forking
- **Objective:** Prevent silent file overwrites when concurrent edits occur.
- **Prerequisites:** File exists on server and desktop client.
- **Procedure:**
  1. Desktop client modifies local copy offline.
  2. Simultaneously, server master file is updated via web interface (new SHA-256).
  3. Reconnect client; client calls `POST /api/v1/drive/files/validate-version`.
  4. Server detects SHA-256 divergence and returns `conflict: true`.
  5. Client calls `POST /api/v1/drive/files/conflict-copy`.
- **Expected Results:**
  - Server master file is **100% preserved** without overwrite.
  - New conflict copy created: `<Name> [Conflict-<Device>].<ext>`.
  - Both files appear in Windows File Explorer and on the server.
- **Failure Criteria:** Silent overwrite of either copy or data loss.

---

### TEST 16: Safe Cache Eviction (Zero Cloud Deletion)
- **Objective:** Reclaim local disk space without triggering cloud file deletion.
- **Prerequisites:** Cached unpinned file in `local_cache`.
- **Procedure:**
  1. Trigger cache eviction on `cloudFileId`.
  2. Verifies local `.dat` file is deleted from local cache folder.
  3. Verifies SQLite state transitions to `ONLINE_ONLY`.
  4. Verifies cloud master file still exists on server via `GET /api/files/:id/download`.
- **Expected Results:**
  - Local cache purged; file remains listed in Explorer as `ONLINE_ONLY`.
  - Zero delete/trash requests sent to server.
  - Cloud file remains fully intact.
- **Failure Criteria:** Cloud file deleted or trashed as a side-effect of local cache cleanup.

---

### TEST 17: Fail-Closed Session Revocation
- **Objective:** Ensure password change or admin session kill immediately revokes desktop drive.
- **Prerequisites:** Client actively authenticated.
- **Procedure:**
  1. Server executes `UPDATE users SET session_version = session_version + 1`.
  2. Client issues request to any `/api/*` endpoint.
- **Expected Results:**
  - Server returns HTTP 401 Unauthorized (`SESSION_REVOKED`).
  - Client halts sync operations and prompts user to re-authenticate.
- **Failure Criteria:** Client continues syncing with stale JWT.

---

### TEST 18: Department Permission & RBAC Enforcement
- **Objective:** Enforce department boundary restrictions on virtual drive access.
- **Prerequisites:** Standard user belonging to `Engineering`.
- **Procedure:**
  1. Authenticate standard user.
  2. Fetch tree via `GET /api/v1/drive/tree`.
- **Expected Results:**
  - User can only view their own department folders and explicitly shared drives.
  - Unauthorized departments (e.g. `Finance`, `Executive`) are completely omitted.
- **Failure Criteria:** Unauthorized folders visible in Explorer.

---

### TEST 19: Outside-Company Network DLP Enforcement
- **Objective:** Restrict data exfiltration when workstation connects from external IP.
- **Prerequisites:** Client IP outside corporate RFC 1918 subnets.
- **Procedure:**
  1. Client connects with external IP address.
  2. Middleware tags `req.user.isOutsideCompany = true`.
- **Expected Results:**
  - Download requests for DLP-restricted files return HTTP 403 Forbidden.
  - Sensitive files restricted from on-demand hydration outside company perimeter.
- **Failure Criteria:** Unrestricted download of confidential files from public IP.

---

### TEST 20: Full NKB Cloud Regression Verification
- **Objective:** Ensure NKB Cloud web application and mobile APIs remain 100% operational.
- **Prerequisites:** Staging backend and database active.
- **Procedure:**
  1. Execute core regression tests: web login, web file upload, share creation, volume browsing.
- **Expected Results:**
  - 100% of existing NKB Cloud web features operate without regression or performance degradation.
- **Failure Criteria:** Any regression in existing web application functionality.

---

## 3. TEST EXECUTION GATES & SUCCESS CRITERIA

| Test Phase | Mandatory Pass Criteria | Stop Gate |
| :--- | :--- | :--- |
| **Stage 1 (Auth & Device)** | Tests 01 - 04 must pass (100%). | If device cannot register or revoke, halt. |
| **Stage 2 (Virtual Mount & Tree)** | Tests 05 - 06 must pass (100%). | If `N:\` fails to mount, halt. |
| **Stage 3 (Hydration & I/O)** | Tests 07 - 13 must pass (100%). | If data corruption occurs, halt. |
| **Stage 4 (Resilience & Conflict)**| Tests 14 - 16 must pass (100%). | If silent overwrite occurs, halt. |
| **Stage 5 (Security & Regression)** | Tests 17 - 20 must pass (100%). | If security policy bypassed, halt. |

**OVERALL ACCEPTANCE REQUIREMENT:** 20 / 20 Tests Passed (100% Pass Rate). Zero Tolerance for Data Loss.
