use crate::app_state::AppState;
use crate::state::{load_config, save_config, PetConfig};
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
        apply_tray_tuck(&mut config);
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
        apply_tray_wake(&mut config);
        let _ = save_config(&state.paths, &config);
    }
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

fn apply_tray_tuck(config: &mut PetConfig) {
    config.tuck.tucked = true;
    config.tuck.tucked_until = None;
}

fn apply_tray_wake(config: &mut PetConfig) {
    config.tuck.tucked = false;
    config.tuck.tucked_until = None;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::config::{default_pet_config, TuckConfig};

    fn config_with_tuck(tuck: TuckConfig) -> PetConfig {
        let mut config = default_pet_config(
            "olive".into(),
            "Olive".into(),
            "/tmp/spritesheet.webp".into(),
            "persona".into(),
        );
        config.tuck = tuck;
        config
    }

    #[test]
    fn tray_tuck_makes_the_pet_indefinitely_tucked() {
        let mut config = config_with_tuck(TuckConfig {
            tucked: false,
            tucked_until: Some("2099-01-01T00:00:00Z".into()),
        });

        apply_tray_tuck(&mut config);

        assert!(config.tuck.tucked);
        assert!(config.tuck.tucked_until.is_none());
    }

    #[test]
    fn tray_wake_clears_any_timed_or_indefinite_tuck() {
        let mut config = config_with_tuck(TuckConfig {
            tucked: true,
            tucked_until: Some("2099-01-01T00:00:00Z".into()),
        });

        apply_tray_wake(&mut config);

        assert!(!config.tuck.tucked);
        assert!(config.tuck.tucked_until.is_none());
    }
}
