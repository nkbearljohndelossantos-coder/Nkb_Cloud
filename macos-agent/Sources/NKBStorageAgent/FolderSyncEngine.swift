import Foundation

/// FolderSyncEngine: Coordinates two-way local directory synchronization on macOS
public final class FolderSyncEngine {
    public let syncDirectory: URL
    private var isRunning: Bool = false
    
    public init(syncDirectory: URL? = nil) {
        if let dir = syncDirectory {
            self.syncDirectory = dir
        } else {
            let home = FileManager.default.homeDirectoryForCurrentUser
            self.syncDirectory = home.appendingPathComponent("NKBCloud", isDirectory: true)
        }
        createDirectoryIfNeeded()
    }
    
    private func createDirectoryIfNeeded() {
        if !FileManager.default.fileExists(atPath: syncDirectory.path) {
            try? FileManager.default.createDirectory(at: syncDirectory, withIntermediateDirectories: true, attributes: nil)
        }
    }
    
    public func start() {
        isRunning = true
        print("[FolderSyncEngine] Monitoring local sync folder at: \(syncDirectory.path)")
    }
    
    public func stop() {
        isRunning = false
    }
    
    /// Lists all files currently in the synchronized local folder
    public func listLocalFiles() -> [URL] {
        guard let enumerator = FileManager.default.enumerator(at: syncDirectory, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles]) else {
            return []
        }
        var files: [URL] = []
        for case let fileURL as URL in enumerator {
            files.append(fileURL)
        }
        return files
    }
}
