use crate::app_state::AppState;
use crate::command_result::{CommandError, CommandResult};
use crate::error::AppError;
use crate::hatching::pipeline::{
    compose_and_validate_hatching_atlas, package_and_import_hatched_pet,
};
use crate::hatching::reference_image::validate_and_copy_reference;
use crate::hatching::rows::{derive_and_register_running_left, GENERATED_ROW_COUNT};
use crate::hatching::runtime::HatchingRuntimeManager;
use crate::hatching::session::{
    append_runtime_feed, BriefSubmitOutcome, GeneratedRowKey, GenerationProgress, HatchingPhase,
    HatchingSession, ImageArtifact, ImageMetadata, OrphanSummary, PetBrief, PetIdPreview,
    PromptDraft, ReferenceDescriptionStatus, ReferenceImage, RowKey, RowState, RowStatus,
    RuntimeFeedTone, SourceProvenance,
};
use crate::runtime::json_rpc::JsonRpcClient;
use crate::state::library::{normalize_display_name_to_pet_id, resolve_pet_id_collision};
use crate::state::AppPaths;
use image::{imageops::FilterType, GenericImage, ImageBuffer, Rgba, RgbaImage};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;
use uuid::Uuid;

type SharedHatchingRuntimeManager = Arc<Mutex<HatchingRuntimeManager>>;

