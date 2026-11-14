import Foundation
import Network

/// LoopbackStatusServer: Embedded HTTP service listening exclusively on 127.0.0.1:51248
/// Provides local web browsers running NKB Cloud with agent presence detection.
public final class LoopbackStatusServer {
    private var listener: NWListener?
    private let port: NWEndpoint.Port = 51248
    public var currentStatus: String = "PENDING"
    public var agentId: String = ""
    public var machineName: String = Host.current().localizedName ?? "MacBook"
    public var version: String = "2.1.0"
    
    public init() {}
    
    public func start() {
        do {
            let tcpOptions = NWProtocolTCP.Options()
            let params = NWParameters(tls: nil, tcp: tcpOptions)
            params.requiredLocalEndpoint = NWEndpoint.hostPort(host: .ipv4(.loopback), port: port)
            
            listener = try NWListener(using: params)
            listener?.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    print("[LoopbackServer] Listening on http://127.0.0.1:51248")
                case .failed(let err):
                    print("[LoopbackServer] Error: \(err)")
                default:
                    break
                }
            }
            
            listener?.newConnectionHandler = { [weak self] connection in
                self?.handleConnection(connection)
            }
            
            listener?.start(queue: .global(qos: .userInitiated))
        } catch {
            print("[LoopbackServer] Failed to bind 51248: \(error)")
        }
    }
    
    private func handleConnection(_ connection: NWConnection) {
        connection.start(queue: .global(qos: .userInitiated))
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1024) { [weak self] (data, _, isComplete, _) in
            guard let self = self, let data = data, let req = String(data: data, encoding: .utf8) else {
                connection.cancel()
                return
            }
            
            let isOptions = req.starts(with: "OPTIONS")
            let fingerprint = (try? CryptoManager.shared.getKeyFingerprint()) ?? ""
            
            let payload: [String: Any] = [
                "installed": true,
                "agentVersion": self.version,
                "platform": "macOS",
                "machineName": self.machineName,
                "status": self.currentStatus,
                "authenticated": self.currentStatus == "ONLINE",
                "keyFingerprint": String(fingerprint.prefix(16)),
                "loopbackPort": 51248
            ]
            
            let jsonData = (try? JSONSerialization.data(withJSONObject: payload)) ?? Data()
            let body = isOptions ? "" : String(data: jsonData, encoding: .utf8)!
            
            let response = """
            HTTP/1.1 200 OK\r
            Content-Type: application/json\r
            Content-Length: \(body.utf8.count)\r
            Access-Control-Allow-Origin: *\r
            Access-Control-Allow-Methods: GET, OPTIONS\r
            Access-Control-Allow-Headers: Content-Type\r
            Connection: close\r
            \r
            \(body)
            """
            
            if let respData = response.data(using: .utf8) {
                connection.send(content: respData, completion: .contentProcessed({ _ in
                    connection.cancel()
                }))
            }
        }
    }
    
    public func stop() {
        listener?.cancel()
    }
}
