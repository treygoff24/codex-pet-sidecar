use crate::error::{AppError, AppResult};
use crate::hatching::session::{GeneratedRowKey, RowKey, RowState};
use std::path::PathBuf;
use uuid::Uuid;

/// Generate all eight required row strips after prototype acceptance.
///
/// This is a stub implementation pending actual Codex client integration.
/// When the Codex JSON-RPC client is available, this should:
/// 1. Generate rows sequentially (not parallel) for:
///    - idle, running-right, waving, jumping, failed, waiting, running, review
/// 2. For each row:
///    a. Draft row prompt from brief + row template
///    b. Fire $imagegen with row prompt + canonical_identity_reference as grounding
///    c. Watch for ig_*.png to land in runtime_home/generated_images/
///    d. Copy to workspace, hash, save to session.rows
///    e. On failure: retry up to 3 times with exponential backoff
///    f. If all retries fail, mark row as failed and continue
/// 3. Update session phase to Review when all rows complete
/// 4. Update GenerationProgress with completed count
#[allow(dead_code)]
pub async fn generate_all_rows(
    _session_id: Uuid,
    _runtime_home: PathBuf,
) -> AppResult<()> {
    // TODO: Implement actual row generation when Codex client is available
    // For now, return an error indicating this needs Codex integration
    Err(AppError::NotImplemented {
        command: "generate_all_rows (requires Codex client integration)".to_string(),
    })
}

/// Generate a single row strip.
///
/// This is a stub implementation.
/// When implemented, this should:
/// 1. Draft row prompt from brief + row template
/// 2. Fire $imagegen with row prompt + canonical_identity_reference as grounding
/// 3. Watch for ig_*.png to land
/// 4. Copy to workspace, hash, save
/// 5. Retry up to 3 times on failure
#[allow(dead_code)]
pub async fn generate_single_row(
    _session_id: Uuid,
    _row_key: GeneratedRowKey,
    _runtime_home: PathBuf,
) -> AppResult<RowState> {
    // TODO: Implement single row generation logic
    Err(AppError::NotImplemented {
        command: "generate_single_row (requires Codex client integration)".to_string(),
    })
}

/// Regenerate a specific row (called from atlas review).
///
/// This is a stub implementation.
/// When implemented, this should:
/// 1. Validate row_key is a generated row (not derived running-left)
/// 2. If running-left, route to generate_single_row for running-right
/// 3. Fire imagegen with updated prompt
/// 4. Update session.rows with new result
/// 5. If running-left was regenerated, re-derive it from new running-right
pub async fn regenerate_row(
    _session_id: Uuid,
    _row_key: RowKey,
    _runtime_home: PathBuf,
) -> AppResult<RowState> {
    // TODO: Implement row regeneration logic
    Err(AppError::NotImplemented {
        command: "regenerate_row (requires Codex client integration)".to_string(),
    })
}

/// Draft a row prompt from the brief and row template.
///
/// This is a stub implementation.
/// When implemented, this should:
/// 1. Use the brief + row-specific template
/// 2. Generate a prompt for the specific animation row
/// 3. Return the drafted prompt
#[allow(dead_code)]
pub async fn draft_row_prompt(
    _session_id: Uuid,
    _row_key: GeneratedRowKey,
    _runtime_home: PathBuf,
) -> AppResult<String> {
    // TODO: Implement row prompt drafting logic
    Err(AppError::NotImplemented {
        command: "draft_row_prompt (requires Codex client integration)".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_all_rows_returns_not_implemented() {
        let runtime_home = PathBuf::from("/tmp/runtime");
        let session_id = Uuid::new_v4();

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(generate_all_rows(session_id, runtime_home));

        assert!(matches!(result, Err(AppError::NotImplemented { .. })));
    }

    #[test]
    fn generate_single_row_returns_not_implemented() {
        let runtime_home = PathBuf::from("/tmp/runtime");
        let session_id = Uuid::new_v4();
        let row_key = GeneratedRowKey::Idle;

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(generate_single_row(session_id, row_key, runtime_home));

        assert!(matches!(result, Err(AppError::NotImplemented { .. })));
    }

    #[test]
    fn regenerate_row_returns_not_implemented() {
        let runtime_home = PathBuf::from("/tmp/runtime");
        let session_id = Uuid::new_v4();
        let row_key = RowKey::Idle;

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(regenerate_row(session_id, row_key, runtime_home));

        assert!(matches!(result, Err(AppError::NotImplemented { .. })));
    }

    #[test]
    fn draft_row_prompt_returns_not_implemented() {
        let runtime_home = PathBuf::from("/tmp/runtime");
        let session_id = Uuid::new_v4();
        let row_key = GeneratedRowKey::Idle;

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(draft_row_prompt(session_id, row_key, runtime_home));

        assert!(matches!(result, Err(AppError::NotImplemented { .. })));
    }
}