fn normalize_ws(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn ready_reference_description(session: &HatchingSession) -> Option<&str> {
    session
        .reference_image
        .as_ref()
        .filter(|reference| reference.description_status == ReferenceDescriptionStatus::Ready)
        .and_then(|reference| reference.description.as_deref())
}

fn base_prompt_for_session(session: &HatchingSession, brief: &PetBrief) -> String {
    session
        .prompt_drafts
        .iter()
        .find(|draft| draft.row_key == RowKey::Idle)
        .map(|draft| draft.prompt.clone())
        .unwrap_or_else(|| {
            crate::hatching::prototype::build_initial_prompt(
                brief,
                session.archetype.as_deref(),
                ready_reference_description(session),
            )
        })
}

fn prompt_draft_row_order() -> [(RowKey, &'static str, bool, Option<RowKey>); 9] {
    [
        (RowKey::Idle, "base · idle", true, None),
        (RowKey::RunningRight, "running-right", true, None),
        (
            RowKey::RunningLeft,
            "running-left · derived",
            false,
            Some(RowKey::RunningRight),
        ),
        (RowKey::Waving, "waving", true, None),
        (RowKey::Jumping, "jumping", true, None),
        (RowKey::Failed, "failed", true, None),
        (RowKey::Waiting, "waiting", true, None),
        (RowKey::Running, "running · focused work loop", true, None),
        (RowKey::Review, "review", true, None),
    ]
}

fn generated_key_for_row(row_key: &RowKey) -> Option<GeneratedRowKey> {
    match row_key {
        RowKey::Idle => Some(GeneratedRowKey::Idle),
        RowKey::RunningRight => Some(GeneratedRowKey::RunningRight),
        RowKey::RunningLeft => None,
        RowKey::Waving => Some(GeneratedRowKey::Waving),
        RowKey::Jumping => Some(GeneratedRowKey::Jumping),
        RowKey::Failed => Some(GeneratedRowKey::Failed),
        RowKey::Waiting => Some(GeneratedRowKey::Waiting),
        RowKey::Running => Some(GeneratedRowKey::Running),
        RowKey::Review => Some(GeneratedRowKey::Review),
    }
}

fn prompt_for_row(session: &HatchingSession, row_key: &RowKey, brief: &PetBrief) -> String {
    if let Some(saved) = session
        .prompt_drafts
        .iter()
        .find(|draft| &draft.row_key == row_key)
        .map(|draft| draft.prompt.clone())
    {
        return saved;
    }
    let base_identity_prompt = base_prompt_for_session(session, brief);
    generated_key_for_row(row_key)
        .map(|generated_key| {
            crate::hatching::rows::draft_row_prompt_from_brief(
                brief,
                &generated_key,
                &base_identity_prompt,
                session.archetype.as_deref(),
                ready_reference_description(session),
            )
        })
        .unwrap_or_else(|| "auto-mirrored from running-right · no separate generation".to_string())
}

fn build_prompt_drafts(session: &HatchingSession, brief: &PetBrief) -> Vec<PromptDraft> {
    let base_identity_prompt = crate::hatching::prototype::build_initial_prompt(
        brief,
        session.archetype.as_deref(),
        ready_reference_description(session),
    );
    prompt_draft_row_order()
        .into_iter()
        .map(|(row_key, label, editable, derived_from)| {
            let prompt = if let Some(generated_key) = generated_key_for_row(&row_key) {
                crate::hatching::rows::draft_row_prompt_from_brief(
                    brief,
                    &generated_key,
                    &base_identity_prompt,
                    session.archetype.as_deref(),
                    ready_reference_description(session),
                )
            } else {
                "auto-mirrored from running-right · no separate generation".to_string()
            };
            PromptDraft {
                row_key,
                label: label.to_string(),
                prompt,
                derived_from,
                editable,
            }
        })
        .collect()
}

fn validate_prompt_drafts(drafts: &[PromptDraft]) -> crate::error::AppResult<()> {
    use std::collections::HashMap;
    if drafts.len() != 9 {
        return Err(AppError::InvalidPetMetadata {
            path: PathBuf::from("<prompt-drafts>"),
            reason: format!("expected 9 prompt drafts, got {}", drafts.len()),
        });
    }
    let mut by_key = HashMap::<RowKey, &PromptDraft>::new();
    for draft in drafts {
        if by_key.insert(draft.row_key.clone(), draft).is_some() {
            return Err(AppError::InvalidPetMetadata {
                path: PathBuf::from("<prompt-drafts>"),
                reason: format!("duplicate prompt draft for {:?}", draft.row_key),
            });
        }
        if draft.editable && draft.prompt.trim().is_empty() {
            return Err(AppError::InvalidPetMetadata {
                path: PathBuf::from("<prompt-drafts>"),
                reason: format!("prompt draft for {:?} cannot be empty", draft.row_key),
            });
        }
    }
    for (row_key, _label, _editable, _derived_from) in prompt_draft_row_order() {
        if !by_key.contains_key(&row_key) {
            return Err(AppError::InvalidPetMetadata {
                path: PathBuf::from("<prompt-drafts>"),
                reason: format!("missing prompt draft for {:?}", row_key),
            });
        }
    }
    let running_left =
        by_key
            .get(&RowKey::RunningLeft)
            .ok_or_else(|| AppError::InvalidPetMetadata {
                path: PathBuf::from("<prompt-drafts>"),
                reason: "running-left prompt draft is required".to_string(),
            })?;
    if running_left.editable || running_left.derived_from != Some(RowKey::RunningRight) {
        return Err(AppError::InvalidPetMetadata {
            path: PathBuf::from("<prompt-drafts>"),
            reason: "running-left must be non-editable and derived from running-right".to_string(),
        });
    }
    Ok(())
}

async fn open_hatching_runtime_thread<E>(
    runtime_manager: &SharedHatchingRuntimeManager,
) -> Result<String, E>
where
    E: From<AppError>,
{
    let (_client, thread_id) =
        open_hatching_runtime_client_thread(runtime_manager, AppError::RuntimeNotStarted).await?;
    Ok(thread_id)
}

async fn open_hatching_runtime_client_thread<E>(
    runtime_manager: &SharedHatchingRuntimeManager,
    runtime_not_started: E,
) -> Result<(JsonRpcClient, String), E>
where
    E: From<AppError>,
{
    let mut manager = runtime_manager.lock().await;
    if manager.client().is_none() {
        manager.start().await.map_err(E::from)?;
    }
    let thread_id = manager.current_or_open_thread().await.map_err(E::from)?;
    let client = manager.client().ok_or(runtime_not_started)?.clone();
    Ok((client, thread_id))
}

fn runtime_manager_not_started_command() -> CommandError {
    CommandError {
        message: "Runtime manager not started".to_string(),
    }
}

/// Start a new hatching run.
///
/// Creates a new session, runtime home, and workspace directory.
/// Persists the session to disk.
#[allow(dead_code)]
#[tauri::command]
pub async fn start_hatching_run(app: AppHandle, state: State<'_, AppState>) -> CommandResult<Uuid> {
    let session_id = Uuid::new_v4();
    let session_id_str = session_id.to_string();
    let runtime_home = state.paths.hatching_runtime_home_dir(&session_id_str);
    let workspace = state.paths.hatching_workspace_dir(&session_id_str);
    tokio::fs::create_dir_all(&runtime_home)
        .await
        .map_err(|e| AppError::IoWithPath {
            path: runtime_home.clone(),
            source: e,
        })?;
    tokio::fs::create_dir_all(&workspace)
        .await
        .map_err(|e| AppError::IoWithPath {
            path: workspace.clone(),
            source: e,
        })?;
    let session = HatchingSession {
        id: session_id,
        runtime_home: runtime_home.clone(),
        workspace: workspace.clone(),
        codex_thread_id: None,
        brief: None,
        archetype: None,
        reference_image: None,
        prototype: None,
        rows: std::collections::HashMap::new(),
        prompt_drafts: Vec::new(),
        runtime_feed: Vec::new(),
        atlas_review: None,
        phase: HatchingPhase::Inspiration,
        created_at: time::OffsetDateTime::now_utc(),
    };
    let registry = Arc::clone(&state.hatching_session_registry);
    registry.insert(session).await.map_err(CommandError::from)?;

    if let Some(window) = app.get_webview_window("hatching-wizard") {
        window.show().map_err(|error| {
            AppError::CommandFailed("show hatching wizard".to_string(), error.to_string())
        })?;
        window.set_focus().map_err(|error| {
            AppError::CommandFailed("focus hatching wizard".to_string(), error.to_string())
        })?;
    }

    Ok(session_id)
}

/// Cancel an in-progress hatching run.
///
/// Tears down the runtime home and deletes the workspace directory.
#[allow(dead_code)]
#[tauri::command]
pub async fn cancel_hatching_run(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: Uuid,
) -> CommandResult<()> {
    let session_id_str = session_id.to_string();
    let workspace = state.paths.hatching_workspace_dir(&session_id_str);
    let registry = Arc::clone(&state.hatching_session_registry);
    let _ = registry.remove(session_id).await; // Ignore errors if session doesn't exist
    let _ = state
        .hatching_runtime_registry
        .teardown_and_remove(session_id)
        .await; // Ignore errors if runtime doesn't exist
    if workspace.exists() {
        tokio::fs::remove_dir_all(&workspace)
            .await
            .map_err(|e| AppError::IoWithPath {
                path: workspace.clone(),
                source: e,
            })?;
    }

    if let Some(window) = app.get_webview_window("hatching-wizard") {
        let _ = window.hide();
    }

    Ok(())
}

/// Get the current state of a hatching session.
#[allow(dead_code)]
#[tauri::command]
pub async fn get_hatching_state(
    state: State<'_, AppState>,
    session_id: Uuid,
) -> CommandResult<HatchingSession> {
    let registry = Arc::clone(&state.hatching_session_registry);
    registry.get(session_id).await.map_err(|e| e.into())
}

/// Submit the pet brief for a hatching session.
///
/// Validates that the brief has non-empty display_name, description, and a normalized/unique pet_id.
/// If the brief changes after prototype iterations have started, invalidates the prototype state.
#[allow(dead_code)]
#[tauri::command]
pub async fn submit_brief(
    state: State<'_, AppState>,
    session_id: Uuid,
    brief: PetBrief,
    archetype_id: Option<String>,
    _reference_image_id: Option<Uuid>,
) -> CommandResult<BriefSubmitOutcome> {
    if brief.display_name.trim().is_empty() {
        return Err(AppError::InvalidPetMetadata {
            path: PathBuf::from("<brief>"),
            reason: "display_name cannot be empty".to_string(),
        }
        .into());
    }
    if brief.description.trim().is_empty() {
        return Err(AppError::InvalidPetMetadata {
            path: PathBuf::from("<brief>"),
            reason: "description cannot be empty".to_string(),
        }
        .into());
    }

    ensure_brief_pet_id_available(&state.paths, &brief.pet_id).map_err(CommandError::from)?;

    let registry = Arc::clone(&state.hatching_session_registry);
    let mut session = registry.get(session_id).await.map_err(CommandError::from)?;

    // Brief changes after prototype iterations require confirmation before mutation.
    let brief_changed = session
        .brief
        .as_ref()
        .map(|old_brief| {
            normalize_ws(&old_brief.display_name) != normalize_ws(&brief.display_name)
                || normalize_ws(&old_brief.description) != normalize_ws(&brief.description)
                || old_brief.personality != brief.personality
                || old_brief.palette != brief.palette
                || old_brief.backstory.as_deref().map(normalize_ws)
                    != brief.backstory.as_deref().map(normalize_ws)
                || old_brief.speech_style.as_deref().map(normalize_ws)
                    != brief.speech_style.as_deref().map(normalize_ws)
                || old_brief.behavioral_quirks.as_deref().map(normalize_ws)
                    != brief.behavioral_quirks.as_deref().map(normalize_ws)
                || old_brief.visual_notes.as_deref().map(normalize_ws)
                    != brief.visual_notes.as_deref().map(normalize_ws)
        })
        .unwrap_or(false);

    let archetype_changed = session.archetype != archetype_id;
    let invalidates_iterations =
        (brief_changed || archetype_changed) && session.prototype.is_some();
    if invalidates_iterations {
        return Ok(BriefSubmitOutcome {
            invalidates_iterations: true,
            requires_confirmation: true,
        });
    }

    if brief_changed || archetype_changed {
        session.prompt_drafts.clear();
        session.atlas_review = None;
    }
    session.brief = Some(brief);
    session.archetype = archetype_id;
    session.phase = HatchingPhase::Prompts;

    registry.update(session).await.map_err(CommandError::from)?;

    Ok(BriefSubmitOutcome {
        invalidates_iterations: false,
        requires_confirmation: false,
    })
}

#[allow(dead_code)]
#[tauri::command]
pub async fn confirm_brief_change(
    state: State<'_, AppState>,
    session_id: Uuid,
    brief: PetBrief,
    archetype_id: Option<String>,
) -> CommandResult<BriefSubmitOutcome> {
    ensure_brief_pet_id_available(&state.paths, &brief.pet_id).map_err(CommandError::from)?;
    let registry = Arc::clone(&state.hatching_session_registry);
    let mut session = registry.get(session_id).await.map_err(CommandError::from)?;
    session.prototype = None;
    session.rows.clear();
    session.prompt_drafts.clear();
    session.atlas_review = None;
    session.brief = Some(brief);
    session.archetype = archetype_id;
    session.phase = HatchingPhase::Prompts;
    registry.update(session).await.map_err(CommandError::from)?;
    Ok(BriefSubmitOutcome {
        invalidates_iterations: true,
        requires_confirmation: false,
    })
}

fn ensure_brief_pet_id_available(paths: &AppPaths, pet_id: &str) -> crate::error::AppResult<()> {
    let available_pet_id = resolve_pet_id_collision(paths, pet_id)?;
    if available_pet_id != pet_id {
        return Err(AppError::PetAlreadyExists(pet_id.to_string()));
    }
    Ok(())
}

#[allow(dead_code)]
#[tauri::command]
pub async fn draft_prompt_review(
    state: State<'_, AppState>,
    session_id: Uuid,
) -> CommandResult<Vec<PromptDraft>> {
    let registry = Arc::clone(&state.hatching_session_registry);
    let mut session = registry.get(session_id).await.map_err(CommandError::from)?;
    let brief = session
        .brief
        .as_ref()
        .ok_or_else(|| AppError::HatchingBriefMissing(session_id.to_string()))
        .map_err(CommandError::from)?
        .clone();
    if !session.prompt_drafts.is_empty() {
        return Ok(session.prompt_drafts.clone());
    }
    let drafts = build_prompt_drafts(&session, &brief);
    session.prompt_drafts = drafts.clone();
    session.phase = HatchingPhase::Prompts;
    append_runtime_feed(
        &mut session,
        RuntimeFeedTone::Info,
        "animation prompts drafted from brief",
    );
    registry.update(session).await.map_err(CommandError::from)?;
    Ok(drafts)
}

#[allow(dead_code)]
#[tauri::command]
pub async fn save_prompt_drafts(
    state: State<'_, AppState>,
    session_id: Uuid,
    drafts: Vec<PromptDraft>,
) -> CommandResult<()> {
    validate_prompt_drafts(&drafts).map_err(CommandError::from)?;
    let registry = Arc::clone(&state.hatching_session_registry);
    let mut session = registry.get(session_id).await.map_err(CommandError::from)?;
    if !matches!(
        session.phase,
        HatchingPhase::Prompts | HatchingPhase::Prototype
    ) {
        return Err(AppError::CommandFailed(
            "save_prompt_drafts".to_string(),
            "prompt drafts can only be saved during Prompts or Prototype".to_string(),
        )
        .into());
    }
    session.prompt_drafts = drafts;
    session.phase = HatchingPhase::Prototype;
    append_runtime_feed(
        &mut session,
        RuntimeFeedTone::Ok,
        "animation prompts approved; prototype gate ready",
    );
    registry.update(session).await.map_err(CommandError::from)?;
    Ok(())
}

/// Upload and validate a reference image for a hatching session.
#[allow(dead_code)]
#[tauri::command]
pub async fn upload_reference_image(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: Uuid,
    local_path: String,
) -> CommandResult<ReferenceImage> {
    let session_id_str = session_id.to_string();
    let workspace = state.paths.hatching_workspace_dir(&session_id_str);
    let path = PathBuf::from(local_path);

    let reference = validate_and_copy_reference(&path, &workspace)
        .await
        .map_err(CommandError::from)?;
    let registry = Arc::clone(&state.hatching_session_registry);
    let mut session = registry.get(session_id).await.map_err(CommandError::from)?;
    session.reference_image = Some(reference.clone());
    registry.update(session).await.map_err(CommandError::from)?;
    spawn_reference_prefetch(
        app,
        Arc::clone(&state.hatching_session_registry),
        Arc::clone(&state.hatching_runtime_registry),
        session_id,
        reference.id,
    );
    Ok(reference)
}

/// List orphan hatching sessions.
///
/// Returns sessions that were interrupted before completion.
#[allow(dead_code)]
#[tauri::command]
pub async fn list_orphan_hatching_sessions(
    state: State<'_, AppState>,
) -> CommandResult<Vec<OrphanSummary>> {
    let registry = Arc::clone(&state.hatching_session_registry);
    let sessions = registry.list_all().await;

    let orphans: Vec<OrphanSummary> = sessions
        .into_iter()
        .filter(|s| !matches!(s.phase, HatchingPhase::Done { .. }))
        .map(|s| OrphanSummary {
            session_id: s.id,
            display_name: s.brief.as_ref().map(|b| b.display_name.clone()),
            phase: s.phase,
            created_at: s.created_at,
        })
        .collect();

    Ok(orphans)
}

#[allow(dead_code)]
#[tauri::command]
pub async fn describe_reference_image(
    state: State<'_, AppState>,
    session_id: Uuid,
    reference_image_id: Uuid,
) -> CommandResult<String> {
    let mut session = Arc::clone(&state.hatching_session_registry)
        .get(session_id)
        .await
        .map_err(CommandError::from)?;
    let reference_image = session
        .reference_image
        .as_ref()
        .ok_or_else(|| AppError::ReferenceImageMissing(session_id.to_string()))
        .map_err(CommandError::from)?;

    if reference_image.id != reference_image_id {
        return Err(AppError::ReferenceImageMissing(reference_image_id.to_string()).into());
    }

    let image_path = reference_image.path.clone();

    let runtime_manager = Arc::clone(&state.hatching_runtime_registry)
        .get_or_create(session_id)
        .await;
    let thread_id = open_hatching_runtime_thread::<CommandError>(&runtime_manager).await?;
    session.codex_thread_id = Some(thread_id.clone());
    Arc::clone(&state.hatching_session_registry)
        .update(session)
        .await
        .map_err(CommandError::from)?;

    let manager_guard = runtime_manager.lock().await;
    crate::hatching::vision::describe_reference_image(&manager_guard, &thread_id, &image_path)
        .await
        .map_err(CommandError::from)
}

#[allow(dead_code)]
#[tauri::command]
pub async fn generate_prototype(
    state: State<'_, AppState>,
    session_id: Uuid,
    feedback: Option<String>,
) -> CommandResult<crate::hatching::session::PrototypeIteration> {
    let mut session = Arc::clone(&state.hatching_session_registry)
        .get(session_id)
        .await
        .map_err(CommandError::from)?;

    let brief = session
        .brief
        .as_ref()
        .ok_or_else(|| AppError::HatchingBriefMissing(session_id.to_string()))
        .map_err(CommandError::from)?;
    let initial_prompt = base_prompt_for_session(&session, brief);
    let prompt = session
        .prototype
        .as_ref()
        .and_then(|prototype| prototype.iterations.get(prototype.current))
        .map(|iteration| iteration.revised_prompt.clone())
        .unwrap_or(initial_prompt);
    let brief = brief.clone();
    let reference_image_path = session.reference_image.as_ref().map(|ri| ri.path.clone());

    let runtime_manager = Arc::clone(&state.hatching_runtime_registry)
        .get_or_create(session_id)
        .await;

    let (client, thread_id) = open_hatching_runtime_client_thread(
        &runtime_manager,
        runtime_manager_not_started_command(),
    )
    .await?;
    session.codex_thread_id = Some(thread_id.clone());
    let iteration_n = session
        .prototype
        .as_ref()
        .map(|p| p.iterations.len() as u32 + 1)
        .unwrap_or(1);
    let runtime_guard = runtime_manager.lock().await;
    let iteration = crate::hatching::prototype::generate_prototype(
        crate::hatching::prototype::PrototypeGenerationRequest {
            client: &client,
            runtime: &runtime_guard,
            thread_id: &thread_id,
            prompt: &prompt,
            reference_image_path: reference_image_path.as_ref(),
            feedback: feedback.as_deref(),
            brief: &brief,
            iteration_n,
            runtime_home: &session.runtime_home,
            workspace: &session.workspace,
        },
    )
    .await
    .map_err(CommandError::from)?;
    if session.prototype.is_none() {
        session.prototype = Some(crate::hatching::session::PrototypeState {
            iterations: vec![],
            current: 0,
        });
    }

    if let Some(prototype) = &mut session.prototype {
        prototype.iterations.push(iteration.clone());
        prototype.current = prototype.iterations.len() - 1;
    }
    session.phase = HatchingPhase::Prototype;
    Arc::clone(&state.hatching_session_registry)
        .update(session)
        .await
        .map_err(CommandError::from)?;

    Ok(iteration)
}

#[allow(dead_code)]
#[tauri::command]
pub async fn revert_to_iteration(
    state: State<'_, AppState>,
    session_id: Uuid,
    iteration_n: u32,
) -> CommandResult<()> {
    let registry = Arc::clone(&state.hatching_session_registry);
    let mut session = registry.get(session_id).await.map_err(CommandError::from)?;
    let prototype = session.prototype.as_mut().ok_or_else(|| CommandError {
        message: "No prototype iterations exist for this session".to_string(),
    })?;
    let index = prototype
        .iterations
        .iter()
        .position(|iteration| iteration.n == iteration_n)
        .ok_or_else(|| CommandError {
            message: format!("Prototype iteration {iteration_n} does not exist"),
        })?;
    prototype.current = index;
    registry.update(session).await.map_err(CommandError::from)?;
    Ok(())
}

#[allow(dead_code)]
#[tauri::command]
pub async fn accept_prototype(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: Uuid,
) -> CommandResult<()> {
    let registry = Arc::clone(&state.hatching_session_registry);
    let mut session = registry.get(session_id).await.map_err(CommandError::from)?;
    let (current_iteration, prototype_iteration_count) = {
        let prototype = session
            .prototype
            .as_ref()
            .ok_or_else(|| AppError::PrototypeMissing(session_id.to_string()))
            .map_err(CommandError::from)?;
        let current_iteration = prototype
            .iterations
            .get(prototype.current)
            .ok_or_else(|| AppError::PrototypeMissing(session_id.to_string()))
            .map_err(CommandError::from)?
            .clone();
        (current_iteration, prototype.iterations.len() as u32)
    };
    let idle_row = materialize_prototype_as_idle_row(&mut session, &current_iteration)
        .await
        .map_err(CommandError::from)?;
    session.rows.insert(RowKey::Idle, idle_row);
    append_runtime_feed(&mut session, RuntimeFeedTone::Ok, "prototype accepted");
    append_runtime_feed(
        &mut session,
        RuntimeFeedTone::Info,
        "canonical_identity_reference set to decoded/base.png",
    );
    append_runtime_feed(
        &mut session,
        RuntimeFeedTone::Ok,
        format!(
            "base / idle materialized from prototype try {}",
            current_iteration.n
        ),
    );
    session.phase = HatchingPhase::Generating(GenerationProgress {
        rows_completed: 0,
        rows_total: GENERATED_ROW_COUNT,
        estimated_remaining: std::time::Duration::from_secs(0),
        total_imagegen_calls: prototype_iteration_count,
    });
    registry.update(session).await.map_err(CommandError::from)?;
    spawn_row_generation(
        app,
        Arc::clone(&state.hatching_session_registry),
        Arc::clone(&state.hatching_runtime_registry),
        state.paths.clone(),
        session_id,
    );
    Ok(())
}

async fn materialize_prototype_as_idle_row(
    session: &mut HatchingSession,
    current_iteration: &crate::hatching::session::PrototypeIteration,
) -> crate::error::AppResult<RowState> {
    let brief = session
        .brief
        .as_ref()
        .ok_or_else(|| AppError::HatchingBriefMissing(session.id.to_string()))?;
    let decoded_dir = session.workspace.join("decoded");
    let frames_dir = session.workspace.join("frames").join("idle");
    tokio::fs::create_dir_all(&decoded_dir).await?;
    tokio::fs::create_dir_all(&frames_dir).await?;

    let base_path = decoded_dir.join("base.png");
    tokio::fs::copy(&current_iteration.image.output_path, &base_path).await?;

    let normalized_frame = normalize_prototype_frame(&current_iteration.image.output_path)?;
    let idle_path = decoded_dir.join("idle.png");
    normalized_frame.save(&idle_path)?;
    for index in 0..crate::hatching::rows::frame_count(&RowKey::Idle) {
        normalized_frame.save(frames_dir.join(format!("{index:02}.png")))?;
    }

    let output_sha256 = crate::hatching::atlas::file_sha256(&idle_path)?;
    let source_sha256 =
        current_iteration.image.source_sha256.clone().or_else(|| {
            crate::hatching::atlas::file_sha256(&current_iteration.image.source_path).ok()
        });
    Ok(RowState {
        prompt: prompt_for_row(session, &RowKey::Idle, brief),
        image: Some(ImageArtifact {
            source_path: current_iteration.image.source_path.clone(),
            output_path: idle_path,
            source_provenance: current_iteration.image.source_provenance.clone(),
            source_sha256,
            output_sha256,
            metadata: ImageMetadata {
                width: crate::hatching::atlas::CELL_WIDTH,
                height: crate::hatching::atlas::CELL_HEIGHT,
                mode: "RGBA".to_string(),
                format: "PNG".to_string(),
            },
        }),
        derived_from: None,
        mirror_decision: None,
        attempts: current_iteration.n,
        last_error: None,
        status: RowStatus::Ready,
    })
}

fn normalize_prototype_frame(source_path: &Path) -> crate::error::AppResult<RgbaImage> {
    let source = image::open(source_path)?.to_rgba8();
    let width_scale = crate::hatching::atlas::CELL_WIDTH as f32 / source.width().max(1) as f32;
    let height_scale = crate::hatching::atlas::CELL_HEIGHT as f32 / source.height().max(1) as f32;
    let scale = width_scale.min(height_scale).min(1.0);
    let target_width = ((source.width() as f32 * scale).round() as u32).max(1);
    let target_height = ((source.height() as f32 * scale).round() as u32).max(1);
    let resized =
        image::imageops::resize(&source, target_width, target_height, FilterType::Nearest);
    let mut canvas = ImageBuffer::from_pixel(
        crate::hatching::atlas::CELL_WIDTH,
        crate::hatching::atlas::CELL_HEIGHT,
        Rgba([0, 0, 0, 0]),
    );
    let x = (crate::hatching::atlas::CELL_WIDTH - target_width) / 2;
    let y = (crate::hatching::atlas::CELL_HEIGHT - target_height) / 2;
    canvas.copy_from(&resized, x, y)?;
    Ok(canvas)
}

#[allow(dead_code)]
#[tauri::command]
pub async fn regenerate_row(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: Uuid,
    row_key: String,
) -> CommandResult<crate::hatching::session::RowState> {
    let mut session = Arc::clone(&state.hatching_session_registry)
        .get(session_id)
        .await
        .map_err(CommandError::from)?;

    let parsed_row_key =
        crate::hatching::rows::row_key_from_str(&row_key).map_err(CommandError::from)?;
    if parsed_row_key == RowKey::Idle {
        return Err(AppError::CommandFailed(
            "regenerate_row".to_string(),
            "base / idle is controlled by the prototype gate; return to Prototype to change it"
                .to_string(),
        )
        .into());
    }
    let target_row_key = if parsed_row_key == RowKey::RunningLeft {
        RowKey::RunningRight
    } else {
        parsed_row_key.clone()
    };

    let runtime_manager = Arc::clone(&state.hatching_runtime_registry)
        .get_or_create(session_id)
        .await;
    let (client, thread_id) = open_hatching_runtime_client_thread(
        &runtime_manager,
        runtime_manager_not_started_command(),
    )
    .await?;
    session.codex_thread_id = Some(thread_id.clone());
    Arc::clone(&state.hatching_session_registry)
        .update(session.clone())
        .await
        .map_err(CommandError::from)?;

    let brief = session
        .brief
        .clone()
        .ok_or_else(|| AppError::HatchingBriefMissing(session_id.to_string()))
        .map_err(CommandError::from)?;
    let prompt = prompt_for_row(&session, &target_row_key, &brief);
    let canonical_ref = session.workspace.join("decoded/base.png");
    let row_state = crate::hatching::rows::regenerate_row(
        Some(&client),
        Some(&thread_id),
        target_row_key.clone(),
        Some(&prompt),
        Some(&canonical_ref),
        &session.runtime_home,
    )
    .await
    .map_err(CommandError::from)?;

    session
        .rows
        .insert(target_row_key.clone(), row_state.clone());
    if target_row_key == RowKey::RunningRight {
        derive_and_register_running_left(
            &mut session,
            "Re-derived after running-right regeneration",
        )
        .await
        .map_err(CommandError::from)?;
        append_runtime_feed(
            &mut session,
            RuntimeFeedTone::Ok,
            "running-left re-mirrored from regenerated running-right",
        );
    }
    session.atlas_review = None;
    append_runtime_feed(
        &mut session,
        RuntimeFeedTone::Ok,
        format!(
            "{} regenerated from atlas review",
            crate::hatching::rows::row_slug(&target_row_key)
        ),
    );
    if matches!(session.phase, HatchingPhase::Review) && row_state.status == RowStatus::Ready {
        let failures = session
            .rows
            .values()
            .filter(|row| row.status == RowStatus::Failed)
            .count();
        if failures == 0 {
            compose_and_validate_hatching_atlas(&app, &mut session)
                .await
                .map_err(CommandError::from)?;
            session.phase = HatchingPhase::Review;
        }
    }
    Arc::clone(&state.hatching_session_registry)
        .update(session)
        .await
        .map_err(CommandError::from)?;
    Ok(row_state)
}

#[allow(dead_code)]
#[tauri::command]
pub async fn import_hatched_pet(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: Uuid,
    activate: bool,
) -> CommandResult<String> {
    let registry = Arc::clone(&state.hatching_session_registry);
    let mut session = registry.get(session_id).await.map_err(CommandError::from)?;
    if !matches!(session.phase, HatchingPhase::Review) {
        return Err(AppError::CommandFailed(
            "import_hatched_pet".to_string(),
            "pet can only be imported after atlas review is ready".to_string(),
        )
        .into());
    }
    if session.atlas_review.is_none() {
        compose_and_validate_hatching_atlas(&app, &mut session)
            .await
            .map_err(CommandError::from)?;
    }
    session.phase = HatchingPhase::Importing;
    append_runtime_feed(
        &mut session,
        RuntimeFeedTone::Work,
        "packaging approved atlas for import",
    );
    registry
        .update(session.clone())
        .await
        .map_err(CommandError::from)?;
    let pet_id = package_and_import_hatched_pet(&app, &state.paths, &mut session, activate)
        .await
        .map_err(CommandError::from)?;
    registry
        .update(session.clone())
        .await
        .map_err(CommandError::from)?;
    let _ = state
        .hatching_runtime_registry
        .teardown_and_remove(session_id)
        .await;
    if session.workspace.exists() {
        let _ = tokio::fs::remove_dir_all(&session.workspace).await;
    }
    Ok(pet_id)
}

#[allow(dead_code)]
#[tauri::command]
pub async fn preview_pet_id(
    state: State<'_, AppState>,
    display_name: String,
) -> CommandResult<PetIdPreview> {
    let pet_id = normalize_display_name_to_pet_id(&display_name).map_err(CommandError::from)?;
    let resolved = resolve_pet_id_collision(&state.paths, &pet_id).map_err(CommandError::from)?;
    let available = resolved == pet_id;
    Ok(PetIdPreview {
        pet_id,
        available,
        suggestion: (!available).then_some(resolved),
    })
}

#[allow(dead_code)]
#[tauri::command]
pub async fn resume_hatching_run(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: Uuid,
) -> CommandResult<HatchingSession> {
    let session = Arc::clone(&state.hatching_session_registry)
        .get(session_id)
        .await
        .map_err(CommandError::from)?;
    let runtime_manager = Arc::clone(&state.hatching_runtime_registry)
        .get_or_create(session_id)
        .await;
    runtime_manager
        .lock()
        .await
        .reattach()
        .await
        .map_err(CommandError::from)?;
    if let Some(window) = app.get_webview_window("hatching-wizard") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(session)
}

fn spawn_reference_prefetch(
    app: AppHandle,
    registry: Arc<crate::hatching::session::HatchingSessionRegistry>,
    runtime_registry: Arc<crate::hatching::runtime::HatchingRuntimeManagerRegistry>,
    session_id: Uuid,
    reference_image_id: Uuid,
) {
    tauri::async_runtime::spawn(async move {
        let result = async {
            let mut session = registry.get(session_id).await?;
            let reference = session
                .reference_image
                .as_ref()
                .filter(|reference| reference.id == reference_image_id)
                .cloned()
                .ok_or_else(|| AppError::ReferenceImageMissing(reference_image_id.to_string()))?;
            let runtime_manager = runtime_registry.get_or_create(session_id).await;
            let thread_id = open_hatching_runtime_thread::<AppError>(&runtime_manager).await?;
            session.codex_thread_id = Some(thread_id.clone());
            registry.update(session.clone()).await?;
            let description = {
                let manager = runtime_manager.lock().await;
                crate::hatching::vision::prefetch_description(&manager, &thread_id, &reference.path)
                    .await?
            };
            let mut updated = registry.get(session_id).await?;
            if let Some(reference) = &mut updated.reference_image {
                if reference.id == reference_image_id {
                    reference.description = Some(description);
                    reference.description_status = ReferenceDescriptionStatus::Ready;
                    reference.described_at = Some(time::OffsetDateTime::now_utc());
                }
            }
            registry.update(updated).await?;
            Ok::<(), AppError>(())
        }
        .await;
        if let Err(error) = result {
            if let Ok(mut session) = registry.get(session_id).await {
                if let Some(reference) = &mut session.reference_image {
                    if reference.id == reference_image_id {
                        reference.description_status = ReferenceDescriptionStatus::Failed;
                        reference.description = Some(error.to_string());
                    }
                }
                let _ = registry.update(session).await;
            }
            let _ = app.emit(
                &format!("hatching://progress/{session_id}"),
                serde_json::json!({"error": error.to_string()}),
            );
        }
    });
}

fn spawn_row_generation(
    app: AppHandle,
    registry: Arc<crate::hatching::session::HatchingSessionRegistry>,
    runtime_registry: Arc<crate::hatching::runtime::HatchingRuntimeManagerRegistry>,
    paths: AppPaths,
    session_id: Uuid,
) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_row_generation(
            app.clone(),
            registry.clone(),
            runtime_registry,
            paths,
            session_id,
        )
        .await
        {
            if let Ok(mut session) = registry.get(session_id).await {
                session.phase = HatchingPhase::Review;
                let _ = registry.update(session).await;
            }
            let _ = app.emit(
                &format!("hatching://progress/{session_id}"),
                serde_json::json!({"error": error.to_string()}),
            );
        }
    });
}

