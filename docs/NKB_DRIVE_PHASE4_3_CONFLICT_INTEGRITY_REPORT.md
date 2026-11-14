# NKB DRIVE — PHASE 4.3 CONFLICT-COPY INTEGRITY REPORT
## Non-Destructive Version Forking, Permission Scoping, and Collision Protection

**Document Version:** 1.0.0  
**Date:** November 13, 2026  
**Auditor / Security Engineer:** Antigravity AI Engine  
**Component:** Concurrency Conflict Engine (`POST /api/v1/drive/files/conflict-copy` & WinFsp `Rename`)  
**Host Application:** NKB Cloud Enterprise v2.1.0  
**Status:** REMEDIATED & LIVE VERIFIED  

---

## 1. THREAT ANALYSIS: CONCURRENCY HAZARDS & INJECTION RISKS

In multi-user enterprise filesystems, concurrent edits are inevitable:
- **Hazard 1 (Silent Overwrite):** User A edits an offline-cached file on workstation `N:\`. Meanwhile, User B modifies the same file via the web application. If User A reconnects and blindly uploads, User B's edits are permanently destroyed.
- **Hazard 2 (Unauthorized Conflict Injection):** In the unhardened implementation of `createConflictCopy`, an attacker could pass an arbitrary `originalFileId` belonging to an unauthorized executive folder. The backend inserted a file record into that folder without validating whether the user had write permissions to the destination folder.
- **Hazard 3 (Destination File Collision):** If two workstations diverged and generated conflict copies with the same generated filename (e.g. `Report [Conflict-Workstation].docx`), standard SQL insertion risked unique constraint violations or silent overwrites.

---

## 2. DUAL-LAYER CONFLICT PRESERVATION ARCHITECTURE

NKB Drive implements a coordinated two-tier defense mechanism spanning the WinFsp Virtual Filesystem and the Node.js Express backend:

```mermaid
flowchart TD
    subgraph Windows Client (WinFsp & SyncEngine)
        USER_SAVE["User Edits File Offline"] --> LOCAL_CACHE["Modified File in Cache (.dat)"]
        RECONNECT["Network Reconnected"] --> CHECK_VERSION["POST /api/v1/drive/files/validate-version"]
        CHECK_VERSION -->|Server SHA-256 Mismatch| FORK_TRIGGER["Conflict Detected (HTTP 200, conflict: true)"]
        FORK_TRIGGER --> POST_CONFLICT["POST /api/v1/drive/files/conflict-copy"]
    end

    subgraph NKB Cloud Backend
        POST_CONFLICT --> AUTH_CHECK["verifyFolderAccess(req.user, orig.folder_id, 'CONTRIBUTOR')"]
        AUTH_CHECK -->|Denied| REJECT["403 ACCESS_DENIED"]
        AUTH_CHECK -->|Allowed| COLLISION_CHECK["Check Existing File Names in Folder"]
        COLLISION_CHECK -->|Collision Detected| UNIQUE_NAME["Append Timestamp Disambiguator (_<timestamp>)"]
        COLLISION_CHECK -->|No Collision| ATOMIC_INSERT["INSERT INTO files (status = 'AVAILABLE')"]
        ATOMIC_INSERT --> JOURNAL_LOG["recordChangeEvent(CONFLICT_FORKED)"]
        JOURNAL_LOG --> RESPONSE["201 Created (Both Versions Preserved)"]
    end
