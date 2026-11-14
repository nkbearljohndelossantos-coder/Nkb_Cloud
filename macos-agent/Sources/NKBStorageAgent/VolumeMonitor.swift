import Foundation

public struct VolumeInfo {
    public let name: String
    public let mountPath: String
    public let totalBytes: Int64
    public let freeBytes: Int64
    public let filesystem: String
}

/// VolumeMonitor: Detects local mounted APFS / HFS+ storage volumes on macOS
public final class VolumeMonitor {
    public static let shared = VolumeMonitor()
    
    private init() {}
    
    /// Queries mounted local volumes
    public func scanMountedVolumes() -> [VolumeInfo] {
        var volumes: [VolumeInfo] = []
        let keys: [URLResourceKey] = [
            .volumeNameKey,
            .volumeIsRemovableKey,
            .volumeTotalCapacityKey,
            .volumeAvailableCapacityKey,
            .volumeLocalizedFormatDescriptionKey
        ]
        
        let urls = FileManager.default.mountedVolumeURLs(includingResourceValuesForKeys: keys, options: [.skipHiddenVolumes]) ?? []
        
        for url in urls {
            guard let vals = try? url.resourceValues(forKeys: Set(keys)) else { continue }
            let name = vals.volumeName ?? url.lastPathComponent
            let total = Int64(vals.volumeTotalCapacity ?? 0)
            let free = Int64(vals.volumeAvailableCapacity ?? 0)
            let fs = vals.volumeLocalizedFormatDescription ?? "APFS"
            
            volumes.append(VolumeInfo(
                name: name,
                mountPath: url.path,
                totalBytes: total,
                freeBytes: free,
                filesystem: fs
            ))
        }
        return volumes
    }
}
