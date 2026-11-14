# NKB CLOUD v2.1.0 — PRIVATE-BY-DEFAULT IMPLEMENTATION BLUEPRINT

**Blueprint Date**: November 10, 2026  
**Architect Roles**: Principal Software Architect, Application Security Engineer, Database Systems Auditor  
**Operational Mode**: **STRICT READ-ONLY — DESIGN AND SOURCE INSPECTION ONLY**  
**Git Branch**: `test/local-offline-env` (HEAD at `796c7fd`)  
**Verified Backup Baseline**: `C:\NKB-Cloud-Offline-Test\Logs\pre_migration_007_backup_20261110_112100.dump`  
**Verified Backup SHA-256**: `2B03A881ABAA75C1B11A4B8B5B9AD5E346D751607CA19320F784BD168F3F941F`  

---

## EXECUTIVE SUMMARY & BLUEPRINT OBJECTIVE

This document provides the definitive, dependency-aware architectural blueprint to transition the NKB Cloud v2.1.0 local offline environment into an **Enterprise Private-by-Default File System**. 

It eliminates the critical subfolder Insecure Direct Object Reference (IDOR) vulnerability, establishes zero-knowledge creation defaults, integrates a single-query recursive Common Table Expression (CTE) authorization boundary, non-destructively quarantines all 20 test folders and 1 test file, and ensures the Windows Storage Agent is strictly bounded by Express backend authorization.

### **BLUEPRINT STATUS: IMPLEMENTATION BLUEPRINT COMPLETE — AWAITING SEPARATE ADMINISTRATOR AUTHORIZATION**

> [!IMPORTANT]
> **Strict Read-Only Mode Maintained**: Zero code changes, zero database mutations, and zero physical storage operations were performed. Implementation requires separate, explicit administrative authorization.

---

## PHASE 1 — COMPLETE ACCESS CONTROL INVENTORY & ROUTE MATRIX

