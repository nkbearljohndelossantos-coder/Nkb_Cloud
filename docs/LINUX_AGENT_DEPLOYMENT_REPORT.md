# NKB CLOUD v2.1.0 — LINUX STORAGE AGENT DEPLOYMENT & SECURITY REPORT

**Document Version:** 2.1.0  
**Target Platform:** Linux (AlmaLinux 9/10, RHEL 9/10, Rocky Linux, Ubuntu 22.04/24.04, Debian 12)  
**Architecture:** systemd Service, POSIX Hardened Key Store, `lsblk` / `statfs` Storage Probing, Loopback IPC  
**Audit Date:** November 11, 2026  
**Status:** IMPLEMENTED & LOCAL STAGING VERIFIED  

---

## 1. ARCHITECTURAL OVERVIEW

The **NKB Cloud Linux Storage Agent** is an enterprise background daemon designed for deployment across corporate Linux servers, network-attached storage (NAS) devices, and developer Linux workstations (including AlmaLinux 10 and RHEL environments). It manages local block volumes, reports disk allocation and health to the NKB Cloud VPS, and synchronizes files over TLS-encrypted WebSocket connections.

---

## 2. SYSTEM INTEGRATION & SECURITY POSTURE

### 2.1 systemd Daemon Architecture
The agent is managed by the system service manager via `/etc/systemd/system/nkb-storage-agent.service`:
- **Security Sandboxing:**
  - `User=nkb-agent` / `Group=nkb-agent`: Runs without root privileges.
  - `NoNewPrivileges=true`: Disallows privilege escalation via setuid binaries.
  - `ProtectSystem=full`: Mounts `/usr`, `/boot`, and `/etc` as read-only.
  - `ProtectHome=read-only`: Restricts access to user home directories.
  - `PrivateTmp=true`: Mounts an isolated, private `/tmp` directory.
- **Service Supervision:**
  - `Restart=always` with `RestartSec=10` ensures automatic recovery in case of process termination.
  - Integrated with `journald` for tamper-resistant system logging.

### 2.2 POSIX File & Secret Protection
- **Configuration Directory:** `/etc/nkb-cloud/` (permissions `0700`, owner `nkb-agent:nkb-agent`).
- **Key Store:** `/etc/nkb-cloud/agent-keys.json` containing the 32-byte Ed25519 private key seed, stored with strict POSIX permissions `chmod 0600`.
- Standard non-root users and other processes cannot read the private key material.

---

## 3. STORAGE DISCOVERY & HARDWARE IDENTIFICATION

### 3.1 JSON Block Device Inspection (`lsblk`)
Storage discovery is implemented in [`linux-agent/src/disk-detector.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/linux-agent/src/disk-detector.js):
- Executes `lsblk -J -b -o NAME,KNAME,FSTYPE,SIZE,MOUNTPOINT,LABEL,UUID,MODEL,SERIAL,TYPE` to inspect block devices, partitions, and loopback filesystems without requiring elevated privileges.
- Extracts drive serials, model names, bus types (SCSI, NVMe, SATA), and filesystem types (ext4, xfs, btrfs, zfs).

### 3.2 Block & Free Space Allocation via POSIX `statfs`
- For each mounted filesystem, calls POSIX `statfs()` to calculate exact block allocations:
  - `totalBytes = stat.blocks * stat.bsize`
  - `freeBytes = stat.bavail * stat.bsize`
  - `usedBytes = (stat.blocks - stat.bfree) * stat.bsize`
- Calculates an immutable 32-byte composite identifier:
  ```
  CompositeID = SHA-256( HardwareSerial || "::" || VolumeUUID || "::" || PartitionOffset || "::" || DiskSizeBytes )
  ```

### 3.3 Loopback Health & Status Server
- Binds strictly to `127.0.0.1:51248`.
- Exposes JSON endpoints (`/status`, `/drives`, `/sync`) consumed by local web browsers and administrative command-line tools.

---

## 4. AUTOMATED ENTERPRISE DEPLOYMENT

### 4.1 Zero-Touch Bash Installer (`install.sh`)
Enterprise deployment is handled via [`linux-agent/scripts/install.sh`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/linux-agent/scripts/install.sh):
- Automated one-line installation:
  ```bash
  curl -sSL https://cloud.nkb.com/api/devices/installers/linux | bash -s -- --token="<ENROLLMENT_TOKEN>" --server="https://cloud.nkb.com"
  ```
- Deployment actions performed:
  1. Detects OS distribution (AlmaLinux, RHEL, CentOS, Debian, Ubuntu).
  2. Creates dedicated system user and group `nkb-agent`.
  3. Deploys agent source files to `/opt/nkb-cloud/linux-agent/`.
  4. Generates local Ed25519 keypair and registers hardware with NKB Cloud backend.
  5. Installs and enables `nkb-storage-agent.service` via `systemctl enable --now`.

### 4.2 Ansible & Puppet Enterprise Automation
For large fleet deployments, the installation script accepts environment variables (`NKB_SERVER`, `NKB_ENROLLMENT_TOKEN`), enabling zero-touch configuration management across hundreds of servers.

---

## 5. AUDIT & TESTING CLASSIFICATION

| Component | Status | Verification Evidence / Details |
| :--- | :--- | :--- |
| **Linux Agent Codebase & Modules** | **IMPLEMENTED** | [`linux-agent/`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/linux-agent/) (`index.js`, `src/agent-client.js`, `src/disk-detector.js`, `src/loopback-server.js`) |
| **systemd Service Definition & Installer** | **IMPLEMENTED** | [`systemd/nkb-storage-agent.service`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/linux-agent/systemd/nkb-storage-agent.service) and [`scripts/install.sh`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/linux-agent/scripts/install.sh) |
| **Linux Agent Database Registration & Approval** | **TESTED** | Verified in `test-linux-agent-lifecycle.mjs` against staging PostgreSQL on port 5433 |
| **Platform Classification (`LINUX`)** | **TESTED** | Verified; device stored with `os_version: "Linux (AlmaLinux 10)"` and classified as `LINUX` |
| **Mutual Ed25519 Handshake & Signature Validation** | **TESTED** | Verified; canonical handshake string verified using `cryptoEngine` |
| **Replay Protection on Linux Nonce** | **TESTED** | Verified; duplicate nonces rejected by unique database index `agent_nonce_registry` |
| **Linux Disk Detector Module Test** | **TESTED** | Verified; `scanDrives()` returned valid filesystem volumes adhering to NKB schema |
| **Kill-Switch Revocation (`REVOKED`)** | **TESTED** | Verified; device status transitioned to `REVOKED` and subsequent re-enrollment blocked |
| **Live AlmaLinux 10 Physical Production Execution** | **NOT YET VERIFIED** | Requires physical execution on production VPS post-deployment authorization |
