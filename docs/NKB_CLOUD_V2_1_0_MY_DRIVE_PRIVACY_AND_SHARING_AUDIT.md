# NKB CLOUD v2.1.0 — MY DRIVE PRIVACY & EXPLICIT SHARING AUDIT REPORT

**Audit Date**: November 10, 2026  
**Auditor Roles**: Independent Principal Software Architect, Application Security Engineer, Database Auditor  
**Operational Mode**: **STRICT READ-ONLY — NO IMPLEMENTATION AUTHORIZED**  
**Git Branch**: `test/local-offline-env` (HEAD at `796c7fd`)  
**Staging Database**: PostgreSQL 16 on `127.0.0.1:5433` (`nkb_cloud_local_test`)  
**Active Services**: Express API (`127.0.0.1:5000`), Storage Agent (`ws://127.0.0.1:5000/ws/agent`)  

---

## EXECUTIVE SUMMARY & AUDIT VERDICT

This independent audit investigates why the NKB Cloud user interface currently presents 10 pre-existing folders upon initial login, dissects the underlying database records and server controllers, and establishes the formal architecture for **Zero-Knowledge Private Defaults, Explicit Folder Sharing, and Non-Destructive Test Data Quarantine**.

### **AUDIT STATUS: AUDIT COMPLETE — AWAITING SEPARATE IMPLEMENTATION AUTHORIZATION**

> [!IMPORTANT]
> **Strict Read-Only Mode Preserved**: Zero source files were modified, zero migrations were applied, zero database records were altered or deleted, and zero physical files were touched during this audit.

---

## 1. INVESTIGATION: THE ROOT CAUSE OF THE 10 VISIBLE DIRECTORIES

An exhaustive review of the client React SPA, Express backend controllers, and live PostgreSQL staging database revealed the exact mechanism causing 10 directories to appear immediately upon loading "My Drive":

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                ROOT CAUSE DISCOVERY FLOW                                 │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Client loads My Drive:                                                                │
│    client/src/App.jsx (L71) calls api.get('/files', { params: {} })                      │
│                                                                                          │
│ 2. Backend routes request:                                                               │
│    server/routes/api.js (L22) router.get('/files', authenticateToken, getExplorerItems)  │
│                                                                                          │
│ 3. Controller executes root query:                                                       │
│    server/controllers/fileController.js (L102):                                          │
│    SELECT * FROM folders WHERE is_trashed = FALSE                                        │
│      AND parent_id IS NULL AND is_shared_drive = FALSE AND owner_id = $1                 │
│    ($1 = req.user.id = '00000000-0000-0000-0000-0000-000000000001')                    │
│                                                                                          │
│ 4. Database matches exactly 10 rows:                                                     │
│    Table 'folders' contains 10 root rows named 'Offline_Test_Folder',                    │
│    ALL created with owner_id = '00000000-0000-0000-0000-000000000001'                    │
│                                                                                          │
│ 5. Response payload:                                                                     │
│    { folders: [10 items], files: [], breadcrumbs: [] }                                   │
│    Frontend renders 10 directory cards on screen.                                        │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Detailed Empirical Findings

