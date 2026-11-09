import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '../config/db.js';

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
