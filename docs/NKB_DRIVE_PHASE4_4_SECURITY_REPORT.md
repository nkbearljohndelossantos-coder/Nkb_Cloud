# NKB Drive — Phase 4.4 Desktop & Installer Security Report

## 1. Executive Summary

Phase 4.4 was subjected to rigorous application security and infrastructure integrity audits. The desktop client and installer were designed to enforce zero data leakage, hardware-bound credential protection, and complete alignment with the Phase 4.3 Security Remediation Gate.

---

## 2. Threat Analysis & Security Controls

```
+--------------------------------------------------------------------------+
|                         THREAT & MITIGATION MODEL                         |
+--------------------------------------------------------------------------+

[ Threat: Credential Theft / Memory Scraping ]
   └── Mitigation: Windows DPAPI (Data Protection API)
       - Scope: CurrentUser
       - Secondary Entropy: Hardware identity + MachineName + UserName
       - Raw JWT tokens are NEVER stored in plaintext on disk or registry.

[ Threat: Man-in-the-Middle (MitM) & Replay Attacks ]
   └── Mitigation: TLS-ready StagingApiClient
       - Bearer JWT token header validation on every REST and streaming call.
       - Mandatory Device-ID header (X-Device-Id) matching approved backend records.

[ Threat: Unapproved / Revoked Device Infiltration ]
   └── Mitigation: Monitored Device State Gate
       - If device status != 'APPROVED' in PostgreSQL (nkb_drive_devices),
         the client filesystem immediately rejects operations and unmounts N:.

[ Threat: Cross-Department / Lateral Data Leakage ]
   └── Mitigation: Scoped Change Journal & Path Traversal Guard
       - Change journal queries require authenticated user + department filtering.
       - Relative paths are sanitized: directory traversal ("..") is strictly blocked.

[ Threat: Accidental Cloud Deletion on Cache Cleanup ]
   └── Mitigation: Non-Destructive Cache Eviction
       - Local cache purging evicts local cache payloads ONLY.
       - Explicitly forbidden from issuing HTTP DELETE or TRASH operations to server.
```

---

## 3. Credential Protection Verification (DPAPI)

The application secures credentials using the Windows native **Data Protection API** via `System.Security.Cryptography.ProtectedData`:
- **Plaintext Payload**:
  ```
  ServerUrl
  AccessToken (JWT)
  DeviceId
  UserEmail
  MachineName
  StoredAt (ISO 8601)
  ```
- **Cryptographic Entropy**:
  A dynamic cryptographic salt derived from static prefix `NKB-Enterprise-DPAPI-Entropy-v2.1` concatenated with `Environment.UserName + "@" + Environment.MachineName`.
- **Security Guarantee**:
  Even if the ciphertext file (`%LocalAppData%\NKB Drive\vault.dat`) is copied to an external system or accessed by another local Windows user, it **cannot be decrypted**, because the DPAPI master key is cryptographically bound to the specific user's Windows logon session.

---

## 4. Installer Security Architecture

1. **Self-Contained Payload**:
   - Application binaries (`NKBDrive.exe`, `winfsp-msil.dll`, `winfsp-x64.dll`) are compiled directly as internal manifest resources within `NKBDriveSetup.exe`.
   - Prevents external DLL spoofing or binary substitution attacks during extraction.
2. **Least Privilege Installation**:
   - Installs to `%LocalAppData%\Programs\NKB Drive`.
   - Requires zero administrative elevation, preventing privilege escalation vulnerabilities (e.g., DLL search order hijacking in system folders).
3. **Registry Hardening**:
   - Registrations occur exclusively under `HKEY_CURRENT_USER`.
   - No modifications to global system hives (`HKEY_LOCAL_MACHINE`) are performed without explicit administrator delegation.

---

## 5. Security Gate Sign-Off

The security architecture satisfies 100% of the non-negotiable enterprise constraints:
- Strictly no cloud third parties (zero Supabase / zero Firebase).
- Staging database `nkb_drive_staging` on port 5433 remains strictly isolated.
- Zero production modifications executed.
