import db from '../config/db.js';
import { verifyFolderAccess } from '../services/authorizationService.js';

/**
 * Record a change event in drive_change_journal for incremental synchronization
 */
export async function recordChangeEvent({
  eventType,
  entityType,
  entityId,
  parentId = null,
  name,
  sizeBytes = 0,
  sha256 = null,
  performedBy = null,
  originDeviceId = null
}) {
  try {
    const query = `
      INSERT INTO drive_change_journal 
        (event_type, entity_type, entity_id, parent_id, name, size_bytes, sha256, performed_by, origin_device_id, created_at)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      RETURNING event_id, created_at;
    `;
    const res = await db.query(query, [
      eventType,
      entityType,
      entityId,
      parentId,
      name,
      sizeBytes,
      sha256,
      performedBy,
      originDeviceId
    ]);
    return res.rows[0];
  } catch (err) {
    console.error('[DRIVE JOURNAL ERROR] Failed to record change event:', err.message);
    return null;
  }
}

/**
 * Device validation middleware
 */
export async function validateDriveDevice(req, res, next) {
  const deviceId = req.headers['x-device-id'] || req.query.deviceId;
  if (!deviceId) {
    return res.status(401).json({
      error: 'Drive device identification header (x-device-id) is required for virtual drive operations',
      code: 'MISSING_DEVICE_ID'
    });
  }

  try {
    const query = `
      SELECT id, user_id, machine_name, is_active, approval_status 
      FROM nkb_drive_devices 
      WHERE id = $1;
    `;
    const result = await db.query(query, [deviceId]);
    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Drive device not registered',
        code: 'DEVICE_NOT_FOUND'
      });
    }

    const device = result.rows[0];
    const isSuperAdmin = (req.user.role_name === 'SUPER ADMIN' || req.user.role === 'SUPER ADMIN');
    if (device.user_id !== req.user.id && !isSuperAdmin) {
      return res.status(403).json({
        error: 'Device belongs to another user account',
        code: 'DEVICE_USER_MISMATCH'
      });
    }

    if (!device.is_active || device.approval_status === 'REVOKED') {
      return res.status(403).json({
        error: 'Drive device has been revoked',
        code: 'DEVICE_REVOKED'
      });
    }

    if (device.approval_status === 'REJECTED') {
      return res.status(403).json({
        error: 'Drive device enrollment was rejected by administrator',
        code: 'DEVICE_REJECTED'
      });
    }

    if (device.approval_status === 'PENDING') {
      return res.status(403).json({
        error: 'Drive device is pending administrator approval',
        code: 'DEVICE_PENDING_APPROVAL'
      });
    }

    req.driveDevice = device;
    next();
  } catch (err) {
    console.error('[DEVICE VALIDATE ERROR]', err);
    res.status(500).json({ error: 'Failed to validate device', code: 'DEVICE_CHECK_ERROR' });
  }
}

/**
 * 1. Register or update desktop workstation device
 */
