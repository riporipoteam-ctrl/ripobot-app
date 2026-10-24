import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct FilesView: View {
    @EnvironmentObject private var store: AppStore
    @State private var photos: [PhotosPickerItem] = []
    @State private var showingImporter = false
    @State private var uploading = false

    var body: some View {
        NavigationStack {
            List {
                if store.files.isEmpty {
                    ContentUnavailableView(
                        "No files yet",
                        systemImage: "folder",
                        description: Text("Upload images, documents, or code. Bots can read supported files and use images as context.")
                    )
                    .listRowBackground(Color.clear)
                } else {
                    ForEach(store.files) { file in
                        HStack(spacing: 12) {
                            if (file.type ?? "").hasPrefix("image/") {
                                SecureFileThumbnail(file: file)
                                    .frame(width: 54, height: 54)
                                    .clipped()
                            } else {
                                Image(systemName: fileIcon(file))
                                    .font(.title3)
                                    .frame(width: 54, height: 54)
                                    .background(Color(.secondarySystemBackground))
                                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            }
                            VStack(alignment: .leading, spacing: 3) {
                                Text(file.name)
                                    .font(.subheadline.weight(.semibold))
                                    .lineLimit(1)
                                Text(fileSubtitle(file))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .swipeActions {
                            Button(role: .destructive) {
                                Task { await store.deleteFile(file) }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
            }
            .listStyle(.plain)
            .navigationTitle("Files")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        PhotosPicker(selection: $photos, maxSelectionCount: 8, matching: .images) {
                            Label("Photo Library", systemImage: "photo.on.rectangle")
                        }
                        Button {
                            showingImporter = true
                        } label: {
                            Label("Files", systemImage: "folder")
                        }
                    } label: {
                        if uploading { ProgressView() }
                        else { Image(systemName: "plus") }
                    }
                }
            }
            .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
                Task { await importFiles(result) }
            }
            .onChange(of: photos) {
                Task { await importPhotos() }
            }
            .refreshable { await store.refreshFiles() }
        }
    }

    private func importPhotos() async {
        guard !photos.isEmpty else { return }
        uploading = true
        defer {
            photos = []
            uploading = false
        }
        for item in photos {
            do {
                guard let data = try await item.loadTransferable(type: Data.self) else { continue }
                let type = item.supportedContentTypes.first ?? .jpeg
                let ext = type.preferredFilenameExtension ?? "jpg"
                _ = try await store.upload(data: data, name: "image-\(UUID().uuidString).\(ext)", mimeType: type.preferredMIMEType ?? "image/jpeg")
            } catch {
                store.errorMessage = error.localizedDescription
            }
        }
    }

    private func importFiles(_ result: Result<[URL], Error>) async {
        do {
            let urls = try result.get()
            uploading = true
            defer { uploading = false }
            for url in urls {
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                let data = try Data(contentsOf: url)
                let values = try? url.resourceValues(forKeys: [.contentTypeKey])
                _ = try await store.upload(
                    data: data,
                    name: url.lastPathComponent,
                    mimeType: values?.contentType?.preferredMIMEType ?? "application/octet-stream"
                )
            }
        } catch {
            store.errorMessage = error.localizedDescription
        }
    }

    private func fileIcon(_ file: RipoFile) -> String {
        let type = file.type ?? ""
        if type.contains("pdf") { return "doc.richtext" }
        if type.hasPrefix("text/") || file.name.hasSuffix(".md") || file.name.hasSuffix(".txt") { return "doc.text" }
        if type.contains("zip") { return "archivebox" }
        return "doc"
    }

    private func fileSubtitle(_ file: RipoFile) -> String {
        let bytes = file.size ?? 0
        let size = ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
        return "\(size) · \(file.type ?? "file")"
    }
}
