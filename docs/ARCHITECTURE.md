# Pure Tauri (Rust) + React (TypeScript) + SQLite Architecture

> **Project Target**: High-Performance Native Desktop Application for **macOS** (Apple Silicon & Intel) & **Windows** (10/11)  
> **Architecture Style**: Pure Tauri Native Architecture (No Sidecar / No Local HTTP Server)  
> **Core Tech Stack**: Tauri 2.0 (Rust 2021 Backend) + React 19 (TypeScript UI) + Embedded SQLite (SQLx / Rusqlite)  

---

## 1. Executive Summary & Architectural Shift

By adopting a **Pure Tauri (Rust) Backend**, we eliminate external runtimes (such as PHP, Node.js, or Electron), delivering a native desktop experience tailored specifically for **macOS (macOS 12+ Monterey to macOS 15+ Sequoia)** and **Windows 10/11**:
- **Instant Cold Starts**: App launches in **< 100 milliseconds** on Apple Silicon (M1/M2/M3/M4) and Windows.
- **Minimal Memory Footprint**: Runs at **~20MB–40MB RAM** total (utilizing Apple WKWebView on macOS and WebView2 on Windows).
- **Tiny Universal Bundle Size**: Production `.dmg` / `.app` bundles under **15MB–25MB**.
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
        
        subgraph macOS OS Integration [macOS Native Frameworks]
            Handlers --> MacOSMenu[macOS Native Menu Bar NSMenu]
            Handlers --> MacOSTray[macOS Status Bar Menu]
            Handlers --> MacOSVibrancy[NSVisualEffectView Translucency]
        end
    end

    subgraph Native Storage Layer [OS User Application Data]
        DBEngine <-->|Zero-Copy SQL Queries| SQLite[(database.sqlite)]
    end
```

---

## 3. Layer Breakdown & Responsibilities

### Layer 1: Native Rust Backend Core (`src-tauri/`)
- **Application Host (`lib.rs` / `main.rs`)**: Initializes Tauri 2.0 runtime, window management, system tray, menus, native file dialogs, and OS notifications.
- **macOS Native Integration**:
  - Configures macOS Native Menu Bar (`NSMenu`) with standard Apple keyboard shortcuts (`Cmd+Q`, `Cmd+W`, `Cmd+C`, `Cmd+V`, `Cmd+A`).
  - Configures translucent title bar overlay (`TitleBarStyle::Overlay`) displaying native macOS traffic light buttons (`Close`, `Minimize`, `Full Screen`).
  - Manages macOS Dock badge icons and system status bar items.
- **IPC Command Handlers**: Rust functions annotated with `#[tauri::command]` that handle application business logic asynchronously using `tokio`.
- **Database Connection Manager**: Manages an async `sqlx::SqlitePool` injected into Tauri state via `.manage()`. Runs automated embedded SQL schema migrations on app launch.

### Layer 2: Desktop Frontend (`resources/js/` or `src/`)
- **Framework & Language**: React 19 with strict TypeScript (`tsconfig.json`).
- **UI Components & Styling**: Tailwind CSS v4 + Radix UI primitives. Adapts to macOS dark mode and accent color system automatically.
- **Data Fetching & State**: Invokes Rust backend using `@tauri-apps/api/core` `invoke()`. Managed via custom hooks or `TanStack Query (React Query)`.

### Layer 3: Embedded SQLite Database
- **Engine**: Pure Rust embedded SQLite (via `sqlx` or `rusqlite`).
- **Database Location**: Single `database.sqlite` file residing in OS-standard user application data directories:
  - **macOS**: `~/Library/Application Support/com.shutterbox.system/database.sqlite`
  - **Windows**: `%APPDATA%\com.shutterbox.system\database.sqlite`

---

## 4. Cross-Platform Specifications (macOS vs Windows)

| Feature | macOS (Apple Silicon M1-M4 & Intel x86_64) | Windows 10/11 (x64 / ARM64) |
| :--- | :--- | :--- |
| **Target OS Version** | macOS 12.0 (Monterey) to macOS 15+ (Sequoia) | Windows 10 & 11 |
| **Web View Engine** | Apple WKWebView (Metal hardware accelerated) | Microsoft Edge WebView2 |
| **Rust Target Triplet** | `aarch64-apple-darwin` / `x86_64-apple-darwin` | `x86_64-pc-windows-msvc` |
| **Universal Binary** | Universal 2 Binary (`lipo` bundled arm64 + x86_64) | x64 Native Executable |
| **Application Bundle** | `.app` Bundle / `.dmg` Disk Image | NSIS Installer (`.exe`) / `.msi` |
| **App Data Directory** | `~/Library/Application Support/com.shutterbox.system/` | `%APPDATA%\com.shutterbox.system\` |
| **Window Decoration** | Translucent overlay with traffic light buttons | Windows Acrylic / Mica title bar |
| **Code Signing** | Apple Developer ID Application + Notarization | Authenticode SignTool |

---

## 5. macOS-Specific Architectural Optimizations

1. **Universal 2 Architecture**: Compiles to native ARM64 instructions for Apple Silicon (M1/M2/M3/M4) and x86_64 for Intel-based Macs, packaged into a single Universal 2 `.dmg`.
2. **WKWebView Metal Acceleration**: Utilizes Apple's Metal graphics API under WKWebView for 60fps/120fps (ProMotion display) smooth animations.
3. **macOS File System Isolation**: Respects macOS sandboxing policies, storing database files in standard `Application Support` directories.
