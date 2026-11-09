import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import db from '../config/db.js';

export async function createShare(req, res) {
  try {
    const {
      fileId,
      folderId,
      sharedWithUserId,
      sharedWithDepartmentId,
      isPublicLink,
      permissionLevel, // 'VIEW', 'EDIT', 'DOWNLOAD_ONLY'
      allowDownload,
      password,
      expiresInDays
    } = req.body;

    if (!fileId && !folderId) {
      return res.status(400).json({ error: 'Either fileId or folderId is required' });
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

    const newShareRes = await db.query(
      `INSERT INTO file_shares (
        id, file_id, folder_id, shared_by, shared_with_user_id, shared_with_department_id,
        share_token, permission_level, allow_download, password_hash, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        shareId, fileId || null, folderId || null, req.user.id,
        sharedWithUserId || null, sharedWithDepartmentId || null,
        shareToken, permissionLevel || 'VIEW', allowDownload !== false,
        passwordHash, expiresAt
      ]
    );

    // Audit log
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.user.id, 'SHARE_CREATED', fileId ? 'FILE' : 'FOLDER', fileId || folderId,
        JSON.stringify({ shareId, isPublicLink, permissionLevel, hasPassword: !!passwordHash, expiresAt })
      ]
    );

    res.status(201).json({
      message: 'Share created successfully',
      share: {
        id: shareId,
        shareToken,
        shareUrl: shareToken ? `/share/${shareToken}` : null,
        permissionLevel: permissionLevel || 'VIEW',
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
       WHERE s.is_revoked = FALSE AND (s.shared_with_user_id = $1 OR s.shared_with_department_id = $2)`,
      [userId, deptId]
    );

    const shares = sharesRes.rows || [];
    const files = [];
    const folders = [];

    for (const sh of shares) {
      if (sh.file_id) {
        const fRes = await db.query('SELECT * FROM files WHERE id = $1 AND is_trashed = FALSE', [sh.file_id]);
        if (fRes.rows[0]) files.push({ ...fRes.rows[0], shareInfo: sh });
      } else if (sh.folder_id) {
        const foRes = await db.query('SELECT * FROM folders WHERE id = $1 AND is_trashed = FALSE', [sh.folder_id]);
        if (foRes.rows[0]) folders.push({ ...foRes.rows[0], shareInfo: sh });
      }
    }

    res.json({ files, folders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getPublicShareInfo(req, res) {
  try {
    const { token } = req.params;
    const shareRes = await db.query('SELECT * FROM file_shares WHERE share_token = $1 AND is_revoked = FALSE', [token]);
    if (!shareRes.rows || shareRes.rows.length === 0) {
      return res.status(404).json({ error: 'Share link not found or has been revoked' });
    }

    const share = shareRes.rows[0];
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This share link has expired' });
    }

    let file = null;
    let folder = null;

    if (share.file_id) {
      const fRes = await db.query('SELECT id, name, mime_type, size_bytes, category, status FROM files WHERE id = $1', [share.file_id]);
      file = fRes.rows[0] || null;
    }

    res.json({
      share: {
        id: share.id,
        permissionLevel: share.permission_level,
        allowDownload: share.allow_download,
        requiresPassword: Boolean(share.password_hash),
        expiresAt: share.expires_at
      },
      file,
      folder
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function revokeShare(req, res) {
  try {
    const { id } = req.params;
    await db.query('UPDATE file_shares SET is_revoked = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
    res.json({ message: 'Share access revoked successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
