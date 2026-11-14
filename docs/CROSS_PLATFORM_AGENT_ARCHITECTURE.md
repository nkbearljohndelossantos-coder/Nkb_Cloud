# NKB CLOUD v2.1.0 — CROSS-PLATFORM STORAGE AGENT ARCHITECTURE SPECIFICATION

**Document Version:** 2.1.0-ENTERPRISE  
**Date:** November 11, 2026  
**Status:** ARCHITECTURE RATIFIED & IMPLEMENTED  
**Platforms Covered:** Windows 10/11, macOS, Android, iOS / iPadOS, Linux, Web Browsers  
**Central Ingress:** AlmaLinux 10 Hostinger VPS with Nginx 1.26.3 Stable  
**Backend:** Node.js 26.13.0 LTS / Express / PostgreSQL 16.15 (Containerized)  
**Security Protocols:** `NKB-AUTH-V1`, `NKB-CMD-V1`, Ed25519 Mutual Auth, Curve25519 ECDH, SHA-256 Nonce Tracking  

---

## 1. EXECUTIVE SUMMARY & PLATFORM ECOSYSTEM

The NKB Cloud Storage Agent ecosystem provides secure, authenticated, and hardware-bound storage access and synchronization across six corporate computing platforms. All platforms interface with the unified NKB Cloud backend, honoring role-based access control, departmental boundary isolation, cryptographic audit logging, and administrator-controlled device approval workflows.

```
                                  +---------------------------------------+
                                  |         NKB CLOUD PRODUCTION VPS      |
                                  |        (Hostinger AlmaLinux 10)       |
                                  |                                       |
                                  |   +-------------------------------+   |
                                  |   |   Nginx 1.26.3 Stable Proxy   |   |
                                  |   |  (TLS 1.3 / HSTS / Rate Limit)|   |
                                  |   +---------------+---------------+   |
                                  |                   |                   |
                                  |   +---------------v---------------+   |
                                  |   |   Node.js 26 Express Backend  |   |
                                  |   |  (DeviceHub / WSS / REST APIs)|   |
                                  |   +---------------+---------------+   |
                                  |                   |                   |
                                  |   +---------------v---------------+   |
                                  |   |  PostgreSQL 16 DB (182 logs)  |   |
                                  |   +-------------------------------+   |
                                  +-------------------+-------------------+
                                                      |
    +---------------------------+---------------------+---------------------------+---------------------------+
    |                           |                     |                           |                           |
WSS |             WSS           |         WSS         |               HTTPS REST  |               HTTPS REST  |
+---v---------------+ +---------v---------+ +---------v---------+ +-----------------v---+ +-----------------v---+
| Windows 10/11     | | macOS (Swift)     | | Linux (systemd)   | | Android (Kotlin)  | | iOS / iPadOS (Swift)|
| Storage Agent     | | Storage Agent     | | Storage Agent     | | Mobile Client     | | Mobile Client       |
| - Service (NSSM)  | | - launchd Daemon  | | - systemd Daemon  | | - Jetpack Compose | | - SwiftUI M3        |
| - DPAPI Secrets   | | - Apple Keychain  | | - POSIX 0600 Keys | | - Keystore HW TEE | | - Secure Enclave    |
| - WMI/VDS Storage | | - DiskArbitration | | - lsblk / statfs  | | - WorkManager     | | - BGTasks / FilesExt|
| - Loopback 51248  | | - Loopback 51248  | | - Loopback 51248  | | - BiometricPrompt | | - LocalAuth (FaceID)|
+-------------------+ +-------------------+ +-------------------+ +-------------------+ +---------------------+
```

---

## 2. CROSS-PLATFORM CAPABILITIES & CONSTRAINTS MATRIX

The NKB Cloud architecture strictly respects operating system runtime constraints and background execution limitations. The table below outlines the core capabilities, security mechanisms, and restrictions across all 6 supported platforms:

