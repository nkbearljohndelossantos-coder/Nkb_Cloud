# NKB CLOUD — DATABASE MIGRATION GUIDE & ARCHITECTURE
**Version:** 2.1.0-PROD (Stage 1 Remediated)  
**Organization:** NKB Manufacturing  
**Target Environment:** PostgreSQL 16 on Hostinger VPS (AlmaLinux 10)  
**Migration Engine:** [`server/db/migrate.js`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/migrate.js)  

---

## 1. Migration Architecture & Versioning Principles

All database changes in NKB Cloud adhere to strict enterprise zero-destruction standards:

1. **Immutable Historical Migrations**: Once a migration is applied in any environment, it is never modified. Subsequent schema modifications, additions, or table remediation must be delivered in a strictly forward-numbered migration file (`003`, `004`, etc.).
2. **Transactional DDL**: Every migration is enclosed in an explicit transaction (`BEGIN; ... COMMIT;`). If any query or constraint fails, the entire migration rolls back atomically.
3. **Tracking Registry**: Migrations are recorded in the `schema_migrations` table (`version VARCHAR(50) PRIMARY KEY`, `name VARCHAR(255)`, `applied_at TIMESTAMP WITH TIME ZONE`).
4. **Non-Destructive Operations**: Migrations use `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, and safe backfill updates. Columns and tables are **never** dropped during an upgrade migration.
5. **Safety-Locked Rollback**: Rollbacks require the explicit administrative flag `--confirm-destructive-rollback`.

---

## 2. Versioned Migration Inventory

| Version | File Name | Description | Cumulative Base Tables |
|---|---|---|---|
| **001** | [`001_initial_schema.sql`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/migrations/001_initial_schema.sql) | Baseline schema: IAM, users, devices, volumes, folders, files, versions, shares, upload sessions, recycle bin, download logs, audit logs, and settings. | 20 Tables |
| **002** | [`002_v2.1.0_identity_security_dlp.sql`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/migrations/002_v2.1.0_identity_security_dlp.sql) | Non-destructive addition of 3-layer identity, agent security credentials, nonces, typed command envelopes, file-level migrations, integrity jobs, and DLP evidence. | 33 Tables + 2 Views |
| **003** | [`003_add_missing_stage1_tables.sql`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/migrations/003_add_missing_stage1_tables.sql) | Remediation AUD-02: Adds operational telemetry tables (`agent_heartbeats`, `storage_mount_history`, `storage_health_logs`) with schema compatibility assertions. | **36 Tables + 2 Views** |
| **004** | [`004_audit_log_protection.sql`](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/db/migrations/004_audit_log_protection.sql) | Remediation AUD-14: Hardens `audit_logs` with cryptographic SHA-256 hash chaining, database triggers blocking `UPDATE` and `DELETE`, and `nkb_app` privilege restrictions. | **36 Tables + 2 Views (Hardened)** |

---

## 3. How to Run Migrations

### A. Check Migration Status
Inspect which migrations have been applied and which are pending:

```bash
cd server
node -r dotenv/config db/migrate.js status
```

**Expected Output:**
```
--- NKB Cloud Database Migration Status ---
[APPLIED] 001_initial_schema.sql
[APPLIED] 002_v2.1.0_identity_security_dlp.sql
[APPLIED] 003_add_missing_stage1_tables.sql
[APPLIED] 004_audit_log_protection.sql
```

### B. Execute Pending Migrations (`UP`)
Apply all pending migrations in sequential numerical order:

```bash
cd server
node -r dotenv/config db/migrate.js up
```

### C. Safety-Locked Rollback
Rollback requires the explicit safety flag:

```bash
cd server
node -r dotenv/config db/migrate.js rollback --confirm-destructive-rollback
```

*Note: Calling rollback without `--confirm-destructive-rollback` terminates immediately with a safety halt notice.*

---

## 4. Production Hostinger VPS Deployment Runbook

When deploying Stage 1 to the Hostinger VPS (AlmaLinux 10 with PostgreSQL 16):

1. **Configure Environment**:
   Ensure `/var/www/nkb-cloud/server/.env` contains valid production credentials and a secure 256-bit JWT key:
   ```ini
   PORT=5000
   NODE_ENV=production
   JWT_SECRET=GENERATED_64_CHAR_HEX_KEY
   DATABASE_URL=postgres://nkb_admin:SECURE_ADMIN_PASSWORD@127.0.0.1:5432/nkb_cloud
   ```

2. **Execute Clean Provisioning**:
   ```bash
   cd /var/www/nkb-cloud/server
   node db/migrate.js up
   ```

3. **Ingest Seed Baseline**:
   ```bash
   psql -U nkb_admin -d nkb_cloud -f db/seed.sql
   ```

4. **Verify Table Count**:
   ```sql
   SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
   -- Returns: 37 (36 application tables + 1 schema_migrations table)
   ```
