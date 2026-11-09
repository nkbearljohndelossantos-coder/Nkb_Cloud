# NKB CLOUD v2.1.0 — DATA INTEGRITY & SECURITY AUDIT FINDINGS
**Audit Type:** Independent Read-Only Technical Audit  
**Author:** Independent System Auditor  
**Date:** November 2026  
**Audited Components:** Database Schemas, API Middleware, Identity Reconcilers, Controller Logic, Seed Files  

---

## 1. Storage Identity Layer Separation & Reconnection

### A. 3-Layer Identity Separation in Schema
**Classification: [PASS]**
- **Layer 1 (`storage_devices`)**: Entity PK is `id UUID`. Hardware serial number and disk unique ID are stored as `hardware_serial_evidence` and `disk_unique_id_evidence`. They are identification evidence, not primary keys.
  - *Reference*: [`server/db/schema.sql#L125-L145`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/schema.sql#L125-L145)
- **Layer 2 (`storage_volumes`)**: Entity PK is `id UUID`. Tracks `volume_guid` (`\\?\Volume{...}\`), `partition_guid`, `filesystem_uuid`, `partition_offset_bytes`, `filesystem_type`, and `composite_identity`.
  - *Reference*: [`server/db/schema.sql#L148-L170`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/schema.sql#L148-L170)
- **Layer 3 (`storage_registrations`)**: Entity PK is `id UUID`. Binds `storage_device_id`, `storage_volume_id`, `nkb_asset_tag`, `assigned_name`, `storage_purpose`, and `priority`.
  - *Reference*: [`server/db/schema.sql#L173-L195`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/schema.sql#L173-L195)

### B. Drive Letter Independence
**Classification: [PASS]**
- Drive letters (e.g. `E:`, `G:`) are stored only in `current_drive_letter` and logged in `storage_mount_history`.
- In [`server/services/agentHub.js#L179`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/agentHub.js#L179), volume lookup queries `composite_identity = $1 OR volume_uuid = $2`. It **never** uses the drive letter to look up existing volume records.
- When an existing volume reconnects under a different drive letter, `agentHub` updates `current_drive_letter` and keeps the primary key `id` unchanged.

### C. Identity Mismatch & Reformatting Protection
**Classification: [NOT_VERIFIED — Backend Implementation Pending Stage 2]**
- **Database Schema**: The schema defines `storage_identity_conflicts`, `storage_identity_observations`, and the CHECK constraint:
  `status IN ('ONLINE', 'OFFLINE', 'MAINTENANCE', 'RETIRED', 'IDENTITY_MISMATCH', 'PENDING_ADMIN_REVIEW')`
  - *Reference*: [`server/db/schema.sql#L162-L165`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/schema.sql#L162-L165)
- **Application Code Status**: In [`server/services/agentHub.js#L179-L215`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/agentHub.js#L179-L215), the current WebSocket handshake handler updates online volumes, but does not yet evaluate `IDENTITY_MISMATCH` or insert into `storage_identity_conflicts`. That controller logic is scheduled for Stage 2 & Stage 3.

---

## 2. Data Protection & Deletion Safeguards

### A. Referential Integrity: `ON DELETE RESTRICT`
**Classification: [PASS]**
- In [`server/db/schema.sql#L290`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/schema.sql#L290):
  `storage_volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE RESTRICT`
  - Files cannot be deleted by deleting or touching a volume record.
- In [`server/db/schema.sql#L315`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/schema.sql#L315):
  `storage_volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE RESTRICT` in `file_versions`.
- In [`server/db/schema.sql#L430`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/schema.sql#L430):
  `source_volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE RESTRICT`
  `target_volume_id UUID NOT NULL REFERENCES storage_volumes(id) ON DELETE RESTRICT` in `migration_jobs`.
- **Verdict**: Accidental or cascading deletion of active storage volumes or files is blocked at the database engine level.

### B. Recycle Bin & Permanent Erasure Logic
**Classification: [PASS]**
- In [`server/controllers/fileController.js#L605-L625`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/fileController.js#L605-L625):
  Standard users moving an item to trash only perform a soft delete (`is_trashed = TRUE`).
- In [`server/controllers/fileController.js#L648-L670`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/fileController.js#L648-L670):
  Permanent erasure requires the `SUPER ADMIN` role:
  ```javascript
  if (req.user.role_name !== 'SUPER ADMIN') {
    return res.status(403).json({ error: 'Permanent deletion requires Super Admin approval' });
  }
  ```
- **Physical Disk Safety**: Even when permanently erased from the catalog, `deletePermanently` executes `DELETE FROM files WHERE id = $1` but **never** sends an unconstrained disk wipe command to the Windows Storage Agent.

### C. Safe Drive Migration & Source Preservation
**Classification: [PASS]**
- In [`server/controllers/storageController.js#L308-L325`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/storageController.js#L308-L325):
  During migration, the file metadata pointer updates from source to target, but the source drive payload is **never** deleted.
- In [`server/controllers/storageController.js#L370-L385`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/storageController.js#L370-L385):
  Retirement updates `status = 'RETIRED'`, leaving all physical files on the source media 100% intact.

### D. DLP Baseline Assertion
**Classification: [PASS]**
- Inspection of [`server/db/seed.sql#L105-L215`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/seed.sql#L105-L215):
  All 11 DLP test evidence records (`DLP-01` through `DLP-11`) are initialized with `verification_status = 'NOT_TESTED'`.
- Not a single simulated or unverified test is marked `PASS` in the database.

---

## 3. Audit Trails & Account Security

### A. Password Hashing
**Classification: [PASS]**
- Passwords are encrypted using `bcrypt` with cost factor 10.
- Super Admin initial password hash in [`server/db/seed.sql#L83`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/seed.sql#L83):
  `$2b$10$uE4FsmJ3L5C7m0LzZsqQZex9M9CqX2JsmWqIomGgWomVqmFnmx8kS`
- Authentication verification uses `bcrypt.compare` in [`server/controllers/authController.js#L25`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/controllers/authController.js#L25).

### B. Audit Log Mutation Restrictions
**Classification: [FAIL — Database Level Immutability Missing]**
- In [`server/db/schema.sql#L480-L492`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/schema.sql#L480-L492):
  `audit_logs` is created as a standard PostgreSQL table.
- **Vulnerability**: While the application code only performs `INSERT INTO audit_logs`, the database schema lacks PostgreSQL engine-level triggers or rules preventing `UPDATE` or `DELETE` operations on `audit_logs`.
- **Recommended Remediation (for Production DDL)**:
  ```sql
  CREATE OR REPLACE RULE no_update_audit AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
  CREATE OR REPLACE RULE no_delete_audit AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
  REVOKE UPDATE, DELETE ON audit_logs FROM nkb_app;
  ```

### C. Hardcoded Secrets & Credentials Scan
**Classification: [WARNING — Development Fallback Secrets Detected]**
- **JWT Secret**: [`server/config/jwt.js#L3`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/config/jwt.js#L3) defines:
  `const JWT_SECRET = process.env.JWT_SECRET || 'nkb-cloud-enterprise-secret-key-2026-production';`
  *Finding*: If `.env` is omitted, the application falls back to a hardcoded string. A production check must reject startup if `process.env.JWT_SECRET` is not explicitly set.
- **Default Seed Password**: [`server/db/seed.sql#L68`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/seed.sql#L68) contains a plaintext comment indicating the default Super Admin password. Administrators must be prompted to change this password on first login.
- **Database Connection**: [`server/config/db.js`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/config/db.js) relies entirely on standard `process.env` configuration and has no hardcoded database passwords.

---

## 4. Summary Findings Matrix

| Finding ID | Area | Description | Status | Severity |
|---|---|---|---|---|
| **SEC-01** | Identity | 3-Layer Storage Identity Separation in DDL | **PASS** | Info |
| **SEC-02** | Identity | Drive Letter Re-mapping Independence | **PASS** | Info |
| **SEC-03** | Data Loss | Foreign Key `ON DELETE RESTRICT` on Volumes & Files | **PASS** | Info |
| **SEC-04** | Data Loss | Permanent Delete requires Super Admin; Zero disk wipe | **PASS** | Info |
| **SEC-05** | DLP Status | All 11 DLP test evidence records initialized `NOT_TESTED` | **PASS** | Info |
| **SEC-06** | Audit Trail | `audit_logs` lacks DB engine-level immutability rules | **FAIL** | Medium |
| **SEC-07** | Secrets | Fallback `JWT_SECRET` string present in code | **WARNING** | Medium |
| **SEC-08** | Controllers | Identity Mismatch reconciliation logic pending Stage 2 | **NOT_VERIFIED** | Low |
