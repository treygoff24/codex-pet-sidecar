use crate::error::{AppError, AppResult};
use crate::runtime::approvals::{
    approval_request, kind_for_method, response_for_action, ApprovalKind,
};
use crate::runtime::events::{ApprovalAction, RuntimeEvent, RuntimeSession};
use crate::runtime::input::TurnInputItem;
use crate::runtime::json_rpc::{JsonRpcClient, WireEvent};
use crate::runtime::process::AppServerProcess;
use crate::runtime::prompt::{compose_base_instructions, compose_developer_instructions};
use crate::state::{RuntimeConfig, RuntimeSafetyMode, SessionPersistence};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};

const PET_REASONING_EFFORT: &str = "medium";
const SAFE_APPROVAL_POLICY: &str = "on-request";
const SAFE_SANDBOX: &str = "workspace-write";

#[derive(Debug, Clone)]
pub struct StartPetSessionRequest {
    pub pet_name: String,
    pub persona: String,
    pub memory_markdown: String,
    pub memory_path: PathBuf,
    pub workspace_cwd: PathBuf,
    pub runtime_codex_home: PathBuf,
    pub runtime: RuntimeConfig,
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
    // The forwarding task that pumps wire events into the user-facing event
    // channel. We abort it on shutdown so the websocket-reset error produced
    // by killing the codex child never reaches the frontend as a fresh error.
    wire_task: tokio::task::JoinHandle<()>,
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

#[derive(Debug, Deserialize)]
struct ThreadStartResponse {
    thread: ThreadReference,
    model: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ThreadReference {
    id: String,
}

#[derive(Debug, Deserialize)]
struct TurnStartResponse {
    turn: Option<TurnReference>,
}

#[derive(Debug, Deserialize)]
struct TurnReference {
    id: String,
}

impl RuntimeSessionManager {
    pub async fn start_pet_session(
        &self,
        request: StartPetSessionRequest,
        event_tx: mpsc::UnboundedSender<RuntimeEvent>,
    ) -> AppResult<RuntimeSession> {
        self.shutdown().await?;
        let process = AppServerProcess::spawn(&request.runtime_codex_home).await?;
        let websocket_url = process.websocket_url.clone();
        let (wire_tx, wire_rx) = mpsc::unbounded_channel();
        let client = JsonRpcClient::connect(&websocket_url, wire_tx).await?;

        client.call("initialize", json!({
            "clientInfo": {"name":"codex-pet-sidecar","title":"Codex Pet Sidecar","version": env!("CARGO_PKG_VERSION")},
            "capabilities": {"experimentalApi": true}
        })).await?;
        let thread = client
            .call_result::<ThreadStartResponse>("thread/start", thread_start_params(&request)?)
            .await?;
        let thread_id = thread.thread.id;
        let effective_model = thread.model.unwrap_or_else(|| "unknown".to_string());
        let session = RuntimeSession {
            thread_id,
            websocket_url,
            effective_model,
        };

        let pending_approvals = Arc::new(Mutex::new(HashMap::new()));
        let tracker = Arc::new(Mutex::new(TurnTracker::default()));
        let wire_task = spawn_wire_event_forwarder(
            client.clone(),
            wire_rx,
            event_tx.clone(),
            Arc::clone(&pending_approvals),
            Arc::clone(&tracker),
        );

        *self.inner.lock().await = Some(RuntimeConnection {
            process,
            client,
            session: session.clone(),
            tracker,
            pending_approvals,
            wire_task,
        });
        Ok(session)
    }

