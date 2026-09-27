use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::State;

struct ServerProcess(Mutex<Option<Child>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            std::env::set_var("APP_ENV", "production");
            std::env::set_var("APP_DEBUG", "false");

            let php_binary = if cfg!(windows) { "php.exe" } else { "php" };

            let mut command = Command::new(php_binary);
            command.args(["artisan", "serve", "--port=8085"]);

            match command.spawn() {
                Ok(child) => {
                    app.manage(ServerProcess(Mutex::new(Some(child))));
                }
                Err(e) => {
                    eprintln!("Failed to spawn PHP server process: {}", e);
                }
            }

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
