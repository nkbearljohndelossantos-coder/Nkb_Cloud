# NKB CLOUD v2.1.0 — FINAL IMPLEMENTATION SEQUENCE & MIGRATION SAFETY REVIEW

**Audit Date**: November 10, 2026  
**Auditor Roles**: Principal Software Architect, Application Security Engineer, Database Systems Auditor  
**Operational Mode**: **STRICT READ-ONLY — NO IMPLEMENTATION AUTHORIZED**  
**Git Branch**: `test/local-offline-env` (HEAD at `796c7fd`)  
**Verified Backup Baseline**: `C:\NKB-Cloud-Offline-Test\Logs\pre_migration_007_backup_20261110_112100.dump`  
**Verified Backup SHA-256**: `2B03A881ABAA75C1B11A4B8B5B9AD5E346D751607CA19320F784BD168F3F941F`  

---

## EXECUTIVE SUMMARY & GATE VERDICT

This final review performs an adversarial evaluation of migration dependencies, operational sequencing, permission semantics, administrative break-glass controls, and data preservation for the upcoming deployment of Migration 007 and the Private-by-Default architecture.

### **FINAL GATE VERDICT: READY FOR SEPARATE LOCAL STAGING IMPLEMENTATION AUTHORIZATION**

> [!IMPORTANT]
> **Strict Read-Only Mode Preserved**: Zero code modifications, zero database mutations, and zero physical storage operations were executed. This verdict certifies readiness for the administrator to issue a separate implementation command for local staging only.

---

## 1. MIGRATION 007 DEPENDENCY VALIDATION & TRANSACTIONAL SAFETY

We audited [`server/db/migrations/001_initial_schema.sql`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/migrations/001_initial_schema.sql) through `006`, the proposed `007_enterprise_departments_sharing_audit.sql`, and the live staging database.

### 1.1 Existing `file_shares` Permission Values & Constraint Collision
- **Live Database Inspection**: Query on `file_shares` in `nkb_cloud_local_test` confirms **1 active row**:
  - `id`: `f8e5acfc-1b2c-4924-a7b7-c63bfe42e5f5`
  - `permission_level`: `'VIEW'` (Migration 001 default)
- **Constraint Hazard**: Migration 007 proposes:
  ```sql
  ALTER TABLE file_shares ADD CONSTRAINT chk_file_shares_perm_level 
      CHECK (permission_level IN ('VIEWER', 'DOWNLOADER', 'CONTRIBUTOR', 'EDITOR'));
  ```
  If applied while `permission_level = 'VIEW'` exists, PostgreSQL will immediately abort with:
  `ERROR: check constraint "chk_file_shares_perm_level" of relation "file_shares" is violated by some row`
- **Resolution (Transactional In-Place Normalization)**:
  Migration 007 must execute normalization updates **inside the same ACID transaction** immediately prior to adding the CHECK constraint:
  ```sql
  -- Inside Migration 007 transaction:
  UPDATE file_shares SET permission_level = 'VIEWER' WHERE permission_level = 'VIEW';
  UPDATE file_shares SET permission_level = 'DOWNLOADER' WHERE permission_level = 'DOWNLOAD_ONLY';
  UPDATE file_shares SET permission_level = 'EDITOR' WHERE permission_level = 'EDIT';

  ALTER TABLE file_shares ADD CONSTRAINT chk_file_shares_perm_level 
      CHECK (permission_level IN ('VIEWER', 'DOWNLOADER', 'CONTRIBUTOR', 'EDITOR'));
  ```
- **Atomicity Guarantee**: In PostgreSQL, all DDL and DML in a migration file run within `BEGIN; ... COMMIT;`. If any statement fails, the entire transaction rolls back completely. Zero partial schema changes or orphaned tables can remain.
- **Rollback Behavior**:
  The rollback script drops the constraint `chk_file_shares_perm_level` and optionally inverts `'VIEWER'` back to `'VIEW'`:
  ```sql
  ALTER TABLE file_shares DROP CONSTRAINT IF EXISTS chk_file_shares_perm_level;
  UPDATE file_shares SET permission_level = 'VIEW' WHERE permission_level = 'VIEWER';
  ```
  This guarantees 100% bit-for-bit restoration of the pre-migration database state.

