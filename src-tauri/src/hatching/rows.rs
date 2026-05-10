use crate::error::{AppError, AppResult};
use crate::hatching::atlas::derive_running_left;
use crate::hatching::atlas::{file_sha256, CELL_HEIGHT, CELL_WIDTH};
use crate::hatching::imagegen::ingest_next_imagegen_artifact;
use crate::hatching::session::{
    GeneratedRowKey, HatchingSession, ImageArtifact, ImageMetadata, RowKey, RowState, RowStatus,
};
use crate::runtime::input::TurnInputItem;
use crate::runtime::json_rpc::JsonRpcClient;
use image::{GenericImageView, RgbaImage};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::time::sleep;
use uuid::Uuid;

pub const GENERATED_ROWS: [GeneratedRowKey; 8] = [
    GeneratedRowKey::Idle,
    GeneratedRowKey::RunningRight,
    GeneratedRowKey::Waving,
    GeneratedRowKey::Jumping,
    GeneratedRowKey::Failed,
    GeneratedRowKey::Waiting,
    GeneratedRowKey::Running,
    GeneratedRowKey::Review,
];

pub const GENERATED_ROW_COUNT: u32 = GENERATED_ROWS.len() as u32;

pub fn row_key_from_str(value: &str) -> AppResult<RowKey> {
    match value {
        "idle" => Ok(RowKey::Idle),
        "running-right" => Ok(RowKey::RunningRight),
        "running-left" => Ok(RowKey::RunningLeft),
        "waving" => Ok(RowKey::Waving),
        "jumping" => Ok(RowKey::Jumping),
        "failed" => Ok(RowKey::Failed),
        "waiting" => Ok(RowKey::Waiting),
        "running" => Ok(RowKey::Running),
        "review" => Ok(RowKey::Review),
        _ => Err(AppError::InvalidRowKey(value.to_string())),
    }
}

pub fn row_slug(row_key: &RowKey) -> &'static str {
    match row_key {
        RowKey::Idle => "idle",
        RowKey::RunningRight => "running-right",
        RowKey::RunningLeft => "running-left",
        RowKey::Waving => "waving",
        RowKey::Jumping => "jumping",
        RowKey::Failed => "failed",
        RowKey::Waiting => "waiting",
        RowKey::Running => "running",
        RowKey::Review => "review",
    }
}

pub fn generated_row_key(row_key: &GeneratedRowKey) -> RowKey {
    match row_key {
        GeneratedRowKey::Idle => RowKey::Idle,
        GeneratedRowKey::RunningRight => RowKey::RunningRight,
        GeneratedRowKey::Waving => RowKey::Waving,
        GeneratedRowKey::Jumping => RowKey::Jumping,
        GeneratedRowKey::Failed => RowKey::Failed,
        GeneratedRowKey::Waiting => RowKey::Waiting,
        GeneratedRowKey::Running => RowKey::Running,
        GeneratedRowKey::Review => RowKey::Review,
    }
}

pub fn frame_count(row_key: &RowKey) -> u32 {
    match row_key {
        RowKey::Idle => 6,
        RowKey::RunningRight | RowKey::RunningLeft | RowKey::Failed => 8,
        RowKey::Waving => 4,
        RowKey::Jumping => 5,
        RowKey::Waiting | RowKey::Running | RowKey::Review => 6,
    }
}

pub fn workspace_from_canonical_reference(canonical_reference_path: &Path) -> AppResult<&Path> {
    canonical_reference_path
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| AppError::InvalidWorkspace {
            path: canonical_reference_path.to_path_buf(),
            reason: "canonical reference must live under <workspace>/decoded/base.png".to_string(),
        })
}

pub fn running_left_row_state(
    artifact: ImageArtifact,
    mirror_decision: crate::hatching::session::MirrorDecision,
) -> RowState {
    RowState {
        prompt: "Derived from running-right via deterministic mirror".to_string(),
        image: Some(artifact),
        derived_from: Some(RowKey::RunningRight),
        mirror_decision: Some(mirror_decision),
        attempts: 1,
        last_error: None,
        status: RowStatus::Ready,
    }
}

