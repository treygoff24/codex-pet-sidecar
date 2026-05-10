//! Hatching pipeline: orchestrates atlas generation, validation, and packaging.
//!
//! This module ties together the atlas operations into a cohesive workflow:
//! - Row generation → Atlas composition → Validation → Packaging → Import

use crate::error::{AppError, AppResult};
use crate::hatching::atlas::validate_atlas;
use crate::hatching::provenance::validate_pet_completeness;
use crate::hatching::session::{HatchingPhase, HatchingSession, RowKey, RowStatus};
use crate::state::library::import_staged_pet;
use crate::state::paths::AppPaths;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

/// Package and import a hatched pet from the hatching workspace.
///
/// Invokes the bundled `pet-hatching` sidecar (declared under
/// `bundle.externalBin` in `tauri.conf.json`) for compose / validate /
/// package, then imports the staged result into the pet library.
pub async fn import_hatched_pet_with_paths(
    app: &AppHandle,
    paths: &AppPaths,
    session: &mut HatchingSession,
    activate: bool,
) -> AppResult<String> {
    validate_rows_for_composition(session)?;
    validate_pet_completeness(session)?;

    let workspace = session.workspace.clone();
    if !workspace.exists() {
        return Err(AppError::IoWithPath {
            path: workspace.clone(),
            source: std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "hatching workspace not found",
            ),
        });
    }

    let atlas_path = workspace.join("atlas.png");
    let spritesheet_path = workspace.join("spritesheet.webp");
    run_pet_hatching_command(
        app,
        vec![
            "--cmd".into(),
            "compose".into(),
            "--frames-root".into(),
            workspace.join("frames").display().to_string(),
            "--output".into(),
            atlas_path.display().to_string(),
            "--webp-output".into(),
            spritesheet_path.display().to_string(),
        ],
    )
    .await?;

    run_pet_hatching_command(
        app,
        vec![
            "--cmd".into(),
            "validate".into(),
            atlas_path.display().to_string(),
            "--json-out".into(),
            workspace
                .join("atlas-validation.json")
                .display()
                .to_string(),
        ],
    )
    .await?;

    let validation_result = validate_atlas(&atlas_path, 50, 0.95, false, false)?;
    if !validation_result.ok {
        for row in session.rows.values_mut() {
            row.status = RowStatus::Failed;
            row.last_error = Some(format!(
                "Atlas validation failed: {:?}",
                validation_result.errors
            ));
        }
        session.phase = HatchingPhase::Review;
        return Err(AppError::InvalidPetAsset {
            path: atlas_path,
            reason: format!("Atlas validation failed: {:?}", validation_result.errors),
        });
    }

    let brief = session
        .brief
        .as_ref()
        .ok_or_else(|| AppError::InvalidPetMetadata {
            path: workspace.join("brief"),
            reason: "pet brief is required before import".to_string(),
        })?;
    let package_dir = workspace.join("package");
    if package_dir.exists() {
        tokio::fs::remove_dir_all(&package_dir).await?;
    }
    run_pet_hatching_command(
        app,
        vec![
            "--cmd".into(),
            "package".into(),
            "--pet-name".into(),
            brief.pet_id.clone(),
            "--display-name".into(),
            brief.display_name.clone(),
            "--description".into(),
            brief.description.clone(),
            "--spritesheet".into(),
            atlas_path.display().to_string(),
            "--output-dir".into(),
            package_dir.display().to_string(),
            "--force".into(),
        ],
    )
    .await?;

    let mut library = import_staged_pet(paths, &package_dir)?;
    if activate {
        library = crate::state::library::set_active_pet(paths, &brief.pet_id)?;
    }
    drop(library);

    session.phase = HatchingPhase::Done {
        pet_id: brief.pet_id.clone(),
    };

    Ok(brief.pet_id.clone())
}