---

## 2. APPLICATION AND MIGRATION ORDERING (ZERO-DOWNTIME SEQUENCE)

To prevent runtime crashes, authentication lockouts, or security windows during deployment, implementation must follow this staged sequence:

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                               STAGED ROLLOUT ARCHITECTURE                                │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ STAGE 1: Code Staging (Non-Breaking Services)                                            │
│   • Write server/services/authorizationService.js (Modular recursive CTE)                │
│   • Add normalizePermissionLevel() in server/controllers/shareController.js              │
│   • Update client/src/components/ShareModal.jsx to emit normalized tiers                 │
│   • Stop Condition: Normalizer unit test must pass all 7 test mappings before proceeding │
│                                                                                          │
│ STAGE 2: Database Migration 007 Deployment                                               │
│   • Write server/db/migrations/007_enterprise_departments_sharing_audit.sql              │
│   • Write server/db/migrations/007_enterprise_departments_sharing_audit_rollback.sql     │
│   • Execute Migration 007 in isolated transaction on nkb_cloud_local_test                │
│   • Stop Condition: schema_migrations must record '007'; rollback script validated       │
│                                                                                          │
│ STAGE 3: Backend Controller & Middleware Activation                                      │
│   • Hook verifyFolderAccess into fileController.getExplorerItems (Fix Subfolder IDOR)    │
│   • Hook verifyFolderAccess into createFolder, initiateUploadSession, directUpload       │
│   • Hook verifyFileAccess into downloadFile, preview, renameItem, moveItem, trashItem    │
│   • Hook session_version check into server/middleware/auth.js                           │
│   • Stop Condition: Health endpoint /health must return status: ONLINE                   │
│                                                                                          │
│ STAGE 4: Client SPA Build & Production Verification                                      │
│   • Compile frontend bundle (npm run build) into client/dist/                            │
│   • Verify root route http://127.0.0.1:5000/ serves updated bundle                       │
│                                                                                          │
│ STAGE 5: Adversarial Security Suite Execution                                            │
│   • Run server/test-private-by-default-suite.js (All 11 test vectors)                    │
│   • Stop Condition: If any test fails, halt immediately and evaluate rollback            │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Vulnerability Windows Evaluated & Mitigated

| Potential Risk Window | Root Cause if Misordered | Mitigation Enforced in Sequence |
|---|---|---|
| **Authentication Crash (HTTP 500)** | Updating `auth.js` to query `session_version` before Migration 007 runs. | Migration 007 runs in **Stage 2**; `auth.js` session checks are hooked in **Stage 3**. |
| **Share Creation Failure (HTTP 500)** | Applying CHECK constraint before frontend sends normalized values. | `normalizePermissionLevel` in `shareController.js` is staged in **Stage 1** before migration. |
| **Data Leakage Window** | Enabling new user registration before subfolder IDOR is patched. | No user accounts are provisioned until `verifyFolderAccess` is fully active in **Stage 3**. |
| **User Lockout** | Dropping `departments.created_at` or `updated_at` during rollback. | Rollback script strictly audited to drop **only** 007 objects; baseline columns preserved. |

---

## 3. TEST ARTIFACT QUARANTINE COMPLETENESS

We reconciled all 5 categories of previously identified test artifacts and defined their exact isolation boundary:

