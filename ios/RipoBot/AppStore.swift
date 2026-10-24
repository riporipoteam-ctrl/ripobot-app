import Foundation
import SwiftUI

@MainActor
final class AppStore: ObservableObject {
    @Published var authenticated = false
    @Published var loading = true
    @Published var errorMessage: String?
    @Published var account: AccountResponse?
    @Published var agents: [Agent] = [.ripo]
    @Published var conversations: [String: [ChatMessage]] = [:]
    @Published var teams: [Team] = []
    @Published var archivedChats: [ArchivedChat] = []
    @Published var files: [RipoFile] = []
    @Published var workspaces: [Workspace] = []
    @Published var workspaceId: String?
    @Published var selectedAgentId = "ripo"
    @Published var selectedTab: RootTab = .home
    @Published var sending = false
    @Published var computerLive = ComputerLiveState(active: false)

    let api = APIClient.shared

    var selectedAgent: Agent {
        agents.first(where: { $0.id == selectedAgentId }) ?? agents.first ?? .ripo
    }

    var messages: [ChatMessage] {
        conversations[selectedAgent.id] ?? []
    }

    func bootstrap() async {
        defer { loading = false }
        guard let token = KeychainStore.readToken(), !token.isEmpty else {
            authenticated = false
            return
        }
        api.setToken(token)
        do {
            account = try await api.account()
            authenticated = true
            try await loadWorkspace()
        } catch {
            KeychainStore.deleteToken()
            api.setToken(nil)
            authenticated = false
        }
    }