struct RowOutcome {
    /// The generated or failed row state.
    row_state: RowState,
    /// Number of imagegen API calls made (0 for synthetic, 1 for real generation).
    imagegen_calls: u32,
}

/// Process a single generated row: draft prompt, set Generating placeholder, dispatch
/// generation (synthetic or real), and handle mirror derivation for RunningRight.
///
/// Mutates `session` directly (inserts placeholder, final row state, and RunningLeft when
/// applicable). The orchestrator is responsible for `registry.update` and `emit_progress`.
async fn process_one_row(
    session: &mut HatchingSession,
    session_id: Uuid,
    generated_key: GeneratedRowKey,
    client: Option<&JsonRpcClient>,
    thread_id: Option<&str>,
    canonical_reference: &std::path::Path,
    synthetic: bool,
) -> crate::error::AppResult<RowOutcome> {
    let row_key = crate::hatching::rows::generated_row_key(&generated_key);
    let brief = session
        .brief
        .clone()
        .ok_or_else(|| AppError::HatchingBriefMissing(session_id.to_string()))?;
    let prompt = prompt_for_row(session, &row_key, &brief);
    append_runtime_feed(
        session,
        RuntimeFeedTone::Work,
        format!(
            "$imagegen {} queued",
            crate::hatching::rows::row_slug(&row_key)
        ),
    );

    // Insert a Generating placeholder so the UI can react immediately.
    session.rows.insert(
        row_key.clone(),
        RowState {
            prompt: prompt.clone(),
            image: None,
            derived_from: None,
            mirror_decision: None,
            attempts: 0,
            last_error: None,
            status: RowStatus::Generating,
        },
    );

    append_runtime_feed(
        session,
        RuntimeFeedTone::Work,
        format!(
            "$imagegen {} running",
            crate::hatching::rows::row_slug(&row_key)
        ),
    );

    let (row_state, imagegen_calls) = if synthetic {
        let state =
            synthetic_row_state(&session.runtime_home, &session.workspace, &row_key, &prompt)
                .await?;
        (state, 0_u32)
    } else {
        let state = crate::hatching::rows::generate_single_row_with_retries(
            client.ok_or(AppError::RuntimeNotStarted)?,
            thread_id.ok_or(AppError::RuntimeNotStarted)?,
            generated_key,
            &prompt,
            canonical_reference,
            &session.runtime_home,
        )
        .await;
        (state, 1_u32)
    };

    session.rows.insert(row_key.clone(), row_state.clone());
    if row_state.status == RowStatus::Ready {
        append_runtime_feed(
            session,
            RuntimeFeedTone::Ok,
            format!("{} row ready", crate::hatching::rows::row_slug(&row_key)),
        );
    } else {
        append_runtime_feed(
            session,
            RuntimeFeedTone::Error,
            format!(
                "{} row failed: {}",
                crate::hatching::rows::row_slug(&row_key),
                row_state
                    .last_error
                    .as_deref()
                    .unwrap_or("unknown generation error")
            ),
        );
    }

    // Mirror derivation lives here for RunningRight: the per-row helper owns the
    // side-effect so the orchestrator loop stays free of row-specific branching.
    if row_key == RowKey::RunningRight {
        derive_and_register_running_left(
            session,
            "Derived deterministically from running-right after row generation",
        )
        .await?;
        append_runtime_feed(
            session,
            RuntimeFeedTone::Ok,
            "running-left mirrored from running-right (no imagegen)",
        );
    }

    Ok(RowOutcome {
        row_state,
        imagegen_calls,
    })
}