1. **Which database records produce those directories?**  
   The 10 directories originate directly from the `public.folders` table in PostgreSQL. They are the 10 records where `parent_id IS NULL`:
   
   | Folder UUID | Folder Name | Parent ID | Owner ID | Created At (UTC) |
   |---|---|:---:|---|---|
   | `e60e7113-d0a9-456c-99ac-f32d96a6267b` | `Offline_Test_Folder` | `NULL` | `00000000-0000-0000-0000-000000000001` | 2026-11-10 01:17:38 |
   | `9d717e34-57e2-4a74-a8f4-b1f945379b7e` | `Offline_Test_Folder` | `NULL` | `00000000-0000-0000-0000-000000000001` | 2026-11-10 01:17:53 |
   | `37bdc641-5216-4481-bcda-d3a723f9f91a` | `Offline_Test_Folder` | `NULL` | `00000000-0000-0000-0000-000000000001` | 2026-11-10 01:18:56 |
   | `e3f7fb68-8144-4a94-b80e-76928a718e35` | `Offline_Test_Folder` | `NULL` | `00000000-0000-0000-0000-000000000001` | 2026-11-10 01:19:22 |
   | `de2eea46-2883-4671-80d6-dc9103ced175` | `Offline_Test_Folder` | `NULL` | `00000000-0000-0000-0000-000000000001` | 2026-11-10 01:19:58 |
   | `1a1a805a-844c-4278-b0a0-b00aa482c08b` | `Offline_Test_Folder` | `NULL` | `00000000-0000-0000-0000-000000000001` | 2026-11-10 01:20:29 |
   | `8a98ed44-53d9-404d-b208-5622ae6c3b1c` | `Offline_Test_Folder` | `NULL` | `00000000-0000-0000-0000-000000000001` | 2026-11-10 01:21:07 |
   | `d7ef0c6f-20a3-4d5c-92ba-8b1a7502a446` | `Offline_Test_Folder` | `NULL` | `00000000-0000-0000-0000-000000000001` | 2026-11-10 01:22:14 |
   | `58a6b865-a942-412b-9235-6141bbc27b84` | `Offline_Test_Folder` | `NULL` | `00000000-0000-0000-0000-000000000001` | 2026-11-10 01:23:15 |
   | `4d9fde96-389b-4b22-8759-7bac9569678b` | `Offline_Test_Folder` | `NULL` | `00000000-0000-0000-0000-000000000001` | 2026-11-10 01:51:05 |

2. **Are they the 10 root `Offline_Test_Folder` records?**  
   **YES**. Every one of the 10 directories is an `Offline_Test_Folder` instance created during previous automated offline test harness runs. Each has a matching child subfolder named `Subfolder_Alpha` (accounting for all 20 folder rows in the table).

3. **Which user owns each record?**  
   Every single folder record is owned by `00000000-0000-0000-0000-000000000001`, which corresponds to `admin@nkbmanufacturing.com` (username `superadmin`). Because the administrator was the identity used to run offline staging tests, all test fixtures were stamped with the admin user's UUID.

4. **Is the frontend displaying physical directories or database folder records?**  
   The frontend is displaying **database records** from `public.folders`. It is **NOT** reading raw physical storage directories in My Drive. (Physical drive directories are only enumerated when an administrator explicitly accesses the Drive Browser view at `/storage/volumes/:volumeId/browse`).

