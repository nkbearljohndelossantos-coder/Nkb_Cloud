import Foundation

public struct UserProfile: Codable {
    public let id: String
    public let username: String
    public let email: String
    public let fullName: String
    public let role: String
    public let departmentId: Int?
    public let sessionVersion: Int
    
    enum CodingKeys: String, CodingKey {
        case id, username, email, role
        case fullName = "full_name"
        case departmentId = "department_id"
        case sessionVersion = "session_version"
    }
}

public struct FileEntry: Codable, Identifiable {
    public let id: String
    public let name: String
    public let mimeType: String
    public let sizeBytes: Int64
    public let category: String
    public let isStarred: Bool
    
    enum CodingKeys: String, CodingKey {
        case id, name, category
        case mimeType = "mime_type"
        case sizeBytes = "size_bytes"
        case isStarred = "is_starred"
    }
}

public struct FolderEntry: Codable, Identifiable {
    public let id: String
    public let name: String
    public let parentId: String?
    
    enum CodingKeys: String, CodingKey {
        case id, name
        case parentId = "parent_id"
    }
}

public struct ExplorerPayload: Codable {
    public let folders: [FolderEntry]
    public let files: [FileEntry]
}

/// NKBNetworkClient: URLSession-based enterprise API client
public final class NKBNetworkClient {
    public static let shared = NKBNetworkClient()
    public var baseUrl: String = "https://cloud.nkb.local"
    
    private init() {}
    
    public func login(username: String, password: String) async throws -> (String, UserProfile) {
        guard let url = URL(string: "\(baseUrl)/api/auth/login") else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = ["username": username, "password": password]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResp = response as? HTTPURLResponse, httpResp.statusCode == 200 else {
            throw URLError(.userAuthenticationRequired)
        }
        
        struct LoginResp: Codable {
            let token: String
            let user: UserProfile
        }
        let decoded = try JSONDecoder().decode(LoginResp, from: data)
        return (decoded.token, decoded.user)
    }
    
    public func fetchFiles(token: String, folderId: String? = nil) async throws -> ExplorerPayload {
        var urlComp = URLComponents(string: "\(baseUrl)/api/files")!
        if let fId = folderId {
            urlComp.queryItems = [URLQueryItem(name: "folderId", value: fId)]
        }
        
        var request = URLRequest(url: urlComp.url!)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResp = response as? HTTPURLResponse, httpResp.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(ExplorerPayload, from: data)
    }
    
    public func enrollDevice(token: String, enrollmentToken: String, deviceName: String, pubKey: String) async throws -> (String, String) {
        guard let url = URL(string: "\(baseUrl)/api/devices/enroll") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let payload: [String: Any] = [
            "enrollmentToken": enrollmentToken,
            "machineName": deviceName,
            "osVersion": "iOS " + (UIDevice.current.systemVersion),
            "publicKey": pubKey,
            "agentVersion": "2.1.0"
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResp = response as? HTTPURLResponse, httpResp.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        let agentId = json["agentId"] as? String ?? ""
        let status = json["status"] as? String ?? "PENDING"
        return (agentId, status)
    }
}