async fn run_row_generation(
    app: AppHandle,
    registry: Arc<crate::hatching::session::HatchingSessionRegistry>,
    runtime_registry: Arc<crate::hatching::runtime::HatchingRuntimeManagerRegistry>,
    _paths: AppPaths,
    session_id: Uuid,
) -> crate::error::AppResult<()> {
    let synthetic = std::env::var("HATCHING_ALLOW_SYNTHETIC").as_deref() == Ok("1");
    let mut session = registry.get(session_id).await?;
    let mut completed = 0_u32;
    let mut total_calls = session
        .prototype
        .as_ref()
        .map(|prototype| prototype.iterations.len() as u32)
        .ok_or_else(|| AppError::PrototypeMissing(session_id.to_string()))?;
    let canonical_reference = session.workspace.join("decoded/base.png");
    tokio::fs::create_dir_all(session.workspace.join("decoded")).await?;
    tokio::fs::create_dir_all(session.workspace.join("frames")).await?;

    let runtime = if synthetic {
        None
    } else {
        Some(runtime_registry.get_or_create(session_id).await)
    };
    let (client, thread_id) = if let Some(runtime) = &runtime {
        let (client, thread_id) =
            open_hatching_runtime_client_thread(runtime, AppError::RuntimeNotStarted).await?;
        session.codex_thread_id = Some(thread_id.clone());
        registry.update(session.clone()).await?;
        (Some(client), Some(thread_id))
    } else {
        (None, None)
    };

    for generated_key in crate::hatching::rows::GENERATED_ROWS {
        let outcome = process_one_row(
            &mut session,
            session_id,
            generated_key,
            client.as_ref(),
            thread_id.as_deref(),
            &canonical_reference,
            synthetic,
        )
        .await?;

        total_calls += outcome.imagegen_calls;
        if outcome.row_state.status == RowStatus::Ready {
            completed += 1;
        }

        let failed = session
            .rows
            .values()
            .filter(|row| row.status == RowStatus::Failed)
            .count();
        session.phase = HatchingPhase::Generating(GenerationProgress {
            rows_completed: completed,
            rows_total: GENERATED_ROW_COUNT,
            estimated_remaining: remaining_generation_time(completed),
            total_imagegen_calls: total_calls,
        });
        if failed >= 3 {
            session.phase = HatchingPhase::Review;
        }
        registry.update(session.clone()).await?;
        emit_progress(&app, session_id, completed, total_calls);
    }

    let failures = session
        .rows
        .values()
        .filter(|row| row.status == RowStatus::Failed)
        .count();
    if failures == 0 {
        append_runtime_feed(
            &mut session,
            RuntimeFeedTone::Work,
            "all rows ready; composing atlas for review",
        );
        compose_and_validate_hatching_atlas(&app, &mut session).await?;
        session.phase = HatchingPhase::Review;
        registry.update(session).await?;
    } else {
        session.phase = HatchingPhase::Review;
        append_runtime_feed(
            &mut session,
            RuntimeFeedTone::Warn,
            format!("{failures} row(s) need attention before atlas review can finish"),
        );
        registry.update(session).await?;
    }
    Ok(())
}

