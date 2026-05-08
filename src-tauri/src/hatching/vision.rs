use crate::error::{AppError, AppResult};
use std::path::PathBuf;
use uuid::Uuid;

/// Describe a reference image using Codex vision.
///
/// This is a stub implementation pending actual Codex client integration.
/// When the Codex JSON-RPC client is available, this should:
/// 1. Send a one-shot Codex text turn with the reference image attached
/// 2. Use prompt: "Describe this reference image in 2–3 sentences for use as visual inspiration."
/// 3. Update ReferenceImage.description on success
/// 4. Update description_status on success/failure
/// 5. Persist the updated session
pub async fn describe_reference_image(
    _session_id: Uuid,
    _reference_image_id: Uuid,
    _runtime_home: PathBuf,
) -> AppResult<String> {
    // TODO: Implement actual Codex vision call when JSON-RPC client is integrated
    // For now, return an error indicating this needs Codex integration
    Err(AppError::NotImplemented {
        command: "describe_reference_image (requires Codex client integration)".to_string(),
    })
}

/// Async-prefetch wiring for reference image description.
///
/// This should be called after upload_reference_image to automatically
/// trigger the vision call in the background.
#[allow(dead_code)]
pub async fn prefetch_description(
    _session_id: Uuid,
    _reference_image_id: Uuid,
    _runtime_home: PathBuf,
) -> AppResult<()> {
    // TODO: Spawn tokio task to call describe_reference_image automatically
    // This should update the session's reference_image.description and
    // description_status in the background
    describe_reference_image(_session_id, _reference_image_id, _runtime_home).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn describe_reference_image_returns_not_implemented() {
        // This test documents that the function is stubbed pending Codex integration
        // When actual Codex client is available, this test should be replaced
        // with integration tests using a mocked Codex client
        let runtime_home = PathBuf::from("/tmp/runtime");
        let session_id = Uuid::new_v4();
        let reference_image_id = Uuid::new_v4();

        // Use blocking executor for test
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(describe_reference_image(
            session_id,
            reference_image_id,
            runtime_home,
        ));

        assert!(matches!(result, Err(AppError::NotImplemented { .. })));
    }

    #[test]
    fn prefetch_description_returns_not_implemented() {
        let runtime_home = PathBuf::from("/tmp/runtime");
        let session_id = Uuid::new_v4();
        let reference_image_id = Uuid::new_v4();

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(prefetch_description(
            session_id,
            reference_image_id,
            runtime_home,
        ));

        assert!(matches!(result, Err(AppError::NotImplemented { .. })));
    }
}
