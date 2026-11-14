# NKB CLOUD v2.1.0 — STORAGE AGENT INSTALLATION & RUNBOOK

**Target Audience:** Enterprise IT Administrators, Desktop Support Specialists, and Company Employees  
**Supported Platforms:** Windows 10 (Build 19041+) / Windows 11 / Windows Server 2022  
**Target Architecture:** x86_64 / ARM64 (Node.js runtime)  
**Agent Component:** NKB Cloud Storage Agent v2.1.0  
**Deployment Script:** [`scripts/deploy-nkb-agent.ps1`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/scripts/deploy-nkb-agent.ps1)  

---

## 1. PRE-REQUISITES & PLANNING

Before initiating agent installation on corporate workstations, verify the following prerequisites:

### 1.1 Network & Firewall Connectivity
- Outbound access over TCP Port `443` (HTTPS / WSS) to the central NKB Cloud domain:
  - `https://cloud.nkb.local/api/*` (REST endpoints)
  - `wss://cloud.nkb.local/ws/agent` (Persistent outbound WebSocket)
- Local loopback port `51248` open for internal host traffic (`127.0.0.1` only).
- **NO inbound firewall rules** are needed on the local machine or corporate network.

### 1.2 Administrative Privileges
- Automated deployment methods (Intune / GPO) execute under the local `NT AUTHORITY\SYSTEM` security context.
- Manual installations require a local Administrator PowerShell session.

---

## 2. METHOD 1: MICROSOFT INTUNE AUTOMATIC DEPLOYMENT (RECOMMENDED)

Microsoft Intune (Endpoint Manager) provides zero-touch fleet management for company-owned Windows laptops and desktops.

### Step 1: Package the Win32 Application
1. Download the Microsoft Win32 Content Prep Tool (`IntuneWinAppUtil.exe`).
2. Place `deploy-nkb-agent.ps1` and the storage agent distribution package in a staging folder (e.g. `C:\NKB-Packaging\source`).
3. Run the packaging utility:
   ```cmd
   IntuneWinAppUtil.exe -c "C:\NKB-Packaging\source" -s "deploy-nkb-agent.ps1" -o "C:\NKB-Packaging\output"
   ```

### Step 2: Configure Intune Application Settings
Log into the Microsoft Intune admin center (`endpoint.microsoft.com`):
1. Navigate to **Apps > Windows > Add > Windows app (Win32)**.
2. Upload the generated `deploy-nkb-agent.intunewin` package.
3. In **Program Settings**, configure:
   - **Install command:**
     ```cmd
     powershell.exe -ExecutionPolicy Bypass -File "deploy-nkb-agent.ps1" -ServerUrl "https://cloud.nkb.local" -EnrollmentToken "NKB-ENROLL-YOUR-TOKEN-HERE" -Silent
     ```
   - **Uninstall command:**
     ```cmd
     powershell.exe -ExecutionPolicy Bypass -Command "Stop-Service NKBStorageAgent -ErrorAction SilentlyContinue; sc.exe delete NKBStorageAgent; Remove-Item -Recurse -Force 'C:\Program Files\NKB\StorageAgent'"
     ```
   - **Install behavior:** `System`
   - **Device restart behavior:** `No specific action`

### Step 3: Detection Rules
Configure a **File or folder detection rule**:
- **Rule format:** `Manually configure detection rules`
- **Rule type:** `File`
- **Path:** `C:\Program Files\NKB\StorageAgent\bin`
- **File or folder:** `agent.js`
- **Detection method:** `File or folder exists`

### Step 4: Assignments
Assign the application as **Required** to the appropriate Azure AD Device Groups (e.g. `Corporate-Laptops`, `Engineering-Workstations`). Intune will automatically install the agent during workstation provisioning or background sync.

---

## 3. METHOD 2: ACTIVE DIRECTORY GROUP POLICY (GPO) STARTUP SCRIPT

For on-premises Active Directory environments, use a Computer Startup Script.

