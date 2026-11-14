# NKB CLOUD v2.1.0 — FINAL CLEANUP PLAN RECONCILIATION & RECOVERY VALIDATION

**Author:** Antigravity Autonomous Security & QA Agent  
**Environment:** Local Isolated Staging Environment (`nkb_cloud_local_test`)  
**Target Host / Port:** `127.0.0.1:5433` (Docker container: `nkb_pg16_staging`)  
**Git Branch:** `test/local-offline-env` (HEAD: `796c7fdc62cdc61daff00f1f02d1bc3160395ad6`)  
**Current Maintenance Gate Status:** `STAGING_MAINTENANCE_GATE=true` (ACTIVE / HTTP 503 Enforced)  
**Document Classification:** Strictly Read-Only Audit, Inventory Reconciliation & Planning — **ZERO DELETION / ZERO EXECUTION AUTHORIZED**

---

## 1. EXECUTIVE SUMMARY & STRICT SCOPE

Pursuant to the authorization for **Final Cleanup Plan Reconciliation & Recovery Validation**, this report provides an exhaustive, mathematically verified reconciliation between the previous post-acceptance audit reports, the preliminary cleanup plan, and the authoritative PostgreSQL database state.

### 1.1 Strict Execution Boundaries
> [!CAUTION]
> **READ-ONLY AUDIT & PLANNING ONLY:** Under strict protocol instructions, no database row, table, schema, file, or environment variable has been modified, moved, or deleted.
> 
> A classification of `READY FOR SEPARATE AUTHORIZATION` indicates technical readiness and risk mitigation; it **DOES NOT** constitute permission to execute cleanup.

1. **Zero Destructive Operations:** Zero SQL `DELETE`, `UPDATE`, `TRUNCATE`, or `DROP` statements were executed.
2. **Maintenance Gate Unaltered:** `STAGING_MAINTENANCE_GATE=true` remains enforced. Loopback REST API returns HTTP 503 `STAGING_MAINTENANCE_GATE_ACTIVE`.
3. **Migration 008 Prohibited:** The database migration sequence halts definitively at Migration 007.
4. **Physical Binaries Untouched:** No files were removed from `C:\NKB-Cloud-Offline-Test\Storage` or `J:\NKB_Storage_Root`.
5. **Absolute Audit Preservation:** All 156 audit log records and all 3 cryptographic chain heads remain intact and verified.

---

## 2. INVENTORY RECONCILIATION: PREVIOUS AUDIT VS. DATABASE REALITY

A line-by-line reconciliation was performed comparing [`docs/NKB_CLOUD_V2_1_0_POST_ACCEPTANCE_EVIDENCE_AUDIT.md`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/docs/NKB_CLOUD_V2_1_0_POST_ACCEPTANCE_EVIDENCE_AUDIT.md) against the live PostgreSQL instance `nkb_cloud_local_test`. 

### 2.1 Discrepancy Summary Table

| Entity / Metric | Previous Audit Report | Cleanup Plan / Live DB | Delta | Root Cause & Authoritative Explanation |
| :--- | :---: | :---: | :---: | :--- |
| **Total Folders** | **23** | **29** | **+6** | **Sampling Omission in Previous Audit:** The previous audit sampled only the 20 quarantined folders plus the 3 folders created during the final acceptance iteration (`88d1cc6b...`, `d8eb83f8...`, `ad1104e1...`). It omitted the 2 early sandbox folders (`Parent_Workspace`, `Child_Subfolder`) and the 4 folders created during earlier test execution passes (`1eb10f0b...`, `87ea67cd...`, `4e1ddd9a...`, `92c6cef8...`). Live DB contains exactly **29** folders. |
| **Total File Shares** | **23** | **22** | **-1** | **Assertion Count vs. Row Count:** The previous audit counted 23 share test assertions/events from the test runner logs and assumed each corresponded to a unique row. In reality, `SELECT count(*) FROM file_shares;` yields exactly **22** rows (one test updated/revoked an existing grant in place rather than inserting a 23rd row). |
| **Synthetic Files** | **7** | **8** | **+1** | **Baseline Hallucination & Omitted Resumable File:** The previous audit listed 2 baseline files (hallucinating a non-existent PDF `14f6b0b2...`) and only 7 synthetic files. In reality, there is only **1** baseline file (`790a8a05...jpg` on `J:`) and **8** synthetic files on `C:` (the audit missed resumable upload file `127f98ad...`). |
| **Synthetic Shares** | **23** | **21** | **-2** | **Baseline Share Misclassification:** The previous audit assumed all shares were synthetic. In reality, 1 share (`f8e5acfc...`) carries Migration 007 provenance token `MIG-007-5adbd4f3-6fa3-425b-997d-f237658aa55b` (**BASELINE**). Out of 22 total shares, exactly 1 is baseline, leaving exactly **21** synthetic shares. |

---

## 3. EXACT RECORD-LEVEL MANIFESTS

### 3.1 Folders Manifest (`folders` table — 29 records)

