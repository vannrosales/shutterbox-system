use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

struct ServerProcess(Mutex<Option<Child>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let resource_dir = app.path().resource_dir().unwrap_or_else(|_| PathBuf::from("."));

            let bundled_php_name = if cfg!(windows) { "php.exe" } else { "php" };
            let path_opt1 = resource_dir.join("resources").join("bin").join(bundled_php_name);
            let path_opt2 = resource_dir.join("bin").join(bundled_php_name);

            let (php_binary, working_dir) = if path_opt1.exists() {
                (path_opt1, resource_dir.join("resources").join("app"))
            } else if path_opt2.exists() {
                (path_opt2, resource_dir.join("app"))
            } else {
                (PathBuf::from(bundled_php_name), PathBuf::from("."))
            };

            // Set up writable app data directory for SQLite DB and storage framework files
            let app_data_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("./app_data"));
            let storage_dir = app_data_dir.join("storage");
            let views_dir = storage_dir.join("framework").join("views");
            let sessions_dir = storage_dir.join("framework").join("sessions");
            let cache_dir = storage_dir.join("framework").join("cache");
            let logs_dir = storage_dir.join("logs");

            let _ = std::fs::create_dir_all(&storage_dir);
            let _ = std::fs::create_dir_all(&views_dir);
            let _ = std::fs::create_dir_all(&sessions_dir);
            let _ = std::fs::create_dir_all(&cache_dir);
            let _ = std::fs::create_dir_all(&logs_dir);

            let db_path = app_data_dir.join("database.sqlite");
            if !db_path.exists() {
                let _ = std::fs::File::create(&db_path);
            }

            let db_database_str = db_path.to_string_lossy().to_string();
            let storage_path_str = storage_dir.to_string_lossy().to_string();
            let views_compiled_str = views_dir.to_string_lossy().to_string();

            let env_pairs = [
                ("APP_ENV", "production"),
                ("APP_DEBUG", "true"),
                ("APP_KEY", "base64:4sF4uV+J3+GZ80w6W5zP3o8K8L7M6N5P4Q3R2S1T0U="),
                ("APP_URL", "http://127.0.0.1:8000"),
                ("APP_STORAGE_PATH", &storage_path_str),
                ("DB_CONNECTION", "sqlite"),
                ("DB_DATABASE", &db_database_str),
                ("VIEW_COMPILED_PATH", &views_compiled_str),
                ("SESSION_DRIVER", "cookie"),
                ("LOG_CHANNEL", "single"),
            ];

            for (k, v) in &env_pairs {
                std::env::set_var(k, v);
            }

            // Run artisan migrations on launch
            let mut migrate_cmd = Command::new(&php_binary);
            migrate_cmd.current_dir(&working_dir);
            migrate_cmd.args(["artisan", "migrate", "--force"]);
            for (k, v) in &env_pairs {
                migrate_cmd.env(k, v);
            }

            #[cfg(target_os = "windows")]
            migrate_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

            if let Ok(output) = migrate_cmd.output() {
                if !output.status.success() {
                    eprintln!("[Tauri Migration Output] {}", String::from_utf8_lossy(&output.stderr));
                }
            }

            // Spawn artisan serve process
            let mut serve_cmd = Command::new(&php_binary);
            serve_cmd.current_dir(&working_dir);
            serve_cmd.args(["artisan", "serve", "--host=127.0.0.1", "--port=8000"]);
            for (k, v) in &env_pairs {
                serve_cmd.env(k, v);
            }

            #[cfg(target_os = "windows")]
            serve_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

            match serve_cmd.spawn() {
                Ok(child) => {
                    app.manage(ServerProcess(Mutex::new(Some(child))));
                }
                Err(e) => {
                    eprintln!("Failed to spawn PHP server process: {}", e);
                }
            }

            // Give PHP server time to bind
            std::thread::sleep(std::time::Duration::from_millis(800));

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<ServerProcess>() {
                    if let Ok(mut child_lock) = state.0.lock() {
                        if let Some(mut child) = child_lock.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
