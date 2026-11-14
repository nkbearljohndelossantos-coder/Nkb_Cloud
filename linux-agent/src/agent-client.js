import WebSocket from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';

export function buildCanonicalHandshakeString({
  protocolVersion = '2.1.0',
  challengeId,
  agentId,
  serverNonce,
  clientNonce,
  serverTimestamp
}) {
  return `NKB-AUTH-V1|${protocolVersion}|${challengeId}|${agentId}|${serverNonce}|${clientNonce}|${serverTimestamp}`;
}

export class LinuxAgentClient {
  constructor(config = {}) {
    this.serverUrl = config.serverUrl || 'ws://127.0.0.1:5000/ws/agent';
    this.agentId = config.agentId;
    this.agentToken = config.agentToken;
    this.privateKeyPath = config.privateKeyPath;
    this.version = '2.1.0';

    this.ws = null;
    this.status = 'DISCONNECTED';
    this.heartbeatTimer = null;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.onStatusChange = config.onStatusChange || (() => {});
  }

  loadPrivateKey() {
    if (!this.privateKeyPath || !fs.existsSync(this.privateKeyPath)) {
      throw new Error(`Private key not found at ${this.privateKeyPath}`);
    }
    return fs.readFileSync(this.privateKeyPath, 'utf8');
  }

  connect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const wsUrl = `${this.serverUrl}?agentId=${encodeURIComponent(this.agentId)}&agentToken=${encodeURIComponent(this.agentToken)}`;
    console.log(`[LinuxAgent] Connecting to ${this.serverUrl}...`);

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('[LinuxAgent] WebSocket transport connected. Awaiting AUTH_CHALLENGE...');
      this.reconnectAttempts = 0;
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (err) {
        console.error('[LinuxAgent] Error parsing message:', err);
      }
    });

    this.ws.on('close', (code, reason) => {
      console.warn(`[LinuxAgent] WebSocket disconnected (code: ${code}, reason: ${reason})`);
      this.handleDisconnect(code);
    });

    this.ws.on('error', (err) => {
      console.error('[LinuxAgent] WebSocket error:', err.message);
    });
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'AUTH_CHALLENGE':
        this.handleAuthChallenge(msg);
        break;
      case 'AUTH_SUCCESS':
        console.log('[LinuxAgent] Authentication successful. Agent is ONLINE.');
        this.status = 'ONLINE';
        this.onStatusChange('ONLINE');
        this.startHeartbeat(msg.heartbeatInterval || 30);
        break;
      case 'AUTH_REJECTED':
        console.error('[LinuxAgent] Authentication rejected by server:', msg.reason);
        this.status = 'REJECTED';
        this.onStatusChange('REJECTED');
        break;
      case 'PING':
        this.send({ type: 'PONG', timestamp: Date.now() });
        break;
      default:
        console.log('[LinuxAgent] Received message:', msg.type);
    }
  }

  handleAuthChallenge(challenge) {
    const { challengeId, serverNonce, timestamp } = challenge;
    const clientNonce = crypto.randomBytes(32).toString('hex');

    const canonicalString = buildCanonicalHandshakeString({
      protocolVersion: this.version,
      challengeId,
      agentId: this.agentId,
      serverNonce,
      clientNonce,
      serverTimestamp: timestamp
    });

    try {
      const privKeyPem = this.loadPrivateKey();
      const privKey = crypto.createPrivateKey(privKeyPem);
      const signature = crypto.sign(null, Buffer.from(canonicalString, 'utf8'), privKey);

      this.send({
        type: 'AUTH_RESPONSE',
        challengeId,
        agentId: this.agentId,
        clientNonce,
        signature: signature.toString('base64'),
        version: this.version,
        platform: 'Linux',
        machineName: os.hostname()
      });
    } catch (err) {
      console.error('[LinuxAgent] Failed to sign challenge:', err.message);
    }
  }

  startHeartbeat(intervalSeconds = 30) {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.send({
        type: 'HEARTBEAT',
        agentId: this.agentId,
        timestamp: Date.now(),
        uptime: process.uptime()
      });
    }, intervalSeconds * 1000);
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  handleDisconnect(code) {
    this.status = 'OFFLINE';
    this.onStatusChange('OFFLINE');
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Do not reconnect if permanently revoked
    if (code === 4003) {
      console.error('[LinuxAgent] Device REVOKED by administrative policy. Halting reconnection.');
      return;
    }

    // Bounded exponential backoff: 3s to 60s
    this.reconnectAttempts++;
    const delay = Math.min(3000 * Math.pow(1.5, this.reconnectAttempts), 60000);
    const jitter = delay * (0.8 + Math.random() * 0.4);

    console.log(`[LinuxAgent] Reconnecting in ${(jitter / 1000).toFixed(1)}s (attempt ${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => this.connect(), jitter);
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.ws) this.ws.close(1000, 'Agent shutting down');
  }
}
