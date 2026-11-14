# NKB CLOUD v2.1.0 — ANDROID CLIENT INSTALLATION & USER GUIDE

**Target Audience:** Enterprise Mobility Specialists, IT Administrators, and Android Smartphone Users  
**Supported OS:** Android 8.0 (API Level 26) through Android 14+ (API Level 34)  
**Package:** `com.nkb.cloud`  
**Distribution Methods:** Enterprise Mobile Device Management (MDM), Private Sideload (APK), or Google Play Internal App Sharing  
**Source Location:** [`android-client/`](file:///J:/IT%20STAFF/PROGRAM%20FILES/NKB%20Cloud/android-client/)  

---

## 1. PRE-REQUISITES

- Corporate or BYOD Android smartphone/tablet running Android 8.0 or newer.
- Active NKB Cloud employee account credentials.
- HTTPS connectivity to the company NKB Cloud domain (`https://cloud.nkb.local`).

---

## 2. INSTALLATION METHODS

### Method A: Enterprise MDM Sideload (Microsoft Intune / VMware Workspace ONE)
1. In the MDM Administration Console, add a new **Line-of-Business Android App**.
2. Upload the compiled `nkb-cloud-release.apk` artifact.
3. Configure Managed App Configuration parameters:
   - `server_url`: `https://cloud.nkb.local`
   - `auto_enroll`: `true`
4. Assign the app as **Required** to the company Android device group.

### Method B: Manual APK Sideload & Installation
1. Download `nkb-cloud-v2.1.0.apk` from the company IT portal.
2. In Android Settings, ensure **"Install Unknown Apps"** is permitted for your browser/file manager.
3. Tap the downloaded APK to install.
4. Launch **NKB Cloud** from the home screen.

---

## 3. DEVICE ENROLLMENT & SETUP WORKFLOW

### Step 1: Sign In
1. Launch **NKB Cloud**.
2. Enter your corporate **Username** and **Password**.
3. Tap **Sign In**.

### Step 2: Biometric Authentication Setup
1. If your device supports Fingerprint or Face recognition, the app prompts:  
   *"Unlock NKB Cloud: Verify identity with fingerprint or face recognition"*.
2. Tap **Unlock with Biometrics** to authenticate. Your session token is immediately secured within the hardware-backed **Android Keystore**.

### Step 3: Device Enrollment & Administrator Approval
1. Upon first login, the app checks endpoint registration status.
2. If unenrolled, tap **Enroll This Device** or scan the enrollment QR code from your desktop NKB Cloud console.
3. The device status card displays:
   - **`PENDING` (Orange):** *"Device Enrolled — Awaiting Administrator Approval in IT Console."*
4. Once your IT administrator approves the device, the banner updates to:
   - **`CONNECTED` (Green):** *"Device Approved & Connected — Hardware Keystore Protected."*

---

## 4. USING THE APPLICATION

### 4.1 File Browsing & Navigation
- **Folders:** Tap any folder to browse sub-directories with breadcrumb navigation.
- **Search:** Use the top search bar to filter documents across your personal and department drives.
- **Pull-to-Refresh:** Pull down on the file list to sync recent updates.

### 4.2 File Upload & Background Sync
1. Tap the floating **+ (Upload)** action button.
2. Choose **Photos & Videos** or **Browse Device Files**.
3. Select the file(s) to upload.
4. **WorkManager Background Sync:** The upload task is queued in Android's `WorkManager`. If you leave the app or lock your phone, the upload continues automatically in the background under optimal network conditions (Wi-Fi / unmetered cellular).

### 4.3 File Preview & Secure Sharing
- Tap any file to open the native preview viewer (images, PDF documents, media).
- Tap the **Share** icon next to any document to generate a department-isolated share link with customizable read/write permissions.

---

## 5. SECURITY & PRIVACY CONTROLS

- **Hardware Keystore Isolation:** All cryptographic key generation takes place in the device's Secure Element (TEE). Private keys are never exposed in user memory or written to storage.
- **Immediate Remote Revocation:** If an Android phone is reported lost or stolen, IT administrators can revoke the device in the Admin Console. The app is immediately locked and offline storage disabled.
- **JWT Session Invalidation:** Changing your corporate password invalidates existing mobile tokens instantaneously.

---

## 6. TROUBLESHOOTING

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **"Connection Error" during sign-in** | Private TLS certificate untrusted or DNS unresolvable. | Ensure phone is connected to company Wi-Fi/VPN or install company root CA. |
| **Device stuck on "PENDING"** | IT Administrator has not yet approved the phone. | Contact IT support with your Device ID to approve endpoint in Admin Console. |
| **Biometric prompt not appearing** | No fingerprint or face data registered in Android Settings. | Configure biometrics in Android Settings > Security > Biometrics. |
