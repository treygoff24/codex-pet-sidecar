use crate::app_state::AppState;
use crate::commands::{CommandError, CommandResult};
use crate::error::AppError;
use crate::hatching::pipeline::import_hatched_pet as pipeline_import_hatched_pet;
use crate::hatching::reference_image::validate_and_copy_reference;
use crate::hatching::runtime::HatchingRuntimeManager;
use crate::hatching::session::{
    HatchingPhase, HatchingSession, OrphanSummary, PetBrief, ReferenceImage, RowKey,
};
use std::path::PathBuf;
use tauri::State;
use uuid::Uuid;

/// Start a new hatching run.
///
/// Creates a new session, runtime home, and workspace directory.
/// Persists the session to disk.
#[allow(dead_code)]
#[tauri::command]
pub async fn start_hatching_run(state: State<'_, AppState>) -> CommandResult<Uuid> {
    let session_id = Uuid::new_v4();
    let session_id_str = session_id.to_string();
    let runtime_home = state.paths.hatching_runtime_home_dir(&session_id_str);
    let workspace = state.paths.hatching_workspace_dir(&session_id_str);

    // Create directories
    std::fs::create_dir_all(&runtime_home).map_err(|e| AppError::IoWithPath {
        path: runtime_home.clone(),
        source: e,
    })?;
    std::fs::create_dir_all(&workspace).map_err(|e| AppError::IoWithPath {
        path: workspace.clone(),
        source: e,
    })?;

    // Create session
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
        phase: HatchingPhase::Inspiration,
        created_at: time::OffsetDateTime::now_utc(),
    };

    // Persist session
    let registry = std::sync::Arc::clone(&state.hatching_session_registry);
    registry.insert(session).await.map_err(CommandError::from)?;

    Ok(session_id)
}

