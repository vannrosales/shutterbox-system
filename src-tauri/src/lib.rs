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
                (path_opt1.to_string_lossy().to_string(), resource_dir.join("resources").join("app"))
            } else if path_opt2.exists() {
                (path_opt2.to_string_lossy().to_string(), resource_dir.join("app"))
            } else {
                (bundled_php_name.to_string(), PathBuf::from("."))
            };

            // Set up app data directory for offline storage & SQLite database persistence
            if let Ok(app_data_dir) = app.path().app_data_dir() {
                let _ = std::fs::create_dir_all(&app_data_dir);
                let views_dir = app_data_dir.join("storage").join("framework").join("views");
                let logs_dir = app_data_dir.join("storage").join("logs");
                let _ = std::fs::create_dir_all(&views_dir);
                let _ = std::fs::create_dir_all(&logs_dir);

                let db_path = app_data_dir.join("database.sqlite");
                if !db_path.exists() {
                    let _ = std::fs::File::create(&db_path);
                }
                std::env::set_var("DB_DATABASE", db_path.to_string_lossy().to_string());
                std::env::set_var("VIEW_COMPILED_PATH", views_dir.to_string_lossy().to_string());
            }

            std::env::set_var("APP_ENV", "production");
            std::env::set_var("APP_DEBUG", "true");
            std::env::set_var("SESSION_DRIVER", "cookie");
            std::env::set_var("APP_KEY", "base64:4sF4uV+J3+GZ80w6W5zP3o8K8L7M6N5P4Q3R2S1T0U=");

            let mut command = Command::new(&php_binary);
            command.current_dir(&working_dir);
            command.args(["artisan", "serve", "--host=127.0.0.1", "--port=8000"]);

            // Hide console window on Windows
            #[cfg(target_os = "windows")]
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW

            match command.spawn() {
                Ok(child) => {
                    app.manage(ServerProcess(Mutex::new(Some(child))));
                }
                Err(e) => {
                    eprintln!("Failed to spawn PHP server process using {:?}: {}", php_binary, e);
                }
            }

            // Give PHP server a brief moment to bind to port 8085
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
