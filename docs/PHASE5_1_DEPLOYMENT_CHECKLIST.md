# NKB Drive — Phase 5.1 Production Deployment Checklist

## 1. Overview & Operational Governance

This checklist defines the strict, sequential procedure required to transition **NKB Drive (N:)** from the completed **Phase 5.0 Controlled Pilot** to a company-wide **Production Release**.

No production step may be executed until all preceding prerequisites have been completed and verified.

---

## 2. Production Deployment Master Checklist

### Phase 0: Mandatory Pre-Deployment Prerequisites (GATING PHASE)

| # | Task / Prerequisite | Target Component | Responsible Role | Verification Method | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **0.1** | **Digital Code Signing** | `NKBDriveSetup.exe`<br>`NKBDrive.exe` | Security Architect / DevOps | `Get-AuthenticodeSignature` returns `Status: Valid` with trusted CA | **PENDING** |
| **0.2** | **Fleet WinFsp Driver Distribution** | Target Workstations (Windows 10/11) | Endpoint Systems Admin | Active Directory GPO or Microsoft Intune installs `winfsp-2.0.xxxx.msi` | **PENDING** |
| **0.3** | **Pre-Migration Production DB Backup** | Production PostgreSQL (`db:5432`) | Database Administrator | Execute `scripts/vps_backup.sh`; verify `.sha256` and manifest file | **READY** |
| **0.4** | **Staging Environment Verification** | Isolated Staging (`5433`) | DevOps Engineer | Verify all 11 pilot assertions pass on isolated staging instance | **PASS** |
| **0.5** | **Executive Change Approval** | Enterprise Change Board | IT Director / Management | Formal sign-off on change request ticket | **PENDING** |

---

### Phase 1: Production Backend & Database Preparation

| # | Task | Target Component | Procedure | Rollback Contingency | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **1.1** | **Enable Maintenance Gate** | Production Express Backend | Set `STAGING_MAINTENANCE_GATE=true` in production `.env` | Revert to `false` | **READY** |
| **1.2** | **Execute Migration 008** | Production PostgreSQL | Apply `008_nkb_drive_devices_and_journal.sql` | Apply `008_..._rollback.sql` | **READY** |
| **1.3** | **Verify Schema Parity** | `nkb_drive_devices`<br>`drive_change_journal` | Verify sequences and indexes created via `\d+` queries | Inspect migration logs | **READY** |
| **1.4** | **Restart Backend API** | `nkb_prod_backend` | `docker compose restart backend` | Inspect container health | **READY** |
| **1.5** | **Verify API Health & Gate** | `GET /health` | Probe `http://localhost:5000/health`; disable maintenance gate | Verify 200 OK | **READY** |

---

### Phase 2: Staged Workstation Fleet Rollout

| Wave | Scope | Target Users | Rollout Channel | Success Gate Criteria |
| :---: | :--- | :--- | :--- | :--- |
| **Wave 1** | **IT Operations & Security Team** | 10 Workstations | Silent GPO / Admin Portal | 100% successful mount of `N:\`; zero sync errors for 48 hours |
| **Wave 2** | **Engineering & Management** | 50 Workstations | Self-Service Portal / GPO | Hydration latency < 150ms; zero conflict data losses |
| **Wave 3** | **Enterprise Fleet (All Staff)** | 250+ Workstations | Automated Company-Wide GPO | CPU utilization < 2%; zero support tickets on drive collisions |

---

### Phase 3: Post-Deployment Workstation Verification Steps

For each workstation onboarded during rollout:

1. **Verify Binary Installation**:
   - Confirm binary extracted to `%LocalAppData%\Programs\NKB Drive\NKBDrive.exe`.
   - Confirm uninstaller registered in Windows Settings (`Uninstall.exe`).
2. **Verify Device Enrollment**:
   - Workstation issues `POST /api/v1/drive/devices/register`.
   - IT Administrator approves device in NKB Cloud Web Portal (`/devices/:id/approve`).
3. **Verify Mount & Filesystem Traversal**:
   - Drive `N:\` appears in Windows Explorer with label `NKB Drive`.
   - Department folders enumerated based on employee's AD group membership.
4. **Verify On-Demand Hydration**:
   - Double-clicking a corporate document hydrates the file seamlessly in under 150 ms.
5. **Verify Recycle Bin Soft-Delete**:
   - Deleting a test file removes it from Explorer and stages it in cloud trash (`is_trashed = true`).

---

## 3. Operational Roles & Responsibilities

| Role | Operational Scope During Deployment |
| :--- | :--- |
| **DevOps Engineer** | Executes container orchestration, environment variable deployment, and reverse proxy validation. |
| **Database Administrator** | Executes pre-migration backup (`vps_backup.sh`), runs Migration 008, and monitors query execution plans. |
| **Endpoint Systems Admin** | Deploys WinFsp MSI and signed `NKBDriveSetup.exe` via Active Directory Group Policy (GPO) or Intune. |
| **Cybersecurity Architect** | Audits device enrollment queue, verifies DPAPI encryption on endpoints, and monitors audit log hashes. |
| **Helpdesk Lead** | Monitors incoming employee tickets, assists with first-time device approvals, and reports sync anomalies. |
