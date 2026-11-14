# NKB DRIVE — PHASE 4.3 UPLOAD-SESSION SECURITY REPORT
## Multi-Part Chunk Protocol Hardening, Ownership Isolation, and Payload Integrity

**Document Version:** 1.0.0  
**Date:** November 13, 2026  
**Auditor / Security Engineer:** Antigravity AI Engine  
**Component:** Chunked Upload Engine (`POST /api/files/upload/*`)  
**Backend:** Node.js 26 + Express + Storage Agent Hub (`AgentHub`)  
**Status:** REMEDIATED & LIVE VERIFIED (Ownership Enforced & Corrupted Chunks Blocked)  

---

## 1. THREAT ANALYSIS: UPLOAD SESSION ENUMERATION & HIJACKING

NKB Cloud's chunked upload subsystem is responsible for handling large file transfers (up to 100GB+) across corporate workstations and mobile devices by breaking files into 5MB chunks.

### 1.1 Vulnerability Discovery
Prior to this remediation, while `initiateUploadSession` recorded `user_id` in PostgreSQL table `upload_sessions`, the three subsequent session handlers in `server/controllers/fileController.js`:
- `getUploadSessionStatus` (`GET /api/files/upload/:sessionId/status`)
- `uploadChunk` (`POST /api/files/upload/:sessionId/chunk`)
- `finalizeUpload` (`POST /api/files/upload/:sessionId/finalize`)
retrieved the session via `SELECT * FROM upload_sessions WHERE id = $1` **without verifying that `session.user_id === req.user.id`**.

### 1.2 Impact of Unauthenticated Session Access
1. **Reconnaissance & Metadata Leakage:** An authenticated employee guessing or intercepting an active `sessionId` could poll `/status` and inspect the original file name, total chunks, and upload progress.
2. **Payload Injection & Tampering:** An attacker could submit arbitrary binary chunks into another employee's pending upload session, poisoning corporate documents or injecting malware before finalization.
3. **Premature Finalization:** An unauthorized party could prematurely trigger `/finalize`, producing corrupted, truncated files on disk.

---

## 2. COMPREHENSIVE PROTOCOL HARDENING

The upload session lifecycle has been hardened across all four stages:

```mermaid
sequenceDiagram
    autonumber
    actor User as Authenticated Client (JWT)
    participant Server as Express Server (fileController)
    participant Auth as AuthorizationService
    participant DB as PostgreSQL 16 (upload_sessions)
    participant Agent as Storage Agent / Physical Disk

    User->>Server: POST /api/files/upload/initiate (fileName, totalSizeBytes, totalChunks, folderId)
    Server->>Auth: verifyFolderAccess(userId, deptId, role, folderId, 'CONTRIBUTOR')
    Note over Server,Auth: Checks Personal Quota & Storage Placement Policy
    Server->>DB: INSERT INTO upload_sessions (id, user_id, status = 'IN_PROGRESS')
    Server-->>User: 200 OK (sessionId, chunkSizeBytes: 5MB)

    User->>Server: POST /api/files/upload/:sessionId/chunk (chunk, x-chunk-index, x-chunk-sha256)
    Server->>DB: SELECT * FROM upload_sessions WHERE id = sessionId
    Note over Server: Check: session.user_id === req.user.id (403 if mismatch)
    Note over Server: Check: crypto.createHash('sha256') === x-chunk-sha256 (400 if mismatch)
    Note over Server: Check: Duplicate chunk check in file_chunks (Idempotent 200 OK)
    Server->>Agent: writeChunkToStorage(chunk)
    Server-->>User: 200 OK (chunkIndex, receivedBytes)

    User->>Server: POST /api/files/upload/:sessionId/finalize
    Server->>DB: SELECT * FROM upload_sessions WHERE id = sessionId
    Note over Server: Check: session.user_id === req.user.id (403 if mismatch)
    Server->>DB: UPDATE files (status = 'AVAILABLE', sha256_hash)
    Server->>DB: recordChangeEvent(FILE_CREATED)
    Server-->>User: 200 OK (file object)
```

