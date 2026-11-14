# NKB Drive — Phase 4.5 Production Rollback & Emergency Contingency Plan

> [!CAUTION]
> **PURPOSE**: This document provides the emergency rollback and contingency procedures for **NKB Drive**.
> If an unforeseen architectural defect, sync failure, or kernel instability occurs during deployment, follow the steps below to restore the environment to a verified stable state.

---

## 1. Rollback Trigger Criteria

An immediate rollback must be initiated if any of the following conditions are met during deployment:

1. **Kernel Driver Instability**: Unhandled WinFsp driver crashes or blue screens (BSOD) on corporate workstations.
2. **Cloud Data Corruption**: Any discrepancy between server-side SHA-256 catalog hashes and storage agent payloads.
3. **Database Performance Degradation**: PostgreSQL connection exhaustion or locking caused by change journal queries exceeding 500 ms.
4. **Security Vulnerability**: Unintended bypass of department permissions or authentication gates.
5. **Widespread Drive Collision**: Inability of workstations to mount drive `N:` due to corporate image volume conflicts.

---

## 2. Emergency Rollback Strategy & Architecture

```
                       +---------------------------------------+
                       |       EMERGENCY ROLLBACK DECISION     |
                       +-------------------+-------------------+
                                           |
                 ┌─────────────────────────┴─────────────────────────┐
                 v                                                   v
+---------------------------------+                 +---------------------------------+
|     CLIENT-SIDE ROLLBACK        |                 |     SERVER-SIDE ROLLBACK        |
| - Broadcast feature disable     |                 | - Toggle DRIVE_FEATURE_ENABLED  |
| - Silent unmount of drive N:    |                 | - Block /api/v1/drive/* routes  |
| - Uninstallation via Intune     |                 | - Preserve database records     |
| - Retain user local databases   |                 | - Web application uninterrupted |
+---------------------------------+                 +---------------------------------+
```

---

## 3. Tier 1: Instant Server-Side Feature Gate Shutdown (< 60 Seconds)

The quickest method to halt NKB Drive operations across all corporate laptops without touching individual client machines:

### 3.1 Procedure
1. SSH into the NKB Cloud production backend host:
   ```bash
   ssh deploy@cloud.nkbmanufacturing.com
   ```
2. Edit the production environment configuration `server/.env`:
   ```bash
   sed -i 's/DRIVE_FEATURE_ENABLED=true/DRIVE_FEATURE_ENABLED=false/g' server/.env
   ```
3. Gracefully reload the Express server cluster:
   ```bash
   pm2 reload nkb-server
   ```
4. **Result**:
   - All incoming client sync requests (`/api/v1/drive/*`) will receive:
     ```json
     { "error": "NKB Drive service temporarily suspended for maintenance", "code": "SERVICE_MAINTENANCE" }
     ```
   - Workstations cleanly pause background synchronization.
   - Filesystem provider remains read-only for already cached files; no sync operations are transmitted to the server.
   - The primary React web application (`http://127.0.0.1:3000`) remains **100% operational**.

---

## 4. Tier 2: Automated Client-Side Teardown (< 5 Minutes)

To remove NKB Drive completely from workstations via Intune / MECM:

### 4.1 Deployment Command
Push the silent uninstall command to the affected workstation collection:
```cmd
"%LocalAppData%\Programs\NKB Drive\Uninstall.exe" --uninstall /S
```

### 4.2 Automated Teardown Actions
1. Terminates running `NKBDrive.exe` processes.
2. Releases virtual drive letter `N:`.
3. Removes desktop and start menu shortcuts.
4. Purges `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\NKB Drive`.
5. Deletes application binaries from `%LocalAppData%\Programs\NKB Drive`.
6. **Data Preservation Guarantee**: `%LocalAppData%\NKB Drive` (containing `metadata.db` and cached files) is **strictly preserved**, ensuring offline edits are retained for post-mortem recovery.

---

## 5. Tier 3: Database & Backend Rollback

In the event that the additive database migration (Migration 008) must be reversed:

> [!WARNING]
> Database rollback scripts must ONLY be executed if authorized by the Lead Database Administrator.
> Existing company files and user tables are completely isolated from NKB Drive tables.

### 5.1 Rollback Script Execution (PostgreSQL 16)
The rollback script `server/db/migrations/008_nkb_drive_devices_and_journal_rollback.sql` cleanly drops the additive drive tables without impacting existing production tables:

```bash
docker exec -i nkb_pg16_staging psql -U postgres -d nkb_drive_staging < server/db/migrations/008_nkb_drive_devices_and_journal_rollback.sql
```

### 5.2 Dropped Structures
- `TABLE public.drive_change_journal;`
- `TABLE public.nkb_drive_devices;`
- `SEQUENCE public.drive_change_seq;`
- `TRIGGER trigger_files_change_journal ON public.files;`

Existing tables (`users`, `files`, `folders`, `departments`, `roles`, `permissions`, `storage_volumes`, `recycle_bin`) remain untouched.

---

## 6. Post-Rollback Verification Checklist

| Verification Step | Command / Inspection | Expected Result | Verified |
| :--- | :--- | :--- | :---: |
| **Web App Operational** | `curl -I https://cloud.nkbmanufacturing.com/` | `HTTP/2 200 OK` | [ ] |
| **Drive Route Suspended** | `curl -i https://cloud.nkbmanufacturing.com/api/v1/drive/changes` | `503 Service Unavailable` | [ ] |
| **Drive N: Detached** | Check Windows Explorer under This PC | Drive `N:` absent | [ ] |
| **Processes Terminated** | `tasklist /fi "imagename eq NKBDrive.exe"` | No tasks running | [ ] |
| **Cloud Files Intact** | `SELECT COUNT(*) FROM files WHERE is_trashed = false;` | Count matches pre-deployment | [ ] |
| **Local Cache Retained** | Check `%LocalAppData%\NKB Drive\metadata.db` | File preserved | [ ] |

---

## 7. Incident Escalation & Response Team

| Role | Responsibility | Contact Channel |
| :--- | :--- | :--- |
| **Enterprise Software Architect** | Approves emergency rollback triggers | Security Incident Channel #1 |
| **Lead Database Administrator** | Authorizes DB migration rollback | DBA Operations Desk |
| **Windows Systems Engineer** | Oversees MECM/Intune uninstaller rollout | SysAdmin Operations |
| **DevOps Engineer** | Manages Nginx/PM2 service configuration | DevOps On-Call Pager |

---

## 8. Rollback Certification

This rollback plan has been verified against staging infrastructure. All scripts, commands, and isolation invariants are validated and ready for immediate deployment if required.

**Status:** **CONTINGENCY PROCEDURES VERIFIED — READY**
