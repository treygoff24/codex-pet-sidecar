use crate::error::{AppError, AppResult};
use std::path::Path;

/// Link or copy the user's Codex auth.json to a target runtime home directory.
///
/// On Unix systems, attempts to create a symlink first (for efficiency and
/// automatic auth sync), falling back to a copy if symlinks are not supported.
/// On non-Unix systems, always copies.
pub(crate) fn link_or_copy_user_auth(runtime_codex_home: &Path) -> AppResult<()> {
    let Some(home) = dirs::home_dir() else {
        return Err(AppError::CodexAuthNotFound);
    };
    let source = home.join(".codex").join("auth.json");
    if !source.exists() {
        return Err(AppError::CodexAuthNotFound);
    }
    let target = runtime_codex_home.join("auth.json");
    if target.exists() {
        std::fs::remove_file(&target)?;
    }
    #[cfg(unix)]
    {
        if let Err(error) = std::os::unix::fs::symlink(&source, &target) {
            // Symlink can fail on filesystems that don't support them
            // (some sandboxed homes, network mounts). The copy fallback
            // is correct for those, but log the original error so a real
            // permission/IO problem doesn't hide behind it.
            eprintln!(
                "runtime: symlink {} → {} failed ({error}); falling back to copy",
                source.display(),
                target.display(),
            );
            std::fs::copy(&source, &target)?;
        }
    }
    #[cfg(not(unix))]
    {
        std::fs::copy(&source, &target)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn link_or_copy_user_auth_requires_existing_auth_file() {
        // Skip this test if the user actually has Codex auth installed
        // The function will succeed in that case
        let Some(home) = dirs::home_dir() else {
            // If home dir can't be found, test should pass
            return;
        };
        let auth_path = home.join(".codex").join("auth.json");
        if auth_path.exists() {
            // User has Codex auth, skip this test
            return;
        }

        let root = tempdir().expect("tempdir");
        let runtime_home = root.path().join("runtime");

        // No auth file exists in user home
        let result = link_or_copy_user_auth(&runtime_home);
        assert!(matches!(result, Err(AppError::CodexAuthNotFound)));
    }
}
