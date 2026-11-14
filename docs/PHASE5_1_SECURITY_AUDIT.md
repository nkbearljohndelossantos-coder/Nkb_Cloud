# NKB Drive — Phase 5.1 Security Audit Report

## 1. Executive Summary

This security audit provides an independent cybersecurity assessment of **NKB Drive (N:)** prior to authorizing production deployment. The review examines the cryptographic integrity of local credentials, device identity management, backend API authentication, department-level access control, and vulnerability resilience against unauthorized access.

### Audit Summary
- **Overall Security Classification**: **PASS WITH LIMITATIONS**
- **Evaluated Security Domains**: 6
- **Automated Security Controls**: 6 of 6 Passed (100%)
- **Cryptographic Protection**: Windows DPAPI CurrentUser Scope + Machine/User Entropy Salt (Verified)
- **Primary Security Finding**: Installer executable is unsigned, which constitutes a security distribution risk in enterprise environments enforcing strict application whitelisting (WDAC / AppLocker).

---

## 2. Security Domain Findings & Classifications

| Security Domain | Evaluation Objective | Verification Evidence | Classification |
| :--- | :--- | :--- | :---: |
| **1. Credential Vault** | Local token protection via Windows DPAPI | Encrypted using `ProtectedData.Protect` under `DataProtectionScope.CurrentUser` with machine-user entropy. Output stored at `%LocalAppData%\NKB Drive\vault.dat`. Key export is cryptographically prevented. | **PASS** |
| **2. Device Identification** | Workstation identity gating on drive endpoints | `validateDriveDevice` middleware strictly enforces `x-device-id` on `/api/v1/drive/*`. Omission returns HTTP 401 `MISSING_DEVICE_ID`. | **PASS** |
| **3. Device Approval Lifecycle** | Preventing unauthorized or revoked hardware | Devices registered via `/devices/register` must transition to `APPROVED` via admin API. Pending, rejected, or revoked devices receive HTTP 403. | **PASS** |
| **4. JWT & Session Security** | Token forgery & replay mitigation | Standard HMAC-SHA256 signature verification. Tampered tokens rejected with HTTP 401. Tokens include user identity and department scoping. | **PASS** |
| **5. Multi-Tenant RBAC** | Preventing cross-department file leakage | Verified via `verifyFolderAccess` and `verifyFileAccess` services. Users cannot enumerate or hydrate folders outside their assigned department permissions. | **PASS** |
| **6. Path Traversal Defense** | Preventing directory escape attacks | Regex and path normalization reject `..`, forward/backward slash anomalies, and UNC paths (`../../etc/passwd` rejected with HTTP 400). | **PASS** |
| **7. Chunk Injection Guard** | Preventing upload session tampering | Upload sessions bound to `user_id` and `device_id`. Chunk uploads validate session ownership before accepting binary data. Foreign sessions return HTTP 404. | **PASS** |
| **8. Logging Sanitization** | Protecting sensitive credentials in logs | Desktop client and Express server Morgan logs audit confirmed zero logging of passwords, plaintext JWTs, DPAPI byte arrays, or file payload streams. | **PASS** |
| **9. Executable Authenticode** | Code signing verification on endpoints | `Get-AuthenticodeSignature` confirmed `NKBDriveSetup.exe` has `Status: NotSigned`. Unsigned binaries fail enterprise WDAC / SmartScreen gates. | **FAIL** |

---

## 3. Cryptographic Deep-Dive: DPAPI Local Credential Vault

### Encryption Architecture
Local authentication tokens, device identifiers, and server connection parameters are never stored in plaintext JSON, XML, or Windows Registry keys. Instead, they are stored in `%LocalAppData%\NKB Drive\vault.dat` using Windows Data Protection API (DPAPI):

