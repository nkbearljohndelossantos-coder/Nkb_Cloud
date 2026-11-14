# NKB CLOUD v2.1.0 — WINDOWS AGENT DEPLOYMENT & SECURITY REPORT

**Document Version:** 2.1.0  
**Target Platform:** Windows 10 & 11 (x64 / ARM64), Windows Server 2022  
**Architecture:** Windows Service, DPAPI Cryptographic Store, WMI / VDS Hardware Probing, Loopback IPC  
**Audit Date:** November 11, 2026  
**Status:** IMPLEMENTED & LOCAL STAGING VERIFIED  

---

## 1. ARCHITECTURAL OVERVIEW

The **NKB Cloud Windows Storage Agent** is the flagship enterprise endpoint component responsible for physical disk virtualization, local folder synchronization, and high-speed block storage caching on corporate Windows workstations and file servers. Operating as an isolated background Windows Service, the agent runs under the `NT AUTHORITY\SYSTEM` or dedicated service account without requiring an interactive desktop session.

---

## 2. CRYPTOGRAPHIC PROTECTION VIA WINDOWS DPAPI

### 2.1 DPAPI Machine-Scope Key Protection
The agent stores its 256-bit Ed25519 signing key and server communication tokens encrypted at rest using the **Windows Data Protection API (DPAPI)**:
- **Scope:** `DataProtectionScope.LocalMachine`.
- **Entropy:** Salted with a machine-unique hardware fingerprint (derived from Motherboard UUID and CPU processor ID).
- **Security Boundary:** The private key cannot be decrypted by standard user accounts or extracted via offline volume cloning without matching hardware credentials.

```csharp
// Windows DPAPI Protection Routine
byte[] encryptedKey = ProtectedData.Protect(
    rawPrivateKeyBytes,
    optionalMachineEntropy,
    DataProtectionScope.LocalMachine
);
```

### 2.2 Memory Hardening
- Secret key material is held in pinned, non-pageable memory buffers (`VirtualLock`).
- Memory regions are zeroed immediately upon completion of cryptographic handshake routines using `SecureZeroMemory`.

---

## 3. STORAGE & HARDWARE DETECTION

### 3.1 Composite Disk Identification
To prevent volume spoofing and maintain audit integrity across system updates and drive re-lettering, the agent generates an immutable 32-byte SHA-256 composite identity:
```
CompositeID = SHA-256( HardwareSerialNumber || "::" || VolumeGuid || "::" || StartingOffset || "::" || TotalCapacityBytes )
```
- Hardware serials are retrieved via WMI query to `Win32_DiskDrive`.
- Partition offsets and GUIDs are queried via `Win32_Volume` and `IOCTL_DISK_GET_PARTITION_INFO_EX`.
- Dynamic and removable drives (USB thumb drives) are flagged and isolated based on `DriveType` properties.

### 3.2 Loopback Health & Status Server
- Binds exclusively to `127.0.0.1:51248`.
- Exposes REST endpoints (`/status`, `/drives`, `/sync/status`) consumed by the NKB Cloud React Web Client.
- Cross-Origin Resource Sharing (CORS) strictly permits only approved corporate intranet origins.

---

## 4. ENTERPRISE AUTOMATED DEPLOYMENT MECHANISMS

### 4.1 Microsoft Intune Win32 App Packaging
For modern cloud-managed enterprises, the agent is packaged using Microsoft's Win32 Content Prep Tool (`IntuneWinAppUtil.exe`):
1. **Source Package:** `NKBCloudStorageAgent-Setup-v2.1.0.exe`
2. **Setup Output:** `NKBCloudStorageAgent.intunewin`
3. **Install Command:**
   ```powershell
   NKBCloudStorageAgent-Setup-v2.1.0.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SERVER="https://cloud.nkb.com" /TOKEN="%ENROLLMENT_TOKEN%"
   ```
4. **Uninstall Command:**
   ```powershell
   "%ProgramFiles%\NKB Cloud\Storage Agent\unins000.exe" /VERYSILENT /NORESTART
   ```
5. **Detection Rule:**
   - Type: File/Folder detection.
   - Path: `C:\Program Files\NKB Cloud\Storage Agent\nkb-storage-agent.exe`.
   - File Version check: `>= 2.1.0.0`.

### 4.2 Active Directory Group Policy (GPO) & PowerShell Deployment
For on-premises Active Directory domains, deployment is automated using the enterprise script [`scripts/deploy-nkb-agent.ps1`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/scripts/deploy-nkb-agent.ps1):
- Executed via Group Policy Startup Scripts (Computer Configuration -> Windows Settings -> Scripts).
- Automates:
  1. Downloading the signed agent installer from the NKB Cloud server.
  2. Verifying the Authenticode digital signature and SHA-256 hash.
  3. Installing the Windows Service via `sc.exe create NKBStorageAgent binPath= ... start= auto`.
  4. Configuring Windows Firewall to permit local loopback on port 51248.
  5. Generating local Ed25519 keys and submitting enrollment to the server.

---

## 5. AUDIT & TESTING CLASSIFICATION

| Component | Status | Verification Evidence / Details |
| :--- | :--- | :--- |
| **Windows Storage Agent Codebase** | **IMPLEMENTED** | Production code in [`storage-agent/`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/storage-agent/) (`agent.js`, `diskDetector.js`, `windowsService.js`) |
| **Windows 11 Workstation Enrollment** | **TESTED** | Verified in `test-cross-platform-ecosystem.mjs` against staging PostgreSQL on port 5433 |
| **Admin Device Approval & Platform Filter** | **TESTED** | Verified; device correctly classified as `WINDOWS` with admin approval workflow |
| **Mutual Ed25519 Handshake & Nonce Replay Block** | **TESTED** | Verified; valid signature authenticated, replayed nonces rejected with PostgreSQL 23505 |
| **Active Directory GPO Deployment Script** | **IMPLEMENTED** | [`scripts/deploy-nkb-agent.ps1`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/scripts/deploy-nkb-agent.ps1) with parameter validation and Authenticode verification |
| **Physical Active Directory Domain Rollout** | **NOT YET VERIFIED** | Requires live corporate domain controller and physical test fleet execution |
| **Authenticode EV Code Signing Certificate** | **NOT YET VERIFIED** | Requires hardware security module (HSM) EV token during production packaging phase |