/// Derive the running-left row from the running-right strip and register it in the session.
///
/// Removes any stale running-left file, mirrors the running-right strip, splits it into
/// frames, and inserts the resulting `RowState` under `RowKey::RunningLeft`.
pub async fn derive_and_register_running_left(
    session: &mut HatchingSession,
    decision_note: &str,
) -> AppResult<()> {
    let left_path = session.workspace.join("decoded/running-left.png");
    if left_path.exists() {
        tokio::fs::remove_file(&left_path)
            .await
            .map_err(|e| AppError::IoWithPath {
                path: left_path.clone(),
                source: e,
            })?;
    }
    let (artifact, mirror_decision) = derive_running_left(
        &session.workspace.join("decoded/running-right.png"),
        &left_path,
        decision_note,
    )?;
    split_row_strip_to_frames(
        &artifact.output_path,
        &RowKey::RunningLeft,
        &session.workspace,
    )?;
    session.rows.insert(
        RowKey::RunningLeft,
        running_left_row_state(artifact, mirror_decision),
    );
    Ok(())
}

/// Generate a row strip from the row prompt and canonical identity reference.
pub async fn generate_single_row(
    client: &JsonRpcClient,
    thread_id: &str,
    row_key: GeneratedRowKey,
    prompt: &str,
    canonical_reference_path: &Path,
    runtime_home: &Path,
) -> AppResult<RowState> {
    let items = vec![
        TurnInputItem::text(format!(
            "Generate a {} animation frame for this pet character based on this prompt: {}",
            row_slug(&generated_row_key(&row_key)),
            prompt
        )),
        TurnInputItem::local_image(canonical_reference_path),
    ];

    client
        .call(
            "turn/start",
            crate::hatching::runtime::read_only_turn_params(thread_id, items),
        )
        .await?;

    let workspace = workspace_from_canonical_reference(canonical_reference_path)?;
    let image = ingest_next_imagegen_artifact(runtime_home, workspace, 30_000).await?;
    let row_key = generated_row_key(&row_key);
    let image = materialize_row_artifact(image, &row_key, workspace).await?;
    Ok(RowState {
        prompt: prompt.to_string(),
        image: Some(image),
        derived_from: None,
        mirror_decision: None,
        attempts: 1,
        last_error: None,
        status: RowStatus::Ready,
    })
}

pub async fn materialize_row_artifact(
    mut artifact: ImageArtifact,
    row_key: &RowKey,
    workspace: &Path,
) -> AppResult<ImageArtifact> {
    let slug = row_slug(row_key);
    let decoded_dir = workspace.join("decoded");
    tokio::fs::create_dir_all(&decoded_dir).await?;
    let decoded_path = decoded_dir.join(format!("{slug}.png"));
    tokio::fs::copy(&artifact.output_path, &decoded_path).await?;
    artifact.output_path = decoded_path.clone();
    artifact.output_sha256 = file_sha256(&decoded_path)?;
    artifact.metadata = image_metadata_for_path(&decoded_path)?;
    split_row_strip_to_frames(&decoded_path, row_key, workspace)?;
    Ok(artifact)
}

pub fn split_row_strip_to_frames(
    strip_path: &Path,
    row_key: &RowKey,
    workspace: &Path,
) -> AppResult<()> {
    let frame_total = frame_count(row_key);
    let frames_dir = workspace.join("frames").join(row_slug(row_key));
    std::fs::create_dir_all(&frames_dir)?;
    let image = image::open(strip_path)?.to_rgba8();
    let fallback_frame = if image.width() < CELL_WIDTH || image.height() < CELL_HEIGHT {
        RgbaImage::new(CELL_WIDTH, CELL_HEIGHT)
    } else {
        image
            .view(
                0,
                0,
                CELL_WIDTH.min(image.width()),
                CELL_HEIGHT.min(image.height()),
            )
            .to_image()
    };
    for index in 0..frame_total {
        let left = index * CELL_WIDTH;
        let frame = if image.width() >= left + CELL_WIDTH && image.height() >= CELL_HEIGHT {
            image.view(left, 0, CELL_WIDTH, CELL_HEIGHT).to_image()
        } else {
            fallback_frame.clone()
        };
        frame.save(frames_dir.join(format!("{index:02}.png")))?;
    }
    Ok(())
}

fn image_metadata_for_path(path: &Path) -> AppResult<ImageMetadata> {
    let image = image::open(path)?;
    Ok(ImageMetadata {
        width: image.width(),
        height: image.height(),
        mode: "RGBA".to_string(),
        format: "PNG".to_string(),
    })
}

