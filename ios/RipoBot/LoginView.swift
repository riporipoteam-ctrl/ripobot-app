import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var store: AppStore
    @State private var mode = 0
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(.systemBackground), Color(.systemGray6).opacity(0.78)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            Circle()
                .fill(.blue.opacity(0.10))
                .frame(width: 330, height: 330)
                .blur(radius: 80)
                .offset(x: 150, y: -280)

            VStack(spacing: 28) {
                Spacer()
                RipoBrandView(size: 74)

                VStack(spacing: 7) {
                    Text(mode == 0 ? "Welcome back" : "Build your bot team")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .tracking(-1.3)
                    Text("Your bots, files, computer, and chats sync with the web app.")
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .font(.subheadline)
                }

                GlassEffectContainer(spacing: 14) {
                    VStack(spacing: 13) {
                        Picker("Mode", selection: $mode) {
                            Text("Log in").tag(0)
                            Text("Sign up").tag(1)
                        }
                        .pickerStyle(.segmented)

                        if mode == 1 {
                            TextField("Name", text: $name)
                                .textContentType(.name)
                                .padding(.horizontal, 16)
                                .frame(height: 52)
                                .glassEffect(.regular, in: .rect(cornerRadius: 18))
                        }

                        TextField("Email", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding(.horizontal, 16)
                            .frame(height: 52)
                            .glassEffect(.regular, in: .rect(cornerRadius: 18))

                        SecureField("Password", text: $password)
                            .textContentType(mode == 0 ? .password : .newPassword)
                            .padding(.horizontal, 16)
                            .frame(height: 52)
                            .glassEffect(.regular, in: .rect(cornerRadius: 18))

                        Button {
                            Task {
                                if mode == 0 {
                                    await store.login(email: email, password: password)
                                } else {
                                    await store.register(name: name, email: email, password: password)
                                }
                            }
                        } label: {
                            HStack {
                                if store.loading { ProgressView().controlSize(.small) }
                                Text(mode == 0 ? "Log In" : "Create Account")
                                    .frame(maxWidth: .infinity)
                            }
                            .frame(height: 48)
                        }
                        .buttonStyle(.glassProminent)
                        .disabled(email.isEmpty || password.count < 8 || (mode == 1 && name.trimmingCharacters(in: .whitespaces).isEmpty))
                    }
                }
                .padding(.horizontal, 22)

                Spacer()
                Text("Ripo Bot connects securely to your existing cloud workspace.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .padding(.bottom, 12)
            }
            .padding(.horizontal, 18)
        }
    }
}