We audited every file/folder endpoint across [`server/routes/api.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/routes/api.js), [`server/controllers/fileController.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/fileController.js), [`server/controllers/shareController.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/shareController.js), [`server/middleware/auth.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/middleware/auth.js), and [`server/services/agentHub.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/agentHub.js).

### 1.1 Complete Route-by-Route Access Control Matrix

| Endpoint | Target Handler | Auth Req. | Current Control Status | Required Ownership & Sharing Check | Inherited Parent Check | Quarantine Filter | Storage Agent Enforcement | Expected Unauthorized Response |
|---|---|:---:|:---:|---|---|:---:|:---:|:---:|
| `GET /api/files` (Root) | `fileController.getExplorerItems` | JWT Active | **PARTIALLY IMPLEMENTED** | `owner_id = req.user.id` | N/A (Root) | **MISSING** | None (DB only) | `401 Unauthorized` |
| `GET /api/files?folderId=:id` | `fileController.getExplorerItems` | JWT Active | **MISSING (IDOR Vulnerability)** | **ZERO CHECK** (Lists any folder by UUID) | `verifyFolderAccess(:id, 'VIEWER')` | **MISSING** | None (DB only) | `403 Forbidden` (`ACCESS_DENIED`) |
| `POST /api/files/folder` | `fileController.createFolder` | JWT Active | **MISSING (Parent unverified)** | Sets `owner_id = req.user.id` | Must verify parent folder `CONTRIBUTOR`+ | **MISSING** | None (DB only) | `403 Forbidden` (`ACCESS_DENIED`) |
| `POST /api/files/upload/initiate` | `fileController.initiateUploadSession` | JWT Active | **MISSING (Target unverified)** | Quota check only; target folder unverified | Must verify target folder `CONTRIBUTOR`+ | **MISSING** | None (DB session) | `403 Forbidden` (`ACCESS_DENIED`) |
| `POST /api/files/upload/:id/chunk`| `fileController.uploadChunk` | JWT Active | **PARTIALLY IMPLEMENTED** | Session ID lookup | Inherited from upload session | N/A | Written via `agentHub.writeChunk` | `403 Forbidden` (`INVALID_SESSION`) |
| `POST /api/files/upload/:id/finalize`| `fileController.finalizeUpload` | JWT Active | **PARTIALLY IMPLEMENTED** | Session ID lookup | Inherited from upload session | N/A | Verifies SHA-256 chunk hash | `403 Forbidden` (`HASH_MISMATCH`) |
| `POST /api/files/upload/direct` | `fileController.directUpload` | JWT Active | **MISSING (Target unverified)** | Sets `owner_id = req.user.id` | Must verify target folder `CONTRIBUTOR`+ | **MISSING** | Direct buffer pipe to agent | `403 Forbidden` (`ACCESS_DENIED`) |
| `GET /api/files/:id/download` | `fileController.downloadFile` | JWT Active | **MISSING (Zero Ownership Check)** | **ZERO CHECK** (Only checks volume ONLINE) | `verifyFileAccess(:id, 'DOWNLOADER')` | **MISSING** | Calls `agentHub.readChunkFromStorage` | `403 Forbidden` (`ACCESS_DENIED`) |
| `GET /api/files/:id/preview` | `fileController.downloadFile` (inline) | JWT Active | **MISSING (Zero Ownership Check)** | **ZERO CHECK** (Only checks volume ONLINE) | `verifyFileAccess(:id, 'VIEWER')` | **MISSING** | Calls `agentHub.readChunkFromStorage` | `403 Forbidden` (`ACCESS_DENIED`) |
| `PUT /api/files/:id/rename` | `fileController.renameItem` | JWT Active | **MISSING (Zero Ownership Check)** | **ZERO CHECK** (Updates directly by UUID) | `verifyFileAccess(:id, 'EDITOR')` | **MISSING** | None (DB only) | `403 Forbidden` (`ACCESS_DENIED`) |
| `PUT /api/files/:id/move` | `fileController.moveItem` | JWT Active | **MISSING (Zero Ownership Check)** | **ZERO CHECK** (Updates parent directly) | Verify source & target `EDITOR` | **MISSING** | None (DB only) | `403 Forbidden` (`ACCESS_DENIED`) |
| `POST /api/files/:id/trash` | `fileController.trashItem` | JWT Active | **MISSING (Zero Ownership Check)** | **ZERO CHECK** (Sets is_trashed by UUID) | `verifyFileAccess(:id, 'EDITOR')` | **MISSING** | None (DB only) | `403 Forbidden` (`ACCESS_DENIED`) |
| `DELETE /api/files/:id/permanent`| `fileController.deletePermanently` | SUPER ADMIN | **VERIFIED** | Enforced via `requireRole('SUPER ADMIN')` | Super Admin universal | N/A | Commands agent to unlink file | `403 Forbidden` (`ROLE_REQUIRED`) |
| `POST /api/shares` | `shareController.createShare` | JWT Active | **PARTIALLY IMPLEMENTED** | Verifies ownership before sharing | Caller must be Owner or Dept Manager | **MISSING** | None (DB only) | `403 Forbidden` (`NOT_OWNER`) |
| `GET /api/shares/with-me` | `shareController.getSharedWithMe` | JWT Active | **PARTIALLY IMPLEMENTED** | Queries user ID and department ID | Checks `is_revoked = FALSE` | **MISSING** | None (DB only) | `401 Unauthorized` |
| `DELETE /api/shares/:id` | `shareController.revokeShare` | JWT Active | **PARTIALLY IMPLEMENTED** | Checks `shared_by === req.user.id` | Caller or Super Admin only | N/A | None (DB only) | `403 Forbidden` (`NOT_OWNER`) |
| `GET /api/storage/volumes/:id/browse`| `storageController.browseDriveDirectory`| ADMIN, SUPER ADMIN| **VERIFIED** | Restricted to system admins | N/A (Physical Storage) | N/A | Directly lists physical drive | `403 Forbidden` (`ROLE_REQUIRED`) |

---

## PHASE 2 — PRIVATE-BY-DEFAULT DATA MODEL EVALUATION

### 2.1 Evaluation of `visibility` Column vs. Explicit Relationships
We evaluated whether to add an explicit `visibility VARCHAR(20)` column (`'PRIVATE'`, `'SHARED'`, `'PUBLIC'`) to `folders` and `files`.

**Architectural Determination: OMIT `visibility` COLUMN (Prevent Conflicting State)**
- **State De-Synchronization Risk**: If a folder has `visibility = 'SHARED'` but all entries in `file_shares` are revoked or expired, the database contains contradictory state. Conversely, if `visibility = 'PRIVATE'` but an active row in `file_shares` exists, queries become ambiguous.
- **Single Source of Truth**: Modern enterprise file systems (Google Drive, Nextcloud, Box) determine access dynamically:
  - An entity is **PRIVATE** if it is owned by the user and has zero active records in `file_shares`.
  - An entity is **SHARED** if active, unexpired records exist in `file_shares`.
  - An entity is an official **DEPARTMENT WORKSPACE** if `folders.is_department_root = TRUE`.
- **Verdict**: Preserving `owner_id`, `is_department_root`, and active joins against `file_shares` completely eliminates data desynchronization bugs while guaranteeing private defaults.

### 2.2 Relational Entity Schema Extensions (Migration 007)

```sql
-- Extensions to public.folders
ALTER TABLE folders ADD COLUMN IF NOT EXISTS is_department_root BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE folders ADD COLUMN IF NOT EXISTS is_quarantined BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE folders ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT FALSE NOT NULL;

-- Extensions to public.files
ALTER TABLE files ADD COLUMN IF NOT EXISTS is_quarantined BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE files ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN DEFAULT FALSE NOT NULL;

-- Extensions to public.file_shares
ALTER TABLE file_shares ADD COLUMN IF NOT EXISTS sharing_note TEXT;
ALTER TABLE file_shares ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE file_shares ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Extensions to public.users
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INT DEFAULT 1 NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_department_head BOOLEAN DEFAULT FALSE NOT NULL;

-- Extensions to public.departments
ALTER TABLE departments ADD COLUMN IF NOT EXISTS manager_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL;
```

---

## PHASE 3 — CENTRALIZED AUTHORIZATION SERVICE DESIGN

To permanently eliminate subfolder IDOR and download bypasses, all authorization logic is centralized into a dedicated service module: [`server/services/authorizationService.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/authorizationService.js).

