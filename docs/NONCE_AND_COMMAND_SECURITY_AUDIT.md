# NKB CLOUD v2.1.0 — NONCE & COMMAND SECURITY AUDIT
## Replay Attack Resistance, Command Envelopes, and Idempotency Lifecycle

**Organization:** NKB Manufacturing  
**Platform:** NKB Cloud Private Storage Platform  
**Target Scope:** `server/services/agentHub.js`, `storage-agent/src/agent-client.js`, `storage-agent/src/file-engine.js`, `agent_nonce_registry` Table  
**Audit Classification:** Independent Read-Only Security Audit  
**Audit Date:** November 9, 2026  
**Auditor Verdict:** **FAIL (CRITICAL DEFECT SEC-01 & HIGH DEFECT SEC-03 IDENTIFIED)**

---

### 1. SCOPE & OBJECTIVE

This technical audit investigates the command plane and replay prevention mechanisms between the VPS `AgentHub` and the Windows Storage Agent.

The evaluation covers:
1. Nonce generation, entropy, and lifecycle tracking.
2. Replay attack vulnerability during handshake challenge-response.
3. Command envelope structure, parameter verification, and cryptographic signing.
4. The "Signature Stripping" flaw in command dispatch.
5. Idempotency guarantees, caching mechanisms, and restart survivability.
6. Execution boundaries, shell command isolation, and destructive payload safety (`DELETE_PAYLOAD`).

---

### 2. EMPIRICAL PROBE EVIDENCE

#### Probe Result: Unsigned Command Execution Test
During the automated security audit suite (recorded in `server/audit_evidence_summary.json` Probe 2), an envelope with a stripped `signature` field was transmitted directly to `StorageAgentClient.handleSecureCommand()`:

```json
{
  "probe2": {
    "unsignedExecutionAllowed": true
  }
}
```

The Windows Storage Agent accepted the unsigned envelope and executed `SCAN_DRIVES` without rejecting the command or raising a signature error.

---

### 3. VULNERABILITY DEEP DIVE

#### Finding SEC-01: Optional Command Signature Verification ("Signature Strip" Vulnerability)
**Severity:** **CRITICAL (CVSS v3.1: 9.1 - High Integrity & Availability Impact)**

#### 3.1 Code Inspection: `storage-agent/src/agent-client.js`
In [`storage-agent/src/agent-client.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/storage-agent/src/agent-client.js#L195-L220):
```javascript
  // Handle strictly typed secure command envelopes
  async handleSecureCommand(envelope) {
    const { commandId, commandType, idempotencyKey, expiresAt, payload, signature } = envelope;

    if (!commandId || !commandType) {
      return;
    }

    // 1. Verify envelope cryptographic signature if signature is present
    if (signature) {
      const signData = `${commandId}|${commandType}|${idempotencyKey || ''}|${expiresAt}|${JSON.stringify(payload || {})}`;
      const expectedSig = crypto.createHmac('sha256', this.agentSecret).update(signData).digest('hex');
      
      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSig);
      if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        console.warn(`[StorageAgent] Signature verification failed for command ${commandId} (${commandType})`);
        this.send({
          type: 'COMMAND_REPLY',
          commandId,
          status: 'FAILED',
          error: 'Invalid HMAC-SHA256 command signature'
        });
        return;
      }
    }

    // 2. Check expiration ...
```

#### 3.2 Vulnerability Mechanics & Exploit Scenario
1. **Conditional Verification:** Signature verification is guarded by `if (signature)`. If the `signature` key is absent, `undefined`, or empty string `""`, the entire `if` block is skipped.
2. **Exploitation Impact:** If an attacker can inject messages into the agent's WebSocket connection or compromise an intermediary proxy/relay, they can craft arbitrary command envelopes (`DELETE_PAYLOAD`, `WRITE_CHUNK`, `SCAN_DRIVES`) omitting the `signature` field. The storage agent executes the commands without authentication.
3. **Compounding Factor:** In `storage-agent/src/file-engine.js:263-272`, `deleteFile()` deletes any file within a path provided in the payload. An unsigned envelope containing `DELETE_PAYLOAD` would immediately execute `fs.unlinkSync()`.

---

#### Finding SEC-03: Nonce Registration Exception Swallowing
**Severity:** **HIGH (CVSS v3.1: 7.4 - Integrity & Replay Risk)**

#### 3.3 Code Inspection: `server/services/agentHub.js`
In [`server/services/agentHub.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/server/services/agentHub.js#L236-L260):
```javascript
    // 4. Register Nonces with 300-second expiration to prevent future replay attacks
    try {
      await db.query(
        `INSERT INTO agent_nonce_registry (nonce, agent_id, expires_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '300 seconds')`,
        [challenge.serverNonce, challenge.agent.id]
      );
      await db.query(
        `INSERT INTO agent_nonce_registry (nonce, agent_id, expires_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '300 seconds')`,
        [clientNonce, challenge.agent.id]
      );
    } catch (regErr) {
      console.warn('[AgentHub] Nonce registration notice:', regErr.message);
    }

    // 5. Establish Authenticated Session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    this.agents.set(challenge.agent.id, {
      ws,
      agentRecord: challenge.agent,
      agentSecret: challenge.secret,
      sessionToken,
      authenticated: true
    });
```

