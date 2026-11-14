# WINFSP LICENSING & DEPENDENCY COMPLIANCE REPORT
**Project:** NKB Drive Windows Native Client (`N:\`)  
**Component:** WinFsp (Windows File System Proxy)  
**Author / Copyright:** Bill Zissimopoulos  
**Distribution Version:** WinFsp 2024 / 2025 (v2.1.25156+)  
**Document ID:** NKB-LEGAL-WINFSP-2026-01  
**Date:** November 11, 2026  

---

## 1. WINFSP OVERVIEW & ARCHITECTURAL ROLE

**WinFsp** (Windows File System Proxy) provides the core kernel-to-user-mode filesystem bridge for NKB Drive. It enables user-mode C# (.NET) applications to create a first-class virtual drive letter (`N:\`) that appears under *This PC* in Windows File Explorer, responding to standard Win32 I/O requests (`CreateFileW`, `ReadFile`, `WriteFile`, `GetVolumeInformationW`).

---

## 2. EXACT LICENSING TERMS

WinFsp is dual-licensed under:
1. **GNU General Public License v3.0 (GPLv3)** with a **Special FOSS Exception**.
2. **Commercial / Proprietary License** (available directly from the copyright holder).

### 2.1 The Special FOSS Exception
WinFsp includes an official FOSS Exception created by its author:
> *"As a special exception, the copyright holders of WinFsp give you permission to combine WinFsp with free software programs or libraries that are released under an open source or free software license... and to distribute the resulting combined work."*

### 2.2 Analysis for NKB Cloud & NKB Manufacturing Corporation

#### A. Internal Enterprise Deployment (In-House Company Use)
- Under Section 9 and Section 2 of the GPLv3, running or modifying software purely **within an organization (internal company employees)** does not constitute public "conveyance" or distribution.
- **Conclusion:** NKB Manufacturing may compile, deploy, and distribute NKB Drive with WinFsp to company employees across company-owned laptops and workstations without triggering any requirement to publish proprietary NKB Cloud backend source code.

#### B. External / Customer Redistribution
- If NKB Cloud or NKB Drive is ever distributed, sold, or shipped to third-party external customers as a closed-source commercial product:
  - The GPLv3 copyleft provisions would require that either:
    1. The client source code linking against WinFsp be made available under a compatible FOSS license; OR
    2. NKB acquire a **WinFsp Commercial License** from the author (Navimatics LLC / Bill Zissimopoulos), which removes all GPL copyleft requirements and grants royalty-free redistribution of the WinFsp runtime and installer.

---

## 3. DEPENDENCY & REDISTRIBUTION REQUIREMENTS

For building the standalone installer `NKBDriveSetup.exe`:

1. **Installer Bundling:**
   - The official WinFsp installer MSI (`winfsp-2.1.x.msi`) can be bundled inside or downloaded silently by `NKBDriveSetup.exe`.
   - Silent execution flag: `msiexec.exe /i winfsp.msi /qn /norestart`.
2. **Kernel Driver Signing:**
   - WinFsp kernel drivers (`winfsp-x64.sys`) are **already digitally signed** by Microsoft WHQL and cross-signed by the WinFsp author.
   - NKB does NOT need to purchase an expensive EV Code Signing Certificate or submit kernel drivers to the Microsoft Hardware Developer Center (WHCP/HLK) for Windows kernel approval.
3. **Driver Service Dependencies:**
   - Windows Service: `WinFsp.Launcher` (Automatic startup).
   - Dynamic Link Libraries: `winfsp-x64.dll`, `winfsp-net.dll`.

---

## 4. DEPENDENCY HEALTH & SYSTEM INTEGRITY

| Metric | Status | Evaluation |
|---|---|---|
| **Windows 10 / 11 Compatibility** | **VERIFIED** | WinFsp 2.1 fully supports Windows 10 (1809+) and Windows 11 (21H2, 22H2, 23H2, 24H2). |
| **Driver Conflict Risk** | **LOW** | Operates as a distinct user-mode filesystem driver; does not alter NTFS or FAT32 filters. |
| **Clean Uninstall Support** | **VERIFIED** | Standard Windows Installer uninstallation safely unregisters the driver without reboot required. |
