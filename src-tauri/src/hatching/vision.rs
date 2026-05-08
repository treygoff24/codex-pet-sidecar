use crate::error::AppResult;
use crate::hatching::runtime::HatchingRuntimeManager;
use serde_json::json;
use std::path::PathBuf;

/// Describe a reference image using Codex vision.
///
/// Sends a one-shot Codex text turn with the reference image attached
/// using the ThreadInjectItems API and waits for the model response.
pub async fn describe_reference_image(
    runtime_manager: &HatchingRuntimeManager,
    thread_id: &str,
    image_path: &PathBuf,
) -> AppResult<String> {
    // Get client from runtime manager
    let client = runtime_manager
        .client()
        .ok_or_else(|| crate::error::AppError::JsonRpc {
            method: "describe_reference_image".to_string(),
            message: "Runtime manager not started".to_string(),
        })?;

    // Inject items into the thread: text prompt + image
    let items = vec![
        json!({"type":"text","text":"Describe this reference image in 2–3 sentences for use as visual inspiration.","text_elements":[]}),
        json!({"type":"localImage","path":image_path}),
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

    // Wait for agent message delta notification and extract the description
    // Note: This requires understanding the exact notification format from Codex
    // For now, we use a placeholder until we can test with real Codex
    //
    // TODO: Wait for the appropriate notification (e.g., "agent/messageDelta")
    // and parse the response text from the notification params
    let _notification = runtime_manager
        .wait_for_notification("agent/messageDelta", 30000)
        .await?;

    // TODO: Parse the notification to extract the actual description text
    // The notification params should contain the message delta with the text content
    Ok("Vision description placeholder - need to parse notification".to_string())
}

/// Async-prefetch wiring for reference image description.
///
/// This should be called after upload_reference_image to automatically
/// trigger the vision call in the background.
#[allow(dead_code)]
pub async fn prefetch_description(
    runtime_manager: &HatchingRuntimeManager,
    thread_id: &str,
    image_path: &PathBuf,
) -> AppResult<String> {
    // Spawn tokio task to call describe_reference_image automatically
    // This should update the session's reference_image.description and
    // description_status in the background
    describe_reference_image(runtime_manager, thread_id, image_path).await
}

#[cfg(test)]
mod tests {
    #[test]
    fn describe_reference_image_compiles() {
        // This test verifies that the function signature compiles correctly
        // Actual integration tests would require a mocked JsonRpcClient
        // The function is tested indirectly through integration tests
    }
}
