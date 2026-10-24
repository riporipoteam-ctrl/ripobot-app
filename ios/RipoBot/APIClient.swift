import Foundation

struct RipoAPIError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

final class APIClient {
    static let shared = APIClient()
    let baseURL = URL(string: "https://ripobot-api.ripo-ripoteam.workers.dev")!
    var token: String?

    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        return encoder
    }()

    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        return decoder
    }()

    func setToken(_ value: String?) {
        token = value
    }

    private func makeRequest(path: String, method: String = "GET", body: Data? = nil, contentType: String? = "application/json") throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw RipoAPIError(message: "Invalid API URL.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.timeoutInterval = 60
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let contentType { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        if let token, !token.isEmpty { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return request
    }

    private func decode<T: Decodable>(_ type: T.Type, data: Data, response: URLResponse) throws -> T {
        guard let http = response as? HTTPURLResponse else {
            throw RipoAPIError(message: "Invalid server response.")
        }
        guard (200..<300).contains(http.statusCode) else {
            if let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = payload["error"] as? String {
                throw RipoAPIError(message: message)
            }
            throw RipoAPIError(message: "Request failed (\(http.statusCode)).")
        }
        do { return try decoder.decode(type, from: data) }
        catch { throw RipoAPIError(message: "The server returned data the app could not read: \(error.localizedDescription)") }
    }

    func request<T: Decodable>(_ type: T.Type, path: String, method: String = "GET", body: Data? = nil) async throws -> T {
        let request = try makeRequest(path: path, method: method, body: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        return try decode(type, data: data, response: response)
    }

    func login(email: String, password: String) async throws -> AccountResponse {
        let body = try JSONSerialization.data(withJSONObject: ["email": email, "password": password])
        return try await request(AccountResponse.self, path: "/api/auth/login", method: "POST", body: body)
    }

    func register(name: String, email: String, password: String) async throws -> AccountResponse {
        let body = try JSONSerialization.data(withJSONObject: ["name": name, "email": email, "password": password])
        return try await request(AccountResponse.self, path: "/api/auth/register", method: "POST", body: body)
    }

    func account() async throws -> AccountResponse {
        try await request(AccountResponse.self, path: "/api/account")
    }

    func workspaces() async throws -> WorkspaceListResponse {
        try await request(WorkspaceListResponse.self, path: "/api/workspaces")
    }

    func state(workspaceId: String?) async throws -> WorkspaceState {
        var path = "/api/state"
        if let workspaceId {
            path += "?workspaceId=\(workspaceId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? workspaceId)"
        }
        return try await request(WorkspaceState.self, path: path)
    }

    func saveState(_ payload: SaveStatePayload) async throws {
        let body = try encoder.encode(payload)
        _ = try await request(OKResponse.self, path: "/api/state", method: "PUT", body: body)
    }

    func chat(_ payload: ChatRequest) async throws -> ChatResponse {
        let body = try encoder.encode(payload)
        return try await request(ChatResponse.self, path: "/api/chat", method: "POST", body: body)
    }

    func agentMailbox(workspaceId: String?) async throws -> AgentMailboxResponse {
        var path = "/api/agent-mailbox"
        if let workspaceId {
            path += "?workspaceId=\(workspaceId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? workspaceId)"
        }
        return try await request(AgentMailboxResponse.self, path: path)
    }

    func listFiles(workspaceId: String?) async throws -> FileListResponse {
        var path = "/api/files"
        if let workspaceId {
            path += "?workspaceId=\(workspaceId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? workspaceId)"
        }
        return try await request(FileListResponse.self, path: path)
    }

    func uploadFile(data: Data, name: String, mimeType: String, workspaceId: String?) async throws -> RipoFile {
        let boundary = "RipoBotBoundary\(UUID().uuidString)"
        var body = Data()
        func append(_ string: String) { body.append(string.data(using: .utf8)!) }

        if let workspaceId {
            append("--\(boundary)\r\n")
            append("Content-Disposition: form-data; name=\"workspaceId\"\r\n\r\n")
            append("\(workspaceId)\r\n")
        }
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"file\"; filename=\"\(name.replacingOccurrences(of: "\"", with: ""))\"\r\n")
        append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(data)
        append("\r\n--\(boundary)--\r\n")

        var request = try makeRequest(path: "/api/files", method: "POST", body: body, contentType: "multipart/form-data; boundary=\(boundary)")
        request.timeoutInterval = 120
        let (responseData, response) = try await URLSession.shared.data(for: request)
        return try decode(FileUploadResponse.self, data: responseData, response: response).file
    }

    func fileData(id: String) async throws -> Data {
        let request = try makeRequest(path: "/api/files/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)", contentType: nil)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw RipoAPIError(message: "Could not download that file.")
        }
        return data
    }

    func deleteFile(id: String) async throws {
        _ = try await request(OKResponse.self, path: "/api/files/\(id)", method: "DELETE")
    }

    func computerStatus() async throws -> ComputerStatus {
        try await request(ComputerStatus.self, path: "/api/computer/status")
    }

    func computerLiveStatus() async throws -> ComputerLiveState {
        try await request(ComputerLiveState.self, path: "/api/computer/live/status")
    }

    func startComputer(url: String) async throws -> ComputerLiveState {
        let body = try JSONSerialization.data(withJSONObject: ["url": url])
        return try await request(ComputerLiveState.self, path: "/api/computer/live/start", method: "POST", body: body)
    }

    func computerAction(_ payload: [String: Any]) async throws -> ComputerLiveState {
        let body = try JSONSerialization.data(withJSONObject: payload)
        return try await request(ComputerLiveState.self, path: "/api/computer/live/action", method: "POST", body: body)
    }

    func closeComputer() async throws {
        let body = Data("{}".utf8)
        _ = try await request(ComputerLiveState.self, path: "/api/computer/live/close", method: "POST", body: body)
    }

    func logout() async {
        guard token != nil else { return }
        let body = Data("{}".utf8)
        _ = try? await request(OKResponse.self, path: "/api/auth/logout", method: "POST", body: body)
    }

    func transcribeVoice(data: Data, mimeType: String = "audio/mp4") async throws -> String {
        let boundary = "RipoVoiceBoundary\(UUID().uuidString)"
        var body = Data()
        func append(_ string: String) { body.append(string.data(using: .utf8)!) }
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"audio\"; filename=\"voice.m4a\"\r\n")
        append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(data)
        append("\r\n--\(boundary)--\r\n")

        var request = try makeRequest(path: "/api/voice/transcribe", method: "POST", body: body, contentType: "multipart/form-data; boundary=\(boundary)")
        request.timeoutInterval = 120
        let (responseData, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw RipoAPIError(message: "Voice transcription failed.")
        }
        let object = try JSONSerialization.jsonObject(with: responseData) as? [String: Any]
        guard let text = object?["text"] as? String else { throw RipoAPIError(message: "No speech was recognized.") }
        return text
    }

    func speechData(text: String, language: String = "en") async throws -> Data {
        let body = try JSONSerialization.data(withJSONObject: ["text": text, "lang": language])
        let request = try makeRequest(path: "/api/voice/speak", method: "POST", body: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw RipoAPIError(message: "Voice synthesis failed.")
        }
        return data
    }
}