export async function registerDevice(req, res) {
  try {
    const userId = req.user.id;
    const {
      machineName,
      hardwareFingerprint,
      osVersion = 'Microsoft Windows',
      clientVersion = '2.1.0',
      targetDriveLetter = 'N:'
    } = req.body;

    if (!machineName || !hardwareFingerprint) {
      return res.status(400).json({
        error: 'machineName and hardwareFingerprint are required',
        code: 'INVALID_DEVICE_PAYLOAD'
      });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    const upsertQuery = `
      INSERT INTO nkb_drive_devices 
        (user_id, machine_name, hardware_fingerprint, os_version, client_version, target_drive_letter, is_active, approval_status, last_sync_at, last_known_ip, updated_at)
      VALUES 
        ($1, $2, $3, $4, $5, $6, TRUE, 'APPROVED', CURRENT_TIMESTAMP, $7, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, hardware_fingerprint) 
      DO UPDATE SET
        machine_name = EXCLUDED.machine_name,
        os_version = EXCLUDED.os_version,
        client_version = EXCLUDED.client_version,
        target_drive_letter = EXCLUDED.target_drive_letter,
        is_active = CASE WHEN nkb_drive_devices.approval_status = 'REVOKED' THEN FALSE ELSE TRUE END,
        last_sync_at = CURRENT_TIMESTAMP,
        last_known_ip = EXCLUDED.last_known_ip,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, user_id, machine_name, target_drive_letter, approval_status, is_active, created_at;
    `;

    const result = await db.query(upsertQuery, [
      userId,
      machineName,
      hardwareFingerprint,
      osVersion,
      clientVersion,
      targetDriveLetter,
      clientIp
    ]);

    const device = result.rows[0];

    // Log to audit log
    try {
      await db.query(`
        INSERT INTO audit_logs (user_id, action, target_type, target_id, details)
        VALUES ($1, 'DRIVE_DEVICE_REGISTERED', 'DEVICE', $2, $3);
      `, [userId, device.id, JSON.stringify({ machineName, targetDriveLetter, clientIp })]);
    } catch {}

    res.status(201).json({
      success: true,
      device: {
        id: device.id,
        userId: device.user_id,
        machineName: device.machine_name,
        targetDriveLetter: device.target_drive_letter,
        approvalStatus: device.approval_status,
        syncEnabled: device.is_active && device.approval_status === 'APPROVED',
        registeredAt: device.created_at
      }
    });
  } catch (err) {
    console.error('[DRIVE REGISTER ERROR]', err);
    res.status(500).json({ error: 'Device registration failed', code: 'REGISTRATION_ERROR' });
  }
}

/**
 * 2. Approve Device (Admin only)
 */
export async function approveDevice(req, res) {
  try {
    const { id } = req.params;
    const result = await db.query(`
      UPDATE nkb_drive_devices 
      SET approval_status = 'APPROVED', is_active = TRUE, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
      RETURNING id, user_id, machine_name, approval_status, is_active;
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
    }

    res.json({ success: true, message: 'Device approved', device: result.rows[0] });
  } catch (err) {
    console.error('[DRIVE APPROVE ERROR]', err);
    res.status(500).json({ error: 'Failed to approve device', code: 'DEVICE_APPROVE_ERROR' });
  }
}

/**
 * 3. Reject Device (Admin only)
 */
export async function rejectDevice(req, res) {
  try {
    const { id } = req.params;
    const result = await db.query(`
      UPDATE nkb_drive_devices 
      SET approval_status = 'REJECTED', is_active = FALSE, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
      RETURNING id, user_id, machine_name, approval_status, is_active;
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
    }

    res.json({ success: true, message: 'Device rejected', device: result.rows[0] });
  } catch (err) {
    console.error('[DRIVE REJECT ERROR]', err);
    res.status(500).json({ error: 'Failed to reject device', code: 'DEVICE_REJECT_ERROR' });
  }
}

/**
 * 4. Revoke Device (User or Admin)
 */
export async function revokeDevice(req, res) {
  try {
    const { id } = req.params;
    const { reason = 'Revoked by user request' } = req.body;

    const findQuery = `SELECT id, user_id, machine_name FROM nkb_drive_devices WHERE id = $1;`;
    const findRes = await db.query(findQuery, [id]);
    if (findRes.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found', code: 'DEVICE_NOT_FOUND' });
    }

    const dev = findRes.rows[0];
    if (dev.user_id !== req.user.id && req.user.role !== 'SUPER ADMIN' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized to revoke this device', code: 'FORBIDDEN' });
    }

    const updateQuery = `
      UPDATE nkb_drive_devices 
      SET approval_status = 'REVOKED', is_active = FALSE, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
      RETURNING id, machine_name, approval_status, is_active;
    `;
    const result = await db.query(updateQuery, [id]);

    // Log to audit log
    try {
      await db.query(`
        INSERT INTO audit_logs (user_id, action, target_type, target_id, details)
        VALUES ($1, 'DRIVE_DEVICE_REVOKED', 'DEVICE', $2, $3);
      `, [req.user.id, id, JSON.stringify({ reason })]);
    } catch {}

    res.json({ success: true, message: 'Device revoked successfully. Cloud access severed.', device: result.rows[0] });
  } catch (err) {
    console.error('[DRIVE REVOKE ERROR]', err);
    res.status(500).json({ error: 'Failed to revoke device', code: 'DEVICE_REVOKE_ERROR' });
  }
}

/**
 * 5. Get current registered device status
 */
export async function getMyDevice(req, res) {
  try {
    const fingerprint = req.query.hardwareFingerprint;
    let query = `SELECT * FROM nkb_drive_devices WHERE user_id = $1`;
    const params = [req.user.id];
    if (fingerprint) {
      query += ` AND hardware_fingerprint = $2`;
      params.push(fingerprint);
    }
    query += ` ORDER BY last_sync_at DESC LIMIT 1`;

    const result = await db.query(query, params);
    if (result.rows.length === 0) {
      return res.json({ registered: false, device: null });
    }

    res.json({ registered: true, device: result.rows[0] });
  } catch (err) {
    console.error('[DRIVE GET DEVICE ERROR]', err);
    res.status(500).json({ error: 'Failed to retrieve device status', code: 'DEVICE_QUERY_ERROR' });
  }
}

/**
 * 6. Cursor-Based Incremental Change Journal
 */
export async function getChanges(req, res) {
  try {
    const cursor = parseInt(req.query.cursor || '0', 10);
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const userId = req.user.id;
    const userRole = req.user.role_name || req.user.role || 'STANDARD USER';
    const deptId = req.user.department_id;
    const isAdmin = (userRole === 'SUPER ADMIN' || userRole === 'ADMIN');

    let query;
    let params;

    if (isAdmin) {
      query = `
        SELECT event_id, event_type, entity_type, entity_id, parent_id, name, size_bytes, sha256, performed_by, created_at
        FROM drive_change_journal
        WHERE event_id > $1
        ORDER BY event_id ASC
        LIMIT $2;
      `;
      params = [cursor, limit];
    } else {
      // Scoped change query: strictly enforce department and folder authorization
      query = `
        SELECT j.event_id, j.event_type, j.entity_type, j.entity_id, j.parent_id, j.name, j.size_bytes, j.sha256, j.performed_by, j.created_at
        FROM drive_change_journal j
        WHERE j.event_id > $1
          AND (
            j.performed_by = $3
            OR j.parent_id IN (
              SELECT f.id FROM folders f 
              WHERE f.is_trashed = FALSE AND (f.department_id = $4 OR f.owner_id = $3)
            )
            OR j.entity_id IN (
              SELECT f.id FROM folders f 
              WHERE f.is_trashed = FALSE AND (f.department_id = $4 OR f.owner_id = $3)
            )
            OR j.entity_id IN (
              SELECT fil.id FROM files fil
              WHERE fil.is_trashed = FALSE AND (fil.owner_id = $3 OR fil.folder_id IN (
                SELECT f.id FROM folders f WHERE f.is_trashed = FALSE AND (f.department_id = $4 OR f.owner_id = $3)
              ))
            )
            OR j.entity_id IN (
              SELECT s.file_id FROM file_shares s
              WHERE s.is_revoked = FALSE AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
                AND (s.shared_with_user_id = $3 OR s.shared_with_department_id = $4)
            )
            OR j.entity_id IN (
              SELECT s.folder_id FROM file_shares s
              WHERE s.is_revoked = FALSE AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
                AND (s.shared_with_user_id = $3 OR s.shared_with_department_id = $4)
            )
            OR j.parent_id IN (
              SELECT s.folder_id FROM file_shares s
              WHERE s.is_revoked = FALSE AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
                AND (s.shared_with_user_id = $3 OR s.shared_with_department_id = $4)
            )
          )
        ORDER BY j.event_id ASC
        LIMIT $2;
      `;
      params = [cursor, limit, userId, deptId];
    }
    const result = await db.query(query, params);
    const changes = result.rows;

    const nextCursor = changes.length > 0 ? changes[changes.length - 1].event_id : cursor;
    const hasMore = changes.length === limit;

    // Update last_sync_at for active device if deviceId provided
    if (req.driveDevice) {
      db.query(`UPDATE nkb_drive_devices SET last_sync_at = CURRENT_TIMESTAMP WHERE id = $1;`, [req.driveDevice.id]).catch(() => {});
    }

    res.json({
      cursor,
      nextCursor,
      hasMore,
      serverTime: new Date().toISOString(),
      changes: changes.map(c => ({
        eventId: Number(c.event_id),
        eventType: c.event_type,
        entityType: c.entity_type,
        entityId: c.entity_id,
        parentId: c.parent_id,
        name: c.name,
        sizeBytes: Number(c.size_bytes),
        sha256: c.sha256,
        performedBy: c.performed_by,
        timestamp: c.created_at
      }))
    });
  } catch (err) {
    console.error('[DRIVE GET CHANGES ERROR]', err);
    res.status(500).json({ error: 'Failed to retrieve change journal', code: 'CHANGE_JOURNAL_ERROR' });
  }
}

/**
 * 7. Optimistic Version Validation
 */
export async function validateVersion(req, res) {
  try {
    const fileId = req.body.fileId || req.body.originalFileId;
    const baseSha256 = req.body.baseSha256 || req.body.clientSha256;
    if (!fileId) {
      return res.status(400).json({ error: 'fileId is required', code: 'MISSING_FILE_ID' });
    }

    const query = `
      SELECT f.id, f.name, f.sha256_hash as sha256, f.updated_at, u.full_name as updated_by_name
      FROM files f
      LEFT JOIN users u ON f.owner_id = u.id
      WHERE f.id = $1 AND f.is_trashed = FALSE;
    `;
    const result = await db.query(query, [fileId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found on server', code: 'FILE_NOT_FOUND' });
    }

    const file = result.rows[0];

    // Check version compatibility
    if (baseSha256 && file.sha256 && baseSha256 !== file.sha256) {
      return res.status(200).json({
        conflict: true,
        status: 'CONFLICT',
        canCommit: false,
        serverSha256: file.sha256,
        serverUpdatedAt: file.updated_at,
        serverUpdatedBy: file.updated_by_name || 'Another user',
        message: 'File has been modified on server since your last sync.'
      });
    }

    res.json({
      conflict: false,
      status: 'CURRENT',
      canCommit: true,
      serverSha256: file.sha256,
      serverUpdatedAt: file.updated_at
    });
  } catch (err) {
    console.error('[DRIVE VALIDATE VERSION ERROR]', err);
    res.status(500).json({ error: 'Version validation failed', code: 'VERSION_VALIDATION_ERROR' });
  }
}

/**
 * 8. Conflict Copy Creation
 */
export async function createConflictCopy(req, res) {
  try {
    const originalFileId = req.body.originalFileId || req.body.fileId;
    let conflictFileName = req.body.conflictFileName;
    const sizeBytes = req.body.sizeBytes || 0;
    const sha256 = req.body.sha256 || req.body.clientSha256 || null;

    if (!originalFileId) {
      return res.status(400).json({
        error: 'originalFileId or fileId is required',
        code: 'INVALID_CONFLICT_PAYLOAD'
      });
    }

    const origRes = await db.query(`SELECT * FROM files WHERE id = $1;`, [originalFileId]);
    if (origRes.rows.length === 0) {
      return res.status(404).json({ error: 'Original file not found', code: 'FILE_NOT_FOUND' });
    }
    const orig = origRes.rows[0];

    // Enforce folder access authorization to prevent unauthorized cross-department/cross-user conflict injections
    if (orig.folder_id) {
      const userRole = req.user.role_name || req.user.role || 'STANDARD USER';
      const auth = await verifyFolderAccess(req.user.id, req.user.department_id, userRole, orig.folder_id, 'CONTRIBUTOR');
      if (!auth.allowed) {
        return res.status(403).json({
          error: 'Access denied: You do not have permission to create files in the target folder (' + auth.reason + ')',
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

    // Log to journal
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
      conflictFile: {
        id: conflictFile.id,
        name: conflictFile.name,
        folderId: conflictFile.folder_id,
        sizeBytes: conflictFile.size_bytes,
        sha256: conflictFile.sha256_hash,
        createdAt: conflictFile.created_at
      }
    });
  } catch (err) {
    console.error('[DRIVE CONFLICT COPY ERROR]', err);
    res.status(500).json({ error: 'Failed to create conflict copy', code: 'CONFLICT_FORK_ERROR' });
  }
}

/**
 * 9. Fast Directory Tree Hydration for Client Mount
 */
export async function getDriveTree(req, res) {
  try {
    const userId = req.user.id;
    const userRole = req.user.role_name || req.user.role || 'STANDARD USER';
    const deptId = req.user.department_id;
    const isSuperAdmin = (userRole === 'SUPER ADMIN');

    // Strict Scope: Only return:
    // 1. Super Admin: full access to organization folders
    // 2. Folders owned by user
    // 3. Folders explicitly shared with employee or employee's department
    // 4. Folders assigned to employee's department
    // 5. Recursive children of any accessible folder
    const folderQuery = `
      WITH RECURSIVE accessible_folders AS (
        SELECT f.id, f.name, f.parent_id, f.department_id, f.owner_id
        FROM folders f
        LEFT JOIN file_shares s ON s.folder_id = f.id 
          AND s.is_revoked = FALSE 
          AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
        LEFT JOIN departments d ON d.id = $2
        WHERE f.is_trashed = FALSE
          AND (
            -- Super Admin: all root folders
            ($3 = TRUE AND f.parent_id IS NULL)
            -- User's own root folders
            OR (f.owner_id = $1 AND f.parent_id IS NULL)
            -- Explicit user share
            OR s.shared_with_user_id = $1
            -- Explicit department share
            OR (s.shared_with_department_id IS NOT NULL AND s.shared_with_department_id = $2)
            -- Assigned department
            OR ($2 IS NOT NULL AND f.department_id = $2)
            -- Department name match (e.g. Marketing)
            OR ($2 IS NOT NULL AND d.name IS NOT NULL AND LOWER(f.name) = LOWER(d.name))
          )
        UNION
        SELECT c.id, c.name, c.parent_id, c.department_id, c.owner_id
        FROM folders c
        INNER JOIN accessible_folders p ON c.parent_id = p.id
        WHERE c.is_trashed = FALSE
      )
      SELECT DISTINCT id, name, parent_id, department_id, owner_id 
      FROM accessible_folders 
      ORDER BY name ASC;
    `;

    const folderRes = await db.query(folderQuery, [userId, deptId, isSuperAdmin]);
    const accessibleFolders = folderRes.rows || [];
    const accessibleFolderIds = accessibleFolders.map(f => f.id);

    // Build virtual paths for files and folders
    const folderMap = new Map(accessibleFolders.map(f => [f.id, f]));
    const getFolderPath = (folderId) => {
      let current = folderMap.get(folderId);
      if (!current) return '';
      const parts = [current.name];
      while (current && current.parent_id) {
        current = folderMap.get(current.parent_id);
        if (current) parts.unshift(current.name);
      }
      return '\\' + parts.join('\\');
    };

    // Fetch accessible files
    let fileQuery = `
      SELECT fil.id, fil.name, fil.size_bytes, fil.sha256_hash as sha256, fil.folder_id, fil.owner_id
      FROM files fil
      LEFT JOIN file_shares s ON s.file_id = fil.id 
        AND s.is_revoked = FALSE 
        AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
      WHERE fil.is_trashed = FALSE
        AND (
          ($3 = TRUE)
          OR fil.owner_id = $1
          OR s.shared_with_user_id = $1
          OR (s.shared_with_department_id IS NOT NULL AND s.shared_with_department_id = $2)
    `;
    const fileParams = [userId, deptId, isSuperAdmin];

    if (accessibleFolderIds.length > 0) {
      fileQuery += ` OR fil.folder_id = ANY($4::uuid[])`;
      fileParams.push(accessibleFolderIds);
    }
    fileQuery += `) ORDER BY fil.name ASC;`;

    const fileRes = await db.query(fileQuery, fileParams);
    const accessibleFiles = (fileRes.rows || []).map(f => {
      const parentPath = f.folder_id ? getFolderPath(f.folder_id) : '';
      return {
        id: f.id,
        name: f.name,
        virtualPath: parentPath ? `${parentPath}\\${f.name}` : `\\${f.name}`,
        size_bytes: f.size_bytes ? f.size_bytes.toString() : '0',
        sha256: f.sha256 || ''
      };
    });

    const rootFoldersPayload = accessibleFolders.map(f => ({
      id: f.id,
      name: f.name,
      parentId: f.parent_id,
      virtualPath: getFolderPath(f.id),
      departmentId: f.department_id,
      permission: f.owner_id === userId ? 'OWNER' : 'READ_WRITE'
    }));

    res.json({
      success: true,
      tree: {
        rootFolders: rootFoldersPayload,
        files: accessibleFiles
      },
      rootFolders: rootFoldersPayload,
      files: accessibleFiles,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[DRIVE GET TREE ERROR]', err);
    res.status(500).json({ error: 'Failed to retrieve directory tree', code: 'TREE_QUERY_ERROR' });
  }
}
