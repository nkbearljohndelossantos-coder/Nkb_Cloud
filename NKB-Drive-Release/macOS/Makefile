.PHONY: all build app dmg clean sign notarize

VERSION = 2.1.0
DMG = NKBDrive-$(VERSION)-macOS.dmg

all: dmg

build:
	swift build -c release

app:
	@chmod +x build_dmg.sh
	./build_dmg.sh

dmg: app

clean:
	rm -rf .build
	rm -f $(DMG)

sign:
	@if [ -z "$(DEVELOPER_ID_APPLICATION)" ]; then \
		echo "Error: DEVELOPER_ID_APPLICATION is not set"; exit 1; \
	fi
	codesign --deep --force --verify --verbose --options runtime --entitlements Resources/Entitlements.plist --sign "$(DEVELOPER_ID_APPLICATION)" ".build/apple/NKB Drive.app"
	codesign --force --sign "$(DEVELOPER_ID_APPLICATION)" $(DMG)

notarize:
	@if [ -z "$(NOTARIZE_KEYCHAIN_PROFILE)" ]; then \
		echo "Error: NOTARIZE_KEYCHAIN_PROFILE is not set"; exit 1; \
	fi
	xcrun notarytool submit $(DMG) --keychain-profile "$(NOTARIZE_KEYCHAIN_PROFILE)" --wait
	xcrun stapler staple $(DMG)
