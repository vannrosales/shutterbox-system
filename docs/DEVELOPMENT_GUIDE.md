# Developer Setup & Operations Guide (Pure Tauri + Rust + SQLite)

> **Target Stack**: Tauri 2.0 + Rust 2021 + SQLx (SQLite) + React 19 + TypeScript

---

## 1. Environment Setup

### Windows 10/11 Prerequisites
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

### macOS Prerequisites (Intel & Apple Silicon)
1. **Xcode Command Line Tools**:
   ```bash
   xcode-select --install
   ```
2. **Rust Toolchain**:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustup target add aarch64-apple-darwin x86_64-apple-darwin
   ```
3. **Node.js 22+**:
   ```bash
   brew install node
   ```

---

## 2. Cargo Dependencies (`src-tauri/Cargo.toml`)

```toml
[package]
name = "shutterbox-system"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2.0", features = [] }

[dependencies]
tauri = { version = "2.0", features = ["tray-icon"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1.40", features = ["full"] }
sqlx = { version = "0.8", features = ["runtime-tokio", "tls-native-tls", "sqlite", "migrate"] }
```

---

## 3. Rust Database & IPC Implementation Example

### Rust Entrypoint & Database Init (`src-tauri/src/lib.rs`)

```rust
use sqlx::{sqlite::SqliteConnectOptions, SqlitePool};
use std::str::FromStr;
use tauri::Manager;

#[derive(serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: i64,
    pub name: String,
    pub email: String,
}

#[tauri::command]
async fn get_users(pool: tauri::State<'_, SqlitePool>) -> Result<Vec<User>, String> {
    sqlx::query_as::<_, User>("SELECT id, name, email FROM users")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_user(
    name: String, 
    email: String, 
    pool: tauri::State<'_, SqlitePool>
) -> Result<User, String> {
    let id = sqlx::query("INSERT INTO users (name, email) VALUES (?, ?)")
        .bind(&name)
        .bind(&email)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .last_insert_rowid();

    Ok(User { id, name, email })
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("failed to get app data dir");
            std::fs::create_dir_all(&app_dir).unwrap();

            let db_path = app_dir.join("database.sqlite");
            let conn_str = format!("sqlite://{}", db_path.to_str().unwrap());

            let options = SqliteConnectOptions::from_str(&conn_str)
                .unwrap()
                .create_if_missing(true);

            tauri::async_runtime::block_on(async {
                let pool = SqlitePool::connect_with(options).await.unwrap();
                
                // Run embedded schema migrations
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
        .invoke_handler(tauri::generate_handler![get_users, create_user])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 4. Invoking Rust Commands from React (TypeScript)

### Type Definition (`src/types/user.ts`)
```typescript
export interface User {
    id: number;
    name: string;
    email: string;
}
```

### React Component (`src/components/UserList.tsx`)
```tsx
import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { User } from '../types/user';

export const UserList: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const data = await invoke<User[]>('get_users');
            setUsers(data);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (name: string, email: string) => {
        try {
            const newUser = await invoke<User>('create_user', { name, email });
            setUsers((prev) => [...prev, newUser]);
        } catch (error) {
            console.error('Failed to create user:', error);
        }
    };

    if (loading) return <div>Loading database items...</div>;

    return (
        <div className="p-4">
            <h1 className="text-xl font-bold mb-4">Users ({users.length})</h1>
            <ul className="space-y-2">
                {users.map((u) => (
                    <li key={u.id} className="p-2 border rounded shadow-sm">
                        {u.name} — <span className="text-gray-500">{u.email}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};
```

---

## 5. Development & Build Commands

```bash
# 1. Install NPM dependencies
npm install

# 2. Run Tauri app in development mode with HMR (Hot Module Replacement)
npm run tauri dev

# 3. Compile production release desktop installer (.exe / .msi / .dmg)
npm run tauri build
```
