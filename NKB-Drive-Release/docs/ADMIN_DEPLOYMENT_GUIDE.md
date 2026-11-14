# NKB Drive — Administrator Deployment Guide
## Self-Hosted Enterprise Virtual Filesystem Platform v2.1.0

This guide outlines the complete operational procedures for deploying, managing, and maintaining NKB Drive across Windows and macOS employee workstations.

---

## 1. System Architecture & Prerequisites

### Architecture Invariants
- **Backend**: Self-hosted Node.js + Express (`http://127.0.0.1:5000` or production intranet domain).
- **Database**: PostgreSQL 16 on port `5433` (isolated staging) / `5432` (production).
- **Virtual Drive Engine**: Genuine WinFsp (Windows) / native `NSFileProvider` (macOS).
- **Credential Storage**: Windows DPAPI (`CryptProtectData`) / macOS Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`).
- **Storage Subsystem**: External USB hard drives, server HDD/SSD mount paths. No NAS required.
- **Strict Prohibition**: Strictly NO Supabase, NO Firebase, NO AWS S3, NO Azure Blob.

### Workstation Prerequisites
- **Windows**: Windows 10/11 x64 (Build 19041+), .NET Framework 4.8+, WinFsp 2.0+.
- **macOS**: macOS 13.0+ (Ventura, Sonoma, Sequoia) on Apple Silicon (M1/M2/M3) or Intel Core x86_64.

---

## 2. Windows Deployment Procedures

### Automated Silent Installation (Enterprise GPO / Intune)
```cmd
NKBDriveSetup.exe /S
```
The silent installer executes non-interactively without prompting:
1. Verifies 64-bit Windows OS compatibility.
2. Checks for genuine WinFsp runtime; if absent, installs bundled `winfsp-2.0.23075.msi`.
3. Installs `NKBDrive.exe` into `%LocalAppData%\Programs\NKB Drive`.
4. Creates Desktop and Start Menu shortcuts.
5. Configures Explorer Drive `N:` custom branding and golden 3D metallic icon in Registry (`HKCU\Software\Classes\Applications\Explorer.exe\Drives\N`).
6. Configures per-user auto-start in `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.

### Workstation Device Approval Workflow
1. When employee first launches `NKBDrive.exe` and logs in, device registration request is submitted to backend.
2. Device status is marked `PENDING_APPROVAL`.
3. Administrator navigates to **Admin Dashboard -> Device Approvals**.
4. Administrator inspects device hostname, MAC address, and OS version, then clicks **Approve Workstation**.
5. Client receives approval signal on next poll and mounts Virtual Drive `N:\`.

---

## 3. macOS Deployment Procedures

1. Copy `NKBDrive-2.1.0-macOS.dmg` to the workstation.
2. Open DMG and drag `NKB Drive.app` into `/Applications`.
3. On first launch, approve Finder File Provider extension in **System Settings -> Privacy & Security**.
4. Virtual drive appears in Finder sidebar under **Locations -> NKB Drive**.

---

## 4. Workstation Revocation & Security Lifecycle

- **Device Revocation**: In Admin Dashboard, click **Revoke Device**. Token is immediately invalidated on the server; client unmounts drive letter `N:\` within 10 seconds.
- **Cache Invalidation**: On logout or revocation, local SQLite cache database and DPAPI tokens are purged.
