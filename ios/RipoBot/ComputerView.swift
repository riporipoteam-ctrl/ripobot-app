import SwiftUI
import WebKit

struct LiveBrowserWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.allowsInlineMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.backgroundColor = .clear
        return view
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if webView.url?.absoluteString != url.absoluteString {
            webView.load(URLRequest(url: url))
        }
    }
}

struct ComputerView: View {
    @EnvironmentObject private var store: AppStore
    @State private var address = "https://www.google.com"
    @State private var busy = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                GlassEffectContainer(spacing: 8) {
                    HStack(spacing: 8) {
                        HStack(spacing: 7) {
                            Circle()
                                .fill(store.computerLive.active ? Color.green : Color.secondary)
                                .frame(width: 7, height: 7)
                            TextField("Website", text: $address)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .keyboardType(.URL)
                                .submitLabel(.go)
                                .onSubmit { navigate() }
                        }
                        .padding(.horizontal, 13)
                        .frame(height: 46)
                        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 18))

                        Button {
                            navigate()
                        } label: {
                            if busy { ProgressView().frame(width: 38, height: 38) }
                            else { Image(systemName: store.computerLive.active ? "arrow.right" : "play.fill").frame(width: 38, height: 38) }
                        }
                        .buttonStyle(.glassProminent)

                        if store.computerLive.active {
                            Button {
                                Task {
                                    busy = true
                                    await store.stopComputer()
                                    busy = false
                                }
                            } label: {
                                Image(systemName: "xmark").frame(width: 38, height: 38)
                            }
                            .buttonStyle(.glass)
                        }
                    }
                }
                .padding(.horizontal, 12)

                Group {
                    if store.computerLive.active,
                       let string = store.computerLive.liveViewUrl,
                       let url = URL(string: string) {
                        LiveBrowserWebView(url: url)
                            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                            .overlay(alignment: .topLeading) {
                                HStack(spacing: 5) {
                                    Circle().fill(.green).frame(width: 6, height: 6)
                                    Text("LIVE")
                                        .font(.caption2.bold())
                                }
                                .padding(.horizontal, 9)
                                .frame(height: 26)
                                .glassEffect(.regular, in: .capsule)
                                .padding(9)
                            }
                    } else {
                        VStack(spacing: 16) {
                            RipoAvatarView(agent: Agent.ripo, size: 90)
                            Text("Real bot computer")
                                .font(.title2.bold())
                            Text("Ask a bot to open a site, or start one here. This screen connects to the same Cloudflare Browser Run session the bot clicks and types in.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 34)
                            Button {
                                navigate()
                            } label: {
                                Label("Start Live Browser", systemImage: "macwindow")
                            }
                            .buttonStyle(.glassProminent)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
                .background(Color(.secondarySystemBackground).opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .padding(.horizontal, 10)
            }
            .padding(.top, 7)
            .navigationTitle("Computer")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        Task { await store.refreshComputer() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    if store.computerLive.active,
                       let value = store.computerLive.liveViewUrl,
                       let url = URL(string: value) {
                        Link(destination: url) {
                            Image(systemName: "arrow.up.right.square")
                        }
                    }
                }
            }
            .task {
                await store.refreshComputer()
                if let value = store.computerLive.url, value.hasPrefix("http") { address = value }
            }
            .onChange(of: store.computerLive.url) {
                if let value = store.computerLive.url, value.hasPrefix("http") { address = value }
            }
        }
    }

    private func navigate() {
        Task {
            busy = true
            await store.navigateComputer(url: address)
            busy = false
        }
    }
}
