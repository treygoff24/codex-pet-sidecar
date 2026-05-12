use crate::error::{AppError, AppResult};
use crate::hatching::imagegen::ingest_next_imagegen_artifact;
use crate::hatching::runtime::{read_only_turn_params, HatchingRuntimeManager};
use crate::hatching::session::{PetBrief, PrototypeIteration};
use crate::runtime::input::TurnInputItem;
use crate::runtime::json_rpc::JsonRpcClient;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use time::OffsetDateTime;

const PROTOTYPE_IMAGEGEN_TIMEOUT_MS: u64 = 10 * 60 * 1000;

pub struct PrototypeGenerationRequest<'a> {
    pub client: &'a JsonRpcClient,
    pub runtime: &'a HatchingRuntimeManager,
    pub thread_id: &'a str,
    pub prompt: &'a str,
    pub reference_image_path: Option<&'a PathBuf>,
    pub feedback: Option<&'a str>,
    pub brief: &'a PetBrief,
    pub iteration_n: u32,
    pub runtime_home: &'a Path,
    pub workspace: &'a Path,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
struct RewriteResponse {
    revised_prompt: String,
    summary_of_changes: String,
}

pub fn build_initial_prompt(
    brief: &PetBrief,
    archetype: Option<&str>,
    reference_description: Option<&str>,
) -> String {
    let mut prompt = format!(
        "Create a 192x208 transparent-background pixel-art base identity sprite.\n\
         Display name: {name}\n\
         Description: {description}\n\
         Personality: {personality}\n",
        name = brief.display_name,
        description = brief.description,
        personality = brief.personality.join(", "),
    );
    if let Some(archetype) = archetype.map(str::trim).filter(|value| !value.is_empty()) {
        prompt.push_str(&format!("Archetype: {archetype}\n"));
    }
    if let Some(reference_description) = reference_description
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        prompt.push_str(&format!(
            "Visual reference notes: {reference_description}\n"
        ));
    }
    prompt
}

fn build_rewrite_prompt(brief: &PetBrief, previous_prompt: &str, feedback: &str) -> String {
    format!(
        "You are revising an imagegen prompt for a 192x208 transparent-background pixel-art pet sprite.\n\n\
         Brief:\n\
         - Display name: {name}\n\
         - Description: {description}\n\
         - Personality: {personality}\n\n\
         Previous imagegen prompt:\n\
         {previous_prompt}\n\n\
         User feedback to incorporate:\n\
         {feedback}\n\n\
         Reply with EXACTLY a JSON object on a single line of the form:\n\
         {{\"revised_prompt\": \"<full revised imagegen prompt>\", \"summary_of_changes\": \"<1-2 sentences>\"}}\n\n\
         - revised_prompt: the FULL imagegen prompt with the feedback woven in. Keep the 192x208 transparent-background pixel-art constraint.\n\
         - summary_of_changes: 1-2 sentences for the user describing what changed and why.\n\n\
         Do not include any prose, markdown, or text outside the JSON object.",
        name = brief.display_name,
        description = brief.description,
        personality = brief.personality.join(", "),
    )
}

fn parse_rewrite_response(raw: &str) -> Result<RewriteResponse, serde_json::Error> {
    if let Ok(parsed) = serde_json::from_str::<RewriteResponse>(raw) {
        return Ok(parsed);
    }

    let trimmed = raw.trim();
    let start = trimmed.find('{');
    let end = trimmed.rfind('}');
    match (start, end) {
        (Some(start), Some(end)) if end > start => {
            serde_json::from_str::<RewriteResponse>(&trimmed[start..=end])
        }
        _ => serde_json::from_str::<RewriteResponse>(raw),
    }
}

fn response_has_non_empty_fields(response: &RewriteResponse) -> bool {
    !response.revised_prompt.trim().is_empty() && !response.summary_of_changes.trim().is_empty()
}

fn is_wait_timeout(err: &AppError, method: &str) -> bool {
    matches!(err, AppError::JsonRpc { method: err_method, message }
        if err_method == method && message.contains("timed out"))
}

async fn collect_assistant_reply(
    runtime: &HatchingRuntimeManager,
    expected_turn_id: &str,
    max_total_ms: u64,
) -> AppResult<String> {
    let mut buffer = String::new();
    let started = std::time::Instant::now();
    loop {
        if started.elapsed().as_millis() as u64 > max_total_ms {
            return Err(AppError::RewriteFailed {
                attempts: 1,
                last_error: "timeout waiting for assistant reply".to_string(),
            });
        }

        match runtime.wait_for_any_notification(2_000).await {
            Ok((method, params)) if method == "item/agentMessage/delta" => {
                let turn_id = params.get("turnId").and_then(|value| value.as_str());
                if turn_id != Some(expected_turn_id) {
                    continue;
                }
                if let Some(delta) = params.get("delta").and_then(|value| value.as_str()) {
                    buffer.push_str(delta);
                }
                if !buffer.trim().is_empty()
                    && parse_rewrite_response(&buffer)
                        .as_ref()
                        .is_ok_and(response_has_non_empty_fields)
                {
                    return Ok(buffer);
                }
            }
            Ok((method, params)) if method == "turn/completed" => {
                let turn_id = params.pointer("/turn/id").and_then(|value| value.as_str());
                if turn_id == Some(expected_turn_id) {
                    return Ok(buffer);
                }
            }
            Ok((_method, _params)) => {}
            Err(ref error) if is_wait_timeout(error, "wait_for_any_notification") => continue,
            Err(error) => return Err(error),
        }
    }
}

