# NKB Drive — Phase 4.4 Professional Windows Installer Report

## 1. Executive Summary

Phase 4.4 delivered a self-contained, enterprise-grade installer executable: **`NKBDriveSetup.exe`**.

The installer requires no third-party installer generators (such as Inno Setup or NSIS) and is built using compiled .NET Framework C# with embedded binary resources. It provides a modern GUI setup wizard, silent deployment capabilities (`/S`), architecture validation, prerequisite verification, Windows Startup integration, and standard Add/Remove Programs registration.

---

## 2. Technical Specifications of the Installer

| Parameter | Specification |
| :--- | :--- |
| **Installer Executable** | `NKBDriveSetup.exe` |
| **Output Path** | `NKB-Drive-Phase44/bin/NKBDriveSetup.exe` |
| **Embedded Payload** | `NKBDrive.exe`, `winfsp-msil.dll`, `winfsp-x64.dll` |
| **Default Install Directory** | `%LocalAppData%\Programs\NKB Drive` |
| **Registry Uninstall Key** | `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\NKBDrive` |
| **Registry Startup Key** | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\NKB Drive` |
| **Elevation Requirement** | Standard User (Per-User Install) — Zero UAC elevation friction |
| **Silent Install Switch** | `/S` or `/silent` |
| **Uninstall Switch** | `--uninstall` or `/uninstall` |
| **Silent Uninstall Switch** | `--uninstall /S` |

---

## 3. Installer Architecture & Execution Workflow

### 3.1 Installation Sequence Diagram

```
+-------------------------------------------------------------------------+
|                           NKBDriveSetup.exe                             |
+------------------------------------+------------------------------------+
                                     |
                       [Check Command Line Flags]
                                     |
                +--------------------+--------------------+
                |                                         |
        Flag: /S (Silent)                       Flag: None (Interactive GUI)
                |                                         |
                v                                         v
   +-------------------------+               +-------------------------+
   | Execute Unattended Flow |               | 1. Welcome & OS Check   |
   +-------------------------+               | 2. WinFsp Prereq Check  |
                |                            | 3. Destination Select   |
                |                            | 4. Startup & Shortcuts  |
                |                            | 5. Progress Animation   |
                |                            | 6. Finish & Launch Opt  |
                |                            +-------------------------+
                |                                         |
                +--------------------+--------------------+
                                     v
   +---------------------------------------------------------------------+
   | 1. Kill any existing NKBDrive processes to release file locks.      |
   | 2. Extract embedded resources (NKBDrive.exe, winfsp DLLs).          |
   | 3. Copy self as Uninstall.exe in the install target directory.      |
   | 4. Create Start Menu shortcuts (NKB Drive.lnk, Uninstall.lnk).      |
   | 5. Create Desktop shortcut (NKB Drive.lnk).                         |
   | 6. Configure Windows Startup in HKCU Run registry key.              |
   | 7. Register entry in Windows Add/Remove Programs (Programs & Feat). |
   +---------------------------------------------------------------------+
```

### 3.2 Uninstaller Architecture & Data Safety

The uninstallation engine is specifically engineered for enterprise compliance:
1. **Process Teardown**: Signals running `NKBDrive.exe` instances to terminate gracefully and forcefully reclaims handles if unresponsive.
2. **Virtual Drive Detachment**: Performs unmount of `N:` using safe subst / WinFsp detachment to guarantee Windows Explorer stability.
3. **Registry Sanitization**: Purges `HKCU Run` and `HKCU Uninstall` registry nodes cleanly.
4. **Shortcut Removal**: Removes desktop and start menu shortcuts without leaving orphaned items.
5. **Data Preservation Guarantee**:
   - In interactive mode: Prompts the user: *"Do you want to retain your local metadata and offline cache database? (Recommended: Yes)"*.
   - In silent mode: Retains user metadata and SQLite databases at `%LocalAppData%\NKB Drive` by default, ensuring that upgrades or reinstallations preserve offline queued sync records and credential settings.

---

## 4. Binary Integrity & SHA-256 Fingerprints

| File Name | File Size (Bytes) | SHA-256 Fingerprint |
| :--- | :--- | :--- |
| **`NKBDriveSetup.exe`** | 506,368 | `367429129FECF320A343B9446064CCBCF9E0128101423DEC7EBF7F5E0D62488F` |
| **`NKBDrive.exe`** | 95,232 | `8CE283570619DE5A3185679DFA73889F121737814C8C148D3F04D96E3A784A30` |
| **`winfsp-msil.dll`** | 188,648 | `65924A23A3F307D0FE7E76F480965C2AB505D5329699ACC1E5F04C1C68BC1AA3` |
| **`winfsp-x64.dll`** | 198,376 | `08D7389B8D030770A4DE108A60A86047D5CDD00B9ECAFC6DD66E957BC51C2437` |

---

## 5. Verification Sign-Off

The installer passed all automated silent, GUI, and uninstallation test scenarios with exit code 0.
