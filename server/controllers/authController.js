import bcrypt from 'bcryptjs';
import db from '../config/db.js';
import { signToken } from '../config/jwt.js';

export async function login(req, res) {
  try {
    const { identifier, password } = req.body; // email or username
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Username/Email and password are required' });
    }

    const userRes = await db.query(
      'SELECT * FROM users WHERE email = $1 OR username = $1',
      [identifier.toLowerCase().trim()]
    );

    if (!userRes.rows || userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userRes.rows[0];

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Your account is inactive or suspended. Contact your NKB IT administrator.' });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await db.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // Role & Department info
    const roleRes = await db.query('SELECT name FROM roles WHERE id = $1', [user.role_id]);
    const deptRes = user.department_id ? await db.query('SELECT name, code FROM departments WHERE id = $1', [user.department_id]) : { rows: [] };

    const roleName = roleRes.rows[0]?.name || 'STANDARD USER';
    const deptName = deptRes.rows[0]?.name || null;
    const deptCode = deptRes.rows[0]?.code || null;

    const token = signToken({
      id: user.id,
      email: user.email,
      username: user.username,
      role: roleName
    });

    // Audit log
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, 'USER_LOGIN', 'USER', user.id, req.ip, JSON.stringify({ userAgent: req.headers['user-agent'] })]
    );

    res.json({
      message: 'Authentication successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        avatarUrl: user.avatar_url,
        role: roleName,
        roleId: user.role_id,
        department: deptName,
        departmentCode: deptCode,
        storageQuotaBytes: Number(user.storage_quota_bytes),
        usedStorageBytes: Number(user.used_storage_bytes)
      }
    });
  } catch (err) {
    console.error('[AUTH CONTROLLER] Login error:', err);
    res.status(500).json({ error: 'Internal server authentication error' });
  }
}

export async function getCurrentUser(req, res) {
  try {
    const user = req.user;
    const deptRes = user.department_id ? await db.query('SELECT name, code FROM departments WHERE id = $1', [user.department_id]) : { rows: [] };

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        avatarUrl: user.avatar_url,
        role: user.role_name,
        roleId: user.role_id,
        department: deptRes.rows[0]?.name || null,
        departmentCode: deptRes.rows[0]?.code || null,
        storageQuotaBytes: Number(user.storage_quota_bytes),
        usedStorageBytes: Number(user.used_storage_bytes)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both current and new password are required' });
    }

    const isMatch = bcrypt.compareSync(currentPassword, req.user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const salt = bcrypt.genSaltSync(10);
    const newHash = bcrypt.hashSync(newPassword, salt);

    await db.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newHash, req.user.id]);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
