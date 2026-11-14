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
    const deptsRes = await db.query('SELECT * FROM departments ORDER BY name ASC');
    res.json({ departments: deptsRes.rows || [] });
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
