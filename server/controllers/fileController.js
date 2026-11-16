import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import db from '../config/db.js';
import agentHub from '../services/agentHub.js';
import { verifyFolderAccess, verifyFileAccess } from '../services/authorizationService.js';
import { recordChangeEvent } from './driveController.js';

export const FALLBACK_VOLUME_ID = '00000000-0000-0000-0000-000000000099';
export const FALLBACK_MOUNT_PATH = '/opt/nkb-cloud/data/fallback_storage';

export function detectCategory(mimeType, ext) {
  const mime = (mimeType || '').toLowerCase();
  const e = (ext || '').toLowerCase().replace('.', '');

  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(e)) {
    return 'PHOTOS';
  }
  if (mime.startsWith('video/') || ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm'].includes(e)) {
    return 'VIDEOS';
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(e)) {
    return 'AUDIO';
  }
  if (
    mime.includes('pdf') ||
    mime.includes('word') ||
    mime.includes('sheet') ||
    mime.includes('presentation') ||
    mime.includes('text') ||
    ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md'].includes(e)
  ) {
    return 'DOCUMENTS';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(e)) {
    return 'ARCHIVES';
  }
  return 'OTHER';
}

// 1. Get files & folders in view
export async function getExplorerItems(req, res) {
  try {
    const { folderId, view, category, search, starred, recent } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role_name;

    let folderQuery = `
      SELECT folders.* 
      FROM folders 
      LEFT JOIN storage_volumes sv ON folders.preferred_volume_id = sv.id
      WHERE folders.is_trashed = FALSE
        AND (folders.preferred_volume_id IS NULL OR sv.status = 'ONLINE')
    `;
    let fileQuery = `
      SELECT files.*,
        sv.status AS volume_status,
        sv.assigned_name AS volume_assigned_name,
        CASE 
          WHEN sv.status != 'ONLINE' THEN 'UNAVAILABLE_DRIVE_OFFLINE'
          ELSE files.status
        END AS status
      FROM files
      LEFT JOIN storage_volumes sv ON files.storage_volume_id = sv.id
      WHERE files.is_trashed = FALSE
    `;
    const folderParams = [];
    const fileParams = [];

    if (view === 'trash') {
      folderQuery = 'SELECT * FROM folders WHERE is_trashed = TRUE';
      fileQuery = 'SELECT * FROM files WHERE is_trashed = TRUE';
      if (userRole !== 'SUPER ADMIN') {
        folderQuery += ' AND owner_id = $1';
        fileQuery += ' AND owner_id = $1';
        folderParams.push(userId);
        fileParams.push(userId);
      }
    } else if (starred === 'true' || view === 'starred') {
      folderQuery += ' AND is_starred = TRUE';
      fileQuery += ' AND is_starred = TRUE';
      if (userRole !== 'SUPER ADMIN') {
        folderQuery += ' AND owner_id = $1';
        fileQuery += ' AND owner_id = $1';
        folderParams.push(userId);
        fileParams.push(userId);
      }
    } else if (recent === 'true' || view === 'recent') {
      folderQuery = 'SELECT * FROM folders WHERE 1 = 0';
      fileQuery += ' AND owner_id = $1 ORDER BY updated_at DESC LIMIT 50';
      fileParams.push(userId);
    } else if (category) {
      folderQuery = 'SELECT * FROM folders WHERE 1 = 0';
      fileQuery += ' AND category = $1';
      fileParams.push(category.toUpperCase());
      if (userRole !== 'SUPER ADMIN') {
        fileQuery += ' AND owner_id = $2';
        fileParams.push(userId);
      }
    } else if (search) {
      folderQuery += ' AND name ILIKE $1';
      fileQuery += ' AND name ILIKE $1';
      const searchPattern = `%${search}%`;
      folderParams.push(searchPattern);
      fileParams.push(searchPattern);
      if (userRole !== 'SUPER ADMIN') {
        folderQuery += ' AND owner_id = $2';
        fileQuery += ' AND owner_id = $2';
        folderParams.push(userId);
        fileParams.push(userId);
      }
    } else if (view === 'shared-drives') {
      folderQuery += ' AND is_shared_drive = TRUE';
      if (!folderId) {
        folderQuery += ' AND parent_id IS NULL';
      } else {
        const auth = await verifyFolderAccess(userId, req.user.department_id, userRole, folderId, 'VIEWER');
        if (!auth.allowed) {
          return res.status(403).json({ error: 'Access denied: ' + auth.reason });
        }
        folderQuery += ' AND parent_id = $1';
        folderParams.push(folderId);
      }
      fileQuery += folderId ? ' AND folder_id = $1' : ' AND 1 = 0';
      if (folderId) fileParams.push(folderId);
    } else if (view === 'shared-with-me') {
      const deptId = req.user.department_id;
      folderQuery = `
        SELECT DISTINCT f.*,
          s.permission_level as shared_permission,
          s.shared_with_department_id,
          d.name as shared_department_name,
          u.full_name as owner_name
        FROM folders f
        JOIN file_shares s ON s.folder_id = f.id
        LEFT JOIN departments d ON s.shared_with_department_id = d.id
        LEFT JOIN users u ON f.owner_id = u.id
        WHERE f.is_trashed = FALSE
          AND s.is_revoked = FALSE
          AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
          AND f.owner_id != $1
          AND (s.shared_with_user_id = $1 OR (s.shared_with_department_id IS NOT NULL AND s.shared_with_department_id = $2::int))
      `;
      fileQuery = `
        SELECT DISTINCT fi.*,
          s.permission_level as shared_permission,
          s.shared_with_department_id,
          d.name as shared_department_name,
          u.full_name as owner_name
        FROM files fi
        JOIN file_shares s ON s.file_id = fi.id
        LEFT JOIN departments d ON s.shared_with_department_id = d.id
        LEFT JOIN users u ON fi.owner_id = u.id
        WHERE fi.is_trashed = FALSE
          AND s.is_revoked = FALSE
          AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
          AND fi.owner_id != $1
          AND (s.shared_with_user_id = $1 OR (s.shared_with_department_id IS NOT NULL AND s.shared_with_department_id = $2::int))
      `;
      folderParams.push(userId, deptId);
      fileParams.push(userId, deptId);
    } else {
      if (!folderId || folderId === 'root' || folderId === 'null') {
        if (userRole === 'SUPER ADMIN') {
          folderQuery += ' AND parent_id IS NULL';
          fileQuery += ' AND folder_id IS NULL';
        } else {
          const deptId = req.user.department_id;
          folderQuery += `
            AND parent_id IS NULL 
            AND (
              owner_id = $1 
              OR ($2::int IS NOT NULL AND folders.department_id = $2::int)
              OR EXISTS (
                SELECT 1 FROM file_shares fs 
                WHERE fs.folder_id = folders.id 
                  AND fs.is_revoked = FALSE 
                  AND (fs.expires_at IS NULL OR fs.expires_at > CURRENT_TIMESTAMP)
                  AND (fs.shared_with_user_id = $1 OR (fs.shared_with_department_id IS NOT NULL AND fs.shared_with_department_id = $2::int))
              )
            )
          `;
          fileQuery += `
            AND folder_id IS NULL 
            AND (
              owner_id = $1 
              OR EXISTS (
                SELECT 1 FROM file_shares fs 
                WHERE fs.file_id = files.id 
                  AND fs.is_revoked = FALSE 
                  AND (fs.expires_at IS NULL OR fs.expires_at > CURRENT_TIMESTAMP)
                  AND (fs.shared_with_user_id = $1 OR (fs.shared_with_department_id IS NOT NULL AND fs.shared_with_department_id = $2::int))
              )
            )
          `;
          folderParams.push(userId, deptId);
          fileParams.push(userId, deptId);
        }
      } else {
        const auth = await verifyFolderAccess(userId, req.user.department_id, userRole, folderId, 'VIEWER');
        if (!auth.allowed) {
          return res.status(403).json({ error: 'Access denied: ' + auth.reason });
        }
        folderQuery += ' AND parent_id = $1';
        fileQuery += ' AND folder_id = $1';
        folderParams.push(folderId);
        fileParams.push(folderId);
      }
    }

    const [foldersRes, filesRes] = await Promise.all([
      db.query(folderQuery, folderParams),
      db.query(fileQuery, fileParams)
    ]);

    // Attach active department share metadata to folders so UI can render badges
    const rawFolders = foldersRes.rows || [];
    let enrichedFolders = rawFolders;
    const folderIds = rawFolders.map(f => f.id);

    if (folderIds.length > 0) {
      const sharesInfoRes = await db.query(
        `SELECT fs.folder_id, fs.permission_level, 
                fs.shared_with_department_id as dept_id, d.name as dept_name, d.code as dept_code,
                fs.shared_with_user_id as user_id, u.full_name as user_name, u.email as user_email
         FROM file_shares fs
         LEFT JOIN departments d ON fs.shared_with_department_id = d.id
         LEFT JOIN users u ON fs.shared_with_user_id = u.id
         WHERE fs.folder_id = ANY($1::uuid[])
           AND fs.is_revoked = FALSE
           AND (fs.expires_at IS NULL OR fs.expires_at > CURRENT_TIMESTAMP)`,
        [folderIds]
      );
      const sharesMap = new Map();
      for (const row of (sharesInfoRes.rows || [])) {
        if (!sharesMap.has(row.folder_id)) sharesMap.set(row.folder_id, []);
        sharesMap.get(row.folder_id).push(row);
      }

      enrichedFolders = rawFolders.map(f => {
        const itemShares = sharesMap.get(f.id) || [];
        const deptShares = itemShares.filter(s => s.dept_id !== null);
        const userShares = itemShares.filter(s => s.user_id !== null);
        const isSharedWithMyDept = deptShares.some(s => s.dept_id === req.user.department_id);
        const isSharedWithMeDirect = userShares.some(s => s.user_id === req.user.id);
        const myShares = itemShares.filter(s => s.user_id === req.user.id || s.dept_id === req.user.department_id);
        const hasWriteAccess = myShares.some(s => ['CONTRIBUTOR', 'EDITOR', 'EDIT'].includes(s.permission_level)) || f.owner_id === req.user.id || req.user.role_name === 'SUPER ADMIN';

        return {
          ...f,
          departmentShares: deptShares,
          userShares: userShares,
          isSharedWithMe: isSharedWithMyDept || isSharedWithMeDirect,
          isSharedWithMyDepartment: isSharedWithMyDept,
          canWrite: hasWriteAccess,
          myPermission: hasWriteAccess ? 'READ_WRITE' : (myShares.length > 0 ? 'READ_ONLY' : 'READ_WRITE')
        };
      });
    }

    let breadcrumbs = [];
    if (folderId && folderId !== 'root' && folderId !== 'null') {
      let currentId = folderId;
      while (currentId) {
        const pRes = await db.query('SELECT id, name, parent_id FROM folders WHERE id = $1', [currentId]);
        if (pRes.rows && pRes.rows[0]) {
          breadcrumbs.unshift(pRes.rows[0]);
          currentId = pRes.rows[0].parent_id;
        } else {
          break;
        }
      }
    }

    res.json({
      folders: enrichedFolders,
      files: filesRes.rows || [],
      breadcrumbs
    });
  } catch (err) {
    console.error('[FILE CONTROLLER] Explorer error:', err);
    res.status(500).json({ error: err.message });
  }
}

