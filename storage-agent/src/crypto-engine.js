import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AgentCryptoEngine {
  constructor(options = {}) {
    this.keysDir = options.keysDir || path.join(__dirname, '..', '.agent_keys');
    this.agentPrivKeyPath = path.join(this.keysDir, 'agent_ed25519_priv.pem');
    this.agentPubKeyPath = path.join(this.keysDir, 'agent_ed25519_pub.pem');
    this.pinnedServerPubKeyPath = path.join(this.keysDir, 'server_ed25519_pub.pem');

    this.agentPrivateKey = null;
    this.agentPublicKey = null;
    this.agentFingerprint = null;
    this.pinnedServerPublicKey = options.pinnedServerPublicKey || null;

    this.initAgentKeys();
  }

  initAgentKeys() {
    if (!fs.existsSync(this.keysDir)) {
      fs.mkdirSync(this.keysDir, { recursive: true, mode: 0o700 });
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
    }

    // Load pinned server public key if present on disk
    if (!this.pinnedServerPublicKey && fs.existsSync(this.pinnedServerPubKeyPath)) {
      this.pinnedServerPublicKey = fs.readFileSync(this.pinnedServerPubKeyPath, 'utf8');
    }
  }

  setPinnedServerPublicKey(serverPubKeyPem) {
    if (!serverPubKeyPem) return;
    this.pinnedServerPublicKey = serverPubKeyPem.trim();
    if (!fs.existsSync(this.keysDir)) {
      fs.mkdirSync(this.keysDir, { recursive: true });
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

  verifyServerSignature(data, signatureBase64, overrideServerPubKey = null) {
    const keyToUse = overrideServerPubKey || this.pinnedServerPublicKey;
    if (!keyToUse) {
      console.warn('[AgentCryptoEngine] No pinned server public key available for verification');
      return false;
    }
    if (!data || !signatureBase64) return false;
    try {
      const pubKey = crypto.createPublicKey(keyToUse);
      const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
      const sigBuffer = Buffer.from(signatureBase64, 'base64');
      return crypto.verify(null, dataBuffer, pubKey, sigBuffer);
    } catch (err) {
      console.error('[AgentCryptoEngine] Signature verification error:', err.message);
      return false;
    }
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
