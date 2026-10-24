import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showingCreate = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    HStack {
                        RipoBrandView(size: 38)
                        Spacer()
                        Button {
                            showingCreate = true
                        } label: {
                            Image(systemName: "plus")
                                .font(.headline)
                                .frame(width: 38, height: 38)
                        }
                        .buttonStyle(.glass)
                    }

                    VStack(alignment: .leading, spacing: 5) {
                        Text("Your bot team")
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                            .tracking(-1.2)
                        Text("Message one bot, or let Ripo Bot bring specialists into the task automatically.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 19) {
                            ForEach(store.agents.prefix(8)) { agent in
                                Button {
                                    store.selectAgent(agent)
                                } label: {
                                    VStack(spacing: 9) {
                                        RipoAvatarView(agent: agent, size: 72)
                                        Text(agent.name)
                                            .font(.caption.weight(.semibold))
                                            .foregroundStyle(.primary)
                                            .lineLimit(1)
                                        Text(agent.role)
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }
                                    .frame(width: 92)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, 4)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Bots")
                            .font(.headline)
                        ForEach(store.agents) { agent in
                            Button {
                                store.selectAgent(agent)
                            } label: {
                                HStack(spacing: 13) {
                                    RipoAvatarView(agent: agent, size: 48)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(agent.name)
                                            .font(.body.weight(.semibold))
                                        Text(agent.description ?? agent.role)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(2)
                                    }
                                    Spacer()
                                    if agent.state != nil && agent.state != "ready" {
                                        ProgressView().controlSize(.small)
                                    } else {
                                        Image(systemName: "chevron.right")
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(.tertiary)
                                    }
                                }
                                .padding(12)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 22))
                        }
                    }
                }
                .padding(18)
                .padding(.bottom, 18)
            }
            .background(Color(.systemGroupedBackground).opacity(0.25))
            .navigationBarHidden(true)
            .sheet(isPresented: $showingCreate) {
                CreateAgentView()
                    .presentationDetents([.large])
            }
        }
    }
}

struct CreateAgentView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var role = ""
    @State private var description = ""
    @State private var shape = 2
    @State private var color = "#168CF7"

    private let colors = ["#111111", "#168CF7", "#11C58C", "#FF7A18", "#F42F8F", "#EF3F49", "#7B5CF2", "#11B9B0"]

    var preview: Agent {
        Agent(
            id: "preview", name: name.isEmpty ? "New Bot" : name,
            role: role.isEmpty ? "AI bot" : role, description: description,
            instructions: nil, avatar: nil, avatarSeed: "preview", avatarShape: shape,
            avatarColor: color, avatarMotion: 0, avatarVisualVersion: 6,
            state: "ready", canRenameSelf: true, isPrimary: false
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    RipoAvatarView(agent: preview, size: 118)
                        .padding(.top, 10)

                    VStack(spacing: 12) {
                        TextField("Bot name", text: $name)
                            .padding(.horizontal, 16)
                            .frame(height: 52)
                            .glassEffect(.regular, in: .rect(cornerRadius: 18))
                        TextField("Role", text: $role)
                            .padding(.horizontal, 16)
                            .frame(height: 52)
                            .glassEffect(.regular, in: .rect(cornerRadius: 18))
                        TextField("What is this bot best at?", text: $description, axis: .vertical)
                            .lineLimit(2...4)
                            .padding(16)
                            .glassEffect(.regular, in: .rect(cornerRadius: 18))
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Shape").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 4), spacing: 10) {
                            ForEach(0..<8, id: \.self) { index in
                                Button {
                                    withAnimation(.spring(response: 0.28, dampingFraction: 0.75)) { shape = index }
                                } label: {
                                    RipoAvatarView(
                                        agent: Agent(id: "shape-\(index)", name: "", role: "", description: nil, instructions: nil, avatar: nil, avatarSeed: nil, avatarShape: index, avatarColor: color, avatarMotion: 0, avatarVisualVersion: 6, state: nil, canRenameSelf: nil, isPrimary: nil),
                                        size: 43
                                    )
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 10)
                                }
                                .buttonStyle(.glass(shape == index ? .regular.tint(.primary.opacity(0.14)) : .clear))
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Color").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        HStack {
                            ForEach(colors, id: \.self) { item in
                                Button {
                                    color = item
                                } label: {
                                    Circle()
                                        .fill(Color(hex: item))
                                        .frame(width: 30, height: 30)
                                        .overlay {
                                            if color == item {
                                                Circle().stroke(.primary, lineWidth: 2).padding(-4)
                                            }
                                        }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    Button {
                        Task {
                            await store.createAgent(name: name, role: role, description: description, shape: shape, color: color)
                            dismiss()
                        }
                    } label: {
                        Text("Create Bot")
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                    }
                    .buttonStyle(.glassProminent)
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding(18)
            }
            .navigationTitle("Create Bot")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}