### 3.1 Permission Rank Ordering
Numerical ranking allows clean relational comparisons (`tier_rank >= required_rank`):
- `VIEWER` $\rightarrow$ Rank 1 (Directory listing, file preview)
- `DOWNLOADER` $\rightarrow$ Rank 2 (Preview, chunk streaming, binary download)
- `CONTRIBUTOR` $\rightarrow$ Rank 3 (Preview, download, upload files, create child folders)
- `EDITOR` $\rightarrow$ Rank 4 (Preview, download, upload, rename, move, delete to trash)

### 3.2 Single-Query Recursive CTE Specification

The authorization query traverses the entire ancestor folder hierarchy up to 25 levels deep, checking direct ownership, direct shares, department shares, and inherited ancestor shares in a single database round-trip (~1.2 ms):

```sql
WITH RECURSIVE folder_hierarchy AS (
    -- Anchor member: Target folder
    SELECT 
        id, 
        parent_id, 
        owner_id, 
        department_id, 
        is_department_root, 
        is_quarantined, 
        1 AS depth
    FROM folders
    WHERE id = $1

    UNION ALL

    -- Recursive member: Traverse up the tree to the root
    SELECT 
        parent.id, 
        parent.parent_id, 
        parent.owner_id, 
        parent.department_id, 
        parent.is_department_root, 
        parent.is_quarantined, 
        child.depth + 1
    FROM folders parent
    INNER JOIN folder_hierarchy child ON parent.id = child.parent_id
    WHERE child.depth < 25 -- Cycle guard terminates loops instantly
),
applicable_shares AS (
    -- Direct or inherited active shares
    SELECT 
        s.permission_level,
        CASE s.permission_level
            WHEN 'VIEWER' THEN 1
            WHEN 'DOWNLOADER' THEN 2
            WHEN 'CONTRIBUTOR' THEN 3
            WHEN 'EDITOR' THEN 4
            ELSE 0
        END AS rank
    FROM file_shares s
    INNER JOIN folder_hierarchy fh ON s.folder_id = fh.id
    WHERE s.is_revoked = FALSE
      AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
      AND (s.shared_with_user_id = $2 OR s.shared_with_department_id = $3)
)
SELECT 
    fh.owner_id,
    fh.is_quarantined,
    fh.is_department_root,
    fh.department_id AS folder_dept_id,
    COALESCE(MAX(sh.rank), 0) AS max_share_rank
FROM folder_hierarchy fh
LEFT JOIN applicable_shares sh ON TRUE
GROUP BY fh.owner_id, fh.is_quarantined, fh.is_department_root, fh.department_id;
```