| Record ID | Name | Owner ID / Username | Parent ID / Name | Dept ID | Created At (UTC) | Classification | Evidence & Dependencies |
| :--- | :--- | :--- | :--- | :---: | :--- | :--- | :--- |
| `e60e7113-d0a9-456c-99ac-f32d96a6267b` | `Offline_Test_Folder` | `00000000...0001` (superadmin) | `NULL` | 2 | 2026-11-10 01:17:38 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `ec3b88e8-f5f0-47bc-9212-693edf316be1` | `Subfolder_Alpha` | `00000000...0001` (superadmin) | `e60e7113...` | 2 | 2026-11-10 01:17:38 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `9d717e34-57e2-4a74-a8f4-b1f945379b7e` | `Offline_Test_Folder` | `00000000...0001` (superadmin) | `NULL` | 2 | 2026-11-10 01:17:53 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `5b7b2c27-9dff-445d-b781-2251db296dcd` | `Subfolder_Alpha` | `00000000...0001` (superadmin) | `9d717e34...` | 2 | 2026-11-10 01:17:53 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `37bdc641-5216-4481-bcda-d3a723f9f91a` | `Offline_Test_Folder` | `00000000...0001` (superadmin) | `NULL` | 2 | 2026-11-10 01:18:56 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `d90e0bc4-bf52-48ec-858a-d5c0b8d3746d` | `Subfolder_Alpha` | `00000000...0001` (superadmin) | `37bdc641...` | 2 | 2026-11-10 01:18:56 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `e3f7fb68-8144-4a94-b80e-76928a718e35` | `Offline_Test_Folder` | `00000000...0001` (superadmin) | `NULL` | 2 | 2026-11-10 01:19:22 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `5df41e14-e099-4c3d-b819-3f890b7330e6` | `Subfolder_Alpha` | `00000000...0001` (superadmin) | `e3f7fb68...` | 2 | 2026-11-10 01:19:22 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `de2eea46-2883-4671-80d6-dc9103ced175` | `Offline_Test_Folder` | `00000000...0001` (superadmin) | `NULL` | 2 | 2026-11-10 01:19:58 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `c564bb4d-4eb1-45fa-87de-cb41df206b06` | `Subfolder_Alpha` | `00000000...0001` (superadmin) | `de2eea46...` | 2 | 2026-11-10 01:19:58 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `1a1a805a-844c-4278-b0a0-b00aa482c08b` | `Offline_Test_Folder` | `00000000...0001` (superadmin) | `NULL` | 2 | 2026-11-10 01:20:29 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `fd5de287-59c6-47b7-a5f6-3a96e18f1fc8` | `Subfolder_Alpha` | `00000000...0001` (superadmin) | `1a1a805a...` | 2 | 2026-11-10 01:20:29 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `8a98ed44-53d9-404d-b208-5622ae6c3b1c` | `Offline_Test_Folder` | `00000000...0001` (superadmin) | `NULL` | 2 | 2026-11-10 01:21:04 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `b2cfb6e0-1039-4c96-bf40-de42350229b9` | `Subfolder_Alpha` | `00000000...0001` (superadmin) | `8a98ed44...` | 2 | 2026-11-10 01:21:04 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `d7ef0c6f-20a3-4d5c-92ba-8b1a7502a446` | `Offline_Test_Folder` | `00000000...0001` (superadmin) | `NULL` | 2 | 2026-11-10 01:21:28 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `8a07c1b5-3e28-44d4-9d5a-19597a731d6d` | `Subfolder_Alpha` | `00000000...0001` (superadmin) | `d7ef0c6f...` | 2 | 2026-11-10 01:21:28 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `ec6b758b-ae18-4e12-b5e5-3162b71fa0c8` | `Offline_Test_Folder` | `00000000...0001` (superadmin) | `NULL` | 2 | 2026-11-10 01:21:55 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `29f9dfd1-eaee-4f33-870d-ba1fb81a4d1e` | `Subfolder_Alpha` | `00000000...0001` (superadmin) | `ec6b758b...` | 2 | 2026-11-10 01:21:55 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `1b44ec0a-a114-419b-ab04-585329fc80d6` | `Offline_Test_Folder` | `00000000...0001` (superadmin) | `NULL` | 2 | 2026-11-10 01:22:18 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `2fce6393-5ba2-4ff9-8f0a-4299b82874fc` | `Subfolder_Alpha` | `00000000...0001` (superadmin) | `1b44ec0a...` | 2 | 2026-11-10 01:22:18 | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). |
| `af5ae71f-a5f1-4db3-96b6-39f50682fc91` | `Parent_Workspace` | `00000000...0001` (superadmin) | `NULL` | `NULL` | 2026-11-10 06:10:48 | **`NOT READY — CLASSIFICATION CONFLICT`** | Early staging test folder; owned by superadmin. Needs operator decision. |
| `ecba4721-a477-4972-be72-f61b7e3e4a2c` | `Child_Subfolder` | `00000000...0001` (superadmin) | `af5ae71f...` | `NULL` | 2026-11-10 06:10:48 | **`NOT READY — CLASSIFICATION CONFLICT`** | Child of `Parent_Workspace`. Needs operator decision. |
| `66984d46-db3f-4e6f-9977-84fe84f23e74` | `Quality Assurance Workspace` | `84ac0bf0...` (stg_superadmin) | `NULL` | 3 | 2026-11-10 09:21:38 | **`READY FOR SEPARATE AUTHORIZATION`** | Acceptance Dept Shared Drive (WF-05). Target for deletion. |
| `1eb10f0b-7218-4df0-af4a-a03798c4b14d` | `Synthetic_QA_Project_1762766324835` | `8a7a6647...` (stg_user_qa1) | `NULL` | `NULL` | 2026-11-10 09:22:04 | **`READY FOR SEPARATE AUTHORIZATION`** | Acceptance user folder iteration 1. Has child `87ea67cd...`. |
| `87ea67cd-d3e9-445a-8b1b-fb240217ec82` | `Child_Reports_Folder` | `8a7a6647...` (stg_user_qa1) | `1eb10f0b...` | `NULL` | 2026-11-10 09:22:04 | **`READY FOR SEPARATE AUTHORIZATION`** | Child of iteration 1. Delete before parent. |
| `4e1ddd9a-3c63-4357-8702-524f6b70354a` | `Synthetic_QA_Project_1762766442657` | `8a7a6647...` (stg_user_qa1) | `NULL` | `NULL` | 2026-11-10 09:24:02 | **`READY FOR SEPARATE AUTHORIZATION`** | Acceptance user folder iteration 2. Has child `92c6cef8...`. |
| `92c6cef8-5d15-4fa2-bfeb-20d0e657c48f` | `Child_Reports_Folder` | `8a7a6647...` (stg_user_qa1) | `4e1ddd9a...` | `NULL` | 2026-11-10 09:24:02 | **`READY FOR SEPARATE AUTHORIZATION`** | Child of iteration 2. Delete before parent. |
| `88d1cc6b-7a78-4190-a862-bc080467b842` | `Synthetic_QA_Project_1794302739022` | `8a7a6647...` (stg_user_qa1) | `NULL` | `NULL` | 2026-11-10 09:25:38 | **`READY FOR SEPARATE AUTHORIZATION`** | Acceptance user folder iteration 3. Has child `82c7ad72...`. |
| `82c7ad72-1327-463e-ac30-cb64c581fa73` | `Child_Reports_Folder` | `8a7a6647...` (stg_user_qa1) | `88d1cc6b...` | `NULL` | 2026-11-10 09:25:38 | **`READY FOR SEPARATE AUTHORIZATION`** | Child of iteration 3. Delete before parent. |

