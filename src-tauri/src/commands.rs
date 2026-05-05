use crate::app_state::AppState;
use crate::error::AppError;
use crate::memory::ensure_memory_file;
use crate::observers::{
    capture_ambient_screenshot, observe_active_app, observe_idle_state_with_current,
    observe_workspace, ObservationDigest, ScreenshotCapture,
};
use crate::pets::{discover_installed_pets, InstalledPet};
use crate::runtime::{
    AmbientTurnInput, ApprovalAction, PetUserInput, RuntimeEvent, RuntimeSession,
    StartPetSessionRequest,
};
use crate::state::{load_config, save_config, PetConfig};
use serde::Serialize;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, State};
use tokio::time::{sleep, Duration};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub message: String,
    pub recoverable: bool,
}

impl From<AppError> for CommandError {
    fn from(error: AppError) -> Self {
        Self {
            message: error.to_string(),
            recoverable: true,
        }
    }
}

pub type CommandResult<T> = Result<T, CommandError>;

#[tauri::command]
pub async fn list_installed_pets(state: State<'_, AppState>) -> CommandResult<Vec<InstalledPet>> {
    discover_installed_pets(&state.paths.codex_home).map_err(Into::into)
}

#[tauri::command]
pub async fn load_pet_config(state: State<'_, AppState>) -> CommandResult<Option<PetConfig>> {
    load_config(&state.paths).map_err(Into::into)
}

#[tauri::command]
pub async fn save_pet_config(state: State<'_, AppState>, config: PetConfig) -> CommandResult<()> {
    save_config(&state.paths, &config).map_err(Into::into)
}

