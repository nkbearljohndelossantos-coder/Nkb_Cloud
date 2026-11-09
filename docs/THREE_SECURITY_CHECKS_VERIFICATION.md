# NKB CLOUD v2.1.0 — THREE MANDATORY SECURITY CHECKS & BACKUP INTEGRITY VERIFICATION REPORT

**Organization:** NKB Manufacturing  
**Platform:** NKB Cloud Private Storage Platform  
**Target Engine:** PostgreSQL 16.15 (Alpine Linux x86_64 in Docker staging container `nkb_pg16_staging`)  
**Date of Execution:** November 9, 2026  
**Overall Result:** **ALL 3 CHECKS 100% PASSED (26 / 26 Verifications Certified)**

---

### EXECUTIVE SUMMARY

Prior to formal Stage 2 sign-off, three non-negotiable security requirements were verified against a live PostgreSQL 16 engine:
1. **Audit Hash-Chain Concurrency:** Transaction-safe serialization was implemented via row-level `FOR UPDATE` locking on `system_settings ('audit_chain_head')`, preventing chain forking, duplicate sequences, and lock upgrade deadlocks. Tested under 25 simultaneous concurrent insert transactions.
2. **Audit Protection Bypass:** Confirmed that `nkb_app` possesses `NOSUPERUSER`, `NOBYPASSRLS`, and does not own `audit_logs`. Direct attempts by `nkb_app` to disable triggers, drop triggers, or mutate records (`UPDATE`, `DELETE`, `TRUNCATE`) were rejected by PostgreSQL security checks.
3. **Backup Restoration Integrity:** A complete backup and restore drill was conducted. Beyond matching the 36 physical tables and 2 views, table-by-table row counts, table-by-table deterministic MD5 data checksums, and representative record contents were verified with 100% bit-for-bit parity.

---

### 1. CHECK 1: AUDIT HASH-CHAIN CONCURRENCY & SERIALIZATION

#### Vulnerability Analysis
In PostgreSQL's default `READ COMMITTED` isolation mode, multiple concurrent transactions inserting into `audit_logs` at the same instant take their MVCC snapshots at statement inception. An ordinary query like `SELECT record_hash FROM audit_logs ORDER BY id DESC LIMIT 1` within an uncoordinated trigger reads the latest *committed* row at the moment the query began. If two transactions execute simultaneously before either commits, both read the identical parent hash, creating a branched (forked) hash chain. Furthermore, escalating table locks within a trigger causes lock upgrade deadlocks (`ShareRowExclusiveLock` vs `RowExclusiveLock`).

#### Solution: Row-Level Head Pointer Serialization
To eliminate both deadlocks and chain forking without creating extra physical tables, the latest hash is tracked in `system_settings` under the key `'audit_chain_head'`. Within the `BEFORE INSERT` trigger function `compute_audit_log_hash_chain()`, the trigger executes:
```sql
SELECT setting_value INTO prev_hash
FROM system_settings
WHERE setting_key = 'audit_chain_head'
FOR UPDATE;

NEW.previous_hash := prev_hash;
NEW.record_hash := encode(digest(payload, 'sha256'), 'hex');

UPDATE system_settings
SET setting_value = NEW.record_hash, updated_at = CURRENT_TIMESTAMP
WHERE setting_key = 'audit_chain_head';
```
In PostgreSQL, `SELECT ... FOR UPDATE` on a specific row forces competing concurrent transactions to queue. Upon row release, PostgreSQL's `EvalPlanQual` automatically re-evaluates the query with the newly committed updated value, guaranteeing that each subsequent transaction receives the exact hash of the immediately preceding transaction.

#### Concurrency Test Evidence (25 Concurrent Transactions)
```
  Executing 25 simultaneous concurrent insert transactions via separate pools...
  ✅ [PASS]: All 25 concurrent transactions completed
  ✅ [PASS]: Total audit records recorded: 25
  ✅ [PASS]: Zero hash chain forking detected: No duplicate previous_hash across concurrent inserts
  Inspecting chain structure:
  ✅ [PASS]: Genesis record with initial 0000... hash found
  Traversed unbroken cryptographic chain length: 25 of 25
  ✅ [PASS]: Strict sequential cryptographic hash chain intact across all 25 records
  ✅ [PASS]: All record hashes conform to 256-bit hexadecimal cryptographic specification
```

---

### 2. CHECK 2: AUDIT PROTECTION BYPASS PREVENTION (`nkb_app`)

#### Security Boundaries
1. **No Superuser Privilege:** `nkb_app` is granted `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`.
2. **Table Ownership Separation:** Tables `audit_logs` and `dlp_test_evidence` are strictly owned by `postgres`. Non-owners cannot disable or drop triggers.
3. **Explicit Privilege Revocations:** Privilege to perform `UPDATE`, `DELETE`, `TRUNCATE`, or manage `TRIGGER` is explicitly revoked from `nkb_app`.

#### Privilege Verification Matrix
| Target Object | Action Attempted | Role | Expected Result | Live Engine Result | Conformance |
|---|---|---|---|---|---|
| `pg_roles` | Check `rolsuper` | `nkb_app` | `FALSE` | `rolsuper = false` | **PASS** |
| `pg_roles` | Check `rolbypassrls` | `nkb_app` | `FALSE` | `rolbypassrls = false` | **PASS** |
| `audit_logs` | Check table owner | `nkb_app` | `postgres` | `tableowner = postgres` | **PASS** |
| `audit_logs` | `DISABLE TRIGGER ALL` | `nkb_app` | Error: must be owner | `must be owner of relation audit_logs` | **PASS** |
| `audit_logs` | `DROP TRIGGER` | `nkb_app` | Error: must be owner | `must be owner of relation audit_logs` | **PASS** |
| `audit_logs` | `UPDATE audit_logs SET...` | `nkb_app` | Error: permission denied | `permission denied for table audit_logs` | **PASS** |
| `audit_logs` | `DELETE FROM audit_logs...` | `nkb_app` | Error: permission denied | `permission denied for table audit_logs` | **PASS** |
| `audit_logs` | `TRUNCATE TABLE audit_logs` | `nkb_app` | Error: permission denied | `permission denied for table audit_logs` | **PASS** |
| `audit_logs` | `INSERT INTO audit_logs...` | `nkb_app` | Allowed (Authorized) | Inserted record id successfully returned | **PASS** |

