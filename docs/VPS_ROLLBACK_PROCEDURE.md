# NKB CLOUD v2.1.0 — VPS ROLLBACK PROCEDURE & DISASTER RECOVERY RUNBOOK

**Target Operating System:** AlmaLinux 10 (Hostinger VPS)  
**Orchestration:** Docker Compose (`docker-compose.production.yml`)  
**Scope:** Production Deployment Rollback, Emergency Restoration & State Recovery

---

## 1. ROLLBACK TRIGGER CONDITIONS

A full or partial rollback must be immediately triggered upon any of the following events during VPS deployment:

1. **Pre-flight Migration Failure:** Migration 001–007 script fails or encounters an unhandled SQL error.
2. **Container Crash Loop:** `nkb_prod_backend` or `nkb_prod_postgres` fails consecutive health probes.
3. **Database Integrity Violation:** Cryptographic hash chains or audit immutability triggers fail.
4. **WebSocket Storage Agent Block:** Storage agent fails mutual Ed25519 authentication or WSS handshake.
5. **Data Corruption or Drift:** Any loss or unverified mutation of persistent storage metadata.

---

## 2. EMERGENCY ROLLBACK PROCEDURE

### Phase 1: Activate Maintenance Gate Immediately
Prevent client requests or storage agent connections from modifying inconsistent state:
```bash
# Update .env.production on VPS
sed -i 's/STAGING_MAINTENANCE_GATE=false/STAGING_MAINTENANCE_GATE=true/g' /opt/nkb-cloud/.env.production

# Reload backend service
docker compose -f /opt/nkb-cloud/docker-compose.production.yml restart backend
```

### Phase 2: Terminate Contaminated Production Services
```bash
cd /opt/nkb-cloud
docker compose -f docker-compose.production.yml down
```

### Phase 3: Restore Authoritative Database Snapshot
Locate the verified pre-deployment backup artifact (e.g., `/opt/nkb-cloud/backups/nkb_pre_deployment_snapshot.dump`):
```bash
# Verify checksum of pre-deployment backup
sha256sum /opt/nkb-cloud/backups/nkb_pre_deployment_snapshot.dump

# Start only the database container
docker compose -f docker-compose.production.yml up -d db
docker compose -f docker-compose.production.yml exec db pg_isready -U nkb_prod_admin -d nkb_cloud_production

# Execute verified restore script
/opt/nkb-cloud/scripts/vps_restore.sh /opt/nkb-cloud/backups/nkb_pre_deployment_snapshot.dump
```

### Phase 4: Revert Application Container Images
If the defect is in a newly built image version, revert `docker-compose.production.yml` to the previous stable release tag:
```yaml
# In docker-compose.production.yml
image: nkb-cloud-backend:2.0.9 # Previous certified release
image: nkb-cloud-frontend:2.0.9
```

### Phase 5: Re-launch Application Stack
```bash
docker compose -f docker-compose.production.yml up -d
```

### Phase 6: Post-Rollback Integrity Verification
Run the validation script to ensure all services are healthy and stable:
```bash
/opt/nkb-cloud/scripts/vps_validate_deployment.sh https://localhost
```

---

## 3. POINT-IN-TIME RECOVERY (PITR) & LOG PRESERVATION

Before rolling back, always preserve runtime container logs for forensic analysis:
```bash
mkdir -p /opt/nkb-cloud/incident_logs/$(date +"%Y%m%d_%H%M%S")
docker logs nkb_prod_backend > /opt/nkb-cloud/incident_logs/$(date +"%Y%m%d_%H%M%S")/backend.log 2>&1
docker logs nkb_prod_postgres > /opt/nkb-cloud/incident_logs/$(date +"%Y%m%d_%H%M%S")/postgres.log 2>&1
docker logs nkb_prod_nginx > /opt/nkb-cloud/incident_logs/$(date +"%Y%m%d_%H%M%S")/nginx.log 2>&1
```

---

## 5. PERSISTENT DATA ISOLATION DURING APPLICATION ROLLBACK

A critical architectural guarantee of NKB Cloud v2.1.0 is the complete decoupling of the stateless application tier from persistent storage:

1. **Volume Preservation:**
   - Rolling back application container images (`backend`, `frontend`, `proxy`) via `docker compose stop`, `docker compose restart`, or `docker compose down` (without `-v`) **never deletes, resets, or touches persistent Docker volumes**.
   - Persistent named volumes (`nkb_prod_pgdata`, `nkb_prod_storage`, `nkb_prod_uploads`, `nkb_prod_logs`) remain intact on the VPS host filesystem.
2. **Database State Continuity:**
   - Rolling back the Node.js backend container or Nginx frontend container leaves all PostgreSQL records, `schema_migrations` tracking, and cryptographic audit logs 100% untouched.
   - Database rollback is only executed if explicitly initiated through `scripts/vps_restore.sh`, which strictly requires typing the database name to confirm.
3. **Physical File Decoupling:**
   - Physical company drives (e.g. `J:`, `D:`, `G:`) are hosted on local premises hardware and accessed exclusively via outbound WSS connections from the Windows Storage Agent. Application changes on the VPS cannot alter or delete physical volume storage.

---

## 6. ESCALATION & INCIDENT REPORTING

1. Document the exact error message, exit codes, and timestamps.
2. Note the Git commit ID and Docker image digests.
3. Notify the enterprise technical lead before releasing the maintenance gate.
