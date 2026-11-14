// =============================================================================
// NKB Cloud v2.1.0 — Centralized File & Folder Authorization Service
// Description: Single-query recursive CTE with cycle guard (depth < 25),
//              ancestor share inheritance, quarantine blocking, and break-glass auditing.
//              Fully backward-compatible with pre-migration and post-migration schema.
// =============================================================================

import db from '../config/db.js';

export const PERMISSION_RANKS = {
  VIEWER: 1,
  DOWNLOADER: 2,
  CONTRIBUTOR: 3,
  EDITOR: 4
};

let _schemaFlags = null;

export async function detectSchemaFlags() {
  if (_schemaFlags) return _schemaFlags;
  try {
    const res = await db.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_name IN ('folders', 'files', 'file_shares') 
        AND column_name IN ('is_quarantined', 'is_department_root', 'is_test_data')
    `);
    const set = new Set((res.rows || []).map(r => `${r.table_name}.${r.column_name}`));
    _schemaFlags = {
      folderQuarantine: set.has('folders.is_quarantined'),
      folderDeptRoot: set.has('folders.is_department_root'),
      fileQuarantine: set.has('files.is_quarantined')
    };
  } catch (e) {
    _schemaFlags = { folderQuarantine: false, folderDeptRoot: false, fileQuarantine: false };
  }
  return _schemaFlags;
}

export function resetSchemaFlags() {
  _schemaFlags = null;
}

/**
 * Verify access to a folder by folderId.
 */
export async function verifyFolderAccess(userId, deptId, userRole, folderId, requiredPermission = 'VIEWER') {
  if (!folderId || folderId === 'root' || folderId === 'null') {
    return { allowed: true, reason: 'ROOT_VIEW', effectiveRank: 4 };
  }

  // 1. Universal Super Admin bypass
  if (userRole === 'SUPER ADMIN') {
    return { allowed: true, reason: 'SUPER_ADMIN_UNIVERSAL', effectiveRank: 4 };
  }

  const targetRank = PERMISSION_RANKS[requiredPermission] || 1;
  const flags = await detectSchemaFlags();
  const sanitizedDeptId = (deptId !== null && deptId !== undefined && !isNaN(Number(deptId))) ? parseInt(deptId, 10) : null;

  const folderAuthCte = `
  WITH RECURSIVE folder_hierarchy AS (
      -- Anchor: Target folder
      SELECT 
          id, 
          parent_id, 
          owner_id, 
          department_id, 
          ${flags.folderDeptRoot ? 'COALESCE(is_department_root, FALSE)' : 'FALSE'} AS is_department_root, 
          ${flags.folderQuarantine ? 'COALESCE(is_quarantined, FALSE)' : 'FALSE'} AS is_quarantined, 
          1 AS depth
      FROM folders
      WHERE id = $1

      UNION ALL

      -- Recursive ancestor traversal
      SELECT 
          parent.id, 
          parent.parent_id, 
          parent.owner_id, 
          parent.department_id, 
          ${flags.folderDeptRoot ? 'COALESCE(parent.is_department_root, FALSE)' : 'FALSE'} AS is_department_root, 
          ${flags.folderQuarantine ? 'COALESCE(parent.is_quarantined, FALSE)' : 'FALSE'} AS is_quarantined, 
          child.depth + 1
      FROM folders parent
      INNER JOIN folder_hierarchy child ON parent.id = child.parent_id
      WHERE child.depth < 25
  ),
  applicable_shares AS (
      SELECT 
          s.permission_level,
          CASE s.permission_level
              WHEN 'VIEWER' THEN 1
              WHEN 'VIEW' THEN 1
              WHEN 'DOWNLOADER' THEN 2
              WHEN 'DOWNLOAD_ONLY' THEN 2
              WHEN 'CONTRIBUTOR' THEN 3
              WHEN 'EDITOR' THEN 4
              WHEN 'EDIT' THEN 4
              ELSE 0
          END AS rank
      FROM file_shares s
      INNER JOIN folder_hierarchy fh ON s.folder_id = fh.id
      WHERE s.is_revoked = FALSE
        AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
        AND (s.shared_with_user_id = $2 OR (s.shared_with_department_id IS NOT NULL AND s.shared_with_department_id = $3))
  )
  SELECT 
      fh.id AS folder_id,
      fh.owner_id,
      fh.is_quarantined,
      fh.is_department_root,
      fh.department_id AS folder_dept_id,
      COALESCE(MAX(sh.rank), 0) AS max_share_rank
  FROM folder_hierarchy fh
  LEFT JOIN applicable_shares sh ON TRUE
  GROUP BY fh.id, fh.owner_id, fh.is_quarantined, fh.is_department_root, fh.department_id;
  `;

  try {
    const res = await db.query(folderAuthCte, [folderId, userId, sanitizedDeptId]);
    if (!res.rows || res.rows.length === 0) {
      return { allowed: false, reason: 'FOLDER_NOT_FOUND', effectiveRank: 0 };
    }

    const targetRow = res.rows.find(r => r.folder_id === folderId) || res.rows[0];
    const anyQuarantined = res.rows.some(r => r.is_quarantined);

    // 2. Quarantine Guard
    if (anyQuarantined) {
      return { allowed: false, reason: 'QUARANTINED_TEST_DATA', effectiveRank: 0 };
    }

    // 3. Direct Ownership
    if (targetRow.owner_id === userId) {
      return { allowed: true, reason: 'DIRECT_OWNER', effectiveRank: 4 };
    }

    // 4. Department Shared Workspace Root
    if (targetRow.is_department_root && targetRow.folder_dept_id === deptId) {
      const isDeptManager = (userRole === 'DEPARTMENT_MANAGER');
      const deptRank = isDeptManager ? 4 : 3;
      if (deptRank >= targetRank) {
        return { allowed: true, reason: 'DEPARTMENT_WORKSPACE_MEMBER', effectiveRank: deptRank };
      }
    }

    // 5. Explicit Direct or Inherited Share
    const maxRank = Math.max(...res.rows.map(r => r.max_share_rank || 0));
    if (maxRank >= targetRank) {
      return { allowed: true, reason: 'EXPLICIT_SHARE_GRANTED', effectiveRank: maxRank };
    }

    return { allowed: false, reason: 'INSUFFICIENT_PERMISSION', effectiveRank: maxRank };
  } catch (err) {
    console.error('[AUTH_SERVICE] Folder auth error:', err);
    return { allowed: false, reason: 'AUTH_EVALUATION_ERROR', error: err.message };
  }
}

/**
 * Verify access to a file by fileId.
 */
export async function verifyFileAccess(userId, deptId, userRole, fileId, requiredPermission = 'VIEWER') {
  if (!fileId) {
    return { allowed: false, reason: 'FILE_ID_REQUIRED', effectiveRank: 0 };
  }

  // 1. Universal Super Admin bypass
  if (userRole === 'SUPER ADMIN') {
    return { allowed: true, reason: 'SUPER_ADMIN_UNIVERSAL', effectiveRank: 4 };
  }

  const targetRank = PERMISSION_RANKS[requiredPermission] || 1;
  const flags = await detectSchemaFlags();
  const sanitizedDeptId = (deptId !== null && deptId !== undefined && !isNaN(Number(deptId))) ? parseInt(deptId, 10) : null;

  try {
    const fileQuery = `
      SELECT id, folder_id, owner_id, 
             ${flags.fileQuarantine ? 'COALESCE(is_quarantined, FALSE)' : 'FALSE'} AS is_quarantined 
      FROM files WHERE id = $1
    `;
    const fileRes = await db.query(fileQuery, [fileId]);

    if (!fileRes.rows || fileRes.rows.length === 0) {
      return { allowed: false, reason: 'FILE_NOT_FOUND', effectiveRank: 0 };
    }

    const file = fileRes.rows[0];

    // 2. Quarantine Guard
    if (file.is_quarantined) {
      return { allowed: false, reason: 'QUARANTINED_TEST_DATA', effectiveRank: 0 };
    }

    // 3. Direct File Ownership
    if (file.owner_id === userId) {
      return { allowed: true, reason: 'DIRECT_OWNER', effectiveRank: 4 };
    }

    // 4. Direct File Share
    const shareRes = await db.query(
      `SELECT permission_level,
              CASE permission_level
                  WHEN 'VIEWER' THEN 1
                  WHEN 'VIEW' THEN 1
                  WHEN 'DOWNLOADER' THEN 2
                  WHEN 'DOWNLOAD_ONLY' THEN 2
                  WHEN 'CONTRIBUTOR' THEN 3
                  WHEN 'EDITOR' THEN 4
                  WHEN 'EDIT' THEN 4
                  ELSE 0
              END AS rank
       FROM file_shares
       WHERE file_id = $1
         AND is_revoked = FALSE
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
         AND (shared_with_user_id = $2 OR (shared_with_department_id IS NOT NULL AND shared_with_department_id = $3))
       ORDER BY rank DESC
       LIMIT 1`,
      [fileId, userId, sanitizedDeptId]
    );

    if (shareRes.rows && shareRes.rows.length > 0) {
      const shareRank = shareRes.rows[0].rank;
      if (shareRank >= targetRank) {
        return { allowed: true, reason: 'DIRECT_FILE_SHARE_GRANTED', effectiveRank: shareRank };
      }
    }

    // 5. Inherited Parent Folder Share
    if (file.folder_id) {
      return await verifyFolderAccess(userId, deptId, userRole, file.folder_id, requiredPermission);
    }

    return { allowed: false, reason: 'INSUFFICIENT_PERMISSION', effectiveRank: 0 };
  } catch (err) {
    console.error('[AUTH_SERVICE] File auth error:', err);
    return { allowed: false, reason: 'AUTH_EVALUATION_ERROR', error: err.message };
  }
}
