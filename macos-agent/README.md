# NKB Cloud — Native macOS Storage Agent (Swift)

Native enterprise storage agent for macOS (MacBook, Mac Studio, Mac Mini) running macOS 13.0+ (Ventura, Sonoma, Sequoia).

## Features
- **Native Swift Architecture**: High-performance compiled binary utilizing CryptoKit and Network.framework.
- **Apple Keychain Credential Protection**: Cryptographic private keys and agent tokens are stored exclusively in the macOS Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`).
- **Ed25519 Mutual Authentication**: Challenge-response handshake verifying digital signatures on canonical RFC 8785 envelopes.
- **Local Browser Detection**: Loopback service on `http://127.0.0.1:51248` allowing browser-based agent detection.
- **APFS / HFS+ Volume Discovery**: Dynamic detection of internal and external storage volumes.
- **Folder Sync Engine**: Real-time bidirectional local folder synchronization.
- **Launchd Daemon Integration**: Background daemon execution managed by `launchd`.

## Building from Source
Requires Xcode 15+ or Swift 5.9+ command-line tools:

```bash
# Build release executable
swift build -c release

# Install binary to /usr/local/bin
sudo cp .build/release/nkb-storage-agent /usr/local/bin/

# Install and load launchd background agent
cp com.nkb.storageagent.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.nkb.storageagent.plist
```

## Automated Enrollment
Run the deployment script generated from the NKB Cloud web portal:
```bash
curl -s "https://cloud.nkb.local/api/devices/installer-script?platform=macos" | bash
```
