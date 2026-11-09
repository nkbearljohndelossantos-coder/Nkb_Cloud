import jwt from 'jsonwebtoken';

const INSECURE_DEFAULTS = new Set([
  'nkb-cloud-enterprise-secret-key-2026-production',
  'default',
  'secret',
  'changeme',
  'change-me',
  'your-secret-here',
  'your_jwt_secret_here',
  'placeholder'
]);

export function validateJwtConfiguration(secret = process.env.JWT_SECRET) {
  if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
    return {
      valid: false,
      reason: 'JWT_SECRET environment variable is missing or empty.'
    };
  }

  const trimmed = secret.trim();

  if (trimmed.length < 32) {
    return {
      valid: false,
      reason: `JWT_SECRET must be at least 32 characters (256 bits) long. Current length: ${trimmed.length}.`
    };
  }

  if (INSECURE_DEFAULTS.has(trimmed.toLowerCase())) {
    return {
      valid: false,
      reason: 'JWT_SECRET is set to a prohibited default/placeholder value.'
    };
  }

  return { valid: true };
}

// Fail-closed initialization check
const validation = validateJwtConfiguration();
if (!validation.valid) {
  console.error('\n========================================================================');
  console.error('  [FATAL SECURITY ERROR] NKB CLOUD FAIL-CLOSED STARTUP ABORT');
  console.error('========================================================================');
  console.error(`Reason: ${validation.reason}`);
  console.error('NKB Cloud mandates a cryptographically secure 256-bit secret key in production.');
  console.error('Generate a secure key using: openssl rand -hex 32');
  console.error('Configure JWT_SECRET in your .env or environment configuration.');
  console.error('========================================================================\n');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

export default { signToken, verifyToken, validateJwtConfiguration };
