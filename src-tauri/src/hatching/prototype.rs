use crate::error::{AppError, AppResult};
use crate::hatching::session::PrototypeIteration;
use std::path::PathBuf;
use uuid::Uuid;

/// Generate a prototype iteration.
///
/// This is a stub implementation pending actual Codex client integration.
/// When the Codex JSON-RPC client is available, this should:
/// - If feedback is provided:
///   1. Run a rewrite turn (text-only) with brief + original prompt + previous description + feedback
///   2. Parse JSON response: {revised_prompt, summary_of_changes}
///   3. Run imagegen turn with revised prompt + reference image (if any)
/// - If feedback is empty:
///   1. Skip rewrite turn, re-fire imagegen with original prompt
/// 2. Watch for ig_*.png to land in runtime_home/generated_images/
/// 3. Copy to workspace, hash, and create ImageArtifact
/// 4. Create PrototypeIteration and append to session.prototype.iterations
/// 5. Update session.prototype.current to new index
/// 6. Persist session
pub async fn generate_prototype(
    _session_id: Uuid,
    _feedback: Option<String>,
    _runtime_home: PathBuf,
) -> AppResult<PrototypeIteration> {
    // TODO: Implement actual Codex integration when JSON-RPC client is available
    // For now, return an error indicating this needs Codex integration
    Err(AppError::NotImplemented {
        command: "generate_prototype (requires Codex client integration)".to_string(),
    })
}

/// Revert to a previous prototype iteration.
///
/// This is a stub implementation.
/// When implemented, this should:
/// 1. Load session
/// 2. Validate iteration_n exists in prototype.iterations
/// 3. Update prototype.current to iteration_n - 1
/// 4. Persist session
pub async fn revert_to_iteration(
    _session_id: Uuid,
    _iteration_n: u32,
    _runtime_home: PathBuf,
) -> AppResult<()> {
    // TODO: Implement iteration revert logic
    Err(AppError::NotImplemented {
        command: "revert_to_iteration".to_string(),
    })
}

/// Accept the current prototype and transition to generation phase.
///
/// This is a stub implementation.
/// When implemented, this should:
/// 1. Load session
/// 2. Validate prototype exists and has at least one iteration
/// 3. Copy current prototype image to workspace/decoded/base.png as canonical_identity_reference
/// 4. Update phase to Generating with initial progress
/// 5. Persist session
/// 6. Trigger background row generation (separate task)
pub async fn accept_prototype(_session_id: Uuid, _runtime_home: PathBuf) -> AppResult<()> {
    // TODO: Implement prototype acceptance and generation phase transition
    Err(AppError::NotImplemented {
        command: "accept_prototype (requires Codex client integration)".to_string(),
    })
}

/// Draft the initial prototype prompt from brief + archetype + reference description.
///
/// This is a stub implementation.
/// When implemented, this should:
/// 1. Run a Codex text turn with brief, archetype preset (if any), and reference description
/// 2. Ask for a single imagegen prompt for the base identity prototype
/// 3. Return the drafted prompt
#[allow(dead_code)]
pub async fn draft_prototype_prompt(
    _session_id: Uuid,
    _runtime_home: PathBuf,
) -> AppResult<String> {
    // TODO: Implement prompt drafting logic
    Err(AppError::NotImplemented {
        command: "draft_prototype_prompt (requires Codex client integration)".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_prototype_returns_not_implemented() {
        let runtime_home = PathBuf::from("/tmp/runtime");
        let session_id = Uuid::new_v4();
        let feedback = Some("less cute".to_string());

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(generate_prototype(session_id, feedback, runtime_home));

        assert!(matches!(result, Err(AppError::NotImplemented { .. })));
    }

    #[test]
    fn revert_to_iteration_returns_not_implemented() {
        let runtime_home = PathBuf::from("/tmp/runtime");
        let session_id = Uuid::new_v4();
        let iteration_n = 1;

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(revert_to_iteration(session_id, iteration_n, runtime_home));

        assert!(matches!(result, Err(AppError::NotImplemented { .. })));
    }

    #[test]
    fn accept_prototype_returns_not_implemented() {
        let runtime_home = PathBuf::from("/tmp/runtime");
        let session_id = Uuid::new_v4();

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(accept_prototype(session_id, runtime_home));

        assert!(matches!(result, Err(AppError::NotImplemented { .. })));
    }

    #[test]
    fn draft_prototype_prompt_returns_not_implemented() {
        let runtime_home = PathBuf::from("/tmp/runtime");
        let session_id = Uuid::new_v4();

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(draft_prototype_prompt(session_id, runtime_home));

        assert!(matches!(result, Err(AppError::NotImplemented { .. })));
    }
}