---

### 3. CHECK 3: BACKUP RESTORATION INTEGRITY & CONTENT CHECKSUMS

#### Methodology
1. A fresh database `nkb_cloud_source` was created, populated with the full schema (36 tables, 2 views) and seeded with representative multi-table records (users, storage agents, devices, volumes, folders, files, DLP evidence).
2. For each of the 36 physical tables, baseline row counts and deterministic content checksums were calculated:
   $$\text{Checksum} = \text{MD5}\left(\sum \text{MD5}(\text{row\_data})\right)$$
3. A binary custom-format backup was generated using `pg_dump -Fc`.
4. A fresh, clean target database `nkb_cloud_restored` was initialized and restored using `pg_restore`.
5. Post-restoration metrics were recalculated and compared against the baseline.

#### Table-by-Table Data Checksum & Row Count Parity Evidence

| Table Name | Source Rows | Restored Rows | Source MD5 Checksum | Restored MD5 Checksum | Status |
|---|:---:|:---:|:---:|:---:|:---:|
| `agent_command_results` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `agent_commands` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `agent_credentials` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `agent_heartbeats` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `agent_nonce_registry` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `audit_logs` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `departments` | 6 | 6 | `be98619ce8189f636e3e0e4e0f03148c` | `be98619ce8189f636e3e0e4e0f03148c` | **MATCH** |
| `dlp_test_evidence` | 11 | 11 | `8ae2ab04a98fb126f409ee79a7e6a5e3` | `8ae2ab04a98fb126f409ee79a7e6a5e3` | **MATCH** |
| `dlp_test_runs` | 1 | 1 | `514c0d5919450093ed6097c95801ab98` | `514c0d5919450093ed6097c95801ab98` | **MATCH** |
| `download_logs` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `file_checksums` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `file_chunks` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `file_permissions` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `file_shares` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `file_versions` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `files` | 1 | 1 | `a5878d29a3f7b71a665ef60785d23a93` | `a5878d29a3f7b71a665ef60785d23a93` | **MATCH** |
| `folders` | 1 | 1 | `4f25790d965ea6684f00d41ebf3b54e2` | `4f25790d965ea6684f00d41ebf3b54e2` | **MATCH** |
| `migration_file_results` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `migration_jobs` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `permissions` | 14 | 14 | `841dc865c68ca8c756d52f17b5d105e5` | `841dc865c68ca8c756d52f17b5d105e5` | **MATCH** |
| `recycle_bin` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `role_permissions` | 29 | 29 | `05f464cf4a25b70f434e77c0aeebb340` | `05f464cf4a25b70f434e77c0aeebb340` | **MATCH** |
| `roles` | 4 | 4 | `baca2cdc864d8bedafe965396e00197e` | `baca2cdc864d8bedafe965396e00197e` | **MATCH** |
| `storage_agents` | 1 | 1 | `55bc9ecaa94888ad3100a261d1e3feed` | `55bc9ecaa94888ad3100a261d1e3feed` | **MATCH** |
| `storage_devices` | 1 | 1 | `866a4f03b2de82f940198b447ebd3280` | `866a4f03b2de82f940198b447ebd3280` | **MATCH** |
| `storage_health_logs` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `storage_identity_conflicts` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `storage_identity_observations` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `storage_integrity_jobs` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `storage_integrity_results` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `storage_mount_history` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `storage_registrations` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `storage_volumes` | 1 | 1 | `e36011e5d5af1691abd58ace58a4a920` | `e36011e5d5af1691abd58ace58a4a920` | **MATCH** |
| `system_settings` | 13 | 13 | `c698a5409b7b3e25f2e90775b942ba51` | `c698a5409b7b3e25f2e90775b942ba51` | **MATCH** |
| `upload_sessions` | 0 | 0 | `54c0ccd6738aa3c17433071b827e3945` | `54c0ccd6738aa3c17433071b827e3945` | **MATCH** |
| `users` | 2 | 2 | `04d42e0a8667979f44e288596882ad03` | `04d42e0a8667979f44e288596882ad03` | **MATCH** |

#### Representative Record Content Parity
- **User Record (`users`):** `username = 'integrity_tester'`, bcrypt password hash, role ID, and department ID matched identically across source and restored databases.
- **File Record (`files`):** `name = 'engine_mount_blueprint.dwg'`, `sha256_hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'`, `size_bytes = 4859201` matched bit-for-bit.
- **Storage Volume (`storage_volumes`):** `volume_guid = 'VOL-UUID-F7B2-9981'`, `composite_identity = 'composite_fingerprint_hash_verification_abc123'` matched bit-for-bit.

---

### 4. CONCLUSION

All three security checks have been fully remediated and verified under automated execution against live PostgreSQL 16:
- Concurrency hash-chain serialization is guaranteed without table locking deadlocks.
- Role privilege separation prevents trigger disabling or audit log manipulation.
- Backup restoration demonstrates 100% table count, row count, and content checksum parity.
