# NKB CLOUD — DRIVE INTEGRATION COMPATIBILITY AUDIT (PHASE 1)
**Project:** NKB Drive Desktop Client (`N:\`) Integration  
**Document ID:** NKB-AUDIT-DRIVE-2026-PHASE1  
**Target Platform:** Windows 10 & Windows 11 (x64)  
**Host Application:** NKB Cloud Enterprise v2.1.0  
**Audit Status:** COMPLETE — READ-ONLY COMPLIANCE VERIFIED  
**Date of Audit:** November 11, 2026  

---

## EXECUTIVE SUMMARY

Pursuant to the **NKB Drive Integration Master Prompt**, this document constitutes the formal **Phase 1 Read-Only Architecture and Compatibility Audit** for integrating the native Windows desktop client **NKB Drive (`N:\`)** into the existing NKB Cloud ecosystem.

The audit was conducted strictly under read-only conditions: **no production code, database schemas, stored company files, or network services were modified**. The existing working state of NKB Cloud (including Admin Storage Control, Department Sharing, DLP Outside-Company enforcement, and the Agent Hub) remains 100% operational and untouched.

---

## 1. REPOSITORY STRUCTURE & INVENTORY

The NKB Cloud monorepo is structured cleanly with separated concerns:

```
J:\IT STAFF\PROGRAM FILES\NKB Cloud\
├── client/                     # React 19 Frontend Web Application (Vite 6, TailwindCSS)
│   ├── src/                    # UI Components, Pages, State, and API client
│   ├── dist/                   # Production compiled SPA bundle (index.html, assets)
│   └── package.json            # Client dependencies (Axios, Lucide-React, React-Router)
├── server/                     # Node.js 26 ESM Enterprise REST API & WSS AgentHub
│   ├── config/                 # Database pool (pg) and JWT configuration
│   ├── controllers/            # Controller endpoints (auth, file, storage, share, admin, device)
│   ├── middleware/             # auth.js (JWT + corporate IP check), maintenanceGate.js
│   ├── routes/                 # api.js (Centralized Express router)
│   ├── services/               # agentHub.js, authorizationService.js, deviceService.js
│   ├── db/migrations/          # SQL Schema migrations (001 through 007)
│   ├── server.js               # Entry point (Port 5000 HTTP + WebSocket Server)
│   └── package.json            # Server dependencies (Express, pg, bcryptjs, jsonwebtoken, ws)
├── storage-agent/              # Storage Daemon for local workstation physical disks
│   ├── src/                    # disk-detector.js, file-engine.js, agent-client.js
│   └── index.js                # Daemon connecting to ws://localhost:5000/ws/agent
├── docs/                       # Architectural, Security, DLP, and Acceptance reports
├── scripts/                    # Automation and deployment verification scripts
├── nginx/ & nginx.conf         # Production reverse proxy and TLS configuration
├── docker-compose.yml          # Containerized orchestration definition
└── scratch/                    # Test harnesses and temporary verification scripts
```

---

## 2. FRONTEND & BACKEND ARCHITECTURE

### 2.1 Backend Architecture
- **Runtime:** Node.js v26.13.0 LTS (ECMAScript Modules `type: "module"`).
- **Web Framework:** Express 4.x mounted with JSON body parser and Multer memory storage.
- **Database Engine:** PostgreSQL 16.15 (running on port `5433` locally, isolated test container `nkb_cloud_local_test`).
- **Communication Protocols:**
  - **HTTPS/REST:** Port `5000` (JSON REST API for web client and future desktop client).
  - **WSS (Secure WebSocket):** `/ws/agent` endpoint managed by `AgentHub` for physical disk discovery and remote streaming.
- **Concurrency & Stream Architecture:** HTTP 1.1 / 2 Chunked Range Streaming (`Accept-Ranges: bytes`, `206 Partial Content`) with 8MB bounded slices to protect memory.

### 2.2 Frontend Architecture
- **Framework:** React 19.x with Vite 6.4.x SPA bundling.
- **Styling:** TailwindCSS 3.4.x conforming to the NKB Enterprise Navy & Gold design system.
- **State Management:** React Context API (`AuthContext.jsx`) managing persistent user credentials and session tokens in `localStorage`.
- **Key Modules:**
  - `FileManagerView.jsx`: Main file explorer (My Drive, Shared Drives, Trash, Recent, Starred).
  - `DriveBrowserView.jsx`: Physical storage inspection and folder linking to My Drive.
  - `StorageManagementView.jsx`: Connect/Disconnect control of physical hardware partitions.
  - `ShareModal.jsx`: Department and specific employee account sharing controls.

---

## 3. AUTHENTICATION & AUTHORIZATION FLOW

### 3.1 Authentication Mechanism
- **Token Format:** Signed JSON Web Tokens (JWT) using `HS256` (`server/config/jwt.js`).
- **Payload Contents:**
  ```json
  {
    "id": "00000000-0000-0000-0000-000000000001",
    "email": "superadmin@nkbmanufacturing.local",
    "username": "superadmin",
    "role": "SUPER ADMIN",
    "sessionVersion": 1,
    "iat": 1794380000,
    "exp": 1794984800
  }
  ```
- **Session Revocation Guard:** Fail-closed `session_version` integer validation. If a user changes password or admin revokes their session, `session_version` increments in PostgreSQL; all existing JWTs become immediately invalid (`401 SESSION_REVOKED`).
- **Network Location Detection:**
  - `getClientIp(req)` inspects `x-forwarded-for` and socket addresses.
  - `isCorporateNetwork(ip)` verifies RFC 1918 private subnets (`10.0.0.0/8`, `172.16-31.0.0/12`, `192.168.0.0/16`) and loopback.
  - Requests originating from external public IPs are tagged `isOutsideCompany = true`, automatically enforcing clipboard and public link anti-exfiltration DLP restrictions.

### 3.2 Authorization & Recursive CTE Permissions
Centralized in [`server/services/authorizationService.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/authorizationService.js):
- **Permission Ranks:**
  1. `VIEWER` (Rank 1): Preview metadata and authorized text/images.
  2. `DOWNLOADER` (Rank 2): Preview and stream/download binary payload.
  3. `CONTRIBUTOR` (Rank 3): Read, download, upload files, paste files, and create subdirectories.
  4. `EDITOR` (Rank 4): Full modification, rename, move, and trash rights.
