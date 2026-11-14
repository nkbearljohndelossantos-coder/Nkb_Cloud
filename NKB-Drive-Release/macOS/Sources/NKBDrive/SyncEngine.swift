import Foundation

public class SyncEngine {
    private let mountPath: URL
    private let apiClient: StagingApiClient
    private var timer: Timer?
    private var currentCursor: Int64 = 0
    public private(set) var isRunning: Bool = false

    public init(mountPath: URL, apiClient: StagingApiClient) {
        self.mountPath = mountPath
        self.apiClient = apiClient
    }

    public func start() {
        guard !isRunning else { return }
        isRunning = true
        syncNow()

        DispatchQueue.main.async {
            self.timer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: true) { [weak self] _ in
                self?.syncNow()
            }
        }
    }

    public func stop() {
        isRunning = false
        timer?.invalidate()
        timer = nil
    }

    public func syncNow() {
        apiClient.fetchChanges(cursor: currentCursor) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let json):
                if let changes = json["changes"] as? [[String: Any]], !changes.isEmpty {
                    for change in changes {
                        if let eventId = change["event_id"] as? Int64 {
                            self.currentCursor = max(self.currentCursor, eventId)
                        }
                    }
                }
            case .failure(let error):
                print("[SyncEngine] Sync poll notice: \(error.localizedDescription)")
            }
        }
    }
}
