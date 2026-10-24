import SwiftUI

struct RootView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        TabView(selection: $store.selectedTab) {
            Tab("Home", systemImage: "house.fill", value: RootTab.home) {
                HomeView()
            }
            Tab("Chat", systemImage: "message.fill", value: RootTab.chat) {
                ChatView()
            }
            Tab("Computer", systemImage: "macwindow", value: RootTab.computer) {
                ComputerView()
            }
            Tab("Files", systemImage: "folder.fill", value: RootTab.files) {
                FilesView()
            }
            Tab("Settings", systemImage: "gearshape.fill", value: RootTab.settings) {
                SettingsView()
            }
        }
        .tint(.primary)
    }
}