#### 3.4 Concurrency Race Condition Analysis
1. Step 2 (`SELECT nonce FROM agent_nonce_registry`) and Step 4 (`INSERT INTO agent_nonce_registry`) are **not atomic**. They run in separate queries without a wrapping transaction or row lock.
2. If two concurrent challenge-response messages with identical nonces arrive within milliseconds of each other:
   - Both pass the Step 2 `SELECT` query because neither has been inserted yet.
   - The first request executes Step 4 and successfully inserts the nonce.
   - The second request executes Step 4 and throws PostgreSQL error `23505 (unique_violation)`.
   - **Crucially**, `catch (regErr)` merely logs `[AgentHub] Nonce registration notice:` and does **not** abort the authentication.
   - Both connections proceed to Step 5, are granted `AUTH_GRANTED`, and establish authenticated sessions using the replayed nonce!

---

#### Finding SEC-04: Volatile In-Memory Idempotency Cache
**Severity:** **MEDIUM (CVSS v3.1: 5.3 - Reliability & Replay Risk)**

#### 3.5 Code Inspection: `storage-agent/src/agent-client.js`
In [`storage-agent/src/agent-client.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/storage-agent/src/agent-client.js#L26):
```javascript
class StorageAgentClient {
  constructor(options = {}) {
    ...
    this.executedCommands = new Map(); // In-memory idempotency cache
```

#### 3.6 Lifecycle Analysis
1. **Zero Persistence:** `this.executedCommands` is an ephemeral JavaScript `Map`. If the Windows agent process restarts, crashes, or is restarted by the Windows Service Control Manager, the entire idempotency history is lost.
2. **Unbounded Memory Allocation:** The map is never pruned or expired. Over months of 24/7 continuous production operation processing hundreds of thousands of chunk writes, `this.executedCommands` will steadily leak memory until an `Out of Memory` crash occurs.

---

### 4. COMMAND DISPATCH SECURITY & PRIVILEGE BOUNDARIES

| Evaluation Criterion | Implementation | Audit Finding |
|---|---|---|
| **Arbitrary Shell Execution** | Handled exclusively via rigid `switch (commandType)` | **PASS:** No `child_process.exec()`, `execSync()`, or PowerShell execution paths exist for arbitrary VPS commands. |
| **Command Envelope Typing** | Enforces `commandId`, `commandType`, `expiresAt`, `payload` | **PASS:** Validates mandatory schema properties. |
| **Envelope Expiration** | Enforces `expiresAt < new Date()` | **PASS:** Commands outside execution window are rejected with `EXPIRED`. |
| **Cryptographic Signature** | HMAC-SHA256 signature verification | **FAIL (SEC-01):** Signature check is optional if signature field is omitted. |
| **Destructive Command Control** | `DELETE_RETIRED_PAYLOAD` restricted to allowlisted roots | **CONDITIONAL PASS:** Unlinks file, but `mountPath` is dynamically registered into allowlist without static boundary check. |

---

### 5. REMEDIATION REQUIREMENTS

#### Remediation for SEC-01 (Mandatory Signature Enforcement):
In `storage-agent/src/agent-client.js`, require cryptographic signatures on every command envelope unconditionally:
```javascript
// Remediated Signature Verification
if (!signature || typeof signature !== 'string') {
  console.error(`[StorageAgent] REJECTED: Command ${commandId} missing mandatory HMAC signature`);
  this.send({
    type: 'COMMAND_REPLY',
    commandId,
    status: 'FAILED',
    error: 'Security Violation: Mandatory cryptographic signature missing'
  });
  return;
}
```

#### Remediation for SEC-03 (Atomic Nonce Insertion):
In `server/services/agentHub.js`, execute nonce registration inside an atomic block and immediately reject authentication if insertion fails:
```javascript
try {
  await db.query(
    `INSERT INTO agent_nonce_registry (nonce, agent_id, expires_at)
     VALUES ($1, $3, CURRENT_TIMESTAMP + INTERVAL '300 seconds'),
            ($2, $3, CURRENT_TIMESTAMP + INTERVAL '300 seconds')`,
    [challenge.serverNonce, clientNonce, challenge.agent.id]
  );
} catch (regErr) {
  console.error(`[AgentHub] Nonce registration or replay collision: ${regErr.message}`);
  ws.send(JSON.stringify({ type: 'AUTH_REJECTED', reason: 'Replay protection error: Nonce collision' }));
  ws.close(4003, 'Replay protection error');
  return;
}
```

#### Remediation for SEC-04 (Persistent & Pruned Idempotency Cache):
Replace the in-memory `Map` with an LRU cache with maximum entry limits (e.g., 50,000 entries) or a local SQLite/RocksDB persistent store on the Windows Storage Agent.

---

### 6. VERDICT

**FAIL.** Production deployment must remain blocked until SEC-01 and SEC-03 are remediated and verified under PostgreSQL 16.
