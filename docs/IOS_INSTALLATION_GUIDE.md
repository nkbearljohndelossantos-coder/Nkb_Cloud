# NKB CLOUD v2.1.0 — IPHONE & IOS CLIENT INSTALLATION & USER GUIDE

**Target Audience:** Apple Device Technicians, MDM Administrators, and iPhone / iPad Users  
**Supported OS:** iOS 16.0+ / iPadOS 16.0+ (iPhone 11 through iPhone 16 Pro, iPad Pro / Air / Mini)  
**Bundle Identifier:** `com.nkb.cloud.ios`  
**Distribution Methods:** Apple Business Manager (Custom B2B App), Microsoft Intune MAM/MDM, or Ad-Hoc Enterprise IPA  
**Source Location:** [`ios-client/`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/ios-client/)  

---

## 1. PRE-REQUISITES

- iPhone or iPad running iOS 16.0 or later.
- Company corporate user account on NKB Cloud.
- Outbound connectivity over HTTPS (Port 443) to `https://cloud.nkb.local`.

---

## 2. INSTALLATION WORKFLOW

### Method A: Apple Business Manager & Microsoft Intune (MDM)
1. Add **NKB Cloud iOS** to your Apple Business Manager account under **Custom Apps**.
2. Sync ABM tokens with Microsoft Intune / Jamf Pro.
3. Assign the application to corporate iOS device profiles with App Configuration policies:
   - `server_url`: `https://cloud.nkb.local`
4. The application installs automatically on employee iPhones during workstation enrollment or background sync.

### Method B: Enterprise IPA Deployment
1. Download the signed `NKBCloud.ipa` and provisioning profile from the IT distribution server.
2. Install via Apple Configurator or enterprise distribution manifest (`itms-services://?action=download-manifest&url=...`).
3. Trust the Enterprise Developer Certificate in:  
   **Settings > General > VPN & Device Management > Enterprise App > Trust**.

---

## 3. FIRST-TIME ENROLLMENT & AUTHENTICATION

### Step 1: Corporate Sign In
1. Launch **NKB Cloud** on your iPhone.
2. Enter your corporate **Username** and **Password**.
3. Tap **Sign In**.

### Step 2: Face ID / Touch ID Enablement
1. When prompted by Apple `LocalAuthentication`:  
   *"Unlock NKB Cloud to access enterprise storage"*, scan your face or fingerprint.
2. The authentication token is securely committed to the **Apple Keychain** with accessibility attribute `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.

### Step 3: Apple Secure Enclave Device Registration
1. Tap **Enroll Device** or open the enrollment link from company email (`nkbcloud://enroll?token=...`).
2. The app generates a device-isolated cryptographic keypair within the **Secure Enclave**.
3. Device status displays:  
   **`PENDING APPROVAL`**: Your IT Administrator must approve the device before storage streaming begins.
4. Once approved, status transitions to **`APPROVED`** (Green Shield).

---

## 4. APPLE FILES APP INTEGRATION

NKB Cloud provides native iOS Files integration using Apple's `NSFileProviderReplicatedExtension`:

1. Open the native Apple **Files** app on your iPhone or iPad.
2. In the **Browse** tab, tap the **More (...)** menu in the top-right corner.
3. Tap **Edit**.
4. Toggle the switch next to **NKB Cloud** to **ON**.
5. Tap **Done**.
6. You can now browse, open, drag-and-drop, and attach NKB Cloud files directly in Apple Mail, Keynote, Pages, or third-party applications!

---

## 5. BACKGROUND SYNCHRONIZATION

- Large file downloads and uploads utilize `URLSessionConfiguration.background`.
- If you switch apps or lock your iPhone, Apple's `nsurlsessiond` daemon manages the transfer out-of-process.
- Upon completion, the app receives a background wake-up notification and updates your local file inventory.

---

## 6. REMOTE ADMINISTRATIVE SECURITY

- **Remote Revocation:** If an iPhone is lost, the administrator revokes the endpoint in the Admin Console. The app terminates active sessions immediately.
- **Keychain Invalidation:** User password changes increment `session_version` in the database, automatically locking out stale cached tokens.
- **Biometric Enforcement:** Face ID is required on each cold launch of the application.
