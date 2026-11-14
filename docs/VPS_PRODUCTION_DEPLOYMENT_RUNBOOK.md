# NKB CLOUD v2.1.0 — VPS PRODUCTION DEPLOYMENT RUNBOOK

**Document Version:** 2.1.0-OPS-RUNBOOK  
**Target Operating System:** AlmaLinux 10 Enterprise (Hostinger Cloud VPS)  
**Container Stack:** Docker Engine 27.x / Docker Compose v2.29+  
**Audit Purpose:** Comprehensive System Administrator Deployment, Hardening, and Recovery Guide  
**Date:** November 11, 2026  
**Status:** VALIDATED FOR EXECUTION UPON AUTHORIZATION  

---

## 1. PRE-DEPLOYMENT PREREQUISITES & ACCESS GATING

> [!IMPORTANT]
> **Strict Authorization Gate:** Do not execute this runbook until explicit administrative authorization is granted. This document specifies the exact, step-by-step procedure to follow once authorized.

### Minimum System Specifications
- **VPS Host:** Hostinger AlmaLinux 10 (x86_64).
- **CPU / RAM:** Minimum 2 vCPU cores, 4 GB RAM (8 GB recommended).
- **Storage:** Minimum 50 GB NVMe SSD storage.
- **Network Ingress:** Static Public IPv4, Ports 80 and 443 open in Hostinger Cloud Firewall.

---

## 2. HOST SYSTEM PREPARATION & SECURITY HARDENING

### Step 2.1: System Updates & Core Utilities
Log in via secure SSH and update system packages:
```bash
dnf update -y
dnf install -y curl wget tar gzip git util-linux policycoreutils-python-utils firewalld
```

### Step 2.2: Docker Engine & Compose Installation
Install official Docker CE repositories for AlmaLinux / RHEL:
```bash
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable and start Docker daemon
systemctl enable --now docker
```

### Step 2.3: Host Firewall Configuration (`firewalld`)
Strictly limit inbound traffic to SSH, HTTP, and HTTPS:
```bash
systemctl enable --now firewalld
firewall-cmd --permanent --zone=public --add-service=ssh
firewall-cmd --permanent --zone=public --add-service=http
firewall-cmd --permanent --zone=public --add-service=https

# Remove any accidental exposure of backend or database ports
firewall-cmd --permanent --zone=public --remove-port=5000/tcp
firewall-cmd --permanent --zone=public --remove-port=5432/tcp

firewall-cmd --reload
```

### Step 2.4: SELinux Configuration for Docker Volumes
Ensure containerized services can manage persistent volume storage under AlmaLinux 10 SELinux:
```bash
# Allow container process management
setsebool -P container_manage_cgroup 1

# Ensure application storage paths receive proper container labels
mkdir -p /opt/nkb-cloud/{storage,uploads,logs,backups}
chcon -Rt container_file_t /opt/nkb-cloud/
```

---

## 3. APPLICATION CODEBASE DEPLOYMENT & SECRET GENERATION

### Step 3.1: Directory Layout
```bash
mkdir -p /opt/nkb-cloud
cd /opt/nkb-cloud
```

### Step 3.2: Transfer Production Artifacts
Transfer the following files from the certified release repository to `/opt/nkb-cloud/`:
- `docker-compose.production.yml`
- `Dockerfile.backend`
- `Dockerfile.frontend`
- `nginx.conf`
- `server/` (Complete backend source)
- `client/` (Frontend source)
- `scripts/` (Operational automation scripts)

### Step 3.3: High-Entropy Production Secret Generation
Generate `.env.production` directly on the VPS. **Never copy development secrets:**
```bash
cat <<EOF > /opt/nkb-cloud/.env.production
NODE_ENV=production
PORT=5000
HOST=0.0.0.0

# Database Configuration (Internal Docker Network)
POSTGRES_DB=nkb_cloud_production
POSTGRES_USER=nkb_prod_admin
POSTGRES_PASSWORD=$(openssl rand -hex 32)

# Cryptographic Token Signing Secret
JWT_SECRET=$(openssl rand -hex 64)
JWT_EXPIRES_IN=7d

# Maintenance Gate (Set to false for active production)
STAGING_MAINTENANCE_GATE=false

# Storage Root Paths
STORAGE_ROOT=/app/storage
UPLOAD_TEMP_DIR=/app/uploads
DOWNLOAD_TEMP_DIR=/app/downloads
LOGS_DIR=/app/logs
EOF

# Lock down file permissions
chmod 0600 /opt/nkb-cloud/.env.production
```