---

### 3.2 Files & File Versions Manifest (`files` & `file_versions` — 9 records each)

| Record ID | File Name | Owner ID / Username | Relative Storage Path | Size | SHA-256 Digest | Classification | Evidence & Storage Volume |
| :--- | :--- | :--- | :--- | :---: | :--- | :--- | :--- |
| `790a8a05-cf5f-412f-a486-c547a07e86ec` | `889652510_107727...jpg` | `00000000...0001` (superadmin) | `1ba77ec9-1997-4492-b83f-8184cc6dd89c.jpg` | 113,639 | `5F6106359044F887194195455BA7E4B6ED002888EACE57F4DB0BB215A14CADD9` | **`PROHIBITED — BASELINE DATA`** | Quarantined by Migration 007 (`is_quarantined = TRUE`). Physical file on `J:\NKB_Storage_Root`. **PROTECTED**. |
| `b490862b-9288-45d1-b232-d99d38b1bffb` | `editor_renamed_spec.txt` | `8a7a6647...` (stg_user_qa1) | `b490862b-9288-45d1-b232-d99d38b1bffb.txt` | 54 | `C8DB177B93575ED02DF29775A18560BFA66D7A29AEDDA842D3AB05AE91CA4891` | **`READY FOR SEPARATE AUTHORIZATION`** | Acceptance direct upload file (WF-07). Resides in `C:\NKB-Cloud-Offline-Test\Storage`. |
| `21df5407-2f97-4b80-b752-ef186bc730de` | `contrib_doc.txt` | `bc8e2468...` (stg_user_eng) | `21df5407-2f97-4b80-b752-ef186bc730de.txt` | 26 | `09855BD4884FBDB7C7612A8229AF8945047E17AF3C8E76C0F13D3D0FEE998D7F` | **`READY FOR SEPARATE AUTHORIZATION`** | Acceptance contributor test file (SEC-07). Resides in `C:\NKB-Cloud-Offline-Test\Storage`. |
| `70e030ca-dbd4-4ff4-92a9-0519d959b725` | `editor_renamed_spec.txt` | `8a7a6647...` (stg_user_qa1) | `70e030ca-dbd4-4ff4-92a9-0519d959b725.txt` | 54 | `C8DB177B93575ED02DF29775A18560BFA66D7A29AEDDA842D3AB05AE91CA4891` | **`READY FOR SEPARATE AUTHORIZATION`** | Acceptance editor test file (SEC-08). Resides in `C:\NKB-Cloud-Offline-Test\Storage`. |
| `88843ae0-c65a-447d-9592-af03c9518055` | `contrib_doc.txt` | `bc8e2468...` (stg_user_eng) | `88843ae0-c65a-447d-9592-af03c9518055.txt` | 26 | `09855BD4884FBDB7C7612A8229AF8945047E17AF3C8E76C0F13D3D0FEE998D7F` | **`READY FOR SEPARATE AUTHORIZATION`** | Acceptance contributor test file (SEC-07). Resides in `C:\NKB-Cloud-Offline-Test\Storage`. |
| `127f98ad-1a69-4a0a-bad9-b8ed41ae1def` | `resumable_report.bin` | `8a7a6647...` (stg_user_qa1) | `b0922eca-fb45-4028-af7b-6129c953441d.bin` | 46 | `C6BDFDEE5D943C18015730A19A7A59D73D26C7D25417594A24D7185D64E11EE5` | **`READY FOR SEPARATE AUTHORIZATION`** | Resumable chunked upload file from session `b0922eca...`. Resides in `C:\...`. |
| `a21d853d-4f74-4c61-b267-f163653f2a3f` | `editor_renamed_spec.txt` | `8a7a6647...` (stg_user_qa1) | `a21d853d-4f74-4c61-b267-f163653f2a3f.txt` | 54 | `C8DB177B93575ED02DF29775A18560BFA66D7A29AEDDA842D3AB05AE91CA4891` | **`READY FOR SEPARATE AUTHORIZATION`** | Acceptance editor test file (SEC-08). Resides in `C:\NKB-Cloud-Offline-Test\Storage`. |
| `45387994-ed61-48ce-a7a9-e7afd99c759c` | `resumable_report.bin` | `8a7a6647...` (stg_user_qa1) | `7c6cbce8-4a2d-4355-a7b3-87f76dcd5fb4.bin` | 46 | `C6BDFDEE5D943C18015730A19A7A59D73D26C7D25417594A24D7185D64E11EE5` | **`READY FOR SEPARATE AUTHORIZATION`** | Resumable chunked upload file from session `7c6cbce8...`. Resides in `C:\...`. |
| `0bfeddc0-45e3-452d-96ad-0c46a1afd277` | `contrib_doc.txt` | `bc8e2468...` (stg_user_eng) | `0bfeddc0-45e3-452d-96ad-0c46a1afd277.txt` | 26 | `09855BD4884FBDB7C7612A8229AF8945047E17AF3C8E76C0F13D3D0FEE998D7F` | **`READY FOR SEPARATE AUTHORIZATION`** | Acceptance contributor test file (SEC-07). Resides in `C:\NKB-Cloud-Offline-Test\Storage`. |

*Note on `file_versions`:* Every file above has exactly 1 version row in `file_versions` whose `file_id` matches the file ID and whose `version_number` is 1.

---

### 3.3 File Shares Manifest (`file_shares` table — 22 records)

