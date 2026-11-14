# NKB DRIVE — SECURITY & DLP INTEGRATION DESIGN
**Document ID:** NKB-DRIVE-SEC-DLP-01  
**Target:** NKB Drive Desktop Client (`N:\`) & NKB Cloud Backend v2.1.0  
**Date:** November 11, 2026  
**Classification:** NKB Enterprise Confidential  

---

## 1. THREAT MODEL & DEFENSE-IN-DEPTH

The NKB Drive desktop client introduces a virtual filesystem mounted directly into the host operating system kernel via WinFsp. This creates specific security boundaries that must be hardened against data exfiltration, token theft, and unauthorized access.

```
┌────────────────────────────────────────────────────────┐
│                   TRUST BOUNDARY 1                     │
│  Windows User Space (File Explorer, Shell, Local Apps) │
│                                                        │
│  - Virtual Drive N:\ mounted with restricted DACL      │
│  - Access bounded strictly to the logged-in Windows    │
│    user security identifier (SID).                     │
└──────────────────────────┬─────────────────────────────┘
                           │ IPC via WinFsp Driver
                           ▼
┌────────────────────────────────────────────────────────┐
│                   TRUST BOUNDARY 2                     │
│       NKB Drive Background Sync Engine (C# .NET)       │
│                                                        │
│  - Credential Storage: Windows DPAPI (LocalMachine/User)│
│  - Local Metadata: Encrypted SQLite Cache              │
│  - File Integrity: Hardware-accelerated SHA-256 Engine │
└──────────────────────────┬─────────────────────────────┘
                           │ Mutual TLS / HTTPS (TLS 1.3)
                           ▼
┌────────────────────────────────────────────────────────┐
│                   TRUST BOUNDARY 3                     │
│          NKB Cloud Central Backend & Storage           │
│                                                        │
│  - JWT Fail-Closed Session Version Verification        │
│  - Corporate IP & Outside-Company DLP Evaluation       │
│  - Department Recursive CTE Authorization              │
└────────────────────────────────────────────────────────┘
```

---

## 2. CREDENTIAL & TOKEN PROTECTION (DPAPI)

### 2.1 The Threat
Storing JWT tokens, refresh credentials, or device keys in plaintext JSON/XML config files risks exposure to malicious local processes, malware, or unauthorized users on shared workstations.

### 2.2 Mitigation Strategy
The desktop client utilizes the **Windows Data Protection API (DPAPI)** via `System.Security.Cryptography.ProtectedData`:

```csharp
// Secure token persistence using Windows DPAPI
byte[] plaintextBytes = Encoding.UTF8.GetBytes(jwtToken);
byte[] entropy = GetMachineEntropy(); // Device-bound entropy
byte[] encryptedData = ProtectedData.Protect(
    plaintextBytes, 
    entropy, 
    DataProtectionScope.CurrentUser
);
File.WriteAllBytes(secureTokenPath, encryptedData);
```

- **Scope:** `DataProtectionScope.CurrentUser`. The ciphertext can only be decrypted by the exact Windows user account that encrypted it.
- **Revocation Hook:** If `session_version` changes on the server, the backend returns `401 SESSION_REVOKED`, causing the local client to securely overwrite and purge the DPAPI-encrypted token from disk.

---

## 3. DATA LOSS PREVENTION (DLP) & NETWORK LOCALITY

The user explicitly mandated:
> *"Dapat Automatic if sa Labas ng Company ito binuksan Dapat Automatic itong Restricted For Copying pero pwede mag write Mag Paste ito"*

### 3.1 Network Locality Detection
Every sync request transmitted by the desktop client includes standard origin network headers. The backend evaluates:
```javascript
// Server-side Corporate IP Check in server/middleware/auth.js
const clientIp = getClientIp(req);
const isInside = isCorporateNetwork(clientIp);
req.isOutsideCompany = !isInside;
```

### 3.2 Desktop Client DLP Enforcement Rules

When `isOutsideCompany == true`:
1. **Clipboard Copy Restriction:** The desktop client hooks Explorer copy/cut operations on virtual drive `N:\`. Attempting to copy file payloads out of `N:\` to local unapproved storage triggers an alert and blocks the clipboard buffer.
2. **File Payload Watermarking & Read-Only Metadata:** Files marked confidential cannot be exported outside `N:\`.
3. **Write & Paste Permitted:** Creating new files, pasting content into `N:\`, uploading drafts, and saving documents inside `N:\` are **100% permitted and synchronized**, ensuring remote employees can complete their work without endangering intellectual property.
4. **Public Link Blocking:** The desktop client hides and disables "Create Public Link" actions when connected from outside the corporate office.

---

## 4. CONFLICT RESOLUTION & OPTIMISTIC LOCKING

To prevent data loss caused by concurrent edits between the web interface, desktop client, or multiple workstations:

1. **Pre-Commit Check (`validate-version`):** Before uploading a modified file from `N:\`, the client checks if `server_sha256 == base_sha256`.
2. **Deterministic Forking:** If the server copy has changed while the user was offline, the client **NEVER silently overwrites** either file. It automatically forks the local file:
   $$\text{FileName} + \text{ " (Conflict - "} + \text{MachineName} + \text{" "} + \text{YYYY-MM-DD} + \text{")."} + \text{ext}$$
3. Both versions are safely preserved in the cloud, and a Windows system tray notification informs the user to review the changes.

---

## 5. AUDIT LOGGING & COMPLIANCE

Every desktop client operation creates an immutable audit record in PostgreSQL `audit_logs`:
- `DRIVE_DEVICE_REGISTERED`
- `DRIVE_FILE_READ`
- `DRIVE_FILE_COMMITTED`
- `DRIVE_FILE_TRASHED`
- `DRIVE_CONFLICT_FORKED`
- `DRIVE_DLP_VIOLATION_BLOCKED`

All logs record the exact timestamp, user ID, machine name, client IP, and target file SHA-256 hash.
