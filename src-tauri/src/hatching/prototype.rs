use crate::error::AppResult;
use crate::hatching::imagegen::ingest_next_imagegen_artifact;
use crate::hatching::session::PrototypeIteration;
use crate::runtime::input::TurnInputItem;
use crate::runtime::json_rpc::JsonRpcClient;
use std::path::{Path, PathBuf};
use time::OffsetDateTime;

pub struct PrototypeGenerationRequest<'a> {
    pub client: &'a JsonRpcClient,
    pub thread_id: &'a str,
    pub prompt: &'a str,
    pub reference_image_path: Option<&'a PathBuf>,
    pub feedback: Option<&'a str>,
    pub iteration_n: u32,
    pub runtime_home: &'a Path,
    pub workspace: &'a Path,
}

/// Generate a prototype iteration, optionally incorporating user feedback.
pub async fn generate_prototype(
    request: PrototypeGenerationRequest<'_>,
) -> AppResult<PrototypeIteration> {
    let PrototypeGenerationRequest {
        client,
        thread_id,
        prompt,
        reference_image_path,
        feedback,
        iteration_n,
        runtime_home,
        workspace,
    } = request;
    let trimmed_feedback = feedback.map(str::trim).filter(|value| !value.is_empty());
    // TODO(prototype-revision): when feedback is provided, dispatch a turn and stream the
    // model's reply (revised_prompt + summary_of_changes) instead of using string concat.
    // Requires subscribing to wire events for the turn and parsing a JSON object from the
    // assistant's text response. For now we deterministically append the user's guidance.
    let (revised_prompt, summary_of_changes) = if let Some(feedback) = trimmed_feedback {
        (
            format!("{prompt}\n\nRevision guidance: {feedback}"),
            format!("Applied feedback: {feedback}"),
        )
    } else {
        (prompt.to_string(), String::new())
    };

    let mut items = vec![TurnInputItem::text(format!(
        "Generate an image based on this prompt: {}",
        revised_prompt
    ))];

    if let Some(ref_path) = reference_image_path {
        items.push(TurnInputItem::local_image(ref_path));
    }

    client
        .call(
            "turn/start",
            crate::hatching::runtime::read_only_turn_params(thread_id, items),
        )
        .await?;

    let image = ingest_next_imagegen_artifact(runtime_home, workspace, 30_000).await?;
    Ok(PrototypeIteration {
        n: iteration_n,
        revised_prompt,
        summary_of_changes,
        user_feedback: trimmed_feedback.map(|f| f.to_string()),
        image,
        generated_at: OffsetDateTime::now_utc(),
    })
}

/// Draft the initial prototype prompt from brief + archetype + reference description.
#[allow(dead_code)]
pub async fn draft_prototype_prompt(
    session_id: uuid::Uuid,
    _runtime_home: PathBuf,
) -> AppResult<String> {
    Ok(format!(
        "Create a 192x208 transparent-background pixel-art base identity prototype for hatching session {session_id}."
    ))
}

#[cfg(test)]
mod tests {
    #[test]
    fn generate_prototype_compiles() {}

    #[test]
    fn draft_prototype_prompt_returns_session_prompt() {
        let runtime_home = std::path::PathBuf::from("/tmp/runtime");
        let session_id = uuid::Uuid::new_v4();

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(super::draft_prototype_prompt(session_id, runtime_home));

        assert!(result.unwrap().contains(&session_id.to_string()));
    }
}