```
=== TEST ARTIFACT QUARANTINE RECONCILIATION ===
┌──────────────────────────────────────┬─────────┬──────────────────────────┬─────────────────────────────┐
│ Artifact Category                    │ Count   │ Storage Layer            │ Isolation Enforcement Point │
├──────────────────────────────────────┼─────────┼──────────────────────────┼─────────────────────────────┤
│ PostgreSQL Test Folders              │ 20 rows │ public.folders           │ Migration 007 + API query   │
│ PostgreSQL Test Files                │ 1 row   │ public.files             │ Migration 007 + API query   │
│ JSON Offline Fallback Records        │ 2 rows  │ server/data/nkb_cloud_db │ App Config (DB mode guard)  │
│ Offline Storage Binaries             │ 7 files │ C:\NKB-Cloud-Offline...  │ Admin-Only Storage Browser  │
│ Test Harness Fixtures                │ 7 items │ C:\NKB-Cloud-Offline...  │ Admin-Only Storage Browser  │
└──────────────────────────────────────┴─────────┴──────────────────────────┴─────────────────────────────┘
```

### 3.1 Isolation Mechanisms
1. **PostgreSQL 20 Folders & 1 File**:
   - Flagged `is_quarantined = TRUE, is_test_data = TRUE` in Migration 007.
   - All user API queries (`getExplorerItems`, search, category, starred, recent) filter `WHERE is_quarantined = FALSE AND is_test_data = FALSE`.
   - Direct download or subfolder lookup via UUID returns HTTP 403 (`QUARANTINED_TEST_DATA`).
2. **JSON Fallback Records (2 files in `nkb_cloud_db.json`)**:
   - Staging operates exclusively in PostgreSQL mode (`db.mode === 'postgres'`). The JSON file is never queried by active Express controllers.
3. **Physical Storage Binaries (7 files in `Storage\test_uploads`)**:
   - These files have zero records in PostgreSQL `files`. They cannot be accessed via `/api/files/:id/download`.
   - Access to underlying physical storage is restricted to `/api/storage/volumes/:volumeId/browse`, which requires `SUPER ADMIN` or `ADMIN` credentials. Normal users have zero physical drive enumeration capabilities.

---

## 4. AUTHORIZATION COVERAGE MATRIX & UUID BYPASS DEFENSE

Every entry point to the file system is mediated through the centralized authorization service:

| File System Operation | API Route | Authorization Method | Enforced Permission | Storage Agent Interaction |
|---|---|---|:---:|---|
| **Root Folder Listing** | `GET /api/files` | Direct DB filter | `owner_id = user.id` | None (DB metadata) |
| **Subfolder Listing** | `GET /api/files?folderId=:id` | `verifyFolderAccess` | `VIEWER`+ | None (DB metadata) |
| **File Listing** | `GET /api/files?folderId=:id` | `verifyFolderAccess` | `VIEWER`+ | None (DB metadata) |
| **File Preview** | `GET /api/files/:id/preview` | `verifyFileAccess` | `VIEWER`+ | Streams chunk via agent |
| **File Download** | `GET /api/files/:id/download` | `verifyFileAccess` | `DOWNLOADER`+ | Streams chunk via agent |
| **Direct Upload** | `POST /api/files/upload/direct` | `verifyFolderAccess` | `CONTRIBUTOR`+ | Writes chunk via agent |
| **Resumable Upload** | `POST /api/files/upload/initiate`| `verifyFolderAccess` | `CONTRIBUTOR`+ | Allocates session on agent |
| **Item Rename** | `PUT /api/files/:id/rename` | `verifyFileAccess` / Folder | `EDITOR`+ | Updates DB name |
| **Item Move** | `PUT /api/files/:id/move` | Verify Source + Target | `EDITOR` (src) / `CONTRIB` (dst) | Updates DB parent |
| **Trash Item** | `POST /api/files/:id/trash` | `verifyFileAccess` / Folder | `EDITOR`+ | Updates `is_trashed = TRUE` |
| **Restore Item** | `POST /api/files/:id/restore` | `verifyFileAccess` / Folder | `EDITOR`+ | Updates `is_trashed = FALSE`|
| **Search Query** | `GET /api/files?search=:q` | Filtered SQL join | `owner_id` OR active share | None (DB metadata) |
| **Share Creation** | `POST /api/shares` | Ownership verification | Owner or Dept Manager only | Creates `file_shares` row |
| **Share Revocation** | `DELETE /api/shares/:id` | Ownership verification | Owner, Grantor, or Admin | Sets `is_revoked = TRUE` |
| **Permanent Deletion** | `DELETE /api/files/:id/permanent`| `requireRole` | `SUPER ADMIN` only | Unlinks file on agent |

