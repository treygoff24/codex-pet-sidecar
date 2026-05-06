use crate::app_state::AppState;
use crate::error::AppError;
use crate::memory::ensure_memory_file;
use crate::observers::{
    capture_ambient_screenshot, observe_active_app, observe_idle_state_with_current,
    observe_workspace, ObservationDigest, ScreenshotCapture,
};
use crate::pets::InstalledPet;
use crate::runtime::{
    AmbientTurnInput, ApprovalAction, PetUserInput, RuntimeEvent, RuntimeSession,
    StartPetSessionRequest,
};
use crate::skills::{hatching_prompt, personality_prompt, SkillPrompt};
use crate::state::{
    discover_library_pets, ensure_library, import_staged_pet, load_active_pet_config, load_config,
    save_config, set_active_pet as set_active_pet_in_library, PetConfig, PetLibrary,
};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, State};
use time::OffsetDateTime;
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PetVisibilityState {
    pub tucked: bool,
    pub tucked_until: Option<String>,
    pub visible: bool,
}

#[tauri::command]
pub async fn list_installed_pets(state: State<'_, AppState>) -> CommandResult<Vec<InstalledPet>> {
    discover_library_pets(&state.paths).map_err(Into::into)
}

#[tauri::command]
pub async fn load_pet_library(state: State<'_, AppState>) -> CommandResult<PetLibrary> {
    ensure_library(&state.paths).map_err(Into::into)
}

#[tauri::command]
pub async fn load_pet_config(state: State<'_, AppState>) -> CommandResult<Option<PetConfig>> {
    ensure_library(&state.paths).map_err(CommandError::from)?;
    load_active_pet_config(&state.paths).map_err(Into::into)
}

#[tauri::command]
pub async fn save_pet_config(state: State<'_, AppState>, config: PetConfig) -> CommandResult<()> {
    save_config(&state.paths, &config).map_err(Into::into)
}

#[tauri::command]
pub async fn set_active_pet(
    state: State<'_, AppState>,
    pet_id: String,
) -> CommandResult<PetLibrary> {
    set_active_pet_in_library(&state.paths, &pet_id).map_err(Into::into)
}

#[tauri::command]
pub async fn import_pet(
    state: State<'_, AppState>,
    source_dir: String,
) -> CommandResult<PetLibrary> {
    import_staged_pet(&state.paths, &PathBuf::from(source_dir)).map_err(Into::into)
}

#[tauri::command]
pub async fn start_hatching_flow() -> CommandResult<SkillPrompt> {
    Ok(hatching_prompt())
}