| Platform | Runtime Type | Background Execution Model | Cryptographic Key Storage | Storage Discovery Mechanism | Local HTTP API |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Windows 10/11** | Windows Service (Background) | Unrestricted persistent service via Windows Service Control Manager (`sc.exe` / NSSM) | Windows Data Protection API (DPAPI) + Local Machine Keystore | WMI (`Win32_DiskDrive`, `Win32_Volume`) + VDS | Yes (`127.0.0.1:51248`) |
| **macOS (Intel/Apple Silicon)** | Native Swift Daemon | Persistent background service managed by `launchd` LaunchDaemon (`/Library/LaunchDaemons`) | Apple Keychain Services (`kSecClassGenericPassword` with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`) | DiskArbitration Framework (`DADiskCreateFromBSDName`) + FSEvents | Yes (`127.0.0.1:51248`) |
| **Linux (AlmaLinux/Debian/RHEL)** | Node.js / C++ Daemon | Persistent background service managed by `systemd` (`nkb-storage-agent.service`) | File system permissions with `chmod 0600` in `/etc/nkb-cloud/` owned by dedicated `nkb-agent` user | `lsblk -J -b` JSON inspection + `statfs()` | Yes (`127.0.0.1:51248`) |
| **Android 12+** | Native Android App (Kotlin) | Opportunistic / Constrained via Android `WorkManager` (Doze & App Standby compliant) | Android Keystore Provider (Hardware TEE / StrongBox) | Storage Access Framework (SAF) / MediaStore API | No (Prohibited by OS sandboxing) |
| **iOS / iPadOS 16+** | Native iOS App (Swift) | Strictly Constrained via `BackgroundTasks` (`BGAppRefreshTask`, `BGProcessingTask`, `URLSessionConfiguration.background`). **No unrestricted persistent background services.** | Apple Secure Enclave & Keychain (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`) | Sandboxed App Container + `NSFileProviderReplicatedExtension` (Apple Files app integration) | No (Prohibited by iOS sandbox & ATS) |
| **Web Browsers (Modern)** | Responsive SPA (React) | Browser tab lifecycle only (Page Visibility API, Web Workers) | `sessionStorage` (ephemeral) + HTTP-Only secure cookies | HTML5 File System Access API / `<input type="file">` | Communicates with localhost agent via CORS-gated loopback probe |

---

## 3. UNIFIED DEVICE ENROLLMENT & AUTHENTICATION FLOW

All client platforms authenticate via the zero-trust `NKB-AUTH-V1` protocol utilizing asymmetric Ed25519 cryptography.

### 3.1 Device Enrollment Sequence Diagram

```
Device/Agent                      Admin Dashboard                     NKB Cloud Server (PostgreSQL)
     |                                   |                                          |
     |                                   |--- 1. Generate Enrollment Token -------->|
     |                                   |<-- 2. Return Compact Encrypted Token ----|
     |                                   |                                          |
     |--- 3. Generate Ed25519 Keypair ---|                                          |
     |--- 4. POST /api/devices/enroll (Token, Machine, PubKey) -------------------->|
     |                                                                              |--- 5. Validate Token & User
     |                                                                              |--- 6. Insert storage_agents (status: PENDING)
     |<-- 7. HTTP 201 (agentId, status: PENDING) -----------------------------------|
     |                                                                              |
     |                                   |--- 8. Admin Reviews Pending Device ----->|
     |                                   |--- 9. POST /api/devices/:id/approve ---->|
     |                                   |                                          |--- 10. Update status: APPROVED/OFFLINE
     |                                   |<-- 11. Approval Confirmed (200 OK) ------|--- 12. Append to Immutable Audit Log
     |                                                                              |
     |--- 13. WSS Connection with Ed25519 Handshake ------------------------------->|
     |<-- 14. Server Nonce & Challenge ---------------------------------------------|
     |--- 15. Sign Canonical Handshake with Private Key ---------------------------->|
     |                                                                              |--- 16. Verify Signature against stored PubKey
     |                                                                              |--- 17. Check Nonce Registry (Anti-Replay)
     |<-- 18. Authenticated Session Granted (Status: ONLINE) ------------------------|
```

### 3.2 Canonical Handshake Construction
To prevent malleability across heterogeneous runtimes (Node.js, Swift, Kotlin), the signed handshake payload strictly adheres to the canonical UTF-8 format:
```
NKB-AUTH-V1\n
protocolVersion:2.1.0\n
challengeId:<UUID>\n
agentId:<UUID>\n
serverNonce:<HEX_32_BYTES>\n
clientNonce:<HEX_32_BYTES>\n
serverTimestamp:<TIMESTAMP_MS>
```

---

## 4. PLATFORM-SPECIFIC IMPLEMENTATIONS

### 4.1 Windows 10/11 Architecture
- **Service Name:** `NKBStorageAgent`
- **Installation Location:** `C:\Program Files\NKB Cloud\Storage Agent\`
- **Secret Storage:** DPAPI via PowerShell/C# wrapper, encrypting the Ed25519 private key with machine-scope entropy (`DataProtectionScope.LocalMachine`).
- **Storage Discovery:** WMI `ROOT\CIMV2` queries filtering out removable or unformatted media, calculating SHA-256 composite identifiers across `(SerialNumber, VolumeGuid, StartingOffset, TotalBytes)`.
- **Local IPC:** Loopback HTTP server on `127.0.0.1:51248` responding to web UI status queries with CORS restricted to `http://localhost:5173` and production domain.

