// =============================================================================
// NKB Cloud v2.1.0 — Universal Staging Maintenance Gate Middleware
// Description: Blocks all user roles (including ADMIN and SUPER ADMIN) during rollout.
// Exemptions: /health and loopback-only /api/operator/status.
// =============================================================================

export function stagingMaintenanceGate(req, res, next) {
  if (process.env.STAGING_MAINTENANCE_GATE !== 'true') {
    return next();
  }

  // Raw TCP socket address check (never trust forged client headers)
  const clientIp = req.socket.remoteAddress;
  const isLoopback = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';

  // Exemption 1: Global Health Status (reports MAINTENANCE state)
  if (req.path === '/health' || req.path === '/api/health') {
    return res.status(200).json({
      status: 'MAINTENANCE',
      platform: 'NKB Cloud',
      version: '2.1.0',
      maintenanceGate: true,
      timestamp: new Date().toISOString()
    });
  }

  // Exemption 2: Local Operator Diagnostic (strict loopback only, zero secrets)
  if (isLoopback && req.path === '/api/operator/status') {
    return res.status(200).json({
      operatorAccess: true,
      pid: process.pid,
      uptime: process.uptime(),
      stagingMaintenance: true,
      timestamp: new Date().toISOString()
    });
  }

  // UNIVERSAL BLOCK: Blocks all roles (SUPER ADMIN, ADMIN, STANDARD USER, Anonymous)
  return res.status(503).json({
    error: 'STAGING_MAINTENANCE_GATE_ACTIVE',
    message: 'NKB Cloud local staging environment is undergoing controlled deployment. All user, administrative, and storage operations are strictly suspended.',
    timestamp: new Date().toISOString()
  });
}