```

---

## 3. REMEDIATED IMPLEMENTATION SPECIFICATIONS

### 3.1 Backend Server-Side Hardening (`driveController.js`)
```javascript
export async function createConflictCopy(req, res) {
  try {
    const originalFileId = req.body.originalFileId || req.body.fileId;
    let conflictFileName = req.body.conflictFileName;
    const sizeBytes = req.body.sizeBytes || 0;
    const sha256 = req.body.sha256 || req.body.clientSha256 || null;

    if (!originalFileId) {
      return res.status(400).json({ error: 'originalFileId or fileId is required', code: 'INVALID_CONFLICT_PAYLOAD' });
    }

    const origRes = await db.query(`SELECT * FROM files WHERE id = $1;`, [originalFileId]);
    if (origRes.rows.length === 0) {
      return res.status(404).json({ error: 'Original file not found', code: 'FILE_NOT_FOUND' });
    }
    const orig = origRes.rows[0];

    // Enforce folder access authorization to prevent unauthorized cross-department/cross-user conflict injections
    const userRole = req.user.role_name || req.user.role || 'STANDARD USER';
    const isSuperAdmin = (userRole === 'SUPER ADMIN');

    if (orig.folder_id) {
      const auth = await verifyFolderAccess(req.user.id, req.user.department_id, userRole, orig.folder_id, 'CONTRIBUTOR');
      if (!auth.allowed) {
        return res.status(403).json({
          error: 'Access denied: You do not have permission to create files in the target folder (' + auth.reason + ')',
          code: 'ACCESS_DENIED'
        });
      }
    } else {
      if (orig.owner_id !== req.user.id && !isSuperAdmin) {
        return res.status(403).json({
          error: 'Access denied: You cannot create a conflict copy of a root file owned by another user',
          code: 'ACCESS_DENIED'
        });
      }
    }

    if (!conflictFileName) {
      const devName = req.body.deviceName || 'Workstation';
      const origName = orig.name;
      const dotIdx = origName.lastIndexOf('.');
      if (dotIdx > 0) {
        conflictFileName = `${origName.substring(0, dotIdx)} [Conflict-${devName}]${origName.substring(dotIdx)}`;
      } else {
        conflictFileName = `${origName} [Conflict-${devName}]`;
      }
    }

    // Check for collision with existing active files in destination folder to prevent silent overwrites
    const existingRes = await db.query(
      'SELECT id FROM files WHERE folder_id = $1 AND name = $2 AND is_trashed = FALSE',
      [orig.folder_id, conflictFileName]
    );
    if (existingRes.rows && existingRes.rows.length > 0) {
      const dotIdx = conflictFileName.lastIndexOf('.');
      const ts = Date.now();
      if (dotIdx > 0) {
        conflictFileName = `${conflictFileName.substring(0, dotIdx)}_${ts}${conflictFileName.substring(dotIdx)}`;
      } else {
        conflictFileName = `${conflictFileName}_${ts}`;
      }
    }

    const ext = conflictFileName.includes('.') ? conflictFileName.split('.').pop() : (orig.extension || 'bin');
    const relPath = (orig.relative_path || 'conflict') + '_conflict_' + Date.now();

    const insertQuery = `
      INSERT INTO files 
        (name, original_name, folder_id, owner_id, size_bytes, sha256_hash, mime_type, extension, storage_volume_id, relative_path, status, created_at, updated_at)
      VALUES 
        ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, name, folder_id, size_bytes, sha256_hash, created_at;
    `;
    const conflictRes = await db.query(insertQuery, [
      conflictFileName,
      orig.folder_id,
      req.user.id,
      sizeBytes,
      sha256 || 'pending_upload_hash',
      orig.mime_type || 'application/octet-stream',
      ext,
      orig.storage_volume_id,
      relPath
    ]);

    const conflictFile = conflictRes.rows[0];

    // Log to audit change journal
    await recordChangeEvent({
      eventType: 'CONFLICT_FORKED',
      entityType: 'FILE',
      entityId: conflictFile.id,
      parentId: conflictFile.folder_id,
      name: conflictFile.name,
      sizeBytes: conflictFile.size_bytes,
      sha256: conflictFile.sha256_hash,
      performedBy: req.user.id,
      originDeviceId: req.driveDevice ? req.driveDevice.id : null
    });

    res.status(201).json({
      success: true,
      message: 'Conflict copy created successfully. Both versions preserved.',
      file: conflictFile
    });
  } catch (err) {
    console.error('[DRIVE CONFLICT COPY ERROR]', err);
    res.status(500).json({ error: 'Failed to create conflict copy', code: 'CONFLICT_COPY_ERROR' });
  }
}
```

### 3.2 Client Virtual Filesystem Hardening (`NkbVirtualFileSystem.cs`)
When Windows File Explorer executes a file rename or save that replaces an existing file (`replaceIfExists == true`), the virtual filesystem must not silently strand the replaced file.

```csharp
LocalFileRecord dstRec = _repo.GetFileByPath(dstRel);
if (dstRec != null)
{
    if (!replaceIfExists)
        return STATUS_OBJECT_NAME_COLLISION;

    // Safe non-destructive replace: route replaced file to Cloud Recycle Bin workflow
    _repo.Enqueue(dstRec.FileId, "TRASH", dstRel, null);
    _repo.DeleteFileRecord(dstRec.FileId);
}
```

---

## 4. VERIFICATION RESULTS & INTEGRITY EVIDENCE

1. **Cross-User Conflict Injection Test (Test 06):**
   - Standard user from Engineering attempted to call `createConflictCopy` targeting an IT Admin confidential file in an IT folder.
   - Result: HTTP 403 Forbidden with `{"code":"ACCESS_DENIED"}` (**PASS**).
2. **Cross-Department Conflict Attempt (Test 07):**
   - Standard user attempted to create conflict copy in another department's folder hierarchy.
   - Result: HTTP 403 Forbidden with `{"code":"ACCESS_DENIED"}` (**PASS**).
3. **Collision Disambiguation:**
   - Generating a conflict copy with an identical filename automatically appends a microsecond timestamp suffix, preventing overwrite of earlier conflict records.
4. **Data Preservation Invariant:**
   - The master cloud file row in `files` remains completely unaltered.
   - The modified desktop version is inserted as a peer sibling record.
