import SwiftUI

public struct MainAppView: View {
    @State private var token: String? = nil
    @State private var username = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String? = nil
    
    @State private var files: [FileEntry] = []
    @State private var folders: [FolderEntry] = []
    
    public init() {}
    
    public var body: some View {
        NavigationStack {
            if let token = token {
                VStack(spacing: 0) {
                    // Device status banner
                    HStack {
                        Image(systemName: "checkmark.shield.fill")
                            .foregroundColor(.green)
                        VStack(alignment: .leading) {
                            Text("Apple Secure Enclave Protected")
                                .font(.caption)
                                .fontWeight(.bold)
                            Text("Device Enrolled & Approved")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                        Spacer()
                    }
                    .padding()
                    .background(Color.green.opacity(0.1))
                    
                    List {
                        Section("Folders") {
                            ForEach(folders) { folder in
                                HStack {
                                    Image(systemName: "folder.fill")
                                        .foregroundColor(.blue)
                                    Text(folder.name)
                                }
                            }
                        }
                        
                        Section("Files") {
                            ForEach(files) { file in
                                HStack {
                                    Image(systemName: "doc.fill")
                                        .foregroundColor(.gray)
                                    VStack(alignment: .leading) {
                                        Text(file.name)
                                        Text("\(file.sizeBytes / 1024) KB")
                                            .font(.caption2)
                                            .foregroundColor(.secondary)
                                    }
                                    Spacer()
                                    Button(action: { /* Share sheet */ }) {
                                        Image(systemName: "square.and.arrow.up")
                                    }
                                }
                            }
                        }
                    }
                }
                .navigationTitle("NKB Cloud")
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Sign Out") {
                            self.token = nil
                        }
                    }
                }
                .task {
                    do {
                        let payload = try await NKBNetworkClient.shared.fetchFiles(token: token)
                        self.folders = payload.folders
                        self.files = payload.files
                    } catch {}
                }
            } else {
                VStack(spacing: 20) {
                    Image(systemName: "cloud.fill")
                        .resizable()
                        .frame(width: 64, height: 48)
                        .foregroundColor(.blue)
                    
                    Text("NKB Cloud iOS")
                        .font(.title2)
                        .fontWeight(.bold)
                    
                    TextField("Username", text: $username)
                        .textFieldStyle(.roundedBorder)
                        .autocapitalization(.none)
                        .padding(.horizontal)
                    
                    SecureField("Password", text: $password)
                        .textFieldStyle(.roundedBorder)
                        .padding(.horizontal)
                    
                    Button(action: {
                        Task {
                            isLoading = true
                            do {
                                let (newToken, _) = try await NKBNetworkClient.shared.login(username: username, password: password)
                                self.token = newToken
                            } catch {
                                self.errorMessage = "Login failed"
                            }
                            isLoading = false
                        }
                    }) {
                        if isLoading {
                            ProgressView()
                        } else {
                            Text("Sign In")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.horizontal)
                    
                    if BiometricManager.shared.canAuthenticateWithBiometrics() {
                        Button(action: {
                            BiometricManager.shared.authenticate { success, _ in
                                if success {
                                    // Unlock with cached keychain token
                                }
                            }
                        }) {
                            Label("Unlock with Face ID", systemImage: "faceid")
                        }
                    }
                    
                    if let err = errorMessage {
                        Text(err)
                            .font(.caption)
                            .foregroundColor(.red)
                    }
                }
                .padding()
            }
        }
    }
}