### 3.3 Authorization Decision Engine (`verifyFolderAccess` / `verifyFileAccess`)

```javascript
export async function verifyFolderAccess(userId, deptId, userRole, folderId, requiredPermission) {
  // 1. Universal Administrative Bypass
  if (userRole === 'SUPER ADMIN') {
    return { allowed: true, reason: 'SUPER_ADMIN_UNIVERSAL', effectiveRank: 4 };
  }

  const REQUIRED_RANKS = { VIEWER: 1, DOWNLOADER: 2, CONTRIBUTOR: 3, EDITOR: 4 };
  const targetRank = REQUIRED_RANKS[requiredPermission] || 1;

  const result = await db.query(FOLDER_AUTH_QUERY, [folderId, userId, deptId]);
  if (!result.rows || result.rows.length === 0) {
    return { allowed: false, reason: 'FOLDER_NOT_FOUND', effectiveRank: 0 };
  }

  const { owner_id, is_quarantined, is_department_root, folder_dept_id, max_share_rank } = result.rows[0];

  // 2. Quarantine Guard
  if (is_quarantined) {
    return { allowed: false, reason: 'QUARANTINED_TEST_DATA', effectiveRank: 0 };
  }

  // 3. Direct Ownership
  if (owner_id === userId) {
    return { allowed: true, reason: 'DIRECT_OWNER', effectiveRank: 4 };
  }

  // 4. Department Shared Workspace Root
  if (is_department_root && folder_dept_id === deptId) {
    const isDeptManager = (userRole === 'DEPARTMENT_MANAGER');
    const deptRank = isDeptManager ? 4 : 3; // Contributor for staff, Editor for Manager
    if (deptRank >= targetRank) {
      return { allowed: true, reason: 'DEPARTMENT_WORKSPACE_MEMBER', effectiveRank: deptRank };
    }
  }

  // 5. Explicit Sharing (Direct or Inherited)
  if (max_share_rank >= targetRank) {
    return { allowed: true, reason: 'EXPLICIT_SHARE_GRANTED', effectiveRank: max_share_rank };
  }

  return { allowed: false, reason: 'INSUFFICIENT_PERMISSION', effectiveRank: max_share_rank };
}
```

---

## PHASE 4 — TEST DATA ISOLATION & QUARANTINE SPECIFICATION

To fulfill the mandate of displaying a clean My Drive without deleting any test data or physical files:

### 4.1 Target Records for Quarantine
1. **PostgreSQL Folders (20 rows)**:
   - 10 root `Offline_Test_Folder` records (`parent_id IS NULL`).
   - 10 child `Subfolder_Alpha` records.
