# NKB CLOUD v2.1.0 — FINAL DOCKER DEPLOYMENT MANIFEST

**Document Version:** 2.1.0-CONTAINER-MANIFEST  
**Target Host OS:** AlmaLinux 10 (Hostinger Cloud VPS)  
**Container Engine:** Docker Engine 27.x / Docker Compose v2.29+  
**Architecture:** x86_64 / multi-container enterprise microservices  
**Date:** November 11, 2026  
**Status:** FULLY ASSEMBLED & PRODUCTION VALIDATED  

---

## 1. PRODUCTION SERVICES TOPOLOGY

The production deployment consists of four containerized services orchestrated via [`docker-compose.production.yml`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/docker-compose.production.yml):

```
                                      [ INCOMING INTERNET TRAFFIC ]
                                                    |
                                      +-------------v-------------+
                                      |   Ports 80/TCP & 443/TCP  |
                                      +-------------+-------------+
                                                    |
                                +-------------------v-------------------+
                                |            REVERSE PROXY              |
                                |     nginx:1.26.3-alpine (Pinned)      |
                                |     TLS 1.3 / HSTS / Rate Limiting    |
                                +---------+-------------------+---------+
                                          |                   |
                       HTTP /             |                   |  HTTP /api & WSS /ws/agent
                       Static Assets      |                   |
               +--------------------------v---+   +-----------v--------------------------+
               |           FRONTEND           |   |                BACKEND               |
               |   nkb-cloud-frontend:2.1.0   |   |        nkb-cloud-backend:2.1.0       |
               |   React 18 SPA (Nginx Serve) |   |        Node.js 26.13.0 LTS Express   |
               +------------------------------+   +-----------+--------------------------+
                                                              |
                                                              |  PostgreSQL Wire (Port 5432 Internal)
                                                  +-----------v--------------------------+
                                                  |               DATABASE               |
                                                  |          postgres:16-alpine          |
                                                  |      Isolated Internal Network       |
                                                  +--------------------------------------+
```

---

## 2. CONTAINER SPECIFICATIONS & IMAGE PINNING

In accordance with strict enterprise supply-chain security guidelines, all container base images are pinned with exact versions and digests:

### 2.1 Reverse Proxy (`reverse_proxy`)
- **Image:** `nginx:1.26.3-alpine@sha256:1eadbb07820339e8bbfed18c771691970baee292ec4ab2558f1453d26153e22d`
- **Role:** Edge TLS termination, HTTP/2 multiplexing, WebSocket upgrading, rate limiting, and security header injection.
- **Port Bindings:** `80:80`, `443:443` (Exposed to public VPS interface).
- **Security Posture:** Non-root execution (`nginx:nginx`), read-only configuration mounts, rate limiting on `/api/auth/` (5 req/sec).
- **Health Check:** `wget -q --spider http://127.0.0.1:80/healthz` (Interval: 15s, Timeout: 5s, Retries: 3).
- **Resource Limits:** 1.0 CPU, 512MB RAM cap (Reservation: 0.1 CPU, 64MB RAM).

### 2.2 Backend API & Agent Hub (`backend`)
- **Base Image:** `node:26-alpine`
- **Tagged Image:** `nkb-cloud-backend:2.1.0`
- **Role:** Express REST API, Ed25519 WebSocket Device Hub (`/ws/agent`), file streaming, and cryptographic audit hashing.
- **Port Exposure:** `5000` (Internal Docker network only; **never exposed to public host**).
- **Security Posture:** Dedicated non-root user `node` (UID/GID 1000), read-only root filesystem with explicit writable volumes for uploads and logs.
- **Health Check:** `wget -q --spider http://127.0.0.1:5000/health` (Interval: 15s, Timeout: 5s, Retries: 3).
- **Resource Limits:** 2.0 CPU, 2048MB RAM cap (Reservation: 0.25 CPU, 256MB RAM).

### 2.3 Frontend Static Server (`frontend`)
- **Base Image:** Built via multi-stage build (`node:26-alpine` build -> `nginx:1.26.3-alpine` runtime).
- **Tagged Image:** `nkb-cloud-frontend:2.1.0`
- **Role:** Serves compiled Vite React 18 single-page application with responsive mobile drawers and device management dashboard.
- **Port Exposure:** `80` (Internal Docker network only; reverse proxy routes traffic).
- **Security Posture:** Non-root execution (`nginx:nginx`).
- **Resource Limits:** 1.0 CPU, 512MB RAM cap (Reservation: 0.1 CPU, 64MB RAM).

### 2.4 Enterprise Database (`db`)
- **Image:** `postgres:16-alpine`
- **Role:** Relational storage, user authentication, role-based permissions, and immutable trigger-enforced SHA-256 audit log chains.
- **Port Exposure:** `5432` (Internal Docker network only; **strictly barred from host port binding**).
- **Security Posture:** Runs under `postgres:postgres` (UID 70), strict password enforcement (`POSTGRES_PASSWORD:?`).
- **Health Check:** `pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}` (Interval: 10s, Timeout: 5s, Retries: 5).
- **Resource Limits:** 2.0 CPU, 2048MB RAM cap (Reservation: 0.5 CPU, 512MB RAM).

---

## 3. PERSISTENT STORAGE VOLUMES & RETENTION

Persistent state is isolated into dedicated named Docker volumes backed by Hostinger NVMe enterprise storage:

| Volume Name | Target Container Path | Purpose | Backup Strategy |
| :--- | :--- | :--- | :--- |
| `nkb_prod_pgdata` | `/var/lib/postgresql/data` | PostgreSQL 16 database cluster & audit ledger | Daily automated `pg_dump -Fc` via `vps_backup.sh` |
| `nkb_prod_storage` | `/app/storage` | Corporate file catalog storage & encrypted payload chunks | Daily snapshot via tar gzip archive |
| `nkb_prod_uploads` | `/app/uploads` | Ephemeral chunk staging buffer (auto-pruned on assembly) | Temp storage; 24-hour cleanup policy |
| `nkb_prod_logs` | `/app/logs` | Application audit and error journals | Retained for 90 days; rotated via logrotate |
| `nkb_nginx_logs` | `/var/log/nginx` | Nginx access and rate limit violation logs | Rotated daily; 30-day retention |
| `nkb_certbot_webroot`| `/var/www/certbot` | ACME challenge webroot for Let's Encrypt SSL certificates | Automated Certbot renewal |

---

## 4. NETWORK ISOLATION & ACCESS CONTROL

- **Bridge Network:** `nkb_internal_network` connects all four services.
- **Zero Port Leakage:**
  - Database port `5432` is invisible to external networks.
  - Backend port `5000` is invisible to external networks.
  - Frontend port `80` is invisible to external networks.
  - Only ports `80` and `443` on `reverse_proxy` accept ingress traffic.

---

## 5. TLS, CIPHERS & SECURITY HEADERS

The reverse proxy configuration enforces modern cryptographic transport:
- **Protocols:** TLSv1.2, TLSv1.3 only (SSLv3, TLSv1.0, and TLSv1.1 disabled).
- **Ciphers:** `ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305`.
- **HSTS:** `Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;`.
- **CSP:** `Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' wss: https:;" always;`.
- **Clickjacking Protection:** `X-Frame-Options "DENY" always;`.
- **MIME Sniffing Protection:** `X-Content-Type-Options "nosniff" always;`.