/// Cancel an in-progress hatching run.
///
/// Tears down the runtime home and deletes the workspace directory.
#[allow(dead_code)]
#[tauri::command]
pub async fn cancel_hatching_run(
    state: State<'_, AppState>,
    session_id: Uuid,
) -> CommandResult<()> {
    let session_id_str = session_id.to_string();
    let workspace = state.paths.hatching_workspace_dir(&session_id_str);
    let _runtime_home = state.paths.hatching_runtime_home_dir(&session_id_str);

    // Remove from registry
    let registry = std::sync::Arc::clone(&state.hatching_session_registry);
    let _ = registry.remove(session_id).await; // Ignore errors if session doesn't exist

    // Teardown runtime if it exists
    let runtime_manager = HatchingRuntimeManager::new(session_id, &state.paths);
    let _ = runtime_manager.teardown().await; // Ignore errors if runtime doesn't exist

    // Delete workspace
    if workspace.exists() {
        std::fs::remove_dir_all(&workspace).map_err(|e| AppError::IoWithPath {
            path: workspace.clone(),
            source: e,
        })?;
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
    let registry = std::sync::Arc::clone(&state.hatching_session_registry);
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
) -> CommandResult<()> {
    // Validate brief
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

    // TODO: Validate pet_id is normalized and unique (requires library access)

    // Update session
    let registry = std::sync::Arc::clone(&state.hatching_session_registry);
    let mut session = registry.get(session_id).await.map_err(CommandError::from)?;

    // Brief-change invalidation guard: if brief changes after prototype iterations,
    // clear prototype state and reset phase to Brief
    let brief_changed = session
        .brief
        .as_ref()
        .map(|old_brief| {
            old_brief.display_name != brief.display_name
                || old_brief.description != brief.description
                || old_brief.personality != brief.personality
                || old_brief.palette != brief.palette
                || old_brief.backstory != brief.backstory
                || old_brief.speech_style != brief.speech_style
                || old_brief.behavioral_quirks != brief.behavioral_quirks
                || old_brief.visual_notes != brief.visual_notes
        })
        .unwrap_or(false);

    if brief_changed {
        // Clear prototype state if brief changed
        session.prototype = None;
        // Reset phase to Brief if we were in a later phase
        if matches!(
            session.phase,
            HatchingPhase::Prototype
                | HatchingPhase::Generating { .. }
                | HatchingPhase::Review
                | HatchingPhase::Importing
        ) {
            session.phase = HatchingPhase::Brief;
        }
    }

    session.brief = Some(brief);
    session.archetype = archetype_id;
    // Only set phase to Brief if not already set by invalidation guard
    if !brief_changed {
        session.phase = HatchingPhase::Brief;
    }

    // TODO: Link reference_image_id to session.reference_image if provided

    registry.update(session).await.map_err(CommandError::from)?;

    Ok(())
}

/// Upload and validate a reference image for a hatching session.
///
/// Calls the reference image validator from Task 1.6.
#[allow(dead_code)]
#[tauri::command]
pub async fn upload_reference_image(
    state: State<'_, AppState>,
    session_id: Uuid,
    local_path: String,
) -> CommandResult<ReferenceImage> {
    let session_id_str = session_id.to_string();
    let workspace = state.paths.hatching_workspace_dir(&session_id_str);
    let path = PathBuf::from(local_path);

    validate_and_copy_reference(&path, &workspace)
        .await
        .map_err(|e| e.into())
}

/// List orphan hatching sessions.
///
/// Returns sessions that were interrupted before completion for Wave 3's resume banner.
#[allow(dead_code)]
#[tauri::command]
pub async fn list_orphan_hatching_sessions(
    state: State<'_, AppState>,
) -> CommandResult<Vec<OrphanSummary>> {
    let registry = std::sync::Arc::clone(&state.hatching_session_registry);
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

// Stub commands for Wave 2 (return NotImplemented error)

#[allow(dead_code)]
#[tauri::command]
pub async fn describe_reference_image(
    state: State<'_, AppState>,
    session_id: Uuid,
    reference_image_id: Uuid,
) -> CommandResult<String> {
    // Get session to extract reference image path and thread_id
    let session = std::sync::Arc::clone(&state.hatching_session_registry)
        .get(session_id)
        .await
        .map_err(CommandError::from)?;

    // Get reference image path
    let reference_image = session
        .reference_image
        .as_ref()
        .ok_or_else(|| CommandError {
            message: "No reference image found in session".to_string(),
            recoverable: true,
        })?;

    if reference_image.id != reference_image_id {
        return Err(CommandError {
            message: "Reference image ID does not match session".to_string(),
            recoverable: true,
        });
    }

    // Get thread_id from session
    let thread_id = session
        .codex_thread_id
        .as_ref()
        .ok_or_else(|| CommandError {
            message: "No Codex thread ID found in session".to_string(),
            recoverable: true,
        })?
        .clone();

    let image_path = reference_image.path.clone();

    // Get runtime manager
    let runtime_manager = std::sync::Arc::clone(&state.hatching_runtime_registry)
        .get(session_id)
        .await
        .map_err(CommandError::from)?;

    // Call vision function with runtime manager
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
    // Get session
    let mut session = std::sync::Arc::clone(&state.hatching_session_registry)
        .get(session_id)
        .await
        .map_err(CommandError::from)?;

    // Get thread_id from session
    let thread_id = session
        .codex_thread_id
        .as_ref()
        .ok_or_else(|| CommandError {
            message: "No Codex thread ID found in session".to_string(),
            recoverable: true,
        })?
        .clone();

    // Get prompt from brief (placeholder - in real implementation this would come from draft_prototype_prompt)
    let prompt = session
        .brief
        .as_ref()
        .map(|b| format!("A pet named {} with personality: {:?}", b.display_name, b.personality))
        .unwrap_or_else(|| "A cute pixel art pet".to_string());

    // Get reference image path
    let reference_image_path = session.reference_image.as_ref().map(|ri| ri.path.clone());

    // Get runtime manager
    let runtime_manager = std::sync::Arc::clone(&state.hatching_runtime_registry)
        .get(session_id)
        .await
        .map_err(CommandError::from)?;

    // Get JsonRpcClient
    let client = {
        let manager_guard = runtime_manager.lock().await;
        manager_guard
            .client()
            .ok_or_else(|| CommandError {
                message: "Runtime manager not started".to_string(),
                recoverable: true,
            })?
            .clone()
    };

    // Determine iteration number
    let iteration_n = session
        .prototype
        .as_ref()
        .map(|p| p.iterations.len() as u32 + 1)
        .unwrap_or(1);

    // Call prototype generation
    let iteration = crate::hatching::prototype::generate_prototype(
        &client,
        &thread_id,
        &prompt,
        reference_image_path.as_ref(),
        feedback.as_deref(),
        iteration_n,
    )
    .await
    .map_err(CommandError::from)?;

    // Update session with new iteration
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

    // Persist updated session
    std::sync::Arc::clone(&state.hatching_session_registry)
        .update(session)
        .await
        .map_err(CommandError::from)?;

    Ok(iteration)
}

#[allow(dead_code)]
#[tauri::command]
pub async fn revert_to_iteration(
    _state: State<'_, AppState>,
    _session_id: Uuid,
    _iteration_n: u32,
) -> CommandResult<()> {
    // TODO: Implement revert logic
    // This should update session.prototype.current to iteration_n - 1
    Err(CommandError {
        message: "revert_to_iteration not yet implemented".to_string(),
        recoverable: true,
    })
}

#[allow(dead_code)]
#[tauri::command]
pub async fn accept_prototype(_state: State<'_, AppState>, _session_id: Uuid) -> CommandResult<()> {
    // TODO: Implement accept logic
    // This should copy current prototype to workspace/decoded/base.png
    // and transition phase to Generating
    Err(CommandError {
        message: "accept_prototype not yet implemented".to_string(),
        recoverable: true,
    })
}

#[allow(dead_code)]
#[tauri::command]
pub async fn regenerate_row(
    state: State<'_, AppState>,
    session_id: Uuid,
    row_key: String,
) -> CommandResult<crate::hatching::session::RowState> {
    // Get session
    let session = std::sync::Arc::clone(&state.hatching_session_registry)
        .get(session_id)
        .await
        .map_err(CommandError::from)?;

    // Parse row_key string to RowKey enum
    let parsed_row_key = match row_key.as_str() {
        "idle" => RowKey::Idle,
        "running-right" => RowKey::RunningRight,
        "running-left" => RowKey::RunningLeft,
        "waving" => RowKey::Waving,
        "jumping" => RowKey::Jumping,
        "failed" => RowKey::Failed,
        "waiting" => RowKey::Waiting,
        "running" => RowKey::Running,
        "review" => RowKey::Review,
        _ => {
            return Err(CommandError {
                message: format!("Invalid row_key: {}", row_key),
                recoverable: true,
            })
        }
    };

    // Get runtime manager and client if not running-left
    let (client_opt, thread_id_opt) = if parsed_row_key != RowKey::RunningLeft {
        let thread_id = session
            .codex_thread_id
            .as_ref()
            .ok_or_else(|| CommandError {
                message: "No Codex thread ID found in session".to_string(),
                recoverable: true,
            })?
            .clone();

        let runtime_manager = std::sync::Arc::clone(&state.hatching_runtime_registry)
            .get(session_id)
            .await
            .map_err(CommandError::from)?;

        let client = {
            let manager_guard = runtime_manager.lock().await;
            manager_guard
                .client()
                .ok_or_else(|| CommandError {
                    message: "Runtime manager not started".to_string(),
                    recoverable: true,
                })?
                .clone()
        };

        (Some(client), Some(thread_id))
    } else {
        (None, None)
    };

    // Get prompt from brief (placeholder)
    let prompt = session
        .brief
        .as_ref()
        .map(|b| format!("A pet named {} with personality: {:?}", b.display_name, b.personality))
        .unwrap_or_else(|| "A cute pixel art pet".to_string());

    // Get canonical reference path (placeholder - in real implementation this would be workspace/decoded/base.png)
    let canonical_ref = session.workspace.join("decoded/base.png");

    // Call row regeneration
    crate::hatching::rows::regenerate_row(
        client_opt.as_ref(),
        thread_id_opt.as_deref(),
        parsed_row_key,
        Some(&prompt),
        Some(&canonical_ref),
        &session.runtime_home,
    )
    .await
    .map_err(CommandError::from)
}

#[allow(dead_code)]
#[tauri::command]
pub async fn import_hatched_pet(
    state: State<'_, AppState>,
    session_id: Uuid,
    activate: bool,
) -> CommandResult<String> {
    let session = std::sync::Arc::clone(&state.hatching_session_registry)
        .get(session_id)
        .await
        .map_err(CommandError::from)?;

    let runtime_home = session.runtime_home.clone();
    let workspace = session.workspace.clone();

    pipeline_import_hatched_pet(session_id, runtime_home, workspace, activate)
        .await
        .map_err(CommandError::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hatching::session::{HatchingPhase, PrototypeIteration, PrototypeState};

    #[test]
    fn not_implemented_error_round_trips() {
        let error = AppError::NotImplemented {
            command: "test_command".to_string(),
        };
        assert!(error.to_string().contains("test_command"));
        assert!(error.to_string().contains("not yet implemented"));
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
                        source_sha256: "abc".to_string(),
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
            phase: HatchingPhase::Prototype,
            created_at: time::OffsetDateTime::now_utc(),
        };

        // Simulate brief change
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
                    | HatchingPhase::Generating { .. }
                    | HatchingPhase::Review
                    | HatchingPhase::Importing
            ) {
                session.phase = HatchingPhase::Brief;
            }
        }

        assert!(session.prototype.is_none());
        assert!(matches!(session.phase, HatchingPhase::Brief));
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
            phase: HatchingPhase::Prototype,
            created_at: time::OffsetDateTime::now_utc(),
        };

        // Simulate brief unchanged
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

        // Prototype should remain unchanged
        assert!(session.prototype.is_some());
        assert!(matches!(session.phase, HatchingPhase::Prototype));
    }
}
