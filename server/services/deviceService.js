import crypto from 'crypto';
import db from '../config/db.js';
import agentHub from './agentHub.js';

class DeviceService {
  constructor() {
    this.minAgentVersion = '2.1.0';
  }

  /**
   * Generates a time-bounded authenticated enrollment token for an employee
   */
  generateEnrollmentToken(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      departmentId: user.department_id,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const secret = process.env.JWT_SECRET || 'nkb_cloud_device_enrollment_secret_2026';
    const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

    return `NKB-ENROLL-${payloadB64}.${signature}`;
  }

  /**
   * Validates an enrollment token
   */
  verifyEnrollmentToken(tokenString) {
    if (!tokenString || !tokenString.startsWith('NKB-ENROLL-')) {
      throw new Error('Invalid enrollment token format');
    }

    const tokenBody = tokenString.replace('NKB-ENROLL-', '');
    const [payloadB64, signature] = tokenBody.split('.');

    if (!payloadB64 || !signature) {
      throw new Error('Malformed enrollment token');
    }

    const secret = process.env.JWT_SECRET || 'nkb_cloud_device_enrollment_secret_2026';
    const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      throw new Error('Enrollment token signature verification failed');
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (Date.now() > payload.expiresAt) {
      throw new Error('Enrollment token has expired');
    }

    return payload;
  }

  /**
   * Enrolls a new storage agent / workstation device
   */
  async enrollDevice({ enrollmentToken, machineName, osVersion, publicKey, agentVersion, ipAddress, hardwareFingerprint }) {
    if (!machineName || !publicKey) {
      throw new Error('machineName and publicKey are required for device enrollment');
    }

    // Verify token & extract user association
    const tokenData = this.verifyEnrollmentToken(enrollmentToken);
    const userId = tokenData.userId;

    // Fetch user details
    const userRes = await db.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.department_id, u.status, d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = $1`,
      [userId]
    );

    if (!userRes.rows || userRes.rows.length === 0) {
      throw new Error('Enrolling employee user account does not exist');
    }

    const employee = userRes.rows[0];
    if (employee.status !== 'ACTIVE') {
      throw new Error('Enrolling employee user account is not active');
    }

    // Compute key fingerprint
    const keyFingerprint = crypto.createHash('sha256').update(publicKey.trim()).digest('hex');

    // Check if device with this public key is already registered
    const existingAgentRes = await db.query(
      `SELECT id, status, machine_name FROM storage_agents WHERE public_key = $1`,
      [publicKey.trim()]
    );

    if (existingAgentRes.rows && existingAgentRes.rows.length > 0) {
      const existing = existingAgentRes.rows[0];
      if (existing.status === 'REVOKED') {
        throw new Error('This device has been permanently REVOKED and cannot be re-enrolled');
      }
      return {
        success: true,
        agentId: existing.id,
        status: existing.status,
        message: 'Device already registered'
      };
    }

    const agentId = crypto.randomUUID();
    const agentToken = 'nkb_agent_' + crypto.randomBytes(32).toString('hex');
    const secretHash = crypto.createHash('sha256').update(agentToken).digest('hex');

    // Store compact metadata in enrollment_token field (VARCHAR(255) max)
    const metadata = {
      uid: employee.id,
      un: employee.full_name,
      em: employee.email,
      dep: employee.department_id
    };

    // Initial status: PENDING (requires admin approval)
    const initialStatus = 'PENDING';
    const agentName = `${machineName} (${employee.full_name})`.substring(0, 100);

    await db.query(
      `INSERT INTO storage_agents (
        id, agent_name, machine_name, os_version, ip_address, 
        agent_token, public_key, enrollment_token, status, version, 
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        agentId,
        agentName,
        machineName.substring(0, 100),
        (osVersion || 'Windows').substring(0, 150),
        (ipAddress || '127.0.0.1').substring(0, 45),
        agentToken,
        publicKey.trim(),
        JSON.stringify(metadata),
        initialStatus,
        agentVersion || this.minAgentVersion
      ]
    );

    // Record initial active credential
    const credId = crypto.randomUUID();
    await db.query(
      `INSERT INTO agent_credentials (
        id, agent_id, hmac_secret_hash, public_key, signature_algorithm, 
        key_fingerprint, key_version, status, expires_at
      ) VALUES ($1, $2, $3, $4, 'ed25519', $5, 1, 'ACTIVE', CURRENT_TIMESTAMP + INTERVAL '365 days')`,
      [credId, agentId, secretHash, publicKey.trim(), keyFingerprint]
    );

