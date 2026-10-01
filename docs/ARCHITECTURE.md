# Pure Tauri (Rust) + React (TypeScript) + SQLite Architecture

> **Project Target**: High-Performance Cross-Platform Desktop Application (Windows & macOS)  
> **Architecture Style**: Pure Tauri Native Architecture (No Sidecar / No Local HTTP Server)  
> **Core Tech Stack**: Tauri 2.0 (Rust 2021 Backend) + React 19 (TypeScript UI) + Embedded SQLite (SQLx / Rusqlite)  

---

## 1. Executive Summary & Architectural Shift

By adopting a **Pure Tauri (Rust) Backend**, we eliminate external runtimes (such as PHP, Node.js, or Electron), resulting in:
- **Instant Cold Starts**: App launches in **< 100 milliseconds**.
- **Minimal Memory Footprint**: Runs at **~20MB–40MB RAM** total (utilizing OS-native webviews: WebView2 on Windows, WKWebView on macOS).
- **Tiny Bundle Size**: Production installer sizes under **15MB–25MB**.
- **Direct IPC Data Transfer**: Communication between React UI and Rust backend happens via high-speed native Inter-Process Communication (IPC), bypassing TCP/HTTP overhead entirely.

---

## 2. System Architecture Diagram

```mermaid
flowchart TD
    subgraph Desktop Webview UI [React 19 + TypeScript Frontend]
        UI[React Components / UI Layer] -->|invoke('command_name')| IPC[Tauri IPC Bridge]
        IPC -->|JSON Response| UI
    end

    subgraph Native Desktop Host [Tauri 2.0 / Rust Core]
        IPC <--> Handlers[Rust Command Handlers async]
        Handlers --> AppState[Tauri App State Pool Manager]
        AppState --> DBEngine[SQLx Async Connection Pool]
    end

    subgraph Native Storage Layer [OS User Application Data]
        DBEngine <-->|Zero-Copy SQL Queries| SQLite[(database.sqlite)]
    end
```

---

## 3. Layer Breakdown & Responsibilities

### Layer 1: Native Rust Backend Core (`src-tauri/`)
- **Application Host (`lib.rs` / `main.rs`)**: Initializes Tauri 2.0 runtime, window management, system tray, menus, native file dialogs, and OS notifications.
- **IPC Command Handlers**: Rust functions annotated with `#[tauri::command]` that handle application business logic asynchronously using `tokio`.
- **Database Connection Manager**: Manages an async `sqlx::SqlitePool` injected into Tauri state via `.manage()`. Runs automated embedded SQL schema migrations on app launch.
- **Data Models & Serde**: Rust `struct` definitions implementing `serde::Serialize` and `serde::Deserialize` for type-safe JSON serialization over the IPC bridge.

### Layer 2: Desktop Frontend (`resources/js/` or `src/`)
- **Framework & Language**: React 19 with strict TypeScript (`tsconfig.json`).
- **UI Components & Styling**: Tailwind CSS v4 + Radix UI primitives.
- **Data Fetching & State**: Invokes Rust backend using `@tauri-apps/api/core` `invoke()`. Managed via custom hooks or `TanStack Query (React Query)`.

### Layer 3: Embedded SQLite Database
- **Engine**: Pure Rust embedded SQLite (via `sqlx` or `rusqlite`).
- **Database Location**: Single `database.sqlite` file residing in OS-standard user application data directories:
  - **Windows**: `%APPDATA%\com.shutterbox.system\database.sqlite`
  - **macOS**: `~/Library/Application Support/com.shutterbox.system/database.sqlite`

---

## 4. Native IPC Protocol vs Traditional HTTP

| Specification | Traditional HTTP Server Architecture | Pure Tauri IPC Architecture |
| :--- | :--- | :--- |
| **Transport Medium** | TCP Loopback Socket (`127.0.0.1:8000`) | Native In-Memory IPC Bridge |
| **Server Requirement** | Background PHP / Node process required | **Zero external processes** |
| **Request Latency** | ~2ms - 15ms per request | **< 0.2ms per call** |
| **Security Risk** | Port binding risk / local network sniffing | **Zero network footprint (No open ports)** |
| **Type Safety** | Requires REST API contracts / OpenAPI | Shared TypeScript interfaces matching Rust structs |

---

## 5. Cross-Platform Specifications (Windows vs macOS)

| Component | Windows 10/11 (x64 / ARM64) | macOS 12+ (Intel & Apple Silicon) |
| :--- | :--- | :--- |
| **Web View Engine** | Microsoft Edge WebView2 | Apple WKWebView |
| **Rust Toolchain** | `stable-x86_64-pc-windows-msvc` | `stable-aarch64-apple-darwin` / `x86_64` |
| **App Data Path** | `%APPDATA%\com.shutterbox.system\` | `~/Library/Application Support/com.shutterbox.system/` |
| **Installer Bundle** | NSIS Installer (`.exe`) / `.msi` | `.dmg` Installer / `.app` Bundle |
| **Code Signing** | SignTool (Authenticode) | Apple Developer ID + Notarization (`gon`) |
