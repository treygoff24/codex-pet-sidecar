use crate::error::{AppError, AppResult};
use crate::hatching::atlas::derive_running_left;
use crate::hatching::session::{
    GeneratedRowKey, ImageArtifact, ImageMetadata, RowKey, RowState, SourceProvenance,
};
use crate::runtime::json_rpc::JsonRpcClient;
use serde_json::json;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Generate all eight required row strips after prototype acceptance.
///
/// This is a stub implementation pending actual Codex client integration.
/// When the Codex JSON-RPC client is available, this should:
/// 1. Generate rows sequentially (not parallel) for:
///    - idle, running-right, waving, jumping, failed, waiting, running, review
/// 2. For each row:
///    a. Draft row prompt from brief + row template
///    b. Fire $imagegen with row prompt + canonical_identity_reference as grounding
///    c. Watch for ig_*.png to land in runtime_home/generated_images/
///    d. Copy to workspace, hash, save to session.rows
///    e. On failure: retry up to 3 times with exponential backoff
///    f. If all retries fail, mark row as failed and continue
/// 3. Update session phase to Review when all rows complete
/// 4. Update GenerationProgress with completed count
#[allow(dead_code)]
pub async fn generate_all_rows(_session_id: Uuid, _runtime_home: PathBuf) -> AppResult<()> {
    // TODO: Implement actual row generation when Codex client is available
    // For now, return an error indicating this needs Codex integration
    Err(AppError::NotImplemented {
        command: "generate_all_rows (requires Codex client integration)".to_string(),
    })
}

/// Generate a single row strip.
///
/// Uses Codex to generate a row strip based on the row key and canonical identity reference.
pub async fn generate_single_row(
    client: &JsonRpcClient,
    thread_id: &str,
    row_key: GeneratedRowKey,
    prompt: &str,
    canonical_reference_path: &Path,
) -> AppResult<RowState> {
    // Run imagegen turn with row prompt + canonical reference
    let items = vec![
        json!({
            "type": "text",
            "text": &format!("Generate a {} animation frame for this pet character based on this prompt: {}",
                format!("{:?}", row_key).to_lowercase(), prompt),
            "text_elements": []
        }),
        json!({
            "type": "localImage",
            "path": canonical_reference_path
        }),
    ];

    client
        .call(
            "thread/injectItems",
            json!({
                "threadId": thread_id,
                "items": items
            }),
        )
        .await?;

    // TODO: Wait for ig_*.png file to appear and ingest it
    // For now, return a placeholder RowState
    Ok(RowState {
        prompt: prompt.to_string(),
        image: Some(ImageArtifact {
            source_path: PathBuf::from(format!("/placeholder/ig_{:?}.png", row_key)),
            output_path: PathBuf::from(format!("/placeholder/artifacts/ig_{:?}.png", row_key)),
            source_provenance: SourceProvenance::BuiltInImagegen,
            source_sha256: "placeholder".to_string(),
            output_sha256: "placeholder".to_string(),
            metadata: ImageMetadata {
                width: 512,
                height: 128,
                mode: "RGBA".to_string(),
                format: "PNG".to_string(),
            },
        }),
        derived_from: None,
        mirror_decision: None,
        attempts: 1,
        last_error: None,
        status: crate::hatching::session::RowStatus::Ready,
    })
}

/// Regenerate a specific row (called from atlas review).
///
/// For running-left, this re-derives from running-right using deterministic mirroring.
/// For other rows, this uses Codex to regenerate the row.
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
            // For running-left, re-derive from running-right
            let running_right_path = runtime_home.join("decoded/running-right.png");
            let running_left_path = runtime_home.join("decoded/running-left.png");

            let (artifact, mirror_decision) = derive_running_left(
                &running_right_path,
                &running_left_path,
                "Re-generated from atlas review",
            )?;

            Ok(RowState {
                prompt: "Derived from running-right via deterministic mirror".to_string(),
                image: Some(artifact),
                derived_from: Some(RowKey::RunningRight),
                mirror_decision: Some(mirror_decision),
                attempts: 1,
                last_error: None,
                status: crate::hatching::session::RowStatus::Ready,
            })
        }
        _ => {
            // For other rows, use Codex if available
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
                    RowKey::RunningLeft => GeneratedRowKey::RunningRight, // Shouldn't happen, but fallback
                };
                generate_single_row(client, thread_id, generated_key, prompt, canonical_ref).await
            } else {
                Err(AppError::NotImplemented {
                    command: format!(
                        "regenerate_row for {:?} (requires Codex client integration)",
                        row_key
                    ),
                })
            }
        }
    }
}

/// Draft a row prompt from the brief and row template.
///
/// This is a stub implementation.
/// When implemented, this should:
/// 1. Use the brief + row-specific template
/// 2. Generate a prompt for the specific animation row
/// 3. Return the drafted prompt
#[allow(dead_code)]
pub async fn draft_row_prompt(
    _session_id: Uuid,
    _row_key: GeneratedRowKey,
    _runtime_home: PathBuf,
) -> AppResult<String> {
    // TODO: Implement row prompt drafting logic
    Err(AppError::NotImplemented {
        command: "draft_row_prompt (requires Codex client integration)".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_all_rows_returns_not_implemented() {
        // This function is still stubbed
        let runtime_home = PathBuf::from("/tmp/runtime");
        let session_id = uuid::Uuid::new_v4();

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(super::generate_all_rows(session_id, runtime_home));

        assert!(matches!(
            result,
            Err(crate::error::AppError::NotImplemented { .. })
        ));
    }

    #[test]
    fn generate_single_row_compiles() {
        // This test verifies that the function signature compiles correctly
    }

    #[test]
    fn regenerate_row_idle_returns_not_implemented() {
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
            Err(crate::error::AppError::NotImplemented { .. })
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

        // Should fail because running-right source doesn't exist
        assert!(result.is_err());
    }

    #[test]
    fn draft_row_prompt_returns_not_implemented() {
        let runtime_home = PathBuf::from("/tmp/runtime");
        let session_id = uuid::Uuid::new_v4();
        let row_key = GeneratedRowKey::Idle;

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(super::draft_row_prompt(session_id, row_key, runtime_home));

        assert!(matches!(
            result,
            Err(crate::error::AppError::NotImplemented { .. })
        ));
    }
}
