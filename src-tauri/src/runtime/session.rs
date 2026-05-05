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
}

#[derive(Default)]
pub struct RuntimeSessionManager {
    inner: Mutex<Option<RuntimeConnection>>,
}

struct RuntimeConnection {
    process: AppServerProcess,
    client: JsonRpcClient,
    session: RuntimeSession,
    active_turn_id: Option<String>,
    pending_approvals: Arc<Mutex<HashMap<String, ApprovalKind>>>,
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
        tokio::spawn(async move {
            while let Some(event) = wire_rx.recv().await {
                if let WireEvent::ServerRequest { id, ref method, .. } = event {
                    pending_for_task
                        .lock()
                        .await
                        .insert(id.to_string(), kind_for_method(method));
                }
                if let Some(runtime_event) = map_wire_event(event, &client_for_events).await {
                    let _ = event_tx_for_task.send(runtime_event);
                }
            }
        });

        *self.inner.lock().await = Some(RuntimeConnection {
            process,
            client,
            session: session.clone(),
            active_turn_id: None,
            pending_approvals,
        });
        Ok(session)
    }

    pub async fn send_user_turn(&self, input: PetUserInput) -> AppResult<()> {
        let mut guard = self.inner.lock().await;
        let connection = guard.as_mut().ok_or(AppError::RuntimeNotStarted)?;
        let result = connection
            .client
            .call(
                "turn/start",
                json!({
                    "threadId": connection.session.thread_id,
                    "input": [{"type":"text","text":input.text,"text_elements":[]}]
                }),
            )
            .await?;
        connection.active_turn_id = result
            .pointer("/turn/id")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        Ok(())
    }

    pub async fn inject_observation_turn(&self, text: String) -> AppResult<()> {
        self.send_user_turn(PetUserInput { text }).await
    }

    pub async fn interrupt_turn(&self) -> AppResult<()> {
        let guard = self.inner.lock().await;
        let connection = guard.as_ref().ok_or(AppError::RuntimeNotStarted)?;
        let turn_id = connection
            .active_turn_id
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

async fn map_wire_event(event: WireEvent, client: &JsonRpcClient) -> Option<RuntimeEvent> {
    match event {
        WireEvent::Notification { method, params } if method == "item/agentMessage/delta" => {
            Some(RuntimeEvent::TextDelta {
                text: params
                    .get("delta")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
            })
        }
        WireEvent::Notification { method, .. } if method == "turn/completed" => {
            Some(RuntimeEvent::TurnCompleted { final_text: None })
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
    fn pet_thread_config_uses_medium_reasoning_and_disables_selected_mcps() {
        let config = pet_thread_config_overrides();
        assert_eq!(config["model_reasoning_effort"], "medium");
        for server in DISABLED_PET_MCP_SERVERS {
            assert_eq!(config["mcp_servers"][server]["enabled"], false);
        }
    }
}
