import Foundation

print("==========================================================")
print("   NKB CLOUD — MACOS NATIVE STORAGE AGENT v2.1.0")
print("==========================================================")

let loopback = LoopbackStatusServer()
loopback.start()

let syncEngine = FolderSyncEngine()
syncEngine.start()

let volumes = VolumeMonitor.shared.scanMountedVolumes()
print("[macOS Agent] Detected \(volumes.count) mounted storage volumes.")
for v in volumes {
    print("  - [\(v.filesystem)] \(v.name) (\(v.mountPath)): \(v.freeBytes / 1_000_000_000) GB free")
}

// Load configuration if present
let configPath = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/NKBCloud/StorageAgent/agent-config.json")

if let data = try? Data(contentsOf: configPath),
   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
   let urlString = json["serverUrl"] as? String,
   let url = URL(string: urlString),
   let agentId = json["agentId"] as? String,
   let agentToken = json["agentToken"] as? String {
    
    print("[macOS Agent] Connecting to server at \(urlString)...")
    let client = AgentClient(serverUrl: url, agentId: agentId, agentToken: agentToken)
    client.onStatusChange = { newStatus in
        loopback.currentStatus = newStatus
    }
    client.connect()
} else {
    print("[macOS Agent] No enrollment configuration found. Running in UNENROLLED state.")
    print("Run deployment script or enroll machine via NKB Cloud web interface.")
}

// Keep daemon running in runloop
RunLoop.main.run()
