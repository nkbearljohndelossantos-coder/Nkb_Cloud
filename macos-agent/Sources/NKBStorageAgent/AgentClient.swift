import Foundation

public final class AgentClient: NSObject, URLSessionWebSocketDelegate {
    private var webSocketTask: URLSessionWebSocketTask?
    private var session: URLSession?
    public var serverUrl: URL
    public var agentId: String
    public var agentToken: String
    private var isConnected: Bool = false
    private var heartbeatTimer: Timer?
    public var onStatusChange: ((String) -> Void)?
    
    public init(serverUrl: URL, agentId: String, agentToken: String) {
        self.serverUrl = serverUrl
        self.agentId = agentId
        self.agentToken = agentToken
        super.init()
    }
    
    public func connect() {
        guard var components = URLComponents(url: serverUrl, resolvingAgainstBaseURL: false) else { return }
        components.queryItems = [
            URLQueryItem(name: "agentId", value: agentId),
            URLQueryItem(name: "agentToken", value: agentToken)
        ]
        
        guard let fullUrl = components.url else { return }
        session = URLSession(configuration: .default, delegate: self, delegateQueue: OperationQueue())
        webSocketTask = session?.webSocketTask(with: fullUrl)
        webSocketTask?.resume()
        
        listen()
    }
    
    private func listen() {
        webSocketTask?.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .failure(let error):
                print("[AgentClient] WebSocket receive error: \(error)")
                self.handleDisconnect()
            case .success(let message):
                switch message {
                case .string(let text):
                    self.handleMessage(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self.handleMessage(text)
                    }
                @unknown default:
                    break
                }
                self.listen()
            }
        }
    }
    
    private func handleMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else {
            return
        }
        
        switch type {
        case "AUTH_CHALLENGE":
            handleAuthChallenge(json)
        case "AUTH_SUCCESS":
            print("[AgentClient] Authentication successful. Agent is ONLINE.")
            self.isConnected = true
            self.onStatusChange?("ONLINE")
            startHeartbeat()
        case "AUTH_REJECTED":
            let reason = json["reason"] as? String ?? "Authentication rejected"
            print("[AgentClient] AUTH_REJECTED: \(reason)")
            self.onStatusChange?("REJECTED")
            disconnect()
        case "PING":
            sendPong()
        default:
            print("[AgentClient] Received message: \(type)")
        }
    }
    
    private func handleAuthChallenge(_ json: [String: Any]) {
        guard let challengeId = json["challengeId"] as? String,
              let serverNonce = json["serverNonce"] as? String,
              let serverTimestamp = json["timestamp"] as? Int else {
            return
        }
        
        let clientNonce = UUID().uuidString.replacingOccurrences(of: "-", with: "") + UUID().uuidString.replacingOccurrences(of: "-", with: "")
        let canonicalHandshake = "NKB-AUTH-V1|2.1.0|\(challengeId)|\(agentId)|\(serverNonce)|\(clientNonce)|\(serverTimestamp)"
        
        do {
            let signature = try CryptoManager.shared.sign(canonicalMessage: canonicalHandshake)
            let responsePayload: [String: Any] = [
                "type": "AUTH_RESPONSE",
                "challengeId": challengeId,
                "agentId": agentId,
                "clientNonce": clientNonce,
                "signature": signature
            ]
            let data = try JSONSerialization.data(withJSONObject: responsePayload)
            if let str = String(data: data, encoding: .utf8) {
                webSocketTask?.send(.string(str)) { error in
                    if let error = error {
                        print("[AgentClient] Error sending AUTH_RESPONSE: \(error)")
                    }
                }
            }
        } catch {
            print("[AgentClient] Failed to sign challenge: \(error)")
        }
    }
    
    private func startHeartbeat() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            self?.sendHeartbeat()
        }
    }
    
    private func sendHeartbeat() {
        let payload: [String: Any] = [
            "type": "HEARTBEAT",
            "agentId": agentId,
            "timestamp": Int(Date().timeIntervalSince1970 * 1000)
        ]
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let str = String(data: data, encoding: .utf8) {
            webSocketTask?.send(.string(str)) { _ in }
        }
    }
    
    private func sendPong() {
        let payload: [String: Any] = ["type": "PONG", "timestamp": Int(Date().timeIntervalSince1970 * 1000)]
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let str = String(data: data, encoding: .utf8) {
            webSocketTask?.send(.string(str)) { _ in }
        }
    }
    
    private func handleDisconnect() {
        isConnected = false
        heartbeatTimer?.invalidate()
        onStatusChange?("OFFLINE")
    }
    
    public func disconnect() {
        heartbeatTimer?.invalidate()
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        handleDisconnect()
    }
}
