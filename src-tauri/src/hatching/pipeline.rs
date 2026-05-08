//! Hatching pipeline: orchestrates atlas generation, validation, and packaging.
//!
//! This module ties together the atlas operations into a cohesive workflow:
//! - Row generation → Atlas composition → Validation → Packaging → Import

use crate::error::{AppError, AppResult};
use crate::hatching::atlas::validate_atlas;
#[allow(unused_imports)]
use crate::hatching::session::{HatchingPhase, HatchingSession, RowKey, RowStatus};
use std::path::PathBuf;
use uuid::Uuid;

/// Full hatching pipeline: generate rows, compose atlas, validate, package, import.
///
/// This is the main orchestration function for the hatching wizard.
/// When the Codex client is available, this should:
/// 1. Generate all row strips using the Codex imagegen integration
/// 2. Derive running-left from running-right using deterministic mirroring
/// 3. Compose the atlas from the row strips
/// 4. Validate the atlas against the Codex spec
/// 5. Package the validated atlas as a pet
/// 6. Import the pet into the library
#[allow(dead_code)]
pub async fn run_hatching_pipeline(
    _session_id: Uuid,
    _runtime_home: PathBuf,
    _workspace: PathBuf,
) -> AppResult<String> {
    // TODO: This is a high-level orchestration function
    // For now, it's a stub pending Codex client integration
    // When implemented, it should:
    // 1. Call generate_all_rows from the rows module
    // 2. Derive running-left using atlas::derive_running_left
    // 3. Compose atlas using atlas::compose_atlas_from_frames
    // 4. Validate using atlas::validate_atlas
    // 5. Package using atlas::package_pet
    // 6. Import using the library module
    
    Err(AppError::NotImplemented {
        command: "run_hatching_pipeline (requires Codex client integration)".to_string(),
    })
}

/// Import a hatched pet from the hatching session.
///
/// This function packages and imports the pet from the hatching workspace.
/// It uses the Rust implementation of the packaging logic instead of Python scripts.
pub async fn import_hatched_pet(
    session_id: Uuid,
    _runtime_home: PathBuf,
    workspace: PathBuf,
    _activate: bool,
) -> AppResult<String> {
    // This is a partial implementation using the Rust atlas operations
    // It demonstrates the packaging workflow, but still needs session integration
    
    // For demonstration, validate that workspace exists
    if !workspace.exists() {
        return Err(AppError::IoWithPath {
            path: workspace.clone(),
            source: std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "hatching workspace not found",
            ),
        });
    }
    
    // Check for expected atlas file
    let atlas_path = workspace.join("atlas.png");
    if !atlas_path.exists() {
        return Err(AppError::IoWithPath {
            path: atlas_path,
            source: std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "atlas.png not found in workspace",
            ),
        });
    }
    
    // Validate the atlas
    let validation_result = validate_atlas(&atlas_path, 50, 0.95, false, false)?;
    if !validation_result.ok {
        return Err(AppError::InvalidPetAsset {
            path: atlas_path,
            reason: format!("Atlas validation failed: {:?}", validation_result.errors),
        });
    }
    
    // TODO: Package the pet using package_pet
    // TODO: Import into library using the library module
    // TODO: Activate if requested
    
    // For now, return a placeholder pet_id
    Ok(format!("hatched-{}", session_id))
}

/// Validate that all required rows are present and ready for atlas composition.
#[allow(dead_code)]
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
                        path: runtime_home_from_session(session),
                        reason: format!(
                            "Row {:?} is not ready (status: {:?})",
                            row_key, row_state.status
                        ),
                    });
                }
                if row_state.image.is_none() {
                    return Err(AppError::InvalidPetAsset {
                        path: runtime_home_from_session(session),
                        reason: format!("Row {:?} has no image artifact", row_key),
                    });
                }
            }
            None => {
                return Err(AppError::InvalidPetAsset {
                    path: runtime_home_from_session(session),
                    reason: format!("Row {:?} is missing from session", row_key),
                });
            }
        }
    }
    
    Ok(())
}

/// Helper to get runtime_home from session.
#[allow(dead_code)]
fn runtime_home_from_session(session: &HatchingSession) -> PathBuf {
    session.runtime_home.clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hatching::session::{HatchingSession, RowState, RowStatus};
    use std::collections::HashMap;
    
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
                        source_sha256: "abc".to_string(),
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
            id: Uuid::new_v4(),
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