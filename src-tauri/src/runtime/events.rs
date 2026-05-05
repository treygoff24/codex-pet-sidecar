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
#[serde(rename_all = "snake_case", tag = "type")]
pub enum RuntimeEvent {
    TextDelta { text: String },
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