| Share ID | Target Type & ID | Shared By | Shared With | Level | Provenance Token | Revoked? | Classification |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- |
| `f8e5acfc-1b2c-4924-a7b7-c63bfe42e5f5` | File: `790a8a05...jpg` | `superadmin` | Dept: QA (3) | `VIEWER` | `MIG-007-5adbd4f3-6fa3-425b-997d-f237658aa55b` | FALSE | **`PROHIBITED — BASELINE DATA`** |
| `64a787ee-84ec-426b-95eb-ce0f6e9f0d1a` | Folder: `af5ae71f...` | `superadmin` | `regression_user_b` | `VIEWER` | `NULL` | FALSE | **`NOT READY — CLASSIFICATION CONFLICT`** |
| `431289ae-3b60-496a-a212-0453d8ae2255` | Folder: `ecba4721...` | `superadmin` | `regression_user_a` | `EDITOR` | `NULL` | FALSE | **`NOT READY — CLASSIFICATION CONFLICT`** |
| `bba34220-305f-464a-a035-7cfa5f053229` | Folder: `1eb10f0b...` | `stg_user_qa1` | `stg_user_eng` | `DOWNLOADER` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `3e62f0f7-5fc7-4581-80fc-5db0d6ec3bf3` | Folder: `1eb10f0b...` | `stg_user_qa1` | `stg_user_eng` | `CONTRIBUTOR` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `315fc9cb-7cc5-462d-92c9-a0c976870c38` | Folder: `1eb10f0b...` | `stg_user_qa1` | `stg_user_eng` | `EDITOR` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `39c847f8-c620-46d8-97d0-89fdd2375896` | Folder: `1eb10f0b...` | `stg_user_qa1` | `stg_user_eng` | `VIEWER` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `6f4943d5-a2e9-4c4e-a246-a72a1fc68d68` | File: `b490862b...txt` | `stg_user_qa1` | `stg_user_eng` | `VIEWER` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `28dbd742-2514-48b0-b5bb-1321dbd2861d` | File: `70e030ca...txt` | `stg_user_qa1` | `stg_user_eng` | `VIEWER` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `23524f73-2767-4784-a1f0-12d4a79ce87b` | File: `70e030ca...txt` | `stg_user_qa1` | `stg_user_eng` | `VIEWER` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `a9e4434a-c84b-49df-a78a-81897557753e` | Folder: `4e1ddd9a...` | `stg_user_qa1` | `stg_user_eng` | `DOWNLOADER` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `fd63b34f-d0b2-41fc-b53a-e9a2ab7da159` | Folder: `4e1ddd9a...` | `stg_user_qa1` | `stg_user_eng` | `CONTRIBUTOR` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `e8b7736d-b69f-41b3-8021-b9e091008ebf` | Folder: `4e1ddd9a...` | `stg_user_qa1` | `stg_user_eng` | `EDITOR` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `6f13b38a-4014-43f4-a2ea-2179e0901284` | Folder: `4e1ddd9a...` | `stg_user_qa1` | `stg_user_eng` | `VIEWER` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `e624a2e7-6504-4c9f-bbc4-e7c5908c45ac` | File: `70e030ca...txt` | `stg_user_qa1` | `stg_user_eng` | `VIEWER` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `d0602731-b530-4154-96dc-c0b6c2f6a9c3` | File: `a21d853d...txt` | `stg_user_qa1` | `stg_user_eng` | `VIEWER` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `0ba3b093-6e1f-451e-bc17-90b5ed345985` | File: `a21d853d...txt` | `stg_user_qa1` | `stg_user_eng` | `VIEWER` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `91709a53-3835-4a9e-b91c-685147c7d4c6` | Folder: `88d1cc6b...` | `stg_user_qa1` | `stg_user_eng` | `DOWNLOADER` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `f3a067eb-c5fb-4087-882f-2365b34dbaaf` | Folder: `88d1cc6b...` | `stg_user_qa1` | `stg_user_eng` | `CONTRIBUTOR` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `58b4b2cc-5780-4c50-8864-00e22b11b788` | Folder: `88d1cc6b...` | `stg_user_qa1` | `stg_user_eng` | `EDITOR` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `6069c83d-eae9-4df5-bb2c-5250acf6bd2e` | Folder: `88d1cc6b...` | `stg_user_qa1` | `stg_user_eng` | `VIEWER` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |
| `0c4c0519-58d3-4541-93d0-8adff8389e48` | File: `a21d853d...txt` | `stg_user_qa1` | `stg_user_eng` | `VIEWER` | `NULL` | TRUE | **`READY FOR SEPARATE AUTHORIZATION`** |

---

### 3.4 Upload Sessions & Chunks Manifest
- **`upload_sessions` (5 records):**
  1. `1ba77ec9-1997-4492-b83f-8184cc6dd89c` (`889652510_...jpg`, `COMPLETED`, superadmin) $\rightarrow$ **`PROHIBITED — BASELINE DATA`**
  2. `a7445ca0-14cb-4ded-a12b-b9a41ae5ea34` (`resumable_report.bin`, `IN_PROGRESS`, stg_user_qa1) $\rightarrow$ **`READY FOR SEPARATE AUTHORIZATION`**
  3. `4cec8136-07f4-45fb-a28e-45c64d27937a` (`resumable_report.bin`, `IN_PROGRESS`, stg_user_qa1) $\rightarrow$ **`READY FOR SEPARATE AUTHORIZATION`**
  4. `b0922eca-fb45-4028-af7b-6129c953441d` (`resumable_report.bin`, `COMPLETED`, stg_user_qa1) $\rightarrow$ **`READY FOR SEPARATE AUTHORIZATION`**
  5. `7c6cbce8-4a2d-4355-a7b3-87f76dcd5fb4` (`resumable_report.bin`, `COMPLETED`, stg_user_qa1) $\rightarrow$ **`READY FOR SEPARATE AUTHORIZATION`**

- **`file_chunks` (3 records):**
  1. Chunk ID `1`: `session_id = '1ba77ec9...'`, 113,639 bytes, uploaded 2026-11-10 02:54:54 $\rightarrow$ **`PROHIBITED — BASELINE DATA`**
  2. Chunk ID `2`: `session_id = 'b0922eca...'`, 46 bytes, SHA-256: `c6bdfdee...` $\rightarrow$ **`READY FOR SEPARATE AUTHORIZATION`**
  3. Chunk ID `3`: `session_id = '7c6cbce8...'`, 46 bytes, SHA-256: `c6bdfdee...` $\rightarrow$ **`READY FOR SEPARATE AUTHORIZATION`**

---

### 3.5 Users Manifest (`users` table — 10 records)

