import SwiftUI

@main
struct RipoBotApp: App {
    @StateObject private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            Group {
                if store.loading && !store.authenticated {
                    ZStack {
                        Color(.systemBackground).ignoresSafeArea()
                        VStack(spacing: 18) {
                            RipoBrandView(size: 64)
                            ProgressView()
                        }
                    }
                } else if store.authenticated {
                    RootView()
                } else {
                    LoginView()
                }
            }
            .environmentObject(store)
            .task {
                if store.loading {
                    await store.bootstrap()
                }
            }
            .alert("Ripo Bot", isPresented: Binding(
                get: { store.errorMessage != nil },
                set: { if !$0 { store.errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) { store.errorMessage = nil }
            } message: {
                Text(store.errorMessage ?? "")
            }
        }
    }
}
