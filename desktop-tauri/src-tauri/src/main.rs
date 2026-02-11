mod commands;

#[cfg(feature = "tauri-command")]
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::router_decide])
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}

#[cfg(not(feature = "tauri-command"))]
fn main() {}