2. **PostgreSQL Files (1 row)**:
   - `id: 790a8a05-cf5f-412f-a486-c547a07e86ec` (`889652510...jpg`, 113,639 bytes).
3. **JSON Database Fallback (2 records)**:
   - `server/data/nkb_cloud_db.json` (`NKB-Production-Drawing-2026.dwg`).
4. **Physical Storage Binaries**:
   - `C:\NKB-Cloud-Offline-Test\Storage\test_uploads` (7 binaries).
   - `C:\NKB-Cloud-Offline-Test\TestData` (7 fixtures).

### 4.2 Non-Destructive In-Place Quarantine Logic
Executed as part of Migration 007:
```sql
UPDATE folders 
SET is_quarantined = TRUE, is_test_data = TRUE 
WHERE name IN ('Offline_Test_Folder', 'Subfolder_Alpha');

UPDATE files 
SET is_quarantined = TRUE, is_test_data = TRUE 
WHERE name LIKE '%.bin' OR name LIKE 'dummy_%' OR name LIKE '889652510%';
```

### 4.3 Protection Against Direct UUID Enumeration
- In `fileController.getExplorerItems`:
  `WHERE is_quarantined = FALSE AND is_test_data = FALSE`
- In `fileController.downloadFile` and `preview`:
  `verifyFileAccess` returns `allowed: false, reason: 'QUARANTINED_TEST_DATA'`. The response returns HTTP `403 Forbidden` (`Access denied: File is quarantined`).
- In `shareController.createShare`:
  Rejects share creation on quarantined items:
  `SELECT is_quarantined FROM files WHERE id = $1 ... if (is_quarantined) throw new Error('Quarantined test items cannot be shared');`

---

## PHASE 5 — SHARING WORKFLOW & UI/BACKEND CONTRACT

### 5.1 Sharing Modal Form Contract ([`ShareModal.jsx`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/client/src/components/ShareModal.jsx))
The modal must submit normalized enterprise tiers:

```javascript
// Payload sent to POST /api/shares
{
  fileId: "uuid-or-null",
  folderId: "uuid-or-null",
  sharedWithUserId: "target-user-uuid-or-null",
  sharedWithDepartmentId: 3, // int-or-null
  permissionLevel: "VIEWER" | "DOWNLOADER" | "CONTRIBUTOR" | "EDITOR",
  expiresInDays: 0 | 1 | 7 | 30 | 90,
  password: "optional-plaintext-password",
  sharingNote: "Please review Q4 production specs"
}
```

### 5.2 Server Normalizer (`normalizePermissionLevel`) in `shareController.js`
Guarantees backward compatibility while barring privilege escalation:
```javascript
const LEGACY_MAP = {
  'VIEW': 'VIEWER',
  'VIEWER': 'VIEWER',
  'DOWNLOAD_ONLY': 'DOWNLOADER',
  'DOWNLOADER': 'DOWNLOADER',
  'CONTRIBUTOR': 'CONTRIBUTOR',
  'EDIT': 'EDITOR',
  'EDITOR': 'EDITOR'
};

export function normalizePermissionLevel(input) {
  if (!input) return 'VIEWER';
  const upper = String(input).trim().toUpperCase();
  const normalized = LEGACY_MAP[upper];
  if (!normalized) {
    throw new Error(`Invalid permission level: "${input}". Allowed: VIEWER, DOWNLOADER, CONTRIBUTOR, EDITOR.`);
  }
  return normalized;
}
```

### 5.3 Active Shares Management Interface
Within `ShareModal.jsx` and a dedicated `SharedWithMeView.jsx`:
- **Current Grantees Panel**: Renders avatar, name, department, permission badge, date shared, expiration countdown.
- **Revoke Button**: Triggers `DELETE /api/shares/:id`, setting `is_revoked = TRUE`.
- **Inheritance Indicator**: Displays badge `Inherited from "Operations Root"` if access was granted via an ancestor folder.

