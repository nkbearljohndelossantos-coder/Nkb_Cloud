import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CryptoEngine {
  constructor() {
    this.keysDir = path.join(__dirname, '..', '.keys');
    this.serverPrivKeyPath = path.join(this.keysDir, 'server_ed25519_priv.pem');
    this.serverPubKeyPath = path.join(this.keysDir, 'server_ed25519_pub.pem');
    this.serverPrivateKey = null;
    this.serverPublicKey = null;
    this.serverFingerprint = null;
    this.initServerKeys();
  }

  initServerKeys() {
    if (!fs.existsSync(this.keysDir)) {
      fs.mkdirSync(this.keysDir, { recursive: true, mode: 0o700 });
    }

    if (fs.existsSync(this.serverPrivKeyPath) && fs.existsSync(this.serverPubKeyPath)) {
      this.serverPrivateKey = fs.readFileSync(this.serverPrivKeyPath, 'utf8');
      this.serverPublicKey = fs.readFileSync(this.serverPubKeyPath, 'utf8');
      this.serverFingerprint = this.computeKeyFingerprint(this.serverPublicKey);
    } else {
      const { publicKeyPem, privateKeyPem, fingerprint } = this.generateEd25519KeyPair();
      this.serverPrivateKey = privateKeyPem;
      this.serverPublicKey = publicKeyPem;
      this.serverFingerprint = fingerprint;

      fs.writeFileSync(this.serverPrivKeyPath, privateKeyPem, { mode: 0o600 });
      fs.writeFileSync(this.serverPubKeyPath, publicKeyPem, { mode: 0o644 });
    }
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

  signPayload(data, privateKeyPem = null) {
    const keyToUse = privateKeyPem || this.serverPrivateKey;
    if (!keyToUse) throw new Error('No private key available for signing');
    const privKey = crypto.createPrivateKey(keyToUse);
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    const signature = crypto.sign(null, dataBuffer, privKey);
    return signature.toString('base64');
  }

  verifySignature(data, signatureBase64, publicKeyPem) {
    if (!data || !signatureBase64 || !publicKeyPem) return false;
    try {
      const pubKey = crypto.createPublicKey(publicKeyPem);
      const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
      const sigBuffer = Buffer.from(signatureBase64, 'base64');
      return crypto.verify(null, dataBuffer, pubKey, sigBuffer);
    } catch (err) {
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

export const cryptoEngine = new CryptoEngine();
export default cryptoEngine;
