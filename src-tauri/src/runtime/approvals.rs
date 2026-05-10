use crate::runtime::events::{ApprovalAction, ApprovalRequest, ApprovalRisk};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalKind {
    CommandExecution,
    FileChange,
    Permissions,
    Unknown,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileChangeApprovalParams {
    grant_root: Option<String>,
}

pub fn approval_request(id: u64, method: &str, params: &Value) -> ApprovalRequest {
    let tool_name = match method {
        "item/commandExecution/requestApproval" => "shell command",
        "item/fileChange/requestApproval" => "file change",
        "item/permissions/requestApproval" => "permissions",
        other => other,
    };
    ApprovalRequest {
        request_id: id.to_string(),
        tool_name: tool_name.to_string(),
        detail: approval_detail(method, params),
        risk: approval_risk(method),
        allow_for_session: matches!(
            kind_for_method(method),
            ApprovalKind::CommandExecution | ApprovalKind::FileChange
        ),
    }
}

pub fn kind_for_method(method: &str) -> ApprovalKind {
    match method {
        "item/commandExecution/requestApproval" => ApprovalKind::CommandExecution,
        "item/fileChange/requestApproval" => ApprovalKind::FileChange,
        "item/permissions/requestApproval" => ApprovalKind::Permissions,
        _ => ApprovalKind::Unknown,
    }
}

pub fn response_for_action(kind: ApprovalKind, action: ApprovalAction) -> Value {
    match kind {
        ApprovalKind::CommandExecution => json!({"decision": command_decision(action)}),
        ApprovalKind::FileChange => json!({"decision": file_decision(action)}),
        ApprovalKind::Permissions => match action {
            ApprovalAction::Deny => {
                json!({"permissions":{"network":null,"fileSystem":null},"scope":"turn"})
            }
            ApprovalAction::AllowOnce => {
                json!({"permissions":{"network":{"enabled":true},"fileSystem":{"readWriteRoots":[]}},"scope":"turn"})
            }
            ApprovalAction::AllowSession => {
                json!({"permissions":{"network":{"enabled":true},"fileSystem":{"readWriteRoots":[]}},"scope":"session"})
            }
        },
        ApprovalKind::Unknown => json!({"decision":"decline"}),
    }
}

fn command_decision(action: ApprovalAction) -> &'static str {
    match action {
        ApprovalAction::AllowOnce => "accept",
        ApprovalAction::AllowSession => "acceptForSession",
        ApprovalAction::Deny => "decline",
    }
}

fn file_decision(action: ApprovalAction) -> &'static str {
    command_decision(action)
}

fn approval_detail(method: &str, params: &Value) -> String {
    if kind_for_method(method) == ApprovalKind::FileChange {
        if let Ok(file_params) = serde_json::from_value::<FileChangeApprovalParams>(params.clone())
        {
            if let Some(grant_root) = file_params.grant_root.filter(|value| !value.is_empty()) {
                return format!("Requesting write access under {grant_root}");
            }
        }
    }

    for key in ["command", "cmd", "reason", "summary", "description"] {
        if let Some(value) = params.get(key).and_then(Value::as_str) {
            return value.to_string();
        }
    }
    if let Some(value) = params.get("changes") {
        return value.to_string();
    }
    params.to_string()
}

fn approval_risk(method: &str) -> ApprovalRisk {
    match method {
        "item/commandExecution/requestApproval" => ApprovalRisk::Execute,
        "item/fileChange/requestApproval" => ApprovalRisk::Write,
        _ => ApprovalRisk::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_approval_responses() {
        assert_eq!(
            response_for_action(ApprovalKind::CommandExecution, ApprovalAction::AllowSession)
                ["decision"],
            "acceptForSession"
        );
        assert_eq!(kind_for_method("applyPatchApproval"), ApprovalKind::Unknown);
    }
}
