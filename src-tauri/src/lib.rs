mod app_state;
mod command_result;
mod commands;
mod error;
mod hatching;
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
    accept_prototype, archive_pet, cancel_hatching_run, confirm_brief_change,
    describe_reference_image, generate_prototype, get_hatching_state, get_pet_visibility_state,
    import_hatched_pet, import_pet, interrupt_turn, list_installed_pets,
    list_orphan_hatching_sessions, load_pet_config, load_pet_library, preview_pet_id,
    regenerate_row, respond_to_approval, resume_hatching_run, revert_to_iteration, save_pet_config,
    send_user_message, set_active_pet, set_mute_until, start_hatching_flow, start_hatching_run,
    start_personality_flow, start_pet_runtime, submit_brief, tuck_pet, upload_reference_image,
    wake_pet,
};
use runtime::RuntimeEvent;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (event_tx, mut event_rx) = tokio::sync::mpsc::unbounded_channel::<RuntimeEvent>();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            let paths = state::AppPaths::discover(app.handle()).expect("resolve application paths");
            app.manage(AppState::new(paths, event_tx));
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
            archive_pet,
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
            respond_to_approval,
            start_hatching_run,
            cancel_hatching_run,
            get_hatching_state,
            submit_brief,
            confirm_brief_change,
            upload_reference_image,
            list_orphan_hatching_sessions,
            resume_hatching_run,
            describe_reference_image,
            generate_prototype,
            revert_to_iteration,
            accept_prototype,
            regenerate_row,
            import_hatched_pet,
            preview_pet_id
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
