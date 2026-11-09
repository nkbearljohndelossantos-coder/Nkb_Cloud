# NKB CLOUD v2.1.0 — AGENT CREDENTIAL & CRYPTOGRAPHY AUDIT
## Cryptographic Architecture, Secret Storage, and Key Management Evaluation

**Organization:** NKB Manufacturing  
**Platform:** NKB Cloud Private Storage Platform  
**Target Scope:** `server/services/agentHub.js`, `storage-agent/src/agent-client.js`, `server/db/schema.sql`, PostgreSQL Staging Database  
**Audit Classification:** Independent Read-Only Security Audit  
**Audit Date:** November 9, 2026  
**Auditor Verdict:** **FAIL (CRITICAL DEFECT SEC-02 IDENTIFIED)**

---

### 1. SCOPE & OBJECTIVE

This independent technical audit evaluates the cryptographic primitives, credential provisioning, secret lifecycle, authentication mechanisms, and key storage architecture of the Stage 2 Storage Agent Security subsystem.

Specific evaluation criteria:
1. Generation and entropy of HMAC shared secrets.
2. Database secret storage format: plaintext vs. encrypted vs. one-way hash vs. derived keys.
3. Secret exposure risks under database read compromise (SQL injection, database dump exposure).
4. Signature parity between Windows Storage Agent and VPS AgentHub.
5. Key rotation, versioning, expiration, and revocation enforcement.

---

### 2. EMPIRICAL PROBE EVIDENCE

An automated probe was executed against the PostgreSQL 16 staging instance (`nkb_cloud_staging`) and the running `AgentHub` subsystem (recorded in `server/audit_evidence_summary.json` Probe 1):

```json
{
  "probe1": {
    "agentTokenColumn": {
      "column_name": "agent_token",
      "data_type": "character varying",
      "is_nullable": "NO"
    },
    "credentialsColumns": [
      "id",
      "agent_id",
      "hmac_secret_hash",
      "key_version",
      "status",
      "created_at",
      "expires_at",
      "revoked_at",
      "revoked_reason"
    ],
    "sampleAgentToken": "nkb_token_stage2_verified",
    "sampleSecretHash": "2ce476d73ff9c75a6d5abf77fdd8b847ea516565143466709345b53badd8fc6a"
  }
}
```

---

### 3. ARCHITECTURAL VULNERABILITY ANALYSIS

#### Finding SEC-02: Plaintext Shared Secret Storage & Cryptographic Architecture Mismatch
**Severity:** **CRITICAL (CVSS v3.1: 8.8 - High Confidentiality & Integrity Impact)**

