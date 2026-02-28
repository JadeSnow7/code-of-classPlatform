mod commands;

#[cfg(feature = "tauri-command")]
fn main() {
    tauri::Builder::default()
        .plugin(eduedge_ai_tauri_plugin::init())
        .invoke_handler(tauri::generate_handler![commands::router_decide])
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}

#[cfg(not(feature = "tauri-command"))]
fn main() {}
