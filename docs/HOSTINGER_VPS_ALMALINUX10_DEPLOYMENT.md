# NKB Cloud - Hostinger VPS (AlmaLinux 10) Deployment Guide

This guide details the complete deployment process for the **NKB Cloud Web Application and API Server** on a Hostinger VPS running **AlmaLinux 10**.

---

## Architecture Overview

```
                                      OUTBOUND TLS ONLY
┌─────────────────────────────────┐       (No Port Forwarding Required)
│  NKB Windows Storage Host       │ ─────────────────────────────────┐
│  - Storage Agent Daemon         │                                   │
│  - Ordinary USB/SATA HDDs/SSDs  │                                   ▼
└─────────────────────────────────┘                   ┌──────────────────────────────────┐
                                                      │  Hostinger VPS (AlmaLinux 10)    │
┌─────────────────────────────────┐                   │  - Nginx Reverse Proxy (HTTPS/WSS)│
│  Client Browsers                │ ─── HTTPS/WSS ───►│  - Node.js API & Relay Service   │
│  (Desktop, Laptop, Mobile)      │                   │  - PostgreSQL 16 Database        │
└─────────────────────────────────┘                   └──────────────────────────────────┘
```

---

## 1. System Preparation (AlmaLinux 10)

Connect to your Hostinger VPS via SSH as `root`:
```bash
ssh root@your-vps-ip
```

Update system packages:
```bash
dnf update -y
dnf install -y git curl wget tar epel-release firewalld
```

---

## 2. Install Node.js (v20+ LTS)

Install Node.js 20 LTS using the official NodeSource repository:
```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs
node -v
npm -v
```

---

## 3. Install & Configure PostgreSQL 16

Install PostgreSQL:
```bash
dnf install -y postgresql-server postgresql-contrib
postgresql-setup --initdb
systemctl enable postgresql
systemctl start postgresql
```

Set up the database and user:
```bash
sudo -u postgres psql
```

Inside the PostgreSQL console:
```sql
CREATE DATABASE nkb_cloud;
CREATE USER nkb_user WITH ENCRYPTED PASSWORD 'ReplaceWithStrongSecurePassword2026!';
GRANT ALL PRIVILEGES ON DATABASE nkb_cloud TO nkb_user;
\c nkb_cloud
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
\q
```

Update pg_hba.conf to allow local password authentication:
```bash
sed -i 's/ident/md5/g' /var/lib/pgsql/data/pg_hba.conf
systemctl restart postgresql
```

---

## 4. Deploy NKB Cloud Application

Create the application directory:
```bash
mkdir -p /var/www/nkb-cloud
cd /var/www/nkb-cloud
```

Upload or clone the repository to `/var/www/nkb-cloud`:
```bash
# Verify directory contents
ls -la
# You should see: server, client, storage-agent, docs
```

### Build Client:
```bash
cd /var/www/nkb-cloud/client
npm install
npm run build
```

### Configure Server Environment:
```bash
cd /var/www/nkb-cloud/server
npm install --production
cp .env.example .env
nano .env
```

Ensure `.env` contains:
```ini
PORT=5000
NODE_ENV=production
JWT_SECRET=super_secret_enterprise_key_nkb_2026
JWT_EXPIRES_IN=7d
DATABASE_URL=postgres://nkb_user:ReplaceWithStrongSecurePassword2026!@localhost:5432/nkb_cloud
```

Run database migrations:
```bash
psql -U nkb_user -d nkb_cloud -h localhost -f db/schema.sql
psql -U nkb_user -d nkb_cloud -h localhost -f db/seed.sql
```

---

## 5. Configure Systemd Service (PM2 or Systemd)

Create systemd unit file `/etc/systemd/system/nkb-cloud.service`:
```ini
[Unit]
Description=NKB Cloud Enterprise Storage Server
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/nkb-cloud/server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=nkb-cloud
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
systemctl daemon-reload
systemctl enable nkb-cloud
systemctl start nkb-cloud
systemctl status nkb-cloud
```

---

## 6. Configure Nginx with WebSocket Support

Install Nginx:
```bash
dnf install -y nginx
systemctl enable nginx
```

Create `/etc/nginx/conf.d/nkb-cloud.conf`:
```nginx
server {
    listen 80;
    server_name cloud.nkbmanufacturing.com; # Replace with your VPS domain or IP

    client_max_body_size 50G;

    # NKB Cloud Web App and Static Build
    location / {
        root /var/www/nkb-cloud/client/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # API Endpoints
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
    }

    # WebSocket Relay for Windows Storage Agent
    location /ws/ {
        proxy_pass http://127.0.0.1:5000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

Test and restart Nginx:
```bash
nginx -t
systemctl restart nginx
```

Configure firewall:
```bash
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload
```

---

## 7. Install SSL with Let's Encrypt Certbot

```bash
dnf install -y certbot python3-certbot-nginx
certbot --nginx -d cloud.nkbmanufacturing.com
```

Your NKB Cloud platform is now live and ready to pair with Windows Storage Agents!