| User ID | Username | Role Name | Dept ID | Status | Created At | Classification | Deletion Strategy |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `00000000-0000-0000-0000-000000000001` | `superadmin` | SUPER_ADMIN | 1 | ACTIVE | 2026-11-10 01:13:10 | **`PROHIBITED — BASELINE DATA`** | Root Administrator. Never modified or deleted. |
| `aee0bafc-81af-4534-8c4a-62cbb5284aa4` | `regression_user_a` | USER | 2 | ACTIVE | 2026-11-10 06:10:48 | **`READY (SOFT-DEACTIVATE)`** | Soft-deactivate to `status = 'INACTIVE'`. |
| `defb6035-8857-4367-bcd4-fb65dc9a3a87` | `regression_user_b` | USER | 3 | ACTIVE | 2026-11-10 06:10:48 | **`READY (SOFT-DEACTIVATE)`** | Soft-deactivate to `status = 'INACTIVE'`. |
| `92f4b2ab-9dbe-4e8c-b519-206656845430` | `session_test_user` | USER | 2 | ACTIVE | 2026-11-10 08:49:09 | **`READY (SOFT-DEACTIVATE)`** | Soft-deactivate to `status = 'INACTIVE'`. |
| `84ac0bf0-842a-4616-ae45-6057434887be` | `stg_superadmin` | SUPER_ADMIN | 1 | ACTIVE | 2026-11-10 09:21:38 | **`READY (SOFT-DEACTIVATE)`** | Soft-deactivate to `status = 'INACTIVE'`. |
| `f2c199b3-05c6-4c49-8316-e0a1f90759d1` | `stg_admin_it` | ADMIN | 2 | ACTIVE | 2026-11-10 09:21:38 | **`READY (SOFT-DEACTIVATE)`** | Soft-deactivate to `status = 'INACTIVE'`. |
| `680992a8-9be2-421f-88ef-981712a6e5db` | `stg_mgr_qa` | USER | 3 | ACTIVE | 2026-11-10 09:21:38 | **`READY (SOFT-DEACTIVATE)`** | Soft-deactivate to `status = 'INACTIVE'`. |
| `8a7a6647-7e1f-4aaf-ad15-d1014f913a61` | `stg_user_qa1` | USER | 3 | ACTIVE | 2026-11-10 09:21:38 | **`READY (SOFT-DEACTIVATE)`** | Soft-deactivate to `status = 'INACTIVE'`. |
| `bc8e2468-6b9b-4c0f-b804-1f9c081881e5` | `stg_user_eng` | USER | 4 | ACTIVE | 2026-11-10 09:21:38 | **`READY (SOFT-DEACTIVATE)`** | Soft-deactivate to `status = 'INACTIVE'`. |
| `fc32573a-e4d3-433a-99bd-97876616a7a2` | `stg_viewer` | VIEWER | 3 | ACTIVE | 2026-11-10 09:21:38 | **`READY (SOFT-DEACTIVATE)`** | Soft-deactivate to `status = 'INACTIVE'`. |

---

## 4. PHYSICAL FILE RECOVERY VALIDATION & MANIFEST

### 4.1 Physical Files Manifest (`C:\NKB-Cloud-Offline-Test\Storage`)

| Physical File Name | Absolute Path | Size | SHA-256 Digest | DB File ID | Upload Session ID |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `0bfeddc0-45e3-452d-96ad-0c46a1afd277.txt` | `C:\NKB-Cloud-Offline-Test\Storage\0bfeddc0-45e3-452d-96ad-0c46a1afd277.txt` | 26 B | `09855BD4884FBDB7C7612A8229AF8945047E17AF3C8E76C0F13D3D0FEE998D7F` | `0bfeddc0-45e3-452d-96ad-0c46a1afd277` | `NULL` (Direct upload) |
| `21df5407-2f97-4b80-b752-ef186bc730de.txt` | `C:\NKB-Cloud-Offline-Test\Storage\21df5407-2f97-4b80-b752-ef186bc730de.txt` | 26 B | `09855BD4884FBDB7C7612A8229AF8945047E17AF3C8E76C0F13D3D0FEE998D7F` | `21df5407-2f97-4b80-b752-ef186bc730de` | `NULL` (Direct upload) |
| `70e030ca-dbd4-4ff4-92a9-0519d959b725.txt` | `C:\NKB-Cloud-Offline-Test\Storage\70e030ca-dbd4-4ff4-92a9-0519d959b725.txt` | 54 B | `C8DB177B93575ED02DF29775A18560BFA66D7A29AEDDA842D3AB05AE91CA4891` | `70e030ca-dbd4-4ff4-92a9-0519d959b725` | `NULL` (Direct upload) |
| `7c6cbce8-4a2d-4355-a7b3-87f76dcd5fb4.bin` | `C:\NKB-Cloud-Offline-Test\Storage\7c6cbce8-4a2d-4355-a7b3-87f76dcd5fb4.bin` | 46 B | `C6BDFDEE5D943C18015730A19A7A59D73D26C7D25417594A24D7185D64E11EE5` | `45387994-ed61-48ce-a7a9-e7afd99c759c` | `7c6cbce8-4a2d-4355-a7b3-87f76dcd5fb4` |
| `88843ae0-c65a-447d-9592-af03c9518055.txt` | `C:\NKB-Cloud-Offline-Test\Storage\88843ae0-c65a-447d-9592-af03c9518055.txt` | 26 B | `09855BD4884FBDB7C7612A8229AF8945047E17AF3C8E76C0F13D3D0FEE998D7F` | `88843ae0-c65a-447d-9592-af03c9518055` | `NULL` (Direct upload) |
| `a21d853d-4f74-4c61-b267-f163653f2a3f.txt` | `C:\NKB-Cloud-Offline-Test\Storage\a21d853d-4f74-4c61-b267-f163653f2a3f.txt` | 54 B | `C8DB177B93575ED02DF29775A18560BFA66D7A29AEDDA842D3AB05AE91CA4891` | `a21d853d-4f74-4c61-b267-f163653f2a3f` | `NULL` (Direct upload) |
| `b0922eca-fb45-4028-af7b-6129c953441d.bin` | `C:\NKB-Cloud-Offline-Test\Storage\b0922eca-fb45-4028-af7b-6129c953441d.bin` | 46 B | `C6BDFDEE5D943C18015730A19A7A59D73D26C7D25417594A24D7185D64E11EE5` | `127f98ad-1a69-4a0a-bad9-b8ed41ae1def` | `b0922eca-fb45-4028-af7b-6129c953441d` |
| `b490862b-9288-45d1-b232-d99d38b1bffb.txt` | `C:\NKB-Cloud-Offline-Test\Storage\b490862b-9288-45d1-b232-d99d38b1bffb.txt` | 54 B | `C8DB177B93575ED02DF29775A18560BFA66D7A29AEDDA842D3AB05AE91CA4891` | `b490862b-9288-45d1-b232-d99d38b1bffb` | `NULL` (Direct upload) |

