use crate::error::{AppError, AppResult};
use crate::hatching::session::{HatchingSession, ImageArtifact, RowKey, SourceProvenance};
use std::path::Path;

pub fn validate_image_artifact(
    artifact: &ImageArtifact,
    runtime_home: &Path,
    workspace: &Path,
) -> AppResult<()> {
    let generated_images = runtime_home.join("generated_images");
    let file_name = artifact
        .source_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::InvalidPetAsset {
            path: artifact.source_path.clone(),
            reason: "imagegen artifact has no valid file name".to_string(),
        })?;

    if !artifact.source_path.starts_with(&generated_images) {
        return Err(AppError::InvalidPetAsset {
            path: artifact.source_path.clone(),
            reason: "imagegen artifact must be under runtime generated_images".to_string(),
        });
    }
    if !(file_name.starts_with("ig_") && file_name.ends_with(".png")) {
        return Err(AppError::InvalidPetAsset {
            path: artifact.source_path.clone(),
            reason: "imagegen artifact file name must match ig_*.png".to_string(),
        });
    }
    if artifact.source_path.starts_with(workspace) {
        return Err(AppError::InvalidPetAsset {
            path: artifact.source_path.clone(),
            reason: "imagegen artifact source cannot be inside workspace".to_string(),
        });
    }
    Ok(())
}

pub fn validate_pet_completeness(session: &HatchingSession) -> AppResult<()> {
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
        let row = session
            .rows
            .get(&row_key)
            .ok_or_else(|| AppError::InvalidPetAsset {
                path: session.workspace.clone(),
                reason: format!("row {row_key:?} is missing"),
            })?;
        let Some(image) = &row.image else {
            return Err(AppError::InvalidPetAsset {
                path: session.workspace.clone(),
                reason: format!("row {row_key:?} is missing an image artifact"),
            });
        };
        if image.source_sha256.is_none() {
            return Err(AppError::InvalidPetAsset {
                path: image.source_path.clone(),
                reason: format!("row {row_key:?} is missing source sha256"),
            });
        }
        if image.output_sha256.is_empty() || image.output_sha256 == "placeholder" {
            return Err(AppError::InvalidPetAsset {
                path: image.output_path.clone(),
                reason: format!("row {row_key:?} is missing output sha256"),
            });
        }
        match image.source_provenance {
            SourceProvenance::DeterministicMirror if row_key != RowKey::RunningLeft => {
                return Err(AppError::InvalidPetAsset {
                    path: image.output_path.clone(),
                    reason: "deterministic mirror provenance is only valid for running-left"
                        .to_string(),
                });
            }
            SourceProvenance::SyntheticTest
                if !(cfg!(test)
                    || std::env::var("HATCHING_ALLOW_SYNTHETIC").as_deref() == Ok("1")) =>
            {
                return Err(AppError::InvalidPetAsset {
                    path: image.output_path.clone(),
                    reason: "synthetic-test provenance is disabled outside tests".to_string(),
                });
            }
            _ => {}
        }
    }
    Ok(())
}
