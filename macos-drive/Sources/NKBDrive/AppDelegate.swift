import Cocoa
import Foundation

public class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var syncEngine: SyncEngine?
    private var apiClient: StagingApiClient?
    private var localMountPath: URL

    public override init() {
        // macOS CloudStorage or Volumes standard path
        let fileManager = FileManager.default
        let homeDir = fileManager.homeDirectoryForCurrentUser
        self.localMountPath = homeDir.appendingPathComponent("Library/CloudStorage/NKB Drive", isDirectory: true)
        super.init()
    }

    public func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory) // Menu Bar Agent (LSUIElement)

        setupStatusItem()
        ensureMountDirectory()
        startSyncEngine()
    }

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            button.title = " NKB Drive"
            button.imagePosition = .imageLeft
            // Use native SF Symbol or template icon
            if #available(macOS 11.0, *) {
                button.image = NSImage(systemSymbolName: "icloud.and.arrow.up.fill", accessibilityDescription: "NKB Drive")
            }
        }

        buildMenu()
    }

    private func buildMenu() {
        let menu = NSMenu()

        // Header info
        let titleItem = NSMenuItem(title: "NKB Drive Enterprise v2.1.0", action: nil, keyEquivalent: "")
        titleItem.isEnabled = false
        menu.addItem(titleItem)

        let statusText = syncEngine?.isRunning == true ? "● Connected (127.0.0.1:5000)" : "○ Connecting..."
        let connectionItem = NSMenuItem(title: statusText, action: nil, keyEquivalent: "")
        connectionItem.isEnabled = false
        menu.addItem(connectionItem)

        let deviceItem = NSMenuItem(title: "Device: Authorized Workstation", action: nil, keyEquivalent: "")
        deviceItem.isEnabled = false
        menu.addItem(deviceItem)

        menu.addItem(NSMenuItem.separator())

        // Quick Actions
        let openFinderItem = NSMenuItem(title: "Open NKB Drive in Finder", action: #selector(openInFinder), keyEquivalent: "o")
        openFinderItem.target = self
        menu.addItem(openFinderItem)

        let openWebItem = NSMenuItem(title: "Open Web Dashboard", action: #selector(openWebDashboard), keyEquivalent: "w")
        openWebItem.target = self
        menu.addItem(openWebItem)

        let syncNowItem = NSMenuItem(title: "Sync Now", action: #selector(triggerSyncNow), keyEquivalent: "s")
        syncNowItem.target = self
        menu.addItem(syncNowItem)

        menu.addItem(NSMenuItem.separator())

        // App Controls
        let prefsItem = NSMenuItem(title: "Preferences...", action: #selector(openPreferences), keyEquivalent: ",")
        prefsItem.target = self
        menu.addItem(prefsItem)

        let logoutItem = NSMenuItem(title: "Sign Out", action: #selector(signOut), keyEquivalent: "")
        logoutItem.target = self
        menu.addItem(logoutItem)

        menu.addItem(NSMenuItem.separator())

        let quitItem = NSMenuItem(title: "Quit NKB Drive", action: #selector(quitApp), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu
    }

    private func ensureMountDirectory() {
        let fm = FileManager.default
        if !fm.fileExists(atPath: localMountPath.path) {
            try? fm.createDirectory(at: localMountPath, withIntermediateDirectories: true, attributes: nil)
        }
    }

    private func startSyncEngine() {
        apiClient = StagingApiClient(baseUrl: URL(string: "http://127.0.0.1:5000")!)
        syncEngine = SyncEngine(mountPath: localMountPath, apiClient: apiClient!)
        syncEngine?.start()
    }

    @objc private func openInFinder() {
        ensureMountDirectory()
        NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: localMountPath.path)
    }

    @objc private func openWebDashboard() {
        if let url = URL(string: "http://127.0.0.1:5000") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc private func triggerSyncNow() {
        syncEngine?.syncNow()
    }

    @objc private func openPreferences() {
        let alert = NSAlert()
        alert.messageText = "NKB Drive Preferences"
        alert.informativeText = "Connected Backend: http://127.0.0.1:5000\nLocal Mount: \(localMountPath.path)\nAuthentication: Apple Keychain Vault (kSecAttrAccessibleAfterFirstUnlock)\nFilesystem Provider: Native macOS NSFileProvider / APFS Replicated Extension"
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    @objc private func signOut() {
        KeychainVault.deleteToken()
        let alert = NSAlert()
        alert.messageText = "Signed Out"
        alert.informativeText = "You have been signed out from NKB Drive. Token removed from macOS Keychain."
        alert.runModal()
    }

    @objc private func quitApp() {
        syncEngine?.stop()
        NSApplication.shared.terminate(nil)
    }
}
