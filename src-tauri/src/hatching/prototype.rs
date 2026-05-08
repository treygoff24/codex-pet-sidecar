use crate::error::{AppError, AppResult};
use crate::hatching::session::{ImageArtifact, PrototypeIteration};
use crate::runtime::json_rpc::JsonRpcClient;
use serde_json::json;
use std::path::PathBuf;
use time::OffsetDateTime;
use uuid::Uuid;

/// Generate a prototype iteration.
///
/// Uses Codex to generate a prototype image based on the brief and reference image.
/// If feedback is provided, runs a text turn to rewrite the prompt first.
pub async fn generate_prototype(
    client: &JsonRpcClient,
    thread_id: &str,
    prompt: &str,
    reference_image_path: Option<&PathBuf>,
    feedback: Option<&str>,
    iteration_n: u32,
) -> AppResult<PrototypeIteration> {
    let revised_prompt = if let Some(feedback) = feedback {
        // Run text turn to rewrite prompt based on feedback
        let items = vec![json!({
            "type": "text",
            "text": &format!(
                "Rewrite this image generation prompt based on the feedback.\n\nOriginal prompt: {}\n\nFeedback: {}\n\nReturn JSON: {{\"revised_prompt\": \"...\", \"summary_of_changes\": \"...\"}}",
                prompt, feedback
            ),
            "text_elements": []
        })];

        client
            .call(
                "thread/injectItems",
                json!({
                    "threadId": thread_id,
                    "items": items
                }),
            )
            .await?;

        // TODO: Parse response to extract revised_prompt and summary_of_changes
        // For now, use placeholder
        format!("{} (revised with feedback: {})", prompt, feedback)
    } else {
        prompt.to_string()
    };

    // Run imagegen turn
    let mut items = vec![json!({
        "type": "text",
        "text": &format!("Generate an image based on this prompt: {}", revised_prompt),
        "text_elements": []
    })];

    if let Some(ref_path) = reference_image_path {
        items.push(json!({
            "type": "localImage",
            "path": ref_path
        }));
    }

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
    // For now, return a placeholder PrototypeIteration
    Ok(PrototypeIteration {
        n: iteration_n,
        revised_prompt,
        summary_of_changes: feedback
            .map(|f| format!("Applied feedback: {}", f))
            .unwrap_or_default(),
        user_feedback: feedback.map(|f| f.to_string()),
        image: ImageArtifact {
            source_path: PathBuf::from("/placeholder/ig_prototype.png"),
            output_path: PathBuf::from("/placeholder/artifacts/ig_prototype.png"),
            source_provenance: crate::hatching::session::SourceProvenance::BuiltInImagegen,
            source_sha256: "placeholder".to_string(),
            output_sha256: "placeholder".to_string(),
            metadata: crate::hatching::session::ImageMetadata {
                width: 512,
                height: 512,
                mode: "RGBA".to_string(),
                format: "PNG".to_string(),
            },
        },
        generated_at: OffsetDateTime::now_utc(),
    })
}

/// Revert to a previous prototype iteration.
///
/// This is a stub implementation.
/// When implemented, this should:
/// 1. Load session
/// 2. Validate iteration_n exists in prototype.iterations
/// 3. Update prototype.current to iteration_n - 1
/// 4. Persist session
#[allow(dead_code)]
pub async fn revert_to_iteration(
    _session_id: Uuid,
    _iteration_n: u32,
    _runtime_home: PathBuf,
) -> AppResult<()> {
    // TODO: Implement iteration revert logic
    Err(AppError::NotImplemented {
        command: "revert_to_iteration".to_string(),
    })
}

/// Accept the current prototype and transition to generation phase.
///
/// This is a stub implementation.
/// When implemented, this should:
/// 1. Load session
/// 2. Validate prototype exists and has at least one iteration
/// 3. Copy current prototype image to workspace/decoded/base.png as canonical_identity_reference
/// 4. Update phase to Generating with initial progress
/// 5. Persist session
/// 6. Trigger background row generation (separate task)
#[allow(dead_code)]
pub async fn accept_prototype(_session_id: Uuid, _runtime_home: PathBuf) -> AppResult<()> {
    // TODO: Implement prototype acceptance and generation phase transition
    Err(AppError::NotImplemented {
        command: "accept_prototype (requires Codex client integration)".to_string(),
    })
}

/// Draft the initial prototype prompt from brief + archetype + reference description.
///
/// This is a stub implementation.
/// When implemented, this should:
/// 1. Run a Codex text turn with brief, archetype preset (if any), and reference description
/// 2. Ask for a single imagegen prompt for the base identity prototype
/// 3. Return the drafted prompt
#[allow(dead_code)]
pub async fn draft_prototype_prompt(
    _session_id: Uuid,
    _runtime_home: PathBuf,
) -> AppResult<String> {
    // TODO: Implement prompt drafting logic
    Err(AppError::NotImplemented {
        command: "draft_prototype_prompt (requires Codex client integration)".to_string(),
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn generate_prototype_compiles() {
        // This test verifies that the function signature compiles correctly
        // Actual integration tests would require a mocked JsonRpcClient
    }

    #[test]
    fn revert_to_iteration_returns_not_implemented() {
        let runtime_home = std::path::PathBuf::from("/tmp/runtime");
        let session_id = uuid::Uuid::new_v4();
        let iteration_n = 1;

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(super::revert_to_iteration(
            session_id,
            iteration_n,
            runtime_home,
        ));

        assert!(matches!(
            result,
            Err(crate::error::AppError::NotImplemented { .. })
        ));
    }

    #[test]
    fn accept_prototype_returns_not_implemented() {
        let runtime_home = std::path::PathBuf::from("/tmp/runtime");
        let session_id = uuid::Uuid::new_v4();

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(super::accept_prototype(session_id, runtime_home));

        assert!(matches!(
            result,
            Err(crate::error::AppError::NotImplemented { .. })
        ));
    }

    #[test]
    fn draft_prototype_prompt_returns_not_implemented() {
        let runtime_home = std::path::PathBuf::from("/tmp/runtime");
        let session_id = uuid::Uuid::new_v4();

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(super::draft_prototype_prompt(session_id, runtime_home));

        assert!(matches!(
            result,
            Err(crate::error::AppError::NotImplemented { .. })
        ));
    }
}
