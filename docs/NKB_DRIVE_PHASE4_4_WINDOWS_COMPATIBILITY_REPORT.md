# NKB Drive — Phase 4.4 Windows Compatibility & Integration Report

## 1. Executive Summary

This report assesses the compatibility of the **NKB Drive Desktop Application** and **`NKBDriveSetup.exe`** across the supported enterprise Windows ecosystem.

All components have been verified against:
- **Windows 10 64-bit** (Build 19041+ / 21H2 / 22H2)
- **Windows 11 64-bit** (Build 22000+ / 22H2 / 23H2 / 24H2)
- **Windows Server 2019 / 2022 x64**

---

## 2. Windows Ecosystem Compatibility Matrix

| Category | Component / Feature | Compatibility Status | Implementation Notes |
| :--- | :--- | :--- | :--- |
| **OS Architecture** | 64-bit (x64) AMD64 | **Supported (Native)** | Platform target forced to `/platform:x64`. 32-bit systems blocked cleanly by installer check. |
| **Framework Runtime** | .NET Framework 4.8+ | **Supported (Built-in)** | Pre-installed natively on Windows 10 (1903+) and all Windows 11 releases. |
| **Filesystem Provider**| WinFsp.Net (v2.0+) | **Verified** | Kernel filter driver interface via `winfsp-x64.dll`. Tested against `WinFsp.Launcher` service. |
| **Virtual Drive** | Drive Letter `N:` | **Verified** | Mounts as an NTFS-compatible fixed/network volume. Accessible to all Win32 / UWP / Shell apps. |
| **Shell Integration** | Windows Explorer | **Verified** | Full folder tree browsing, thumbnails, right-click actions, and drag-and-drop file operations. |
| **Shortcuts** | WScript.Shell COM | **Verified** | Start Menu and Desktop `.lnk` creation using standard Windows Script Host COM interfaces. |
| **Startup Engine** | HKCU Run Registry | **Verified** | Standard Windows Logon auto-start hook via `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. |
| **Control Panel** | Add/Remove Programs | **Verified** | Conforms to Microsoft Windows Uninstaller Registry Specifications under `HKCU\...\Uninstall`. |

---

## 3. High-DPI and Per-Monitor V2 Compatibility

The WPF desktop interface is compiled with native resolution-independent vector rendering:
- Standard system font `Segoe UI` / `Inter` fallback is utilized.
- UI layouts rely strictly on proportional grid dimensions, `Thickness` padding, and automatic content wrapping.
- All icons and UI indicators (status circles, indicators, action buttons) are rendered programmatically using WPF vector elements, preventing raster scaling blur on 4K / High-DPI monitors (125%, 150%, 200%, 250% scaling).

---

## 4. Multi-User and Enterprise Domain Compatibility

1. **Per-User Isolation**:
   - The default installation target is `%LocalAppData%\Programs\NKB Drive`.
   - SQLite metadata databases and offline cache files reside at `%LocalAppData%\NKB Drive`.
   - Separate Windows users logged into the same workstation maintain independent databases, offline sync queues, and DPAPI credential vaults.
2. **Roaming Profiles & Folder Redirection**:
   - Local caches are placed in `LocalAppData` (non-roaming), preventing excessive network profile synchronization overhead across Active Directory domains.
3. **No UAC Prompts for Standard Users**:
   - Because all binaries and registry keys reside in user space, enterprise standard users can install, update, and operate NKB Drive without requiring IT helpdesk administrator elevation.

---

## 5. Security & Antivirus Interoperability

- **Binary Execution Policy**: Complies with standard AppLocker and Windows Defender Application Control (WDAC) user-space policies.
- **Filesystem Filter Driver**: WinFsp driver is WHQL-certified and signed by Microsoft Windows Hardware Compatibility Program, preventing kernel driver signature enforcement alerts.
- **Process Mutex**: Cleanly prevents orphaned process collisions across fast user switching and remote desktop terminal services.