fn emit_progress(app: &AppHandle, session_id: Uuid, rows_completed: u32, total_calls: u32) {
    let _ = app.emit(
        &format!("hatching://progress/{session_id}"),
        GenerationProgress {
            rows_completed,
            rows_total: GENERATED_ROW_COUNT,
            estimated_remaining: remaining_generation_time(rows_completed),
            total_imagegen_calls: total_calls,
        },
    );
}

fn remaining_generation_time(rows_completed: u32) -> std::time::Duration {
    std::time::Duration::from_secs(GENERATED_ROW_COUNT.saturating_sub(rows_completed) as u64 * 30)
}

async fn synthetic_row_state(
    runtime_home: &std::path::Path,
    workspace: &std::path::Path,
    row_key: &RowKey,
    prompt: &str,
) -> crate::error::AppResult<RowState> {
    let generated_dir = runtime_home.join("generated_images").join("synthetic");
    tokio::fs::create_dir_all(&generated_dir).await?;
    let slug = crate::hatching::rows::row_slug(row_key);
    let source_path = generated_dir.join(format!("ig_{slug}.png"));
    let frame_count = crate::hatching::rows::frame_count(row_key);
    let mut strip = ImageBuffer::from_pixel(
        crate::hatching::atlas::CELL_WIDTH * frame_count,
        crate::hatching::atlas::CELL_HEIGHT,
        Rgba([0, 0, 0, 0]),
    );
    for frame in 0..frame_count {
        let base_x = frame * crate::hatching::atlas::CELL_WIDTH + 20 + (frame % 5);
        let base_y = 60 + (frame % 7);
        for y in base_y..base_y + 16 {
            for x in base_x..base_x + 16 {
                strip.put_pixel(x, y, Rgba([80u8, 120u8, 220u8, 255u8]));
            }
        }
    }
    strip.save(&source_path)?;
    let source_bytes = tokio::fs::read(&source_path).await?;
    let source_sha256 = Some(format!("{:x}", Sha256::digest(&source_bytes)));
    let decoded_dir = workspace.join("decoded");
    tokio::fs::create_dir_all(&decoded_dir).await?;
    let output_path = decoded_dir.join(format!("{slug}.png"));
    tokio::fs::copy(&source_path, &output_path).await?;
    let output_bytes = tokio::fs::read(&output_path).await?;
    let artifact = ImageArtifact {
        source_path,
        output_path: output_path.clone(),
        source_provenance: SourceProvenance::SyntheticTest,
        source_sha256,
        output_sha256: format!("{:x}", Sha256::digest(&output_bytes)),
        metadata: ImageMetadata {
            width: strip.width(),
            height: strip.height(),
            mode: "RGBA".to_string(),
            format: "PNG".to_string(),
        },
    };
    crate::hatching::rows::split_row_strip_to_frames(&output_path, row_key, workspace)?;
    Ok(RowState {
        prompt: prompt.to_string(),
        image: Some(artifact),
        derived_from: None,
        mirror_decision: None,
        attempts: 1,
        last_error: None,
        status: RowStatus::Ready,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hatching::session::{HatchingPhase, PrototypeIteration, PrototypeState};

    fn valid_prompt_drafts_for_test() -> Vec<PromptDraft> {
        prompt_draft_row_order()
            .into_iter()
            .map(|(row_key, label, editable, derived_from)| PromptDraft {
                row_key,
                label: label.to_string(),
                prompt: if editable {
                    "draw this row".to_string()
                } else {
                    "auto-mirrored from running-right · no separate generation".to_string()
                },
                derived_from,
                editable,
            })
            .collect()
    }

    #[test]
    fn prompt_drafts_require_running_left_to_be_derived() {
        let drafts = valid_prompt_drafts_for_test();
        let running_left = drafts
            .iter()
            .find(|draft| draft.row_key == RowKey::RunningLeft)
            .expect("running-left draft");

        assert!(!running_left.editable);
        assert_eq!(running_left.derived_from, Some(RowKey::RunningRight));
        validate_prompt_drafts(&drafts).expect("valid derived running-left");

        let mut invalid = drafts;
        let running_left = invalid
            .iter_mut()
            .find(|draft| draft.row_key == RowKey::RunningLeft)
            .expect("running-left draft");
        running_left.editable = true;

        assert!(validate_prompt_drafts(&invalid).is_err());
    }

    #[test]
    fn brief_pet_id_validation_rejects_invalid_custom_id() {
        let root = tempfile::tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));

        assert!(matches!(
            ensure_brief_pet_id_available(&paths, "Bad.Pet"),
            Err(AppError::InvalidPetMetadata { .. })
        ));
    }

    #[test]
    fn brief_pet_id_validation_rejects_reserved_custom_id() {
        let root = tempfile::tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));

        assert!(matches!(
            ensure_brief_pet_id_available(&paths, "hatching"),
            Err(AppError::InvalidPetMetadata { .. })
        ));
    }

    #[test]
    fn brief_change_invalidation_clears_prototype() {
        use std::collections::HashMap;

        let id = Uuid::new_v4();
        let mut session = crate::hatching::session::HatchingSession {
            id,
            runtime_home: PathBuf::from("/tmp/runtime"),
            workspace: PathBuf::from("/tmp/workspace"),
            codex_thread_id: None,
            brief: Some(PetBrief {
                display_name: "Old Name".to_string(),
                pet_id: "old-name".to_string(),
                description: "Old description".to_string(),
                personality: vec!["old".to_string()],
                palette: None,
                backstory: None,
                speech_style: None,
                behavioral_quirks: None,
                visual_notes: None,
            }),
            archetype: None,
            reference_image: None,
            prototype: Some(PrototypeState {
                iterations: vec![PrototypeIteration {
                    n: 1,
                    revised_prompt: "old prompt".to_string(),
                    summary_of_changes: "initial".to_string(),
                    user_feedback: None,
                    image: crate::hatching::session::ImageArtifact {
                        source_path: PathBuf::from("/tmp/source.png"),
                        output_path: PathBuf::from("/tmp/output.png"),
                        source_provenance:
                            crate::hatching::session::SourceProvenance::BuiltInImagegen,
                        source_sha256: Some("abc".to_string()),
                        output_sha256: "def".to_string(),
                        metadata: crate::hatching::session::ImageMetadata {
                            width: 192,
                            height: 208,
                            mode: "RGBA".to_string(),
                            format: "PNG".to_string(),
                        },
                    },
                    generated_at: time::OffsetDateTime::now_utc(),
                }],
                current: 0,
            }),
            rows: HashMap::new(),
            prompt_drafts: Vec::new(),
            runtime_feed: Vec::new(),
            atlas_review: None,
            phase: HatchingPhase::Prototype,
            created_at: time::OffsetDateTime::now_utc(),
        };

        let new_brief = PetBrief {
            display_name: "New Name".to_string(),
            pet_id: "new-name".to_string(),
            description: "New description".to_string(),
            personality: vec!["new".to_string()],
            palette: None,
            backstory: None,
            speech_style: None,
            behavioral_quirks: None,
            visual_notes: None,
        };

        let brief_changed = session
            .brief
            .as_ref()
            .map(|old_brief| {
                old_brief.display_name != new_brief.display_name
                    || old_brief.description != new_brief.description
                    || old_brief.personality != new_brief.personality
                    || old_brief.palette != new_brief.palette
                    || old_brief.backstory != new_brief.backstory
                    || old_brief.speech_style != new_brief.speech_style
                    || old_brief.behavioral_quirks != new_brief.behavioral_quirks
                    || old_brief.visual_notes != new_brief.visual_notes
            })
            .unwrap_or(false);

        assert!(brief_changed);

        if brief_changed {
            session.prototype = None;
            if matches!(
                session.phase,
                HatchingPhase::Prototype
                    | HatchingPhase::Generating(_)
                    | HatchingPhase::Review
                    | HatchingPhase::Importing
            ) {
                session.phase = HatchingPhase::Prompts;
            }
        }

        assert!(session.prototype.is_none());
        assert!(matches!(session.phase, HatchingPhase::Prompts));
    }

    #[test]
    fn brief_unchanged_does_not_invalidate_prototype() {
        use std::collections::HashMap;

        let id = Uuid::new_v4();
        let original_brief = PetBrief {
            display_name: "Same Name".to_string(),
            pet_id: "same-name".to_string(),
            description: "Same description".to_string(),
            personality: vec!["same".to_string()],
            palette: None,
            backstory: None,
            speech_style: None,
            behavioral_quirks: None,
            visual_notes: None,
        };

        let session = crate::hatching::session::HatchingSession {
            id,
            runtime_home: PathBuf::from("/tmp/runtime"),
            workspace: PathBuf::from("/tmp/workspace"),
            codex_thread_id: None,
            brief: Some(original_brief.clone()),
            archetype: None,
            reference_image: None,
            prototype: Some(PrototypeState {
                iterations: vec![],
                current: 0,
            }),
            rows: HashMap::new(),
            prompt_drafts: Vec::new(),
            runtime_feed: Vec::new(),
            atlas_review: None,
            phase: HatchingPhase::Prototype,
            created_at: time::OffsetDateTime::now_utc(),
        };

        let brief_changed = session
            .brief
            .as_ref()
            .map(|old_brief| {
                old_brief.display_name != original_brief.display_name
                    || old_brief.description != original_brief.description
                    || old_brief.personality != original_brief.personality
                    || old_brief.palette != original_brief.palette
                    || old_brief.backstory != original_brief.backstory
                    || old_brief.speech_style != original_brief.speech_style
                    || old_brief.behavioral_quirks != original_brief.behavioral_quirks
                    || old_brief.visual_notes != original_brief.visual_notes
            })
            .unwrap_or(false);

        assert!(!brief_changed);

        assert!(session.prototype.is_some());
        assert!(matches!(session.phase, HatchingPhase::Prototype));
    }

    #[tokio::test]
    async fn accept_prototype_materializes_idle_frames() {
        use crate::hatching::session::{ImageArtifact, ImageMetadata, PetBrief, SourceProvenance};
        use image::{ImageBuffer, Rgba};
        use std::collections::HashMap;

        let temp_dir = tempfile::tempdir().unwrap();
        let runtime_home = temp_dir.path().join("runtime");
        let workspace = temp_dir.path().join("workspace");
        std::fs::create_dir_all(&runtime_home).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();
        let source_path = runtime_home.join("generated_images/thread/ig_source.png");
        std::fs::create_dir_all(source_path.parent().unwrap()).unwrap();
        let output_path = workspace.join("artifacts/ig_source.png");
        std::fs::create_dir_all(output_path.parent().unwrap()).unwrap();
        let image = ImageBuffer::from_pixel(384, 416, Rgba([80u8, 120u8, 160u8, 255u8]));
        image.save(&source_path).unwrap();
        image.save(&output_path).unwrap();

        let mut session = crate::hatching::session::HatchingSession {
            id: Uuid::new_v4(),
            runtime_home,
            workspace: workspace.clone(),
            codex_thread_id: None,
            brief: Some(PetBrief {
                display_name: "Moose".to_string(),
                pet_id: "moose".to_string(),
                description: "A good dog".to_string(),
                personality: vec!["loyal".to_string()],
                palette: None,
                backstory: None,
                speech_style: None,
                behavioral_quirks: None,
                visual_notes: None,
            }),
            archetype: None,
            reference_image: None,
            prototype: None,
            rows: HashMap::new(),
            prompt_drafts: Vec::new(),
            runtime_feed: Vec::new(),
            atlas_review: None,
            phase: HatchingPhase::Prototype,
            created_at: time::OffsetDateTime::now_utc(),
        };
        let iteration = PrototypeIteration {
            n: 2,
            revised_prompt: "base prompt".to_string(),
            summary_of_changes: "smaller ears".to_string(),
            user_feedback: None,
            image: ImageArtifact {
                source_path: source_path.clone(),
                output_path,
                source_provenance: SourceProvenance::BuiltInImagegen,
                source_sha256: Some("source".to_string()),
                output_sha256: "output".to_string(),
                metadata: ImageMetadata {
                    width: 384,
                    height: 416,
                    mode: "RGBA".to_string(),
                    format: "PNG".to_string(),
                },
            },
            generated_at: time::OffsetDateTime::now_utc(),
        };

        let row = super::materialize_prototype_as_idle_row(&mut session, &iteration)
            .await
            .unwrap();

        assert_eq!(row.status, RowStatus::Ready);
        assert_eq!(row.attempts, 2);
        assert!(workspace.join("decoded/base.png").exists());
        assert!(workspace.join("decoded/idle.png").exists());
        for index in 0..crate::hatching::rows::frame_count(&RowKey::Idle) {
            assert!(workspace
                .join("frames/idle")
                .join(format!("{index:02}.png"))
                .exists());
        }
    }
}
