use crate::error::AppResult;
use crate::runtime::json_rpc::JsonRpcClient;
use serde_json::json;
use std::path::PathBuf;

/// Describe a reference image using Codex vision.
///
/// Sends a one-shot Codex text turn with the reference image attached
/// using the ThreadInjectItems API.
pub async fn describe_reference_image(
    client: &JsonRpcClient,
    thread_id: &str,
    image_path: &PathBuf,
) -> AppResult<String> {
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

    // Note: For a real implementation, we'd need to wait for the model response
    // and extract the description. This would require subscribing to thread events
    // or polling for the turn completion. For now, we return a placeholder.
    //
    // TODO: Implement proper response handling by:
    // 1. Subscribing to thread events or polling for turn completion
    // 2. Extracting the model's response from the turn
    // 3. Returning the actual description

    Ok("Vision description placeholder - implement response handling".to_string())
}

/// Async-prefetch wiring for reference image description.
///
/// This should be called after upload_reference_image to automatically
/// trigger the vision call in the background.
#[allow(dead_code)]
pub async fn prefetch_description(
    client: &JsonRpcClient,
    thread_id: &str,
    image_path: &PathBuf,
) -> AppResult<String> {
    // Spawn tokio task to call describe_reference_image automatically
    // This should update the session's reference_image.description and
    // description_status in the background
    describe_reference_image(client, thread_id, image_path).await
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