- **Recursive CTE Inheritance:** Permissions granted on an ancestor folder propagate automatically to all descendant subfolders and files with depth guard `< 25`.
- **Universal Super Admin:** Super Admin role bypasses tenancy restrictions for disaster recovery and system maintenance.

---

## 4. EXISTING FILE STORAGE LOCATIONS & PLACEMENT

- **Physical Storage Decoupling:** Files in NKB Cloud are not saved to arbitrary random local folders. Every file is mapped to an explicitly connected physical volume registered in `storage_volumes`:
  - `storage_volume_id`: UUID pointing to the underlying physical partition (e.g. `J:\`, `D:\`).
  - `relative_path`: Cleaned, sanitized path relative to the physical drive root.
- **Placement Policies:** Controlled via `storage_placement_policy` in `system_settings`:
  - `PRIORITY_POOL` (Default): Automatically assigns files to the connected online volume with the highest priority and adequate free bytes.
  - `DEFAULT_DRIVE`: Directs uploads to the designated default volume.
  - `FOLDER_INHERITED`: If a root folder has an assigned `preferred_volume_id`, all files created within that folder automatically target that specific physical volume.
- **Multi-Part Chunk Storage:** Large files are streamed into 5MB chunks via `/files/upload/:sessionId/chunk` and assembled into physical storage upon `/files/upload/:sessionId/finalize`.

---

## 5. EXISTING DATABASE SCHEMA AUDIT

The database comprises 42 relational tables in PostgreSQL:

| Table Name | Primary Keys / Key Columns | Purpose for NKB Drive Integration |
|---|---|---|
| `users` | `id` (UUID), `email`, `session_version`, `status` | Identity authentication and session invalidation |
| `departments` | `id` (INT), `name`, `code` | Department-level folder visibility |
| `folders` | `id` (UUID), `name`, `parent_id`, `owner_id`, `preferred_volume_id` | Directory tree hierarchy mapped to `N:\` |
| `files` | `id` (UUID), `name`, `folder_id`, `size_bytes`, `sha256_hash`, `relative_path`, `storage_volume_id` | File metadata, sizes, and content verification |
| `file_shares` | `id` (UUID), `folder_id`, `file_id`, `shared_with_user_id`, `shared_with_department_id`, `permission_level` | Access control checking for `N:\` Explorer requests |
| `storage_volumes` | `id` (UUID), `current_drive_letter`, `status`, `assigned_name` | Physical backend drive status (`ONLINE` vs `DISCONNECTED`) |
| `audit_logs` | `id` (BIGINT), `action`, `user_id`, `ip_address`, `details` | Tamper-evident logging of all desktop sync operations |
| `upload_sessions` | `id` (UUID), `user_id`, `total_size_bytes`, `expected_sha256`, `status` | Resumable chunked upload tracking |

---

## 6. EXISTING FILE APIS & REUSABILITY MATRIX

| Existing Route | Method | Reusable for NKB Drive? | Integration Role |
|---|---|---|---|
| `/api/auth/login` | `POST` | **YES (Direct)** | Authenticate user credentials from WPF login screen |
| `/api/auth/me` | `GET` | **YES (Direct)** | Validate active session token, quota, and location |
| `/api/files` | `GET` | **YES (Direct)** | List directories and files for any `folderId` |
| `/api/files/folder` | `POST` | **YES (Direct)** | Create directory when user creates folder in `N:\` |
| `/api/files/upload/initiate` | `POST` | **YES (Direct)** | Start multi-part resumable upload from desktop sync |
| `/api/files/upload/:id/chunk` | `POST` | **YES (Direct)** | Send binary chunks with SHA-256 validation |
| `/api/files/upload/:id/finalize` | `POST` | **YES (Direct)** | Finalize and verify uploaded desktop file |
| `/api/files/:id/download` | `GET` | **YES (Direct)** | Stream on-demand file bytes to Windows cache |
| `/api/files/:id/rename` | `PUT` | **YES (Direct)** | Handle Windows Explorer rename operations |
| `/api/files/:id/move` | `PUT` | **YES (Direct)** | Handle Windows Explorer cut/move operations |
| `/api/files/:id/trash` | `POST` | **YES (Direct)** | Handle Windows Explorer delete (routes to Cloud Recycle Bin) |

---

## 7. REQUIRED INTEGRATION ADDITIONS

While existing endpoints cover standard CRUD, desktop filesystem synchronization requires optimized change-tracking and device management to avoid inefficient polling.

### 7.1 Proposed Namespace: `/api/v1/drive/`
All additions will be strictly additive under `/api/v1/drive/` without touching `/api/files`:

1. `POST /api/v1/drive/devices/register`
   - Registers the Windows workstation (Machine Name, OS Version, Client Version) and associates it with the authenticated employee.
2. `GET /api/v1/drive/changes`
   - Parameters: `?since=<ISO_TIMESTAMP>&cursor=<CURSOR>`
   - Returns a lightweight delta journal (created, updated, trashed, renamed) so NKB Drive can synchronize changes in milliseconds without re-scanning thousands of folders.
3. `POST /api/v1/drive/files/conflict-copy`
   - Creates a fork copy (e.g. `Document (Conflict - Juan-PC 2026-11-11).docx`) when concurrent offline edits collide.
4. `GET /api/v1/drive/tree`
   - Returns the complete user-authorized folder hierarchy in a single compact JSON call for instant initial mount of `N:\`.

---

## 8. POTENTIAL COMPATIBILITY & TECHNICAL ISSUES

### 8.1 Filesystem Driver Selection: WinFsp vs Cloud Filter API (cfapi)
- **WinFsp (Windows File System Proxy):**
  - **Pros:** Highly mature, supports user-mode filesystem driver in C# via `WinFsp.Net`, works identically on Windows 10 and 11, allows mounting arbitrary drive letters (like `N:\`) without requiring Microsoft kernel-mode signing.
  - **Licensing:** GPLv3 with a FOSS Exception. Compatible with internal enterprise deployment.
- **Windows Cloud Filter API (`cfapi` / Projected File System):**
  - **Pros:** Built into modern Windows; supports native sync root status icons in File Explorer.
  - **Cons:** Bounded to NTFS local folder sync roots (e.g., `C:\Users\<User>\NKB Drive`) rather than a dedicated root drive letter `N:\` without custom virtual disk mount wrappers.
- **Recommendation:** Implement **WinFsp.Net** with a companion Windows Background Service to mount `N:\` directly as requested.

### 8.2 Windows Drive Letter Collision
- If `N:\` is already in use by a mapped network drive, USB flash disk, or corporate share, NKB Drive must:
  1. Detect the collision during pre-flight check.
  2. Offer the user an option to select an alternative letter (e.g., `K:\`, `O:\`) or prompt to remap.
  3. Never silently dismount or take over an existing drive letter.

### 8.3 Long Paths & Windows Reserved Characters
- Windows disallows characters: `< > : " / \ | ? *` and reserved names (`CON`, `PRN`, `AUX`, `NUL`).
- NKB Drive client sanitization layer must validate and map illegal characters before presenting them to Windows File Explorer or transmitting them to PostgreSQL.

---

## 9. SECURITY & DATA-LOSS RISKS ANALYSIS

| Risk Category | Identified Hazard | Mitigation Strategy |
|---|---|---|
| **Data Exfiltration** | Copying files from `N:\` to local unapproved media when outside company network | Integrate existing corporate IP check (`isOutsideCompany`); enforce Read-Only or watermark policy when remote. |
| **Credential Theft** | Storing JWT tokens in plaintext configuration files | Store all tokens and device credentials using **Windows Data Protection API (DPAPI)** or **Windows Credential Manager**. |
| **Silent Overwrite** | Concurrent edits by Web user and Desktop user overwriting data | Enforce optimistic locking via `updated_at` and SHA-256 hashing. If server hash differs from base, create a conflict copy. |
| **Unintended Purge** | Local cache eviction causing file deletion on server | Cache management is strictly decoupled from server records: deleting a local temporary cache file **never** issues a cloud delete request. Cloud deletion is only triggered by explicit Explorer user delete actions. |
| **Offline Inconsistency** | User modifies files while offline, then terminates app before sync | Local modifications are recorded in an ACID-compliant local SQLite journal (`pending_sync_queue`) which persists across app restarts and computer reboots. |

---

## 10. RECOMMENDED IMPLEMENTATION PLAN

Following the Master Prompt's 12-phase workflow:

```
[Phase 1: Compatibility Audit]  <-- COMPLETED (This Document)
       │
       ▼ (Awaiting Explicit Approval)
[Phase 2: API Specification & Delta Endpoint Design (/api/v1/drive/)]
       │
[Phase 3: Windows Filesystem Proof-of-Concept (WinFsp N:\ Mount)]
       │
[Phase 4: C# .NET WPF Shell & DPAPI Authentication]
       │
[Phase 5: File Explorer Tree & Metadata Listing in N:\]
       │
[Phase 6: On-Demand Hydration (Download) & Resumable Streaming Upload]
       │
[Phase 7: Hybrid Sync Engine (Online-Only vs Offline-Pinned vs Sync-Pending)]
       │
[Phase 8: Conflict Detection, Fork Resolution, and Lock Safety]
       │
[Phase 9: Professional WPF UI, Storage Metrics & System Tray Control]
       │
[Phase 10: InnoSetup / WiX Installer (NKBDriveSetup.exe) Packaging]
       │
[Phase 11: End-to-End Regression, DLP, and Data Integrity Testing]
       │
[Phase 12: Production Go-Live Runbook & Acceptance Package]
```

---

## 11. AUDIT CONCLUSION & NEXT ACTION

NKB Cloud's backend and database architecture are **fully compatible** with native Windows Desktop Drive integration. The existing clean separation between physical storage volumes, folder hierarchies, and chunked upload pipelines allows the desktop client to connect directly with **zero disruption to existing users and zero modifications to existing database tables**.

> [!IMPORTANT]
> **GATE KEEPER RULE IN EFFECT:**
> In strict compliance with **Phase 1 Execution Rules**, no code modifications have been made.
> We are standing by for your explicit authorization before proceeding to **PHASE 2 & PHASE 3**.