/// Regenerate a row from atlas review.
pub async fn regenerate_row(
    client: Option<&JsonRpcClient>,
    thread_id: Option<&str>,
    row_key: RowKey,
    prompt: Option<&str>,
    canonical_reference_path: Option<&Path>,
    runtime_home: &Path,
) -> AppResult<RowState> {
    match row_key {
        RowKey::RunningLeft => {
            let workspace = runtime_home
                .parent()
                .ok_or_else(|| AppError::InvalidWorkspace {
                    path: runtime_home.to_path_buf(),
                    reason: "runtime home has no parent workspace".to_string(),
                })?;
            let running_right_path = workspace.join("decoded/running-right.png");
            let running_left_path = workspace.join("decoded/running-left.png");

            let (artifact, mirror_decision) = derive_running_left(
                &running_right_path,
                &running_left_path,
                "Re-generated from atlas review",
            )?;

            Ok(running_left_row_state(artifact, mirror_decision))
        }
        _ => {
            if let (Some(client), Some(thread_id), Some(prompt), Some(canonical_ref)) =
                (client, thread_id, prompt, canonical_reference_path)
            {
                let generated_key = match row_key {
                    RowKey::Idle => GeneratedRowKey::Idle,
                    RowKey::RunningRight => GeneratedRowKey::RunningRight,
                    RowKey::Waving => GeneratedRowKey::Waving,
                    RowKey::Jumping => GeneratedRowKey::Jumping,
                    RowKey::Failed => GeneratedRowKey::Failed,
                    RowKey::Waiting => GeneratedRowKey::Waiting,
                    RowKey::Running => GeneratedRowKey::Running,
                    RowKey::Review => GeneratedRowKey::Review,
                    RowKey::RunningLeft => GeneratedRowKey::RunningRight,
                };
                let row_state = generate_single_row(
                    client,
                    thread_id,
                    generated_key,
                    prompt,
                    canonical_ref,
                    runtime_home,
                )
                .await?;
                Ok(row_state)
            } else {
                Err(AppError::RuntimeNotStarted)
            }
        }
    }
}

pub async fn generate_single_row_with_retries(
    client: &JsonRpcClient,
    thread_id: &str,
    row_key: GeneratedRowKey,
    prompt: &str,
    canonical_reference_path: &Path,
    runtime_home: &Path,
) -> RowState {
    let mut attempts = 0;
    let mut last_error = None;
    for delay in [0, 1, 2] {
        if delay > 0 {
            sleep(Duration::from_secs(delay)).await;
        }
        attempts += 1;
        match generate_single_row(
            client,
            thread_id,
            row_key.clone(),
            prompt,
            canonical_reference_path,
            runtime_home,
        )
        .await
        {
            Ok(mut row) => {
                row.attempts = attempts;
                return row;
            }
            Err(error) => {
                last_error = Some(error.to_string());
            }
        }
    }
    RowState {
        prompt: prompt.to_string(),
        image: None,
        derived_from: None,
        mirror_decision: None,
        attempts,
        last_error,
        status: RowStatus::Failed,
    }
}

/// Draft a row prompt from the brief and row template.
#[allow(dead_code)]
pub async fn draft_row_prompt(
    session_id: Uuid,
    row_key: GeneratedRowKey,
    _runtime_home: PathBuf,
) -> AppResult<String> {
    Ok(format!(
        "Generate the {row_key:?} animation strip for hatching session {session_id}."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_single_row_compiles() {}

    #[test]
    fn regenerate_row_idle_requires_runtime() {
        let temp_dir = tempfile::tempdir().unwrap();
        let runtime_home = temp_dir.path().to_path_buf();
        let row_key = RowKey::Idle;

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(regenerate_row(
            None,
            None,
            row_key,
            None,
            None,
            &runtime_home,
        ));

        assert!(matches!(
            result,
            Err(crate::error::AppError::RuntimeNotStarted)
        ));
    }

    #[test]
    fn regenerate_row_running_left_needs_source_file() {
        let temp_dir = tempfile::tempdir().unwrap();
        let runtime_home = temp_dir.path().to_path_buf();
        let row_key = RowKey::RunningLeft;

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(regenerate_row(
            None,
            None,
            row_key,
            None,
            None,
            &runtime_home,
        ));

        assert!(result.is_err());
    }

    #[test]
    fn draft_row_prompt_returns_row_prompt() {
        let runtime_home = PathBuf::from("/tmp/runtime");
        let session_id = uuid::Uuid::new_v4();
        let row_key = GeneratedRowKey::Idle;

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(super::draft_row_prompt(session_id, row_key, runtime_home));

        assert!(result.unwrap().contains("Idle"));
    }
}
