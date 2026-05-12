use crate::error::{AppError, AppResult};
use crate::hatching::atlas::derive_running_left;
use crate::hatching::atlas::{file_sha256, CELL_HEIGHT, CELL_WIDTH};
use crate::hatching::imagegen::ingest_next_imagegen_artifact;
use crate::hatching::session::{
    GeneratedRowKey, HatchingSession, ImageArtifact, ImageMetadata, PetBrief, RowKey, RowState,
    RowStatus,
};
use crate::runtime::input::TurnInputItem;
use crate::runtime::json_rpc::JsonRpcClient;
use image::{GenericImageView, RgbaImage};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::time::sleep;
use uuid::Uuid;

const ROW_IMAGEGEN_TIMEOUT_MS: u64 = 10 * 60 * 1000;

pub const GENERATED_ROWS_AFTER_BASE: [GeneratedRowKey; 7] = [
    GeneratedRowKey::RunningRight,
    GeneratedRowKey::Waving,
    GeneratedRowKey::Jumping,
    GeneratedRowKey::Failed,
    GeneratedRowKey::Waiting,
    GeneratedRowKey::Running,
    GeneratedRowKey::Review,
];

pub const GENERATED_ROWS: [GeneratedRowKey; 7] = GENERATED_ROWS_AFTER_BASE;
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
    let image =
        ingest_next_imagegen_artifact(runtime_home, workspace, ROW_IMAGEGEN_TIMEOUT_MS).await?;
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

fn optional_line(label: &str, value: Option<&str>) -> String {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("\n{label}: {value}"))
        .unwrap_or_default()
}

fn row_action_language(row_key: &GeneratedRowKey) -> &'static str {
    match row_key {
        GeneratedRowKey::Idle => {
            "standing still in a calm idle pose, readable as the base identity sprite"
        }
        GeneratedRowKey::RunningRight => {
            "moving to the right in a clear looping walk/run strip with consistent silhouette"
        }
        GeneratedRowKey::Waving => {
            "raising one hand, paw, wing, or equivalent appendage in a greeting wave"
        }
        GeneratedRowKey::Jumping => {
            "jumping upward with a squash-and-stretch arc and a clear airborne frame"
        }
        GeneratedRowKey::Failed => {
            "reacting to failure with a readable frustrated, embarrassed, or defeated expression"
        }
        GeneratedRowKey::Waiting => {
            "waiting patiently with subtle fidgeting and an easy-to-loop idle variation"
        }
        GeneratedRowKey::Running => {
            "focused on an active work loop, looking busy and intent without changing identity"
        }
        GeneratedRowKey::Review => {
            "reviewing something closely with a skeptical, evaluative, or approving reaction"
        }
    }
}

pub fn row_prompt_label(row_key: &GeneratedRowKey) -> &'static str {
    match row_key {
        GeneratedRowKey::Idle => "base · idle",
        GeneratedRowKey::RunningRight => "running-right",
        GeneratedRowKey::Waving => "waving",
        GeneratedRowKey::Jumping => "jumping",
        GeneratedRowKey::Failed => "failed",
        GeneratedRowKey::Waiting => "waiting",
        GeneratedRowKey::Running => "running · focused work loop",
        GeneratedRowKey::Review => "review",
    }
}

/// Draft a row prompt from the brief and row template.
pub fn draft_row_prompt_from_brief(
    brief: &PetBrief,
    row_key: &GeneratedRowKey,
    base_identity_prompt: &str,
    archetype: Option<&str>,
    reference_description: Option<&str>,
) -> String {
    let personality = if brief.personality.is_empty() {
        "unspecified".to_string()
    } else {
        brief.personality.join(", ")
    };
    let identity_grounding = if matches!(row_key, GeneratedRowKey::Idle) {
        let reference = optional_line("Reference grounding", reference_description);
        format!(
            "Base identity prompt:\n{base_identity_prompt}{reference}\nUse this as the canonical identity."
        )
    } else {
        "Identity grounding: match the accepted canonical base image exactly; do not reinterpret the original upload or redesign the character.".to_string()
    };
    format!(
        "Create a transparent-background pixel-art animation row strip for {name}.\n+         Row: {label}.\n+         Action: {action}.\n+         Description: {description}.\n+         Personality: {personality}.{archetype}{visual_notes}{backstory}{speech_style}{quirks}\n+         {identity_grounding}\n+         Keep the same scale, palette family, silhouette, and face readability across frames. Output only the row strip image.",
        name = brief.display_name,
        label = row_prompt_label(row_key),
        action = row_action_language(row_key),
        description = brief.description,
        personality = personality,
        archetype = optional_line("Archetype", archetype),
        visual_notes = optional_line("Visual notes", brief.visual_notes.as_deref()),
        backstory = optional_line("Backstory", brief.backstory.as_deref()),
        speech_style = optional_line("Speech style", brief.speech_style.as_deref()),
        quirks = optional_line("Behavioral quirks", brief.behavioral_quirks.as_deref()),
        identity_grounding = identity_grounding,
    )
}

/// Legacy wrapper retained for compile-time compatibility in old tests.
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
    fn run_row_generation_uses_seven_rows_after_base() {
        assert_eq!(GENERATED_ROW_COUNT, 7);
        assert_eq!(GENERATED_ROWS_AFTER_BASE.len(), 7);
        assert!(!GENERATED_ROWS_AFTER_BASE
            .iter()
            .any(|row| matches!(row, GeneratedRowKey::Idle)));
    }

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

    fn brief() -> PetBrief {
        PetBrief {
            display_name: "Wendell".to_string(),
            pet_id: "wendell".to_string(),
            description: "An old turtle sage".to_string(),
            personality: vec!["wise".to_string(), "cranky".to_string()],
            palette: None,
            backstory: None,
            speech_style: None,
            behavioral_quirks: None,
            visual_notes: Some("half-moon spectacles".to_string()),
        }
    }

    #[test]
    fn draft_row_prompt_from_brief_includes_context_and_action() {
        for (row_key, action_word) in [
            (GeneratedRowKey::Waving, "wave"),
            (GeneratedRowKey::Jumping, "jumping"),
            (GeneratedRowKey::Waiting, "waiting"),
            (GeneratedRowKey::Review, "reviewing"),
        ] {
            let prompt = draft_row_prompt_from_brief(
                &brief(),
                &row_key,
                "base identity",
                Some("grumpy-sage"),
                Some("reference turtle"),
            );
            assert!(prompt.contains("Wendell"));
            assert!(prompt.contains("An old turtle sage"));
            assert!(prompt.contains("wise, cranky"));
            assert!(prompt.contains(action_word));
            assert!(prompt.contains("canonical base image"));
        }
    }
}
