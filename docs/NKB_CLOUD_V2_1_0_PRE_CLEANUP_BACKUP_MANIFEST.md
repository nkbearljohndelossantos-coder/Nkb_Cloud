# NKB CLOUD v2.1.0 — PRE-CLEANUP BACKUP MANIFEST & RESTORATION VALIDATION REPORT

**Author:** Antigravity Autonomous Security & QA Agent  
**Environment:** Local Isolated Staging Environment (`nkb_cloud_local_test`)  
**Target Host / Port:** `127.0.0.1:5433` (Docker container: `nkb_pg16_staging`)  
**Git Branch:** `test/local-offline-env` (HEAD: `796c7fdc62cdc61daff00f1f02d1bc3160395ad6`)  
**Maintenance Gate Status:** `STAGING_MAINTENANCE_GATE=true` (ACTIVE / HTTP 503 Enforced)  
**Execution Scope:** Non-Destructive Backup & Disposable Restoration Validation Only — **ZERO DELETION / CLEANUP EXECUTED**

---

## 1. EXECUTIVE SUMMARY & AUTHORIZATION SCOPE

Under the **NKB Cloud v2.1.0 Pre-Cleanup Backup Execution & Restore Validation** authorization, a comprehensive, dual-layer backup and restoration validation was successfully executed.

In accordance with strict safety requirements:
1. A **new PostgreSQL custom-format database backup (`pg_dump -Fc`)** was generated and validated.
2. A **new physical synthetic file archive (`.zip`)** containing all 8 verified synthetic files and test feed directories was created.
3. **Physical File Restoration Validation** was conducted in a dedicated external temporary directory, verifying bit-for-bit SHA-256 equivalence.
4. **Database Restoration Validation** was conducted in an isolated, disposable PostgreSQL database (`nkb_cloud_restore_test`), verifying that schema, migrations, 156 audit records, 3 cryptographic chain heads, baseline assets, and synthetic inventories restore with 100% parity.
5. **Zero Cleanup Performed:** The original staging database (`nkb_cloud_local_test`), physical staging directory (`C:\NKB-Cloud-Offline-Test\Storage`), and authentic reference storage (`J:\NKB_Storage_Root`) remain completely intact. The Universal Maintenance Gate remains active.

---

## 2. PRE-EXECUTION CHECKPOINT VERIFICATION

Prior to creating any backup artifacts, all 8 required pre-execution checkpoints were evaluated and confirmed:

| Checkpoint Item | Required State | Observed State | Status |
| :--- | :--- | :--- | :---: |
| **Database Identity** | Exactly `nkb_cloud_local_test` | `nkb_cloud_local_test` | **PASS** |
| **PostgreSQL Reachability** | Accessible only at `127.0.0.1:5433` | Bound to `127.0.0.1:5433` (Docker loopback) | **PASS** |
| **Applied Migrations** | Exactly Migrations 001–007 | Migrations 001–007 confirmed applied | **PASS** |
| **Migration 008 Status** | Does not exist in DB or repo | Confirmed absent from DB and filesystem | **PASS** |
| **Maintenance Gate** | `STAGING_MAINTENANCE_GATE=true` | `/health` returns `status: MAINTENANCE`, gate active | **PASS** |
| **Backend Binding** | Exclusively `127.0.0.1:5000` | Loopback only (netstat confirmed) | **PASS** |
| **Audit Log Count** | Exactly 156 records | 156 records (80 baseline + 76 test) | **PASS** |
| **Audit Chain Heads** | All 3 match live database tails | `audit_chain_head`, `login_audit`, `file_activity` match 100% | **PASS** |

---

## 3. DATABASE BACKUP MANIFEST (`pg_dump -Fc`)

### 3.1 Backup Execution Metadata
- **Database Identity:** `nkb_cloud_local_test`
- **PostgreSQL Version:** PostgreSQL 16.15 on x86_64-pc-linux-musl (Alpine Linux)
- **Container Name:** `nkb_pg16_staging`
- **Backup Timestamp:** `2026-11-11 09:00:00 UTC`
- **Execution Command:**
  ```powershell
  docker exec nkb_pg16_staging pg_dump -U postgres -d nkb_cloud_local_test -Fc -b -v -f /tmp/nkb_cloud_pre_cleanup_backup_20261111_090000.dump
  docker cp "nkb_pg16_staging:/tmp/nkb_cloud_pre_cleanup_backup_20261111_090000.dump" "C:\NKB-Cloud-Offline-Test\Backups\nkb_cloud_pre_cleanup_backup_20261111_090000.dump"
  ```
