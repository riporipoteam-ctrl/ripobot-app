import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import UIKit

struct ChatView: View {
    @EnvironmentObject private var store: AppStore
    @State private var draft = ""
    @State private var attachments: [AttachmentRef] = []
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showingImporter = false
    @State private var showingWorkspaceFiles = false
    @State private var showingVoice = false
    @State private var uploadBusy = false

    private var agent: Agent { store.selectedAgent }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 11) {
                        if store.messages.isEmpty {
                            VStack(spacing: 14) {
                                RipoAvatarView(agent: agent, size: 94)
                                Text(agent.name)
                                    .font(.system(size: 30, weight: .bold, design: .rounded))
                                Text(agent.description ?? agent.role)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .multilineTextAlignment(.center)
                            }
                            .padding(.top, 80)
                            .padding(.horizontal, 28)
                        }

                        ForEach(store.messages) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }

                        if store.sending {
                            HStack {
                                ProgressView()
                                    .controlSize(.small)
                                Text("\(agent.name) is working…")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Spacer()
                            }
                            .padding(.horizontal, 8)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.top, 12)
                    .padding(.bottom, 12)
                }
                .onChange(of: store.messages.count) {
                    if let last = store.messages.last?.id {
                        withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo(last, anchor: .bottom) }
                    }
                }
            }
            .navigationTitle(agent.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Button {
                        store.selectedTab = .home
                    } label: {
                        HStack(spacing: 8) {
                            RipoAvatarView(agent: agent, size: 30)
                            VStack(alignment: .leading, spacing: 0) {
                                Text(agent.name).font(.subheadline.weight(.semibold))
                                Text(agent.role).font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .safeAreaInset(edge: .bottom) {
                composer
                    .padding(.horizontal, 10)
                    .padding(.bottom, 5)
            }
            .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
                Task { await importFiles(result) }
            }
            .sheet(isPresented: $showingWorkspaceFiles) {
                WorkspaceAttachmentPicker(attachments: $attachments)
                    .presentationDetents([.medium, .large])
            }
            .fullScreenCover(isPresented: $showingVoice) {
                VoiceCallView()
            }
            .onChange(of: photoItems) {
                Task { await importPhotos() }
            }
        }
    }

    private var composer: some View {
        GlassEffectContainer(spacing: 10) {
            VStack(spacing: 7) {
                if !attachments.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(attachments) { file in
                                HStack(spacing: 5) {
                                    Image(systemName: file.type.hasPrefix("image/") ? "photo" : "doc")
                                    Text(file.name).lineLimit(1)
                                    Button {
                                        attachments.removeAll { $0.id == file.id }
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                    }
                                    .buttonStyle(.plain)
                                }
                                .font(.caption2)
                                .padding(.horizontal, 9)
                                .frame(height: 30)
                                .glassEffect(.regular, in: .capsule)
                            }
                        }
                    }
                }

                HStack(alignment: .bottom, spacing: 8) {
                    Menu {
                        PhotosPicker(selection: $photoItems, maxSelectionCount: 4, matching: .images) {
                            Label("Photo Library", systemImage: "photo.on.rectangle")
                        }
                        Button {
                            showingImporter = true
                        } label: {
                            Label("Files", systemImage: "folder")
                        }
                        Button {
                            showingWorkspaceFiles = true
                        } label: {
                            Label("Workspace Files", systemImage: "tray.full")
                        }
                    } label: {
                        if uploadBusy {
                            ProgressView().frame(width: 40, height: 40)
                        } else {
                            Image(systemName: "plus")
                                .font(.headline)
                                .frame(width: 40, height: 40)
                        }
                    }
                    .buttonStyle(.glass)

                    HStack(alignment: .bottom, spacing: 8) {
                        TextField("Ask \(agent.name)", text: $draft, axis: .vertical)
                            .lineLimit(1...6)
                            .padding(.leading, 8)
                            .padding(.vertical, 10)

                        if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Button {
                                showingVoice = true
                            } label: {
                                Image(systemName: "mic.fill")
                                    .frame(width: 36, height: 36)
                            }
                            .buttonStyle(.glass)
                        } else {
                            Button {
                                send()
                            } label: {
                                Image(systemName: "arrow.up")
                                    .font(.headline)
                                    .frame(width: 36, height: 36)
                            }
                            .buttonStyle(.glassProminent)
                            .disabled(store.sending)
                        }
                    }
                    .padding(.horizontal, 4)
                    .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 24))
                }
            }
        }
    }

    private func send() {
        let value = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        let selected = attachments
        draft = ""
        attachments = []
        Task { await store.send(value, attachments: selected) }
    }

    private func importPhotos() async {
        guard !photoItems.isEmpty else { return }
        uploadBusy = true
        defer {
            uploadBusy = false
            photoItems = []
        }
        for item in photoItems {
            do {
                guard let data = try await item.loadTransferable(type: Data.self) else { continue }
                let type = item.supportedContentTypes.first ?? .jpeg
                let mime = type.preferredMIMEType ?? "image/jpeg"
                let ext = type.preferredFilenameExtension ?? "jpg"
                let ref = try await store.upload(data: data, name: "photo-\(UUID().uuidString).\(ext)", mimeType: mime)
                attachments.append(ref)
            } catch {
                store.errorMessage = error.localizedDescription
            }
        }
    }

    private func importFiles(_ result: Result<[URL], Error>) async {
        do {
            let urls = try result.get()
            uploadBusy = true
            defer { uploadBusy = false }
            for url in urls {
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                let data = try Data(contentsOf: url)
                let values = try? url.resourceValues(forKeys: [.contentTypeKey])
                let mime = values?.contentType?.preferredMIMEType ?? "application/octet-stream"
                let ref = try await store.upload(data: data, name: url.lastPathComponent, mimeType: mime)
                attachments.append(ref)
            }
        } catch {
            store.errorMessage = error.localizedDescription
        }
    }
}

