# NKB CLOUD v2.1.0 — PRODUCTION SECURITY HARDENING CHECKLIST

**Target Environment:** Hostinger VPS (AlmaLinux 10 / Docker Compose)  
**Security Standard:** Enterprise Defense-in-Depth, Zero-Trust Storage Agent, Immutable Audit Compliance

---

## 1. HOST OS HARDENING (ALMALINUX 10)

- [ ] **SSH Hardening:**
  - Password authentication disabled in `/etc/ssh/sshd_config` (`PasswordAuthentication no`).
  - Root login via password disabled (`PermitRootLogin prohibit-password` or dedicated non-root admin user with `sudo`).
  - Default SSH port changed from 22 to non-standard port if required by enterprise policy.
- [ ] **Firewalld Enforcement:**
  - Only ports 80 (HTTP), 443 (HTTPS), and SSH allowed.
  - PostgreSQL port 5432 strictly closed to the public network.
  - Backend API port 5000 strictly closed to the public network.
- [ ] **SELinux Active:**
  - SELinux status confirmed as `Enforcing` (`sestatus`).
  - Container volume directories labeled with `container_file_t`.
- [ ] **Automated OS Security Updates:**
  - `dnf-automatic` configured for security errata installation.

---

## 2. DOCKER & CONTAINER ISOLATION

- [ ] **Unprivileged Execution:**
  - Backend runs as unprivileged user `node` (UID 1000). Zero containers run application code as `root`.
- [ ] **Zero Secrets in Image Layers:**
  - `Dockerfile.frontend` and `Dockerfile.backend` verified free of hardcoded tokens, passwords, or keys.
  - `.dockerignore` excludes `.env*`, `.git`, `node_modules`, and backup archives.
- [ ] **Resource Throttling:**
  - Memory and CPU limits configured in `docker-compose.production.yml` to prevent denial-of-service.
- [ ] **Network Segmentation:**
  - Internal bridge network `nkb_internal_network` isolates database and backend communication from external host interfaces.
- [ ] **Immutable Production Tags:**
  - Specific version tags used (`node:20-alpine`, `nginx:1.27-alpine`, `postgres:16-alpine`); wildcard `:latest` prohibited.

---

## 3. APPLICATION & REST API HARDENING

- [ ] **JWT Session-Version Invalidation:**
  - Fail-closed token validation enforces `sessionVersion` claim against database `session_version`.
  - Password changes, admin role changes, and status changes atomically increment `session_version` and invalidate all prior tokens.
- [ ] **Rate Limiting Active:**
  - Nginx rate-limiting zones active on `/api/` (30 req/sec) and `/api/auth/login` (5 req/min).
- [ ] **HTTP Security Headers:**
  - HSTS (`max-age=63072000; includeSubDomains; preload`) enforced.
  - `X-Frame-Options: SAMEORIGIN` blocks clickjacking.
  - `X-Content-Type-Options: nosniff` prevents MIME sniffing.
  - Content Security Policy (CSP) restricts script and frame sources.
- [ ] **Parameterized SQL Only:**
  - 100% of queries use PostgreSQL parameterized placeholders (`$1`, `$2`). Zero string concatenation.
- [ ] **Private-by-Default Authorization:**
  - My Drive assets are strictly private to the owner.
  - Shared access requires explicit, unexpired, non-revoked `file_shares` records.
  - Quarantined assets (`is_quarantined = TRUE`) remain completely hidden from standard users.

---

## 4. WINDOWS STORAGE AGENT & ZERO-TRUST REVERSE WSS

- [ ] **Outbound-Only Connection Model:**
  - VPS never connects inbound to Windows client PCs. Storage Agent initiates outbound TLS connection to `/ws/agent`.
- [ ] **Mandatory Ed25519 Signatures:**
  - All command envelopes (`SCAN_DRIVES`, `INITIATE_UPLOAD`, `READ_CHUNK`, `DELETE_PAYLOAD`) signed with Ed25519.
  - Agents strictly verify server signature; mismatched or missing signatures trigger immediate rejection.
- [ ] **Nonce Replay Prevention:**
  - Every command envelope carries a unique UUID nonce registered in `agent_nonce_registry`. Replayed nonces are rejected with unique-constraint errors.
- [ ] **Windows Path & Alternate Data Stream (ADS) Hardening:**
  - File engine rejects UNC paths (`\\...`), ADS streams (`:...`), reserved DOS devices (`CON`, `AUX`, `COM1`), and directory traversal (`..`).

---

## 5. AUDIT IMMUTABILITY & CRYPTOGRAPHIC PROVENANCE

- [ ] **Trigger-Enforced Immutability:**
  - Database triggers `trg_prevent_audit_log_mutation`, `trg_prevent_file_activity_mutation`, and `trg_prevent_login_audit_mutation` block all SQL `UPDATE` and `DELETE` operations.
- [ ] **SHA-256 Hash Chains:**
  - Every audit event computes a SHA-256 link from the previous event's `record_hash`.
  - System settings pointers (`audit_chain_head`, `login_audit_chain_head`, `file_activity_chain_head`) verified unbroken.

---

## 6. BACKUP & DISASTER RECOVERY

- [ ] **Daily Automated Custom-Format Dumps:**
  - `cron` job active executing `scripts/vps_backup.sh`.
- [ ] **Dual-Layer Backup Strategy:**
  - Database dump archives schema and audit trail.
  - Storage metadata manifest archives physical file hashes.
- [ ] **Tested Restoration Procedure:**
  - `scripts/vps_restore.sh` tested and validated on disposable staging database before production launch.
