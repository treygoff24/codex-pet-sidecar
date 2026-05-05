use crate::error::{AppError, AppResult};
use crate::runtime::approvals::{
    approval_request, kind_for_method, response_for_action, ApprovalKind,
};
use crate::runtime::events::{ApprovalAction, RuntimeEvent, RuntimeSession};
use crate::runtime::json_rpc::{JsonRpcClient, WireEvent};
use crate::runtime::process::AppServerProcess;
use crate::runtime::prompt::{compose_base_instructions, compose_developer_instructions};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use which::which;

const PET_REASONING_EFFORT: &str = "medium";
const DISABLED_PET_MCP_SERVERS: [&str; 4] = ["pencil", "porkbun", "resend", "serena"];

#[derive(Debug, Clone)]
pub struct StartPetSessionRequest {
    pub pet_name: String,
    pub persona: String,
    pub memory_markdown: String,
    pub memory_path: PathBuf,
    pub workspace_cwd: PathBuf,
}

#[derive(Debug, Clone)]
pub struct PetUserInput {
    pub text: String,
    pub local_images: Vec<PathBuf>,
}

#[derive(Debug, Clone)]
pub struct AmbientTurnInput {
    pub prompt: String,
    pub screenshot_path: Option<PathBuf>,
    pub cleanup_screenshot_after_turn: bool,
}

#[derive(Default)]
pub struct RuntimeSessionManager {
    inner: Mutex<Option<RuntimeConnection>>,
}

struct RuntimeConnection {
    process: AppServerProcess,
    client: JsonRpcClient,
    session: RuntimeSession,
    tracker: Arc<Mutex<TurnTracker>>,
    pending_approvals: Arc<Mutex<HashMap<String, ApprovalKind>>>,
}

#[derive(Debug, Default)]
struct TurnTracker {
    active_user_turn_id: Option<String>,
    ambient_turns: HashMap<String, AmbientTurnState>,
}

#[derive(Debug, Clone)]
struct AmbientTurnState {
    buffer: String,
    screenshot_path: Option<PathBuf>,
    cleanup_screenshot_after_turn: bool,
}

