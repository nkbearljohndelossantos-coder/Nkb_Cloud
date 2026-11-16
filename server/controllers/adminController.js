import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '../config/db.js';
import deviceService from '../services/deviceService.js';

export async function getUsers(req, res) {
  try {
    const usersRes = await db.query(
      `SELECT u.id, u.username, u.email, u.full_name, u.role_id, u.department_id,
              u.status, u.storage_quota_bytes, u.used_storage_bytes, u.last_login_at, u.created_at
       FROM users u ORDER BY u.created_at ASC`
    );

    const rolesRes = await db.query('SELECT * FROM roles');
    const deptsRes = await db.query('SELECT * FROM departments');

    const rolesMap = new Map((rolesRes.rows || []).map(r => [r.id, r.name]));
    const deptsMap = new Map((deptsRes.rows || []).map(d => [d.id, d.name]));

    const users = (usersRes.rows || []).map(u => ({
      ...u,
      role_name: rolesMap.get(u.role_id) || 'STANDARD USER',
      department_name: deptsMap.get(u.department_id) || 'Unassigned',
      storage_quota_bytes: Number(u.storage_quota_bytes),
      used_storage_bytes: Number(u.used_storage_bytes)
    }));

    res.json({ users, roles: rolesRes.rows, departments: deptsRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createUser(req, res) {
  try {
    const { username, email, password, fullName, roleId, departmentId, storageQuotaGB } = req.body;
    if (!username || !email || !password || !fullName || !roleId) {
      return res.status(400).json({ error: 'Username, email, password, fullName, and roleId are required' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    const quotaBytes = (parseInt(storageQuotaGB) || 100) * 1024 * 1024 * 1024;
    const userId = crypto.randomUUID();

    const insertRes = await db.query(
      `INSERT INTO users (id, username, email, password_hash, full_name, role_id, department_id, status, storage_quota_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8)`,
      [userId, username.toLowerCase().trim(), email.toLowerCase().trim(), hash, fullName.trim(), parseInt(roleId), departmentId ? parseInt(departmentId) : null, quotaBytes]
    );

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, 'USER_CREATED', 'USER', userId, JSON.stringify({ username, email, roleId })]
    );

    res.status(201).json({ message: 'User created successfully', user: insertRes.rows[0] || { id: userId, username, email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { fullName, roleId, departmentId, status, storageQuotaGB, password } = req.body;

    const updates = [];
    const params = [];
    let pIdx = 1;

    if (fullName) { updates.push(`full_name = $${pIdx++}`); params.push(fullName); }
    if (roleId) { updates.push(`role_id = $${pIdx++}`); params.push(parseInt(roleId)); }
    if (departmentId !== undefined) { updates.push(`department_id = $${pIdx++}`); params.push(departmentId ? parseInt(departmentId) : null); }
    if (status) { updates.push(`status = $${pIdx++}`); params.push(status); }
    if (storageQuotaGB) {
      const quotaBytes = parseInt(storageQuotaGB) * 1024 * 1024 * 1024;
      updates.push(`storage_quota_bytes = $${pIdx++}`);
      params.push(quotaBytes);
    }
    if (password && password.trim()) {
      const hash = bcrypt.hashSync(password.trim(), 10);
      updates.push(`password_hash = $${pIdx++}`);
      params.push(hash);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(id);
    const sql = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${pIdx}`;
    await db.query(sql, params);

    res.json({ message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getAuditLogs(req, res) {
  try {
    const logsRes = await db.query(
      `SELECT a.*, u.full_name as user_name, u.email as user_email
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC LIMIT 200`
    );
    res.json({ logs: logsRes.rows || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getUserAuditLogs(req, res) {
  try {
    const logsRes = await db.query(
      `SELECT a.*, u.full_name as user_name, u.email as user_email
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.user_id = $1
       ORDER BY a.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ logs: logsRes.rows || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getSystemSettings(req, res) {
  try {
    const resSettings = await db.query('SELECT * FROM system_settings ORDER BY category, setting_key');
    res.json({ settings: resSettings.rows || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateSystemSetting(req, res) {
  try {
    const { key } = req.params;
    const { value } = req.body;
    await db.query('UPDATE system_settings SET setting_value = $1, updated_at = CURRENT_TIMESTAMP WHERE setting_key = $2', [value, key]);
    res.json({ message: 'Setting updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function generateAgentPairingToken(req, res) {
  try {
    const { agentName } = req.body;
    const token = 'nkb_agent_' + crypto.randomBytes(32).toString('hex');
    const agentId = crypto.randomUUID();

    await db.query(
      `INSERT INTO storage_agents (id, agent_name, machine_name, agent_token, status)
       VALUES ($1, $2, $3, $4, 'OFFLINE')`,
      [agentId, agentName || 'NKB-STORAGE-HOST', 'NKB-WINDOWS-HOST', token]
    );

    const secretHash = crypto.createHash('sha256').update(token).digest('hex');
    try {
      await db.query(
        `INSERT INTO agent_credentials (id, agent_id, hmac_secret_hash, key_version, status, expires_at)
         VALUES ($1, $2, $3, 1, 'ACTIVE', CURRENT_TIMESTAMP + INTERVAL '365 days')`,
        [crypto.randomUUID(), agentId, secretHash]
      );
    } catch (e) {}

    res.json({
      message: 'Storage Agent pairing token generated',
      agentId,
      agentName: agentName || 'NKB-STORAGE-HOST',
      token,
      instructions: 'Paste this token into storage-agent/.env or config.json on the Windows Storage PC'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function revokeAgentCredential(req, res) {
  try {
    const { agentId } = req.params;
    const { reason } = req.body;

    await db.query(
      `UPDATE agent_credentials 
       SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP, revoked_reason = $1 
       WHERE agent_id = $2 AND status = 'ACTIVE'`,
      [reason || 'Administrative revocation', agentId]
    );

    await db.query(
      `UPDATE storage_agents SET status = 'REVOKED' WHERE id = $1`,
      [agentId]
    );

    res.json({ message: `Agent credentials for agent ${agentId} have been successfully REVOKED.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function rotateAgentKey(req, res) {
  try {
    const { agentId } = req.params;
    const { newPublicKey, signatureAlgorithm } = req.body;

    if (!newPublicKey) {
      return res.status(400).json({ error: 'newPublicKey is required for key rotation' });
    }

    // Expire existing active credentials
    await db.query(
      `UPDATE agent_credentials 
       SET status = 'EXPIRED', expires_at = CURRENT_TIMESTAMP 
       WHERE agent_id = $1 AND status = 'ACTIVE'`,
      [agentId]
    );

    // Insert new versioned active credential
    const newCredId = crypto.randomUUID();
    const fingerprint = crypto.createHash('sha256').update(newPublicKey.trim()).digest('hex');

    await db.query(
      `INSERT INTO agent_credentials (id, agent_id, public_key, signature_algorithm, key_fingerprint, key_version, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, 2, 'ACTIVE', CURRENT_TIMESTAMP + INTERVAL '365 days')`,
      [newCredId, agentId, newPublicKey, signatureAlgorithm || 'ed25519', fingerprint]
    );

    await db.query(
      `UPDATE storage_agents SET public_key = $1 WHERE id = $2`,
      [newPublicKey, agentId]
    );

    res.json({
      message: 'Agent key rotated successfully',
      agentId,
      newCredentialId: newCredId,
      fingerprint
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getDepartments(req, res) {
  try {
    const deptsRes = await db.query(`
      SELECT d.*, 
             COUNT(DISTINCT u.id) FILTER (WHERE u.status = 'ACTIVE') AS member_count,
             COUNT(DISTINCT f.id) FILTER (WHERE f.is_trashed = FALSE) AS folder_count
      FROM departments d
      LEFT JOIN users u ON u.department_id = d.id
      LEFT JOIN folders f ON f.department_id = d.id
      GROUP BY d.id
      ORDER BY d.id ASC
    `);
    res.json({ departments: deptsRes.rows || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createDepartment(req, res) {
  try {
    const { name, code, description, createFolder = true } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Department name is required' });
    }

    const cleanName = name.trim();
    let cleanCode = code ? code.trim().toUpperCase() : cleanName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 6);
    if (!cleanCode) cleanCode = cleanName.slice(0, 4).toUpperCase();

    // Check duplicate name or code
    const existing = await db.query(
      'SELECT id, name, code FROM departments WHERE LOWER(name) = LOWER($1) OR code = $2',
      [cleanName, cleanCode]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A department with this name or code already exists.' });
    }

    const insertRes = await db.query(
      `INSERT INTO departments (name, code, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [cleanName, cleanCode, description ? description.trim() : null]
    );
    const newDept = insertRes.rows[0];

    // Optionally create root department folder in Drive
    let createdFolder = null;
    if (createFolder) {
      const folderId = crypto.randomUUID();
      const folderRes = await db.query(
        `INSERT INTO folders (id, name, parent_id, owner_id, department_id, is_shared_drive, color)
         VALUES ($1, $2, NULL, $3, $4, TRUE, '#D97706')
         RETURNING *`,
        [folderId, cleanName, req.user.id, newDept.id]
      );
      createdFolder = folderRes.rows[0];
    }

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'DEPARTMENT_CREATED', 'DEPARTMENT', $2, $3)`,
      [req.user.id, String(newDept.id), JSON.stringify({ name: cleanName, code: cleanCode, createFolder })]
    );

    res.status(201).json({
      success: true,
      message: `Department '${cleanName}' created successfully`,
      department: newDept,
      folder: createdFolder
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateDepartment(req, res) {
  try {
    const { id } = req.params;
    const { name, code, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Department name is required' });
    }

    const cleanName = name.trim();
    let cleanCode = code ? code.trim().toUpperCase() : '';

    const updateRes = await db.query(
      `UPDATE departments
       SET name = $1,
           code = COALESCE(NULLIF($2, ''), code),
           description = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [cleanName, cleanCode, description ? description.trim() : null, id]
    );

    if (!updateRes.rows.length) {
      return res.status(404).json({ error: 'Department not found' });
    }

    // Sync root folder name if matching
    await db.query(
      'UPDATE folders SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE department_id = $2 AND parent_id IS NULL',
      [cleanName, id]
    );

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'DEPARTMENT_UPDATED', 'DEPARTMENT', $2, $3)`,
      [req.user.id, String(id), JSON.stringify({ name: cleanName, code: cleanCode })]
    );

    res.json({
      success: true,
      message: 'Department updated successfully',
      department: updateRes.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteDepartment(req, res) {
  try {
    const { id } = req.params;

    // Check if any users exist in this department
    const usersRes = await db.query('SELECT count(*) FROM users WHERE department_id = $1', [id]);
    const userCount = parseInt(usersRes.rows[0]?.count || 0, 10);
    if (userCount > 0) {
      await db.query('UPDATE users SET department_id = NULL WHERE department_id = $1', [id]);
    }

    // Unlink folders
    await db.query('UPDATE folders SET department_id = NULL WHERE department_id = $1', [id]);
    // Delete file shares
    await db.query('DELETE FROM file_shares WHERE shared_with_department_id = $1', [id]);
    // Unlink invites
    await db.query('UPDATE user_invites SET department_id = NULL WHERE department_id = $1', [id]);

    const delRes = await db.query('DELETE FROM departments WHERE id = $1 RETURNING name, code', [id]);
    if (!delRes.rows.length) {
      return res.status(404).json({ error: 'Department not found' });
    }

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'DEPARTMENT_DELETED', 'DEPARTMENT', $2, $3)`,
      [req.user.id, String(id), JSON.stringify(delRes.rows[0])]
    );

    res.json({
      success: true,
      message: `Department '${delRes.rows[0].name}' deleted successfully`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getShareableUsers(req, res) {
  try {
    const usersRes = await db.query(
      `SELECT u.id, u.username, u.email, u.full_name, u.department_id, d.name as department_name, d.code as department_code, r.name as role_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.status = 'ACTIVE'
       ORDER BY d.name ASC, u.full_name ASC`
    );
    res.json({ users: usersRes.rows || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getDevices(req, res) {
  try {
    const devices = await deviceService.listAllDevices();
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function approveDevice(req, res) {
  try {
    const { agentId } = req.params;
    const result = await deviceService.approveDevice(agentId, req.user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function revokeDevice(req, res) {
  try {
    const { agentId } = req.params;
    const { reason } = req.body;
    const result = await deviceService.revokeDevice(agentId, req.user, reason);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function suspendDevice(req, res) {
  try {
    const { agentId } = req.params;
    const { reason } = req.body;
    const result = await deviceService.suspendDevice(agentId, req.user, reason);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function reactivateDevice(req, res) {
  try {
    const { agentId } = req.params;
    const result = await deviceService.reactivateDevice(agentId, req.user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function requestAgentUpdate(req, res) {
  try {
    const { agentId } = req.params;
    const { targetVersion } = req.body;
    const result = await deviceService.requestAgentUpdate(agentId, req.user, targetVersion || '2.1.0');
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getDeviceAuditHistory(req, res) {
  try {
    const { agentId } = req.params;
    const logsRes = await db.query(
      `SELECT a.*, u.username, u.full_name
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.entity_id = $1 OR (a.entity_type = 'STORAGE_AGENT' AND a.entity_id = $1)
       ORDER BY a.created_at DESC`,
      [agentId]
    );
    res.json(logsRes.rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getInvites(req, res) {
  try {
    const invitesRes = await db.query(
      `SELECT ui.*,
              r.name as role_name,
              d.name as department_name, d.code as department_code,
              u.username as creator_username, u.full_name as creator_full_name
       FROM user_invites ui
       JOIN roles r ON ui.role_id = r.id
       LEFT JOIN departments d ON ui.department_id = d.id
       LEFT JOIN users u ON ui.created_by = u.id
       ORDER BY ui.created_at DESC`
    );

    const rolesRes = await db.query('SELECT * FROM roles ORDER BY id ASC');
    const deptsRes = await db.query('SELECT * FROM departments ORDER BY name ASC');

    res.json({
      invites: invitesRes.rows || [],
      roles: rolesRes.rows || [],
      departments: deptsRes.rows || []
    });
  } catch (err) {
    console.error('[ADMIN CONTROLLER] getInvites error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function createInvite(req, res) {
  try {
    const { roleId, departmentId, maxUses, expiresInDays, note } = req.body;

    if (!roleId) {
      return res.status(400).json({ error: 'Role is required for generating an invite link' });
    }

    // Generate high-entropy secure token (32 bytes = 64 hex chars)
    const token = crypto.randomBytes(32).toString('hex');

    let expiresAt = null;
    const days = parseInt(expiresInDays);
    if (!isNaN(days) && days > 0) {
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    const maxUsesVal = maxUses !== undefined && maxUses !== '' && maxUses !== null ? parseInt(maxUses) : 1;

    const insertRes = await db.query(
      `INSERT INTO user_invites (token, role_id, department_id, created_by, note, max_uses, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        token,
        parseInt(roleId),
        departmentId ? parseInt(departmentId) : null,
        req.user.id,
        note ? note.trim() : null,
        maxUsesVal,
        expiresAt
      ]
    );

    const invite = insertRes.rows[0];

    const roleRes = await db.query('SELECT name FROM roles WHERE id = $1', [invite.role_id]);
    const deptRes = invite.department_id ? await db.query('SELECT name FROM departments WHERE id = $1', [invite.department_id]) : { rows: [] };

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.user.id,
        'INVITE_LINK_CREATED',
        'INVITE',
        invite.id,
        JSON.stringify({
          role: roleRes.rows[0]?.name,
          department: deptRes.rows[0]?.name || 'Unassigned',
          maxUses: invite.max_uses,
          expiresAt: invite.expires_at,
          note: invite.note
        })
      ]
    );

    res.status(201).json({
      message: 'Invitation link generated successfully',
      invite: {
        ...invite,
        role_name: roleRes.rows[0]?.name,
        department_name: deptRes.rows[0]?.name || 'Unassigned'
      }
    });
  } catch (err) {
    console.error('[ADMIN CONTROLLER] createInvite error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function revokeInvite(req, res) {
  try {
    const { id } = req.params;
    await db.query(
      'UPDATE user_invites SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
    res.json({ message: 'Invitation link revoked successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteInvite(req, res) {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM user_invites WHERE id = $1', [id]);
    res.json({ message: 'Invitation link deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