async fn run_rewrite_turn(
    client: &JsonRpcClient,
    runtime: &HatchingRuntimeManager,
    thread_id: &str,
    brief: &PetBrief,
    previous_prompt: &str,
    feedback: &str,
) -> AppResult<(String, String)> {
    let prompt = build_rewrite_prompt(brief, previous_prompt, feedback);
    let mut last_error = String::new();
    for attempt in 1..=3 {
        let response = client
            .call(
                "turn/start",
                read_only_turn_params(thread_id, vec![TurnInputItem::text(prompt.clone())]),
            )
            .await?;
        let turn_id = response
            .pointer("/turn/id")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::RewriteFailed {
                attempts: attempt,
                last_error: "turn/start response missing turn.id".to_string(),
            })?
            .to_string();

        let raw = collect_assistant_reply(runtime, &turn_id, 30_000).await?;
        match parse_rewrite_response(&raw) {
            Ok(parsed) if response_has_non_empty_fields(&parsed) => {
                return Ok((parsed.revised_prompt, parsed.summary_of_changes));
            }
            Ok(_) => {
                last_error = format!("attempt {attempt}: empty field in parsed JSON");
            }
            Err(error) => {
                last_error = format!("attempt {attempt}: JSON parse failed ({error})");
            }
        }
    }

    Err(AppError::RewriteFailed {
        attempts: 3,
        last_error,
    })
}

/// Generate a prototype iteration, optionally incorporating user feedback.
pub async fn generate_prototype(
    request: PrototypeGenerationRequest<'_>,
) -> AppResult<PrototypeIteration> {
    let PrototypeGenerationRequest {
        client,
        runtime,
        thread_id,
        prompt,
        reference_image_path,
        feedback,
        brief,
        iteration_n,
        runtime_home,
        workspace,
    } = request;
    let trimmed_feedback = feedback.map(str::trim).filter(|value| !value.is_empty());
    let (revised_prompt, summary_of_changes) = if let Some(feedback) = trimmed_feedback {
        run_rewrite_turn(client, runtime, thread_id, brief, prompt, feedback).await?
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
        .call("turn/start", read_only_turn_params(thread_id, items))
        .await?;

    let image =
        ingest_next_imagegen_artifact(runtime_home, workspace, PROTOTYPE_IMAGEGEN_TIMEOUT_MS)
            .await?;
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
    use super::*;

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

    fn test_brief() -> PetBrief {
        PetBrief {
            display_name: "Juniper".to_string(),
            pet_id: "juniper".to_string(),
            description: "A sleepy green helper".to_string(),
            personality: vec!["warm".to_string(), "wry".to_string()],
            palette: None,
            backstory: None,
            speech_style: None,
            behavioral_quirks: None,
            visual_notes: None,
        }
    }

    #[test]
    fn parse_rewrite_response_strict_ok() {
        let parsed = parse_rewrite_response(
            r#"{"revised_prompt":"make it softer","summary_of_changes":"Softened the silhouette."}"#,
        )
        .expect("parse rewrite response");
        assert_eq!(
            parsed,
            RewriteResponse {
                revised_prompt: "make it softer".to_string(),
                summary_of_changes: "Softened the silhouette.".to_string(),
            }
        );
    }

    #[test]
    fn parse_rewrite_response_with_prose_ok() {
        let parsed = parse_rewrite_response(
            r#"Sure! Here it is: {"revised_prompt":"add amber eyes","summary_of_changes":"Added amber eyes."} Let me know."#,
        )
        .expect("parse prose-wrapped rewrite response");
        assert_eq!(parsed.revised_prompt, "add amber eyes");
        assert_eq!(parsed.summary_of_changes, "Added amber eyes.");
    }

    #[test]
    fn parse_rewrite_response_with_markdown_fence_ok() {
        let parsed = parse_rewrite_response(
            "```json\n{\"revised_prompt\":\"more cozy\",\"summary_of_changes\":\"Made it cozier.\"}\n```",
        )
        .expect("parse fenced rewrite response");
        assert_eq!(parsed.revised_prompt, "more cozy");
        assert_eq!(parsed.summary_of_changes, "Made it cozier.");
    }

    #[test]
    fn parse_rewrite_response_missing_field_err() {
        assert!(parse_rewrite_response(r#"{"revised_prompt":"x"}"#).is_err());
    }

    #[test]
    fn parsed_rewrite_response_empty_field_is_malformed() {
        let parsed = parse_rewrite_response(r#"{"revised_prompt":"x","summary_of_changes":"   "}"#)
            .expect("shape parses");
        assert!(!response_has_non_empty_fields(&parsed));
    }

    #[test]
    fn parse_rewrite_response_garbage_err() {
        assert!(parse_rewrite_response("not json at all").is_err());
    }

    #[test]
    fn build_rewrite_prompt_includes_brief_and_feedback() {
        let prompt = build_rewrite_prompt(&test_brief(), "old prompt", "make the ears pointier");
        assert!(prompt.contains("Juniper"));
        assert!(prompt.contains("A sleepy green helper"));
        assert!(prompt.contains("warm, wry"));
        assert!(prompt.contains("old prompt"));
        assert!(prompt.contains("make the ears pointier"));
    }

    #[test]
    fn build_initial_prompt_includes_optional_context() {
        let prompt = build_initial_prompt(
            &test_brief(),
            Some("cozy-sleeper"),
            Some("round glasses and leaf cloak"),
        );
        assert!(prompt.contains("Juniper"));
        assert!(prompt.contains("cozy-sleeper"));
        assert!(prompt.contains("round glasses and leaf cloak"));
        assert!(prompt.contains("192x208 transparent-background pixel-art"));
    }
}