    func login(email: String, password: String) async {
        loading = true
        errorMessage = nil
        defer { loading = false }
        do {
            let result = try await api.login(email: email, password: password)
            guard let token = result.token else { throw RipoAPIError(message: "The server did not return a session token.") }
            KeychainStore.saveToken(token)
            api.setToken(token)
            account = result
            authenticated = true
            try await loadWorkspace(preferred: result.defaultWorkspaceId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func register(name: String, email: String, password: String) async {
        loading = true
        errorMessage = nil
        defer { loading = false }
        do {
            let result = try await api.register(name: name, email: email, password: password)
            guard let token = result.token else { throw RipoAPIError(message: "The server did not return a session token.") }
            KeychainStore.saveToken(token)
            api.setToken(token)
            account = result
            authenticated = true
            try await loadWorkspace(preferred: result.defaultWorkspaceId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadWorkspace(preferred: String? = nil) async throws {
        let workspaceResponse = try await api.workspaces()
        workspaces = workspaceResponse.workspaces
        workspaceId = preferred.flatMap { id in workspaces.first(where: { $0.id == id })?.id } ?? workspaces.first?.id
        let cloudState = try await api.state(workspaceId: workspaceId)
        workspaceId = cloudState.workspaceId ?? workspaceId
        agents = (cloudState.agents?.isEmpty == false ? cloudState.agents! : [.ripo])
        if !agents.contains(where: { $0.id == "ripo" }) { agents.insert(.ripo, at: 0) }
        conversations = cloudState.conversations ?? [:]
        if let mailbox = try? await api.agentMailbox(workspaceId: workspaceId) {
            mergeAgentMailbox(mailbox.messages)
        }
        teams = cloudState.teams ?? []
        archivedChats = cloudState.archivedChats ?? []
        selectedAgentId = agents.contains(where: { $0.id == selectedAgentId }) ? selectedAgentId : (agents.first?.id ?? "ripo")
        files = (try? await api.listFiles(workspaceId: workspaceId).files) ?? []
        computerLive = (try? await api.computerLiveStatus()) ?? ComputerLiveState(active: false)
    }

    func selectAgent(_ agent: Agent) {
        selectedAgentId = agent.id
        selectedTab = .chat
        Task { await refreshAgentMailbox() }
    }

    func send(_ text: String, attachments: [AttachmentRef] = []) async {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, !sending else { return }
        sending = true
        errorMessage = nil
        let agent = selectedAgent
        let userMessage = ChatMessage.user(clean, attachments: attachments)
        conversations[agent.id, default: []].append(userMessage)

        do {
            let history = conversations[agent.id, default: []].suffix(18).map { ChatRequest.Message(role: $0.role, content: $0.content) }
            let roster = agents.map {
                ChatRequest.AgentSummary(
                    id: $0.id,
                    name: $0.name,
                    role: $0.role,
                    description: $0.description ?? "",
                    instructions: $0.instructions ?? "",
                    isPrimary: $0.isPrimary ?? false
                )
            }
            let request = ChatRequest(
                agentId: agent.id,
                agentName: agent.name,
                agentRole: agent.role,
                agentInstructions: agent.instructions ?? "",
                messages: Array(history),
                workspaceId: workspaceId,
                attachments: attachments,
                availableAgents: roster,
                allowAgentAdmin: agent.isPrimary ?? (agent.id == "ripo"),
                allowRename: agent.canRenameSelf ?? false
            )
            let response = try await api.chat(request)

            if let exchanges = response.interAgentMessages, !exchanges.isEmpty {
                mergeAgentMailbox(exchanges)
            } else {
                for delegated in response.delegatedReplies ?? [] {
                    conversations[agent.id, default: []].append(
                        ChatMessage(
                            id: "ios-delegated-\(UUID().uuidString)",
                            role: "assistant",
                            content: delegated.content,
                            createdAt: ISO8601DateFormatter().string(from: Date()),
                            agentId: delegated.agentId,
                            attachments: nil,
                            sources: nil,
                            generatedFiles: nil,
                            delegated: true
                        )
                    )
                }
            }

            let assistant = ChatMessage(
                id: "ios-assistant-\(UUID().uuidString)",
                role: "assistant",
                content: response.reply,
                createdAt: ISO8601DateFormatter().string(from: Date()),
                agentId: agent.id,
                attachments: nil,
                sources: response.sources,
                generatedFiles: response.generatedFiles,
                delegated: nil
            )
            conversations[agent.id, default: []].append(assistant)

            if let generated = response.generatedFiles {
                mergeFiles(generated)
            }
            if let updated = response.updatedFiles {
                mergeFiles(updated)
            }
            try await saveWorkspace()
        } catch {
            errorMessage = error.localizedDescription
            conversations[agent.id, default: []].append(
                ChatMessage(
                    id: "ios-error-\(UUID().uuidString)",
                    role: "assistant",
                    content: error.localizedDescription,
                    createdAt: ISO8601DateFormatter().string(from: Date()),
                    agentId: agent.id,
                    attachments: nil,
                    sources: nil,
                    generatedFiles: nil,
                    delegated: nil
                )
            )
        }
        sending = false
    }

    func refreshAgentMailbox() async {
        guard let mailbox = try? await api.agentMailbox(workspaceId: workspaceId) else { return }
        mergeAgentMailbox(mailbox.messages)
    }

    func mergeAgentMailbox(_ exchanges: [InterAgentMessage]) {
        func iso(_ milliseconds: Double) -> String {
            ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: milliseconds / 1000))
        }

        func appendUnique(thread: String, message: ChatMessage) {
            if conversations[thread, default: []].contains(where: { $0.id == message.id }) { return }
            conversations[thread, default: []].append(message)
        }

        for exchange in exchanges {
            let createdAt = iso(exchange.createdAt)
            let incoming = ChatMessage(
                id: "mailbox:\(exchange.id):request",
                role: "assistant",
                content: "Task from \(exchange.sourceAgentName): \(exchange.task)",
                createdAt: createdAt,
                agentId: exchange.sourceAgentId,
                attachments: nil,
                sources: nil,
                generatedFiles: nil,
                delegated: true
            )
            appendUnique(thread: exchange.targetAgentId, message: incoming)

            if let reply = exchange.reply, !reply.isEmpty {
                let targetReply = ChatMessage(
                    id: "mailbox:\(exchange.id):reply",
                    role: "assistant",
                    content: reply,
                    createdAt: createdAt,
                    agentId: exchange.targetAgentId,
                    attachments: nil,
                    sources: nil,
                    generatedFiles: nil,
                    delegated: true
                )
                appendUnique(thread: exchange.targetAgentId, message: targetReply)

                let sourceReply = ChatMessage(
                    id: "mailbox:\(exchange.id):source-reply",
                    role: "assistant",
                    content: reply,
                    createdAt: createdAt,
                    agentId: exchange.targetAgentId,
                    attachments: nil,
                    sources: nil,
                    generatedFiles: nil,
                    delegated: true
                )
                appendUnique(thread: exchange.sourceAgentId, message: sourceReply)
            }
        }

        for key in conversations.keys {
            conversations[key]?.sort {
                ($0.createdAt ?? "") < ($1.createdAt ?? "")
            }
        }
    }

    func saveWorkspace() async throws {
        try await api.saveState(
            SaveStatePayload(
                workspaceId: workspaceId,
                agents: agents,
                conversations: conversations,
                teams: teams,
                archivedChats: archivedChats,
                onboarded: true
            )
        )
    }

    func createAgent(name: String, role: String, description: String, shape: Int, color: String) async {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty else { return }
        let agent = Agent(
            id: "ios-agent-\(UUID().uuidString)",
            name: cleanName,
            role: role.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "AI bot" : role,
            description: description,
            instructions: "Own your assigned role. Use your own bot name and collaborate with the main bot when useful.",
            avatar: "nova",
            avatarSeed: UUID().uuidString,
            avatarShape: shape,
            avatarColor: color,
            avatarMotion: Int.random(in: 0..<8),
            avatarVisualVersion: 6,
            state: "ready",
            canRenameSelf: true,
            isPrimary: false
        )
        agents.append(agent)
        conversations[agent.id] = []
        try? await saveWorkspace()
        selectAgent(agent)
    }

    func upload(data: Data, name: String, mimeType: String) async throws -> AttachmentRef {
        let file = try await api.uploadFile(data: data, name: name, mimeType: mimeType, workspaceId: workspaceId)
        mergeFiles([file])
        return AttachmentRef(id: file.id, name: file.name, type: file.type ?? mimeType, size: file.size)
    }

    func refreshFiles() async {
        if let result = try? await api.listFiles(workspaceId: workspaceId) { files = result.files }
    }

    func deleteFile(_ file: RipoFile) async {
        do {
            try await api.deleteFile(id: file.id)
            files.removeAll { $0.id == file.id }
        } catch { errorMessage = error.localizedDescription }
    }

    func refreshComputer() async {
        computerLive = (try? await api.computerLiveStatus()) ?? ComputerLiveState(active: false)
    }

    func startComputer(url: String) async {
        do { computerLive = try await api.startComputer(url: url) }
        catch { errorMessage = error.localizedDescription }
    }

    func navigateComputer(url: String) async {
        do {
            if computerLive.active {
                computerLive = try await api.computerAction(["kind": "navigate", "url": url])
            } else {
                computerLive = try await api.startComputer(url: url)
            }
        } catch { errorMessage = error.localizedDescription }
    }

    func stopComputer() async {
        do {
            try await api.closeComputer()
            computerLive = ComputerLiveState(active: false)
        } catch { errorMessage = error.localizedDescription }
    }

    func logout() async {
        await api.logout()
        KeychainStore.deleteToken()
        api.setToken(nil)
        authenticated = false
        account = nil
        agents = [.ripo]
        conversations = [:]
        files = []
        workspaces = []
        workspaceId = nil
        selectedAgentId = "ripo"
        selectedTab = .home
    }

    private func mergeFiles(_ incoming: [RipoFile]) {
        var byId = Dictionary(uniqueKeysWithValues: files.map { ($0.id, $0) })
        for file in incoming { byId[file.id] = file }
        files = Array(byId.values).sorted { ($0.createdAt ?? 0) > ($1.createdAt ?? 0) }
    }
}
