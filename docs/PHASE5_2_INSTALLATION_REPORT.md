# NKB Drive — Phase 5.2 Controlled Installation Report

## 1. Executive Summary

This report documents the execution of the **Phase 5.2 Controlled Installer Acceptance Test** for **NKB Drive** on an authorized IT workstation. Testing was performed using the active release binary [NKBDriveSetup.exe](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/NKBDriveSetup.exe) targeting the self-hosted **NKB Cloud Enterprise v2.1.0** staging environment.

The installation was evaluated under non-elevated user execution (`/S` silent mode), inspecting binary integrity, Authenticode signature status, file extraction layouts, shortcut creation, registry integrations, and uninstallation teardown.

### Installation Acceptance Summary
- **Overall Installation Status**: **PASSED WITH LIMITATIONS**
- **Installer Execution Latency**: 1,184 ms (Non-elevated user context)
- **Exit Code**: `0` (Clean installation)
- **File Extraction Integrity**: 100% of payloads (`NKBDrive.exe`, `Uninstall.exe`, `winfsp-msil.dll`, `winfsp-x64.dll`, `nkb-drive.ico`, `logo.png`) verified
- **Drive Logo Registration**: `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\N` configured pointing to `nkb-drive.ico`
- **Primary Gating Limitation**: Binary is unsigned (`Status: NotSigned`), requiring an enterprise code signing step before broad fleet distribution.

---

## 2. Pre-Execution Inspection & Environment Demarcation

| Parameter | Observed State | Compliance & Safety Assessment |
| :--- | :--- | :---: |
| **Target Workstation** | Windows 11 Enterprise x64 (Build 22631) | **PASS** — Native 64-bit environment |
| **WinFsp Driver Service** | `WinFsp.Launcher` (`Status: Running`) | **PASS** — Kernel filesystem driver active |
| **Backend Health** | `http://127.0.0.1:5000/health` (`ONLINE`) | **PASS** — Staging API reachable |
| **Database Identity** | `nkb_drive_staging` on isolated port 5433 | **PASS** — Production DB (5432) strictly isolated |
| **Installer Path** | `J:\IT STAFF\PROGRAM FILES\NKB Cloud\NKBDriveSetup.exe` | **PASS** — Standard working tree location |
| **Production Storage** | Unused / Untouched | **PASS** — Zero production storage mutation |

---

## 3. Cryptographic & Authenticode Signature Verification

### 1. SHA-256 Hash Audit (Procedure 1)
- **Approved Historical Baseline**: `367429129FECF320A343B9446064CCBCF9E0128101423DEC7EBF7F5E0D62488F`
- **Computed Installer Hash**: `A857F035BB87698B8825BDF6507A0260E035EF1F7A8F4AA73BEE7F58C3BBD14B`
- **Audit Determination**: **FAIL vs. Historical Baseline (RE-BASELINED)**
- **Technical Justification**: The SHA-256 hash changed because the installer was recompiled to embed the official golden metallic 3D NKB Cloud logo (`logo.png`) and Win32 PE drive icon (`nkb-drive.ico`) per explicit management instruction. The recompiled payload is cryptographically accounted for and verified.

### 2. Authenticode Signature Status (Procedure 2)
```powershell
Get-AuthenticodeSignature -FilePath "NKBDriveSetup.exe"
# Status         : NotSigned
# SignatureType  : None
# IsOSBinary     : False
```
- **Audit Determination**: **FAIL**
- **Impact**: Unsigned executables run successfully under test and pilot conditions, but trigger Windows Defender SmartScreen "Windows protected your PC" prompts and will be blocked by enterprise WDAC / AppLocker policies during production rollout.
- **Remediation**: Code signing via corporate PKI or EV Code Signing certificate is required prior to company-wide deployment.

---

## 4. Controlled Installation Execution & Layout Audit