#[tauri::command]
pub async fn start_pet_runtime(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<RuntimeSession> {
    let config = load_config(&state.paths)
        .map_err(CommandError::from)?
        .ok_or_else(|| CommandError {
            message: "Pick a pet before starting the runtime.".into(),
            recoverable: true,
        })?;
    let memory_path = state.paths.pet_memory_path(&config.pet_id);
    let memory_markdown =
        ensure_memory_file(&memory_path, &config.display_name).map_err(CommandError::from)?;
    let workspace_cwd = config
        .workspace_cwd
        .clone()
        .unwrap_or_else(|| state.paths.launch_cwd.clone());
    let session = state
        .runtime
        .start_pet_session(
            StartPetSessionRequest {
                pet_name: config.display_name.clone(),
                persona: config.persona.clone(),
                memory_markdown,
                memory_path,
                workspace_cwd,
            },
            state.event_tx.clone(),
        )
        .await
        .map_err(CommandError::from)?;
    if !state.observer_started.swap(true, Ordering::SeqCst) {
        spawn_observer_loop(app);
    }
    Ok(session)
}

#[tauri::command]
pub async fn send_user_message(state: State<'_, AppState>, text: String) -> CommandResult<()> {
    state
        .runtime
        .send_user_turn(PetUserInput {
            text,
            local_images: Vec::new(),
        })
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn interrupt_turn(state: State<'_, AppState>) -> CommandResult<()> {
    state.runtime.interrupt_turn().await.map_err(Into::into)
}

#[tauri::command]
pub async fn set_mute_until(
    state: State<'_, AppState>,
    until: Option<String>,
) -> CommandResult<()> {
    if let Some(mut config) = load_config(&state.paths).map_err(CommandError::from)? {
        config.mute.until = until;
        save_config(&state.paths, &config).map_err(CommandError::from)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn respond_to_approval(
    state: State<'_, AppState>,
    request_id: String,
    action: String,
) -> CommandResult<()> {
    let action = match action.as_str() {
        "allow_once" => ApprovalAction::AllowOnce,
        "allow_session" => ApprovalAction::AllowSession,
        "deny" => ApprovalAction::Deny,
        _ => {
            return Err(CommandError {
                message: format!("unknown approval action {action}"),
                recoverable: true,
            })
        }
    };
    state
        .runtime
        .respond_to_approval(&request_id, action)
        .await
        .map_err(Into::into)
}

fn spawn_observer_loop(app: AppHandle) {
    tokio::spawn(async move {
        let mut previous_idle = None;
        loop {
            let state = app.state::<AppState>();
            let paths = state.paths.clone();
            let config = match load_config(&paths) {
                Ok(Some(config)) => config,
                _ => {
                    state.observer_started.store(false, Ordering::SeqCst);
                    return;
                }
            };
            let mut digests = Vec::new();
            if config.observers.active_app {
                digests.push(observe_active_app(config.observers.window_title));
            }
            if config.observers.workspace {
                let cwd = config
                    .workspace_cwd
                    .clone()
                    .unwrap_or_else(|| paths.launch_cwd.clone());
                digests.push(observe_workspace(&cwd));
            }
            if config.observers.idle {
                let (digest, current_idle) = observe_idle_state_with_current(previous_idle);
                previous_idle = current_idle;
                digests.push(digest);
            }
            handle_observations(&state, &config, digests).await;
            sleep(Duration::from_secs(60)).await;
        }
    });
}

async fn handle_observations(
    state: &tauri::State<'_, AppState>,
    config: &PetConfig,
    digests: Vec<ObservationDigest>,
) {
    for digest in &digests {
        let _ = state.event_tx.send(RuntimeEvent::Observation {
            digest: digest.clone(),
        });
    }

    let mut engine = state.ambient.lock().await;
    engine.record_observations(&digests);
    let Some(request) = engine.next_request(&config.ambient, config.mute.until.as_deref()) else {
        return;
    };
    drop(engine);

    if start_ambient_turn(state, config, request).await {
        state.ambient.lock().await.mark_request_started();
    }
}

fn cleanup_unused_screenshot(cleanup_after_turn: bool, path: Option<&std::path::Path>) {
    if cleanup_after_turn {
        if let Some(path) = path {
            let _ = std::fs::remove_file(path);
        }
    }
}

async fn start_ambient_turn(
    state: &tauri::State<'_, AppState>,
    config: &PetConfig,
    request: crate::proactive::AmbientTurnRequest,
) -> bool {
    let screenshot = capture_screenshot_for_ambient_turn(state, config, &request);
    emit_screenshot_status(state, &screenshot);
    let prompt =
        ambient_prompt_with_screenshot_status(request.prompt, screenshot.degraded.as_deref());
    let cleanup_screenshot_after_turn = screenshot.cleanup_after_turn;
    let screenshot_path = screenshot.path;
    let turn_started = state
        .runtime
        .send_ambient_turn(AmbientTurnInput {
            prompt,
            screenshot_path: screenshot_path.clone(),
            cleanup_screenshot_after_turn,
        })
        .await;
    if !matches!(turn_started, Ok(true)) {
        cleanup_unused_screenshot(cleanup_screenshot_after_turn, screenshot_path.as_deref());
        return false;
    }
    true
}

fn capture_screenshot_for_ambient_turn(
    state: &tauri::State<'_, AppState>,
    config: &PetConfig,
    request: &crate::proactive::AmbientTurnRequest,
) -> ScreenshotCapture {
    if request.include_screenshot {
        capture_ambient_screenshot(&state.paths, &config.pet_id, request.retain_screenshot)
    } else {
        ScreenshotCapture {
            path: None,
            cleanup_after_turn: false,
            degraded: None,
        }
    }
}

fn emit_screenshot_status(state: &tauri::State<'_, AppState>, screenshot: &ScreenshotCapture) {
    if let Some(message) = &screenshot.degraded {
        let _ = state.event_tx.send(RuntimeEvent::AmbientStatus {
            message: format!("Screenshot awareness is text-only right now: {message}"),
        });
    }
}

fn ambient_prompt_with_screenshot_status(prompt: String, degraded: Option<&str>) -> String {
    match degraded {
        Some(degraded) => format!("{prompt}\nScreenshot unavailable: {degraded}"),
        None => prompt,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_error_is_recoverable() {
        let error: CommandError = AppError::RuntimeNotStarted.into();
        assert!(error.recoverable);
        assert!(error.message.contains("runtime"));
    }
}
