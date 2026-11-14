# NKB Cloud — Native Android Client (Kotlin)

Native enterprise mobile application for Android smartphones and tablets (Android 8.0 Oreo through Android 14+).

## Features
- **Modern Jetpack Compose UI**: Declarative Material 3 design system with adaptive phone/tablet layouts.
- **Hardware-Backed Android Keystore**: Generates and stores device-isolated asymmetric keys in the hardware Secure Element / TEE.
- **Biometric Authentication**: Fingerprint and Face Unlock support via `androidx.biometric.BiometricPrompt`.
- **WorkManager Background Sync**: Fault-tolerant background file uploads conforming to battery, charging, and unmetered Wi-Fi constraints.
- **Enterprise Device Enrollment**: Automatic token enrollment and administrator approval status monitoring.
- **Deep Link Handling**: Sideload or MDM enrollment via `nkbcloud://enroll` schema.

## Build Requirements
- Android Studio Hedgehog (2023.1.1+) or command-line Gradle
- JDK 17
- Android SDK 34 (Android 14)

```bash
# Build debug APK
./gradlew assembleDebug

# Run unit tests
./gradlew testDebugUnitTest
```