---

## 4. DATABASE INITIALIZATION & MIGRATIONS

Run [`scripts/vps_init_postgres.sh`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/scripts/vps_init_postgres.sh) to initialize the PostgreSQL 16 cluster:
```bash
chmod +x /opt/nkb-cloud/scripts/*.sh
/opt/nkb-cloud/scripts/vps_init_postgres.sh
```

This script:
1. Verifies PostgreSQL 16 container health.
2. Applies Migrations `001` through `007` in strict deterministic order.
3. Confirms that **Migration 008 DOES NOT EXIST and is not created**.
4. Initializes trigger-enforced SHA-256 forward-linked audit chains with baseline genesis.

---

## 5. CONTAINER STACK STARTUP & VALIDATION

### Step 5.1: Build and Launch Containers
```bash
cd /opt/nkb-cloud
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
```

### Step 5.2: Verification of Container Status
```bash
docker compose -f docker-compose.production.yml ps
```
Confirm all 4 containers are in `healthy` status:
- `nkb_prod_postgres` (healthy)
- `nkb_prod_backend` (healthy)
- `nkb_prod_frontend` (healthy)
- `nkb_prod_nginx` (healthy)

### Step 5.3: Execute Deployment Validation Script
Run [`scripts/vps_validate_deployment.sh`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/scripts/vps_validate_deployment.sh):
```bash
/opt/nkb-cloud/scripts/vps_validate_deployment.sh
```
This automated suite verifies:
- TLS 1.3 / 1.2 negotiation on port 443.
- HTTP to HTTPS redirection on port 80.
- WebSocket upgrade on `/ws/agent`.
- API authentication rate limiting.
- Zero host port exposure for 5432 and 5000.
- Database persistence across container restarts.

---

## 6. AUTOMATED BACKUPS & DISASTER RECOVERY DRILLS

### Step 6.1: Automated Daily Backup Schedule (`cron`)
Configure an automated daily backup job in root crontab:
```bash
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/nkb-cloud/scripts/vps_backup.sh >> /var/log/nkb-backup.log 2>&1") | crontab -
```
The [`scripts/vps_backup.sh`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/scripts/vps_backup.sh) script:
- Generates a PostgreSQL custom dump (`pg_dump -Fc`).
- Creates a tar gzip archive of physical `/app/storage`.
- Computes SHA-256 manifests for all backup artifacts.
- Enforces a 30-day rolling retention policy.

### Step 6.2: Tested Restoration Drill
In the event of database corruption or hardware failure, run [`scripts/vps_restore.sh`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/scripts/vps_restore.sh):
```bash
/opt/nkb-cloud/scripts/vps_restore.sh /opt/nkb-cloud/backups/nkb_backup_20261111.dump
```
The restoration procedure:
1. Temporarily places the backend in maintenance mode (`STAGING_MAINTENANCE_GATE=true`).
2. Drops and restores the database cluster using `pg_restore --clean --if-exists`.
3. Verifies SHA-256 audit chain continuity from Genesis to HEAD.
4. Resumes production traffic.

---

## 7. ROLLBACK PROCEDURE

If unexpected anomalies occur post-deployment, follow the verified rollback procedure:
```bash
cd /opt/nkb-cloud
# 1. Stop all production containers
docker compose -f docker-compose.production.yml down

# 2. Restore prior database backup snapshot
/opt/nkb-cloud/scripts/vps_restore.sh /opt/nkb-cloud/backups/pre_deployment_snapshot.dump

# 3. Roll back image tags to previous stable version
docker compose -f docker-compose.production.yml up -d
```
All details are fully documented in [`docs/VPS_ROLLBACK_PROCEDURE.md`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/docs/VPS_ROLLBACK_PROCEDURE.md).
