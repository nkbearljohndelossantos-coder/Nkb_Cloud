import { verifyToken } from '../config/jwt.js';
import db from '../config/db.js';

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  // Also support ?token= in query parameter (convenient for download/preview URLs)
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  try {
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    if (!userResult.rows || userResult.rows.length === 0) {
      return res.status(403).json({ error: 'User account not found' });
    }

    const user = userResult.rows[0];
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'User account is inactive or suspended' });
    }

    // Role lookup
    const roleResult = await db.query('SELECT * FROM roles WHERE id = $1', [user.role_id]);
    user.role_name = roleResult.rows[0]?.name || 'STANDARD USER';

    req.user = user;
    next();
  } catch (err) {
    console.error('[AUTH] Authentication error:', err);
    return res.status(500).json({ error: 'Internal authentication error' });
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // SUPER ADMIN has universal access
    if (req.user.role_name === 'SUPER ADMIN') {
      return next();
    }

    if (!allowedRoles.includes(req.user.role_name)) {
      return res.status(403).json({ error: 'Insufficient permission for this operation' });
    }

    next();
  };
}