- **Exit Code:** `0` (Success)

### 3.2 Artifact Integrity
- **Host Destination Path:** [`C:\NKB-Cloud-Offline-Test\Backups\nkb_cloud_pre_cleanup_backup_20261111_090000.dump`](file:///C:/NKB-Cloud-Offline-Test/Backups/nkb_cloud_pre_cleanup_backup_20261111_090000.dump)
- **File Size:** `1,284,616 bytes` (1.23 MB)
- **SHA-256 Checksum:**
  ```text
  65CDDC39C7FF5F1B401DE724F3B6D33072CF6DA094BA942548AFC2308A681C8A
  ```

### 3.3 Scope & Content Preservation
- Complete relational schema (all 41 tables, sequences, views, types, and extensions `pgcrypto`, `uuid-ossp`).
- All 156 audit log records (80 baseline + 76 append-only staging test logs).
- All 3 cryptographic chain heads and system settings in `system_settings`.
- Migration 007 quarantine metadata (20 folders and 1 file with `is_quarantined = TRUE`).
- Migration 007 provenance token on baseline share `f8e5acfc-1b2c-4924-a7b7-c63bfe42e5f5`.
- Historical permission backup table `_migration_007_permission_backup`.

---

## 4. PHYSICAL SYNTHETIC FILE BACKUP MANIFEST

### 4.1 Archive Execution Metadata
- **Source Directory:** `C:\NKB-Cloud-Offline-Test\Storage`
- **Archive File Path:** [`C:\NKB-Cloud-Offline-Test\Backups\nkb_cloud_physical_synthetic_backup_20261111_090000.zip`](file:///C:/NKB-Cloud-Offline-Test/Backups/nkb_cloud_physical_synthetic_backup_20261111_090000.zip)
- **Archive Size:** `5,632,107 bytes` (5.37 MB)
- **Archive SHA-256 Checksum:**
  ```text
  C85E690A78A5B56194AD71100930DC356FD76059A1C97BA85CF73C603849579C
  ```

### 4.2 Individual Synthetic Files Manifest (8 Files)

| File Name | Original Absolute Path | Relative Path | Size | SHA-256 Digest |
| :--- | :--- | :--- | :---: | :--- |
| `0bfeddc0-45e3-452d-96ad-0c46a1afd277.txt` | `C:\NKB-Cloud-Offline-Test\Storage\0bfeddc0-45e3-452d-96ad-0c46a1afd277.txt` | `0bfeddc0-45e3-452d-96ad-0c46a1afd277.txt` | 26 B | `09855BD4884FBDB7C7612A8229AF8945047E17AF3C8E76C0F13D3D0FEE998D7F` |
| `21df5407-2f97-4b80-b752-ef186bc730de.txt` | `C:\NKB-Cloud-Offline-Test\Storage\21df5407-2f97-4b80-b752-ef186bc730de.txt` | `21df5407-2f97-4b80-b752-ef186bc730de.txt` | 26 B | `09855BD4884FBDB7C7612A8229AF8945047E17AF3C8E76C0F13D3D0FEE998D7F` |
| `70e030ca-dbd4-4ff4-92a9-0519d959b725.txt` | `C:\NKB-Cloud-Offline-Test\Storage\70e030ca-dbd4-4ff4-92a9-0519d959b725.txt` | `70e030ca-dbd4-4ff4-92a9-0519d959b725.txt` | 54 B | `C8DB177B93575ED02DF29775A18560BFA66D7A29AEDDA842D3AB05AE91CA4891` |
| `7c6cbce8-4a2d-4355-a7b3-87f76dcd5fb4.bin` | `C:\NKB-Cloud-Offline-Test\Storage\7c6cbce8-4a2d-4355-a7b3-87f76dcd5fb4.bin` | `7c6cbce8-4a2d-4355-a7b3-87f76dcd5fb4.bin` | 46 B | `C6BDFDEE5D943C18015730A19A7A59D73D26C7D25417594A24D7185D64E11EE5` |
| `88843ae0-c65a-447d-9592-af03c9518055.txt` | `C:\NKB-Cloud-Offline-Test\Storage\88843ae0-c65a-447d-9592-af03c9518055.txt` | `88843ae0-c65a-447d-9592-af03c9518055.txt` | 26 B | `09855BD4884FBDB7C7612A8229AF8945047E17AF3C8E76C0F13D3D0FEE998D7F` |
| `a21d853d-4f74-4c61-b267-f163653f2a3f.txt` | `C:\NKB-Cloud-Offline-Test\Storage\a21d853d-4f74-4c61-b267-f163653f2a3f.txt` | `a21d853d-4f74-4c61-b267-f163653f2a3f.txt` | 54 B | `C8DB177B93575ED02DF29775A18560BFA66D7A29AEDDA842D3AB05AE91CA4891` |
| `b0922eca-fb45-4028-af7b-6129c953441d.bin` | `C:\NKB-Cloud-Offline-Test\Storage\b0922eca-fb45-4028-af7b-6129c953441d.bin` | `b0922eca-fb45-4028-af7b-6129c953441d.bin` | 46 B | `C6BDFDEE5D943C18015730A19A7A59D73D26C7D25417594A24D7185D64E11EE5` |
| `b490862b-9288-45d1-b232-d99d38b1bffb.txt` | `C:\NKB-Cloud-Offline-Test\Storage\b490862b-9288-45d1-b232-d99d38b1bffb.txt` | `b490862b-9288-45d1-b232-d99d38b1bffb.txt` | 54 B | `C8DB177B93575ED02DF29775A18560BFA66D7A29AEDDA842D3AB05AE91CA4891` |

*Included Test Directories:* Subdirectory `test_uploads` (containing synthetic test generator feed files: `dummy_100MB.bin`, `dummy_10MB.bin`, `dummy_500MB.bin`, `dummy_document.pdf`, `dummy_image.png`, `dummy_sample.txt`, `interrupted_test.bin`) was included in the archive.

*Explicit Exclusions Confirmed:*
- Company production storage root candidates on `D:\NKB_Storage_Root`, `G:\NKB_Storage_Root`, and `C:\NKB_Storage_Root` were **NOT** touched or included.
- Baseline physical reference file [`J:\NKB_Storage_Root\1ba77ec9-1997-4492-b83f-8184cc6dd89c.jpg`](file:///J:/NKB_Storage_Root/1ba77ec9-1997-4492-b83f-8184cc6dd89c.jpg) was **NOT** copied or modified.

---

## 5. PHYSICAL RESTORATION TEST VALIDATION

### 5.1 Test Execution Metadata
- **Restoration Target Directory:** `C:\NKB-Cloud-Offline-Test\Restore_Validation_20261111_090000` (outside source directory)
- **Extraction Command:**
  ```powershell
  Expand-Archive -Path "C:\NKB-Cloud-Offline-Test\Backups\nkb_cloud_physical_synthetic_backup_20261111_090000.zip" -DestinationPath "C:\NKB-Cloud-Offline-Test\Restore_Validation_20261111_090000" -Force
  ```
- **Exit Code:** `0` (Success)

### 5.2 Bit-for-Bit Verification Results

| Restored File Name | Exists? | Expected Size | Restored Size | Computed SHA-256 Checksum | Match? | Status |
| :--- | :---: | :---: | :---: | :--- | :---: | :---: |
| `0bfeddc0-45e3-452d-96ad-0c46a1afd277.txt` | Yes | 26 B | 26 B | `09855BD4884FBDB7C7612A8229AF8945047E17AF3C8E76C0F13D3D0FEE998D7F` | Identical | **PASS** |
| `21df5407-2f97-4b80-b752-ef186bc730de.txt` | Yes | 26 B | 26 B | `09855BD4884FBDB7C7612A8229AF8945047E17AF3C8E76C0F13D3D0FEE998D7F` | Identical | **PASS** |
| `70e030ca-dbd4-4ff4-92a9-0519d959b725.txt` | Yes | 54 B | 54 B | `C8DB177B93575ED02DF29775A18560BFA66D7A29AEDDA842D3AB05AE91CA4891` | Identical | **PASS** |
| `7c6cbce8-4a2d-4355-a7b3-87f76dcd5fb4.bin` | Yes | 46 B | 46 B | `C6BDFDEE5D943C18015730A19A7A59D73D26C7D25417594A24D7185D64E11EE5` | Identical | **PASS** |
| `88843ae0-c65a-447d-9592-af03c9518055.txt` | Yes | 26 B | 26 B | `09855BD4884FBDB7C7612A8229AF8945047E17AF3C8E76C0F13D3D0FEE998D7F` | Identical | **PASS** |
| `a21d853d-4f74-4c61-b267-f163653f2a3f.txt` | Yes | 54 B | 54 B | `C8DB177B93575ED02DF29775A18560BFA66D7A29AEDDA842D3AB05AE91CA4891` | Identical | **PASS** |
| `b0922eca-fb45-4028-af7b-6129c953441d.bin` | Yes | 46 B | 46 B | `C6BDFDEE5D943C18015730A19A7A59D73D26C7D25417594A24D7185D64E11EE5` | Identical | **PASS** |
| `b490862b-9288-45d1-b232-d99d38b1bffb.txt` | Yes | 54 B | 54 B | `C8DB177B93575ED02DF29775A18560BFA66D7A29AEDDA842D3AB05AE91CA4891` | Identical | **PASS** |
| `test_uploads/` (Directory) | Yes | — | — | Directory structure and feed binaries verified | Identical | **PASS** |

**Physical Restoration Conclusion:** **100% BIT-FOR-BIT IDENTICAL RESTORATION VERIFIED.**

---

## 6. DATABASE RESTORATION TEST VALIDATION

### 6.1 Test Execution Metadata
- **Restoration Target Database:** `nkb_cloud_restore_test` (disposable temporary database created strictly for validation; original database `nkb_cloud_local_test` was never overwritten).
- **Execution Command:**
  ```powershell
  docker exec nkb_pg16_staging psql -U postgres -c "DROP DATABASE IF EXISTS nkb_cloud_restore_test;"
  docker exec nkb_pg16_staging psql -U postgres -c "CREATE DATABASE nkb_cloud_restore_test;"
  docker exec nkb_pg16_staging pg_restore -U postgres -d nkb_cloud_restore_test --no-owner --no-privileges -v /tmp/nkb_cloud_pre_cleanup_backup_20261111_090000.dump
  ```
- **Exit Code:** `0` (Success)

### 6.2 Restoration Verification Assertions

| Verification Target | Expected State | Restored Database Observed State | Status |
| :--- | :--- | :--- | :---: |
| **Database Identity** | `nkb_cloud_restore_test` | `nkb_cloud_restore_test` | **PASS** |
| **Applied Migrations** | Exactly 001–007 | `001, 002, 003, 004, 005, 006, 007` | **PASS** |
| **Migration 008 Status** | Absent | Absent | **PASS** |
| **Total Audit Logs** | 156 records | 156 records | **PASS** |
| **Baseline Audit Logs** | 80 records (`id <= 80`) | 80 records | **PASS** |
| **Test Audit Logs** | 76 records (`id > 80`) | 76 records | **PASS** |
| **Login Audit Events** | 8 records | 8 records | **PASS** |
| **File Activity Events** | 6 records | 6 records | **PASS** |
| **`audit_chain_head`** | `c3674e67388bc088a814ac43da80a9d6edd784cd51f179034fd5aaf4e2a1e54a` | `c3674e67388bc088a814ac43da80a9d6edd784cd51f179034fd5aaf4e2a1e54a` | **PASS** |
| **`login_audit_chain_head`** | `53f84234fb1045f3709d874f1ed4a12faa2385c5d3c673b454dc140272080ad7` | `53f84234fb1045f3709d874f1ed4a12faa2385c5d3c673b454dc140272080ad7` | **PASS** |
| **`file_activity_chain_head`** | `0549c42f1f1e50274b528c28cb5ce531c71e549c0bb9eb7b97c9c1bbae367304` | `0549c42f1f1e50274b528c28cb5ce531c71e549c0bb9eb7b97c9c1bbae367304` | **PASS** |
| **Baseline Superadmin** | User ID `00000000...0001` | Username: `superadmin`, Role: `SUPER_ADMIN`, Status: `ACTIVE` | **PASS** |
| **Quarantined Folders** | 20 records (`is_quarantined = TRUE`) | 20 records | **PASS** |
| **Quarantined File** | `790a8a05...` (`is_quarantined = TRUE`) | 1 record (`889652510_107727...jpg`) | **PASS** |
| **Baseline Share & Token** | Token `MIG-007-5adbd4f3-6fa3-425b-997d-f237658aa55b` | 1 record (`f8e5acfc-1b2c-4924-a7b7-c63bfe42e5f5`) | **PASS** |
| **Baseline Upload Session** | ID `1ba77ec9...`, Status `COMPLETED` | 1 record (`1ba77ec9-1997-4492-b83f-8184cc6dd89c`) | **PASS** |
| **Baseline Upload Chunk #1** | ID `1`, Size `113,639` bytes | 1 record (Size: 113,639 bytes) | **PASS** |
| **Total Users** | 10 records | 10 records | **PASS** |
| **Total Folders** | 29 records | 29 records | **PASS** |
| **Total Files** | 9 records | 9 records | **PASS** |
| **Total File Versions** | 9 records | 9 records | **PASS** |
| **Total File Shares** | 22 records | 22 records | **PASS** |
| **Total Upload Sessions** | 5 records | 5 records | **PASS** |
| **Total File Chunks** | 3 records | 3 records | **PASS** |

**Database Restoration Conclusion:** **24/24 ASSERTIONS PASSED (100% PARITY CONFIRMED).**

---

## 7. DISCREPANCIES, FAILURES, OR ANOMALIES

- **Missing Verifications:** **NONE.** Every required checkpoint, database table, hash chain, and physical binary was verified.
- **Failed Checkpoints:** **NONE.** All pre-execution checkpoints passed.
- **Restoration Errors:** **NONE.** Both physical zip extraction and PostgreSQL `pg_restore` executed with exit code `0`.
- **Database Drift:** **NONE.** Source database `nkb_cloud_local_test` and restored database `nkb_cloud_restore_test` match exactly on all 24 schema, audit, and entity assertions.

---

## 8. CLEANUP READINESS DETERMINATION

Following the successful creation and restoration validation of both the physical filesystem archive and the database custom dump, the readiness status of the physical storage operation is updated:

| Operation | Previous Classification | Updated Classification | Operational Prerequisite Satisfied |
| :--- | :---: | :---: | :--- |
| **Physical Storage Cleanup (`C:\...`)** | `NOT READY — BACKUP REQUIRED` | **`READY FOR SEPARATE AUTHORIZATION`** | Physical zip archive created, checksummed, and non-destructive restoration verified with 100% bit-exact SHA-256 matches. |
| **Database Synthetic Entities Removal** | `READY FOR SEPARATE AUTHORIZATION` | **`READY FOR SEPARATE AUTHORIZATION`** | Custom-format dump created, checksummed, and restored into disposable database with 24/24 assertions passed. |
| **Synthetic User Soft-Deactivation** | `READY FOR SEPARATE AUTHORIZATION` | **`READY FOR SEPARATE AUTHORIZATION`** | Foreign-key isolation verified; preserves all 156 audit records without trigger abortion. |
| **Early Sandbox Folders** | `NOT READY — CLASSIFICATION CONFLICT` | **`NOT READY — CLASSIFICATION CONFLICT`** | Awaiting operator determination regarding retention of `Parent_Workspace` and `Child_Subfolder`. |
| **Baseline Data & Audit Logs** | `PROHIBITED — BASELINE DATA` | **`PROHIBITED — BASELINE DATA`** | Permanent protection enforced. Zero deletion authorized. |

---

## 9. STRICT PROHIBITIONS COMPLIANCE & FINAL STOP

1. **Zero Data Deleted:** No synthetic files, folders, shares, users, versions, chunks, or sessions were deleted.
2. **Maintenance Gate Unaltered:** `STAGING_MAINTENANCE_GATE=true` remains **ACTIVE** and strictly enforced.
3. **Loopback Only:** REST endpoint `http://127.0.0.1:5000/health` reports `status: MAINTENANCE`.
4. **Authentic Storage Intact:** [`J:\NKB_Storage_Root\1ba77ec9-1997-4492-b83f-8184cc6dd89c.jpg`](file:///J:/NKB_Storage_Root/1ba77ec9-1997-4492-b83f-8184cc6dd89c.jpg) verified unchanged (SHA-256: `5F6106359044F887194195455BA7E4B6ED002888EACE57F4DB0BB215A14CADD9`).
5. **No Migration 008:** The database schema halts at Migration 007.

**STATUS: BACKUP & RESTORATION VALIDATION FULLY COMPLETE. STOPPING AND AWAITING SEPARATE WRITTEN AUTHORIZATION.**
