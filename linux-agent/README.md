# NKB Cloud — Enterprise Linux Storage Agent

Native storage agent daemon for enterprise Linux distributions (Ubuntu, Debian, RHEL, Rocky Linux, AlmaLinux, SLES).

## Architecture & Features
- **systemd Daemon Service**: Runs as a hardened background service (`nkb-storage-agent.service`) with `ProtectSystem=full` and `NoNewPrivileges=true`.
- **Hardware-Isolated Ed25519 Cryptography**: Device private keys stored in `/etc/nkb-cloud/keys/device_private.pem` with strict `0600` POSIX ACLs.
- **Mutual Challenge-Response Authentication**: Zero-trust WebSocket handshake with single-use nonce replay prevention.
- **Native Block Device & Mount Detection**: Queries `lsblk` and `/proc/mounts` for physical disk serials, filesystem UUIDs, and mount points.
- **Embedded Loopback Detection**: Local HTTP server on `http://127.0.0.1:51248/status` allowing web browser client presence detection.

## Quick Installation
```bash
# Automated enrollment via NKB Cloud backend
curl -s "https://cloud.nkb.local/api/devices/installer-script?platform=linux" | sudo bash
```

## Management
```bash
# Service status
systemctl status nkb-storage-agent

# View service logs
journalctl -u nkb-storage-agent -f

# Probe status endpoint
curl http://127.0.0.1:51248/status
```
