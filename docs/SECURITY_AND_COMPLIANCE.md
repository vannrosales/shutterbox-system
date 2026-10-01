# Desktop Security & Compliance Specification (Pure Tauri)

> **Scope**: Native IPC Security, Capability Scoping, Database Security, Code Signing, and Compliance for Pure Tauri Desktop Applications.

---

## 1. Zero Network Exposure & In-Memory IPC

### 1. Elimination of Network Attack Vectors
- Unlike web server or sidecar architectures, the **Pure Tauri Rust Backend** creates **zero TCP/UDP network sockets** and binds to **no local ports**.
- Inter-Process Communication (IPC) operates entirely in-memory using native OS message passing between Webview2/WKWebView and the compiled Rust executable.

### 2. IPC Command Security & Input Validation
- Rust strong typing and `serde` deserialization automatically enforce strict payload validation. Invalid or malformed JSON payloads sent from webview context are rejected before reaching business logic handlers.

---

## 2. Tauri 2.0 Capabilities & Permission Scoping

Tauri 2.0 gates native OS capabilities behind explicit granular JSON permission files located in `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability set for desktop app",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "notification:allow-notify"
  ]
}
```

---

## 3. Database Security & Parameterized Queries

### 1. SQL Injection Prevention
- All database queries executed via `sqlx` MUST use parameterized variable binding (`query("... WHERE id = ?").bind(id)`).
- Raw SQL string concatenation is strictly prohibited in code reviews and static analysis checks.

### 2. At-Rest File Security
- Database file `database.sqlite` is written to user application data directories (`%APPDATA%` on Windows, `~/Library/Application Support` on macOS) inheriting OS user-level ACLs.
- For high-security compliance requirements (e.g., HIPAA / GDPR PII), enable **SQLCipher** in `sqlx` for AES-256 database encryption at rest.

---

## 4. Code Signing & Distribution Compliance

### 1. Windows Code Signing (Authenticode / SignTool)
- **Purpose**: Eliminates Windows Defender SmartScreen untrusted binary prompts during installation.
- **Signing Command**:
  ```powershell
  signtool sign /f "CompanyCert.pfx" /p "CertPassword" /tr http://timestamp.digicert.com /td sha256 "src-tauri/target/release/bundle/nsis/*.exe"
  ```

### 2. macOS Code Signing & Apple Notarization
- **Purpose**: Passes macOS Gatekeeper checks ("App is signed by Apple-approved developer").
- **Requirements**:
  - `Developer ID Application` Certificate in Keychain.
  - Apple App-Specific Password for `xcrun notarytool`.
- **Automated Tauri Build Command**:
  ```bash
  APPLE_SIGNING_IDENTITY="Developer ID Application: Your Company (TEAMID)" \
  APPLE_ID="developer@company.com" \
  APPLE_PASSWORD="app-specific-password" \
  APPLE_TEAM_ID="TEAMID" \
  npm run tauri build
  ```