#[tauri::command]
pub async fn start_personality_flow(state: State<'_, AppState>) -> CommandResult<SkillPrompt> {
    personality_prompt(&state.paths).map_err(Into::into)
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
    if tuck_is_active(&config) {
        return Err(CommandError {
            message: "Pet is tucked. Wake the pet before starting runtime.".into(),
            recoverable: true,
        });
    }
    let memory_path = state.paths.pet_memory_path(&config.pet_id);
    let memory_markdown =
        ensure_memory_file(&memory_path, &config.display_name).map_err(CommandError::from)?;
    let workspace_cwd = resolve_runtime_workspace(&state.paths, config.workspace_cwd.as_ref())
        .map_err(CommandError::from)?;
    let session = state
        .runtime
        .start_pet_session(
            StartPetSessionRequest {
                pet_name: config.display_name.clone(),
                persona: config.persona.clone(),
                memory_markdown,
                memory_path,
                workspace_cwd,
                runtime: config.runtime.clone(),
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
pub async fn tuck_pet(
    app: AppHandle,
    state: State<'_, AppState>,
    until: Option<String>,
) -> CommandResult<PetVisibilityState> {
    let mut config = load_config(&state.paths)
        .map_err(CommandError::from)?
        .ok_or_else(|| CommandError {
            message: "No active pet to tuck.".into(),
            recoverable: true,
        })?;
    config.tuck.tucked = true;
    config.tuck.tucked_until = until;
    save_config(&state.paths, &config).map_err(CommandError::from)?;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    schedule_wake_if_needed(app, config.pet_id.clone(), config.tuck.tucked_until.clone());
    Ok(visibility_state(&config))
}

#[tauri::command]
pub async fn wake_pet(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<PetVisibilityState> {
    let mut config = load_config(&state.paths)
        .map_err(CommandError::from)?
        .ok_or_else(|| CommandError {
            message: "No active pet to wake.".into(),
            recoverable: true,
        })?;
    config.tuck.tucked = false;
    config.tuck.tucked_until = None;
    save_config(&state.paths, &config).map_err(CommandError::from)?;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(visibility_state(&config))
}

#[tauri::command]
pub async fn get_pet_visibility_state(
    state: State<'_, AppState>,
) -> CommandResult<Option<PetVisibilityState>> {
    Ok(load_config(&state.paths)
        .map_err(CommandError::from)?
        .map(|config| visibility_state(&config)))
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
            if tuck_is_active(&config) {
                sleep(Duration::from_secs(60)).await;
                continue;
            }
            let mut digests = Vec::new();
            if config.observers.active_app {
                digests.push(observe_active_app(config.observers.window_title));
            }
            if config.observers.workspace {
                let cwd = resolve_runtime_workspace(&paths, config.workspace_cwd.as_ref())
                    .unwrap_or_else(|_| paths.runtime_workspace_dir());
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
    if tuck_is_active(config) {
        return;
    }
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

async fn start_ambient_turn(
    state: &tauri::State<'_, AppState>,
    config: &PetConfig,
    request: crate::proactive::AmbientTurnRequest,
) -> bool {
    if tuck_is_active(config) {
        return false;
    }
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
        crate::runtime::session::cleanup_screenshot_file(
            cleanup_screenshot_after_turn,
            screenshot_path.as_deref(),
        );
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

fn tuck_is_active(config: &PetConfig) -> bool {
    if !config.tuck.tucked {
        return false;
    }
    match config.tuck.tucked_until.as_deref() {
        None => true,
        Some(until) => OffsetDateTime::parse(until, &time::format_description::well_known::Rfc3339)
            .map(|time| time > OffsetDateTime::now_utc())
            .unwrap_or_else(|_| {
                // Bad timestamp shouldn't strand the user with a permanently
                // tucked pet. Treat as expired and surface a warning.
                eprintln!(
                    "warning: tucked_until is not a valid RFC3339 timestamp; treating as expired"
                );
                false
            }),
    }
}

fn visibility_state(config: &PetConfig) -> PetVisibilityState {
    let tucked = tuck_is_active(config);
    PetVisibilityState {
        tucked,
        tucked_until: config.tuck.tucked_until.clone(),
        visible: !tucked,
    }
}

fn resolve_runtime_workspace(
    paths: &crate::state::AppPaths,
    configured: Option<&std::path::PathBuf>,
) -> Result<std::path::PathBuf, AppError> {
    match configured {
        Some(path) => validate_user_workspace(paths, path),
        None => {
            let scratch = paths.runtime_workspace_dir();
            std::fs::create_dir_all(&scratch)?;
            scratch.canonicalize().map_err(AppError::from)
        }
    }
}

fn validate_user_workspace(
    paths: &crate::state::AppPaths,
    path: &std::path::Path,
) -> Result<std::path::PathBuf, AppError> {
    let canonical = path.canonicalize().map_err(|source| AppError::IoWithPath {
        path: path.to_path_buf(),
        source,
    })?;
    let metadata = std::fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(AppError::InvalidWorkspace {
            path: path.to_path_buf(),
            reason: "workspace must be a real directory, not a symlink".to_string(),
        });
    }
    if canonical.parent().is_none() {
        return Err(AppError::InvalidWorkspace {
            path: canonical,
            reason: "workspace cannot be the filesystem root".to_string(),
        });
    }
    if let Some(home) = dirs::home_dir().and_then(|home| home.canonicalize().ok()) {
        if canonical == home {
            return Err(AppError::InvalidWorkspace {
                path: canonical,
                reason: "workspace cannot be the home directory".to_string(),
            });
        }
    }
    let app_support = paths
        .app_support
        .canonicalize()
        .unwrap_or_else(|_| paths.app_support.clone());
    if canonical.starts_with(&app_support)
        && canonical
            != paths
                .runtime_workspace_dir()
                .canonicalize()
                .unwrap_or_default()
    {
        return Err(AppError::InvalidWorkspace {
            path: canonical,
            reason: "workspace cannot be the app support directory".to_string(),
        });
    }
    Ok(canonical)
}

fn schedule_wake_if_needed(app: AppHandle, pet_id: String, until: Option<String>) {
    let Some(until) = until else {
        return;
    };
    let Ok(until) = OffsetDateTime::parse(&until, &time::format_description::well_known::Rfc3339)
    else {
        return;
    };
    let Ok(delay) = (until - OffsetDateTime::now_utc()).try_into() else {
        return;
    };
    tokio::spawn(async move {
        sleep(delay).await;
        let state = app.state::<AppState>();
        let Ok(Some(mut config)) = load_config(&state.paths) else {
            return;
        };
        if config.pet_id != pet_id || !config.tuck.tucked {
            return;
        }
        if !tuck_is_active(&config) {
            config.tuck.tucked = false;
            config.tuck.tucked_until = None;
            let _ = save_config(&state.paths, &config);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    });
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
    fn command_error_is_recoverable() {
        let error: CommandError = AppError::RuntimeNotStarted.into();
        assert!(error.recoverable);
        assert!(error.message.contains("runtime"));
    }

    #[test]
    fn tucked_pet_is_hidden_and_silent() {
        let config = config_with_tuck(TuckConfig {
            tucked: true,
            tucked_until: None,
        });
        assert!(tuck_is_active(&config));
        assert!(!visibility_state(&config).visible);
    }

    #[test]
    fn expired_tuck_restores_visibility() {
        let config = config_with_tuck(TuckConfig {
            tucked: true,
            tucked_until: Some("2000-01-01T00:00:00Z".into()),
        });
        assert!(!tuck_is_active(&config));
        assert!(visibility_state(&config).visible);
    }

    #[test]
    fn future_tuck_keeps_pet_silent() {
        let future = (OffsetDateTime::now_utc() + time::Duration::hours(1))
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap();
        let config = config_with_tuck(TuckConfig {
            tucked: true,
            tucked_until: Some(future),
        });
        assert!(tuck_is_active(&config));
    }

    #[test]
    fn default_runtime_workspace_is_app_owned_scratch() {
        let root = tempfile::tempdir().expect("tempdir");
        let paths = crate::state::AppPaths::with_roots(
            root.path().join("codex"),
            root.path().join("support"),
            root.path().join("repo"),
        );
        let workspace = resolve_runtime_workspace(&paths, None).expect("workspace");
        assert!(workspace.ends_with("runtime-workspace"));
        assert!(workspace.exists());
    }

    #[test]
    fn rejects_dangerous_workspace_roots() {
        let root = tempfile::tempdir().expect("tempdir");
        let paths = crate::state::AppPaths::with_roots(
            root.path().join("codex"),
            root.path().join("support"),
            root.path().join("repo"),
        );
        assert!(validate_user_workspace(&paths, std::path::Path::new("/")).is_err());
        std::fs::create_dir_all(&paths.app_support).expect("support");
        assert!(validate_user_workspace(&paths, &paths.app_support).is_err());
    }
}
