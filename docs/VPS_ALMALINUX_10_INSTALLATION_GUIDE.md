# NKB CLOUD v2.1.0 — HOSTINGER VPS INSTALLATION GUIDE FOR ALMALINUX 10

**Operating System:** AlmaLinux 10 (x86_64, Enterprise Linux / RHEL 10 derivative)  
**Deployment Model:** Containerized Multi-Tier via Docker Compose  
**Security Profile:** Non-root application containers, firewalld isolation, SELinux enforcement, TLS 1.3 reverse proxy

---

## 1. PREREQUISITES & SYSTEM PREPARATION

### 1.1 System Update
Connect to your Hostinger VPS via SSH as `root` (or a sudo-privileged user) and update the base system:
```bash
dnf update -y
dnf install -y curl wget git tar jq firewalld policycoreutils-python-utils
systemctl enable --now firewalld
```

### 1.2 Hostname & Timezone Configuration
```bash
hostnamectl set-hostname nkb-cloud-vps
timedatectl set-timezone Asia/Manila  # Or appropriate enterprise timezone
```

---

## 2. DOCKER CE & DOCKER COMPOSE INSTALLATION

AlmaLinux 10 uses the official Docker Community Edition repository for RHEL/CentOS.

```bash
# Remove any conflicting packages
dnf remove -y docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate docker-logrotate docker-engine podman buildah

# Add the official Docker CE repository
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# Install Docker CE, CLI, containerd, and Docker Compose plugin
dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable and start Docker daemon
systemctl enable --now docker

# Verify Docker installation
docker --version
docker compose version
```

---

## 3. FIREWALLD & SELINUX HARDENING (ALMALINUX 10)

### 3.1 Firewalld Configuration
Only allow SSH, HTTP, and HTTPS. Keep all database and backend ports closed to the public internet:
```bash
# Allow HTTP (80) and HTTPS (443)
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https

# Enable network masquerading for Docker bridge networking
firewall-cmd --permanent --add-masquerade

# Reload firewalld
firewall-cmd --reload
firewall-cmd --list-all
```

### 3.2 SELinux Contexts
AlmaLinux 10 enforces SELinux in `Enforcing` mode by default. Ensure container storage volumes have the correct `container_file_t` label:
```bash
mkdir -p /opt/nkb-cloud /opt/nkb-cloud/backups /opt/nkb-cloud/storage
semanage fcontext -a -t container_file_t "/opt/nkb-cloud(/.*)?"
restorecon -Rv /opt/nkb-cloud
```

---

## 4. APPLICATION DIRECTORY SETUP & REPOSITORY DEPLOYMENT

### 4.1 Clone Repository / Unpack Deployment Bundle
```bash
cd /opt
git clone -b test/local-offline-env https://github.com/nkb-enterprise/nkb-cloud.git /opt/nkb-cloud
cd /opt/nkb-cloud
```

### 4.2 Production Environment Configuration
```bash
# Create .env.production from template
cp .env.production.example .env.production

# Generate secure random secrets
JWT_KEY=$(openssl rand -hex 64)
DB_PASS=$(openssl rand -base64 32 | tr -d '/+=')

# Set the generated secrets into .env.production
sed -i "s/REPLACE_WITH_HEX_64_CHAR_CRYPTOGRAPHIC_SECRET_KEY/${JWT_KEY}/g" .env.production
sed -i "s/REPLACE_WITH_HIGH_ENTROPY_RANDOM_PASSWORD_32_CHARS_MIN/${DB_PASS}/g" .env.production

# Set strict permissions (readable only by root)
chmod 600 .env.production
```

---

## 5. SSL/TLS CERTIFICATE ISSUANCE (LET'S ENCRYPT)

```bash
dnf install -y certbot

# Request production certificate using standalone mode (port 80 must be momentarily free)
certbot certonly --standalone \
    -d cloud.nkb.local \
    --agree-tos \
    --email admin@nkb.local \
    --preferred-challenges http

# Set directory link for Nginx mounting
mkdir -p /etc/nginx/ssl/live
ln -sf /etc/letsencrypt/live/cloud.nkb.local/fullchain.pem /etc/nginx/ssl/live/fullchain.pem
ln -sf /etc/letsencrypt/live/cloud.nkb.local/privkey.pem /etc/nginx/ssl/live/privkey.pem
```

---

## 6. CONTAINER ORCHESTRATION LAUNCH

```bash
cd /opt/nkb-cloud

# 1. Build and launch database first
docker compose -f docker-compose.production.yml up -d db

# 2. Await database readiness
docker compose -f docker-compose.production.yml exec db pg_isready -U nkb_prod_admin -d nkb_cloud_production

# 3. Apply schema migrations 001 through 007
chmod +x scripts/vps_init_postgres.sh
./scripts/vps_init_postgres.sh nkb_prod_postgres

# 4. Build and start full stack
docker compose -f docker-compose.production.yml up -d --build

# 5. Run automated validation
chmod +x scripts/vps_validate_deployment.sh
./scripts/vps_validate_deployment.sh https://localhost
```

---

## 7. SYSTEMD SERVICE CONFIGURATION (AUTO-START ON REBOOT)

Create a systemd unit file `/etc/systemd/system/nkb-cloud.service`:
```ini
[Unit]
Description=NKB Cloud Enterprise Application Stack (Docker Compose)
Requires=docker.service
After=docker.service network.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/nkb-cloud
ExecStart=/usr/bin/docker compose -f docker-compose.production.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.production.yml down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
```

Enable the service:
```bash
systemctl daemon-reload
systemctl enable nkb-cloud.service
```

---

## 8. AUTOMATED DAILY BACKUP CRON JOB

Add automated backups to `/etc/cron.d/nkb-backup`:
```cron
# Run daily database and manifest backup at 02:00 AM UTC
0 2 * * * root /opt/nkb-cloud/scripts/vps_backup.sh >> /var/log/nkb_backup.log 2>&1
```
