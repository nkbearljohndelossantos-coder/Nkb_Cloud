import Foundation

public class StagingApiClient {
    public let baseUrl: URL
    private let session: URLSession

    public init(baseUrl: URL) {
        self.baseUrl = baseUrl
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15.0
        config.timeoutIntervalForResource = 60.0
        self.session = URLSession(configuration: config)
    }

    public func getHeaders() -> [String: String] {
        var headers = ["Content-Type": "application/json", "Accept": "application/json"]
        if let token = KeychainVault.loadToken() {
            headers["Authorization"] = "Bearer \(token)"
        }
        return headers
    }

    public func fetchChanges(cursor: Int64, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        let url = baseUrl.appendingPathComponent("api/drive/changes").appending(queryItems: [
            URLQueryItem(name: "cursor", value: String(cursor)),
            URLQueryItem(name: "limit", value: "50")
        ])

        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        getHeaders().forEach { req.setValue($1, forHTTPHeaderField: $0) }

        session.dataTask(with: req) { data, resp, err in
            if let err = err { return completion(.failure(err)) }
            guard let data = data else {
                return completion(.failure(NSError(domain: "NKBDrive", code: -1, userInfo: [NSLocalizedDescriptionKey: "No data"])))
            }
            do {
                if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    completion(.success(json))
                }
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }

    public func fetchTree(completion: @escaping (Result<[String: Any], Error>) -> Void) {
        let url = baseUrl.appendingPathComponent("api/drive/tree")
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        getHeaders().forEach { req.setValue($1, forHTTPHeaderField: $0) }

        session.dataTask(with: req) { data, resp, err in
            if let err = err { return completion(.failure(err)) }
            guard let data = data else {
                return completion(.failure(NSError(domain: "NKBDrive", code: -1, userInfo: [NSLocalizedDescriptionKey: "No data"])))
            }
            do {
                if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    completion(.success(json))
                }
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }
}
