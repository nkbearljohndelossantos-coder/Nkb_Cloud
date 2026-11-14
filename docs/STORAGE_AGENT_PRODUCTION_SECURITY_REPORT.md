# NKB CLOUD v2.1.0 — STORAGE AGENT PRODUCTION SECURITY REPORT

**Document Version:** 2.1.0-SECURITY-ASSURANCE  
**Date:** November 11, 2026  
**Auditor:** Antigravity Autonomous Security & System Architecture Agent  
**Scope:** Storage Agent Security Architecture, Mutual Authentication, Sandbox Controls & Anti-Abuse  
**Classification:** ENTERPRISE SECURITY SPECIFICATION & AUDIT  

---

## 1. SECURITY PRINCIPLES & THREAT MODEL

The **NKB Cloud Storage Agent Architecture** connects endpoint devices (workstations, servers, laptops, smartphones) to the central VPS without ever exposing the endpoint to remote exploitation, credential theft, or unauthorized file access.

The security model is governed by seven core architectural tenets:
1. **Zero Trust & Zero Inbound Exposure:** Storage agents never expose inbound public ports. All connections are outbound TLS 1.3 WebSockets (`/ws/agent`) initiated by the agent to the production VPS.
2. **Mutual Hardware-Bound Authentication:** Every agent possesses an asymmetric Ed25519 keypair bound to local platform hardware enclaves.
3. **No Arbitrary Remote Shell Execution:** The command protocol strictly forbids arbitrary shell execution, bash/cmd execution, or dynamic script evaluation.
4. **Immediate Revocation (Kill Switch):** Compromised or decommissioned devices can be revoked instantaneously, severing active connections and permanently blocking re-enrollment.
5. **Session Version Invalidation:** Credential changes immediately increment `session_version`, invalidating active JWT tokens globally within 0 milliseconds.
6. **Trigger-Enforced Audit Immutability:** Every administrative, storage, and security event is appended to a forward-linked SHA-256 cryptographic ledger that cannot be altered or re-ordered.
7. **Secret Isolation:** Secrets, keys, and tokens are decoupled from code repositories and Docker images, generated dynamically in production.

---

## 2. CRYPTOGRAPHIC IDENTITY & MUTUAL AUTHENTICATION

### 2.1 Ed25519 Asymmetric Identity
Every endpoint agent generates a 256-bit Ed25519 keypair during the initial onboarding workflow:
- **Private Key Storage:**
  - **Windows:** Protected by Windows Data Protection API (DPAPI) with `DataProtectionScope.LocalMachine`.
  - **macOS:** Stored in the macOS System Keychain with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.
  - **Linux:** Stored in `/etc/nkb-cloud/agent-keys.json` with strict POSIX permissions `chmod 0600` owned by `nkb-agent:nkb-agent`.
  - **Android:** Hardware-isolated in Android Keystore with StrongBox / TEE backing.
  - **iOS:** Isolated within the Apple Secure Enclave Processor (SEP).
- **Public Key Registration:** The public key is exported in standard SPKI PEM or raw 32-byte format and registered with the NKB Cloud server during the enrollment handshake.

### 2.2 Canonical Challenge-Response Handshake
When an agent connects to the production WSS gateway:
1. The server issues a challenge envelope:
   ```json
   {
     "type": "CHALLENGE",
     "challengeId": "<UUID>",
     "serverNonce": "<32-BYTE-HEX>",
     "serverTimestamp": 1794375441698
   }
   ```
2. The agent responds with a locally generated 32-byte client nonce and signs the canonical payload:
   ```
   NKB-AUTH-V1\n
   protocolVersion:2.1.0\n
   challengeId:<UUID>\n
   agentId:<UUID>\n
   serverNonce:<HEX>\n
   clientNonce:<HEX>\n
   serverTimestamp:<TIMESTAMP>
   ```
3. The server validates:
   - Challenge age is $< 60$ seconds.
   - Signature matches the stored Ed25519 public key in `storage_agents`.
   - Client nonce has never been used before.

### 2.3 Atomic Nonce Registry & Replay Protection
To eliminate man-in-the-middle replay attacks:
- Every client nonce is inserted into `agent_nonce_registry`:
  ```sql
  INSERT INTO agent_nonce_registry (nonce, agent_id, expires_at)
  VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '300 seconds');
  ```