impl RuntimeSessionManager {
    pub async fn start_pet_session(
        &self,
        request: StartPetSessionRequest,
        event_tx: mpsc::UnboundedSender<RuntimeEvent>,
    ) -> AppResult<RuntimeSession> {
        self.shutdown().await?;
        let codex_path = which("codex").map_err(|_| AppError::CodexNotFound)?;
        let process = AppServerProcess::spawn_from_path(&codex_path).await?;
        let websocket_url = process.websocket_url.clone();
        let (wire_tx, mut wire_rx) = mpsc::unbounded_channel();
        let client = JsonRpcClient::connect(&websocket_url, wire_tx).await?;

        client.call("initialize", json!({
            "clientInfo": {"name":"codex-pet-sidecar","title":"Codex Pet Sidecar","version": env!("CARGO_PKG_VERSION")},
            "capabilities": {"experimentalApi": true}
        })).await?;
        let base_instructions = compose_base_instructions(
            &request.pet_name,
            &request.persona,
            &request.memory_markdown,
        );
        let developer_instructions = compose_developer_instructions(&request.memory_path);
        let config_overrides = pet_thread_config_overrides();
        let thread = client
            .call(
                "thread/start",
                json!({
                    "cwd": request.workspace_cwd,
                    "approvalPolicy": "never",
                    "approvalsReviewer": "user",
                    "sandbox": "danger-full-access",
                    "config": config_overrides,
                    "baseInstructions": base_instructions,
                    "developerInstructions": developer_instructions,
                    "ephemeral": false,
                    "experimentalRawEvents": false,
                    "persistExtendedHistory": true
                }),
            )
            .await?;
        let thread_id = thread
            .pointer("/thread/id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let effective_model = thread
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string();
        let session = RuntimeSession {
            thread_id,
            websocket_url,
            effective_model,
        };

        let client_for_events = client.clone();
        let event_tx_for_task = event_tx.clone();
        let pending_approvals = Arc::new(Mutex::new(HashMap::new()));
        let pending_for_task = Arc::clone(&pending_approvals);
        let tracker = Arc::new(Mutex::new(TurnTracker::default()));
        let tracker_for_task = Arc::clone(&tracker);
        tokio::spawn(async move {
            while let Some(event) = wire_rx.recv().await {
                if let WireEvent::ServerRequest { id, ref method, .. } = event {
                    pending_for_task
                        .lock()
                        .await
                        .insert(id.to_string(), kind_for_method(method));
                }
                if let Some(runtime_event) =
                    map_wire_event(event, &client_for_events, &tracker_for_task).await
                {
                    let _ = event_tx_for_task.send(runtime_event);
                }
            }
        });

        *self.inner.lock().await = Some(RuntimeConnection {
            process,
            client,
            session: session.clone(),
            tracker,
            pending_approvals,
        });
        Ok(session)
    }

    pub async fn send_user_turn(&self, input: PetUserInput) -> AppResult<()> {
        let mut guard = self.inner.lock().await;
        let connection = guard.as_mut().ok_or(AppError::RuntimeNotStarted)?;
        if connection.tracker.lock().await.has_active_turn() {
            return Err(AppError::TurnAlreadyActive);
        }
        let result = connection
            .client
            .call(
                "turn/start",
                json!({
                    "threadId": connection.session.thread_id,
                    "input": user_input_items(&input)
                }),
            )
            .await?;
        if let Some(turn_id) = turn_id_from_response(&result) {
            connection.tracker.lock().await.active_user_turn_id = Some(turn_id);
        }
        Ok(())
    }

    pub async fn send_ambient_turn(&self, input: AmbientTurnInput) -> AppResult<bool> {
        let guard = self.inner.lock().await;
        let connection = guard.as_ref().ok_or(AppError::RuntimeNotStarted)?;
        if connection.tracker.lock().await.has_active_turn() {
            return Ok(false);
        }
        let result = connection
            .client
            .call(
                "turn/start",
                json!({
                    "threadId": connection.session.thread_id,
                    "input": ambient_input_items(&input)
                }),
            )
            .await?;
        if let Some(turn_id) = turn_id_from_response(&result) {
            connection.tracker.lock().await.ambient_turns.insert(
                turn_id,
                AmbientTurnState {
                    buffer: String::new(),
                    screenshot_path: input.screenshot_path,
                    cleanup_screenshot_after_turn: input.cleanup_screenshot_after_turn,
                },
            );
            return Ok(true);
        }
        Ok(false)
    }

    pub async fn interrupt_turn(&self) -> AppResult<()> {
        let guard = self.inner.lock().await;
        let connection = guard.as_ref().ok_or(AppError::RuntimeNotStarted)?;
        let turn_id = connection
            .tracker
            .lock()
            .await
            .active_user_turn_id
            .clone()
            .ok_or(AppError::NoActiveTurn)?;
        connection
            .client
            .call(
                "turn/interrupt",
                json!({"threadId": connection.session.thread_id, "turnId": turn_id}),
            )
            .await?;
        Ok(())
    }

    pub async fn respond_to_approval(
        &self,
        request_id: &str,
        action: ApprovalAction,
    ) -> AppResult<()> {
        let mut guard = self.inner.lock().await;
        let connection = guard.as_mut().ok_or(AppError::RuntimeNotStarted)?;
        let kind = connection
            .pending_approvals
            .lock()
            .await
            .remove(request_id)
            .ok_or_else(|| AppError::ApprovalNotPending(request_id.to_string()))?;
        let numeric_id = request_id
            .parse::<u64>()
            .map_err(|_| AppError::ApprovalNotPending(request_id.to_string()))?;
        connection
            .client
            .respond(numeric_id, response_for_action(kind, action))
            .await
    }

    pub async fn shutdown(&self) -> AppResult<()> {
        if let Some(mut connection) = self.inner.lock().await.take() {
            connection.process.shutdown().await?;
        }
        Ok(())
    }
}

impl TurnTracker {
    fn has_active_turn(&self) -> bool {
        self.active_user_turn_id.is_some() || !self.ambient_turns.is_empty()
    }