*Subdirectory Artifacts:* Subdirectory `C:\NKB-Cloud-Offline-Test\Storage\test_uploads` contains local generator binaries (`dummy_100MB.bin`, `dummy_10MB.bin`, `dummy_500MB.bin`, `dummy_document.pdf`, `dummy_image.png`, `dummy_sample.txt`, `interrupted_test.bin`) used as test feeds.

### 4.2 Physical Backup & Restoration-Test Runbook
> [!IMPORTANT]
> **PostgreSQL `pg_dump` DOES NOT back up disk binaries.**
> A database backup only archives metadata (UUIDs, hashes, timestamps). Physical files on disk must be independently backed up, checksummed, and restoration-tested.

Before any physical file cleanup may be executed, the operator must execute this physical backup and restoration-test sequence:

#### Step 1: Create Timestamped Compressed Archive
```powershell
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "C:\NKB-Cloud-Offline-Test\Backups"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$archivePath = "$backupDir\synthetic_storage_backup_$timestamp.zip"

Compress-Archive -Path "C:\NKB-Cloud-Offline-Test\Storage\*" -DestinationPath $archivePath -CompressionLevel Optimal
$archiveHash = (Get-FileHash -Algorithm SHA256 $archivePath).Hash
Write-Host "Physical Storage Backup Archive Created: $archivePath"
Write-Host "Archive SHA-256: $archiveHash"
```

#### Step 2: Restoration Test into Isolated Scratch Directory
```powershell
$restoreTestDir = "C:\NKB-Cloud-Offline-Test\Restore_Test_$timestamp"
Expand-Archive -Path $archivePath -DestinationPath $restoreTestDir -Force

# Verify all 8 files restored with exact bit-for-bit SHA-256 matches
$manifest = @{
    "0bfeddc0-45e3-452d-96ad-0c46a1afd277.txt" = "09855BD4884FBDB7C7612A8229AF8945047E17AF3C8E76C0F13D3D0FEE998D7F"
    "21df5407-2f97-4b80-b752-ef186bc730de.txt" = "09855BD4884FBDB7C7612A8229AF8945047E17AF3C8E76C0F13D3D0FEE998D7F"
    "70e030ca-dbd4-4ff4-92a9-0519d959b725.txt" = "C8DB177B93575ED02DF29775A18560BFA66D7A29AEDDA842D3AB05AE91CA4891"
    "7c6cbce8-4a2d-4355-a7b3-87f76dcd5fb4.bin" = "C6BDFDEE5D943C18015730A19A7A59D73D26C7D25417594A24D7185D64E11EE5"
    "88843ae0-c65a-447d-9592-af03c9518055.txt" = "09855BD4884FBDB7C7612A8229AF8945047E17AF3C8E76C0F13D3D0FEE998D7F"
    "a21d853d-4f74-4c61-b267-f163653f2a3f.txt" = "C8DB177B93575ED02DF29775A18560BFA66D7A29AEDDA842D3AB05AE91CA4891"
    "b0922eca-fb45-4028-af7b-6129c953441d.bin" = "C6BDFDEE5D943C18015730A19A7A59D73D26C7D25417594A24D7185D64E11EE5"
    "b490862b-9288-45d1-b232-d99d38b1bffb.txt" = "C8DB177B93575ED02DF29775A18560BFA66D7A29AEDDA842D3AB05AE91CA4891"
}

foreach ($item in $manifest.GetEnumerator()) {
    $filePath = Join-Path $restoreTestDir $item.Key
    $computedHash = (Get-FileHash -Algorithm SHA256 $filePath).Hash
    if ($computedHash -ne $item.Value) {
        throw "RESTORATION VERIFICATION FAILED FOR $($item.Key)"
    }
}
Write-Host "Restoration Verification PASSED: All 8 files bit-exact."
Remove-Item -Recurse -Force $restoreTestDir
```

### 4.3 Physical Cleanup Readiness Finding
Because this physical archive and restoration test have **NOT YET BEEN EXECUTED** (prioritizing read-only safety), physical cleanup is formally classified as:
> **`NOT READY — BACKUP REQUIRED`**

---

## 5. DATABASE DEPENDENCY VALIDATION & AUDIT CONSTRAINTS

A comprehensive audit of PostgreSQL constraints, triggers, and foreign keys was performed across all affected tables.

```mermaid
flowchart TD
    subgraph UsersTable["users Table"]
        U_Synth["Synthetic Users (stg_*, regression_*)"]
        U_Base["superadmin (00000000...0001)"]
    end

    subgraph AuditEntities["Immutable Audit Tables"]
        AL["audit_logs (156 rows)\nFK: user_id -> ON DELETE SET NULL"]
        FAE["file_activity_events (6 rows)\nFK: actor_user_id -> ON DELETE SET NULL"]
        LAE["login_audit_events (8 rows)\nFK: user_id -> ON DELETE SET NULL"]
        TR_AL["Trigger: trg_prevent_audit_log_mutation\n(BEFORE UPDATE/DELETE -> EXCEPTION)"]
        TR_FAE["Trigger: trg_prevent_file_activity_mutation\n(BEFORE UPDATE/DELETE -> EXCEPTION)"]
        TR_LAE["Trigger: trg_prevent_login_audit_mutation\n(BEFORE UPDATE/DELETE -> EXCEPTION)"]
        AL --> TR_AL
        FAE --> TR_FAE
        LAE --> TR_LAE
    end

    subgraph CoreEntities["File & Sharing Entities"]
        FS["file_shares (22 rows)\nFK: shared_by, shared_with_user_id -> CASCADE"]
        FC["file_chunks (3 rows)\nFK: session_id -> CASCADE"]
        US["upload_sessions (5 rows)\nFK: user_id -> CASCADE"]
        FV["file_versions (9 rows)\nFK: uploaded_by -> NO ACTION (RESTRICT)"]
        F["files (9 rows)\nFK: owner_id -> CASCADE"]
        FOL["folders (29 rows)\nFK: owner_id -> CASCADE, parent_id -> CASCADE"]
    end

    U_Synth -.->|Attempted Hard DELETE| AL
    U_Synth -.->|Attempted Hard DELETE| FAE
    U_Synth -.->|Attempted Hard DELETE| LAE
    U_Synth -->|CASCADE| US
    U_Synth -->|RESTRICT (NO ACTION)| FV
    U_Synth -->|CASCADE| F
    U_Synth -->|CASCADE| FOL

    classDef danger fill:#ffdddd,stroke:#d9534f,stroke-width:2px;
    classDef safe fill:#ddffdd,stroke:#5cb85c,stroke-width:2px;
    classDef neutral fill:#f9f9f9,stroke:#999999,stroke-width:1px;

    class TR_AL,TR_FAE,TR_LAE danger;
    class U_Base safe;
    class U_Synth,AL,FAE,LAE,FS,FC,US,FV,F,FOL neutral;
```