struct MessageBubble: View {
    @EnvironmentObject private var store: AppStore
    let message: ChatMessage

    var author: Agent? {
        guard message.role != "user", let id = message.agentId else { return nil }
        return store.agents.first { $0.id == id }
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 7) {
            if message.role == "user" { Spacer(minLength: 52) }

            if message.role != "user", let author {
                RipoAvatarView(agent: author, size: 28)
                    .padding(.bottom, 2)
            }

            VStack(alignment: message.role == "user" ? .trailing : .leading, spacing: 4) {
                if let author {
                    HStack(spacing: 5) {
                        Text(author.name).font(.caption.weight(.semibold))
                        Text(author.role).font(.caption2).foregroundStyle(.tertiary)
                    }
                    .padding(.horizontal, 5)
                }

                Text(message.content)
                    .font(.body)
                    .textSelection(.enabled)
                    .padding(.horizontal, 13)
                    .padding(.vertical, 10)
                    .foregroundStyle(message.role == "user" ? .white : .primary)
                    .background(message.role == "user" ? Color.black : Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                if let attachments = message.attachments, !attachments.isEmpty {
                    HStack(spacing: 5) {
                        Image(systemName: "paperclip")
                        Text("\(attachments.count) attachment\(attachments.count == 1 ? "" : "s")")
                    }
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 5)
                }

                if let generated = message.generatedFiles {
                    ForEach(generated) { file in
                        SecureFileThumbnail(file: file)
                            .frame(maxWidth: 260)
                    }
                }
            }

            if message.role != "user" { Spacer(minLength: 38) }
        }
    }
}

struct WorkspaceAttachmentPicker: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @Binding var attachments: [AttachmentRef]

    var body: some View {
        NavigationStack {
            List(store.files) { file in
                Button {
                    let type = file.type ?? "application/octet-stream"
                    if !attachments.contains(where: { $0.id == file.id }) {
                        attachments.append(AttachmentRef(id: file.id, name: file.name, type: type, size: file.size))
                    }
                    dismiss()
                } label: {
                    Label(file.name, systemImage: (file.type ?? "").hasPrefix("image/") ? "photo" : "doc")
                }
            }
            .navigationTitle("Workspace Files")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}

struct SecureFileThumbnail: View {
    let file: RipoFile
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            } else {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color(.secondarySystemBackground))
                    .frame(height: 120)
                    .overlay { ProgressView() }
            }
        }
        .task(id: file.id) {
            guard (file.type ?? "").hasPrefix("image/") else { return }
            if let data = try? await APIClient.shared.fileData(id: file.id) {
                image = UIImage(data: data)
            }
        }
    }
}

struct VoiceCallView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @StateObject private var voice = VoiceTurnService()
    @State private var lastTranscript = ""

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(.systemBackground), Color(.systemGray6)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            VStack(spacing: 22) {
                HStack {
                    Button {
                        voice.stopAll()
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .frame(width: 42, height: 42)
                    }
                    .buttonStyle(.glass)
                    Spacer()
                    Text("Voice with \(store.selectedAgent.name)")
                        .font(.headline)
                    Spacer()
                    Color.clear.frame(width: 42, height: 42)
                }

                Spacer()

                RipoAvatarView(agent: store.selectedAgent, size: 132)
                    .scaleEffect(voice.recording ? 1 + CGFloat(voice.level) * 0.07 : 1)
                    .animation(.easeOut(duration: 0.08), value: voice.level)

                VStack(spacing: 5) {
                    Text(voice.recording ? "Listening…" : voice.busy ? "Understanding…" : store.selectedAgent.name)
                        .font(.title2.bold())
                    Text(lastTranscript.isEmpty ? "Tap the microphone and speak naturally." : lastTranscript)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .lineLimit(4)
                }
                .padding(.horizontal, 34)

                Spacer()

                Button {
                    Task {
                        do {
                            if voice.recording {
                                let text = try await voice.stopAndTranscribe()
                                lastTranscript = text
                                let oldCount = store.messages.count
                                await store.send(text)
                                if store.messages.count > oldCount,
                                   let reply = store.messages.last(where: { $0.role == "assistant" })?.content {
                                    await voice.speak(reply)
                                }
                            } else {
                                try await voice.start()
                            }
                        } catch {
                            store.errorMessage = error.localizedDescription
                        }
                    }
                } label: {
                    Image(systemName: voice.recording ? "stop.fill" : "mic.fill")
                        .font(.system(size: 28, weight: .semibold))
                        .frame(width: 78, height: 78)
                }
                .buttonStyle(.glassProminent)
                .disabled(voice.busy || store.sending)

                Text("Leaving this screen stops the microphone and audio session.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .padding(.bottom, 18)
            }
            .padding(18)
        }
        .onDisappear { voice.stopAll() }
    }
}
