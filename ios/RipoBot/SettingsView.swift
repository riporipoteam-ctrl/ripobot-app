import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 13) {
                        RipoAvatarView(agent: Agent.ripo, size: 48)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(store.account?.user.name ?? "Ripo Bot user")
                                .font(.headline)
                            Text(store.account?.user.email ?? "")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 5)
                }

                Section("Plan") {
                    LabeledContent("Plan", value: (store.account?.plan ?? "free").capitalized)
                    LabeledContent("Ripo Coins", value: "\(store.account?.coins ?? 0)")
                }

                Section("Workspace") {
                    LabeledContent("Workspace", value: currentWorkspaceName)
                    LabeledContent("Bots", value: "\(store.agents.count)")
                    LabeledContent("Files", value: "\(store.files.count)")
                }

                Section("Native app") {
                    HStack {
                        Label("Liquid Glass", systemImage: "circle.hexagongrid.fill")
                        Spacer()
                        Text("Native")
                            .foregroundStyle(.secondary)
                    }
                    HStack {
                        Label("Backend", systemImage: "cloud.fill")
                        Spacer()
                        Text("Same as web")
                            .foregroundStyle(.secondary)
                    }
                    HStack {
                        Label("Build", systemImage: "hammer.fill")
                        Spacer()
                        Text("1.0 (1)")
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    Button(role: .destructive) {
                        Task { await store.logout() }
                    } label: {
                        Label("Log Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }

    private var currentWorkspaceName: String {
        guard let id = store.workspaceId else { return "My Workspace" }
        return store.workspaces.first(where: { $0.id == id })?.name ?? "My Workspace"
    }
}
