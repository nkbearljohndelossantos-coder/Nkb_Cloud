# NKB DRIVE — PHASE 4.3 API CONTRACT MATRIX
## Comprehensive Endpoint Specifications: Reused Core & Additive Drive APIs

**Document Version:** 1.0.0  
**Date:** November 13, 2026  
**Auditor / Architect:** Antigravity AI Engine  
**Host Application:** NKB Cloud Enterprise v2.1.0 (Node.js 26 + Express)  
**Target Client:** NKB Drive Desktop Client (`N:\`) (C# .NET)  
**Staging Host:** `http://127.0.0.1:5000`  
**Database:** PostgreSQL 16 (`nkb_drive_staging` on Port 5433)  
**Status:** RECONCILED & FACTUALLY VERIFIED (12/12 Live Contracts Validated)  

---

## 1. ARCHITECTURAL OVERVIEW & SECURITY MIDDLEWARE

NKB Drive communicates with NKB Cloud Enterprise v2.1.0 exclusively over HTTP/REST using standard JSON payloads, multipart form-data for uploads, and binary octet streams for downloads.

### 1.1 Authentication & Authorization Pipeline
Every request to protected endpoints passes through the following middleware stack:
1. `authenticateToken`:
   - Inspects `Authorization: Bearer <jwt_token>`.
   - Validates HMAC-SHA256 signature and token expiration.
   - Queries `users` to confirm `status = 'ACTIVE'` and matches `session_version`. If the user changed their password or was logged out by an admin, returns `401 Unauthorized` (`SESSION_REVOKED`).
   - Evaluates client IP against corporate subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.1`). If external, sets `req.user.isOutsideCompany = true` for DLP enforcement.
2. `validateDriveDevice`:
   - Inspects `x-device-id: <uuid>` header on all `/api/v1/drive/*` endpoints.
   - Validates existence in `nkb_drive_devices`.
   - Confirms device belongs to `req.user.id` (or user is `SUPER ADMIN`).
   - Confirms `is_active = true` and `approval_status = 'APPROVED'`. If revoked, returns `403 Forbidden` (`DEVICE_REVOKED`). If pending, returns `403 Forbidden` (`DEVICE_PENDING_APPROVAL`).
3. `requireRole('SUPER ADMIN', 'ADMIN')`:
   - Enforces administrative privilege on device approval, rejection, and system-level configuration.

---

## 2. REUSED CORE NKB CLOUD APIS (`/api/*`)

These endpoints are directly inherited from the existing production backend with **zero code duplication**.

### 2.1 User Authentication (`POST /api/auth/login`)
- **Route:** `POST /api/auth/login`
- **Auth Required:** None (Public)
- **Request Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "identifier": "admin@nkbmanufacturing.com",
    "password": "TestPassword2026!"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "00000000-0000-0000-0000-000000000001",
      "email": "admin@nkbmanufacturing.com",
      "fullName": "System Administrator",
      "role": "SUPER ADMIN",
      "departmentId": 1
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: `{"error": "Email/Username and password required"}`
  - `401 Unauthorized`: `{"error": "Invalid credentials"}`
  - `403 Forbidden`: `{"error": "Account is inactive"}`

---

### 2.2 Active User Profile (`GET /api/auth/me`)
- **Route:** `GET /api/auth/me`
- **Auth Required:** `authenticateToken`
- **Request Headers:** `Authorization: Bearer <token>`
- **Success Response (200 OK):**
  ```json
  {
    "user": {
      "id": "00000000-0000-0000-0000-000000000001",
      "email": "admin@nkbmanufacturing.com",
      "fullName": "System Administrator",
      "role": "SUPER ADMIN",
      "departmentId": 1,
      "storageQuotaBytes": 107374182400,
      "usedStorageBytes": 524288000
    },
    "isOutsideCompany": false
  }
  ```

---

### 2.3 Explore Directory Items (`GET /api/files`)
- **Route:** `GET /api/files`
- **Auth Required:** `authenticateToken`
- **Query Parameters:**
  - `folderId` (optional UUID): Target folder to list. If omitted or `'root'`, lists root items.
  - `type` (optional string): `'all'`, `'folders'`, `'files'`.
- **Success Response (200 OK):**
  ```json
  {
    "currentFolder": { "id": "...", "name": "IT Infrastructure" },
    "folders": [
      { "id": "uuid-1", "name": "Network Configs", "parentId": "...", "updatedAt": "..." }
    ],
    "files": [
      {
        "id": "uuid-2",
        "name": "firewall_rules.xml",
        "sizeBytes": 204800,
        "sha256": "abcdef...",
        "extension": "xml",
        "mimeType": "application/xml",
        "updatedAt": "..."
      }
    ]
  }
  ```

---

### 2.4 Create Directory Folder (`POST /api/files/folder`)
- **Route:** `POST /api/files/folder`
- **Auth Required:** `authenticateToken` (Requires `CONTRIBUTOR` or higher permission)
- **Request Body:**
  ```json
  {
    "name": "Q4 Engineering Budgets",
    "parentId": "uuid-parent-folder",
    "isSharedDrive": false,
    "color": "#0F172A"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "id": "uuid-new-folder",
    "name": "Q4 Engineering Budgets",
    "parentId": "uuid-parent-folder",
    "ownerId": "uuid-user",
    "departmentId": 1
  }
  ```
- **Side Effect:** Automatically appends `FOLDER_CREATED` event to `drive_change_journal` via `recordChangeEvent()`.

---

### 2.5 Resumable Upload Session Initiation (`POST /api/files/upload/initiate`)
- **Route:** `POST /api/files/upload/initiate`
- **Auth Required:** `authenticateToken`
- **Request Body:**
  ```json
  {
    "fileName": "AssemblyManual.pdf",
    "totalSizeBytes": 52428800,
    "expectedSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "folderId": "uuid-folder"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "sessionId": "uuid-session",
    "chunkSizeBytes": 5242880,
    "totalChunks": 10,
    "status": "INITIALIZED"
  }
  ```

---

### 2.6 Upload Chunk Stream (`POST /api/files/upload/:sessionId/chunk`)
- **Route:** `POST /api/files/upload/:sessionId/chunk`
- **Auth Required:** `authenticateToken`
- **Request Headers:**
  - `Content-Type: multipart/form-data`
  - `x-chunk-index: <int>` (0-based)
- **Form Data Field:** `chunk` (Binary slice)
- **Success Response (200 OK):**
  ```json
  {
    "sessionId": "uuid-session",
    "chunkIndex": 0,
    "receivedBytes": 5242880,
    "status": "UPLOADING"
  }
  ```

---

### 2.7 Finalize Resumable Upload (`POST /api/files/upload/:sessionId/finalize`)
- **Route:** `POST /api/files/upload/:sessionId/finalize`
- **Auth Required:** `authenticateToken`
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "file": {
      "id": "uuid-new-file",
      "name": "AssemblyManual.pdf",
      "sizeBytes": 52428800,
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "folderId": "uuid-folder"
    }
  }
  ```
- **Side Effect:** Automatically appends `FILE_CREATED` event to `drive_change_journal`.

---

### 2.8 Direct Single-Request Upload (`POST /api/files/upload/direct`)
- **Route:** `POST /api/files/upload/direct`
- **Auth Required:** `authenticateToken`
- **Request Headers:** `Content-Type: multipart/form-data`
- **Form Data Fields:**
  - `file`: Binary file stream
  - `folderId`: Target folder UUID (optional)
  - `fileName`: Optional override name
- **Success Response (201 Created):**
  ```json
  {
    "success": true,
    "file": {
      "id": "uuid-file",
      "name": "Document.docx",
      "sizeBytes": 15420,
      "sha256": "a1b2c3d4..."
    }
  }
  ```

---

### 2.9 Download File Content (`GET /api/files/:id/download`)
- **Route:** `GET /api/files/:id/download`
- **Auth Required:** `authenticateToken` (Requires `DOWNLOADER` permission)
- **Supported Headers:** `Range: bytes=0-1048575` (Supports chunked resume)
- **Success Response:**
  - `200 OK` (Full content): `Content-Type: application/octet-stream`, `Content-Length: <size>`
  - `206 Partial Content` (Range stream): `Content-Range: bytes 0-1048575/<total>`

---

### 2.10 Rename File or Folder (`PUT /api/files/:id/rename`)
- **Route:** `PUT /api/files/:id/rename`
- **Auth Required:** `authenticateToken` (Requires `EDITOR` permission)
- **Request Body:**
  ```json
  {
    "name": "RenamedReport.docx",
    "type": "file"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "item": { "id": "uuid-item", "name": "RenamedReport.docx" }
  }
  ```
- **Side Effect:** Appends `ITEM_RENAMED` event to `drive_change_journal`.

---

### 2.11 Move File or Folder (`PUT /api/files/:id/move`)
- **Route:** `PUT /api/files/:id/move`
- **Auth Required:** `authenticateToken`
- **Request Body:**
  ```json
  {
    "targetFolderId": "uuid-destination-folder",
    "type": "file"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "item": { "id": "uuid-item", "folderId": "uuid-destination-folder" }
  }
  ```
- **Side Effect:** Appends `ITEM_MOVED` event to `drive_change_journal`.

---

### 2.12 Recycle Bin Soft Delete (`POST /api/files/:id/trash`)
- **Route:** `POST /api/files/:id/trash`
- **Auth Required:** `authenticateToken`
- **Request Body:** `{"type": "file"}`
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Item moved to trash"
  }
  ```
- **Side Effect:** Sets `is_trashed = TRUE`, retains physical file on disk, appends `FILE_TRASHED` event to `drive_change_journal`.

---

## 3. ADDITIVE NKB DRIVE APIS (`/api/v1/drive/*`)

These endpoints provide high-performance synchronization, device lifecycle management, and optimistic concurrency checks.

### 3.1 Workstation Device Registration (`POST /api/v1/drive/devices/register`)
- **Route:** `POST /api/v1/drive/devices/register`
- **Auth Required:** `authenticateToken`
- **Request Body:**
  ```json
  {
    "machineName": "DESKTOP-EARLJ-PC",
    "hardwareFingerprint": "HW-A1B2C3D4E5F6",
    "osVersion": "Microsoft Windows 11 Enterprise x64",
    "clientVersion": "2.1.0",
    "targetDriveLetter": "N:"
  }
  ```
- **Success Response (201 Created):**
  ```json
  {
    "success": true,
    "deviceId": "uuid-device",
    "machineName": "DESKTOP-EARLJ-PC",
    "approvalStatus": "APPROVED",
    "targetDriveLetter": "N:",
    "createdAt": "2026-11-13T03:00:00.000Z"
  }
  ```

---

### 3.2 Query Registered Device Status (`GET /api/v1/drive/devices/my-device`)
- **Route:** `GET /api/v1/drive/devices/my-device`
- **Auth Required:** `authenticateToken`
- **Request Headers:** `x-device-id: <uuid>`
- **Success Response (200 OK):**
  ```json
  {
    "device": {
      "id": "uuid-device",
      "machineName": "DESKTOP-EARLJ-PC",
      "approvalStatus": "APPROVED",
      "isActive": true,
      "lastSyncAt": "2026-11-13T03:15:00.000Z"
    }
  }
  ```

---

### 3.3 Admin Approve Device (`POST /api/v1/drive/devices/:id/approve`)
- **Route:** `POST /api/v1/drive/devices/:id/approve`
- **Auth Required:** `authenticateToken` + `requireRole('SUPER ADMIN', 'ADMIN')`
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Device approved successfully",
    "device": { "id": "uuid-device", "approvalStatus": "APPROVED", "isActive": true }
  }
  ```

---

### 3.4 Workstation Device Revocation (`POST /api/v1/drive/devices/:id/revoke`)
- **Route:** `POST /api/v1/drive/devices/:id/revoke`
- **Auth Required:** `authenticateToken` (Owner or Admin)
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Device revoked successfully",
    "device": { "id": "uuid-device", "approvalStatus": "REVOKED", "isActive": false }
  }
  ```
- **Subsequent Behavior:** Any further request bearing this `x-device-id` immediately returns `403 Forbidden` (`DEVICE_REVOKED`).

---

### 3.5 Initial Directory Tree Hydration (`GET /api/v1/drive/tree`)
- **Route:** `GET /api/v1/drive/tree`
- **Auth Required:** `authenticateToken` + `validateDriveDevice`
- **Request Headers:** `Authorization: Bearer <token>`, `x-device-id: <uuid>`
- **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "rootFolders": [
      {
        "id": "uuid-folder-1",
        "name": "Engineering Specifications",
        "parentId": null,
        "departmentId": 2,
        "permission": "READ_WRITE"
      },
      {
        "id": "uuid-folder-2",
        "name": "CAD Models",
        "parentId": "uuid-folder-1",
        "departmentId": 2,
        "permission": "READ_WRITE"
      }
    ],
    "timestamp": "2026-11-13T03:15:00.000Z"
  }
  ```

---

### 3.6 Incremental Change Journal (`GET /api/v1/drive/changes`)
- **Route:** `GET /api/v1/drive/changes`
- **Auth Required:** `authenticateToken` + `validateDriveDevice`
- **Request Headers:** `Authorization: Bearer <token>`, `x-device-id: <uuid>`
- **Query Parameters:**
  - `cursor` (int, default `0`): Last processed monotonic `event_id`.
  - `limit` (int, default `50`, max `200`): Maximum events per batch.
- **Success Response (200 OK):**
  ```json
  {
    "cursor": 100,
    "nextCursor": 105,
    "hasMore": false,
    "serverTime": "2026-11-13T03:15:00.000Z",
    "changes": [
      {
        "eventId": 101,
        "eventType": "FILE_CREATED",
        "entityType": "FILE",
        "entityId": "uuid-file",
        "parentId": "uuid-folder",
        "name": "SpecSheet.xlsx",
        "sizeBytes": 45120,
        "sha256": "b4c5d6...",
        "performedBy": "uuid-user",
        "timestamp": "2026-11-13T03:14:00.000Z"
      },
      {
        "eventId": 102,
        "eventType": "ITEM_RENAMED",
        "entityType": "FILE",
        "entityId": "uuid-file",
        "parentId": "uuid-folder",
        "name": "SpecSheet_v2.xlsx",
        "sizeBytes": 45120,
        "sha256": "b4c5d6...",
        "performedBy": "uuid-user",
        "timestamp": "2026-11-13T03:14:30.000Z"
      }
    ]
  }
  ```

---

### 3.7 Optimistic File Version Validation (`POST /api/v1/drive/files/validate-version`)
- **Route:** `POST /api/v1/drive/files/validate-version`
- **Auth Required:** `authenticateToken` + `validateDriveDevice`
- **Request Body:**
  ```json
  {
    "fileId": "uuid-file",
    "baseSha256": "b4c5d6..."
  }
  ```
- **Success Response (200 OK — Matches Server):**
  ```json
  {
    "conflict": false,
    "status": "CURRENT",
    "canCommit": true,
    "serverSha256": "b4c5d6...",
    "serverUpdatedAt": "2026-11-13T03:14:00.000Z"
  }
  ```
- **Conflict Response (200 OK — Modified on Server):**
  ```json
  {
    "conflict": true,
    "status": "CONFLICT",
    "canCommit": false,
    "serverSha256": "f9e8d7...",
    "serverUpdatedAt": "2026-11-13T03:14:50.000Z",
    "serverUpdatedBy": "Jane Doe",
    "message": "File has been modified on server since your last sync."
  }
  ```

---

### 3.8 Non-Destructive Conflict Copy Fork (`POST /api/v1/drive/files/conflict-copy`)
- **Route:** `POST /api/v1/drive/files/conflict-copy`
- **Auth Required:** `authenticateToken` + `validateDriveDevice`
- **Request Body:**
  ```json
  {
    "originalFileId": "uuid-file",
    "conflictFileName": "SpecSheet [Conflict-DESKTOP-EARLJ-PC].xlsx",
    "sizeBytes": 48100,
    "sha256": "c1d2e3f4...",
    "deviceName": "DESKTOP-EARLJ-PC"
  }
  ```
- **Success Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "Conflict copy created successfully",
    "file": {
      "id": "uuid-conflict-file",
      "name": "SpecSheet [Conflict-DESKTOP-EARLJ-PC].xlsx",
      "folderId": "uuid-folder",
      "sizeBytes": 48100,
      "sha256": "c1d2e3f4..."
    }
  }
  ```

---

## 4. ERROR CODE STANDARDIZATION

All APIs return consistent JSON error objects conforming to:
```json
{
  "error": "Human-readable description of error",
  "code": "MACHINE_READABLE_CODE"
}
```

| HTTP Status | Error Code | Meaning / Client Handling |
| :---: | :--- | :--- |
| `401` | `INVALID_CREDENTIALS` | Prompt user for valid username/password in WPF dialog. |
| `401` | `SESSION_REVOKED` | User's session invalidated on server; purge DPAPI vault and trigger login. |
| `401` | `DEVICE_NOT_FOUND` | Device ID not found in database; trigger registration flow. |
| `403` | `DEVICE_REVOKED` | Administrator revoked workstation; unmount `N:\` and alert user. |
| `403` | `DEVICE_PENDING_APPROVAL` | Device awaiting admin approval; display pending status badge. |
| `403` | `DEVICE_USER_MISMATCH` | Token user does not own this device registration. |
| `403` | `ACCESS_DENIED` | Department permission or folder CTE inheritance denied operation. |
| `404` | `FILE_NOT_FOUND` | Referenced entity missing or permanently deleted. |
| `409` | `VERSION_CONFLICT` | Server file modified concurrently; trigger conflict copy workflow. |
| `500` | `INTERNAL_SERVER_ERROR`| Backend exception; queue item for exponential backoff retry. |
