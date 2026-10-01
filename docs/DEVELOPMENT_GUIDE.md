# Developer Setup & Operations Guide (macOS & Windows)

> **Target Stack**: Tauri 2.0 + Rust 2021 + SQLx (SQLite) + React 19 + TypeScript  
> **Supported Desktop OS**: macOS (Apple Silicon M1-M4 & Intel x86_64) and Windows 10/11  

---

## 1. Prerequisites & Environment Setup

### macOS Requirements (Apple Silicon M1-M4 & Intel)
1. **Xcode Command Line Tools**:
   ```bash
   xcode-select --install
   ```
2. **Rust Toolchain with Universal Apple Targets**:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustup target add aarch64-apple-darwin x86_64-apple-darwin
   ```
3. **Node.js 22+ (Homebrew)**:
   ```bash
   brew install node
   ```

### Windows 10/11 Requirements
1. **Visual Studio 2022 C++ Build Tools**:
   - Install **Desktop development with C++** via Visual Studio Installer.
2. **Rust Toolchain**:
   ```powershell
   winget install Rustlang.Rustup
   rustup default stable-x86_64-pc-windows-msvc
   ```
3. **Node.js 22+**:
   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```

---

## 2. macOS Native Menu & Window Setup in Rust (`src-tauri/src/lib.rs`)

```rust
use sqlx::{sqlite::SqliteConnectOptions, SqlitePool};
use std::str::FromStr;
use tauri::{
    menu::{Menu, MenuItem, Submenu},
    Manager, TitleBarStyle,
};

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 1. Configure macOS Native Application Menu Bar
            #[cfg(target_os = "macos")]
            {
                let app_menu = Submenu::with_items(
                    app,
                    "Shutterbox",
                    true,
                    &[
                        &MenuItem::with_id(app, "about", "About Shutterbox", true, None::<&str>)?,
                        &MenuItem::with_id(app, "quit", "Quit Shutterbox", true, Some("cmd+q"))?,
                    ],
                )?;
                let menu = Menu::with_items(app, &[&app_menu])?;
                app.set_menu(menu)?;
            }

            // 2. Resolve OS-specific App Data Directory (macOS: ~/Library/Application Support/com.shutterbox.system/)
            let app_dir = app.path().app_data_dir().expect("failed to get app data dir");
            std::fs::create_dir_all(&app_dir).unwrap();

            let db_path = app_dir.join("database.sqlite");
            let conn_str = format!("sqlite://{}", db_path.to_str().unwrap());

            let options = SqliteConnectOptions::from_str(&conn_str)
                .unwrap()
                .create_if_missing(true);

            tauri::async_runtime::block_on(async {
                let pool = SqlitePool::connect_with(options).await.unwrap();
                
                // Embedded SQLite Schema Migrations
                sqlx::query(
                    "CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        email TEXT NOT NULL UNIQUE
                    );"
                )
                .execute(&pool)
                .await
                .unwrap();

                app.manage(pool);
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 3. macOS Bundle & Window Configuration (`src-tauri/tauri.conf.json`)

```json
{
  "$schema": "../gen/schemas/config.schema.json",
  "productName": "Shutterbox System",
  "version": "1.0.0",
  "identifier": "com.shutterbox.system",
  "app": {
    "windows": [
      {
        "title": "Shutterbox System",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "resizable": true,
        "titleBarStyle": "Overlay",
        "hiddenTitle": true
      }
    ]
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "macOS": {
      "frameworks": [],
      "minimumSystemVersion": "12.0",
      "exceptionDomain": "",
      "signingIdentity": null,
      "entitlements": null,
      "dmg": {
        "background": null,
        "windowSize": {
          "width": 600,
          "height": 400
        },
        "appPosition": {
          "x": 180,
          "y": 170
        },
        "applicationFolderPosition": {
          "x": 420,
          "y": 170
        }
      }
    }
  }
}
```

---

## 4. Development & Build Commands (macOS & Windows)

### Development Mode (with Hot Module Reload)
```bash
# Works identically on macOS and Windows
npm run tauri dev
```

### macOS Build Commands
```bash
# Build for current host architecture (Apple Silicon or Intel)
npm run tauri build

# Build Universal 2 Binary (Bundles Apple Silicon arm64 + Intel x86_64 into single .dmg)
npm run tauri build -- --target universal-apple-darwin
```

### Windows Build Commands
```powershell
# Produces NSIS executable (.exe) and MSI installer (.msi)
npm run tauri build
```

---

## 5. Output Desktop Packages

- **macOS Output Directory**: `src-tauri/target/release/bundle/dmg/Shutterbox System_1.0.0_universal.dmg` (or `.app` in `bundle/macos/`).
- **Windows Output Directory**: `src-tauri/target/release/bundle/nsis/Shutterbox System_1.0.0_x64-setup.exe`.
