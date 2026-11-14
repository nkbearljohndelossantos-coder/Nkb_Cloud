# NKB Drive — Phase 5.2 Security Validation Report

## 1. Executive Summary

This report delivers the cybersecurity and threat validation for the **Phase 5.2 Controlled Acceptance Test** of **NKB Drive (N:)**.

The evaluation audited the client workstation security boundaries, DPAPI credential protection, device identification gates, multi-tenant RBAC isolation, path traversal resilience, and code integrity enforcement.

### Security Scorecard
- **Security Assertions Evaluated**: 8
- **Passed Controls**: 7
- **Failed Controls**: 1 (Authenticode Digital Code Signing)
- **Privilege Separation**: Standard user context strictly maintained (Zero UAC elevation required)
- **Local Credential Protection**: Windows DPAPI CurrentUser Scope + Machine/User Entropy Salt (Verified)
- **Overall Security Classification**: **PASSED WITH LIMITATIONS**

---

## 2. Security Assessment Matrix

| Security Control | Objective / Requirement | Observed Evidence | Status |
| :--- | :--- | :--- | :---: |
| **Authenticode Signature** | Executable digitally signed with trusted certificate | `Get-AuthenticodeSignature` returned `Status: NotSigned`, `SignatureType: None` | **FAIL** |
| **Least Privilege Execution** | Installer & client run without admin elevation | `NKBDriveSetup.exe /S` installed into `%LocalAppData%\Programs` under standard user | **PASS** |
| **DPAPI Credential Vault** | Local JWT & session protected via DPAPI | Saved to `%LocalAppData%\NKB Drive\vault.dat` using `CurrentUser` + machine/user entropy | **PASS** |
| **Mandatory Device Identity** | Virtual drive endpoints require `x-device-id` | `validateDriveDevice` middleware rejects requests lacking device ID with HTTP 401 | **PASS** |
| **Device Approval Gate** | Unregistered or unapproved devices denied | Workstation registered as `PENDING`; access denied until admin API approves | **PASS** |
| **Instant Device Revocation** | Auto-unmount on administrative revocation | Revoked device immediately rejected with HTTP 403; triggers clean virtual drive unmount | **PASS** |
| **Multi-Tenant Scoping** | Users restricted to authorized department folders | Access control checks (`verifyFolderAccess`) prevent traversing unauthorized roots | **PASS** |
| **Path Traversal Defense** | Directory escape attempts blocked | Requests containing `..` or UNC sequences rejected with HTTP 400/404 | **PASS** |

---

## 3. Analysis of Critical Security Finding: Code Signing (FAIL)

### Technical Observation
Execution of PowerShell's standard code integrity inspection against the installer executable returned:
```powershell
Get-AuthenticodeSignature -FilePath "NKBDriveSetup.exe"

SignerCertificate      : 
TimeStamperCertificate : 
Status                 : NotSigned
StatusMessage          : The file ...\NKBDriveSetup.exe is not digitally signed.
Path                   : ...\NKBDriveSetup.exe
SignatureType          : None
IsOSBinary             : False
```

### Risk Assessment & Mitigation
1. **Windows SmartScreen**: When distributed over the corporate intranet or downloaded from the NKB Cloud web portal, Windows Defender SmartScreen blocks unsigned binaries with an "Unknown Publisher" warning.
2. **Endpoint Hardening (WDAC / AppLocker)**: High-security workstations with active application control policies will refuse to execute unsigned executables located within `%LocalAppData%`.
3. **Mandatory Action Prior to Fleet Rollout**:
   - The installer `NKBDriveSetup.exe` and core executable `NKBDrive.exe` must be signed with the enterprise internal PKI Code Signing Certificate or an EV commercial certificate:
     ```cmd
     signtool.exe sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a "NKBDriveSetup.exe"
     ```

---

## 4. Local Workstation Security & DPAPI Vault Implementation

### Cryptographic Configuration
The local desktop application avoids plaintext token storage entirely:
- **Ciphertext Storage**: `%LocalAppData%\NKB Drive\vault.dat` (448 bytes)
- **API Call**: `System.Security.Cryptography.ProtectedData.Protect`
- **Scope**: `DataProtectionScope.CurrentUser`
- **Entropy Salt**:
  ```csharp
  byte[] prefix = Encoding.UTF8.GetBytes("NKB-Enterprise-DPAPI-Entropy-v2.1");
  byte[] userBytes = Encoding.UTF8.GetBytes(Environment.UserName + "@" + Environment.MachineName);
  byte[] entropy = Combine(prefix, userBytes);
  ```
- **Durability Invariant**: During workstation rollback (`Uninstall.exe --uninstall /S`), `vault.dat` is intentionally preserved, allowing seamless reconnection upon reinstallation without requiring re-authentication.

---

## 5. Security Audit Conclusion

All functional security, credential storage, device identity, and RBAC boundary controls are operating with enterprise-grade reliability. The only unresolved security gate is the requirement for enterprise digital code signing.

**Security Validation Status**: **PASSED WITH LIMITATIONS (Awaiting Code Signing)**