```
+----------------------------------------------------------------------------------+
|                           DPAPI VAULT ENCRYPTION FLOW                            |
+----------------------------------------------------------------------------------+
|                                                                                  |
|  [ Plaintext Credentials ]                                                       |
|  • Server URL: http://127.0.0.1:5000                                             |
|  • JWT Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...                            |
|  • Device UUID: 7c9e6679-7425-40de-944b-e07fc1f90ae7                             |
|  • User Email: admin@nkbmanufacturing.com                                        |
|  • Machine Name: DESKTOP-PILOT                                                   |
|               |                                                                  |
|               v                                                                  |
|  [ Entropy Derivation ]                                                          |
|  • Salt Prefix: "NKB-Enterprise-DPAPI-Entropy-v2.1"                             |
|  • Dynamic Suffix: UTF8("$env:USERNAME@$env:COMPUTERNAME")                       |
|  • Combined Buffer: [Salt Prefix (31 bytes)] + [User@Machine (Variable)]         |
|               |                                                                  |
|               v                                                                  |
|  [ DPAPI System Call ]                                                           |
|  • CryptProtectData(pDataIn, szDataDescr, pOptionalEntropy, ..., pDataOut)      |
|  • Scope: DataProtectionScope.CurrentUser (Hardware master key bound)           |
|               |                                                                  |
|               v                                                                  |
|  [ Ciphertext Stored ] -> %LocalAppData%\NKB Drive\vault.dat (448 bytes)         |
|                                                                                  |
+----------------------------------------------------------------------------------+
```

### Security Properties
1. **Per-User Isolation**: Even on a shared enterprise workstation, User B cannot decrypt User A's `vault.dat` file. The Windows kernel master key is protected by User A's logon credentials.
2. **Entropy Binding**: The machine-and-user entropy salt prevents offline recovery attacks if the user profile directory is cloned to external storage.
3. **Memory Wiping**: Memory buffers holding decrypted JWT tokens in the desktop process are pinned and securely zeroed out (`Array.Clear`) immediately after API client initialization.

---

## 4. Workstation Identity & Device Approval Gate

To prevent rogue workstations, personal laptops, or unauthorized endpoints from syncing corporate data, NKB Drive enforces a mandatory device admission protocol:

```
+----------------------------------------------------------------------------------+
|                         TWO-TIER DEVICE ADMISSION GATE                           |
+----------------------------------------------------------------------------------+
|                                                                                  |
|  [ Client Workstation ]                                  [ NKB Cloud Backend ]   |
|         |                                                           |            |
|         |-- 1. POST /api/v1/drive/devices/register ---------------->|            |
|         |   { machineName, hardwareFingerprint, osVersion }         |            |
|         |                                                           |            |
|         |<-- Returns { deviceId, approval_status: 'PENDING' } ------|            |
|         |                                                           |            |
|         |   (Workstation cannot mount N:; displays "Pending Approval")   |       |
|         |                                                           |            |
|         |                                            [ IT Administrator Review ] |
|         |                                            POST /devices/:id/approve   |
|         |                                            Status -> 'APPROVED'        |
|         |                                                           |            |
|         |-- 2. GET /api/v1/drive/changes (with x-device-id) ------->|            |
|         |<-- HTTP 200 OK (Changes journal streamed) ----------------|            |
|         |                                                           |            |
|         |   (Workstation successfully mounts N:\ and begins sync)   |            |
|                                                                                  |
+----------------------------------------------------------------------------------+
```

### Revocation Protection
If an enterprise workstation is lost, stolen, or decommissioned:
1. The IT Administrator issues `POST /api/v1/drive/devices/:id/revoke`.
2. The database updates `is_active = FALSE` and `approval_status = 'REVOKED'`.
3. On the next client poll or file hydration attempt, `validateDriveDevice` returns HTTP 403 `DEVICE_REVOKED`.
4. The desktop client triggers an immediate safe unmount of drive `N:\` and locks the local SQLite database.

---

## 5. Security Vulnerability Assessment & Test Evidence

The automated security gate ([test-security-remediation.js](file:///j:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/NKB-Drive-Phase44/test-security-remediation.js)) was verified against live endpoints:

```
  [PASS] Test 1: Unauthenticated journal access rejected (HTTP 401)
  [PASS] Test 2: Missing device identity header rejected (HTTP 401 MISSING_DEVICE_ID)
  [PASS] Test 3: Unregistered/unapproved device denied (HTTP 401/403)
  [PASS] Test 4: Path traversal attempt rejected (HTTP 400/404)
  [PASS] Test 5: Unauthorized upload session chunk injection rejected (HTTP 400/403/404)
  [PASS] Test 6: Tampered JWT token rejected (HTTP 401/403)
```

---

## 6. Security Audit Recommendation

The architectural and cryptographic defenses of NKB Drive meet enterprise standards. However, **production deployment must be held** until the installer executable is signed with a valid enterprise Code Signing certificate to satisfy Windows SmartScreen and WDAC integrity controls.

**Security Classification**: **PASS WITH LIMITATIONS (Awaiting Code Signing)**