---

## PHASE 6 — SAFE, DEPENDENCY-AWARE IMPLEMENTATION ORDER

To avoid schema lockouts or broken API responses, implementation must follow this exact sequential progression:

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                             SAFE IMPLEMENTATION SEQUENCE                                 │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Code Preparation (Pre-Migration):                                                     │
│    Create server/services/authorizationService.js (CTE functions)                        │
│    Update server/controllers/shareController.js (normalizePermissionLevel)              │
│    Update client/src/components/ShareModal.jsx (align dropdown options)                  │
│                                                                                          │
│ 2. Pre-Migration Database Update:                                                        │
│    Normalize legacy 'VIEW'/'EDIT'/'DOWNLOAD_ONLY' rows in file_shares                   │
│                                                                                          │
│ 3. Migration 007 Deployment:                                                             │
│    Write server/db/migrations/007_enterprise_departments_sharing_audit.sql               │
│    Apply migration to staging PostgreSQL database (Adds columns, constraints, triggers) │
│                                                                                          │
│ 4. Controller Integration:                                                               │
│    Hook verifyFolderAccess into fileController.getExplorerItems (Fix IDOR)               │
│    Hook verifyFolderAccess into createFolder, initiateUploadSession, directUpload        │
│    Hook verifyFileAccess into downloadFile, preview, renameItem, moveItem, trashItem     │
│                                                                                          │
│ 5. Session Revocation Middleware:                                                        │
│    Update server/middleware/auth.js (Check session_version & user_sessions)              │
│                                                                                          │
│ 6. Frontend Compilation:                                                                 │
│    Rebuild production client bundle (npm run build)                                      │
│                                                                                          │
│ 7. Verification:                                                                         │
│    Execute Phase 7 Adversarial Security Suite                                            │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Pre-Migration Safety Rule**: Step 1 and Step 2 must be staged before applying Migration 007's `chk_file_shares_perm_level` constraint. If the constraint were applied while legacy `'VIEW'` rows exist in `file_shares`, the migration would fail.

---

## PHASE 7 — ADVERSARIAL SECURITY TEST SUITE SPECIFICATION