### 4.2 macOS Architecture (Native Swift)
- **Binary Structure:** Native Swift 5.9 executable compiled with Universal Binary (`arm64` and `x86_64`) support.
- **Service Management:** `com.nkb.storageagent.plist` installed in `/Library/LaunchDaemons/` running under system context.
- **Secret Storage:** macOS Security Framework / Keychain Services. The Ed25519 32-byte seed is written to the System Keychain with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.
- **Storage Discovery:** Native `VolumeMonitor` utilizing POSIX `statfs` and DiskArbitration framework notifications (`kDADiskDescriptionMediaBSDNameKey`).
- **File Synchronization:** Native `FolderSyncEngine` subscribing to macOS `FSEventStream` for kernel-level change notifications.

### 4.3 Linux Architecture (AlmaLinux / RHEL / Debian)
- **Runtime:** Native Node.js 26.13.0 LTS or packaged C++ system service.
- **Service Management:** `systemd` service unit (`/etc/systemd/system/nkb-storage-agent.service`) with `Restart=always`, `RestartSec=10`, and `NoNewPrivileges=true`.
- **Secret Storage:** Dedicated configuration file `/etc/nkb-cloud/agent-keys.json` protected with strict POSIX permissions `chmod 0600` and `chown nkb-agent:nkb-agent`.
- **Storage Discovery:** `lsblk -J -b -o NAME,KNAME,FSTYPE,SIZE,MOUNTPOINT,LABEL,UUID,MODEL,SERIAL,TYPE` combined with POSIX `fs.statfsSync()` for exact block and cluster allocation reporting.
- **Deployment:** Zero-touch shell installer (`install.sh`) supporting `curl -sSL ... | bash` with automated dependency resolution, system user provisioning, and systemd enablement.

### 4.4 Android Architecture (Native Kotlin)
- **UI Framework:** Jetpack Compose with Material Design 3 guidelines.
- **Cryptographic Security:** Android Keystore Provider utilizing hardware-backed TEE (Trusted Execution Environment) or StrongBox Keymaster.
- **Biometrics:** `BiometricPrompt` requiring Class 3 (Strong) biometric or device PIN/pattern before releasing authentication keys or decrypting cached files.
- **Background Work:** Android `WorkManager` with `Constraints.Builder()` requiring `NetworkType.CONNECTED` and battery not low. Long-running transfers run as Foreground Services with persistent notification when app is in foreground.

### 4.5 iOS / iPadOS Architecture (Native Swift)
- **UI Framework:** SwiftUI with `NavigationStack` and native iOS HIG components.
- **Cryptographic Security:** Apple Secure Enclave and iOS Keychain Services with `kSecAccessControlBiometryAny` and `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`.
- **Background Execution:** iOS strictly prohibits unrestricted persistent background daemons. Background processing is handled exclusively through:
  1. `BGAppRefreshTask` (periodic metadata polling).
  2. `BGProcessingTask` (deferred queue processing during charging).
  3. `URLSessionConfiguration.background` (OS-managed transfers that continue even if the app process is suspended or terminated).
- **Files Integration:** `NSFileProviderReplicatedExtension` exposing corporate drives directly within the native iOS "Files" application.

### 4.6 Web Browser Architecture (React)
- **Responsive Layout:** Tailwind CSS with dynamic viewport breakpoints (`sm:`, `md:`, `lg:`) and touch gestures for mobile screens.
- **Platform Detection:** Client-side user-agent parsing dynamically routing users to native mobile deep links (`nkbcloud://enroll`), desktop download packages, or browser-based direct upload.
- **Local Agent Discovery:** Non-blocking `fetch('http://127.0.0.1:51248/status')` probe with exponential backoff to detect local workstation agents and enable high-speed direct block transfers.

---

## 5. SECURITY & THREAT MITIGATION

1. **Replay Attack Elimination:** Every handshake nonce is validated against `agent_nonce_registry` with a unique index. Stale nonces older than 300 seconds are rejected; reused nonces trigger PostgreSQL duplicate key error `23505`.
2. **Instant Kill Switch:** Superadmins can revoke any workstation, laptop, or mobile client instantly via `/api/devices/:id/revoke`. The WebSocket connection is severed immediately, the database row is locked in `REVOKED` state, and future re-enrollment with the same hardware signature is permanently blocked.
3. **Session Version Enforcement:** Any user credential change or administrative security action increments `users.session_version`. All JWT tokens presented by mobile apps, desktop agents, or browser sessions are verified against this counter, terminating all active sessions within 0 milliseconds.
4. **Audit Trail Immutability:** All device enrollment, approval, heartbeats, and revocations generate cryptographic entries in `audit_logs` protected by SHA-256 forward-linked hash chains.