    pub async fn send_user_turn(&self, input: PetUserInput) -> AppResult<()> {
        let mut guard = self.inner.lock().await;
        let connection = guard.as_mut().ok_or(AppError::RuntimeNotStarted)?;

        // A real user turn is the only thing that should block another user
        // turn — the model is busy generating a reply. Ambient turns are
        // best-effort and must yield to the human.
        let preempt_ambient_ids: Vec<String> = {
            let mut tracker = connection.tracker.lock().await;
            if tracker.active_user_turn_id.is_some() {
                return Err(AppError::TurnAlreadyActive);
            }
            tracker
                .take_active_ambient_turns()
                .into_iter()
                .map(|(turn_id, state)| {
                    cleanup_screenshot_file(
                        state.cleanup_screenshot_after_turn,
                        state.screenshot_path.as_deref(),
                    );
                    turn_id
                })
                .collect()
        };

        for turn_id in preempt_ambient_ids {
            // Best-effort. If the server says the turn is already gone, fine —
            // we still want the user's message to go through.
            let _ = connection
                .client
                .call(
                    "turn/interrupt",
                    json!({"threadId": connection.session.thread_id, "turnId": turn_id}),
                )
                .await;
        }

        let result = connection
            .client
            .call_result::<TurnStartResponse>(
                "turn/start",
                json!({
                    "threadId": connection.session.thread_id,
                    "input": user_input_items(&input)
                }),
            )
            .await?;
        if let Some(turn_id) = turn_id_from_response(result) {
            connection.tracker.lock().await.active_user_turn_id = Some(turn_id);
        } else {
            eprintln!("warning: turn/start response had no turn.id; correlation may be lost");
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
            .call_result::<TurnStartResponse>(
                "turn/start",
                json!({
                    "threadId": connection.session.thread_id,
                    "input": ambient_input_items(&input)
                }),
            )
            .await?;
        if let Some(turn_id) = turn_id_from_response(result) {
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
        eprintln!("warning: turn/start response had no turn.id; correlation may be lost");
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
            // Abort the wire-event forwarding task BEFORE killing the codex
            // child. Otherwise the websocket-reset that follows the kill is
            // mapped to a RuntimeEvent::Error and pushed to the live UI as a
            // fresh "Connection reset" error, even though this teardown is
            // intentional (pet switch, runtime restart, app shutdown).
            connection.wire_task.abort();
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

    fn take_active_ambient_turns(&mut self) -> Vec<(String, AmbientTurnState)> {
        self.ambient_turns.drain().collect()
    }

    /// Drop all turn state. Called on wire-level errors where the tracker
    /// would otherwise stay stuck — we'd rather lose an in-flight ambient
    /// buffer than refuse every future user send.
    fn clear(&mut self) -> Vec<AmbientTurnState> {
        self.active_user_turn_id = None;
        self.ambient_turns.drain().map(|(_, v)| v).collect()
    }
}

/// Remove an ambient screenshot if the turn requested cleanup. No-op if cleanup
/// wasn't requested, the path is missing, or the file is already gone.
pub(crate) fn cleanup_screenshot_file(cleanup: bool, path: Option<&std::path::Path>) {
    if !cleanup {
        return;
    }
    let Some(path) = path else { return };
    let _ = std::fs::remove_file(path);
}

enum CompletedTurn {
    User,
    Ambient(AmbientTurnState),
    Unknown,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AmbientDecision {
    should_speak: bool,
    message: String,
}

fn user_input_items(input: &PetUserInput) -> Vec<TurnInputItem> {
    let mut items = vec![TurnInputItem::text(input.text.as_str())];
    for path in &input.local_images {
        items.push(TurnInputItem::local_image(path));
    }
    items
}

fn ambient_input_items(input: &AmbientTurnInput) -> Vec<TurnInputItem> {
    let pet_input = PetUserInput {
        text: input.prompt.clone(),
        local_images: input.screenshot_path.iter().cloned().collect(),
    };
    user_input_items(&pet_input)
}

fn turn_id_from_response(response: TurnStartResponse) -> Option<String> {
    response.turn.map(|turn| turn.id)
}

fn thread_start_params(request: &StartPetSessionRequest) -> AppResult<Value> {
    let base_instructions = compose_base_instructions(
        &request.pet_name,
        &request.persona,
        &request.memory_markdown,
    );
    let developer_instructions = compose_developer_instructions(&request.memory_path);
    let (approval_policy, sandbox) = runtime_permissions(&request.runtime)?;
    let ephemeral = matches!(
        request.runtime.session_persistence,
        SessionPersistence::Ephemeral
    );
    Ok(json!({
        "cwd": request.workspace_cwd,
        "approvalPolicy": approval_policy,
        "approvalsReviewer": "user",
        "sandbox": sandbox,
        "config": pet_thread_config_overrides(),
        "baseInstructions": base_instructions,
        "developerInstructions": developer_instructions,
        "ephemeral": ephemeral,
        "experimentalRawEvents": false,
        "persistExtendedHistory": !ephemeral
    }))
}

fn runtime_permissions(config: &RuntimeConfig) -> AppResult<(&'static str, &'static str)> {
    Ok(match config.safety_mode {
        RuntimeSafetyMode::Safe => (SAFE_APPROVAL_POLICY, SAFE_SANDBOX),
        RuntimeSafetyMode::Power => ("never", "danger-full-access"),
    })
}

fn pet_thread_config_overrides() -> Value {
    json!({
        "model_reasoning_effort": PET_REASONING_EFFORT
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
            clear_tracker_on_error(tracker).await;
            Some(RuntimeEvent::Error {
                message: params.to_string(),
            })
        }
        WireEvent::ServerRequest { id, method, params } => {
            if kind_for_method(&method) == ApprovalKind::Unknown {
                // Auto-decline unknown approval methods so the server isn't
                // left waiting, and don't surface a dialog the user can't act
                // on. Logged so a maintainer can spot a kind we should be
                // classifying.
                let _ = client.respond(id, json!({"decision":"decline"})).await;
                eprintln!("warning: auto-declined approval for unknown method `{method}`");
                return None;
            }
            Some(RuntimeEvent::ApprovalRequest {
                request: approval_request(id, &method, &params),
            })
        }
        WireEvent::Error(message) => {
            clear_tracker_on_error(tracker).await;
            Some(RuntimeEvent::Error { message })
        }
        _ => None,
    }
}

/// Spawn the task that pumps wire events from the JSON-RPC client into the
/// user-facing event channel. The returned `JoinHandle` is held on
/// `RuntimeConnection` so `shutdown` can `abort()` it before killing the codex
/// child — otherwise the websocket-reset that follows the kill would be mapped
/// to a fresh `RuntimeEvent::Error` and surfaced to the UI.
fn spawn_wire_event_forwarder(
    client: JsonRpcClient,
    mut wire_rx: mpsc::UnboundedReceiver<WireEvent>,
    event_tx: mpsc::UnboundedSender<RuntimeEvent>,
    pending_approvals: Arc<Mutex<HashMap<String, ApprovalKind>>>,
    tracker: Arc<Mutex<TurnTracker>>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        while let Some(event) = wire_rx.recv().await {
            // Only track approvals we know how to act on. Unknown kinds are
            // auto-declined inside map_wire_event and never reach the user, so
            // registering them in pending_approvals would just leak entries
            // that are never popped.
            if let WireEvent::ServerRequest { id, ref method, .. } = event {
                let kind = kind_for_method(method);
                if kind != ApprovalKind::Unknown {
                    pending_approvals.lock().await.insert(id.to_string(), kind);
                }
            }
            if let Some(runtime_event) = map_wire_event(event, &client, &tracker).await {
                let _ = event_tx.send(runtime_event);
            }
        }
    })
}

async fn clear_tracker_on_error(tracker: &Arc<Mutex<TurnTracker>>) {
    let drained = {
        let mut guard = tracker.lock().await;
        guard.clear()
    };
    for state in drained {
        cleanup_screenshot_file(
            state.cleanup_screenshot_after_turn,
            state.screenshot_path.as_deref(),
        );
    }
}

fn ambient_turn_event(turn: AmbientTurnState) -> Option<RuntimeEvent> {
    cleanup_screenshot_file(
        turn.cleanup_screenshot_after_turn,
        turn.screenshot_path.as_deref(),
    );
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
    let decision: AmbientDecision = serde_json::from_str(json_text).ok()?;
    if !decision.should_speak {
        return None;
    }
    let message = decision.message.trim();
    (!message.is_empty()).then(|| message.to_string())
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
            runtime_codex_home: PathBuf::from("/tmp/codex-runtime-home"),
            runtime: RuntimeConfig::default(),
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
    fn thread_start_params_uses_public_safe_defaults() {
        let request = StartPetSessionRequest {
            pet_name: "Olive".into(),
            persona: "warm".into(),
            memory_markdown: "# Memory".into(),
            memory_path: PathBuf::from("/tmp/memory.md"),
            workspace_cwd: PathBuf::from("/tmp"),
            runtime_codex_home: PathBuf::from("/tmp/codex-runtime-home"),
            runtime: RuntimeConfig::default(),
        };
        let params = thread_start_params(&request).expect("params");
        assert_eq!(params["ephemeral"], true);
        assert_eq!(params["persistExtendedHistory"], false);
        assert_eq!(params["approvalPolicy"], "on-request");
        assert_eq!(params["sandbox"], "workspace-write");
    }

    #[test]
    fn thread_start_params_allows_explicit_power_saved_mode() {
        let request = StartPetSessionRequest {
            pet_name: "Olive".into(),
            persona: "warm".into(),
            memory_markdown: "# Memory".into(),
            memory_path: PathBuf::from("/tmp/memory.md"),
            workspace_cwd: PathBuf::from("/tmp"),
            runtime_codex_home: PathBuf::from("/tmp/codex-runtime-home"),
            runtime: RuntimeConfig {
                session_persistence: SessionPersistence::SavedHistory,
                safety_mode: RuntimeSafetyMode::Power,
            },
        };
        let params = thread_start_params(&request).expect("params");
        assert_eq!(params["ephemeral"], false);
        assert_eq!(params["persistExtendedHistory"], true);
        assert_eq!(params["approvalPolicy"], "never");
        assert_eq!(params["sandbox"], "danger-full-access");
    }

    #[test]
    fn user_input_items_include_local_images() {
        let input = PetUserInput {
            text: "look at this".into(),
            local_images: vec![PathBuf::from("/tmp/screen.jpg")],
        };
        let items = user_input_items(&input);
        let items = serde_json::to_value(items).expect("items serialize");
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
        let items = serde_json::to_value(items).expect("items serialize");
        assert_eq!(items.as_array().expect("items array").len(), 2);
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
    fn tracker_take_active_ambient_turns_drains_and_returns_state() {
        let mut tracker = TurnTracker::default();
        tracker.ambient_turns.insert(
            "turn-a".into(),
            AmbientTurnState {
                buffer: "partial".into(),
                screenshot_path: Some(PathBuf::from("/tmp/a.jpg")),
                cleanup_screenshot_after_turn: true,
            },
        );
        tracker.ambient_turns.insert(
            "turn-b".into(),
            AmbientTurnState {
                buffer: String::new(),
                screenshot_path: None,
                cleanup_screenshot_after_turn: false,
            },
        );

        let drained = tracker.take_active_ambient_turns();
        assert_eq!(drained.len(), 2);
        assert!(tracker.ambient_turns.is_empty());
    }

    #[test]
    fn tracker_clear_drops_user_turn_and_returns_ambient_states() {
        let mut tracker = TurnTracker {
            active_user_turn_id: Some("turn-user".into()),
            ..TurnTracker::default()
        };
        tracker.ambient_turns.insert(
            "turn-amb".into(),
            AmbientTurnState {
                buffer: String::new(),
                screenshot_path: Some(PathBuf::from("/tmp/x.jpg")),
                cleanup_screenshot_after_turn: true,
            },
        );

        let drained = tracker.clear();
        assert_eq!(drained.len(), 1);
        assert!(tracker.active_user_turn_id.is_none());
        assert!(tracker.ambient_turns.is_empty());
        assert!(!tracker.has_active_turn());
    }

    #[test]
    fn cleanup_screenshot_file_removes_file_only_when_flagged() {
        let dir = tempfile::tempdir().expect("tempdir");
        let keep = dir.path().join("keep.jpg");
        let drop = dir.path().join("drop.jpg");
        std::fs::write(&keep, b"x").expect("write keep");
        std::fs::write(&drop, b"x").expect("write drop");

        cleanup_screenshot_file(false, Some(keep.as_path()));
        cleanup_screenshot_file(true, Some(drop.as_path()));

        assert!(keep.exists());
        assert!(!drop.exists());

        // Missing path and missing file are both no-ops.
        cleanup_screenshot_file(true, None);
        cleanup_screenshot_file(true, Some(dir.path().join("never-existed.jpg").as_path()));
    }

    /// Regression test for "WebSocket protocol error: Connection reset without
    /// closing handshake" leaking to the live UI on every legitimate shutdown.
    ///
    /// Before the fix, the wire-event forwarding task kept running after
    /// `shutdown` killed the codex child, so the websocket-reset that the
    /// kill produced was mapped to a fresh `RuntimeEvent::Error` and pushed
    /// to `event_tx`. With the fix, `shutdown` aborts the forwarder first,
    /// so post-kill wire errors have nowhere to land.
    #[tokio::test]
    async fn aborting_wire_task_suppresses_reset_error_after_shutdown() {
        use tokio::net::TcpListener;
        use tokio_tungstenite::accept_async;

        // Spin up a throwaway WS server so JsonRpcClient::connect can succeed.
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let url = format!("ws://{}", listener.local_addr().expect("addr"));
        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let _ws = accept_async(stream).await.expect("ws");
            std::future::pending::<()>().await;
        });

        // Internal channel used by JsonRpcClient — we don't care about it here.
        let (jsonrpc_wire_tx, _jsonrpc_wire_rx) = mpsc::unbounded_channel();
        let client = crate::runtime::json_rpc::JsonRpcClient::connect(&url, jsonrpc_wire_tx)
            .await
            .expect("client connect");

        // Independent channel that the forwarder reads from. Lets us inject
        // synthetic wire events without going through the websocket reader.
        let (wire_tx, wire_rx) = mpsc::unbounded_channel::<WireEvent>();
        let (event_tx, mut event_rx) = mpsc::unbounded_channel::<RuntimeEvent>();
        let pending_approvals = Arc::new(Mutex::new(HashMap::new()));
        let tracker = Arc::new(Mutex::new(TurnTracker::default()));

        let wire_task =
            spawn_wire_event_forwarder(client, wire_rx, event_tx, pending_approvals, tracker);

        // Pre-abort: a wire error is forwarded to the user-facing channel.
        wire_tx
            .send(WireEvent::Error("simulated reset".into()))
            .expect("send pre-abort");
        let pre = tokio::time::timeout(tokio::time::Duration::from_secs(1), event_rx.recv())
            .await
            .expect("pre-abort event arrives")
            .expect("pre-abort event present");
        assert!(matches!(pre, RuntimeEvent::Error { ref message } if message == "simulated reset"));

        // Abort, then attempt to push the same error the websocket reader
        // emits when the codex child dies. After abort, that error must NOT
        // reach the user-facing channel — either the receiver is dropped (so
        // `send` returns SendError) or the event simply never arrives.
        wire_task.abort();
        let _ = wire_task.await;
        let _ = wire_tx.send(WireEvent::Error(
            "WebSocket protocol error: Connection reset without closing handshake".into(),
        ));
        // Acceptable post-abort outcomes: timeout (no event), or channel
        // closed (None). What must NOT happen: a freshly delivered event.
        let post =
            tokio::time::timeout(tokio::time::Duration::from_millis(200), event_rx.recv()).await;
        match post {
            Err(_) => {}   // timeout
            Ok(None) => {} // channel closed when forwarder dropped event_tx
            Ok(Some(event)) => panic!(
                "no runtime event should reach the UI after the forwarder is aborted, got {event:?}"
            ),
        }
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
    fn pet_thread_start_config_is_minimal_and_does_not_inherit_mcps() {
        let config = pet_thread_config_overrides();
        assert_eq!(config["model_reasoning_effort"], "medium");
        assert!(config.get("mcp_servers").is_none());
    }
}