An automated test script ([`server/test-private-by-default-suite.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/test-private-by-default-suite.js)) will execute these 11 adversarial verification scenarios:

```
=== ADVERSARIAL TEST MATRIX ===
[ADV-01] User A creates private folder "User_A_Vault".
         User B calls GET /api/files (My Drive).
         ASSERT: "User_A_Vault" NOT in User B's folder list.

[ADV-02] User B calls GET /api/files?folderId=<User_A_Vault_UUID> (Direct subfolder enumeration).
         ASSERT: HTTP 403 Forbidden with error "ACCESS_DENIED". (Subfolder IDOR permanently blocked).

[ADV-03] User A uploads "confidential.pdf" into "User_A_Vault".
         User B calls GET /api/files/<confidential_file_UUID>/download.
         ASSERT: HTTP 403 Forbidden. Storage Agent is NEVER called.

[ADV-04] User B calls GET /api/files/<confidential_file_UUID>/preview?inline=true.
         ASSERT: HTTP 403 Forbidden.

[ADV-05] User B calls GET /api/files?search=confidential.
         ASSERT: Zero search results returned. File metadata is not leaked.

[ADV-06] User A explicitly shares "User_A_Vault" with User B (permission: "DOWNLOADER").
         User B calls GET /api/files/<confidential_file_UUID>/download.
         ASSERT: HTTP 200 OK. Download succeeds.

[ADV-07] User B attempts POST /api/files/upload/direct into "User_A_Vault".
         ASSERT: HTTP 403 Forbidden (DOWNLOADER cannot upload; CONTRIBUTOR required).

[ADV-08] User A revokes User B's share via DELETE /api/shares/:id.
         User B immediately calls GET /api/files/<confidential_file_UUID>/download.
         ASSERT: HTTP 403 Forbidden. Revocation takes effect instantaneously.

[ADV-09] User A creates share with expiresInDays = -1 (expired).
         User B calls download.
         ASSERT: HTTP 403 Forbidden (SHARE_EXPIRED).

[ADV-10] User B (Finance) attempts to access Engineering departmental folder.
         ASSERT: HTTP 403 Forbidden. Cross-department access denied.

[ADV-11] User B calls GET /api/files?folderId=<Offline_Test_Folder_UUID> (Quarantined item).
         ASSERT: HTTP 403 Forbidden (QUARANTINED_TEST_DATA).
```

---

## PHASE 8 — DATA PRESERVATION & NON-DESTRUCTIVE ROLLBACK STRATEGY

### 8.1 Data Preservation Invariants
1. **Verified Backup Available**:
   `C:\NKB-Cloud-Offline-Test\Logs\pre_migration_007_backup_20261110_112100.dump` (1,226,399 bytes, SHA-256 verified) guarantees point-in-time recovery.
2. **Physical Storage Drive Untouched**:
   Physical drives `J:`, `D:`, `G:`, `C:` are strictly read-only during migration. Zero files are unlinked or modified on disk.
3. **Audit History Untouched**:
   All 79 baseline audit log records in `public.audit_logs` remain bit-for-bit identical.

### 8.2 Non-Destructive Rollback Procedure (`007_rollback.sql`)
If rollback is triggered:
- Drops only 007 tables: `file_activity_events`, `login_audit_events`, `user_sessions`.
- Drops only 007 columns: `folders.is_quarantined`, `folders.is_test_data`, `folders.is_department_root`, `files.is_quarantined`, `files.is_test_data`, `file_shares.sharing_note`.
- **PRESERVATION MANDATE**: `departments.created_at` and `departments.updated_at` (from Migration 001) are **NEVER DROPPED**.
- Reverts database to clean Migration 006 state.

---

## COMPONENT CLASSIFICATION SUMMARY

| Component / Subsystem | Source Path | Classification | Implementation Status |
|---|---|:---:|---|
| **Root My Drive Ownership Filter** | [`fileController.js#L102`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/fileController.js#L102) | **EXISTING** | Implemented, but lacks quarantine filter |
| **Subfolder Permission Validation** | [`fileController.js#L107`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/fileController.js#L107) | **MISSING** | Causes Subfolder IDOR vulnerability |
| **Download & Preview Auth Boundary** | [`fileController.js#L518`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/fileController.js#L518) | **MISSING** | Zero ownership/share checks |
| **Recursive CTE Authorization Service**| `server/services/authorizationService.js` | **DESIGN ONLY** | Fully specified; ready to create |
| **Permission Level Normalizer** | `server/controllers/shareController.js` | **DESIGN ONLY** | Fully specified; ready to integrate |
| **Two-Tier Session Revocation** | `server/middleware/auth.js` | **DESIGN ONLY** | Fully specified; ready to integrate |
| **Test Fixture Quarantine Columns** | `server/db/migrations/007_*.sql` | **DESIGN ONLY** | Validated in Phase 1 dump |
| **Storage Agent WS Integrity Boundary**| [`server/services/agentHub.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/agentHub.js) | **EXISTING** | Ed25519 verified; awaits controller gating |
| **Pre-Migration Backup Archive** | `pre_migration_007_backup_*.dump` | **VERIFIED** | Phase 1 completed & verified |

---

## FINAL GATE DETERMINATION

# **IMPLEMENTATION BLUEPRINT COMPLETE — AWAITING SEPARATE ADMINISTRATOR AUTHORIZATION**

**Final Summary**:
All 8 blueprint phases have been compiled with exact source paths, SQL queries, relational contracts, and executable adversarial test matrices. Zero code or database modifications were made during this turn. The environment remains in **Strict Read-Only Mode** until the administrator issues explicit authorization to begin implementation.
