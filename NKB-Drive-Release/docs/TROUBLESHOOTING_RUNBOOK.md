# NKB Drive — Troubleshooting & Incident Runbook
## Rapid Diagnosis & Remediation Procedures

This runbook covers root causes and resolutions for common operational scenarios.

---

## 1. Virtual Drive Letter Collision (N:\ Already In Use)

### Symptoms
`NKBDrive.exe` logs: `Mount path N: collision detected`.
Drive `N:` is occupied by a mapped network drive or USB flash drive.

### Resolution
1. Identify the conflicting device:
   ```cmd
   net use
   wmic logicaldisk get caption,description,providername
   ```
2. Free drive `N:` if it is an inactive network share:
   ```cmd
   net use N: /delete
   ```
3. NKB Drive automatically scans alternative drive letters in reverse alphabetical order (`M:`, `L:`, `K:`, etc.) if `N:` cannot be freed.

---

## 2. Error: NO_ACTIVE_STORAGE_VOLUME (HTTP 507)

### Symptoms
Uploads fail with error:
`NO_ACTIVE_STORAGE_VOLUME: No active storage volume with sufficient free space is available.`

### Root Cause
All configured storage volumes are `OFFLINE`, `RETIRED`, or out of free disk space.

### Resolution
1. Log in to Web Dashboard as Administrator.
2. Navigate to **Storage Management -> Configured Locations**.
3. Inspect volume statuses.
4. Click **Activate** on an offline volume, or add a newly connected external hard drive following the Manual Storage Administration Workflow.
5. Once a volume with sufficient free space is `ONLINE`, uploads resume automatically.

---

## 3. WinFsp Service Not Running / Driver Missing

### Symptoms
`NKBDrive.exe` alerts: `WinFsp virtual filesystem driver is not installed or service is stopped`.

### Resolution
1. Check WinFsp service status:
   ```powershell
   Get-Service -Name "WinFsp"
   ```
2. If stopped, start the service:
   ```powershell
   Start-Service -Name "WinFsp"
   ```
3. If uninstalled, run silent installer:
   ```cmd
   NKBDriveSetup.exe /S
   ```

---

## 4. Resetting Local Workstation Sync Cache

### Symptoms
Employee workstation experiences corrupted local metadata or desynchronized file state.

### Resolution
1. Exit NKB Drive from the system tray.
2. Delete the local SQLite cache and sync database:
   ```cmd
   rmdir /s /q "%LocalAppData%\Programs\NKB Drive\cache"
   del "%LocalAppData%\Programs\NKB Drive\metadata.db"
   ```
3. Re-launch `NKBDrive.exe`. The client hydrates directory tree fresh from the server journal.