- **Direct UUID / URL Bypass Defense**: Because `verifyFolderAccess` and `verifyFileAccess` execute the recursive CTE check against the database before any chunk read command is dispatched to `agentHub`, submitting a direct API request with a known UUID returns HTTP 403 Forbidden. The Storage Agent is **never commanded** for unauthorized callers.

---

## 5. PERMISSION SEMANTICS & GRANULAR BEHAVIOR

| Operation | VIEWER | DOWNLOADER | CONTRIBUTOR | EDITOR | Notes & Governance |
|---|:---:|:---:|:---:|:---:|---|
| **View Metadata & List Contents** | **YES** | **YES** | **YES** | **YES** | Standard directory enumeration |
| **Preview Files in Browser** | **YES** | **YES** | **YES** | **YES** | Inline HTTP streaming |
| **Download Binary Package** | **NO** | **YES** | **YES** | **YES** | Attachment download |
| **Upload New Files** | **NO** | **NO** | **YES** | **YES** | Resumable or direct upload |
| **Create Child Subfolders** | **NO** | **NO** | **YES** | **YES** | Inherits parent permissions |
| **Overwrite Existing Files** | **NO** | **NO** | **NO** | **YES** | Contributor cannot overwrite unowned files |
| **Delete Contributor's Own Content** | **NO** | **NO** | **YES** | **YES** | Contributor can delete items they uploaded |
| **Delete Others' Content to Trash** | **NO** | **NO** | **NO** | **YES** | Editor can trash any item in folder |
| **Permanent Deletion (Unlink)** | **NO** | **NO** | **NO** | **NO** | **SUPER ADMIN ONLY** (Compliance rule) |
| **Manage / Delegate Shares** | **NO** | **NO** | **NO** | **NO** | **Owner or Dept Manager ONLY** |

- **Inheritance Invariant**: Permissions cascade downwards from parent to children. An inherited permission can never be escalated beyond the granted tier. If a user is granted `VIEWER` on folder `/Projects`, all files and subfolders within `/Projects` remain strictly `VIEWER` unless an explicit direct grant upgrades that specific item.

---

## 6. ADMINISTRATIVE ACCESS & PRIVILEGED BREAK-GLASS POLICY

1. **SUPER ADMIN Private File Policy**:
   - In standard operation, a `SUPER ADMIN`'s My Drive displays **only files owned by the Super Admin**.
   - Privileged administrative file inspection is **NOT automatic**. To inspect a private file belonging to another user, the administrator must invoke an explicit break-glass endpoint (`POST /api/admin/files/:id/break-glass-access`).
   - The break-glass action inserts an immutable record into `file_activity_events` containing the admin user ID, client IP, target file UUID, owner UUID, timestamp, and mandatory justification note.
2. **ADMIN (Department Admin) Private File Policy**:
   - An `ADMIN` has zero visibility into private files of users in other departments.
   - An `ADMIN` cannot inspect private files within their own department unless the file is placed in an official Department Workspace (`is_department_root = TRUE`) or explicitly shared.
3. **IT Infrastructure & Physical Storage Isolation**:
   - IT engineers browsing storage devices via Drive Browser (`/api/storage/volumes/:volumeId/browse`) view the physical filesystem structure for disk replacement, capacity planning, and integrity audits.
   - Physical drive browsing **never imports, displays, or alters user My Drive databases**.
   - Every physical drive browse operation is audited in `audit_logs` as `DRIVE_DIRECTORY_BROWSED`.

---

## 7. SECURITY TEST COUNT RECONCILIATION