    fn append_delta(&mut self, turn_id: &str, delta: &str) -> bool {
        if let Some(turn) = self.ambient_turns.get_mut(turn_id) {
            turn.buffer.push_str(delta);
            return true;
        }
        false
    }

    fn complete_turn(&mut self, turn_id: &str) -> CompletedTurn {
        if self.active_user_turn_id.as_deref() == Some(turn_id) {
            self.active_user_turn_id = None;
            return CompletedTurn::User;
        }
        self.ambient_turns
            .remove(turn_id)
            .map(CompletedTurn::Ambient)
            .unwrap_or(CompletedTurn::Unknown)
    }
}

enum CompletedTurn {
    User,
    Ambient(AmbientTurnState),
    Unknown,
}

fn user_input_items(input: &PetUserInput) -> Vec<Value> {
    let mut items = vec![json!({"type":"text","text":input.text,"text_elements":[]})];
    for path in &input.local_images {
        items.push(json!({"type":"localImage","path":path}));
    }
    items
}

fn ambient_input_items(input: &AmbientTurnInput) -> Vec<Value> {
    let pet_input = PetUserInput {
        text: input.prompt.clone(),
        local_images: input.screenshot_path.iter().cloned().collect(),
    };
    user_input_items(&pet_input)
}

fn turn_id_from_response(response: &Value) -> Option<String> {
    response
        .pointer("/turn/id")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

fn pet_thread_config_overrides() -> Value {
    let mut disabled_servers = serde_json::Map::new();
    for server in DISABLED_PET_MCP_SERVERS {
        disabled_servers.insert(server.to_string(), json!({ "enabled": false }));
    }

    json!({
        "model_reasoning_effort": PET_REASONING_EFFORT,
        "mcp_servers": disabled_servers
    })
}

async fn map_wire_event(
    event: WireEvent,
    client: &JsonRpcClient,
    tracker: &Arc<Mutex<TurnTracker>>,
) -> Option<RuntimeEvent> {
    match event {
        WireEvent::Notification { method, params } if method == "item/agentMessage/delta" => {
            let turn_id = params
                .get("turnId")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let delta = params
                .get("delta")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if tracker.lock().await.append_delta(turn_id, delta) {
                return None;
            }
            Some(RuntimeEvent::TextDelta {
                text: delta.to_string(),
            })
        }
        WireEvent::Notification { method, params } if method == "turn/completed" => {
            let turn_id = params
                .pointer("/turn/id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            match tracker.lock().await.complete_turn(&turn_id) {
                CompletedTurn::Ambient(turn) => ambient_turn_event(turn),
                CompletedTurn::User | CompletedTurn::Unknown => {
                    Some(RuntimeEvent::TurnCompleted { final_text: None })
                }
            }
        }
        WireEvent::Notification { method, params } if method == "error" => {
            Some(RuntimeEvent::Error {
                message: params.to_string(),
            })
        }
        WireEvent::ServerRequest { id, method, params } => {
            let request = approval_request(id, &method, &params);
            if kind_for_method(&method) == ApprovalKind::Unknown {
                let _ = client.respond(id, json!({"decision":"decline"})).await;
            }
            Some(RuntimeEvent::ApprovalRequest { request })
        }
        WireEvent::Error(message) => Some(RuntimeEvent::Error { message }),
        _ => None,
    }
}

fn ambient_turn_event(turn: AmbientTurnState) -> Option<RuntimeEvent> {
    if turn.cleanup_screenshot_after_turn {
        if let Some(path) = &turn.screenshot_path {
            let _ = std::fs::remove_file(path);
        }
    }
    parse_ambient_decision(&turn.buffer).and_then(|message| {
        if message.trim().is_empty() {
            None
        } else {
            Some(RuntimeEvent::AmbientMessage { text: message })
        }
    })
}

fn parse_ambient_decision(text: &str) -> Option<String> {
    let json_text = extract_json_object(text)?;
    let value: Value = serde_json::from_str(json_text).ok()?;
    if !value.get("shouldSpeak").and_then(Value::as_bool)? {
        return None;
    }
    value
        .get("message")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .map(ToOwned::to_owned)
}

fn extract_json_object(text: &str) -> Option<&str> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    (start <= end).then_some(&text[start..=end])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::prompt::compose_base_instructions;

    #[test]
    fn request_keeps_memory_path_absolute() {
        let request = StartPetSessionRequest {
            pet_name: "Olive".into(),
            persona: "warm".into(),
            memory_markdown: "# Memory".into(),
            memory_path: PathBuf::from("/tmp/memory.md"),
            workspace_cwd: PathBuf::from("/tmp"),
        };
        assert!(request.memory_path.is_absolute());
        assert!(compose_base_instructions(
            &request.pet_name,
            &request.persona,
            &request.memory_markdown
        )
        .contains("# Memory"));
    }

    #[test]
    fn user_input_items_include_local_images() {
        let input = PetUserInput {
            text: "look at this".into(),
            local_images: vec![PathBuf::from("/tmp/screen.jpg")],
        };
        let items = user_input_items(&input);
        assert_eq!(items[0]["type"], "text");
        assert_eq!(items[1]["type"], "localImage");
        assert_eq!(items[1]["path"], "/tmp/screen.jpg");
    }

    #[test]
    fn ambient_input_items_include_screenshot_when_available() {
        let input = AmbientTurnInput {
            prompt: "ambient snapshot".into(),
            screenshot_path: Some(PathBuf::from("/tmp/ambient.jpg")),
            cleanup_screenshot_after_turn: true,
        };
        let items = ambient_input_items(&input);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0]["type"], "text");
        assert_eq!(items[0]["text"], "ambient snapshot");
        assert_eq!(items[1]["type"], "localImage");
        assert_eq!(items[1]["path"], "/tmp/ambient.jpg");
    }

    #[test]
    fn ambient_decision_only_speaks_when_json_allows_it() {
        assert_eq!(
            parse_ambient_decision(r#"{"shouldSpeak":true,"message":"Take a stretch."}"#),
            Some("Take a stretch.".into())
        );
        assert_eq!(
            parse_ambient_decision(r#"{"shouldSpeak":false,"message":"Nope"}"#),
            None
        );
    }

    #[test]
    fn ambient_decision_tolerates_wrapped_json_and_rejects_empty_messages() {
        assert_eq!(
            parse_ambient_decision(
                r#"Here is the decision: {"shouldSpeak":true,"message":"  Check the build.  "} thanks"#
            ),
            Some("Check the build.".into())
        );
        assert_eq!(
            parse_ambient_decision(r#"{"shouldSpeak":true,"message":"   "}"#),
            None
        );
    }

    #[test]
    fn ambient_turn_event_cleans_ephemeral_screenshot() {
        let dir = tempfile::tempdir().expect("tempdir");
        let screenshot = dir.path().join("ambient.jpg");
        std::fs::write(&screenshot, b"fake image").expect("write screenshot");

        let event = ambient_turn_event(AmbientTurnState {
            buffer: r#"{"shouldSpeak":true,"message":"Looks busy."}"#.into(),
            screenshot_path: Some(screenshot.clone()),
            cleanup_screenshot_after_turn: true,
        });

        assert_eq!(
            event,
            Some(RuntimeEvent::AmbientMessage {
                text: "Looks busy.".into()
            })
        );
        assert!(!screenshot.exists());
    }

    #[test]
    fn tracker_reports_active_ambient_turns() {
        let mut tracker = TurnTracker::default();
        assert!(!tracker.has_active_turn());
        tracker.ambient_turns.insert(
            "turn-1".into(),
            AmbientTurnState {
                buffer: String::new(),
                screenshot_path: None,
                cleanup_screenshot_after_turn: false,
            },
        );
        assert!(tracker.has_active_turn());
        assert!(matches!(
            tracker.complete_turn("turn-1"),
            CompletedTurn::Ambient(_)
        ));
        assert!(!tracker.has_active_turn());
    }

    #[test]
    fn pet_thread_config_uses_medium_reasoning_and_disables_selected_mcps() {
        let config = pet_thread_config_overrides();
        assert_eq!(config["model_reasoning_effort"], "medium");
        for server in DISABLED_PET_MCP_SERVERS {
            assert_eq!(config["mcp_servers"][server]["enabled"], false);
        }
    }
}