### Step 1: Stage Files on Network Share
1. Copy `scripts/deploy-nkb-agent.ps1` and agent files to a network share accessible by all domain computers (e.g., `\\corp.nkb.local\NETLOGON\NKB\`).
2. Ensure `Domain Computers` have `Read & Execute` permissions on the share.

### Step 2: Configure GPO Startup Script
1. Open the **Group Policy Management Console** (`gpmc.msc`).
2. Create or edit a GPO linked to the target Organizational Unit (OU) containing company computers.
3. Navigate to:
   `Computer Configuration > Policies > Windows Settings > Scripts (Startup/Shutdown) > Startup`
4. Click **PowerShell Scripts** tab > **Add...**:
   - **Script Name:** `\\corp.nkb.local\NETLOGON\NKB\deploy-nkb-agent.ps1`
   - **Script Parameters:**
     ```
     -ServerUrl "https://cloud.nkb.local" -EnrollmentToken "NKB-ENROLL-FLEET-TOKEN" -Silent
     ```
5. Click **OK** and apply the GPO.
6. The script will execute automatically at computer boot under `NT AUTHORITY\SYSTEM`.

---

## 4. METHOD 3: MANUAL OR ASSISTED TECHNICIAN INSTALLATION

For ad-hoc machine provisioning or troubleshooting, a technician or user can execute the installation script via elevated PowerShell.

### Step 1: Generate an Enrollment Token
1. Open the NKB Cloud web application and log in as an administrator or employee.
2. Navigate to **Device Management** or user profile.
3. Click **"Enroll This Computer"** or generate an enrollment token:
   - Token format: `NKB-ENROLL-<HMAC_SHA256>` (Valid for 24 hours).

### Step 2: Run the PowerShell Deployment Script
Open PowerShell as **Administrator** and run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# Execute deployment with your server URL and token
& ".\scripts\deploy-nkb-agent.ps1" `
    -ServerUrl "https://cloud.nkb.local" `
    -EnrollmentToken "NKB-ENROLL-YOUR-TOKEN-HERE" `
    -Service
```

### Script Execution Output Example:
```
======================================================================
     NKB CLOUD v2.1.0 — STORAGE AGENT DEPLOYMENT & ENROLLMENT
======================================================================
[INFO] Operating System: Microsoft Windows 11 Enterprise (10.0.22631)
[INFO] Target Directory: C:\Program Files\NKB\StorageAgent
[INFO] Verifying Node.js runtime environment...
[INFO] Node.js runtime located: v26.13.0
[INFO] Generating device-isolated Ed25519 cryptographic keypair...
[INFO] Public key generated (Fingerprint: 3e8f4c1a9d0b...)
[INFO] Submitting enrollment request to https://cloud.nkb.local/api/devices/enroll...
[SUCCESS] Enrollment request accepted by NKB Cloud backend.
[INFO] Assigned Agent ID: f47ac10b-58cc-4372-a567-0e02b2c3d479
[INFO] Initial State: PENDING (Awaiting administrator approval)
[INFO] Installing Windows Service 'NKBStorageAgent'...
[SUCCESS] Windows Service 'NKBStorageAgent' installed and started.
[INFO] Verifying loopback detection endpoint (http://127.0.0.1:51248/status)...
[SUCCESS] Loopback service responding: Status: PENDING, Version: 2.1.0.
======================================================================
INSTALLATION COMPLETE: Awaiting IT Administrator Approval in Admin Console.
======================================================================
```

---

## 5. EMPLOYEE EXPERIENCE & UI STATUS PROGRESSION

When an employee logs into the NKB Cloud web portal, the application displays their current device status with clear guidance:

| Employee Device State | UI Banner / Widget | Employee Action Required |
| :--- | :--- | :--- |
| **`AGENT_NOT_INSTALLED`** | Yellow Warning: *"Storage Agent not detected on this computer. Local drives cannot be synchronized."* | Click *"Download Installer"* or follow the one-click instructions to install. |
| **`AWAITING_DEVICE_APPROVAL`** | Blue Info: *"Device enrolled successfully. Awaiting IT Administrator approval before activating storage sync."* | None. Wait for IT support to approve the device in the Admin Console. |
| **`CONNECTED`** | Green Badge: *"Storage Agent Connected (v2.1.0). Local volumes synchronized."* | None. System is fully operational. |
| **`DISCONNECTED`** | Amber Warning: *"Storage Agent is offline or service is stopped."* | Verify workstation internet connectivity or restart the Windows Service. |
| **`DEVICE_REVOKED`** | Red Alert: *"This device has been permanently revoked by IT security policy. Local storage disabled."* | Contact IT administrator to re-enroll or investigate security reason. |

---

## 6. ADMINISTRATOR CONSOLE WORKFLOW

System Administrators manage all corporate devices directly from the **Device Management Dashboard** (`/admin/devices`):

1. **Review Pending Devices:**
   - Enrolled computers appear with status badge `PENDING APPROVAL`.
   - Admin reviews hostname, employee name, department, IP address, and cryptographic key fingerprint.
2. **Approve Device:**
   - Click the green **Approve** button.
   - Database marks agent as `OFFLINE` (ready to connect).
   - Agent automatically completes the Ed25519 handshake and transitions to `ONLINE`.
3. **Emergency Device Suspension:**
   - For suspected lost laptops or investigation, click **Suspend**.
   - Active WebSocket is instantly closed; device cannot upload or download chunks.
4. **Permanent Revocation:**
   - Click **Revoke Device**.
   - Cryptographic keys in `agent_credentials` are permanently invalidated.
5. **Trigger Signed Agent Update:**
   - Click **Update Agent**.
   - Admin specifies target version (e.g. `2.1.1`); server sends a cryptographically signed `UPDATE_AGENT` command.

---

## 7. TROUBLESHOOTING GUIDE

### Issue 1: Web application displays `AGENT_NOT_INSTALLED` even after installation
- **Cause:** Loopback service is not running or blocked by local third-party antivirus software.
- **Remediation:**
  1. Open PowerShell and run: `curl.exe http://127.0.0.1:51248/status`
  2. If connection fails, check the Windows Service: `Get-Service NKBStorageAgent`
  3. If stopped, start it: `Start-Service NKBStorageAgent`
  4. Ensure Windows Firewall permits inbound connections on TCP `51248` for the `Loopback` interface.

### Issue 2: Agent status stuck on `PENDING`
- **Cause:** Device has enrolled successfully but IT Administrator has not yet approved it.
- **Remediation:** IT Administrator must open `/admin/devices` in NKB Cloud and click **Approve**.

### Issue 3: WebSocket connection rejected with code `4003`
- **Cause:** Device has been administratively suspended or revoked.
- **Remediation:** Check the Admin Console device audit history. If suspended by accident, click **Reactivate**. If revoked, remove `config.json` and re-enroll with a new keypair.
