# NKB Drive — Phase 4.4 Windows Desktop Application Architecture & Implementation Report

## 1. Executive Summary

Phase 4.4 transforms the verified NKB Drive WinFsp filesystem provider, SQLite metadata engine, and DPAPI credential vault into a standalone, enterprise-grade Windows desktop application: **NKB Drive**.

The application is engineered strictly in **C# and .NET Framework 4.8 / WPF**, following the design language of modern enterprise ERP software (Navy `#0F172A`, Slate `#F8FAFC`, Gold `#D97706`). It integrates directly with the existing **NKB Cloud Enterprise v2.1.0 backend (Express on port 5000 / PostgreSQL 16 on port 5433)**.

**STRICT ARCHITECTURAL ADHERENCE:**
- Zero Supabase / Zero Firebase dependencies.
- Zero duplicate cloud infrastructure.
- Complete reuse of NKB Cloud JWT authentication and department/folder authorization.
- Windows Virtual Filesystem provider mounted seamlessly as drive **N:**.

---

## 2. Desktop Application Architecture

### 2.1 Component Interaction Overview

```
 +-------------------------------------------------------------------------+
 |                    NKB Drive Desktop Application (WPF)                  |
 |  +-----------------------+  +----------------------------------------+  |
 |  | Sidebar Navigation    |  | Main Content Views                     |  |
 |  | - Overview Dashboard  |  | - KPI Metric Cards (Files, Sync, State)|  |
 |  | - Synchronized Files  |  | - Real-time File Grid                  |  |
 |  | - Pending Queue       |  | - Upload/Download Queue Manager        |  |
 |  | - Conflict Center     |  | - Forked Conflicts Resolution Grid    |  |
 |  | - Offline Pinned      |  | - Pinned Items Inventory               |  |
 |  | - Settings & Storage  |  | - Cache Eviction & Startup Toggle      |  |
 |  +-----------------------+  +----------------------------------------+  |
 +------------------------------------+------------------------------------+
                                      |
         +----------------------------+----------------------------+
         |                                                         |
         v                                                         v
+-------------------------------+                         +------------------+
| Windows System Tray (Notify)  |                         | DPAPI Credential |
| - Background Service Daemon   |                         | Vault (Protected)|
| - Context Menu: Open, N:, Exit|                         +------------------+
+-------------------------------+                                  |
         |                                                         v
         v                                                +------------------+
+-------------------------------+                         | Staging Client   |
| WinFsp Virtual Drive (N:)     |<=======================>| (Express API /   |
| - Online-Only Hydration       |                         | PostgreSQL 16)   |
| - Directory Virtualization    |                         +------------------+
+-------------------------------+
```

### 2.2 Application Lifecycle and Mutex Protection

- **Single-Instance Enforcement**: `NKB-Drive-Phase44/src/App.cs` utilizes a named system mutex `Global\NKB_DRIVE_SINGLE_INSTANCE_MUTEX`. If an existing instance is active, subsequent invocations bring the primary window to the foreground or terminate cleanly.
- **System Startup Mode**: When invoked with `--startup` or `--minimized`, the application suppresses the main window and initializes directly into the Windows System Tray (`NotifyIcon`), mounting drive `N:` silently in the background if credentials are saved.
- **Graceful Shutdown**: On unmount or process exit, `App.OnExit()` coordinates with `NkbDriveHost.Stop()` to flush SQLite dirty state, finish inflight transfers, and unmount drive `N:` cleanly to prevent dangling filesystem handles.

---

## 3. UI/UX Design System Specification

| Component | Design Specification | RGB / Hex Value |
| :--- | :--- | :--- |
| **Primary Sidebar** | Enterprise Deep Navy | `#0F172A` |
| **Sidebar Highlight** | Navy Active Selection | `#1E293B` |
| **Accent / Focus** | Enterprise Amber Gold | `#D97706` |
| **Background** | Clean Slate Canvas | `#F8FAFC` |
| **Borders** | Subtle Slate Border | `#E2E8F0` |
| **Header Text** | Inter Bold Navy | `#0F172A` |
| **Muted Text** | Slate Subtitle / Metadata | `#64748B` |

### 3.1 Views Implemented

1. **Overview Dashboard**:
   - Live KPI cards: Total Synchronized Files, Pending Sync Operations, Active Conflicts, Drive Letter Mount State.
   - Quick action: "Open Drive (N:)" launching native Windows Explorer.
   - Recent activity list displaying last synchronized files and timestamps.
2. **Synchronized Files View**:
   - Detailed multi-column view: File Name, Virtual Path, Size, SHA-256 fingerprint, Sync State (`ONLINE_ONLY`, `OFFLINE_PINNED`, `SYNCED`), and Modification Timestamps.
3. **Pending Queue View**:
   - Status tracking for inflight uploads, downloads, renames, and deletions.
   - Retry counts, target endpoints, and error diagnostics.
4. **Conflict Center**:
   - Displays files forked due to simultaneous offline modifications.
   - Shows original file ID, conflict filename, base SHA-256, and local/server variants.
5. **Offline Pinned View**:
   - Inventory of files explicitly marked for permanent offline caching.
   - Guarantees instant access during network severance.
6. **Settings & Cache Management**:
   - "Start NKB Drive on Windows Logon" toggle with live registry synchronization.
   - Safe Cache Eviction: Clears local cached payloads while strictly preserving remote cloud files and SQLite metadata.
   - Mount / Unmount manual override controls.

---

## 4. Hardware and Software Integration

- **Language / Framework**: C# 5 / .NET Framework 4.8.
- **GUI Engine**: Windows Presentation Foundation (WPF) with pure XAML-free declarative code generation, ensuring 100% build compatibility with native `csc.exe` on Windows 10 and 11 without requiring MSBuild or Visual Studio installations.
- **Filesystem Engine**: Native WinFsp.Net runtime binding to `winfsp-msil.dll` and `winfsp-x64.dll`.
- **Database Engine**: Direct P/Invoke binding to `sqlite3.dll` with WAL mode and immediate transactions.
- **Security**: Windows Data Protection API (`System.Security.Cryptography.ProtectedData`).

---

## 5. Verification Sign-Off

The desktop application has passed all build and execution milestones. Binary verification:
- **Executable**: `NKB-Drive-Phase44/bin/NKBDrive.exe`
- **Architecture**: Windows x64
- **Exit Status**: Verified functional under single-instance and tray modes.
