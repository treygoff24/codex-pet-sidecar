use crate::app_state::AppState;
use crate::state::{load_config, save_config};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

const MAIN_WINDOW: &str = "main";

pub fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let wake = MenuItem::with_id(app, "wake_pet", "Wake Pet", true, None::<&str>)?;
    let tuck = MenuItem::with_id(app, "tuck_pet", "Tuck Pet", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&wake, &tuck, &quit])?;

    TrayIconBuilder::with_id("codex-pet-sidecar")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "wake_pet" => {
                let _ = wake_from_tray(app);
            }
            "tuck_pet" => {
                let _ = tuck_from_tray(app);
            }
            "quit" => {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let state = handle.state::<AppState>();
                    let _ = state.runtime.shutdown().await;
                    handle.exit(0);
                });
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = wake_from_tray(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn tuck_from_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let state = app.state::<AppState>();
    if let Ok(Some(mut config)) = load_config(&state.paths) {
        config.tuck.tucked = true;
        config.tuck.tucked_until = None;
        let _ = save_config(&state.paths, &config);
    }
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.hide();
    }
    Ok(())
}

fn wake_from_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let state = app.state::<AppState>();
    if let Ok(Some(mut config)) = load_config(&state.paths) {
        config.tuck.tucked = false;
        config.tuck.tucked_until = None;
        let _ = save_config(&state.paths, &config);
    }
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}
