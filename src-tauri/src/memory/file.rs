use crate::error::{read_to_string, AppResult};
use std::path::Path;

pub fn ensure_memory_file(path: &Path, pet_name: &str) -> AppResult<String> {
    if path.exists() {
        return read_to_string(path);
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content = format!("# Memory for {pet_name}\n\n## About the user\n- \n\n## Project context\n- \n\n## Things to remember\n- \n");
    std::fs::write(path, &content)?;
    Ok(content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn creates_template_and_preserves_hand_edits() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("memory.md");
        let created = ensure_memory_file(&path, "Olive").expect("create");
        assert!(created.contains("# Memory for Olive"));
        std::fs::write(&path, "hand edited").expect("edit");
        assert_eq!(
            ensure_memory_file(&path, "Olive").expect("read"),
            "hand edited"
        );
    }
}
