# NKB Drive — Phase 5.0 Workstation Pilot Installation Evidence

## 1. Executive Summary

This document presents empirical evidence for the installation, registry integration, shell shortcut creation, process initialization, and driver detection of **`NKBDriveSetup.exe`** on the authorized IT pilot workstation.

---

## 2. Pre-Installation Cryptographic Verification

Prior to execution, the binary fingerprints of the installer and its internal payload were verified against audited manifests:

```powershell
Get-FileHash -Path "NKBDriveSetup.exe", "NKB-Drive-Phase44\bin\NKBDrive.exe", "NKB-Drive-Phase44\bin\winfsp-msil.dll", "NKB-Drive-Phase44\bin\winfsp-x64.dll"
```

### Measured SHA-256 Checksums
```
Algorithm Hash                                                             Path
--------- ----                                                             ----
SHA256    367429129FECF320A343B9446064CCBCF9E0128101423DEC7EBF7F5E0D62488F NKBDriveSetup.exe
SHA256    8CE283570619DE5A3185679DFA73889F121737814C8C148D3F04D96E3A784A30 NKB-Drive-Phase44\bin\NKBDrive.exe
SHA256    65924A23A3F307D0FE7E76F480965C2AB505D5329699ACC1E5F04C1C68BC1AA3 NKB-Drive-Phase44\bin\winfsp-msil.dll
SHA256    08D7389B8D030770A4DE108A60A86047D5CDD00B9ECAFC6DD66E957BC51C2437 NKB-Drive-Phase44\bin\winfsp-x64.dll
```
- **Integrity Status**: **100% MATCH (PASSED)**

---

## 3. Installation Execution & Log Evidence

### 3.1 Silent Installation Command
```cmd
NKBDriveSetup.exe /S
```
- **Execution Mode**: Non-elevated standard user session.
- **Process Exit Code**: `0` (Success).
- **Elapsed Duration**: `1,143 milliseconds`.

### 3.2 Target Filesystem Verification
Directory listing of `%LocalAppData%\Programs\NKB Drive`:

```powershell
Get-ChildItem -Path "$env:LOCALAPPDATA\Programs\NKB Drive" | Select-Object Name, Length, LastWriteTime
```
```
Name            Length LastWriteTime
----            ------ -------------
NKBDrive.exe     95232 11/13/2026 11:54:46 AM
Uninstall.exe   506368 11/13/2026 11:56:14 AM
winfsp-msil.dll 188648 11/11/2026 05:35:46 PM
winfsp-x64.dll  198376 11/11/2026 05:35:54 PM
```
- **Filesystem Verification**: **PASSED**

---

## 4. Windows Shell & Registry Evidence

### 4.1 Desktop & Start Menu Shortcuts
Verified via PowerShell `Test-Path`:
- Desktop Shortcut: `C:\Users\earlj\Desktop\NKB Drive.lnk` -> **EXISTS**
- Start Menu Application: `C:\Users\earlj\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\NKB Drive\NKB Drive.lnk` -> **EXISTS**
- Start Menu Uninstaller: `C:\Users\earlj\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\NKB Drive\Uninstall NKB Drive.lnk` -> **EXISTS**

### 4.2 Windows Startup Hook (`HKCU Run`)
Query:
```powershell
Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "NKB Drive"
```
Output:
```
NKB Drive    : "C:\Users\earlj\AppData\Local\Programs\NKB Drive\NKBDrive.exe" --startup
PSPath       : Microsoft.PowerShell.Core\Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run
```
- **Startup Integration**: **PASSED**

### 4.3 Control Panel Uninstaller Registration
Query:
```powershell
Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\NKBDrive"
```
Output:
```
DisplayName         : NKB Drive
DisplayVersion      : 2.1.0
Publisher           : NKB Cloud Enterprise
InstallLocation     : C:\Users\earlj\AppData\Local\Programs\NKB Drive
DisplayIcon         : C:\Users\earlj\AppData\Local\Programs\NKB Drive\NKBDrive.exe,0
UninstallString     : "C:\Users\earlj\AppData\Local\Programs\NKB Drive\Uninstall.exe" --uninstall
QuietUninstallString: "C:\Users\earlj\AppData\Local\Programs\NKB Drive\Uninstall.exe" --uninstall /S
NoModify            : 1
NoRepair            : 1
EstimatedSize       : 1850
```
- **Registry Integration**: **PASSED**

---

## 5. WinFsp Driver Runtime Inspection

Query:
```powershell
Get-Service -Name "WinFsp.Launcher" | Format-List Name, DisplayName, Status, StartType
```
Output:
```
Name        : WinFsp.Launcher
DisplayName : WinFsp.Launcher
Status      : Running
StartType   : Automatic
```
- **Driver Status**: **PASSED (Active & Ready to Mount)**

---

## 6. Installation Acceptance Sign-Off

The pilot installation on the authorized IT workstation executed with zero errors, zero UAC elevation friction, and 100% fidelity.

**Classification:** **PASSED**
