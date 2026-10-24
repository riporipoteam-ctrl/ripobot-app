import Foundation

enum RootTab: Hashable {
    case home, chat, computer, files, settings
}

struct Agent: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var role: String
    var description: String?
    var instructions: String?
    var avatar: String?
    var avatarSeed: String?
    var avatarShape: Int?
    var avatarColor: String?
    var avatarMotion: Int?
    var avatarVisualVersion: Int?
    var state: String?
    var canRenameSelf: Bool?
    var isPrimary: Bool?

    static let ripo = Agent(
        id: "ripo",
        name: "Ripo Bot",
        role: "Chief of Staff",
        description: "Your main bot. It coordinates specialists, files, search, images, and the live computer.",
        instructions: "Coordinate the workspace and use specialist bots when they improve the result.",
        avatar: "ripo",
        avatarSeed: "ripo-ios",
        avatarShape: 7,
        avatarColor: "#111111",
        avatarMotion: 6,
        avatarVisualVersion: 6,
        state: "ready",
        canRenameSelf: false,
        isPrimary: true
    )
}

struct AttachmentRef: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var type: String
    var size: Int?
}

struct ChatMessage: Codable, Identifiable, Hashable {
    var id: String
    var role: String
    var content: String
    var createdAt: String?
    var agentId: String?
    var attachments: [AttachmentRef]?
    var sources: [SourceRef]?
    var generatedFiles: [RipoFile]?
    var delegated: Bool?

    static func user(_ text: String, attachments: [AttachmentRef] = []) -> ChatMessage {
        ChatMessage(
            id: "ios-user-\(UUID().uuidString)",
            role: "user",
            content: text,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            agentId: nil,
            attachments: attachments,
            sources: nil,
            generatedFiles: nil,
            delegated: nil
        )
    }
}

struct SourceRef: Codable, Hashable {
    var title: String?
    var url: String?
    var snippet: String?
}

struct Team: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var members: [String]
    var createdAt: Double?
}

struct RipoFile: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var type: String?
    var size: Int?
    var source: String?
    var workspaceId: String?
    var createdAt: Double?
    var url: String?
    var generated: Bool?
    var edited: Bool?
}

struct WorkspaceState: Codable {
    var agents: [Agent]?
    var conversations: [String: [ChatMessage]]?
    var teams: [Team]?
    var archivedChats: [ArchivedChat]?
    var onboarded: Bool?
    var workspaceId: String?
    var workspaceName: String?
}

struct ArchivedChat: Codable, Identifiable {
    var id: String
    var threadKey: String?
    var agentId: String?
    var teamId: String?
    var title: String?
    var createdAt: Double?
    var messages: [ChatMessage]?
}

struct Workspace: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var createdAt: Double?
    var updatedAt: Double?
    var botCount: Int?
    var weeklyTokens: Int?
}

struct WorkspaceListResponse: Codable {
    var workspaces: [Workspace]
    var limit: Int?
}

struct AccountUser: Codable, Hashable {
    var id: String
    var email: String
    var name: String
    var avatarUrl: String?
}

struct AccountResponse: Codable {
    var user: AccountUser
    var token: String?
    var expiresAt: Double?
    var defaultWorkspaceId: String?
    var role: String?
    var plan: String?
    var coins: Int?
    var cloud: Bool?
}

struct FileListResponse: Codable {
    var files: [RipoFile]
    var workspaceId: String?
}

struct FileUploadResponse: Codable {
    var file: RipoFile
}

struct InterAgentMessage: Codable, Hashable, Identifiable {
    var id: String
    var sourceAgentId: String
    var sourceAgentName: String
    var targetAgentId: String
    var targetAgentName: String
    var task: String
    var reply: String?
    var status: String?
    var createdAt: Double
}

struct AgentMailboxResponse: Codable {
    var workspaceId: String?
    var messages: [InterAgentMessage]
}

struct DelegatedReply: Codable, Hashable {
    var agentId: String
    var agentName: String
    var content: String
    var provider: String?
    var model: String?
}

struct ChatResponse: Codable {
    var reply: String
    var sources: [SourceRef]?
    var generatedFiles: [RipoFile]?
    var updatedFiles: [RipoFile]?
    var delegatedReplies: [DelegatedReply]?
    var interAgentMessages: [InterAgentMessage]?
    var attachmentFiles: [AttachmentRef]?
    var coins: Int?
}

struct ComputerLiveState: Codable {
    var active: Bool
    var configured: Bool?
    var sessionId: String?
    var targetId: String?
    var url: String?
    var title: String?
    var liveViewUrl: String?
    var provider: String?
}

struct ComputerStatus: Codable {
    var configured: Bool
    var provider: String?
    var browser: Bool?
    var liveViewReady: Bool?
    var browserProvider: String?
}

struct ChatRequest: Encodable {
    struct AgentSummary: Encodable {
        var id: String
        var name: String
        var role: String
        var description: String
        var instructions: String
        var isPrimary: Bool
    }

    struct Message: Encodable {
        var role: String
        var content: String
    }

    var agentId: String
    var agentName: String
    var agentRole: String
    var agentInstructions: String
    var messages: [Message]
    var workspaceId: String?
    var attachments: [AttachmentRef]
    var availableAgents: [AgentSummary]
    var allowAgentAdmin: Bool
    var allowRename: Bool
}

struct SaveStatePayload: Encodable {
    var workspaceId: String?
    var agents: [Agent]
    var conversations: [String: [ChatMessage]]
    var teams: [Team]
    var archivedChats: [ArchivedChat]
    var onboarded: Bool
}

struct OKResponse: Codable {
    var ok: Bool?
}