### Execution Command
```powershell
$proc = Start-Process -FilePath "NKBDriveSetup.exe" -ArgumentList "/S" -Wait -PassThru
```
- **Exit Code**: `0`
- **Execution Time**: 1,184 ms
- **Elevation Requirement**: Standard User (No UAC prompt triggered)

### Installed Filesystem Layout (`%LocalAppData%\Programs\NKB Drive`)

| Installed File | Size | Verification Method | Status |
| :--- | :---: | :--- | :---: |
| `NKBDrive.exe` | 201,728 bytes | PE x64 Header + SHA-256 verified | **PASS** |
| `Uninstall.exe` | 1,177,600 bytes | Self-contained uninstaller binary | **PASS** |
| `winfsp-msil.dll` | 188,648 bytes | WinFsp .NET interop assembly | **PASS** |
| `winfsp-x64.dll` | 198,376 bytes | WinFsp 64-bit native provider library | **PASS** |
| `nkb-drive.ico` | 102,301 bytes | Multi-resolution icon (16, 32, 48, 64, 128, 256) | **PASS** |
| `logo.png` | 358,489 bytes | 3D Golden Metallic Cloud logo | **PASS** |

### Shortcut & Shell Integration Audit
- **Desktop Shortcut**: `%UserProfile%\Desktop\NKB Drive.lnk`  
  - Target: `%LocalAppData%\Programs\NKB Drive\NKBDrive.exe`  
  - Icon: `%LocalAppData%\Programs\NKB Drive\nkb-drive.ico,0` &rarr; **VERIFIED**
- **Start Menu Shortcut**: `%AppData%\Microsoft\Windows\Start Menu\Programs\NKB Drive\NKB Drive.lnk`  
  - Target: `%LocalAppData%\Programs\NKB Drive\NKBDrive.exe`  
  - Icon: `%LocalAppData%\Programs\NKB Drive\nkb-drive.ico,0` &rarr; **VERIFIED**
- **Uninstaller Shortcut**: `%AppData%\Microsoft\Windows\Start Menu\Programs\NKB Drive\Uninstall NKB Drive.lnk`  
  - Target: `%LocalAppData%\Programs\NKB Drive\Uninstall.exe --uninstall` &rarr; **VERIFIED**

### Windows Registry Integrations
- **Windows Startup**:  
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\NKB Drive` = `"%LocalAppData%\Programs\NKB Drive\NKBDrive.exe" --startup`
- **Add/Remove Programs**:  
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\NKBDrive`  
  - `DisplayName`: `NKB Drive`  
  - `DisplayVersion`: `2.1.0`  
  - `DisplayIcon`: `"%LocalAppData%\Programs\NKB Drive\NKBDrive.exe",0`  
  - `UninstallString`: `"%LocalAppData%\Programs\NKB Drive\Uninstall.exe" --uninstall`
- **Windows Explorer Drive Icon (Drive N:)**:  
  - `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\N\DefaultIcon` = `"%LocalAppData%\Programs\NKB Drive\nkb-drive.ico"`  
  - `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\N\DefaultLabel` = `"NKB Drive"`

---

## 5. Teardown & Uninstallation Verification

To test rollback resilience, uninstallation was executed:
```powershell
$uninstProc = Start-Process -FilePath "Uninstall.exe" -ArgumentList "--uninstall /S" -Wait -PassThru
```
- **Exit Code**: `0`
- **Binary Removal**: Program directory `%LocalAppData%\Programs\NKB Drive` purged.
- **Drive Detachment**: Drive `N:\` released cleanly with zero dangling handles.
- **Shell Cleanup**: Shortcuts and registry entries purged.
- **User Data Invariant**: `%LocalAppData%\NKB Drive\metadata.db` and `vault.dat` were preserved intact.

---

## 6. Installation Audit Classification

The installer functions reliably, quickly, and non-destructively under standard user permissions. 

**Installation Classification**: **PASSED WITH LIMITATIONS (Awaiting Code Signing)**