#### 3.1 Code Inspection: Plaintext Token as HMAC Key
In [`server/services/agentHub.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/agentHub.js#L30-L56):
```javascript
// Lines 30-40: Token lookup in storage_agents
const res = await db.query('SELECT * FROM storage_agents WHERE agent_token = $1', [token]);
if (res.rows && res.rows.length > 0) {
  agent = res.rows[0];
}

// Line 45: Resolving the shared secret
const agentSecret = process.env.AGENT_SECRET || agent.agent_token;
const secretHash = crypto.createHash('sha256').update(agentSecret).digest('hex');

// Lines 48-56: Storing hash in agent_credentials
const credRes = await db.query('SELECT * FROM agent_credentials WHERE agent_id = $1 AND status = \'ACTIVE\'', [agent.id]);
if (!credRes.rows || credRes.rows.length === 0) {
  await db.query(
    `INSERT INTO agent_credentials (id, agent_id, hmac_secret_hash, key_version, status, expires_at)
     VALUES ($1, $2, $3, 1, 'ACTIVE', CURRENT_TIMESTAMP + INTERVAL '365 days')`,
    [crypto.randomUUID(), agent.id, secretHash]
  );
}
```

And in [`server/services/agentHub.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/agentHub.js#L223-L225):
```javascript
// Mutual Challenge HMAC Verification
const expectedPayload = `${challengeId}|${challenge.serverNonce}|${clientNonce}|${challenge.serverTimestamp}`;
const expectedHmac = crypto.createHmac('sha256', challenge.secret).update(expectedPayload).digest('hex');
```

#### 3.2 Vulnerability Mechanics & Risk
1. **Unencrypted Database Column:** The `storage_agents.agent_token` column holds the cleartext secret (e.g. `nkb_token_stage2_verified`).
2. **Exposure Risk:** Any read access to PostgreSQL (backup leaks, read-only replica dump, accidental query logging, or SQL injection) exposes the raw secret. An adversary with database read access can immediately forge WebSocket connections, impersonate the Windows Storage Agent, compute valid HMAC responses, and intercept or inject file transfer commands.
3. **Cryptographic Asymmetry Mismatch:** 
   The `agent_credentials` table defines `hmac_secret_hash VARCHAR(255)` storing `SHA256(agentSecret)`. However:
   - HMAC-SHA256 is a symmetric keyed hash: $H(K \oplus \text{opad} \parallel H(K \oplus \text{ipad} \parallel m))$.
   - In order to compute or verify an HMAC signature, the server **must possess the raw key $K$**.
   - Storing a one-way digest `SHA256(K)` in `agent_credentials` cannot be used to verify $H(K, m)$ unless the client also computes HMAC using `SHA256(K)` as the key. But even if both sides used `SHA256(K)` as the key, `SHA256(K)` would become the effective shared secret, making the hash column itself the plaintext secret!
   - Consequently, `agentHub.js` falls back to `agent.agent_token` (plaintext) as the HMAC key. The `hmac_secret_hash` column is currently non-functional security theater.

---

### 4. CREDENTIAL LIFECYCLE & ROTATION ANALYSIS

#### 4.1 Missing Expiration and Revocation Enforcement
Inspection of [`server/services/agentHub.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/agentHub.js#L195-L265) revealed that during WebSocket challenge verification (`verifyChallengeResponse`):
- `agentHub.js` **never queries `agent_credentials` to verify if the key is `ACTIVE`, expired (`expires_at < CURRENT_TIMESTAMP`), or revoked (`revoked_at IS NOT NULL`)**.
- If an administrator marks a key `REVOKED` in `agent_credentials`, the storage agent can still connect and authenticate successfully, because authentication relies entirely on `storage_agents.agent_token` matching the HTTP header/initial payload.
- Revocation and expiration controls are completely bypassed at runtime.

#### 4.2 Multi-Version Key Rotation Without Downtime
1. The table `agent_credentials` includes `key_version INT NOT NULL DEFAULT 1`.
2. However, neither the WebSocket handshake nor the command envelopes transmit or negotiate a `key_version`.
3. If an administrator rotates an agent secret, all active connections are either rejected or the agent immediately fails authentication upon reconnect because there is no dual-key grace window (allowing both version $N$ and version $N+1$ during transition).

---

### 5. HMAC ENTROPY & TIMING RESISTANCE

| Cryptographic Attribute | Implementation | Evaluation |
|---|---|---|
| **HMAC Algorithm** | HMAC-SHA256 | Compliant (NIST SP 800-107) |
| **Entropy Source** | `crypto.randomBytes(32)` | Compliant (Cryptographically secure PRNG) |
| **Comparison Method** | `crypto.timingSafeEqual(receivedBuf, expectedBuf)` | Compliant (Guards against timing attacks) |
| **Buffer Length Guard** | `receivedBuf.length !== expectedBuf.length` | Compliant (Prevents `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` exceptions) |
| **Key Storage** | Plaintext in `storage_agents.agent_token` | **CRITICAL FAIL (SEC-02)** |
| **Revocation Check** | Omitted in `verifyChallengeResponse` | **HIGH FAIL** |

---

### 6. MANDATORY REMEDIATION ROADMAP

To elevate the credential architecture to production certification, the following two remediation approaches are recommended:

#### Approach A: Asymmetric Key Authentication (Recommended - Best Practice)
Replace symmetric HMAC with public-key digital signatures:
1. The Windows Storage Agent generates an **Ed25519** key pair locally via Windows DPAPI or secure keystore.
2. The VPS database stores only the agent's **Ed25519 Public Key** in `agent_credentials.public_key`.
3. During challenge-response, the server challenges the agent with a random nonce, and the agent signs it using its private key.
4. **Security Benefit:** Even complete database compromise never exposes the agent's signing key. Reusable authentication credentials cannot be stolen from the VPS.

#### Approach B: Envelope Encryption of Symmetric Secrets (Alternative)
If HMAC-SHA256 is retained:
1. Drop cleartext `agent_token` from `storage_agents`.
2. Store the agent secret encrypted at rest in `agent_credentials.encrypted_secret` using AES-256-GCM.
3. Manage the master encryption key via VPS environment variables or external KMS (`NKB_KMS_MASTER_KEY`).
4. Update `verifyChallengeResponse` to explicitly validate `status = 'ACTIVE'` and `expires_at > CURRENT_TIMESTAMP`.

---

### 7. VERDICT

**FAIL.** Production deployment must remain blocked until SEC-02 is formally remediated and verified under PostgreSQL 16.
