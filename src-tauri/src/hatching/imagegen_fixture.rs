use std::path::{Path, PathBuf};

/// Resolve the image path from an image_generation_call notification.
///
/// Branch A (path-first): If result carries a path, return it directly.
/// Branch B (watcher-first): If result is empty/opaque, return None (watcher fallback).
///
#[allow(dead_code)]
pub fn resolve_image_path(
    notification: &serde_json::Value,
    runtime_home: &Path,
) -> Option<PathBuf> {
    let result = notification
        .get("item")
        .and_then(|item| item.get("result"))
        .and_then(serde_json::Value::as_str)?
        .trim();
    if result.is_empty() {
        return None;
    }

    let candidate = if let Some(stripped) = result.strip_prefix("$RUNTIME_HOME/") {
        runtime_home.join(stripped)
    } else {
        PathBuf::from(result)
    };

    if candidate
        .file_name()
        .and_then(|name| name.to_str())
        .is_none_or(|name| !(name.starts_with("ig_") && name.ends_with(".png")))
    {
        return None;
    }

    let generated_images = runtime_home.join("generated_images");
    if candidate.starts_with(&generated_images) {
        Some(candidate)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn empirical_fixture_is_branch_b_watcher_first() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../fixtures/hatching-imagegen/raw-notification.json"
        ))
        .expect("fixture parses");

        assert_eq!(fixture["item"]["type"], "image_generation_call");
        assert!(fixture["item"]["result"]
            .as_str()
            .expect("image_generation_call.result is a string")
            .starts_with("iVBOR"));

        let runtime_home = PathBuf::from("/tmp/hatching-runtime");
        assert_eq!(resolve_image_path(&fixture, &runtime_home), None);
    }

    #[test]
    fn resolves_path_first_branch_a_absolute_path() {
        let runtime_home = PathBuf::from("/tmp/hatching-runtime");
        let path = runtime_home.join("generated_images/thread/ig_abc.png");
        let notification = json!({
            "item": {
                "type": "image_generation_call",
                "result": path.to_string_lossy()
            }
        });

        assert_eq!(resolve_image_path(&notification, &runtime_home), Some(path));
    }

    #[test]
    fn resolves_path_first_branch_a_redacted_runtime_home() {
        let runtime_home = PathBuf::from("/tmp/hatching-runtime");
        let notification = json!({
            "item": {
                "type": "image_generation_call",
                "result": "$RUNTIME_HOME/generated_images/thread/ig_abc.png"
            }
        });

        assert_eq!(
            resolve_image_path(&notification, &runtime_home),
            Some(runtime_home.join("generated_images/thread/ig_abc.png"))
        );
    }

    #[test]
    fn rejects_non_generated_images_paths() {
        let runtime_home = PathBuf::from("/tmp/hatching-runtime");
        let notification = json!({
            "item": {
                "type": "image_generation_call",
                "result": "/tmp/hatching-runtime/workspace/ig_abc.png"
            }
        });

        assert_eq!(resolve_image_path(&notification, &runtime_home), None);
    }
}
