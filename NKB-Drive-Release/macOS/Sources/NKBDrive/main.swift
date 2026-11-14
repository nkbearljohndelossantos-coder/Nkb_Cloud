import Cocoa

// NKB Drive for macOS — Main Entry Point
// Enterprise Virtual Drive & Desktop Sync Client for macOS 13+ (Ventura, Sonoma, Sequoia)

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
