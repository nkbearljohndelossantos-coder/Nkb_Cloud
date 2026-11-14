# NKB CLOUD v2.1.0 — WINDOWS STORAGE AGENT INSTALLATION & RUNBOOK

**Target Audience:** Windows Systems Administrators, Active Directory Domain Admins, and Support Specialists  
**Supported Platforms:** Windows 10 (Build 19041+), Windows 11 Enterprise/Pro, Windows Server 2022  
**Component:** NKB Cloud Windows Storage Host Agent v2.1.0  
**Source Location:** [`storage-agent/`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/storage-agent/)  
**Deployment Script:** [`scripts/deploy-nkb-agent.ps1`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/scripts/deploy-nkb-agent.ps1)  

---

## 1. PRE-REQUISITES

- Corporate Windows PC or laptop running Windows 10/11.
- Network connectivity to `https://cloud.nkb.local` (Port 443) and `wss://cloud.nkb.local/ws/agent`.
- Local loopback port `51248` open for host communication (`127.0.0.1` only).
- Zero inbound network ports required.

---

## 2. ENTERPRISE FLEET DEPLOYMENT METHODS

### Method 1: Microsoft Intune (Win32 App)
1. Package `deploy-nkb-agent.ps1` and agent binaries using `IntuneWinAppUtil.exe`.
2. In Intune Admin Center, navigate to **Apps > Windows > Win32 App**.
3. Set install command:
   ```cmd
   powershell.exe -ExecutionPolicy Bypass -File "deploy-nkb-agent.ps1" -ServerUrl "https://cloud.nkb.local" -EnrollmentToken "NKB-ENROLL-FLEET-TOKEN" -Silent
   ```
4. Set detection rule: File exists at `C:\Program Files\NKB\StorageAgent\bin\agent.js`.
5. Assign to corporate device groups.

### Method 2: Active Directory Group Policy (GPO) Startup Script
1. Store `scripts/deploy-nkb-agent.ps1` on a network share (`\\corp.nkb.local\NETLOGON\NKB\`).
2. Create a GPO under `Computer Configuration > Policies > Windows Settings > Scripts > Startup`.
3. Add PowerShell script with parameters:
   ```
   -ServerUrl "https://cloud.nkb.local" -EnrollmentToken "NKB-ENROLL-FLEET-TOKEN" -Silent
   ```
4. The agent installs automatically as a Windows Service under `NT AUTHORITY\SYSTEM` context upon machine boot.

---

## 3. MANUAL / TECHNICIAN INSTALLATION (POWERSHELL)

1. Open PowerShell as **Administrator**.
2. Run the quick-deployment one-liner:
   ```powershell
   irm https://cloud.nkb.local/api/devices/installer-script | iex
   ```
3. The script:
   - Sets up workspace in `C:\Program Files\NKB Cloud\Storage Agent`.
   - Generates a local Ed25519 keypair (`device_private.pem` with NTFS ACLs).
   - Enrolls the machine with NKB Cloud.
   - Installs and starts the `NKBStorageAgent` Windows Service.

---

## 4. ADMINISTRATOR APPROVAL & MONITORING

1. Admin opens `/admin/devices` in the NKB Cloud web portal.
2. The workstation appears with a blue **Windows** badge and status **`PENDING APPROVAL`**.
3. Click **Approve**.
4. The Windows agent connects via WebSocket, completes the Ed25519 challenge-response handshake, and transitions to **`ONLINE`**.

---

## 5. SERVICE MANAGEMENT & TROUBLESHOOTING

- **Service Status:** `Get-Service NKBStorageAgent`
- **Restart Service:** `Restart-Service NKBStorageAgent`
- **Probe Loopback:** `curl.exe http://127.0.0.1:51248/status`
- **Agent Logs:** Inspect `C:\Program Files\NKB Cloud\Storage Agent\logs\agent.log`.
