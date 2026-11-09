import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Deterministic RFC 8785 JSON Canonicalization Scheme (JCS)
 */
export function canonicalJsonStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(k => JSON.stringify(k) + ':' + canonicalJsonStringify(obj[k]));
  return '{' + pairs.join(',') + '}';
}

export function buildCanonicalCommandString({
  protocolVersion = '2.1.0',
  commandId,
  agentId,
  commandType,
  nonce = '',
  keyVersion = 1,
  issuedAt,
  expiresAt,
  payload = {}
}) {
  const canonicalPayload = canonicalJsonStringify(payload || {});
  return `NKB-CMD-V1|${protocolVersion}|${commandId}|${agentId}|${commandType}|${nonce}|${keyVersion}|${issuedAt}|${expiresAt}|${canonicalPayload}`;
}

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

class AgentCryptoEngine {
  constructor(options = {}) {
    this.keysDir = options.keysDir || path.join(__dirname, '..', '.agent_keys');
    this.agentPrivKeyPath = path.join(this.keysDir, 'agent_ed25519_priv.pem');
    this.agentPubKeyPath = path.join(this.keysDir, 'agent_ed25519_pub.pem');
    this.pinnedServerPubKeyPath = path.join(this.keysDir, 'server_ed25519_pub.pem');

    this.agentPrivateKey = null;
    this.agentPublicKey = null;
    this.agentFingerprint = null;
    this.keyVersion = 1;
    this.pinnedServerPublicKey = options.pinnedServerPublicKey || null;

    this.initAgentKeys();
  }

  initAgentKeys() {
    if (!fs.existsSync(this.keysDir)) {
      fs.mkdirSync(this.keysDir, { recursive: true, mode: 0o700 });
      this.hardenWindowsAcl(this.keysDir);
    }

    if (fs.existsSync(this.agentPrivKeyPath) && fs.existsSync(this.agentPubKeyPath)) {
      this.agentPrivateKey = fs.readFileSync(this.agentPrivKeyPath, 'utf8');
      this.agentPublicKey = fs.readFileSync(this.agentPubKeyPath, 'utf8');
      this.agentFingerprint = this.computeKeyFingerprint(this.agentPublicKey);
    } else {
      const { publicKeyPem, privateKeyPem, fingerprint } = this.generateEd25519KeyPair();
      this.agentPrivateKey = privateKeyPem;
      this.agentPublicKey = publicKeyPem;
      this.agentFingerprint = fingerprint;

      fs.writeFileSync(this.agentPrivKeyPath, privateKeyPem, { mode: 0o600 });
      fs.writeFileSync(this.agentPubKeyPath, publicKeyPem, { mode: 0o644 });

      this.hardenWindowsAcl(this.agentPrivKeyPath);
    }

    // Load pinned server public key if present on disk
    if (!this.pinnedServerPublicKey && fs.existsSync(this.pinnedServerPubKeyPath)) {
      this.pinnedServerPublicKey = fs.readFileSync(this.pinnedServerPubKeyPath, 'utf8').trim();
    }
  }

  /**
   * Hardens Windows NTFS Access Control Lists (ACLs) using icacls.exe.
   * Disables inheritance and grants Full Control strictly to Administrators and Current User.
   */
  hardenWindowsAcl(targetPath) {
    if (process.platform !== 'win32') return;
    try {
      const user = process.env.USERDOMAIN && process.env.USERNAME
        ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
        : (process.env.USERNAME || 'SYSTEM');
      // For files, grant Full Control (:F) strictly to Administrators and the running user
      execFileSync('icacls.exe', [
        targetPath,
        '/inheritance:r',
        '/grant:r',
        `*S-1-5-32-544:F`,
        '/grant:r',
        `${user}:F`
      ], { stdio: 'ignore' });
    } catch (err) {
      // Non-fatal fallback if running without elevation in test harnesses
    }
  }

  setPinnedServerPublicKey(serverPubKeyPem) {
    if (!serverPubKeyPem) return;
    this.pinnedServerPublicKey = serverPubKeyPem.trim();
    if (!fs.existsSync(this.keysDir)) {
      fs.mkdirSync(this.keysDir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(this.pinnedServerPubKeyPath, this.pinnedServerPublicKey, { mode: 0o644 });
  }

  generateEd25519KeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const fingerprint = this.computeKeyFingerprint(publicKeyPem);
    return { publicKeyPem, privateKeyPem, fingerprint };
  }

  computeKeyFingerprint(publicKeyPem) {
    return crypto.createHash('sha256').update(publicKeyPem.trim()).digest('hex');
  }

  signPayload(data) {
    if (!this.agentPrivateKey) throw new Error('Agent private key is not initialized');
    const privKey = crypto.createPrivateKey(this.agentPrivateKey);
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    const signature = crypto.sign(null, dataBuffer, privKey);
    return signature.toString('base64');
  }

  /**
   * Strictly verifies incoming server signatures against the PINNED Server Public Key ONLY.
   * Security Invariant: Untrusted command envelopes are NEVER permitted to supply or override the public key!
   */
  verifyServerSignature(data, signatureBase64) {
    if (!this.pinnedServerPublicKey) {
      console.warn('[AgentCryptoEngine] SECURITY HALT: No pinned server public key configured');
      return false;
    }
    if (!data || !signatureBase64) return false;
    try {
      const pubKey = crypto.createPublicKey(this.pinnedServerPublicKey);
      const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
      const sigBuffer = Buffer.from(signatureBase64, 'base64');
      return crypto.verify(null, dataBuffer, pubKey, sigBuffer);
    } catch (err) {
      console.error('[AgentCryptoEngine] Server signature verification error:', err.message);
      return false;
    }
  }

  verifyCanonicalCommand(commandEnvelope, signatureBase64) {
    const canonicalString = buildCanonicalCommandString(commandEnvelope);
    return this.verifyServerSignature(canonicalString, signatureBase64);
  }

  generateSecureNonce(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
  }

  hashSha256(data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    return crypto.createHash('sha256').update(buf).digest('hex');
  }
}

export const agentCryptoEngine = new AgentCryptoEngine();
export default agentCryptoEngine;