/// Validate that all required rows are present and ready for atlas composition.
pub fn validate_rows_for_composition(session: &HatchingSession) -> AppResult<()> {
    let required_rows = vec![
        RowKey::Idle,
        RowKey::RunningRight,
        RowKey::RunningLeft,
        RowKey::Waving,
        RowKey::Jumping,
        RowKey::Failed,
        RowKey::Waiting,
        RowKey::Running,
        RowKey::Review,
    ];

    for row_key in required_rows {
        match session.rows.get(&row_key) {
            Some(row_state) => {
                if row_state.status != RowStatus::Ready {
                    return Err(AppError::InvalidPetAsset {
                        path: session.runtime_home.clone(),
                        reason: format!(
                            "Row {:?} is not ready (status: {:?})",
                            row_key, row_state.status
                        ),
                    });
                }
                if row_state.image.is_none() {
                    return Err(AppError::InvalidPetAsset {
                        path: session.runtime_home.clone(),
                        reason: format!("Row {:?} has no image artifact", row_key),
                    });
                }
            }
            None => {
                return Err(AppError::InvalidPetAsset {
                    path: session.runtime_home.clone(),
                    reason: format!("Row {:?} is missing from session", row_key),
                });
            }
        }
    }

    Ok(())
}

async fn run_pet_hatching_command(app: &AppHandle, args: Vec<String>) -> AppResult<()> {
    let sidecar = app
        .shell()
        .sidecar("pet-hatching")
        .map_err(|error| AppError::CommandFailed("pet-hatching".to_string(), error.to_string()))?;
    let output =
        sidecar.args(args).output().await.map_err(|error| {
            AppError::CommandFailed("pet-hatching".to_string(), error.to_string())
        })?;
    if output.status.success() {
        return Ok(());
    }
    Err(AppError::CommandFailed(
        "pet-hatching".to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hatching::session::{HatchingSession, RowState, RowStatus};
    use std::collections::HashMap;
    use std::path::PathBuf;

    #[test]
    fn test_validate_rows_for_composition_all_ready() {
        let session = create_test_session_with_ready_rows();
        let result = validate_rows_for_composition(&session);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_rows_for_composition_missing_row() {
        let mut session = create_test_session_with_ready_rows();
        session.rows.remove(&RowKey::Idle);

        let result = validate_rows_for_composition(&session);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_rows_for_composition_not_ready() {
        let mut session = create_test_session_with_ready_rows();
        if let Some(row) = session.rows.get_mut(&RowKey::Idle) {
            row.status = RowStatus::Generating;
        }

        let result = validate_rows_for_composition(&session);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_rows_for_composition_no_image() {
        let mut session = create_test_session_with_ready_rows();
        if let Some(row) = session.rows.get_mut(&RowKey::Idle) {
            row.image = None;
        }

        let result = validate_rows_for_composition(&session);
        assert!(result.is_err());
    }

    fn create_test_session_with_ready_rows() -> HatchingSession {
        use crate::hatching::session::{ImageArtifact, ImageMetadata, SourceProvenance};

        let mut rows = HashMap::new();
        for row_key in [
            RowKey::Idle,
            RowKey::RunningRight,
            RowKey::RunningLeft,
            RowKey::Waving,
            RowKey::Jumping,
            RowKey::Failed,
            RowKey::Waiting,
            RowKey::Running,
            RowKey::Review,
        ] {
            rows.insert(
                row_key,
                RowState {
                    prompt: "test prompt".to_string(),
                    image: Some(ImageArtifact {
                        source_path: PathBuf::from("/tmp/source.png"),
                        output_path: PathBuf::from("/tmp/output.png"),
                        source_provenance: SourceProvenance::BuiltInImagegen,
                        source_sha256: Some("abc".to_string()),
                        output_sha256: "def".to_string(),
                        metadata: ImageMetadata {
                            width: 192,
                            height: 208,
                            mode: "RGBA".to_string(),
                            format: "PNG".to_string(),
                        },
                    }),
                    derived_from: None,
                    mirror_decision: None,
                    attempts: 1,
                    last_error: None,
                    status: RowStatus::Ready,
                },
            );
        }

        HatchingSession {
            id: uuid::Uuid::new_v4(),
            runtime_home: PathBuf::from("/tmp/runtime"),
            workspace: PathBuf::from("/tmp/workspace"),
            codex_thread_id: None,
            brief: None,
            archetype: None,
            reference_image: None,
            prototype: None,
            rows,
            phase: HatchingPhase::Generating {
                progress: crate::hatching::session::GenerationProgress {
                    rows_completed: 0,
                    rows_total: 8,
                    estimated_remaining: std::time::Duration::from_secs(120),
                    total_imagegen_calls: 0,
                },
            },
            created_at: time::OffsetDateTime::now_utc(),
        }
    }
}
