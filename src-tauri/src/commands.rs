use crate::app_state::AppState;
use crate::error::AppError;
use crate::memory::ensure_memory_file;
use crate::observers::{
    observe_active_app, observe_idle_state_with_current, observe_workspace, ObservationDigest,
};
use crate::pets::{discover_installed_pets, InstalledPet};
use crate::runtime::{
    ApprovalAction, PetUserInput, RuntimeEvent, RuntimeSession, StartPetSessionRequest,
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
        .send_user_turn(PetUserInput { text })
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
            if config.observers.active_app {
                let digest = observe_active_app(config.observers.window_title);
                emit_observation(&state, &config, digest).await;
            }
            if config.observers.workspace {
                let cwd = config
                    .workspace_cwd
                    .clone()
                    .unwrap_or_else(|| paths.launch_cwd.clone());
                let digest = observe_workspace(&cwd);
                emit_observation(&state, &config, digest).await;
            }
            if config.observers.idle {
                let (digest, current_idle) = observe_idle_state_with_current(previous_idle);
                previous_idle = current_idle;
                emit_observation(&state, &config, digest).await;
            }
            sleep(Duration::from_secs(60)).await;
        }
    });
}

async fn emit_observation(
    state: &tauri::State<'_, AppState>,
    config: &PetConfig,
    digest: ObservationDigest,
) {
    let _ = state.event_tx.send(RuntimeEvent::Observation {
        digest: digest.clone(),
    });
    if !config.proactive.enabled {
        return;
    }
    let prompt = state.proactive.lock().await.evaluate(
        &digest,
        config.proactive.min_minutes_between_messages,
        config.mute.until.as_deref(),
    );
    if let Some(prompt) = prompt {
        let _ = state.runtime.inject_observation_turn(prompt).await;
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
