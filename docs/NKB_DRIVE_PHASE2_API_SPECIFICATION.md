# NKB DRIVE — PHASE 2 API SPECIFICATION & INTEGRATION DESIGN
**Project:** NKB Drive Native Desktop Client (`N:\`)  
**Specification Version:** 1.0.0 (Target: NKB Cloud v2.1.0)  
**Document ID:** NKB-DRIVE-SPEC-PHASE2  
**Date:** November 11, 2026  
**Status:** DRAFT SPECIFICATION — PHASE 2 APPROVED  

---

## 1. ARCHITECTURAL OVERVIEW & DESIGN PRINCIPLES

The NKB Drive desktop client operates as a Windows native filesystem proxy (`N:\`) that interfaces directly with the central NKB Cloud backend. The integration follows four strict architectural tenets:

1. **Zero Breaking Changes:** All existing web application endpoints, mobile app endpoints, and database models are preserved without modification.
2. **Maximum Route Reuse:** Standard file reading, chunked uploads, downloading, trashing, and authentication directly reuse existing validated `/api/*` endpoints.
3. **Dedicated Sync Optimization (`/api/v1/drive/`):** High-frequency desktop synchronization needs (change journals, device registration, optimistic conflict detection, and fast tree hydration) are housed under a strictly additive namespace.
4. **Fail-Closed Security & DLP Integrity:** Every desktop call passes through existing JWT validation, `session_version` revocation checks, recursive CTE folder authorization, and external network DLP copy restrictions.

```
┌────────────────────────────────────────────────────────┐
│             Windows 10 / 11 Workstation                │
│                                                        │
│  [Windows File Explorer]  <──>  [WinFsp N:\ Virtual]   │
│                                         │              │
│                                         ▼              │
│                             [NKB Drive Background]     │
│                             [Service & Local Sync]     │
│                             [SQLite Cache & DPAPI]     │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTPS (TLS 1.3)
                           ▼
┌────────────────────────────────────────────────────────┐
│             NKB Cloud Backend (Node.js 26)             │
│                                                        │
│  Existing Core APIs:          New Sync Additions:      │
│  - /api/auth/*                - /api/v1/drive/devices  │
│  - /api/files/*               - /api/v1/drive/changes  │
│  - /api/shares/*              - /api/v1/drive/conflict │
│                               - /api/v1/drive/tree     │
│                                                        │
│  [Recursive CTE Authorization] [DLP Location Engine]   │
│  [Session Version Guard]      [Physical Disk Hub]      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│            PostgreSQL 16 & Physical Volumes            │
└────────────────────────────────────────────────────────┘
```

---

## 2. EXISTING REUSABLE API MATRIX

The desktop client directly reuses the following core NKB Cloud endpoints without code modifications:

| Endpoint | Method | Desktop Client Usage | Request Payload / Params | Response |
|---|---|---|---|---|
| `/api/auth/login` | `POST` | User sign-in from WPF dialog | `{ identifier, password }` | `{ token, user }` (Token saved via DPAPI) |
| `/api/auth/me` | `GET` | Session health check & location detection | Header: `Authorization: Bearer <token>` | `{ user: { storageQuotaBytes, isOutsideCompany } }` |
| `/api/files` | `GET` | Folder item listing | `?folderId=<UUID>&view=my-drive` | `{ folders: [...], files: [...], breadcrumbs: [...] }` |
| `/api/files/folder` | `POST` | Folder creation in `N:\` | `{ name, parentId }` | `{ message, folder: { id, name, parent_id } }` |
| `/api/files/upload/initiate`| `POST` | Start chunked upload | `{ fileName, totalSizeBytes, totalChunks, folderId }` | `{ sessionId, targetVolume }` |
| `/api/files/upload/:id/chunk`| `POST`| Stream 5MB binary chunks | Multi-part Form: `chunk`, `chunkIndex` | `{ message: "Chunk accepted", sha256 }` |
| `/api/files/upload/:id/finalize`| `POST`| Finalize file and commit | `{ expectedSha256 }` | `{ message: "Upload completed", file }` |
| `/api/files/:id/download` | `GET` | Stream file content / on-demand hydration | Query `?token=<token>` or Auth Header; HTTP `Range: bytes=start-end` | Binary file stream (`200 OK` or `206 Partial Content`) |
| `/api/files/:id/rename` | `PUT` | Rename file/folder from Explorer | `{ newName, itemType }` | `{ message: "Item renamed" }` |
| `/api/files/:id/move` | `PUT` | Move / cut-paste in `N:\` | `{ targetFolderId, itemType }` | `{ message: "Item moved" }` |
| `/api/files/:id/trash` | `POST` | Safe delete to Cloud Recycle Bin | `{ itemType }` | `{ message: "Item moved to recycle bin" }` |

---

## 3. ADDITIVE DESKTOP SYNC NAMESPACE: `/api/v1/drive/`

All endpoints below are additive and protected by `authenticateToken`.

### 3.1 Device Registration & Credential Binding
- **Endpoint:** `POST /api/v1/drive/devices/register`
- **Purpose:** Registers the Windows workstation hardware instance with the employee account.
- **Request Headers:**
  - `Authorization: Bearer <jwt_token>`
  - `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "machineName": "DESKTOP-EARL-IT",
    "osVersion": "Microsoft Windows 11 Enterprise 10.0.26100",
    "clientVersion": "2.1.0",
    "hardwareFingerprint": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "targetDriveLetter": "N:"
  }
  ```
- **Response (`201 Created`):**
  ```json
  {
    "success": true,
    "device": {
      "id": "7f8b3c90-9f5b-4351-b847-f41e97664321",
      "userId": "00000000-0000-0000-0000-000000000001",
      "machineName": "DESKTOP-EARL-IT",
      "targetDriveLetter": "N:",
      "approvalStatus": "APPROVED",
      "syncEnabled": true,
      "registeredAt": "2026-11-11T07:55:00.000Z"
    }
  }
  ```

### 3.2 Device Revocation
- **Endpoint:** `POST /api/v1/drive/devices/revoke`
- **Purpose:** Revokes client authorization. If a device is revoked or marked lost/stolen, desktop sync immediately halts and purges local encryption keys.
- **Request Body:**
  ```json
  {
    "deviceId": "7f8b3c90-9f5b-4351-b847-f41e97664321",
    "reason": "Decommissioned workstation"
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Device revoked successfully. Cloud access severed."
  }
  ```

### 3.3 Incremental Change Journal (Delta Synchronization)
- **Endpoint:** `GET /api/v1/drive/changes`
- **Purpose:** Allows NKB Drive to poll or query incremental changes (created, edited, deleted, moved, renamed) without traversing the entire filesystem tree.
- **Query Parameters:**
  - `since`: ISO timestamp (e.g. `2026-11-11T07:00:00.000Z`).
  - `cursor`: Integer event sequence ID.
  - `limit`: Maximum events per page (Default: `100`, Max: `500`).
- **Response (`200 OK`):**
  ```json
  {
    "cursor": 4092,
    "nextCursor": 4120,
    "hasMore": false,
    "serverTime": "2026-11-11T07:55:10.000Z",
    "changes": [
      {
        "eventId": 4093,
        "eventType": "FILE_CREATED",
        "entityId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "folderId": "88a0f96a-2447-438a-846e-44a8b9d77058",
        "name": "Q4_Audit_Spec.xlsx",
        "sizeBytes": 2048576,
        "sha256": "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
        "updatedAt": "2026-11-11T07:52:00.000Z"
      },
      {
        "eventId": 4094,
        "eventType": "FILE_RENAMED",
        "entityId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
        "oldName": "Draft_CAD.dwg",
        "newName": "Final_Approved_CAD.dwg",
        "updatedAt": "2026-11-11T07:53:15.000Z"
      },
      {
        "eventId": 4095,
        "eventType": "ITEM_TRASHED",
        "entityType": "FILE",
        "entityId": "c3d4e5f6-a7b8-9012-cdef-123456789012",
        "updatedAt": "2026-11-11T07:54:00.000Z"
      }
    ]
  }
  ```

### 3.4 Optimistic Version Validation & Pre-Commit Check
- **Endpoint:** `POST /api/v1/drive/files/validate-version`
- **Purpose:** Prevents silent overwriting when multiple employees edit files or when local offline edits reconnect.
- **Request Body:**
  ```json
  {
    "fileId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "baseSha256": "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
    "baseUpdatedAt": "2026-11-11T07:52:00.000Z",
    "proposedSizeBytes": 2097152
  }
  ```
- **Responses:**
  - **`200 OK` (Status: CURRENT):**
    ```json
    { "status": "CURRENT", "canCommit": true }
    ```
  - **`409 Conflict` (Status: CONFLICT):**
    ```json
    {
      "status": "CONFLICT",
      "canCommit": false,
      "serverSha256": "8f3b2100aa...",
      "serverUpdatedAt": "2026-11-11T07:54:30.000Z",
      "serverUpdatedBy": "Juan Dela Cruz",
      "message": "File has been modified on server since your last sync."
    }
    ```

### 3.5 Conflict Copy Generation
- **Endpoint:** `POST /api/v1/drive/files/conflict-copy`
- **Purpose:** When a conflict is detected, this automatically forks the local changes into a dedicated conflict file (e.g., `Specs (Conflict - DESKTOP-EARL-IT 2026-11-11).xlsx`), ensuring neither version is ever lost.
- **Request Body:**
  ```json
  {
    "originalFileId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "conflictFileName": "Q4_Audit_Spec (Conflict - DESKTOP-EARL 2026-11-11).xlsx",
    "sizeBytes": 2097152,
    "sha256": "9a8b7c6d..."
  }
  ```
- **Response (`201 Created`):**
  ```json
  {
    "conflictFile": {
      "id": "e5f6a7b8-c9d0-1234-5678-90abcdef1234",
      "name": "Q4_Audit_Spec (Conflict - DESKTOP-EARL 2026-11-11).xlsx",
      "folderId": "88a0f96a-2447-438a-846e-44a8b9d77058"
    },
    "uploadSession": {
      "sessionId": "f6a7b8c9-d0e1-2345-6789-0abcdef12345"
    }
  }
  ```

### 3.6 Fast Full Hierarchy Hydration (Initial Mount Tree)
- **Endpoint:** `GET /api/v1/drive/tree`
- **Purpose:** Returns the complete authorized directory tree in a single compact JSON structure so WinFsp can mount `N:\` instantly without issuing hundreds of HTTP calls.
- **Response (`200 OK`):**
  ```json
  {
    "rootFolders": [
      {
        "id": "88a0f96a-2447-438a-846e-44a8b9d77058",
        "name": "Engineering Specifications",
        "permission": "READ_WRITE",
        "subfolders": [
          {
            "id": "11223344-5566-7788-99aa-bbccddeeff00",
            "name": "CAD Models",
            "permission": "READ_WRITE"
          }
        ]
      }
    ],
    "volumeStatus": "ONLINE",
    "timestamp": "2026-11-11T07:55:00.000Z"
  }
  ```

---

## 4. ERROR HANDLING & RETRY SPECIFICATION

The desktop client implements resilient, deterministic error handling:

| HTTP Status | Error Code | Meaning | Client Action |
|---|---|---|---|
| `401 Unauthorized` | `SESSION_REVOKED` | User password changed or session revoked | Prompt user to log in again; pause sync operations. |
| `401 Unauthorized` | `TOKEN_EXPIRED` | JWT access token expired | Refresh token or re-authenticate. |
| `403 Forbidden` | `INSUFFICIENT_PERMISSIONS` | Folder is Read-Only | Reject write/delete operations in `N:\`; notify user via balloon notification. |
| `403 Forbidden` | `DLP_OUTSIDE_RESTRICTED` | External network detected | Prevent copy/export operations; permit read/write/paste. |
| `404 Not Found` | `FILE_NOT_FOUND` | File was deleted on server | Mark file as deleted locally in SQLite cache; unmount virtual node. |
| `409 Conflict` | `VERSION_CONFLICT` | Server file is newer than local edit | Initiate `POST /api/v1/drive/files/conflict-copy`; notify user. |
| `503 Unavailable` | `STORAGE_OFFLINE` | Physical volume disconnected | Do not delete local cache. Mark node as "Unavailable (Offline Drive)". |
| `5xx / Network` | `NETWORK_FAILURE` | Connection dropped / server timeout | Queue operation in SQLite. Retry with exponential backoff (1s, 2s, 4s, 8s, max 30s) + jitter. |

---

## 5. MISSING CAPABILITIES ASSESSMENT BEFORE PHASE 4

Prior to implementing Phase 4, the following minor database support objects will be staged:
1. `nkb_drive_devices`: Additive table to record registered Windows workstations, machine names, and last sync timestamps.
2. `drive_change_journal`: PostgreSQL table or trigger-fed queue populated on file/folder operations to serve `/api/v1/drive/changes` with sub-millisecond query latency.
3. No existing tables will be dropped, modified, or truncated.
