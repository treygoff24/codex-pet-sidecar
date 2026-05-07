mod app_state;
mod commands;
mod error;
mod memory;
mod observers;
mod pets;
mod proactive;
mod runtime;
mod skills;
mod state;
mod tray;

use app_state::AppState;
use commands::{
    get_pet_visibility_state, import_pet, interrupt_turn, list_installed_pets, load_pet_config,
    load_pet_library, respond_to_approval, save_pet_config, send_user_message, set_active_pet,
    set_mute_until, start_hatching_flow, start_personality_flow, start_pet_runtime, tuck_pet,
    wake_pet,
};
use runtime::RuntimeEvent;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let paths = state::AppPaths::discover().expect("resolve application paths");
    let (event_tx, mut event_rx) = tokio::sync::mpsc::unbounded_channel::<RuntimeEvent>();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::new(paths, event_tx))
        .setup(|app| {
            tray::setup_tray(app)?;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = event_rx.recv().await {
                    let _ = handle.emit("pet://event", event);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_installed_pets,
            load_pet_library,
            load_pet_config,
            save_pet_config,
            set_active_pet,
            import_pet,
            start_hatching_flow,
            start_personality_flow,
            start_pet_runtime,
            send_user_message,
            interrupt_turn,
            set_mute_until,
            tuck_pet,
            wake_pet,
            get_pet_visibility_state,
            respond_to_approval
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let handle = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let state = handle.state::<AppState>();
                    let _ = state.runtime.shutdown().await;
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
