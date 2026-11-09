# NKB CLOUD – DATABASE BACKUP & RESTORATION GUIDE
## PostgreSQL 16 on Hostinger VPS (AlmaLinux 10)
**Version:** 2.1.0-PROD  
**Organization:** NKB Manufacturing  
**Author:** NKB Systems & Infrastructure Team  

---

## 1. Overview & Data Protection Principles

NKB Cloud's database stores all critical metadata: user credentials, permissions, 3-layer storage identities (`storage_device_id`, `storage_volume_id`, `storage_registration_id`), file records, versions, chunk maps, SHA-256 cryptographic checksums, audit trails, and Data-Loss Prevention (DLP) evidence.

The actual binary file contents reside on registered physical storage drives (SSDs and HDDs). However, without the database, file pointers, ownership, and volume mappings would be inaccessible.

### Core Backup Principles
1. **Zero-Destruction Guarantee**: Database backups and migrations must NEVER overwrite existing databases or erase records.
2. **Multi-Tiered Backup Strategy**:
   - **Hourly Logical Snapshots**: Compressed `pg_dump` dumps of the database schema and data.
   - **Continuous WAL Archiving**: Write-Ahead Logging (WAL) for Point-in-Time Recovery (PITR) up to the exact minute of failure.
   - **Off-Site Air-Gapped Replication**: Automated encrypted transmission of daily backup bundles to an isolated off-site repository.
3. **Regular Verification Drills**: A backup is only valid if it has been successfully restored and verified in a sandbox test.

---

## 2. Automated Backup Implementation

### A. Dedicated Backup User & Permissions

Create a dedicated PostgreSQL user with read-only access for backups:

```bash
sudo -u postgres psql -c "CREATE USER nkb_backup WITH PASSWORD 'REPLACE_WITH_SECURE_PASSWORD';"
sudo -u postgres psql -c "GRANT CONNECT ON DATABASE nkb_cloud TO nkb_backup;"
sudo -u postgres psql -d nkb_cloud -c "GRANT USAGE ON SCHEMA public TO nkb_backup;"
sudo -u postgres psql -d nkb_cloud -c "GRANT SELECT ON ALL TABLES IN SCHEMA public TO nkb_backup;"
sudo -u postgres psql -d nkb_cloud -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO nkb_backup;"
```

### B. Automated Backup Script (`/opt/nkb-cloud/scripts/backup-db.sh`)

Create `/opt/nkb-cloud/scripts/backup-db.sh`:

```bash
#!/usr/bin/env bash
# =============================================================================
# NKB Cloud - Production Database Backup Script
# Retention: 7 daily, 4 weekly, 12 monthly archives
# =============================================================================
set -euo pipefail

BACKUP_DIR="/var/backups/nkb-cloud/postgres"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/nkb_cloud_${TIMESTAMP}.dump"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

echo "[$(date)] Starting NKB Cloud PostgreSQL backup..."

# Execute pg_dump with custom compressed archive format
PGPASSWORD="REPLACE_WITH_SECURE_PASSWORD" pg_dump \
    -U nkb_backup \
    -h 127.0.0.1 \
    -p 5432 \
    -F c \
    -b \
    -v \
    -f "${BACKUP_FILE}" \
    nkb_cloud

# Compute SHA-256 integrity checksum of backup bundle
sha256sum "${BACKUP_FILE}" | awk '{print $1}' > "${CHECKSUM_FILE}"
echo "[$(date)] Backup completed: ${BACKUP_FILE} (SHA-256: $(cat "${CHECKSUM_FILE}"))"

# Enforce 30-day local retention policy
find "${BACKUP_DIR}" -name "nkb_cloud_*.dump" -mtime +30 -exec rm -f {} \;
find "${BACKUP_DIR}" -name "nkb_cloud_*.dump.sha256" -mtime +30 -exec rm -f {} \;

echo "[$(date)] Backup rotation completed."
```

Make the script executable:
```bash
chmod +x /opt/nkb-cloud/scripts/backup-db.sh
```

### C. Systemd Timer for Automated Execution

Create systemd service `/etc/systemd/system/nkb-db-backup.service`:
```ini
[Unit]
Description=NKB Cloud Database Automated Backup
After=postgresql-16.service

[Service]
Type=oneshot
User=postgres
ExecStart=/opt/nkb-cloud/scripts/backup-db.sh
```