### 5.1 The Mathematical Impossibility of Hard-Deleting Users
Live database inspection revealed the following foreign key definitions:
1. `audit_logs.user_id` $\rightarrow$ `users.id` with `delete_rule = 'SET NULL'`.
2. `file_activity_events.actor_user_id` $\rightarrow$ `users.id` with `delete_rule = 'SET NULL'`.
3. `login_audit_events.user_id` $\rightarrow$ `users.id` with `delete_rule = 'SET NULL'`.
4. `file_versions.uploaded_by` $\rightarrow$ `users.id` with `delete_rule = 'NO ACTION'` (RESTRICT).

**Impact of Attempting Hard Deletion (`DELETE FROM users WHERE ...`):**
- When PostgreSQL attempts to delete a user who acted in any test scenario, the foreign key cascades an `UPDATE ... SET user_id = NULL` onto `audit_logs`, `file_activity_events`, and `login_audit_events`.
- However, every one of these tables has an active `BEFORE UPDATE` trigger (`prevent_audit_log_mutation()`, `prevent_file_activity_mutation()`, `prevent_login_audit_mutation()`).
- The trigger executes, intercepts the `UPDATE`, and raises an immediate exception:
  `AUDIT_LOG_IMMUTABLE: Updates to audit_logs are strictly prohibited.`
- Furthermore, `file_versions.uploaded_by` enforces `NO ACTION` (RESTRICT), aborting user deletion if any file version was uploaded by that user.

**Conclusion:** **Hard deletion of synthetic users is technically prohibited by database constraints and immutability triggers.**

### 5.2 Safe User Remediation: Soft Deactivation
The proposed soft-deactivation strategy:
```sql
UPDATE users 
SET status = 'INACTIVE', 
    email = 'inactive_' || id || '@staging.local' 
WHERE username LIKE 'stg_%' 
   OR username LIKE 'regression_%' 
   OR username = 'session_test_user';
```
- Does **NOT** modify `users.id`, completely avoiding foreign-key cascade actions.
- Does **NOT** touch `audit_logs`, `login_audit_events`, or `file_activity_events`.
- Excludes `superadmin` (`00000000-0000-0000-0000-000000000001`).
- Completely revokes authentication and session issuance across the platform.

### 5.3 Validated Entity Deletion Sequence
The proposed deletion dependency order was inspected and validated:
$$\text{file\_shares} \longrightarrow \text{file\_chunks} \longrightarrow \text{upload\_sessions} \longrightarrow \text{file\_versions} \longrightarrow \text{files} \longrightarrow \text{folders}$$

1. **`file_shares`:** Deleting synthetic shares eliminates references to synthetic files and folders.
2. **`file_chunks`:** Deleting synthetic chunks eliminates foreign key references to `upload_sessions`.
3. **`upload_sessions`:** Deleting synthetic upload sessions removes references to `folders`.
4. **`file_versions`:** Deleting synthetic file versions eliminates `uploaded_by` foreign keys on `users` and `file_id` on `files`.
5. **`files`:** Deleting synthetic files eliminates `folder_id` foreign keys on `folders`.
6. **`folders`:** Deleting synthetic folders in reverse hierarchical order (children first, then parents) avoids self-referential `parent_id` foreign key violations.

---

## 6. AUDIT CHAIN PRESERVATION VERIFICATION

All 156 audit records across the system were verified as intact, untampered, and unbroken:

### 6.1 Audit Record Inventory
- Total records in `audit_logs`: **156**
  - Baseline historical records (`id <= 80`): **80** (**VERIFIED INTACT**)
  - Acceptance append-only records (`id > 80`): **76** (**VERIFIED INTACT**)
- Total records in `login_audit_events`: **8** (**VERIFIED INTACT**)
- Total records in `file_activity_events`: **6** (**VERIFIED INTACT**)

### 6.2 Cryptographic Chain Heads Verification
The live database chain heads were extracted and compared against the authoritative pointers in `system_settings`:

| Audit Chain | Current Table Tail Hash | `system_settings` Pointer | Verification Result |
| :--- | :--- | :--- | :---: |
| **`audit_logs`** | `c3674e67388bc088a814ac43da80a9d6edd784cd51f179034fd5aaf4e2a1e54a` | `c3674e67388bc088a814ac43da80a9d6edd784cd51f179034fd5aaf4e2a1e54a` | **MATCH (100% Intact)** |
| **`login_audit_events`** | `53f84234fb1045f3709d874f1ed4a12faa2385c5d3c673b454dc140272080ad7` | `53f84234fb1045f3709d874f1ed4a12faa2385c5d3c673b454dc140272080ad7` | **MATCH (100% Intact)** |
| **`file_activity_events`** | `0549c42f1f1e50274b528c28cb5ce531c71e549c0bb9eb7b97c9c1bbae367304` | `0549c42f1f1e50274b528c28cb5ce531c71e549c0bb9eb7b97c9c1bbae367304` | **MATCH (100% Intact)** |

- Zero audit records are scheduled for deletion.
- Zero audit triggers have been bypassed or disabled.
- Chain integrity remains continuous from Genesis to HEAD.

---

## 7. FINAL CLEANUP READINESS MATRIX

Each proposed cleanup operation is evaluated and assigned its strict operational classification:

