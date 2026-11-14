# NKB CLOUD v2.1.0 — IOS / IPADOS AGENT SECURITY REPORT

**Document Version:** 2.1.0  
**Target Platform:** iOS 16+, iPadOS 16+ (iPhone, iPad)  
**Architecture:** Native Swift, SwiftUI, Apple Secure Enclave, BackgroundTasks Framework, FileProvider Extension  
**Audit Date:** November 11, 2026  
**Status:** IMPLEMENTED & STAGING VERIFIED  

---

## 1. EXECUTIVE SECURITY SUMMARY

The **NKB Cloud iOS Client** provides secure enterprise file synchronization and browsing for iPhone and iPad devices. iOS imposes the most restrictive sandboxing and energy-conservation boundaries among modern consumer operating systems. Specifically, **iOS does not permit unrestricted persistent background daemons, persistent socket servers, or background loopback services.** 

This report outlines how NKB Cloud achieves compliance with Apple security guidelines while maintaining zero-trust cryptographic guarantees and reliable background file transfers.

---

## 2. HARDWARE CRYPTOGRAPHY & SECURE ENCLAVE

### 2.1 Secure Enclave & iOS Keychain Services
Cryptographic material is isolated from the application sandbox using the iOS Keychain and Apple's hardware-isolated **Secure Enclave Processor (SEP)**:
- **Keychain Class:** `kSecClassGenericPassword` and `kSecClassKey`.
- **Accessibility Attribute:** `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`.
  - Keys cannot be migrated or restored from iCloud backups to different physical hardware.
  - Keys are inaccessible when the device is locked.
- **Access Control Flags:** Configured with `SecAccessControlCreateWithFlags` including `.userPresence` and `.biometryAny`.

```swift
// Apple Secure Enclave Key Protection
let accessControl = SecAccessControlCreateWithFlags(
    kCFAllocatorDefault,
    kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    [.privateKeyUsage, .biometryAny],
    &error
)
```

### 2.2 Biometric Authentication (Face ID & Touch ID)
- Implemented via Apple's `LocalAuthentication` framework (`LAContext`).
- Face ID / Touch ID evaluation is required before unlocking cached cryptographic tokens or rendering sensitive corporate files.
- Biometric state changes (e.g. adding a new face) invalidate the access control context.

---

## 3. BACKGROUND EXECUTION LIMITS & ARCHITECTURAL COMPLIANCE

> [!IMPORTANT]
> **Operating System Limitation:** Unlike Windows or Linux, **iOS does not allow applications to run continuous background daemons.** Any attempt to maintain persistent background sockets without active user interaction or VoIP entitlement will be terminated by the iOS Watchdog within 30 seconds.

To comply with Apple App Store and enterprise MDM requirements, NKB Cloud uses three sanctioned iOS execution mechanisms:

### 3.1 BackgroundTasks Framework (`BGTaskScheduler`)
1. **`BGAppRefreshTask` (`com.nkb.cloud.refresh`):**
   - Scheduled periodically by iOS based on user usage patterns and device power status.
   - Used for quick metadata synchronizations (checking folder updates, updating file index).
   - Execution window: At most 30 seconds.
2. **`BGProcessingTask` (`com.nkb.cloud.sync`):**
   - Scheduled when the device is connected to power and connected to Wi-Fi.
   - Used for deferred large synchronization jobs and cache pruning.
   - Can run for several minutes under OS discretion.

### 3.2 Out-of-Process Transfers (`URLSessionConfiguration.background`)
File uploads and downloads are handed off to the iOS system daemon `nsurlsessiond`:
- Even if the NKB Cloud app is suspended, evicted from RAM, or terminated by the user, iOS completes the file transfer in the background.
- Upon completion, iOS wakes the app in the background via `application(_:handleEventsForBackgroundURLSession:completionHandler:)` to record file metadata and update local caches.

### 3.3 Native iOS Files App (`NSFileProviderReplicatedExtension`)
To provide desktop-like file browsing without running an active daemon, NKB Cloud implements a File Provider Extension:
- Appears natively inside the Apple **Files** app alongside iCloud Drive.
- File items are populated on-demand when the user opens a folder.
- File thumbnails and contents are streamed directly from the NKB Cloud VPS on demand, consuming zero persistent background resources.

---

## 4. ENTERPRISE MDM & APPLE BUSINESS MANAGER (ABM)

### 4.1 Deployment Strategy
- **Apple Business Manager (ABM) / Volume Purchase Program (VPP):** The app is distributed privately to corporate devices managed by Mobile Device Management (MDM) solutions (Microsoft Intune, Jamf Pro, VMware Workspace ONE).
- **Managed App Configuration (`UserDefaults`):** MDM servers push managed configurations:
  ```xml
  <dict>
      <key>ServerEndpoint</key>
      <string>https://cloud.nkb.com</string>
      <key>AllowCellularDownload</key>
      <false/>
      <key>RequireFaceID</key>
      <true/>
      <key>MaxOfflineCacheDays</key>
      <integer>7</integer>
  </dict>
  ```

### 4.2 Deep Link Enrollment
Mobile enrollment uses custom URL schemes registered in `Info.plist`:
```
nkbcloud://enroll?token=<ENROLLMENT_TOKEN>&server=https://nkbcloud.com
```
When an employee scans an administrative QR code, iOS launches the NKB Cloud app, validates the cryptographic token, prompts for Face ID, generates the Ed25519 keypair in the Secure Enclave, and submits the device registration to the server.

---

## 5. AUDIT & VERIFICATION MATRIX

| Component | Status | Evidence / Notes |
| :--- | :--- | :--- |
| **iOS Client Native Source Code** | **IMPLEMENTED** | [`ios-client/Sources/NKBClient/`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/ios-client/Sources/NKBClient/) including Keychain, Network, BGTasks, and FileProvider |
| **iOS Device Registration & Database Approval** | **TESTED** | Verified in `test-cross-platform-ecosystem.mjs` against staging PostgreSQL on port 5433 |
| **Anti-Replay Nonce Verification** | **TESTED** | Verified; iOS client nonces rejected if replayed |
| **Session Invalidation (`session_version`)** | **TESTED** | Incrementing user session version invalidates iOS tokens immediately |
| **Secure Enclave Hardware Execution** | **NOT YET VERIFIED** | Requires physical iPhone with A-series Bionic processor running iOS 17 |
| **Apple Files App Extension Integration** | **NOT YET VERIFIED** | Requires compiled `.appex` bundle signed with Apple Developer Enterprise provisioning profile |
| **Background Transfer Wakeup (`nsurlsessiond`)** | **NOT YET VERIFIED** | Requires physical device testing on Wi-Fi/cellular transitions |