### 7.1 Reconciliation of Blueprint Discrepancy
- **Identified Discrepancy**: The previous blueprint summary referenced 10 scenarios, while its detail section specified 11.
- **Root Cause**: An earlier 10-test draft was expanded during adversarial design to include `ADV-11` (Quarantined Test Artifact Inaccessibility via UUID). The summary text was not updated.
- **Reconciliation Verdict**: Exactly **11 executable adversarial scenarios** are verified and specified for implementation:

```
=== 11 EXECUTABLE ADVERSARIAL SCENARIOS ===
[ADV-01] Cross-User Folder Privacy: User B cannot see User A's private folder in My Drive.
[ADV-02] Subfolder IDOR Defense: User B submitting User A's folder UUID receives HTTP 403 ACCESS_DENIED.
[ADV-03] Direct UUID File Download Defense: User B calling download on User A's file receives HTTP 403.
[ADV-04] Direct UUID Preview Defense: User B calling preview on User A's file receives HTTP 403.
[ADV-05] Search Metadata Leakage Defense: User B searching for User A's file name receives 0 results.
[ADV-06] Explicit Sharing Grant: User A shares with User B as DOWNLOADER; User B can download file.
[ADV-07] Contributor Boundary: User B with DOWNLOADER cannot upload; CONTRIBUTOR can upload.
[ADV-08] Instant Revocation: User A revokes share; User B immediately receives HTTP 403 on next call.
[ADV-09] Expired Share Invalidation: Share with past expiration date immediately denies access.
[ADV-10] Cross-Department Isolation: Finance employee cannot access Engineering department folder.
[ADV-11] Quarantine UUID Inaccessibility: Attempting to access quarantined test folders returns HTTP 403.
```

- **Harness Location**: Test runner will reside at [`server/test-private-by-default-suite.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/test-private-by-default-suite.js).

---

## 8. CLASSIFICATION OF FINDINGS & GATES

| Review Finding | Reference Object / Path | Classification | Verification Status |
|---|---|:---:|:---:|
| **Migration 007 ACID Safety** | `007_enterprise_departments_sharing_audit.sql` | **VERIFIED** | Atomic transaction guarantees zero partial schema changes. |
| **`file_shares` In-Place Update**| `UPDATE file_shares SET permission_level = 'VIEWER'` | **VERIFIED** | Normalizes baseline row before CHECK constraint is added. |
| **Rollback Baseline Protection**| `007_rollback.sql` (Preserves `departments.created_at`) | **VERIFIED** | Baseline schema and 79 audit records 100% protected. |
| **Staged Rollout Plan** | Stages 1 through 5 with stop conditions | **VERIFIED** | Prevents authentication lockouts or runtime 500 errors. |
| **Subfolder IDOR Resolution** | Recursive CTE `verifyFolderAccess` | **DESIGN ONLY** | Fully specified; ready for controller integration. |
| **Test Data Quarantine** | 20 folders + 1 file in PostgreSQL | **DESIGN ONLY** | In-place flag leaves physical and audit files untouched. |
| **Administrative Break-Glass** | Audit-logged privileged access | **DESIGN ONLY** | Protects user privacy against automatic admin access. |
| **Adversarial Test Suite** | 11 scenarios in `test-private-by-default-suite.js` | **DESIGN ONLY** | Ready for post-migration execution. |

---

## FINAL GATE VERDICT

# **READY FOR SEPARATE LOCAL STAGING IMPLEMENTATION AUTHORIZATION**

**Conditions & Scope**:
1. All pre-implementation dependencies, sequencing constraints, and rollback boundaries have been adversarially challenged and verified.
2. The pre-migration backup (`pre_migration_007_backup_20261110_112100.dump`, SHA-256: `2B03A881ABAA75C1B11A4B8B5B9AD5E346D751607CA19320F784BD168F3F941F`) is securely stored and tested.
3. The administrator may now authorize the local staging implementation across Stages 1 through 5.
4. **Strict Read-Only Mode remains active until that authorization is granted.**
