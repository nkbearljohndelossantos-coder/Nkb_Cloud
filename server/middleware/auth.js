import { verifyToken } from '../config/jwt.js';
import db from '../config/db.js';

/**
 * Extracts client IP from request, supporting reverse proxies and test headers.
 */
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const parts = forwarded.split(',').map(p => p.trim());
    if (parts.length > 0 && parts[0]) return parts[0];
  }
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Checks whether an IP belongs to internal corporate / company network.
 * Internal includes:
 * - Loopback (127.0.0.1, ::1, localhost)
 * - RFC 1918 Private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 * - Link-local (169.254.0.0/16, fe80::/10)
 * - Configured corporate static IPs in process.env.COMPANY_CORPORATE_IPS
 */
export function isCorporateNetwork(ipStr) {
  if (!ipStr) return false;
  let ip = ipStr.replace(/^::ffff:/, '').trim();

  // Loopback (local server / office dev machine)
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;

  // RFC 1918 10.0.0.0/8
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;

  // RFC 1918 172.16.0.0/12
  const match172 = ip.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (match172) {
    const second = parseInt(match172[1], 10);
    if (second >= 16 && second <= 31) return true;
  }

  // RFC 1918 192.168.0.0/16
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;

  // Link local
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(ip) || ip.startsWith('fe80:')) return true;

  // Custom company public IPs
  const companyIps = (process.env.COMPANY_CORPORATE_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (companyIps.includes(ip)) return true;

  return false;
}

export async function authenticateToken(req, res, next) {
  const clientIp = getClientIp(req);
  const isInside = isCorporateNetwork(clientIp);
  req.clientIp = clientIp;
  req.isOutsideCompany = !isInside;

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

    // Session version validation (fail-closed: any missing, non-integer, or mismatched claim is rejected)
    if (user.session_version !== undefined && user.session_version !== null) {
      const claim = decoded.sessionVersion;
      const isValidInteger = (typeof claim === 'number' && Number.isInteger(claim)) ||
                            (typeof claim === 'string' && /^-?\d+$/.test(claim.trim()));
      const parsedClaim = parseInt(claim, 10);
      const expectedVersion = parseInt(user.session_version, 10);

      if (!isValidInteger || isNaN(parsedClaim) || parsedClaim !== expectedVersion) {
        return res.status(401).json({
          error: 'Session has been invalidated. Please log in again.',
          code: 'SESSION_REVOKED'
        });
      }
    }

    // Session revocation check (if user_sessions table exists and decoded has sessionId)
    if (decoded.sessionId) {
      try {
        const sRes = await db.query('SELECT revoked_at FROM user_sessions WHERE id = $1', [decoded.sessionId]);
        if (sRes.rows && sRes.rows[0]?.revoked_at) {
          return res.status(401).json({ error: 'Session has been revoked. Please log in again.', code: 'SESSION_REVOKED' });
        }
      } catch (tableErr) {
        // Table does not exist yet prior to Migration 007 - continue safely
      }
    }

    user.is_outside_company = !isInside;
    user.client_ip = clientIp;
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
