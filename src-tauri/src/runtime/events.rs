use crate::observers::ObservationDigest;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSession {
    pub thread_id: String,
    pub websocket_url: String,
    pub effective_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    tag = "type"
)]
pub enum RuntimeEvent {
    TextDelta { text: String },
    AmbientMessage { text: String },
    AmbientStatus { message: String },
    TurnCompleted { final_text: Option<String> },
    ApprovalRequest { request: ApprovalRequest },
    Observation { digest: ObservationDigest },
    Error { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRequest {
    pub request_id: String,
    pub tool_name: String,
    pub detail: String,
    pub risk: ApprovalRisk,
    pub allow_for_session: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalRisk {
    Read,
    Write,
    Execute,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalAction {
    AllowOnce,
    AllowSession,
    Deny,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::observers::ObservationDigest;
    use serde_json::json;

    #[test]
    fn runtime_events_serialize_to_frontend_wire_contract() {
        assert_eq!(
            serde_json::to_value(RuntimeEvent::TextDelta { text: "hi".into() }).unwrap(),
            json!({"type": "text_delta", "text": "hi"})
        );
        assert_eq!(
            serde_json::to_value(RuntimeEvent::TurnCompleted {
                final_text: Some("done".into())
            })
            .unwrap(),
            json!({"type": "turn_completed", "finalText": "done"})
        );
        assert_eq!(
            serde_json::to_value(RuntimeEvent::AmbientStatus {
                message: "text-only".into()
            })
            .unwrap(),
            json!({"type": "ambient_status", "message": "text-only"})
        );
        assert_eq!(
            serde_json::to_value(RuntimeEvent::ApprovalRequest {
                request: ApprovalRequest {
                    request_id: "42".into(),
                    tool_name: "exec".into(),
                    detail: "run command".into(),
                    risk: ApprovalRisk::Execute,
                    allow_for_session: true,
                }
            })
            .unwrap(),
            json!({
                "type": "approval_request",
                "request": {
                    "requestId": "42",
                    "toolName": "exec",
                    "detail": "run command",
                    "risk": "execute",
                    "allowForSession": true
                }
            })
        );
        assert_eq!(
            serde_json::to_value(RuntimeEvent::Observation {
                digest: ObservationDigest::Workspace {
                    cwd: "/repo".into(),
                    repo_name: Some("codex-pet-sidecar".into()),
                    branch: Some("main".into()),
                    dirty_summary: Some("1 modified".into()),
                    observed_at: "2026-05-07T00:00:00Z".into(),
                    degraded: None,
                }
            })
            .unwrap(),
            json!({
                "type": "observation",
                "digest": {
                    "type": "workspace",
                    "cwd": "/repo",
                    "repoName": "codex-pet-sidecar",
                    "branch": "main",
                    "dirtySummary": "1 modified",
                    "observedAt": "2026-05-07T00:00:00Z",
                    "degraded": null
                }
            })
        );
    }

    #[test]
    fn runtime_session_uses_camel_case_for_tauri_invoke_results() {
        let session = RuntimeSession {
            thread_id: "thread-1".into(),
            websocket_url: "ws://localhost".into(),
            effective_model: "gpt-test".into(),
        };
        assert_eq!(
            serde_json::to_value(session).unwrap(),
            json!({
                "threadId": "thread-1",
                "websocketUrl": "ws://localhost",
                "effectiveModel": "gpt-test"
            })
        );
    }
}