5. **Which API endpoint and SQL query supply the displayed records?**  
   - **Endpoint**: `GET /api/files`
   - **Controller Function**: `getExplorerItems(req, res)` in [`server/controllers/fileController.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/fileController.js#L37-L117)
   - **Executed SQL**:
     ```sql
     SELECT * FROM folders 
     WHERE is_trashed = FALSE 
       AND parent_id IS NULL 
       AND is_shared_drive = FALSE 
       AND owner_id = $1;
     ```

6. **Are ownership and access permissions actually enforced server-side?**  
   - **At the Root Level (`parent_id IS NULL`)**: Ownership filtering **IS** present (`owner_id = $1`). If a new user with a distinct UUID were logged in, they would currently receive zero root folders.
   - **Inside Subfolders (`parent_id IS NOT NULL`) — CRITICAL VULNERABILITY**:  
     Inspection of [`server/controllers/fileController.js#L107-L111`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/fileController.js#L107-L111) shows:
     ```javascript
     } else {
       folderQuery += ' AND parent_id = $1';
       fileQuery += ' AND folder_id = $1';
       folderParams.push(folderId);
       fileParams.push(folderId);
     }
     ```
     **Defect Found**: When browsing a folder by ID, the query filters solely by `parent_id = $1` with **NO `owner_id` check**, **NO recursive parent permission check**, and **NO share validation**! Any authenticated user who knows or guesses a target `folderId` UUID can enumerate all files and subfolders within another user's private folder (Insecure Direct Object Reference / IDOR).

---

## 2. REQUIRED MY DRIVE BEHAVIOR & ZERO-KNOWLEDGE ARCHITECTURE

To guarantee enterprise-grade privacy equivalent to Google Drive for Business, the system must enforce strict zero-knowledge defaults:

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                             ENTERPRISE PRIVACY INVARIANTS                                │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Absolute Isolation: Newly registered users start with an empty My Drive.              │
│ 2. Private Defaults: Every folder created and file uploaded defaults to PRIVATE.         │
│ 3. Explicit Access Only: Content is visible ONLY to the owner, unless shared via        │
│    an active, unexpired record in 'file_shares'.                                         │
│ 4. No Physical Leakage: Physical storage volumes (J:, D:, G:, C:) NEVER appear in       │
│    My Drive. They are confined to administrative storage management.                     │
│ 5. Test Data Segregation: Existing test artifacts are flagged is_quarantined = TRUE     │
│    and is_test_data = TRUE, hiding them from all standard user views.                   │
│ 6. Dual-Tier Server Enforcement: Permissions are verified at both the database query     │
│    level and Storage Agent chunk streaming boundary.                                     │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Backend Enforcement Specifications

In [`server/controllers/fileController.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/fileController.js), the root and nested queries must be redesigned to enforce ownership and quarantine boundaries unconditionally:

```javascript
// PROPOSED SERVER-SIDE ENFORCEMENT IN getExplorerItems
if (!folderId || folderId === 'root' || folderId === 'null') {
  // ROOT MY DRIVE: Show only un-quarantined items owned by the user
  folderQuery += ' AND parent_id IS NULL AND is_shared_drive = FALSE AND owner_id = $1 AND is_quarantined = FALSE AND is_test_data = FALSE';
  fileQuery += ' AND folder_id IS NULL AND owner_id = $1 AND is_quarantined = FALSE AND is_test_data = FALSE';
  folderParams.push(userId);
  fileParams.push(userId);
} else {
  // NESTED FOLDER: Must verify caller owns or has authorized share on parent folder
  const accessCheck = await verifyFolderAccess(userId, userDeptId, folderId, 'VIEWER');
  if (!accessCheck.allowed) {
    return res.status(403).json({ error: 'Access denied: You do not possess permission to view this directory.' });
  }
  folderQuery += ' AND parent_id = $1 AND is_quarantined = FALSE AND is_test_data = FALSE';
  fileQuery += ' AND folder_id = $1 AND is_quarantined = FALSE AND is_test_data = FALSE';
  folderParams.push(folderId);
  fileParams.push(folderId);
}
```

---

## 3. EXPLICIT SHARING WORKFLOW & ACCESS MODEL

When creating folders or files, the creation payload must guarantee zero public exposure by default.

### 3.1 Creation Defaults (Zero-Exposure Policy)
- **Visibility**: `PRIVATE`
- **Owner**: `req.user.id` (Enforced from verified JWT; never from request body)
- **Department Association**: `req.user.department_id` (For departmental reporting, not automatic access)
- **Authorized Users**: Owner only
- **Department Sharing**: Disabled (`is_department_root = FALSE`)
- **Public Link**: Disabled (`share_token = NULL`, `is_public = FALSE`)

### 3.2 Granular Sharing Grant Workflow

```
[User Action: Share Folder/File]
        │
        ├── Target: Individual User Account (UUID)
        │     └── Insert file_shares(shared_with_user_id = UUID, shared_with_department_id = NULL)
        │
        ├── Target: Selected Department (Department ID)
        │     └── Policy Check: Caller must be DEPARTMENT_MANAGER, ADMIN, or SUPER ADMIN
        │     └── Insert file_shares(shared_with_user_id = NULL, shared_with_department_id = ID)
        │
        └── Target: Public Web Link (Optional)
              └── Generates 48-char cryptographically secure token
              └── Optional bcrypt-hashed password protection
              └── Mandatory expiration (1, 7, 30 days)
```

### 3.3 Strict Permission Tiers

| Tier | Directory List | File Preview | Binary Download | Upload Content | Rename / Move | Delete to Trash | Delegate Share |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **VIEWER** | **YES** | **YES** | **NO** | **NO** | **NO** | **NO** | **NO** |
| **DOWNLOADER** | **YES** | **YES** | **YES** | **NO** | **NO** | **NO** | **NO** |
| **CONTRIBUTOR** | **YES** | **YES** | **YES** | **YES** | **NO** | **NO** | **NO** |
| **EDITOR** | **YES** | **YES** | **YES** | **YES** | **YES** | **YES** | **NO** |

> [!CAUTION]
> **Privilege Escalation Barrier**: Sharing permissions cannot grant system roles (`SUPER ADMIN`, `ADMIN`) or department leadership. The database constraint `chk_file_shares_perm_level` rejects any string outside `('VIEWER', 'DOWNLOADER', 'CONTRIBUTOR', 'EDITOR')`.

---

## 4. SHARING MANAGEMENT INTERFACE SPECIFICATION

The sharing management drawer/modal must provide granular visibility and instantaneous revocation controls:

### 4.1 Interface Component Structure
1. **Header**: Name of target folder/file, current owner identity, and badge (`Private`, `Shared with 3 users`, `Department Shared`).
2. **Access List**:
   - **User / Department Identity**: Avatar, full name, email, department badge.
   - **Access Type Indicator**: `Individual Employee` vs. `Department Workspace`.
   - **Permission Selector**: Dropdown (`Viewer`, `Downloader`, `Contributor`, `Editor`).
   - **Granted Metadata**: "Granted by [Admin Name] on [Date/Time]".
   - **Expiration Badge**: "Expires in 6 days" or "No expiration".
   - **Revoke Button**: Instant revocation action.
3. **Add Grantor Form**:
   - Autocomplete user search by email/name.
   - Department selector dropdown (governed by user's department or admin rights).
   - Permission tier selection.
   - Optional expiration selector (1 day, 7 days, 30 days, Custom, Never).

### 4.2 Dynamic Revocation & Propagation
- **Instant Revocation**: Executing `POST /api/shares/:id/revoke` sets `is_revoked = TRUE, revoked_at = CURRENT_TIMESTAMP, revoked_by = req.user.id`.
- **Inherited Tree Invalidation**: The single-query recursive CTE `verifyFileAccess` evaluates the entire ancestor tree on every download, preview, and listing request. Revoking a parent folder share instantly revokes access to all nested child items without requiring recursive database updates.
- **Department Transfer Immunity**: When an employee moves from Engineering to Finance (`users.department_id` updated), previous departmental shares instantly cease to match (`s.shared_with_department_id = req.user.department_id`), immediately terminating unauthorized access.

---

## 5. EXISTING TEST DATA: NON-DESTRUCTIVE ISOLATION PROPOSAL

### 5.1 Complete Test Data Inventory
- **PostgreSQL `folders`**: 20 records (10 root `Offline_Test_Folder`, 10 child `Subfolder_Alpha`).
- **PostgreSQL `files`**: 1 record (`889652510...jpg`, size 113,639 bytes, uploaded during live drive browser verification).
- **JSON Fallback (`server/data/nkb_cloud_db.json`)**: 2 mock file records (`NKB-Production-Drawing-2026.dwg`).
- **Physical Test Storage (`C:\NKB-Cloud-Offline-Test\Storage\test_uploads`)**: 7 binaries (`dummy_100MB.bin`, etc.).
- **Test Harness Fixtures (`C:\NKB-Cloud-Offline-Test\TestData`)**: 7 items (`dummy_*.bin`, `manifest.json`).

### 5.2 Non-Destructive Quarantine Strategy
To clean My Drive without deleting any test evidence or corrupting audit trails:
1. **Schema Extension (Migration 007)**:
   ```sql
   ALTER TABLE folders ADD COLUMN IF NOT EXISTS is_quarantined BOOLEAN DEFAULT FALSE NOT NULL;
   ALTER TABLE folders ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT FALSE NOT NULL;
   ALTER TABLE files ADD COLUMN IF NOT EXISTS is_quarantined BOOLEAN DEFAULT FALSE NOT NULL;
   ALTER TABLE files ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT FALSE NOT NULL;
   ```
2. **Targeted In-Place Flagging (Migration 007)**:
   ```sql
   UPDATE folders
   SET is_quarantined = TRUE, is_test_data = TRUE
   WHERE name IN ('Offline_Test_Folder', 'Subfolder_Alpha');

   UPDATE files
   SET is_quarantined = TRUE, is_test_data = TRUE
   WHERE name LIKE '%.bin' OR name LIKE 'dummy_%' OR name LIKE '889652510%';
   ```
3. **Application Layer Filtering**:
   All user queries (`getExplorerItems`, search, category, starred, recent) unconditionally filter `WHERE is_quarantined = FALSE AND is_test_data = FALSE`.
4. **Result**:
   - `admin@nkbmanufacturing.com` and all new accounts see a **completely empty, clean My Drive**.
   - Zero records are deleted from `public.folders` or `public.files`.
   - The 79 historical audit records remain 100% valid.
   - Physical test binaries in `C:\NKB-Cloud-Offline-Test` remain completely intact.

---

## 6. COMPREHENSIVE SECURITY TEST MATRIX

The following 9 security verification scenarios must be executed upon implementation authorization:

| Test ID | Test Scenario | Threat Vector / Bypass Attempt | Expected Security Enforcement | Verification Result |
|---|---|---|---|:---:|
| **SEC-01** | **User B Isolation** | User B logs in and loads My Drive. | Returns `{ folders: [], files: [] }`. 10 test folders are invisible. | **PENDING AUTH** |
| **SEC-02** | **Direct UUID Download** | User B attempts `GET /api/files/:id/download` for User A's private file. | `verifyFileAccess` fails; HTTP 403 Forbidden; logs `ACCESS_DENIED`. | **PENDING AUTH** |
| **SEC-03** | **Direct Folder Enumeration** | User B attempts `GET /api/files?folderId=<User_A_Folder_UUID>`. | Server validates parent folder access; HTTP 403 Forbidden. | **PENDING AUTH** |
| **SEC-04** | **Cross-Department Privacy** | Finance member attempts to access Engineering department folder. | `shared_with_department_id` does not match; HTTP 403 Forbidden. | **PENDING AUTH** |
| **SEC-05** | **Explicit Sharing Flow** | User A shares folder with User B as `VIEWER`. | User B can preview files; direct download and upload blocked (HTTP 403). | **PENDING AUTH** |
| **SEC-06** | **Instant Revocation** | User A revokes User B's share. | Subsequent request by User B immediately receives HTTP 403 Forbidden. | **PENDING AUTH** |
| **SEC-07** | **Expired Share Rejection** | User B accesses share where `expires_at < NOW()`. | Evaluated in SQL; HTTP 403 Forbidden; logs `SHARE_EXPIRED`. | **PENDING AUTH** |
| **SEC-08** | **Storage Agent Boundary** | Direct WebSocket request or unverified chunk stream attempt. | Express controller fails closed before issuing `READ_FILE_CHUNK`. | **PENDING AUTH** |
| **SEC-09** | **Physical Drive Protection** | Non-admin user attempts `/api/storage/volumes/:id/browse`. | `requireRole('SUPER ADMIN', 'ADMIN')` blocks request with HTTP 403. | **PENDING AUTH** |

---

## 7. MIGRATION DEPENDENCY & ROLLBACK STRATEGY

### 7.1 Migration Dependency Chain
1. **Migration 007 (`007_enterprise_departments_sharing_audit.sql`)**:
   - Adds `is_quarantined`, `is_test_data`, `is_department_root` to `folders` and `files`.
   - Adds `user_sessions`, `login_audit_events`, `file_activity_events`.
   - Updates `folders` and `files` with quarantine flags.
   - Enforces `chk_file_shares_perm_level`.
2. **Rollback Strategy (`007_enterprise_departments_sharing_audit_rollback.sql`)**:
   - Verified non-destructive: drops added columns and constraints.
   - Preserves baseline Migration 001 columns (`departments.created_at`, `departments.updated_at`).
   - Reverts schema cleanly without data loss.

---

## 8. FINAL DETERMINATION & VERDICT

# **AUDIT COMPLETE — AWAITING SEPARATE IMPLEMENTATION AUTHORIZATION**

**Summary of Conclusions**:
1. The 10 directories in My Drive are **database records** from `public.folders` (`Offline_Test_Folder`) owned by the administrator account, returned by `getExplorerItems` due to lack of quarantine filtering.
2. A critical IDOR gap was identified in subfolder browsing (`parent_id = $1` lacks ownership/permission validation).
3. The proposed architecture resolves all gaps via zero-knowledge creation defaults, single-query recursive CTE authorization, explicit 4-tier sharing, and non-destructive quarantine.
4. **Strict Read-Only Mode remains 100% active.** Implementation requires explicit administrative authorization.
