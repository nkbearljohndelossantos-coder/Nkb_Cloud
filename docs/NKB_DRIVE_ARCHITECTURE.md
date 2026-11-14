# NKB DRIVE — ENTERPRISE ARCHITECTURE SPECIFICATION
## Native Windows Virtual Drive Extension of NKB Cloud v2.1.0

**Document Version:** 1.0.0  
**Target:** Windows 10 & Windows 11 x64  
**Host Application:** Existing NKB Cloud Enterprise v2.1.0  
**Virtual Drive Letter:** `N:\`  
**Display Label:** `NKB Drive`  
**Architecture Policy:** **100% Self-Hosted — NO SUPABASE / NO FIREBASE**

---

## 1. Architectural Mission & Tenets

**NKB Drive** operates as a native Windows desktop extension of the existing, self-hosted NKB Cloud Enterprise platform. It provides employees with seamless, Google Drive for Desktop-like access through Windows File Explorer under **This PC**, interacting directly with company storage without altering existing systems.

### Core Architectural Mandates:
1. **ONE NKB CLOUD — NO SUPABASE:**
   - Central PostgreSQL 16 remains the authoritative database.
   - Node.js 26 / Express remains the authoritative backend.
   - Physical storage volumes (`C:`, `D:`, `G:`, `J:`) and Storage Agent policies remain the authoritative file repositories.
   - Zero external cloud services (Supabase, Firebase, AWS S3) are introduced.
2. **GENUINE WINFSP FILESYSTEM DRIVER:**
   - Mounts as a true virtual storage device (`\Device\Volume{UUID}`) through the user-mode filesystem driver `WinFsp.Net` (`Fsp.FileSystemBase`).
   - Zero reliance on `SUBST`, `DefineDosDevice`, simple network shares, or Explorer shortcuts.
3. **HYBRID THREE-STATE SYNCHRONIZATION:**
   - **ONLINE-ONLY:** Lightweight metadata visible in File Explorer; file contents stream on-demand transparently when opened.
   - **OFFLINE-PINNED:** Files explicitly selected for offline access are verified, cached locally, and retained permanently without network access.
   - **SYNC-PENDING:** Offline creations, edits, renames, and deletions persist transactionally in local SQLite and resume immediately upon connectivity.
4. **FAIL-CLOSED DATA PROTECTION & ZERO OVERWRITE:**
   - Version validation prevents concurrent edit overwrites. Divergent edits automatically fork into `(Conflict - Machine Date)` copies.
   - Local cache eviction is strictly isolated from cloud deletion: clearing local space NEVER issues cloud trash requests.

---

## 2. High-Level Architectural Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WINDOWS WORKSTATION                             │
│                                                                        │
│   [Windows File Explorer]  <───>  [WinFsp User-Mode Filesystem (N:\)]  │
│                                                   │                    │
│                                                   ▼                    │
│                                     [NKB Drive WPF Desktop Client]     │
│                                     - MVVM Amber/Navy UI               │
│                                     - System Tray Shell                │
│                                                   │                    │
│                                 ┌─────────────────┴─────────────────┐  │
│                                 │                                   │  │
│                                 ▼                                   ▼  │
│                      [Native SQLite Engine]               [Windows DPAPI Vault]
│                      (C:\Windows\System32\winsqlite3.dll) (CurrentUser Scope)  │
│                      - local_files                        - Access Token       │
│                      - sync_queue                         - Device ID          │
│                      - sync_cursor                        - Machine Entropy    │
│                      - local_cache                        - Zero-Wipe Purge    │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │
                                  │ HTTPS (TLS 1.3) / Mutual Ed25519 Auth
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     NKB CLOUD ENTERPRISE BACKEND                       │
│                                                                        │
│   Existing Core APIs:               Additive Sync Namespace:           │
│   - POST /api/auth/login            - POST /api/v1/drive/devices/reg   │
│   - GET  /api/auth/me               - POST /api/v1/drive/devices/appr  │
│   - GET  /api/files                 - POST /api/v1/drive/devices/revo  │
│   - POST /api/files/folder          - GET  /api/v1/drive/changes       │
│   - POST /api/files/upload/init     - POST /api/v1/drive/files/val-ver │
│   - POST /api/files/upload/chunk    - POST /api/v1/drive/files/conf-cp │
│   - GET  /api/files/download        - GET  /api/v1/drive/tree          │
│                                                                        │
│   [Recursive CTE Authorization]    [Session Version Guard]             │
│   [DLP Network Locality Engine]    [Universal Maintenance Gate]        │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│               CENTRAL STORAGE & RELATIONAL DATABASE                    │
│                                                                        │
│   PostgreSQL 16 Engine              Physical Storage Volume Array      │
│   - users & departments             - Volume D: (General Storage)      │
│   - files & folders                 - Volume J: (NVMe High-Speed)      │
│   - file_shares & permissions       - Volume G: (Production Code)      │
│   - audit_logs (Immutable Chain)    - Storage Agent (Ed25519 Signed)   │
│   - nkb_drive_devices (Additive)                                       │
│   - drive_change_journal (Additive)                                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack Reference

| Layer | Component | Specification | License / Terms |
| :--- | :--- | :--- | :--- |
| **Operating System** | Target Host | Windows 10 (1809+) & Windows 11 x64 | Standard Windows OS |
| **Virtual Filesystem** | Kernel-to-User Bridge | WinFsp 2.1 (`winfsp-x64.sys` + `winfsp-msil.dll`) | GPLv3 with Special FOSS Exception |
| **Desktop Shell** | UI & System Tray | C# / WPF (.NET 10 / 4.8 LTS), MVVM Pattern | Enterprise In-House |
| **Local Storage** | Metadata & Queue | Native `winsqlite3.dll` (`System32`) | Public Domain (Built into Windows) |
| **Credential Storage**| Secret Protection | Windows DPAPI (`DataProtectionScope.CurrentUser`) | Native Windows Cryptography |
| **Central Backend** | REST API & WS Server | Node.js 26 LTS / Express | MIT License |
| **Central Database** | Relational Engine | PostgreSQL 16.x Alpine | PostgreSQL Open Source License |
| **Physical Storage** | Storage Management | Storage Agent Daemon + CIM Drive Discovery | Enterprise Proprietary |
| **Installer** | Setup Executable | Inno Setup 6 (`NKBDriveSetup.exe`) | Inno Setup Open Source |