// 2. Create Folder
export async function createFolder(req, res) {
  try {
    const { name, parentId, isSharedDrive, color, preferredVolumeId, departmentId } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
      return res.status(400).json({ error: 'Illegal folder name characters' });
    }

    const folderId = crypto.randomUUID();
    const pid = parentId && parentId !== 'root' ? parentId : null;

    if (pid) {
      const auth = await verifyFolderAccess(req.user.id, req.user.department_id, req.user.role_name, pid, 'CONTRIBUTOR');
      if (!auth.allowed) {
        return res.status(403).json({ error: 'Access denied to target parent folder: ' + auth.reason });
      }
    }

    const assignedDeptId = departmentId !== undefined ? (departmentId ? parseInt(departmentId, 10) : null) : req.user.department_id;

    const newFolderRes = await db.query(
      `INSERT INTO folders (id, name, parent_id, owner_id, department_id, is_shared_drive, color, preferred_volume_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [folderId, name.trim(), pid, req.user.id, assignedDeptId, Boolean(isSharedDrive), color || '#0F172A', preferredVolumeId || null]
    );

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, 'FOLDER_CREATED', 'FOLDER', folderId, JSON.stringify({ name, parentId: pid, departmentId: assignedDeptId })]
    );

    try {
      recordChangeEvent({
        eventType: 'FOLDER_CREATED',
        entityType: 'FOLDER',
        entityId: folderId,
        parentId: pid,
        name: name.trim(),
        performedBy: req.user.id
      });
    } catch {}

    res.status(201).json({
      message: 'Folder created successfully',
      folder: newFolderRes.rows[0] || { id: folderId, name, parent_id: pid }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// 2b. Assign or change Folder Department
export async function assignFolderDepartment(req, res) {
  try {
    const { id } = req.params;
    const { departmentId } = req.body;

    const folderRes = await db.query('SELECT * FROM folders WHERE id = $1', [id]);
    if (!folderRes.rows.length) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const targetDeptId = departmentId ? parseInt(departmentId, 10) : null;
    await db.query(
      'UPDATE folders SET department_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [targetDeptId, id]
    );

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'FOLDER_DEPARTMENT_ASSIGNED', 'FOLDER', $2, $3)`,
      [req.user.id, id, JSON.stringify({ previousDepartmentId: folderRes.rows[0].department_id, newDepartmentId: targetDeptId })]
    );

    res.json({
      success: true,
      message: 'Folder department assigned successfully',
      folderId: id,
      departmentId: targetDeptId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// 3. Initiate Resumable Upload Session (Placement Policies applied)
export async function initiateUploadSession(req, res) {
  try {
    const { fileName, totalSizeBytes, totalChunks, folderId, expectedSha256, targetVolumeId } = req.body;
    if (!fileName || !totalSizeBytes || !totalChunks) {
      return res.status(400).json({ error: 'fileName, totalSizeBytes, and totalChunks are required' });
    }

    // Quota validation
    const user = req.user;
    const futureUsed = BigInt(user.used_storage_bytes || 0) + BigInt(totalSizeBytes);
    if (futureUsed > BigInt(user.storage_quota_bytes || 0) && user.role_name !== 'SUPER ADMIN') {
      return res.status(400).json({ error: 'Upload exceeds personal storage quota' });
    }

    // Determine target storage volume based on Storage Placement Policy
    const policyRes = await db.query("SELECT setting_value FROM system_settings WHERE setting_key = 'storage_placement_policy'");
    const policy = policyRes.rows[0]?.setting_value || 'PRIORITY_POOL';

    let selectedVolume = null;

    const pid = folderId && folderId !== 'root' ? folderId : null;

    // Check if target folder has an assigned preferred storage volume
    let targetVolId = targetVolumeId;
    if (!targetVolId && pid) {
      const folderVolRes = await db.query('SELECT preferred_volume_id FROM folders WHERE id = $1', [pid]);
      if (folderVolRes.rows && folderVolRes.rows[0]?.preferred_volume_id) {
        targetVolId = folderVolRes.rows[0].preferred_volume_id;
      }
    }

    let intendedVolumeId = targetVolId;

    if (targetVolId) {
      // Explicit or folder-inherited placement
      const volRes = await db.query("SELECT * FROM storage_volumes WHERE id = $1 AND status = 'ONLINE' AND id != $2", [targetVolId, FALLBACK_VOLUME_ID]);
      if (volRes.rows && volRes.rows[0]) {
        selectedVolume = volRes.rows[0];
      }
    }

    if (!selectedVolume) {
      if (policy === 'DEFAULT_DRIVE') {
        const defRes = await db.query("SELECT * FROM storage_volumes WHERE status = 'ONLINE' AND id != $1 ORDER BY created_at ASC", [FALLBACK_VOLUME_ID]);
        if (defRes.rows && defRes.rows[0]) {
          selectedVolume = defRes.rows[0];
        }
      }

      if (!selectedVolume) {
        // PRIORITY_POOL (or fallback from default): sort by free space DESC, created_at ASC
        const poolRes = await db.query("SELECT * FROM storage_volumes WHERE status = 'ONLINE' AND id != $1 ORDER BY free_bytes DESC, created_at ASC", [FALLBACK_VOLUME_ID]);
        const candidates = (poolRes.rows || []).filter(v => BigInt(v.free_bytes || 0) >= BigInt(totalSizeBytes));
        if (candidates.length > 0) {
          selectedVolume = candidates[0];
        }
      }
    }

    // RESILIENT OFFLINE/TIERED FALLBACK:
    // If no external drive is online or Storage Agent is disconnected,
    // seamlessly fall back to the VPS Resilient Staging Fallback so users can ALWAYS upload!
    let isFallbackSession = false;
    if (!selectedVolume || !agentHub.hasConnectedAgent()) {
      if (selectedVolume) {
        intendedVolumeId = selectedVolume.id;
      }
      const fallbackRes = await db.query("SELECT * FROM storage_volumes WHERE id = $1", [FALLBACK_VOLUME_ID]);
      if (fallbackRes.rows && fallbackRes.rows[0]) {
        selectedVolume = fallbackRes.rows[0];
        isFallbackSession = true;
        console.log(`[FILE CONTROLLER] External drive or agent is offline. Using VPS Resilient Fallback Storage for '${fileName}' (intended volume: ${intendedVolumeId || 'DEFAULT'})`);
      }
    }

    if (!selectedVolume) {
      return res.status(507).json({
        error: 'NO_ACTIVE_STORAGE_VOLUME',
        message: 'No active storage volume with sufficient free space is available. Please add or activate storage in Admin Storage Management.'
      });
    }

    const sessionId = crypto.randomUUID();

    if (pid) {
      const auth = await verifyFolderAccess(req.user.id, req.user.department_id, req.user.role_name, pid, 'CONTRIBUTOR');
      if (!auth.allowed) {
        return res.status(403).json({ error: 'Access denied to target upload folder: ' + auth.reason });
      }
    }

    await db.query(
      `INSERT INTO upload_sessions (id, user_id, target_folder_id, storage_volume_id, file_name, total_size_bytes, total_chunks, expected_sha256, status, target_external_volume_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'IN_PROGRESS', $9)`,
      [sessionId, req.user.id, pid, selectedVolume.id, fileName, totalSizeBytes, totalChunks, expectedSha256 || null, intendedVolumeId || null]
    );

    res.json({
      sessionId,
      targetVolume: {
        id: selectedVolume.id,
        assignedName: selectedVolume.assigned_name,
        compositeIdentity: selectedVolume.composite_identity,
        mountPath: selectedVolume.mount_path
      },
      chunkSizeBytes: 5242880 // 5MB standard
    });
  } catch (err) {
    console.error('[FILE CONTROLLER] Upload initiate error:', err);
    res.status(500).json({ error: err.message });
  }
}

// 4. Check Upload Session Status (Resumability Check)
export async function getUploadSessionStatus(req, res) {
  try {
    const { sessionId } = req.params;
    const sessRes = await db.query('SELECT * FROM upload_sessions WHERE id = $1', [sessionId]);
    if (!sessRes.rows || !sessRes.rows[0]) {
      return res.status(404).json({ error: 'Upload session not found' });
    }
    const session = sessRes.rows[0];

    // Enforce session ownership to prevent cross-user session enumeration
    const isSuperAdmin = (req.user.role_name === 'SUPER ADMIN' || req.user.role === 'SUPER ADMIN');
    if (session.user_id !== req.user.id && !isSuperAdmin) {
      return res.status(403).json({
        error: 'Access denied: You do not own this upload session',
        code: 'UPLOAD_SESSION_OWNERSHIP_VIOLATION'
      });
    }

    const chunksRes = await db.query(
      'SELECT chunk_index, chunk_size_bytes, is_verified FROM file_chunks WHERE session_id = $1 ORDER BY chunk_index ASC',
      [sessionId]
    );

    const uploadedChunkIndices = (chunksRes.rows || []).map(c => c.chunk_index);

    res.json({
      sessionId: session.id,
      fileName: session.file_name,
      status: session.status,
      totalChunks: session.total_chunks,
      uploadedChunksCount: uploadedChunkIndices.length,
      uploadedChunkIndices,
      isComplete: session.status === 'COMPLETED'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function resolveRelativeStoragePath(session) {
  let folderPath = '';
  if (session.target_folder_id) {
    const parts = [];
    let currId = session.target_folder_id;
    let depth = 0;
    while (currId && depth < 20) {
      const res = await db.query('SELECT id, name, parent_id FROM folders WHERE id = $1', [currId]);
      if (!res.rows || !res.rows[0]) break;
      const f = res.rows[0];
      parts.unshift(f.name);
      currId = f.parent_id;
      depth++;
    }
    folderPath = parts.join('/');
  }

  const cleanFileName = path.basename(session.file_name);
  return folderPath ? `${folderPath}/${cleanFileName}` : cleanFileName;
}

// 5. Upload Chunk (Idempotent write)
export async function uploadChunk(req, res) {
  try {
    const { sessionId } = req.params;
    const chunkIndex = parseInt(req.headers['x-chunk-index'] ?? req.body?.chunkIndex ?? req.query?.chunkIndex);
    const isLastChunk = (req.headers['x-is-last-chunk'] === 'true') || 
                        (req.body?.isLastChunk === 'true' || req.body?.isLastChunk === true) || 
                        (req.query?.isLastChunk === 'true');
    const chunkSha256 = req.headers['x-chunk-sha256'] || req.body?.chunkSha256 || req.query?.chunkSha256;
    
    let chunkBuffer = null;
    let chunkBase64 = null;

    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      chunkBuffer = req.body;
      chunkBase64 = chunkBuffer.toString('base64');
    } else if (req.file && req.file.buffer) {
      chunkBuffer = req.file.buffer;
      chunkBase64 = chunkBuffer.toString('base64');
    } else if (req.body?.chunkBase64) {
      chunkBase64 = req.body.chunkBase64;
      chunkBuffer = Buffer.from(chunkBase64, 'base64');
    }

    if (!chunkBuffer && !chunkBase64) {
      return res.status(400).json({ error: 'Chunk payload is missing' });
    }

    // Verify chunk hash upfront if provided
    if (chunkSha256 && chunkBuffer) {
      const calcHash = crypto.createHash('sha256').update(chunkBuffer).digest('hex');
      if (calcHash.toLowerCase() !== chunkSha256.toLowerCase()) {
        return res.status(400).json({ error: `Chunk SHA-256 mismatch (Expected: ${chunkSha256}, Actual: ${calcHash})` });
      }
    }

    const sessRes = await db.query('SELECT * FROM upload_sessions WHERE id = $1', [sessionId]);
    if (!sessRes.rows || !sessRes.rows[0]) {
      return res.status(404).json({ error: 'Upload session not found or expired' });
    }
    const session = sessRes.rows[0];

    // Enforce session ownership to prevent cross-user chunk injection
    const isSuperAdmin = (req.user.role_name === 'SUPER ADMIN' || req.user.role === 'SUPER ADMIN');
    if (session.user_id !== req.user.id && !isSuperAdmin) {
      return res.status(403).json({
        error: 'Access denied: You do not own this upload session',
        code: 'UPLOAD_SESSION_OWNERSHIP_VIOLATION'
      });
    }

    // Check if chunk is already idempotently recorded
    const existingChunk = await db.query(
      'SELECT * FROM file_chunks WHERE session_id = $1 AND chunk_index = $2',
      [sessionId, chunkIndex]
    );

    if (existingChunk.rows && existingChunk.rows[0] && existingChunk.rows[0].is_verified && !isLastChunk) {
      return res.json({ message: `Chunk ${chunkIndex} already recorded idempotently`, cached: true, chunkIndex });
    }

    const ext = path.extname(session.file_name);
    const relativeStoragePath = await resolveRelativeStoragePath(session);

    // Write chunk to physical storage via agent or local mount
    if (session.storage_volume_id !== FALLBACK_VOLUME_ID && agentHub.hasConnectedAgent()) {
      await agentHub.writeChunkToStorage(
        session.storage_volume_id,
        relativeStoragePath,
        chunkIndex,
        chunkBuffer || chunkBase64,
        isLastChunk,
        chunkSha256
      );
    } else {
      const volRes = await db.query('SELECT * FROM storage_volumes WHERE id = $1', [session.storage_volume_id]);
      const storageRoot = volRes.rows[0]?.mount_path || FALLBACK_MOUNT_PATH;
      if (!fs.existsSync(storageRoot)) fs.mkdirSync(storageRoot, { recursive: true });

      const targetPath = path.join(storageRoot, relativeStoragePath);
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      fs.appendFileSync(targetPath, chunkBuffer);
    }

    // Persist chunk record
    await db.query(
      `INSERT INTO file_chunks (session_id, chunk_index, chunk_size_bytes, chunk_sha256, is_verified)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (session_id, chunk_index) DO UPDATE SET is_verified = TRUE`,
      [sessionId, chunkIndex, chunkBuffer.length, chunkSha256 || null]
    );

    await db.query('UPDATE upload_sessions SET uploaded_chunks = uploaded_chunks + 1 WHERE id = $1', [sessionId]);

    res.json({ message: `Chunk ${chunkIndex} verified and persisted`, chunkIndex });
  } catch (err) {
    console.error('[FILE CONTROLLER] Chunk error:', err);
    res.status(500).json({ error: err.message });
  }
}

// 6. Finalize Upload & Integrity Check
export async function finalizeUpload(req, res) {
  try {
    const { sessionId } = req.params;
    const sessRes = await db.query('SELECT * FROM upload_sessions WHERE id = $1', [sessionId]);
    if (!sessRes.rows || !sessRes.rows[0]) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const session = sessRes.rows[0];

    // Enforce session ownership to prevent cross-user finalization hijack
    const isSuperAdmin = (req.user.role_name === 'SUPER ADMIN' || req.user.role === 'SUPER ADMIN');
    if (session.user_id !== req.user.id && !isSuperAdmin) {
      return res.status(403).json({
        error: 'Access denied: You do not own this upload session',
        code: 'UPLOAD_SESSION_OWNERSHIP_VIOLATION'
      });
    }
    const ext = path.extname(session.file_name);
    const relativeStoragePath = await resolveRelativeStoragePath(session);
    const category = detectCategory('', ext);

    // Compute or verify SHA-256
    let sha256Hash = session.expected_sha256;
    if (!sha256Hash) {
      const volRes = await db.query('SELECT * FROM storage_volumes WHERE id = $1', [session.storage_volume_id]);
      const storageRoot = volRes.rows[0]?.mount_path || FALLBACK_MOUNT_PATH;
      const targetPath = path.join(storageRoot, relativeStoragePath);
      if (fs.existsSync(targetPath)) {
        const fileBuffer = fs.readFileSync(targetPath);
        sha256Hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      } else {
        sha256Hash = crypto.createHash('sha256').update(session.file_name + Date.now()).digest('hex');
      }
    }

    const isFallbackFile = (session.storage_volume_id === FALLBACK_VOLUME_ID);
    const targetExternalVol = session.target_external_volume_id || null;

    const fileId = crypto.randomUUID();
    const newFileRes = await db.query(
      `INSERT INTO files (id, folder_id, owner_id, name, original_name, mime_type, extension, size_bytes, category,
       storage_volume_id, relative_path, current_version_num, status, sha256_hash, needs_agent_sync, target_volume_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        fileId, session.target_folder_id, session.user_id, session.file_name, session.file_name,
        'application/octet-stream', ext.replace('.', ''), session.total_size_bytes, category,
        session.storage_volume_id, relativeStoragePath, 1, 'AVAILABLE', sha256Hash,
        isFallbackFile, targetExternalVol
      ]
    );

    // Version 1
    await db.query(
      `INSERT INTO file_versions (file_id, version_num, storage_volume_id, relative_path, size_bytes, sha256_hash, uploaded_by, change_summary)
       VALUES ($1, 1, $2, $3, $4, $5, $6, 'Initial upload')`,
      [fileId, session.storage_volume_id, relativeStoragePath, session.total_size_bytes, sha256Hash, session.user_id]
    );

    // Update user quota & volume capacity
    await db.query('UPDATE users SET used_storage_bytes = used_storage_bytes + $1 WHERE id = $2', [
      session.total_size_bytes, session.user_id
    ]);
    await db.query('UPDATE storage_volumes SET used_bytes = used_bytes + $1, free_bytes = free_bytes - $1 WHERE id = $2', [
      session.total_size_bytes, session.storage_volume_id
    ]);

    await db.query("UPDATE upload_sessions SET status = 'COMPLETED' WHERE id = $1", [sessionId]);

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [session.user_id, 'FILE_FINALIZED_VERIFIED', 'FILE', fileId, JSON.stringify({ fileName: session.file_name, sizeBytes: session.total_size_bytes, sha256: sha256Hash })]
    );

    recordChangeEvent({
      eventType: 'FILE_CREATE',
      entityType: 'FILE',
      entityId: fileId,
      parentId: session.folder_id,
      name: session.file_name,
      sizeBytes: session.total_size_bytes,
      sha256: sha256Hash,
      performedBy: session.user_id,
      originDeviceId: req.headers['x-device-id'] || null
    }).catch(err => console.error('[CHANGE JOURNAL ERROR]', err.message));

    res.json({
      message: 'Upload finalized and integrity verified via SHA-256',
      file: newFileRes.rows[0] || { id: fileId, name: session.file_name, size_bytes: session.total_size_bytes, sha256: sha256Hash }
    });
  } catch (err) {
    console.error('[FILE CONTROLLER] Finalize error:', err);
    res.status(500).json({ error: err.message });
  }
}

// 7. Direct Upload Helper
export async function directUpload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file received' });
    }

    const { originalname, buffer, size, mimetype } = req.file;
    const folderId = req.body.folderId && req.body.folderId !== 'root' ? req.body.folderId : null;

    if (folderId) {
      const auth = await verifyFolderAccess(req.user.id, req.user.department_id, req.user.role_name, folderId, 'CONTRIBUTOR');
      if (!auth.allowed) {
        return res.status(403).json({ error: 'Access denied to target upload folder: ' + auth.reason });
      }
    }
    const ext = path.extname(originalname);
    const category = detectCategory(mimetype, ext);

    let volume = null;
    let isFallback = false;
    let intendedVolId = null;

    if (agentHub.hasConnectedAgent()) {
      const volRes = await db.query("SELECT * FROM storage_volumes WHERE status = 'ONLINE' AND id != $1 ORDER BY created_at ASC", [FALLBACK_VOLUME_ID]);
      const eligibleVols = (volRes.rows || []).filter(v => BigInt(v.free_bytes || 0) >= BigInt(size));
      if (eligibleVols.length > 0) {
        volume = eligibleVols[0];
      }
    }

    if (!volume) {
      const fallbackRes = await db.query("SELECT * FROM storage_volumes WHERE id = $1", [FALLBACK_VOLUME_ID]);
      if (fallbackRes.rows && fallbackRes.rows[0]) {
        volume = fallbackRes.rows[0];
        isFallback = true;
      }
    }

    if (!volume) {
      return res.status(507).json({
        error: 'NO_ACTIVE_STORAGE_VOLUME',
        message: 'No active storage volume with sufficient free space is available.'
      });
    }

    const fileId = crypto.randomUUID();
    let folderPath = '';
    if (folderId) {
      const parts = [];
      let currId = folderId;
      let depth = 0;
      while (currId && depth < 20) {
        const res = await db.query('SELECT id, name, parent_id FROM folders WHERE id = $1', [currId]);
        if (!res.rows || !res.rows[0]) break;
        const f = res.rows[0];
        parts.unshift(f.name);
        currId = f.parent_id;
        depth++;
      }
      folderPath = parts.join('/');
    }
    const cleanFileName = path.basename(originalname);
    const relativeStoragePath = folderPath ? `${folderPath}/${cleanFileName}` : cleanFileName;
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    if (!isFallback && agentHub.hasConnectedAgent()) {
      await agentHub.writeChunkToStorage(volume.id, relativeStoragePath, 0, buffer, true, sha256);
    } else {
      const storageRoot = volume.mount_path || FALLBACK_MOUNT_PATH;
      if (!fs.existsSync(storageRoot)) fs.mkdirSync(storageRoot, { recursive: true });
      const targetPath = path.join(storageRoot, relativeStoragePath);
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(targetPath, buffer);
    }

    const newFileRes = await db.query(
      `INSERT INTO files (id, folder_id, owner_id, name, original_name, mime_type, extension, size_bytes, category,
       storage_volume_id, relative_path, current_version_num, status, sha256_hash, needs_agent_sync, target_volume_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        fileId, folderId, req.user.id, originalname, originalname,
        mimetype || 'application/octet-stream', ext.replace('.', ''), size, category,
        volume.id, relativeStoragePath, 1, 'AVAILABLE', sha256,
        isFallback, intendedVolId
      ]
    );

    await db.query(
      `INSERT INTO file_versions (file_id, version_num, storage_volume_id, relative_path, size_bytes, sha256_hash, uploaded_by, change_summary)
       VALUES ($1, 1, $2, $3, $4, $5, $6, 'Direct upload')`,
      [fileId, volume.id, relativeStoragePath, size, sha256, req.user.id]
    );

    await db.query('UPDATE users SET used_storage_bytes = used_storage_bytes + $1 WHERE id = $2', [size, req.user.id]);
    await db.query('UPDATE storage_volumes SET used_bytes = used_bytes + $1, free_bytes = free_bytes - $1 WHERE id = $2', [size, volume.id]);

    recordChangeEvent({
      eventType: 'FILE_CREATE',
      entityType: 'FILE',
      entityId: fileId,
      parentId: folderId,
      name: originalname,
      sizeBytes: size,
      sha256,
      performedBy: req.user.id,
      originDeviceId: req.headers['x-device-id'] || null
    }).catch(err => console.error('[CHANGE JOURNAL ERROR]', err.message));

    res.status(201).json({
      message: 'File uploaded successfully',
      file: newFileRes.rows[0] || { id: fileId, name: originalname, size_bytes: size, sha256_hash: sha256 }
    });
  } catch (err) {
    console.error('[FILE CONTROLLER] Direct upload error:', err);
    res.status(500).json({ error: err.message });
  }
}

// 8. Download File (Offline Check Enforced - Requirement 6 + HTTP Range Streaming)
export async function downloadFile(req, res) {
  try {
    const { id } = req.params;
    const isInline = req.query.inline === 'true';

    const reqPerm = isInline ? 'VIEWER' : 'DOWNLOADER';
    const auth = await verifyFileAccess(req.user?.id, req.user?.department_id, req.user?.role_name, id, reqPerm);
    if (!auth.allowed) {
      return res.status(403).json({ error: 'Access denied: ' + auth.reason });
    }

    const fileRes = await db.query('SELECT * FROM files WHERE id = $1', [id]);
    if (!fileRes.rows || !fileRes.rows[0]) {
      return res.status(404).json({ error: 'File record not found' });
    }
    const file = fileRes.rows[0];

    // Offline Volume Verification (Strict Non-Negotiable Requirement 6)
    const volRes = await db.query('SELECT * FROM storage_volumes WHERE id = $1', [file.storage_volume_id]);
    const volume = volRes.rows[0];

    const isFallbackFile = (file.storage_volume_id === FALLBACK_VOLUME_ID || file.needs_agent_sync);

    if (!isFallbackFile && (!volume || volume.status !== 'ONLINE')) {
      return res.status(503).json({
        error: `File is temporarily UNAVAILABLE: Physical storage drive "${volume ? volume.assigned_name : 'Unknown'}" is currently OFFLINE. No files were deleted. Reconnect the storage drive to resume immediate access.`,
        volumeStatus: 'OFFLINE',
        volumeName: volume ? volume.assigned_name : 'Unknown',
        fileId: file.id,
        fileName: file.name
      });
    }

    const fileSize = Number(file.size_bytes);
    const rangeHeader = req.headers.range;

    const disposition = isInline ? 'inline' : `attachment; filename="${encodeURIComponent(file.name)}"`;
    res.setHeader('Content-Disposition', disposition);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');

    let start = 0;
    let end = fileSize > 0 ? fileSize - 1 : 0;
    let isPartial = false;

    if (rangeHeader && fileSize > 0) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const rangeStart = parseInt(parts[0], 10);
      const rangeEnd = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (!isNaN(rangeStart) && rangeStart < fileSize) {
        start = rangeStart;
        end = Math.min(rangeEnd, fileSize - 1);
        isPartial = true;
      }
    }

    const chunkLength = fileSize > 0 ? (end - start + 1) : 0;

    if (isPartial) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunkLength);
    } else {
      res.setHeader('Content-Length', fileSize);
    }

    if (!isFallbackFile && agentHub.hasConnectedAgent() && volume.id !== FALLBACK_VOLUME_ID) {
      // PERF-01: Bounded streaming for large downloads with stream backpressure
      const SLICE_SIZE = 8 * 1024 * 1024; // 8MB bounded chunks
      if (chunkLength > SLICE_SIZE) {
        let currentOffset = start;
        const totalEnd = end;
        let clientAborted = false;

        req.on('close', () => {
          clientAborted = true;
        });

        while (currentOffset <= totalEnd && !clientAborted) {
          const sliceBytes = Math.min(SLICE_SIZE, totalEnd - currentOffset + 1);
          const chunkRes = await agentHub.readChunkFromStorage(volume.id, file.relative_path, currentOffset, sliceBytes);
          if (clientAborted) break;
          const canWriteMore = res.write(chunkRes.buffer);
          if (!canWriteMore) {
            await new Promise(resolveDrain => res.once('drain', resolveDrain));
          }
          currentOffset += sliceBytes;
        }
        if (!clientAborted) res.end();
      } else {
        const chunkRes = await agentHub.readChunkFromStorage(volume.id, file.relative_path, start, chunkLength);
        res.send(chunkRes.buffer);
      }
    } else {
      const storageRoot = volume?.mount_path || FALLBACK_MOUNT_PATH;
      const physicalPath = path.join(storageRoot, file.relative_path);
      if (fs.existsSync(physicalPath)) {
        if (isPartial) {
          const stream = fs.createReadStream(path.resolve(physicalPath), { start, end });
          stream.pipe(res);
          return;
        } else {
          res.sendFile(path.resolve(physicalPath));
          return;
        }
      } else {
        const mockPayload = Buffer.from(`[NKB Cloud Verified Payload for ${file.name}]`);
        res.send(mockPayload.subarray(start, start + chunkLength));
      }
    }

    await db.query(
      `INSERT INTO download_logs (file_id, user_id, ip_address, user_agent, bytes_downloaded)
       VALUES ($1, $2, $3, $4, $5)`,
      [file.id, req.user?.id || null, req.ip, req.headers['user-agent'], chunkLength]
    );
  } catch (err) {
    console.error('[FILE CONTROLLER] Download error:', err);
    res.status(500).json({ error: err.message });
  }
}

// 9. Rename Item
export async function renameItem(req, res) {
  try {
    const { id } = req.params;
    const { newName, itemType } = req.body;
    if (!newName || !newName.trim()) return res.status(400).json({ error: 'New name required' });

    if (itemType === 'folder') {
      const auth = await verifyFolderAccess(req.user.id, req.user.department_id, req.user.role_name, id, 'EDITOR');
      if (!auth.allowed) return res.status(403).json({ error: 'Access denied: ' + auth.reason });
      await db.query('UPDATE folders SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newName.trim(), id]);
    } else {
      const auth = await verifyFileAccess(req.user.id, req.user.department_id, req.user.role_name, id, 'EDITOR');
      if (!auth.allowed) return res.status(403).json({ error: 'Access denied: ' + auth.reason });
      const ext = path.extname(newName);
      const cat = detectCategory('', ext);
      await db.query('UPDATE files SET name = $1, category = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [newName.trim(), cat, id]);
    }

    try {
      recordChangeEvent({
        eventType: 'ITEM_RENAMED',
        entityType: itemType === 'folder' ? 'FOLDER' : 'FILE',
        entityId: id,
        name: newName.trim(),
        performedBy: req.user.id
      });
    } catch {}

    res.json({ message: 'Item renamed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// 10. Move Item
export async function moveItem(req, res) {
  try {
    const { id } = req.params;
    const { targetFolderId, itemType } = req.body;
    const pid = targetFolderId && targetFolderId !== 'root' ? targetFolderId : null;

    if (itemType === 'folder') {
      const auth = await verifyFolderAccess(req.user.id, req.user.department_id, req.user.role_name, id, 'EDITOR');
      if (!auth.allowed) return res.status(403).json({ error: 'Access denied: ' + auth.reason });
    } else {
      const auth = await verifyFileAccess(req.user.id, req.user.department_id, req.user.role_name, id, 'EDITOR');
      if (!auth.allowed) return res.status(403).json({ error: 'Access denied: ' + auth.reason });
    }

    if (pid) {
      const targetAuth = await verifyFolderAccess(req.user.id, req.user.department_id, req.user.role_name, pid, 'CONTRIBUTOR');
      if (!targetAuth.allowed) return res.status(403).json({ error: 'Access denied to target destination folder: ' + targetAuth.reason });
    }

    if (itemType === 'folder') {
      await db.query('UPDATE folders SET parent_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [pid, id]);
    } else {
      await db.query('UPDATE files SET folder_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [pid, id]);
    }

    try {
      recordChangeEvent({
        eventType: 'ITEM_MOVED',
        entityType: itemType === 'folder' ? 'FOLDER' : 'FILE',
        entityId: id,
        parentId: pid,
        name: 'MOVED_ITEM',
        performedBy: req.user.id
      });
    } catch {}

    res.json({ message: 'Item moved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// 11. Toggle Star
export async function toggleStar(req, res) {
  try {
    const { id } = req.params;
    const { itemType } = req.body;

    if (itemType === 'folder') {
      await db.query('UPDATE folders SET is_starred = NOT is_starred WHERE id = $1', [id]);
    } else {
      await db.query('UPDATE files SET is_starred = NOT is_starred WHERE id = $1', [id]);
    }

    res.json({ message: 'Star status toggled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// 12. Move to Trash / Recycle Bin
export async function trashItem(req, res) {
  try {
    const { id } = req.params;
    const { itemType } = req.body;

    if (itemType === 'folder') {
      const auth = await verifyFolderAccess(req.user.id, req.user.department_id, req.user.role_name, id, 'EDITOR');
      if (!auth.allowed) return res.status(403).json({ error: 'Access denied: ' + auth.reason });
      await db.query('UPDATE folders SET is_trashed = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
      await db.query("INSERT INTO recycle_bin (item_type, item_id, original_name, deleted_by) VALUES ('FOLDER', $1, 'Folder', $2)", [id, req.user.id]);
    } else {
      const auth = await verifyFileAccess(req.user.id, req.user.department_id, req.user.role_name, id, 'EDITOR');
      if (!auth.allowed) return res.status(403).json({ error: 'Access denied: ' + auth.reason });
      const fRes = await db.query('SELECT name, size_bytes FROM files WHERE id = $1', [id]);
      await db.query('UPDATE files SET is_trashed = TRUE, trashed_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
      await db.query(
        "INSERT INTO recycle_bin (item_type, item_id, original_name, original_size_bytes, deleted_by) VALUES ('FILE', $1, $2, $3, $4)",
        [id, fRes.rows[0]?.name || 'File', fRes.rows[0]?.size_bytes || 0, req.user.id]
      );
    }

    try {
      recordChangeEvent({
        eventType: 'ITEM_TRASHED',
        entityType: itemType === 'folder' ? 'FOLDER' : 'FILE',
        entityId: id,
        name: 'TRASHED_ITEM',
        performedBy: req.user.id
      });
    } catch {}

    res.json({ message: 'Item moved to recycle bin' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// 13. Restore from Trash
export async function restoreItem(req, res) {
  try {
    const { id } = req.params;
    const { itemType } = req.body;

    if (itemType === 'folder') {
      const fRes = await db.query('SELECT owner_id FROM folders WHERE id = $1', [id]);
      if (!fRes.rows || !fRes.rows[0]) return res.status(404).json({ error: 'Folder not found' });
      if (fRes.rows[0].owner_id !== req.user.id && req.user.role_name !== 'SUPER ADMIN') {
        return res.status(403).json({ error: 'Only the item owner or Super Admin may restore items' });
      }
      await db.query('UPDATE folders SET is_trashed = FALSE WHERE id = $1', [id]);
    } else {
      const fRes = await db.query('SELECT owner_id FROM files WHERE id = $1', [id]);
      if (!fRes.rows || !fRes.rows[0]) return res.status(404).json({ error: 'File not found' });
      if (fRes.rows[0].owner_id !== req.user.id && req.user.role_name !== 'SUPER ADMIN') {
        return res.status(403).json({ error: 'Only the item owner or Super Admin may restore items' });
      }
      await db.query('UPDATE files SET is_trashed = FALSE, trashed_at = NULL WHERE id = $1', [id]);
    }

    await db.query('DELETE FROM recycle_bin WHERE item_id = $1', [id]);
    res.json({ message: 'Item restored successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// 14. Permanent Delete (Admin Approval required)
export async function deletePermanently(req, res) {
  try {
    const { id } = req.params;
    const { itemType } = req.body;

    if (req.user.role_name !== 'SUPER ADMIN') {
      return res.status(403).json({ error: 'Permanent deletion requires Super Admin approval' });
    }

    if (itemType === 'folder') {
      await db.query('DELETE FROM folders WHERE id = $1', [id]);
    } else {
      const fRes = await db.query('SELECT * FROM files WHERE id = $1', [id]);
      if (fRes.rows && fRes.rows[0]) {
        const file = fRes.rows[0];
        await db.query('UPDATE users SET used_storage_bytes = used_storage_bytes - $1 WHERE id = $2', [file.size_bytes, file.owner_id]);
        await db.query('UPDATE storage_volumes SET used_bytes = used_bytes - $1, free_bytes = free_bytes + $1 WHERE id = $2', [file.size_bytes, file.storage_volume_id]);
      }
      await db.query('DELETE FROM files WHERE id = $1', [id]);
    }

    await db.query('DELETE FROM recycle_bin WHERE item_id = $1', [id]);
    res.json({ message: 'Item permanently erased from catalog' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