---

## 3. REMEDIATED IMPLEMENTATION SPECIFICATIONS

### 3.1 Strict Session Ownership Check
Applied uniformly across `getUploadSessionStatus`, `uploadChunk`, and `finalizeUpload`:
```javascript
const sessRes = await db.query('SELECT * FROM upload_sessions WHERE id = $1', [sessionId]);
if (!sessRes.rows || !sessRes.rows[0]) {
  return res.status(404).json({ error: 'Upload session not found or expired' });
}
const session = sessRes.rows[0];

// Enforce session ownership to prevent cross-user session tampering
const isSuperAdmin = (req.user.role_name === 'SUPER ADMIN' || req.user.role === 'SUPER ADMIN');
if (session.user_id !== req.user.id && !isSuperAdmin) {
  return res.status(403).json({
    error: 'Access denied: You do not own this upload session',
    code: 'UPLOAD_SESSION_OWNERSHIP_VIOLATION'
  });
}
```

### 3.2 Idempotent Duplicate Chunk Handling
Prevents network retries or parallel workers from corrupting multi-part assemblies:
```javascript
// Check if chunk is already idempotently recorded
const existingChunk = await db.query(
  'SELECT * FROM file_chunks WHERE session_id = $1 AND chunk_index = $2',
  [sessionId, chunkIndex]
);

if (existingChunk.rows && existingChunk.rows[0] && existingChunk.rows[0].is_verified && !isLastChunk) {
  return res.json({ message: `Chunk ${chunkIndex} already recorded idempotently`, cached: true, chunkIndex });
}
```

### 3.3 Hardware-Accelerated Chunk SHA-256 Verification
Rejects in-flight network corruption before writing to physical media:
```javascript
if (chunkSha256 && chunkBuffer) {
  const calcHash = crypto.createHash('sha256').update(chunkBuffer).digest('hex');
  if (calcHash.toLowerCase() !== chunkSha256.toLowerCase()) {
    return res.status(400).json({ error: `Chunk SHA-256 mismatch (Expected: ${chunkSha256}, Actual: ${calcHash})` });
  }
}
```

### 3.4 Storage Placement Query Fix
Resolved an active database error where `fileController.js` attempted to sort by a nonexistent `priority` column:
- **Prior Query:** `SELECT * FROM storage_volumes WHERE status = 'ONLINE' ORDER BY priority ASC, free_bytes DESC` (Threw PostgreSQL 500 error: `column "priority" does not exist`).
- **Remediated Query:** `SELECT * FROM storage_volumes WHERE status = 'ONLINE' ORDER BY free_bytes DESC, created_at ASC` (100% Schema Compliant).

---

## 4. VERIFICATION RESULTS & SYSTEM EVIDENCE

Live tests executed against `http://127.0.0.1:5000`:
1. **Upload Session Ownership Violation (Test 08):**
   - Admin initiated upload session `targetSessId`.
   - Engineer submitted status request to `/api/files/upload/:sessionId/status`.
   - Result: HTTP 403 Forbidden with `{"code":"UPLOAD_SESSION_OWNERSHIP_VIOLATION"}` (**PASS**).
   - Engineer submitted finalization request to `/api/files/upload/:sessionId/finalize`.
   - Result: HTTP 403 Forbidden with `{"code":"UPLOAD_SESSION_OWNERSHIP_VIOLATION"}` (**PASS**).
2. **Duplicate Chunk Submission (Test 09):**
   - Chunk 0 submitted with valid SHA-256 header -> HTTP 200 OK.
   - Same chunk submitted a second time -> HTTP 200 OK with `{"cached":true,"chunkIndex":0}` (**PASS**).
3. **Corrupted Chunk Detection (Test 10):**
   - Chunk submitted with invalid SHA-256 (`000000...`).
   - Result: HTTP 400 Bad Request with `{"error":"Chunk SHA-256 mismatch..."}` (**PASS**).
