#!/bin/bash
# ==============================================================================
# NKB DRIVE — MACOS PRODUCTION BUILD & DMG PACKAGING SCRIPT
# Architecture: Universal 2 (arm64 Apple Silicon + x86_64 Intel)
# Target OS: macOS 13.0+ (Ventura, Sonoma, Sequoia)
# ==============================================================================

set -e

APP_NAME="NKB Drive"
BUNDLE_ID="com.nkbmanufacturing.drive"
VERSION="2.1.0"
BUILD_DIR=".build/apple"
APP_BUNDLE="${BUILD_DIR}/${APP_NAME}.app"
DMG_NAME="NKBDrive-${VERSION}-macOS.dmg"
DMG_STAGE_DIR="${BUILD_DIR}/dmg_stage"

echo "=== 1. Building Universal Release Binaries ==="
swift build -c release --triple arm64-apple-macosx
swift build -c release --triple x86_64-apple-macosx

echo "=== 2. Creating Universal Binary via lipo ==="
mkdir -p "${BUILD_DIR}/universal"
lipo -create -output "${BUILD_DIR}/universal/NKBDrive" \
    ".build/arm64-apple-macosx/release/NKBDrive" \
    ".build/x86_64-apple-macosx/release/NKBDrive"

echo "=== 3. Assembling macOS App Bundle ==="
rm -rf "${APP_BUNDLE}"
mkdir -p "${APP_BUNDLE}/Contents/MacOS"
mkdir -p "${APP_BUNDLE}/Contents/Resources"

cp "${BUILD_DIR}/universal/NKBDrive" "${APP_BUNDLE}/Contents/MacOS/NKBDrive"
chmod +x "${APP_BUNDLE}/Contents/MacOS/NKBDrive"

cp "Resources/Info.plist" "${APP_BUNDLE}/Contents/Info.plist"

if [ -f "Resources/AppIcon.icns" ]; then
    cp "Resources/AppIcon.icns" "${APP_BUNDLE}/Contents/Resources/AppIcon.icns"
fi

echo "=== 4. Code Signing with Developer ID (if certificate available) ==="
if [ -n "${DEVELOPER_ID_APPLICATION}" ]; then
    echo "Signing with Developer ID: ${DEVELOPER_ID_APPLICATION}"
    codesign --deep --force --verify --verbose \
        --options runtime \
        --entitlements "Resources/Entitlements.plist" \
        --sign "${DEVELOPER_ID_APPLICATION}" \
        "${APP_BUNDLE}"
else
    echo "No DEVELOPER_ID_APPLICATION specified; applying ad-hoc signature for local testing"
    codesign --force --deep --sign - "${APP_BUNDLE}"
fi

echo "=== 5. Packaging Professional Installer DMG ==="
rm -rf "${DMG_STAGE_DIR}"
mkdir -p "${DMG_STAGE_DIR}"

cp -R "${APP_BUNDLE}" "${DMG_STAGE_DIR}/"
ln -s /Applications "${DMG_STAGE_DIR}/Applications"

rm -f "${DMG_NAME}"
hdiutil create -volname "${APP_NAME}" \
    -srcfolder "${DMG_STAGE_DIR}" \
    -ov -format UDZO \
    "${DMG_NAME}"

echo "=== 6. Signing & Notarizing DMG ==="
if [ -n "${DEVELOPER_ID_APPLICATION}" ]; then
    codesign --force --sign "${DEVELOPER_ID_APPLICATION}" "${DMG_NAME}"
fi

if [ -n "${NOTARIZE_KEYCHAIN_PROFILE}" ]; then
    echo "Submitting DMG for Apple Notarization ticket..."
    xcrun notarytool submit "${DMG_NAME}" --keychain-profile "${NOTARIZE_KEYCHAIN_PROFILE}" --wait
    xcrun stapler staple "${DMG_NAME}"
fi

echo "=== Build Complete: ${DMG_NAME} ==="
shasum -a 256 "${DMG_NAME}"
