# Desktop Security & Compliance Specification (macOS & Windows)

> **Scope**: Security Architecture, Capabilities Model, macOS Apple Notarization, Windows Authenticode, and Data Protection for Pure Tauri Applications.

---

## 1. Network & Operating System Isolation

### 1. In-Memory IPC Bridge
- The application creates **zero open TCP/UDP ports**.
- All frontend-to-backend communication executes via native OS IPC bindings in memory (WKWebView message handlers on macOS and Edge IPC on Windows).

### 2. Operating System Sandboxing & File Permissions
- **macOS Sandboxing**: Application data (SQLite database, app preferences, logs) is strictly confined to `~/Library/Application Support/com.shutterbox.system/`.
- **Windows File ACLs**: Database is restricted to user profile `%APPDATA%\com.shutterbox.system\`.

---

## 2. macOS Apple Code Signing & Notarization Pipeline

### Requirements for macOS Distribution
To prevent macOS Gatekeeper warnings (*"App cannot be opened because it is from an unidentified developer"*), all production macOS desktop builds (`.app` / `.dmg`) must be signed and notarized by Apple.

### Prerequisites
1. **Apple Developer Account**: Enrolled in the Apple Developer Program.
2. **Certificates**:
   - `Developer ID Application` certificate installed in macOS Keychain.
3. **App-Specific Password**: Generated at [appleid.apple.com](https://appleid.apple.com).

### Automated Build & Notarization Pipeline (`CI / CD`)

```bash
# Set environment variables for macOS signing and notarization
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Company Name (TEAMID123)"
export APPLE_ID="developer@company.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx" # App-Specific Password
export APPLE_TEAM_ID="TEAMID123"

# Run Tauri build with automatic Apple notarization
npm run tauri build -- --target universal-apple-darwin
```

### Manual Verification of macOS Package
```bash
# 1. Verify Code Signature
codesign --verify --deep --strict --verbose=2 "src-tauri/target/release/bundle/macos/Shutterbox System.app"

# 2. Verify Gatekeeper Acceptance
spctl --assess --type execute --verbose=4 "src-tauri/target/release/bundle/macos/Shutterbox System.app"
```

---

## 3. Windows Code Signing (Authenticode / SignTool)

### Signing Command
```powershell
signtool sign /f "CompanyCert.pfx" /p "CertPassword" /tr http://timestamp.digicert.com /td sha256 "src-tauri/target/release/bundle/nsis/*.exe"
```

---

## 4. Data Security & Encryption at Rest

1. **SQL Injection Protection**: All SQLite database operations in Rust use parameterized queries via `sqlx` (`sqlx::query("... WHERE id = ?").bind(id)`).
2. **At-Rest Encryption**: Standard SQLite database can be upgraded to **SQLCipher** for AES-256 transparent database file encryption if processing sensitive PII.
