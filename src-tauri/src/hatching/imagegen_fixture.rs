// Imagegen fixture loader
// Wave 0: stub implementation
// TODO: After Task 0.2 empirical pin, implement:
// - Fixture parsing from protocol types
// - resolve_image_path function for Branch A (path-first) and Branch B (watcher-first)
// - Tests for both branches

use std::path::PathBuf;

/// Resolve the image path from an image_generation_call notification.
///
/// Branch A (path-first): If result carries a path, return it directly.
/// Branch B (watcher-first): If result is empty/opaque, return None (watcher fallback).
///
/// This function will be implemented after Wave 0 Task 0.2 captures the empirical fixture.
#[allow(dead_code)]
pub fn resolve_image_path(
    _notification: &serde_json::Value,
    _runtime_home: &PathBuf,
) -> Option<PathBuf> {
    // TODO: Implement after empirical pin captures the actual protocol shape
    None
}

#[cfg(test)]
mod tests {
    #[allow(unused_imports)]
    use super::*;

    #[test]
    fn test_fixture_parsing() {
        // TODO: After Task 0.2, parse raw-notification.json and assert it's valid protocol type
    }

    #[test]
    fn test_resolve_path_branch_a() {
        // TODO: After Task 0.2, test path-first resolution if Branch A is observed
    }

    #[test]
    fn test_resolve_path_branch_b() {
        // TODO: After Task 0.2, test watcher-first fallback if Branch B is observed
    }
}