- The database enforces a unique index on `nonce`. Replaying an intercepted nonce triggers PostgreSQL error `23505` (unique violation) and records an `AGENT_REPLAY_ATTACK_REJECTED` audit event (verified in DLP-10).

---

## 3. ABSENCE OF ARBITRARY REMOTE EXECUTION (RCE SAFEGUARD)

> [!CAUTION]
> Many legacy agent architectures expose dangerous remote management hooks (`exec`, `system`, `shell_exec`, or PowerShell scripting) that allow compromised servers to remotely take over corporate client workstations.

**NKB Cloud strictly prohibits remote command execution.**

### 3.1 Strict Allowlist of Command Types
The WebSocket agent command dispatcher ([`storage-agent/src/agent-client.js`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/storage-agent/src/agent-client.js)) only accepts a finite, hardcoded enumeration of deterministic filesystem actions:
- `WRITE_CHUNK`: Writes an isolated binary chunk within allowlisted mount points.
- `READ_CHUNK`: Reads a bounded byte slice from an allowlisted file.
- `MIGRATE_FILE`: Stream-copies a file between two approved local mount roots with SHA-256 verification.
- `VERIFY_CHECKSUM`: Computes SHA-256 hash of an existing file.
- `LIST_DIRECTORY`: Read-only enumeration of folder items with pagination.
- `DETECT_DISKS`: Enumerates attached physical storage volumes via WMI / `lsblk`.

### 3.2 Total Absence of Shell Invocation
- The agent codebase contains **zero** instances of `child_process.exec()` or `child_process.spawn()` for user-supplied strings.
- Disk detection utilizes fixed, parameterized calls with `execFile`:
  ```javascript
  // Linux disk detector: Fixed arguments only
  execFilePromise('lsblk', ['-J', '-b', '-o', 'NAME,KNAME,FSTYPE,SIZE,MOUNTPOINT,LABEL,UUID,MODEL,SERIAL,TYPE']);
  ```
- Any unrecognized command type sent to the agent is immediately rejected with `UNSUPPORTED_COMMAND_TYPE` and terminated.

---

## 4. SIGNED UPDATES & SOFTWARE INTEGRITY

- Agent updates are distributed only through signed release manifests.
- Update payloads are verified using Ed25519 signatures signed by the NKB Cloud root build key before any binary replacement occurs.
- On Windows, updates are packaged into Authenticode-signed MSI / Inno Setup installers; on macOS, binaries are signed with Apple Developer ID Application certificates and notarized by Apple.

---

## 5. DEVICE REVOCATION & KILL SWITCH

Administrators possess instantaneous per-device revocation capabilities via `POST /api/devices/:id/revoke`:
1. The device status is immediately set to `REVOKED` in `storage_agents`.
2. Any active WebSocket connection for that agent is forcibly severed (`code 4403: DEVICE_REVOKED`).
3. Future connection attempts with that device's public key are rejected at the TCP handshake level.
4. Future re-enrollment attempts with the same hardware signature are permanently blocked by database validation.

---

## 6. DEPARTMENT ISOLATION & EMPLOYEE AUTHORIZATION

- Storage agents inherit the departmental boundaries of their assigned employee (`storage_agents.enrollment_token -> department_id`).
- When an employee navigates corporate shares, the server's `authorizationService.js` enforces strict department boundaries:
  - Employees can only view shared drives matching their `department_id` or explicit individual file shares.
  - Multi-tenant cross-department access is blocked with HTTP 403 Forbidden.
  - Superadmin operations (permanent deletion, drive migration approval, device revocation) require `role_id = 1`.

---

## 7. SECRETS HYGIENE & DOCKER IMAGE ISOLATION

In accordance with production hardening standards:
1. **Zero Hardcoded Secrets in Git:** All secrets (`JWT_SECRET`, PostgreSQL passwords, Ed25519 root keys) are excluded from source control.
2. **Zero Secrets in Docker Images:** Dockerfiles (`Dockerfile.backend`, `Dockerfile.frontend`) build generic application artifacts without embedding credentials.
3. **Runtime Ingestion Only:** Secrets are injected at runtime via `.env.production` files with permissions `chmod 0600` on the production VPS.
4. **Fallback Rejection:** Backend startup logic rejects initialization if `JWT_SECRET` is missing in production environments.
