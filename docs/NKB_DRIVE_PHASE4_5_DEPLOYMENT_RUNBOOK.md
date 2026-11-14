# NKB Drive — Phase 4.5 Production Deployment Runbook & Standard Operating Procedures

> [!IMPORTANT]
> **NOTICE**: This runbook contains deployment preparation specifications and standard operating procedures only.
> **DO NOT EXECUTE PRODUCTION DEPLOYMENT UNTIL EXPLICITLY AUTHORIZED BY THE ENTERPRISE ARCHITECT.**

---

## 1. System Requirements & Prerequisites

### 1.1 Workstation Requirements
- **Operating System**: Windows 10 64-bit (Build 19041+) or Windows 11 64-bit (Build 22000+).
- **Framework**: .NET Framework 4.8+ (included natively in Windows 10/11).
- **Filesystem Driver**: WinFsp runtime v2.0+ installed (Service: `WinFsp.Launcher`).
- **Disk Space**: 500 MB free for binaries and local cache database.
- **Drive Letter**: Target drive letter `N:` free and unassigned.

### 1.2 Network Requirements
- Outbound HTTPS (Port 443) connectivity to `https://cloud.nkbmanufacturing.com`.
- WebSockets capability for real-time change notifications.

---

## 2. Administrator Installation Instructions (Centralized MDM / MECM / Intune)

For automated company-wide deployment without user interaction:

1. **Package Assignment**:
   Deploy `NKBDriveSetup.exe` via Microsoft Endpoint Configuration Manager (MECM) or Microsoft Intune.
2. **Install Command**:
   ```cmd
   NKBDriveSetup.exe /S
   ```
3. **Execution Context**:
   Run in **User Context** (per-user installation to `%LocalAppData%\Programs\NKB Drive`).
4. **Behavior**:
   - Zero dialogue boxes or prompts.
   - Creates Desktop and Start Menu shortcuts.
   - Registers Windows Startup (`HKCU Run`).
   - Requires zero local administrator rights.

---

## 3. Standard Employee Installation Instructions (Self-Service)

For employees installing via corporate self-service portal:

1. Download **`NKBDriveSetup.exe`** from the internal portal.
2. Double-click `NKBDriveSetup.exe` to launch the installation wizard.
3. Review the **System Compatibility** page (verifies Windows 64-bit and WinFsp runtime).
4. Click **Next**, choose optional Desktop shortcut, and click **Install**.
5. Once installation finishes (approx. 2 seconds), click **Finish** with "Launch NKB Drive now" checked.

---

## 4. NKB Cloud Authentication Instructions

1. On initial launch, the **NKB Drive Login** dialog appears.
2. Enter corporate credentials:
   - **Server URL**: `https://cloud.nkbmanufacturing.com`
   - **Email / Identifier**: `employee@nkbmanufacturing.com`
   - **Password**: Corporate account password
3. Click **Sign In & Mount Drive**.
4. Credentials are encrypted into the local DPAPI vault (`vault.dat`). The workstation registers automatically.

---

## 5. Administrator Device Approval Procedure

Every new workstation registration is placed into `PENDING` status. Workstations cannot sync files until approved by an IT administrator:

### 5.1 Approval via Web Management Console
1. Log in to NKB Cloud Web Console as Administrator.
2. Navigate to **Admin Panel** -> **Device Management** -> **NKB Drive Workstations**.
3. Review the pending device:
   - Check **Machine Name**, **User Account**, **Department**, and **Hardware Fingerprint**.
4. Click **Approve**. The status transitions to `APPROVED`.
5. The workstation client detects approval within seconds and mounts virtual drive `N:`.

### 5.2 Emergency Revocation
To immediately disconnect a lost, stolen, or decommissioned workstation:
1. In **Device Management**, locate the workstation.
2. Click **Revoke Device**.
3. The server sets `approval_status = 'REVOKED'`.
4. The client's next poll returns `HTTP 403 DEVICE_REVOKED`, instantly unmounting drive `N:` and terminating local file access.

---

## 6. Offline Usage Instructions for Employees

- **Online-Only Files**: Files with grey cloud indicators occupy 0 bytes locally. Double-clicking any file hydrates it on demand.
- **Pinning for Offline Travel**:
  - Right-click any file or folder on `N:\` -> Select **"Keep on this device (Pin Offline)"**.
  - Pinned files remain 100% accessible locally even when in airplane mode or disconnected from the corporate VPN.
- **Offline Edits**:
  - Any edits made while offline are saved to the local cache and queued in SQLite.
  - As soon as the laptop reconnects to the network, NKB Drive automatically synchronizes all pending edits to the cloud.

---

## 7. In-Place Upgrade Procedure

To deploy an updated version of NKB Drive:

1. Push the new `NKBDriveSetup.exe /S` via Intune / MECM.
2. The installer automatically:
   - Closes running `NKBDrive.exe` processes.
   - Replaces binaries in `%LocalAppData%\Programs\NKB Drive`.
   - **Strictly retains** `%LocalAppData%\NKB Drive\metadata.db`, offline pinned files, and DPAPI credentials.
   - Relaunches `NKBDrive.exe --startup`.
3. Zero re-authentication or file re-indexing is required.

---

## 8. Uninstallation & Data Recovery Procedure

### 8.1 Silent Removal
```cmd
"%LocalAppData%\Programs\NKB Drive\Uninstall.exe" --uninstall /S
```
- Stops processes, unmounts `N:`, removes shortcuts, and purges registry keys.
- **Retains** local metadata and cached files in `%LocalAppData%\NKB Drive` for safe re-installation.

### 8.2 Interactive Removal
1. Go to Windows **Settings** -> **Apps** -> **Installed Apps**.
2. Locate **NKB Drive** -> Click **Uninstall**.
3. Follow prompt: Select *"Yes"* to preserve local files and databases, or *"No"* to perform a complete wipe.

---

## 9. IT Administrator Monitoring & Health Checklist

| Item | Inspection Method | Expected Normal State | Action if Abnormal |
| :--- | :--- | :--- | :--- |
| **Backend API Health** | `GET /health` | `{"status": "ONLINE"}` | Restart PM2 service: `pm2 restart nkb-server` |
| **Storage Daemon** | TCP Port 5001 check | Daemon responsive | Restart storage agent: `node storage-agent/index.js` |
| **PostgreSQL Staging DB** | Port 5433 check | `nkb_pg16_staging` running | Restart container: `docker restart nkb_pg16_staging` |
| **Pending Devices** | Admin Device Table | Pending count reviewed daily | Approve or Reject unknown machines |
| **Workstation Sync State** | SQLite `sync_queue` | `FAILED` count = 0 | Check network connectivity; inspect retry backoff |
| **WinFsp Service** | `sc query WinFsp.Launcher` | `STATE: RUNNING` | Start service: `net start WinFsp.Launcher` |
| **Drive Letter Collision** | Check `cmd /c subst` | Empty; `N:` free | Remap conflicting network drive: `net use N: /delete` |

---

## 10. Execution Gate Sign-Off

This runbook has been verified against staging infrastructure. 

**Status:** **PROCEDURES VERIFIED — READY FOR PILOT (DO NOT EXECUTE PRODUCTION WITHOUT AUTHORIZATION)**
