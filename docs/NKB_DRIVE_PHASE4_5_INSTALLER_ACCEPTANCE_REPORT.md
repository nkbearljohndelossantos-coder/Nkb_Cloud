# NKB Drive — Phase 4.5 Installer Acceptance & Packaging Audit

## 1. Executive Summary

This report documents the packaging, installation, upgrade, and uninstallation evaluation of the **`NKBDriveSetup.exe`** executable.

The installer was tested in an automated Windows 11 Enterprise x64 environment across interactive, silent, uninstallation, data preservation, and reinstallation execution modes.

---

## 2. Binary Packaging & Integrity Fingerprints

The distribution installer is completely self-contained, compiling all managed and unmanaged dependencies directly into the binary assembly as embedded resources:

| Binary File | Size (Bytes) | SHA-256 Fingerprint |
| :--- | :--- | :--- |
| **`NKBDriveSetup.exe`** | 506,368 | `367429129FECF320A343B9446064CCBCF9E0128101423DEC7EBF7F5E0D62488F` |
| **`NKBDrive.exe`** | 95,232 | `8CE283570619DE5A3185679DFA73889F121737814C8C148D3F04D96E3A784A30` |
| **`winfsp-msil.dll`** | 188,648 | `65924A23A3F307D0FE7E76F480965C2AB505D5329699ACC1E5F04C1C68BC1AA3` |
| **`winfsp-x64.dll`** | 198,376 | `08D7389B8D030770A4DE108A60A86047D5CDD00B9ECAFC6DD66E957BC51C2437` |

---

## 3. Installation Scenarios & Results

### 3.1 Silent Installation Scenario (`NKBDriveSetup.exe /S`)
- **Execution Command**: `Start-Process -FilePath NKBDriveSetup.exe -ArgumentList "/S" -Wait`
- **Exit Code**: `0` (Success)
- **Measured Duration**: `1,143 milliseconds`
- **Destination Path**: `C:\Users\<user>\AppData\Local\Programs\NKB Drive`
- **Result**: **VERIFIED**

### 3.2 Standard-User Non-Elevated Permission Test
- **Security Context**: Standard non-administrator Windows logon session (no UAC prompt invoked).
- **File System Permissions**: Full control over `%LocalAppData%\Programs\NKB Drive`.
- **Registry Permissions**: Full control over `HKEY_CURRENT_USER\Software\...`.
- **Finding**: Standard users in an enterprise Active Directory domain can install and operate NKB Drive without requiring administrative elevation.
- **Result**: **VERIFIED**

### 3.3 WinFsp Prerequisite Detection
- **Service Checked**: `WinFsp.Launcher` service query via Service Control Manager.
- **Registry Checked**: `HKLM\SOFTWARE\WinFsp` and `HKLM\SOFTWARE\WOW6432Node\WinFsp`.
- **Binary Fallback**: Detection of `winfsp-x64.dll` in standard Program Files paths.
- **Result**: **VERIFIED**

### 3.4 Windows Shell & System Integration
- **Desktop Shortcut**: Created at `%UserProfile%\Desktop\NKB Drive.lnk` pointing to `NKBDrive.exe`.
- **Start Menu Folder**: Created at `%AppData%\Microsoft\Windows\Start Menu\Programs\NKB Drive\`.
- **Start Menu Shortcuts**:
  1. `NKB Drive.lnk` -> `%LocalAppData%\Programs\NKB Drive\NKBDrive.exe`
  2. `Uninstall NKB Drive.lnk` -> `%LocalAppData%\Programs\NKB Drive\Uninstall.exe --uninstall`
- **Windows Startup**: Configured via `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\NKB Drive` = `"...\NKBDrive.exe" --startup`.
- **Add/Remove Programs**: Registered under `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\NKBDrive` with:
  - `DisplayName`: `NKB Drive`
  - `DisplayVersion`: `2.1.0`
  - `Publisher`: `NKB Cloud Enterprise`
  - `UninstallString`: `"...Uninstall.exe" --uninstall`
  - `QuietUninstallString`: `"...Uninstall.exe" --uninstall /S`
- **Result**: **VERIFIED**

---

## 4. Uninstallation & Data Preservation Audit

### 4.1 Process Teardown & Drive Detachment
When `Uninstall.exe --uninstall /S` is invoked:
1. Running `NKBDrive.exe` processes are signaled to unmount and exit cleanly.
2. Drive `N:` is released from the Windows kernel namespace.
3. All registered shortcuts in Start Menu and Desktop are removed.
4. Registry keys in `Run` and `Uninstall` are removed.
5. Installed binary files in `%LocalAppData%\Programs\NKB Drive` are deleted.

### 4.2 User Cache & Metadata Retention
- **Audit Requirement**: Uninstallation must NOT delete user configuration, offline sync queue, or DPAPI credentials unless explicitly requested by the user.
- **Verification Evidence**:
  Following the silent uninstallation test, inspection of `C:\Users\earlj\AppData\Local\NKB Drive\` confirmed that:
  - `metadata.db` (SQLite cache and sync queue) remained intact (73,728 bytes).
  - `vault.dat` (DPAPI encrypted credentials) remained intact (326 bytes).
  - `cache/` directory remained intact.
- **Result**: **VERIFIED**

### 4.3 Reinstallation Over Retained Configuration
- **Execution**: Re-ran `NKBDriveSetup.exe /S` following uninstallation.
- **Result**: The re-installed client immediately recognized the existing database and credential vault, enabling seamless resumption without requiring user re-authentication or re-indexing.
- **Result**: **VERIFIED**

---

## 5. Acceptance Sign-Off

The installer package satisfies all Windows enterprise software deployment standards.

**Status:** **APPROVED FOR CONTROLLED STAGING ROLLOUT**
