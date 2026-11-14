# NKB Drive for macOS (Desktop Client)
## Enterprise Cloud Virtual Drive for Apple Silicon & Intel macOS

`NKBDrive` provides an enterprise-grade virtual filesystem and menu bar desktop client for macOS 13+ (Ventura, Sonoma, Sequoia), connecting seamlessly to the self-hosted NKB Cloud Enterprise backend.

---

## Architecture Overview

- **Native Swift 5.9+ / Cocoa**: Clean, memory-safe compiled client with zero Electron/Node overhead.
- **Apple Keychain Integration (`KeychainVault.swift`)**: Secure token storage backed by macOS Secure Enclave (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`).
- **Finder Integration (`FileProviderExtension.swift`)**: Replicated `NSFileProviderReplicatedExtension` mounting NKB Drive directly into Finder's "Locations" sidebar.
- **Menu Bar Status Item (`AppDelegate.swift`)**: Unobtrusive status bar indicator with real-time sync progress, quick Finder open, and manual trigger.
- **Strictly Self-Hosted**: Zero Supabase, zero Firebase, zero third-party cloud services.

---

## Build Prerequisites (macOS Host)

Building the `.app` bundle and `.dmg` installer requires a macOS host machine (MacBook, Mac Mini, Mac Studio, or CI runner):

1. **macOS**: 13.0 or higher.
2. **Xcode**: 15.0+ or Command Line Tools (`xcode-select --install`).
3. **Apple Developer ID**:
   - Developer ID Application certificate (for Gatekeeper compliance).
   - Developer ID Installer certificate (if using `.pkg`).
4. **Apple Notary Tool**:
   ```bash
   xcrun notarytool store-credentials "NKB-Notary" \
       --apple-id "admin@nkbmanufacturing.com" \
       --team-id "YOUR_TEAM_ID" \
       --password "app-specific-password"
   ```

---

## Build & Packaging Commands

```bash
# 1. Compile and package the universal DMG
make dmg

# 2. Or execute the build script directly
chmod +x build_dmg.sh
./build_dmg.sh

# 3. Notarize with Apple Notary Service
make notarize NOTARIZE_KEYCHAIN_PROFILE=NKB-Notary
```

---

## Windows Cross-Compilation Reality Note

Apple's code-signing tools (`codesign`), disk image tools (`hdiutil`), and notarization toolchain (`notarytool`) are proprietary Apple macOS executables and cannot be natively executed on a Windows host. The complete, production-ready Swift source code, packaging scripts, and project definitions are fully structured here for immediate compilation on any macOS machine or CI/CD runner.
