# NKB Cloud — Native iOS Client (Swift)

Native enterprise mobile application for iPhone and iPad running iOS 16.0+.

## Features
- **SwiftUI Architecture**: Responsive, fluid user interface supporting iPhone Dynamic Island, iPad Stage Manager, and Split View.
- **Apple Files App Integration**: Native `NSFileProviderReplicatedExtension` enables direct access to NKB Cloud from within the iOS Files app, Mail, and third-party apps.
- **Apple Keychain Credential Protection**: JWT access tokens and device-isolated credentials stored in Keychain with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.
- **Biometric Security**: Seamless Face ID and Touch ID authentication via `LocalAuthentication`.
- **Background Transfers**: `URLSessionConfiguration.background` handles large uploads and downloads even when the app is suspended.
- **MDM / Deep-Link Enrollment**: Automatic enterprise enrollment via `nkbcloud://enroll` URL scheme.

## Build Requirements
- macOS Sonoma / Sequoia
- Xcode 15+
- iOS 16.0+ Deployment Target
