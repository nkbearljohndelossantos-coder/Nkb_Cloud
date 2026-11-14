import Foundation
import CryptoKit

/// CryptoManager: Handles Apple CryptoKit Ed25519 asymmetric cryptography
/// Generates device-isolated keypairs, persists private keys in Keychain,
/// and produces RFC 8785 canonical challenge-response signatures.
public final class CryptoManager {
    public static let shared = CryptoManager()
    private let privateKeyKeychainKey = "device_ed25519_private_key"
    
    private init() {}
    
    /// Loads or generates the device-specific Ed25519 private key
    public func getOrCreatePrivateKey() throws -> Curve25519.Signing.PrivateKey {
        if let keyData = KeychainManager.shared.load(key: privateKeyKeychainKey) {
            return try Curve25519.Signing.PrivateKey(rawRepresentation: keyData)
        }
        
        let newKey = Curve25519.Signing.PrivateKey()
        KeychainManager.shared.save(key: privateKeyKeychainKey, data: newKey.rawRepresentation)
        return newKey
    }
    
    /// Returns the public key formatted as SPKI PEM string for NKB Cloud backend registration
    public func getPublicKeyPem() throws -> String {
        let privKey = try getOrCreatePrivateKey()
        let pubKey = privKey.publicKey
        
        // SubjectPublicKeyInfo prefix for Ed25519 (OID 1.3.101.112)
        let spkiPrefix = Data([
            0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00
        ])
        let spkiData = spkiPrefix + pubKey.rawRepresentation
        let base64 = spkiData.base64EncodedString(options: [.lineLength64Characters])
        
        return "-----BEGIN PUBLIC KEY-----\n\(base64)\n-----END PUBLIC KEY-----\n"
    }
    
    /// Computes SHA-256 key fingerprint
    public func getKeyFingerprint() throws -> String {
        let pem = try getPublicKeyPem()
        let clean = pem.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let data = clean.data(using: .utf8) else { return "" }
        let digest = SHA256.hash(data: data)
        return digest.compactMap { String(format: "%02x", $0) }.joined()
    }
    
    /// Signs a canonical challenge string using Ed25519
    public func sign(canonicalMessage: String) throws -> String {
        let privKey = try getOrCreatePrivateKey()
        guard let data = canonicalMessage.data(using: .utf8) else {
            throw NSError(domain: "CryptoManager", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid message data"])
        }
        let signature = try privKey.signature(for: data)
        return signature.base64EncodedString()
    }
}
