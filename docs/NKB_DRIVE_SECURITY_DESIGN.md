# NKB DRIVE — SECURITY & DLP INTEGRATION SPECIFICATION

**Document Version:** 1.0.0  
**Classification:** NKB Enterprise Confidential  
**Target:** NKB Drive Desktop Client (`N:\`) & NKB Cloud Backend v2.1.0  
**Compliance Mandate:** Zero Plaintext Secrets, DPAPI Encryption, DLP Outside-Company Restrictions, Session Revocation

---

## 1. Threat Model & Trust Boundaries

```
[Windows User Space (Explorer, Office, CAD)]
                 │
                 ▼  (WinFsp IPC / Restricted DACL)
[NKB Drive Client Process]
  ├── [Windows DPAPI Vault] (Encrypted with CurrentUser Scope + Machine Entropy)
  └── [Local SQLite Cache]  (Native winsqlite3.dll)
                 │
                 ▼  (HTTPS TLS 1.3 / Bearer JWT / x-device-id)
[NKB Cloud Express Backend]
  ├── Session Version Invalidation Guard (fail-closed)
  ├── Recursive CTE Folder Permission Engine
  ├── Outside-Company DLP Evaluation
  └── Immutable SHA-256 Audit Chain
```

---

## 2. Windows DPAPI Credential Vault

### 2.1 Storage Mechanism
- Tokens and server secrets are never written to disk in plaintext JSON or config files.
- The vault uses Windows DPAPI via `System.Security.Cryptography.ProtectedData`:
  ```csharp
  byte[] ciphertext = ProtectedData.Protect(
      plaintext, 
      entropy, 
      DataProtectionScope.CurrentUser
  );
  ```
- **Scope:** `DataProtectionScope.CurrentUser`. Ciphertext can only be decrypted by the exact Windows user account that encrypted it on that specific machine.
- **Machine Entropy:** Derived from `Environment.UserName + "@" + Environment.MachineName` combined with an enterprise key prefix.

### 2.2 Tamper Defense & Cryptographic Zero-Wipe
- Any tampering with the ciphertext file triggers a `CryptographicException` from Windows DPAPI, preventing execution with corrupted tokens.
- **Secure Logout:** Before deleting `vault.dat`, the file is overwritten with random zeroes to eliminate data recovery risks from disk remnants.

---

## 3. Session Revocation & Fail-Closed Guard

1. When an employee changes their password, logs out remotely, or is deactivated by an administrator, PostgreSQL increments the user's `session_version`.
2. Every desktop API request transmits JWT with claim `sessionVersion`.
3. If `decoded.sessionVersion !== user.session_version`:
   - The backend responds with `401 Unauthorized` (`code: 'SESSION_REVOKED'`).
   - The desktop client immediately triggers `vault.Purge()`, dismounts `N:\`, and transitions the UI to the login screen.

---

## 4. DLP Outside-Company Locality Enforcement

The user explicitly mandated:
> *"Dapat Automatic if sa Labas ng Company ito binuksan Dapat Automatic itong Restricted For Copying pero pwede mag write Mag Paste ito"*

### 4.1 Locality Evaluation
- Every sync call transmits the client IP (via standard network connection).
- The server evaluates `isCorporateNetwork(clientIp)`.
- If outside approved office IP ranges: `req.isOutsideCompany = true`.

### 4.2 Desktop Enforcement Matrix

| Action | Inside Company Network | Outside Company Network | Enforcement Point |
| :--- | :--- | :--- | :--- |
| **Browse N:\ Folders** | PERMITTED | PERMITTED | File Explorer / WinFsp |
| **Read / Open Files** | PERMITTED | PERMITTED | File Explorer / Hydration |
| **Write / Edit Files** | PERMITTED | PERMITTED (100% Synced) | File Explorer / Sync Engine |
| **Paste Content into N:\**| PERMITTED | PERMITTED | File Explorer / Sync Engine |
| **Export / Copy Out of N:\** | PERMITTED | **BLOCKED (DLP RESTRICTED)**| Explorer Shell Hook |
| **Generate Public Share**| PERMITTED | **DISABLED** | UI & Backend Middleware |