    // Record audit event
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
       VALUES ($1, 'DEVICE_ENROLLED', 'STORAGE_AGENT', $2, $3, $4)`,
      [
        employee.id,
        agentId,
        JSON.stringify({
          machineName,
          osVersion,
          keyFingerprint,
          enrolledBy: employee.email,
          status: initialStatus
        }),
        ipAddress || '127.0.0.1'
      ]
    );

    return {
      success: true,
      agentId,
      agentToken,
      machineName,
      status: initialStatus,
      keyFingerprint,
      message: 'Device enrolled successfully. Awaiting administrator approval.'
    };
  }

  /**
   * Approves a pending device
   */
  async approveDevice(agentId, adminUser) {
    const res = await db.query(`SELECT * FROM storage_agents WHERE id = $1`, [agentId]);
    if (!res.rows || res.rows.length === 0) {
      throw new Error(`Device ${agentId} not found`);
    }

    const agent = res.rows[0];
    if (agent.status === 'REVOKED') {
      throw new Error('Cannot approve a REVOKED device');
    }

    await db.query(
      `UPDATE storage_agents 
       SET status = 'OFFLINE', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [agentId]
    );

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'DEVICE_APPROVED', 'STORAGE_AGENT', $2, $3)`,
      [adminUser.id, agentId, JSON.stringify({ approvedAgent: agent.agent_name, machineName: agent.machine_name })]
    );

    return { success: true, message: `Device ${agent.machine_name} approved successfully.` };
  }

  /**
   * Suspends an active device
   */
  async suspendDevice(agentId, adminUser, reason = 'Administrative suspension') {
    const res = await db.query(`SELECT * FROM storage_agents WHERE id = $1`, [agentId]);
    if (!res.rows || res.rows.length === 0) {
      throw new Error(`Device ${agentId} not found`);
    }

    const agent = res.rows[0];
    await db.query(
      `UPDATE storage_agents 
       SET status = 'SUSPENDED', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [agentId]
    );

    // Disconnect active socket if connected
    if (agentHub && agentHub.agents && agentHub.agents.has(agentId)) {
      const session = agentHub.agents.get(agentId);
      try {
        session.ws.send(JSON.stringify({ type: 'AUTH_REJECTED', reason: 'Device SUSPENDED by administrator' }));
        session.ws.close(4003, 'Device suspended');
      } catch (_) {}
      agentHub.agents.delete(agentId);
    }

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'DEVICE_SUSPENDED', 'STORAGE_AGENT', $2, $3)`,
      [adminUser.id, agentId, JSON.stringify({ machineName: agent.machine_name, reason })]
    );

    return { success: true, message: `Device ${agent.machine_name} suspended.` };
  }

  /**
   * Reactivates a suspended device
   */
  async reactivateDevice(agentId, adminUser) {
    const res = await db.query(`SELECT * FROM storage_agents WHERE id = $1`, [agentId]);
    if (!res.rows || res.rows.length === 0) {
      throw new Error(`Device ${agentId} not found`);
    }

    const agent = res.rows[0];
    if (agent.status === 'REVOKED') {
      throw new Error('Cannot reactivate a REVOKED device. Must re-enroll with new keys.');
    }

    await db.query(
      `UPDATE storage_agents 
       SET status = 'OFFLINE', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [agentId]
    );

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'DEVICE_REACTIVATED', 'STORAGE_AGENT', $2, $3)`,
      [adminUser.id, agentId, JSON.stringify({ machineName: agent.machine_name })]
    );

    return { success: true, message: `Device ${agent.machine_name} reactivated successfully.` };
  }

  /**
   * Permanently revokes a device
   */
  async revokeDevice(agentId, adminUser, reason = 'Administrative revocation') {
    const res = await db.query(`SELECT * FROM storage_agents WHERE id = $1`, [agentId]);
    if (!res.rows || res.rows.length === 0) {
      throw new Error(`Device ${agentId} not found`);
    }

    const agent = res.rows[0];

    // Mark credentials revoked
    await db.query(
      `UPDATE agent_credentials 
       SET status = 'REVOKED', expires_at = CURRENT_TIMESTAMP 
       WHERE agent_id = $1`,
      [agentId]
    );

    await db.query(
      `UPDATE storage_agents 
       SET status = 'REVOKED', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [agentId]
    );

    // Terminate live connection
    if (agentHub && agentHub.agents && agentHub.agents.has(agentId)) {
      const session = agentHub.agents.get(agentId);
      try {
        session.ws.send(JSON.stringify({ type: 'AUTH_REJECTED', reason: 'Device REVOKED by security policy' }));
        session.ws.close(4003, 'Device revoked');
      } catch (_) {}
      agentHub.agents.delete(agentId);
    }

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'DEVICE_REVOKED', 'STORAGE_AGENT', $2, $3)`,
      [adminUser.id, agentId, JSON.stringify({ machineName: agent.machine_name, reason })]
    );

    return { success: true, message: `Device ${agent.machine_name} permanently revoked.` };
  }

  /**
   * Requests an agent update
   */
  async requestAgentUpdate(agentId, adminUser, targetVersion = '2.1.0') {
    const res = await db.query(`SELECT * FROM storage_agents WHERE id = $1`, [agentId]);
    if (!res.rows || res.rows.length === 0) {
      throw new Error(`Device ${agentId} not found`);
    }

    const agent = res.rows[0];
    if (agent.status === 'REVOKED') {
      throw new Error('Cannot update a REVOKED device');
    }

    // If agent is connected, send signed update command
    let sentLive = false;
    if (agentHub && agentHub.agents && agentHub.agents.has(agentId)) {
      try {
        await agentHub.sendCommand(agentId, 'UPDATE_AGENT', {
          targetVersion,
          downloadUrl: `/api/agent/update/${targetVersion}`,
          signature: crypto.createHmac('sha256', process.env.JWT_SECRET || 'nkb_secret').update(targetVersion).digest('hex')
        });
        sentLive = true;
      } catch (_) {}
    }

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'DEVICE_UPDATE_REQUESTED', 'STORAGE_AGENT', $2, $3)`,
      [adminUser.id, agentId, JSON.stringify({ machineName: agent.machine_name, targetVersion, sentLive })]
    );

    return { success: true, message: `Update request for ${agent.machine_name} dispatched (target: v${targetVersion}).` };
  }

  /**
   * Returns all devices for the administrative dashboard
   */
  async listAllDevices() {
    const res = await db.query(
      `SELECT a.id, a.agent_name, a.machine_name, a.os_version, a.ip_address, 
              a.status, a.version, a.last_heartbeat, a.public_key, a.created_at, 
              a.updated_at, a.enrollment_token,
              c.key_fingerprint, c.key_version, c.status AS credential_status
       FROM storage_agents a
       LEFT JOIN LATERAL (
         SELECT key_fingerprint, key_version, status 
         FROM agent_credentials 
         WHERE agent_id = a.id 
         ORDER BY created_at DESC LIMIT 1
       ) c ON true
       ORDER BY a.created_at DESC`
    );

    return res.rows.map(row => {
      let meta = {};
      try {
        meta = row.enrollment_token ? JSON.parse(row.enrollment_token) : {};
      } catch (_) {}

      const isLiveConnected = agentHub && agentHub.agents && agentHub.agents.has(row.id);
      let liveStatus = row.status;
      if (row.status !== 'REVOKED' && row.status !== 'SUSPENDED' && row.status !== 'PENDING') {
        liveStatus = isLiveConnected ? 'ONLINE' : 'OFFLINE';
      }

      let platform = 'WINDOWS';
      const os = (row.os_version || '').toLowerCase();
      if (os.includes('mac') || os.includes('darwin') || os.includes('apple') || os.includes('osx')) {
        platform = 'MACOS';
      } else if (os.includes('android')) {
        platform = 'ANDROID';
      } else if (os.includes('ios') || os.includes('iphone') || os.includes('ipad')) {
        platform = 'IOS';
      } else if (os.includes('linux')) {
        platform = 'LINUX';
      }

      return {
        id: row.id,
        agentName: row.agent_name,
        machineName: row.machine_name,
        osVersion: row.os_version || 'Windows',
        platform,
        ipAddress: row.ip_address,
        status: liveStatus,
        persistedStatus: row.status,
        version: row.version,
        lastHeartbeat: row.last_heartbeat,
        createdAt: row.created_at,
        keyFingerprint: row.key_fingerprint || meta.keyFingerprint || (row.public_key ? crypto.createHash('sha256').update(row.public_key.trim()).digest('hex').substring(0, 16) : null),
        keyVersion: row.key_version || 1,
        employeeName: meta.un || meta.userName || 'Unassigned',
        employeeEmail: meta.em || meta.userEmail || null,
        departmentName: meta.depn || meta.departmentName || 'General',
        departmentId: meta.dep || meta.departmentId || null,
        userId: meta.uid || meta.userId || null,
        isLiveConnected
      };
    });
  }

  /**
   * Returns current employee's device status
   */
  async getDeviceStatusForUser(user) {
    const allDevices = await this.listAllDevices();
    const userDevices = allDevices.filter(d => {
      return (d.employeeEmail && d.employeeEmail === user.email) || 
             (d.userId && d.userId === user.id) || 
             (d.agentName && user.full_name && d.agentName.includes(user.full_name));
    });

    if (userDevices.length === 0) {
      return {
        state: 'AGENT_NOT_INSTALLED',
        devices: [],
        message: 'No storage agent detected or registered for your account.'
      };
    }

    const primaryDevice = userDevices[0];
    let computedState = 'DISCONNECTED';

    if (primaryDevice.persistedStatus === 'PENDING') {
      computedState = 'AWAITING_DEVICE_APPROVAL';
    } else if (primaryDevice.persistedStatus === 'SUSPENDED') {
      computedState = 'DISCONNECTED';
    } else if (primaryDevice.persistedStatus === 'REVOKED') {
      computedState = 'DEVICE_REVOKED';
    } else if (primaryDevice.isLiveConnected) {
      computedState = 'CONNECTED';
    } else {
      computedState = 'DISCONNECTED';
    }

    return {
      state: computedState,
      primaryDevice,
      devices: userDevices,
      agentConnected: computedState === 'CONNECTED'
    };
  }

  /**
   * Rotates a device's Ed25519 public key
   */
  async rotateDeviceKey(agentId, newPublicKey, signature) {
    const res = await db.query(`SELECT * FROM storage_agents WHERE id = $1`, [agentId]);
    if (!res.rows || res.rows.length === 0) {
      throw new Error(`Device ${agentId} not found`);
    }

    const agent = res.rows[0];
    if (agent.status === 'REVOKED') {
      throw new Error('Cannot rotate keys for a REVOKED device');
    }

    // Verify rotation signature with existing public key
    const currentPubKey = agent.public_key;
    if (currentPubKey && signature) {
      const isValid = crypto.verify(
        null,
        Buffer.from(`ROTATE_KEY|${agentId}|${newPublicKey.trim()}`),
        crypto.createPublicKey(currentPubKey),
        Buffer.from(signature, 'hex')
      );
      if (!isValid) {
        throw new Error('Key rotation request signature is invalid');
      }
    }

    const fingerprint = crypto.createHash('sha256').update(newPublicKey.trim()).digest('hex');

    // Expire existing active credentials
    await db.query(
      `UPDATE agent_credentials 
       SET status = 'EXPIRED', expires_at = CURRENT_TIMESTAMP 
       WHERE agent_id = $1 AND status = 'ACTIVE'`,
      [agentId]
    );

    // Insert new versioned active credential
    const newCredId = crypto.randomUUID();
    await db.query(
      `INSERT INTO agent_credentials (
        id, agent_id, public_key, signature_algorithm, key_fingerprint, 
        key_version, status, expires_at
      ) VALUES ($1, $2, $3, 'ed25519', $4, 2, 'ACTIVE', CURRENT_TIMESTAMP + INTERVAL '365 days')`,
      [newCredId, agentId, newPublicKey.trim(), fingerprint]
    );

    // Update agent public key
    await db.query(
      `UPDATE storage_agents SET public_key = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newPublicKey.trim(), agentId]
    );

    return {
      success: true,
      agentId,
      newCredentialId: newCredId,
      fingerprint,
      message: 'Device key rotated successfully'
    };
  }
}

export const deviceService = new DeviceService();
export default deviceService;