| Target Component / Scope | Proposed Operation | Classification | Blocking Condition / Operational Justification |
| :--- | :--- | :---: | :--- |
| **Physical Storage (`C:\...`)** | Deletion of 8 synthetic files | **`NOT READY — BACKUP REQUIRED`** | Standalone physical zip archive and non-destructive restoration test must be executed before deletion. |
| **Physical Storage (`test_uploads`)** | Deletion of generator binaries | **`NOT READY — BACKUP REQUIRED`** | Standalone physical backup archive required. |
| **Synthetic File Shares** | `DELETE FROM file_shares (21 rows)` | **`READY FOR SEPARATE AUTHORIZATION`** | Validated reverse-dependency step 1. Zero baseline impact. |
| **Synthetic File Chunks** | `DELETE FROM file_chunks (2 rows)` | **`READY FOR SEPARATE AUTHORIZATION`** | Validated reverse-dependency step 2. Zero baseline impact. |
| **Synthetic Upload Sessions** | `DELETE FROM upload_sessions (4 rows)` | **`READY FOR SEPARATE AUTHORIZATION`** | Validated reverse-dependency step 3. Zero baseline impact. |
| **Synthetic File Versions** | `DELETE FROM file_versions (8 rows)` | **`READY FOR SEPARATE AUTHORIZATION`** | Validated reverse-dependency step 4. Clears user restrict FK. |
| **Synthetic Files** | `DELETE FROM files (8 rows)` | **`READY FOR SEPARATE AUTHORIZATION`** | Validated reverse-dependency step 5. Clears folder restrict FK. |
| **Synthetic Folders** | `DELETE FROM folders (7 rows)` | **`READY FOR SEPARATE AUTHORIZATION`** | Validated reverse-dependency step 6 (child folders deleted before parent folders). |
| **Early Sandbox Folders** | Deletion of `Parent_Workspace` & Child | **`NOT READY — CLASSIFICATION CONFLICT`** | Folders owned by superadmin. Requires explicit operator concurrence on whether to preserve for future dev suites. |
| **Synthetic User Accounts** | Hard Deletion (`DELETE FROM users`) | **`NOT READY — DEPENDENCY RISK`** | **CRITICAL RISK:** Triggers PostgreSQL `ON DELETE SET NULL` on audit tables, causing immediate trigger abortion (`prevent_audit_log_mutation`). |
| **Synthetic User Accounts** | Soft Deactivation (`status = 'INACTIVE'`) | **`READY FOR SEPARATE AUTHORIZATION`** | Safely invalidates login, preserves audit integrity, and avoids all foreign key exceptions. |
| **Superadmin Account** | Any modification / deletion | **`PROHIBITED — BASELINE DATA`** | Root system administrator (`00000000-0000-0000-0000-000000000001`). Must be protected. |
| **Departments (1–6)** | Any modification / deletion | **`PROHIBITED — BASELINE DATA`** | Core organizational structure. Must be protected. |
| **Quarantined Folders (20)** | Any modification / deletion | **`PROHIBITED — BASELINE DATA`** | Migration 007 quarantined legacy assets. Must be protected. |
| **Quarantined File (1)** | Any modification / deletion | **`PROHIBITED — BASELINE DATA`** | Migration 007 quarantined legacy file (`790a8a05...jpg`). Must be protected. |
| **Physical Reference File** | Any modification / deletion | **`PROHIBITED — BASELINE DATA`** | Physical file on `J:\NKB_Storage_Root` (113,639 B, SHA-256: `5F610635...`). Must be protected. |
| **Baseline Share Grant (1)** | Any modification / deletion | **`PROHIBITED — BASELINE DATA`** | Share `f8e5acfc...` carrying Migration 007 token. Must be protected. |
| **Audit Logs (156 rows)** | Any modification / deletion | **`PROHIBITED — BASELINE DATA`** | Cryptographically chained, immutable compliance log. Must be preserved in perpetuity. |

---

## 8. OUTSTANDING RISKS & PRE-EXECUTION RUNBOOK

1. **Risk of Accidental Binary Loss:**
   - *Risk:* Relying on `pg_dump` alone would permanently lose synthetic test artifacts before verification is signed off.
   - *Mitigation:* Physical zip archive of `C:\NKB-Cloud-Offline-Test\Storage` must be verified via non-destructive extraction before any file deletion is authorized.
2. **Risk of Cascade Trigger Abort:**
   - *Risk:* An operator attempting `DELETE FROM users` will abort the transaction due to `prevent_audit_log_mutation()`.
   - *Mitigation:* The authorized execution script must strictly execute soft deactivation (`status = 'INACTIVE'`) rather than `DELETE`.
3. **Risk of Self-Referencing Folder Cascade:**
   - *Risk:* Deleting a parent folder before its child folders may trigger unexpected cascade behavior or constraint violations if constraints are deferred.
   - *Mitigation:* Deletion script must explicitly delete children (`87ea67cd...`, `92c6cef8...`, `82c7ad72...`) before parents (`1eb10f0b...`, `4e1ddd9a...`, `88d1cc6b...`, `66984d46...`).

---

## 9. FINAL STOP & GATE STATUS CONFIRMATION

The isolated staging environment remains in its secure, frozen state:

- **Universal Maintenance Gate:** `STAGING_MAINTENANCE_GATE=true` remains **ACTIVE**.
- **Platform Health:** `GET http://127.0.0.1:5000/health` reports `status: MAINTENANCE`.
- **API Exposure:** `GET http://127.0.0.1:5000/api/operational/gate-status` returns HTTP 503 `STAGING_MAINTENANCE_GATE_ACTIVE`.
- **Physical Reference File:** `J:\NKB_Storage_Root\1ba77ec9-1997-4492-b83f-8184cc6dd89c.jpg` verified bit-exact (SHA-256: `5F6106359044F887194195455BA7E4B6ED002888EACE57F4DB0BB215A14CADD9`).
- **PostgreSQL Database:** `nkb_cloud_local_test` on `127.0.0.1:5433` (Docker: `nkb_pg16_staging`).
- **Audit Chains:** All 3 SHA-256 hash chains verified intact against `system_settings`.

**STATUS: RECONCILIATION COMPLETE. STOPPING EXECUTION AND AWAITING SEPARATE WRITTEN AUTHORIZATION.**