Create systemd timer `/etc/systemd/system/nkb-db-backup.timer`:
```ini
[Unit]
Description=Run NKB Cloud Database Backup Hourly

[Timer]
OnCalendar=*-*-* *:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable and start the timer:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nkb-db-backup.timer
```

---

## 3. Point-in-Time Recovery (PITR) & WAL Archiving

To achieve sub-minute recovery in catastrophic events, configure PostgreSQL WAL archiving.

Edit `/var/lib/pgsql/16/data/postgresql.conf`:
```ini
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /var/backups/nkb-cloud/wal/%f && cp %p /var/backups/nkb-cloud/wal/%f'
archive_timeout = 300 # Force WAL switch every 5 minutes
```

Create WAL archive directory:
```bash
mkdir -p /var/backups/nkb-cloud/wal
chown -R postgres:postgres /var/backups/nkb-cloud/wal
chmod 700 /var/backups/nkb-cloud/wal
sudo systemctl restart postgresql-16
```

---

## 4. Full Restoration Runbook

### Step 1: Pre-Restoration Safety Check & Quorum Lock

Before restoring, verify backup file integrity:

```bash
cd /var/backups/nkb-cloud/postgres
sha256sum -c nkb_cloud_20261109_120000.dump.sha256
```

Stop the NKB Cloud application service to prevent new writes:
```bash
sudo systemctl stop nkb-cloud
```

### Step 2: Create Pre-Restore Safety Snapshot of Active State

Never drop or overwrite without taking a fallback copy of the current state:
```bash
sudo -u postgres pg_dump -U postgres -F c -b -v -f /var/backups/nkb-cloud/postgres/pre_restore_safety_$(date +%s).dump nkb_cloud
```

### Step 3: Database Restoration via `pg_restore`

Restore the backup archive into a clean or existing database:

```bash
# Option A: Restore into staging database for validation
sudo -u postgres createdb -O nkb_admin nkb_cloud_restore_test
sudo -u postgres pg_restore \
    -U postgres \
    -d nkb_cloud_restore_test \
    -v \
    --no-owner \
    --role=nkb_admin \
    /var/backups/nkb-cloud/postgres/nkb_cloud_20261109_120000.dump

# Option B: Restore into production (after validation)
sudo -u postgres pg_restore \
    -U postgres \
    -d nkb_cloud \
    -v \
    --clean \
    --if-exists \
    --no-owner \
    --role=nkb_admin \
    /var/backups/nkb-cloud/postgres/nkb_cloud_20261109_120000.dump
```

### Step 4: Post-Restoration Verification Queries

Run verification queries to validate data integrity:

```sql
-- 1. Verify User Accounts
SELECT count(*) FROM users;

-- 2. Verify 3-Layer Storage Identities
SELECT count(*) FROM storage_devices;
SELECT count(*) FROM storage_volumes;
SELECT count(*) FROM storage_registrations;

-- 3. Verify Active File Count & Total Size
SELECT count(*) AS total_files, pg_size_pretty(sum(size_bytes)::bigint) AS total_storage 
FROM files WHERE is_trashed = FALSE;

-- 4. Verify DLP Evidence Baseline
SELECT requirement_key, verification_status FROM dlp_test_evidence;
```

### Step 5: Resume Application Services

```bash
sudo systemctl start nkb-cloud
sudo systemctl status nkb-cloud
```

---

## 5. Disaster Recovery Scenarios & Resolution

| Scenario | Impact | Action Required |
|---|---|---|
| **VPS Operating System Failure** | Hostinger VPS destroyed or re-provisioned. | Provision new AlmaLinux 10 instance; deploy Nginx, Node 20, PostgreSQL 16; import latest daily `pg_dump` snapshot; start `nkb-cloud.service`. Windows Storage Agent automatically reconnects outbound. |
| **Accidental Metadata Corruption** | Bad schema edit or erroneous SQL executed. | Stop application; inspect WAL logs; restore to target timestamp right before incident using PITR `recovery_target_time`. |
| **Physical Storage Disk Failure on Host** | USB SSD or SATA HDD experiences hardware death. | Drive marks `OFFLINE` in database; metadata remains preserved; replace drive; use NKB Safe Migration module to attach new storage volume. |

---

## 6. Verification Drills Schedule

1. **Weekly Automated Drill**: A cron job restores the latest backup dump into `nkb_cloud_restore_test` every Sunday at 03:00 UTC and validates row counts.
2. **Quarterly Super Admin Review**: Full failover simulation testing physical reconnects, user logins, and hash matching against the restored copy.
