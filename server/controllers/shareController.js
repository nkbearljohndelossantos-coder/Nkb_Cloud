import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import db from '../config/db.js';

export const PERMISSION_TIERS = {
  VIEWER: 'VIEWER',
  DOWNLOADER: 'DOWNLOADER',
  CONTRIBUTOR: 'CONTRIBUTOR',
  EDITOR: 'EDITOR'
};

const LEGACY_MAP = {
  'VIEW': 'VIEWER',
  'VIEWER': 'VIEWER',
  'DOWNLOAD_ONLY': 'DOWNLOADER',
  'DOWNLOADER': 'DOWNLOADER',
  'CONTRIBUTOR': 'CONTRIBUTOR',
  'EDIT': 'EDITOR',
  'EDITOR': 'EDITOR'
};

export function normalizePermissionLevel(input) {
  if (!input) return 'VIEWER';
  const upper = String(input).trim().toUpperCase();
  const normalized = LEGACY_MAP[upper];
  if (!normalized) {
    throw new Error(`Invalid permission level: "${input}". Allowed: VIEWER, DOWNLOADER, CONTRIBUTOR, EDITOR.`);
  }
  return normalized;
}

export async function createShare(req, res) {
  try {
    const {
      fileId,
      folderId,
      sharedWithUserId,
      sharedWithDepartmentId,
      isPublicLink,
      permissionLevel,
      allowDownload,
      password,
      expiresInDays,
      sharingNote
    } = req.body;

    if (!fileId && !folderId) {
      return res.status(400).json({ error: 'Either fileId or folderId is required' });
    }

    // 1. Verify caller has ownership or administrative right to share
    const callerId = req.user.id;
    const callerRole = req.user.role_name;

    if (fileId) {
      const fileRes = await db.query('SELECT * FROM files WHERE id = $1', [fileId]);
      if (!fileRes.rows || fileRes.rows.length === 0) {
        return res.status(404).json({ error: 'File not found' });
      }
      if (fileRes.rows[0].is_quarantined && callerRole !== 'SUPER ADMIN') {
        return res.status(403).json({ error: 'Quarantined test files cannot be shared' });
      }
      if (fileRes.rows[0].owner_id !== callerId && callerRole !== 'SUPER ADMIN') {
        return res.status(403).json({ error: 'Only the file owner or Super Admin may grant shares' });
      }
    } else if (folderId) {
      const folderRes = await db.query('SELECT * FROM folders WHERE id = $1', [folderId]);
      if (!folderRes.rows || folderRes.rows.length === 0) {
        return res.status(404).json({ error: 'Folder not found' });
      }
      if (folderRes.rows[0].is_quarantined && callerRole !== 'SUPER ADMIN') {
        return res.status(403).json({ error: 'Quarantined test folders cannot be shared' });
      }
      if (folderRes.rows[0].owner_id !== callerId && callerRole !== 'SUPER ADMIN' && callerRole !== 'DEPARTMENT_MANAGER') {
        return res.status(403).json({ error: 'Only the folder owner, Department Manager, or Super Admin may grant shares' });
      }
    }

    // 2. Normalize and validate permission level
    let normalizedLevel = 'VIEWER';
    try {
      normalizedLevel = normalizePermissionLevel(permissionLevel);
    } catch (normErr) {
      return res.status(400).json({ error: normErr.message });
    }

    // DLP Restriction: Outside corporate network, public share link creation is blocked
    if (req.isOutsideCompany && isPublicLink) {
      return res.status(403).json({
        error: 'Creating public share links is restricted when accessing outside corporate network (Anti-Exfiltration Policy).'
      });
    }

    const shareId = crypto.randomUUID();
    let shareToken = null;
    let passwordHash = null;

    if (isPublicLink) {
      shareToken = crypto.randomBytes(24).toString('hex');
    }

    if (password && password.trim()) {
      passwordHash = bcrypt.hashSync(password.trim(), 10);
    }

    let expiresAt = null;
    if (expiresInDays && parseInt(expiresInDays) > 0) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + parseInt(expiresInDays));
      expiresAt = expDate.toISOString();
    }

    // Support both single user/department or array of user accounts
    const targetUserIds = Array.isArray(req.body.sharedWithUserIds) && req.body.sharedWithUserIds.length > 0
      ? req.body.sharedWithUserIds
      : (sharedWithUserId ? [sharedWithUserId] : [null]);

    const createdShares = [];
    for (const uid of targetUserIds) {
      if (uid === null && !sharedWithDepartmentId && !isPublicLink) continue;
      const sid = crypto.randomUUID();
      await db.query(
        `INSERT INTO file_shares (
          id, file_id, folder_id, shared_by, shared_with_user_id, shared_with_department_id,
          share_token, permission_level, allow_download, password_hash, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          sid, fileId || null, folderId || null, req.user.id,
          uid, sharedWithDepartmentId || null,
          shareToken, normalizedLevel, allowDownload !== false,
          passwordHash, expiresAt
        ]
      );
      createdShares.push({ id: sid, sharedWithUserId: uid });
    }

    // Fallback single ID if none was in array
    const primaryShareId = createdShares[0]?.id || shareId;

    // Audit log
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.user.id, 'SHARE_CREATED', fileId ? 'FILE' : 'FOLDER', fileId || folderId,
        JSON.stringify({ shareId: primaryShareId, isPublicLink, permissionLevel: normalizedLevel, hasPassword: !!passwordHash, expiresAt, sharingNote, userCount: createdShares.length })
      ]
    );

    res.status(201).json({
      message: 'Share created successfully',
      share: {
        id: primaryShareId,
        shareToken,
        shareUrl: shareToken ? `/share/${shareToken}` : null,
        permissionLevel: normalizedLevel,
        allowDownload: allowDownload !== false,
        expiresAt
      }
    });
  } catch (err) {
    console.error('[SHARE CONTROLLER] Create error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function getSharedWithMe(req, res) {
  try {
    const userId = req.user.id;
    const deptId = req.user.department_id;

    const sharesRes = await db.query(
      `SELECT s.*, u.full_name as shared_by_name, u.email as shared_by_email
       FROM file_shares s
       LEFT JOIN users u ON s.shared_by = u.id
       WHERE s.is_revoked = FALSE 
         AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
         AND (s.shared_with_user_id = $1 OR (s.shared_with_department_id IS NOT NULL AND s.shared_with_department_id = $2))`,
      [userId, deptId]
    );

    const shares = sharesRes.rows || [];
    const files = [];
    const folders = [];

    for (const sh of shares) {
      if (sh.file_id) {
        const fRes = await db.query('SELECT * FROM files WHERE id = $1 AND is_trashed = FALSE', [sh.file_id]);
        if (fRes.rows && fRes.rows[0]) {
          files.push({ ...fRes.rows[0], shareInfo: sh });
        }
      } else if (sh.folder_id) {
        const foRes = await db.query('SELECT * FROM folders WHERE id = $1 AND is_trashed = FALSE', [sh.folder_id]);
        if (foRes.rows && foRes.rows[0]) {
          folders.push({ ...foRes.rows[0], shareInfo: sh });
        }
      }
    }

    res.json({ shares, files, folders });
  } catch (err) {
    console.error('[SHARE CONTROLLER] Get shared error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function getItemShares(req, res) {
  try {
    const { folderId, fileId } = req.query;
    if (!folderId && !fileId) {
      return res.status(400).json({ error: 'folderId or fileId is required' });
    }

    const sharesRes = await db.query(
      `SELECT s.*, 
              d.name AS department_name, 
              d.code AS department_code,
              u.full_name AS user_name, 
              u.email AS user_email,
              sb.full_name AS shared_by_name
       FROM file_shares s
       LEFT JOIN departments d ON s.shared_with_department_id = d.id
       LEFT JOIN users u ON s.shared_with_user_id = u.id
       LEFT JOIN users sb ON s.shared_by = sb.id
       WHERE s.is_revoked = FALSE
         AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
         AND ($1::uuid IS NULL OR s.folder_id = $1)
         AND ($2::uuid IS NULL OR s.file_id = $2)
       ORDER BY s.created_at DESC`,
      [folderId || null, fileId || null]
    );

    res.json({ shares: sharesRes.rows || [] });
  } catch (err) {
    console.error('[SHARE CONTROLLER] Get item shares error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function revokeShare(req, res) {
  try {
    const { id } = req.params;

    const shareRes = await db.query('SELECT * FROM file_shares WHERE id = $1', [id]);
    if (!shareRes.rows || shareRes.rows.length === 0) {
      return res.status(404).json({ error: 'Share record not found' });
    }

    const share = shareRes.rows[0];
    if (share.shared_by !== req.user.id && req.user.role_name !== 'SUPER ADMIN') {
      return res.status(403).json({ error: 'Only the user who created the share or Super Admin can revoke it' });
    }

    await db.query(
      `UPDATE file_shares 
       SET is_revoked = TRUE, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [id]
    );

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, 'SHARE_REVOKED', 'SHARE', id, JSON.stringify({ shareId: id, fileId: share.file_id, folderId: share.folder_id })]
    );

    res.json({ message: 'Share revoked successfully' });
  } catch (err) {
    console.error('[SHARE CONTROLLER] Revoke error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function getPublicShareInfo(req, res) {
  try {
    const { token } = req.params;

    const shareRes = await db.query(
      `SELECT s.*, u.full_name as shared_by_name
       FROM file_shares s
       LEFT JOIN users u ON s.shared_by = u.id
       WHERE s.share_token = $1 AND s.is_revoked = FALSE`,
      [token]
    );

    if (!shareRes.rows || shareRes.rows.length === 0) {
      return res.status(404).json({ error: 'Share link invalid or expired' });
    }

    const share = shareRes.rows[0];
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share link has expired' });
    }

    res.json({
      share: {
        id: share.id,
        fileId: share.file_id,
        folderId: share.folder_id,
        sharedByName: share.shared_by_name,
        permissionLevel: share.permission_level,
        allowDownload: share.allow_download,
        requiresPassword: !!share.password_hash,
        expiresAt: share.expires_at
      }
    });
  } catch (err) {
    console.error('[SHARE CONTROLLER] Public share error:', err);
    res.status(500).json({ error: err.message });
  }
}
