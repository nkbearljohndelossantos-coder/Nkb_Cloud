# NKB Drive — Phase 4 Implementation Plan & Execution Roadmap

**Document Version:** 1.0.0  
**Status:** PROPOSED — PENDING USER AUTHORIZATION (EXECUTION GATE ACTIVE)  
**Target Delivery:** NKB Drive Desktop Client & Backend Integration  
**Architecture Baseline:** C# / .NET 10 LTS (or .NET Framework 4.8 / Core), WPF GUI, WinFsp VFS, Node.js Express Backend, PostgreSQL

---

## 1. Overview & Objectives

Phase 4 transitions the successful Phase 3 Proof of Concept into the full-featured, enterprise-grade **NKB Drive Windows Desktop Client (`N:\`)** seamlessly integrated with the existing NKB Cloud v2.1.0 backend.

The implementation strictly adheres to the core rules:
1. **Additive Only**: Zero breaking changes to existing `/api/*` endpoints, database tables, or web UI.
2. **Native Windows Integration**: Mounted as `NKB Drive (N:)` under *This PC* with real-time hybrid synchronization (Online-Only, Available Offline, Sync Pending).
3. **Enterprise DLP & Security**: Token storage via Windows DPAPI, clipboard anti-exfiltration for outside-company networks, and automatic conflict copy generation.

---

## 2. Implementation Work Breakdown Structure (WBS)

```
Phase 4 Implementation
├── Milestone 4.1: Additive Backend Endpoints (/api/v1/drive/)
│   ├── 4.1.1: Device Registration & Revocation (devices table / sessions)
│   ├── 4.1.2: Cursor-Based Delta Change Feed (/api/v1/drive/changes)
│   ├── 4.1.3: Version Validation & Conflict Copy Forking
│   └── 4.1.4: Drive Hierarchical Tree Endpoint with Department Filtering
│
├── Milestone 4.2: Client Local Storage & Synchronization Engine
│   ├── 4.2.1: SQLite Local Database (Metadata Cache, Sync Queue, Chunk Index)
│   ├── 4.2.2: Windows DPAPI Secure Credential Vault (OAuth/JWT Storage)
│   ├── 4.2.3: Hybrid Sync Engine (Worker Thread with Exponential Backoff)
│   └── 4.2.4: Conflict Resolver & Fork Manager
│
├── Milestone 4.3: Virtual Filesystem & Windows Explorer Shell (N:\)
│   ├── 4.3.1: WinFsp User-Mode Filesystem Provider (WinFsp.Net / C# Bridge)
│   ├── 4.3.2: On-Demand Hydration (Online-Only placeholder files)
│   ├── 4.3.3: Pinning & Offline File Management
│   └── 4.3.4: Windows Shell Status Badges & Context Menus
│
├── Milestone 4.4: Desktop User Interface (WPF / C#)
│   ├── 4.4.1: Modern NKB Enterprise UI (Dark/Light NKB Branding)
│   ├── 4.4.2: 9 Core Screens: Login, Account, Dashboard, Queue, Offline, Storage, Device, Settings, Notifications
│   └── 4.4.3: Windows System Tray & Shell Notifications
│
└── Milestone 4.5: Enterprise Packaging & Installer (NKBDriveSetup.exe)
    ├── 4.5.1: Inno Setup / WiX Installer Configuration
    ├── 4.5.2: Bundled WinFsp Dependency Silent Installation
    ├── 4.5.3: Automatic Desktop & Start Menu Shortcuts
    └── 4.5.4: Uninstaller & Clean Teardown
```

---

## 3. Detailed Milestone Descriptions

### Milestone 4.1: Additive Backend Endpoints (`server/routes/drive.js`)
- Create new additive controller and router mounted at `/api/v1/drive/`.
- Endpoints:
  - `POST /api/v1/drive/devices/register`: Registers Windows client hostname, MAC, OS version.
  - `POST /api/v1/drive/devices/revoke`: Remote revocation by user or Super Admin.
  - `GET /api/v1/drive/changes`: Returns incremental change journal with `next_cursor`.
  - `POST /api/v1/drive/validate-version`: Prevents overwrite of concurrent edits.
  - `POST /api/v1/drive/conflict-copy`: Forks diverged files with `(NKB-Conflict-User-Date)` suffix.
  - `GET /api/v1/drive/tree`: Returns hierarchical department folder structure accessible to the user.
- **Safety**: Fully additive; existing `/api/auth`, `/api/files`, `/api/shares` remain untouched.

### Milestone 4.2: Client Local Engine & SQLite Metadata Cache
- Implement `NkbDriveEngine.dll`:
  - SQLite tables: `local_files`, `sync_queue`, `sync_cursor`, `offline_pins`.
  - `WindowsDataProtection`: Uses `ProtectedData.Protect` (DPAPI) to encrypt bearer tokens and device IDs per Windows user profile.
  - Background synchronization thread polling `/api/v1/drive/changes` with adaptive polling (15s idle, 2s active).

### Milestone 4.3: Virtual Filesystem Bridge (`N:\`)
- Implement `NkbFileSystem`:
  - Mounts drive `N:` using WinFsp user-mode callbacks.
  - Intercepts `CreateFile`, `ReadFile`, `WriteFile`, `MoveFile`, `SetInformation`.
  - Supports sparse placeholder files for Online-Only files (0 bytes on disk until opened).
  - Background downloader transparently streams content into local cache when opened by user.

### Milestone 4.4: Modern WPF Desktop UI & System Tray
- Enterprise WPF UI matching NKB Cloud corporate styling:
  - Amber/Dark theme consistent with the NKB Cloud web application.
  - Real-time sync progress indicator (e.g. "Syncing 3 files • 12.4 MB/s").
  - System Tray notification icon with right-click menu: *Open NKB Drive*, *Pause Sync*, *Settings*, *Sign Out*, *Exit*.
  - DLP Banner indicating network status (Internal Corporate Network vs. External Network).

### Milestone 4.5: Installer (`NKBDriveSetup.exe`)
- Automated installer built with Inno Setup:
  - Detects architecture (x64) and Windows OS version (Win 10/11).
  - Automatically runs silent WinFsp prerequisite installer if not already present.
  - Installs client binaries to `%ProgramFiles%\NKB Cloud\NKB Drive`.
  - Registers startup service / system tray run key.
  - Produces standalone `NKBDriveSetup.exe`.

---

## 4. Execution Plan & Stage Gates

| Stage | Estimated Scope | Rollback Plan | Gate Condition |
| :--- | :--- | :--- | :--- |
| **Stage 4.1: Backend Additive Routes** | Add `/server/routes/drive.js` & register in `/server/server.js` | Revert one route import line in `server.js` | All existing web APIs and unit tests pass 100% |
| **Stage 4.2: Client Core & SQLite** | Build `NKB-Drive-Client/` C# project with SQLite & DPAPI | Delete isolated client directory | Local unit test suite passes |
| **Stage 4.3: Virtual Drive Mounting** | Integrate WinFsp file system provider with local engine | Dismount `N:` and remove definition | Explorer browsing, file edits, and offline caching verified |
| **Stage 4.4: Desktop WPF GUI** | Build WPF GUI and System Tray shell | Standalone executable | Complete UI interaction without crashes |
| **Stage 4.5: Installer Package** | Compile `NKBDriveSetup.exe` | Uninstall script cleans `%ProgramFiles%` and registry | Clean install and unmount on clean Windows test VM |

---

## 5. Execution Gate Notice

> [!IMPORTANT]
> **EXECUTION GATE ACTIVE**  
> In compliance with the user instruction:
> *"After completing Phase 2 and Phase 3, STOP. Do not begin production API modifications or database migrations. Wait for my explicit approval before proceeding to Phase 4."*
>
> All Phase 2 specifications and Phase 3 proof of concepts are complete and verified. No production code changes will take place until the user explicitly responds with authorization to begin Phase 4.
