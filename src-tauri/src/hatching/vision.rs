use crate::error::{AppError, AppResult};
use crate::hatching::runtime::HatchingRuntimeManager;
use crate::runtime::input::TurnInputItem;
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
struct AgentMessageDeltaParams {
    delta: String,
}

/// Describe a reference image using Codex vision.
///
/// Sends a one-shot Codex text turn with the reference image attached
/// using a Codex turn and waits for the model response.
pub async fn describe_reference_image(
    runtime_manager: &HatchingRuntimeManager,
    thread_id: &str,
    image_path: &PathBuf,
) -> AppResult<String> {
    let client = runtime_manager
        .client()
        .ok_or_else(|| crate::error::AppError::JsonRpc {
            method: "describe_reference_image".to_string(),
            message: "Runtime manager not started".to_string(),
        })?;

    let items = vec![
        TurnInputItem::text(
            "Describe this reference image in 2–3 sentences for use as visual inspiration.",
        ),
        TurnInputItem::local_image(image_path),
    ];

    client
        .call(
            "turn/start",
            crate::hatching::runtime::read_only_turn_params(thread_id, items),
        )
        .await?;

    let mut full_response = String::new();
    let mut last_delta_time = std::time::Instant::now();

    let start = std::time::Instant::now();
    while start.elapsed().as_secs() < 30 {
        match runtime_manager
            .wait_for_notification("item/agentMessage/delta", 2000)
            .await
        {
            Ok(params) => {
                if let Ok(params) = serde_json::from_value::<AgentMessageDeltaParams>(params) {
                    full_response.push_str(&params.delta);
                    last_delta_time = std::time::Instant::now();
                }
            }
            Err(_) => {
                if last_delta_time.elapsed().as_secs() > 2 {
                    break;
                }
            }
        }
    }

    if full_response.is_empty() {
        return Err(AppError::JsonRpc {
            method: "describe_reference_image".to_string(),
            message: "No response received from Codex".to_string(),
        });
    }

    Ok(full_response)
}

#[allow(dead_code)]
pub async fn prefetch_description(
    runtime_manager: &HatchingRuntimeManager,
    thread_id: &str,
    image_path: &PathBuf,
) -> AppResult<String> {
    describe_reference_image(runtime_manager, thread_id, image_path).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn describe_reference_image_compiles() {}

    #[tokio::test]
    #[ignore = "Requires real Codex binary and auth"]
    async fn test_describe_reference_image_integration() {
        // This integration test requires:
        // 1. Codex binary on PATH
        // 2. Valid Codex auth
        // 3. A test image file
        //
        // To run: cargo test --manifest-path src-tauri/Cargo.toml --lib hatching::vision::tests::test_describe_reference_image_integration -- --ignored
        //
        // This test validates the full flow:
        // - Start HatchingRuntimeManager
        // - Create a test thread
        // - Call describe_reference_image with a test image
        // - Verify we receive deltas and get a non-empty response

        use crate::hatching::runtime::HatchingRuntimeManager;
        use crate::state::paths::AppPaths;
        use tempfile::tempdir;
        use uuid::Uuid;

        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));

        let session_id = Uuid::new_v4();

        let mut runtime_manager = HatchingRuntimeManager::new(session_id, &paths);

        runtime_manager
            .start()
            .await
            .expect("Failed to start runtime");

        let thread_id = runtime_manager
            .current_thread_id()
            .await
            .expect("Thread ID should be set after start");

        let test_image_path = std::env::temp_dir().join("test_vision.png");
        let test_image_data = vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        std::fs::write(&test_image_path, test_image_data).expect("Failed to write test image");

        let result = describe_reference_image(&runtime_manager, &thread_id, &test_image_path)
            .await
            .expect("Failed to describe reference image");

        assert!(!result.is_empty(), "Response should not be empty");

        std::fs::remove_file(&test_image_path).ok();
        runtime_manager.cancel().await.ok();
    }
}
