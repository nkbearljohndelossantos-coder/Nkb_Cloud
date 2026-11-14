import Foundation

/// BackgroundSyncManager: Coordinates out-of-process background downloads & uploads on iOS
public final class BackgroundSyncManager: NSObject, URLSessionDownloadDelegate {
    public static let shared = BackgroundSyncManager()
    private var backgroundSession: URLSession!
    
    private override init() {
        super.init()
        let config = URLSessionConfiguration.background(withIdentifier: "com.nkb.cloud.backgroundsync")
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        backgroundSession = URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }
    
    public func startBackgroundDownload(fileId: String, token: String) {
        guard let url = URL(string: "\(NKBNetworkClient.shared.baseUrl)/api/files/\(fileId)/download") else { return }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        let task = backgroundSession.downloadTask(with: request)
        task.resume()
    }
    
    public func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        // Move downloaded file to app document container
        print("[BackgroundSync] Completed background download: \(location)")
    }
}
