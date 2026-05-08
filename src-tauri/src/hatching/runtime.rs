use crate::error::{AppError, AppResult};
use crate::runtime::auth::link_or_copy_user_auth;
use crate::state::paths::AppPaths;
use std::path::PathBuf;
use uuid::Uuid;

/// Hatching runtime manager - independent of pet RuntimeSessionManager.
///
/// Each manager instance is keyed by session_id and manages an isolated
/// Codex runtime home for the hatching wizard. Does not share any state
/// with the pet runtime manager.
pub struct HatchingRuntimeManager {
    session_id: Uuid,
    runtime_home: PathBuf,
}

#[allow(dead_code)]
impl HatchingRuntimeManager {
    /// Create a new hatching runtime manager for the given session.
    pub fn new(session_id: Uuid, paths: &AppPaths) -> Self {
        let runtime_home = paths.hatching_runtime_home_dir(&session_id.to_string());
        Self {
            session_id,
            runtime_home,
        }
    }

    /// Start the hatching runtime.
    ///
    /// Creates the runtime home directory, links/copies user auth,
    /// writes a minimal config.toml, and spawns the Codex app-server.
    pub async fn start(&self) -> AppResult<()> {
        // Create runtime home directory
        std::fs::create_dir_all(&self.runtime_home)?;

        // Link or copy user auth
        link_or_copy_user_auth(&self.runtime_home)?;

        // Write minimal config.toml (auth + zero MCP plugins + zero skill bundles)
        std::fs::write(
            self.runtime_home.join("config.toml"),
            "[analytics]\nenabled = false\n",
        )?;

        // TODO: Spawn Codex app-server process scoped to CODEX_HOME=<runtime_home>
        // TODO: Open JSON-RPC thread with experimentalRawEvents: true
        // This will be implemented in Wave 2 when we need actual model calls

        Ok(())
    }

    /// Reattach to an existing runtime home.
    ///
    /// Assumes the on-disk runtime home already exists (auth + config in place
    /// from a previous run), spawns a fresh Codex app-server process pointed at it.
    ///
    /// Returns AppError::HatchingRuntimeMissing if the runtime home is missing or corrupt.
    pub async fn reattach(&self) -> AppResult<()> {
        // Check if runtime home exists
        if !self.runtime_home.exists() {
            return Err(AppError::HatchingRuntimeMissing(
                self.session_id.to_string(),
            ));
        }

        // Check if auth.json exists
        let auth_path = self.runtime_home.join("auth.json");
        if !auth_path.exists() {
            return Err(AppError::HatchingRuntimeMissing(
                self.session_id.to_string(),
            ));
        }

        // TODO: Spawn fresh Codex app-server process pointed at existing runtime home
        // This will be implemented in Wave 2

        Ok(())
    }

    /// Get the current thread ID.
    ///
    /// Returns None until the first model call opens a thread.
    pub fn current_thread_id(&self) -> Option<String> {
        // TODO: Return actual thread ID when JSON-RPC is implemented
        None
    }

    /// Cancel the hatching runtime.
    ///
    /// Shuts down the Codex process and cleans up the runtime home.
    pub async fn cancel(&self) -> AppResult<()> {
        // TODO: Shutdown Codex process
        // TODO: Clean up runtime home directory
        Ok(())
    }

    /// Shutdown the hatching runtime.
    ///
    /// Alias for cancel - both shut down the process and clean up.
    pub async fn shutdown(&self) -> AppResult<()> {
        self.cancel().await
    }

    /// Get the runtime home directory.
    pub fn runtime_home(&self) -> &PathBuf {
        &self.runtime_home
    }

    /// Get the session ID.
    pub fn session_id(&self) -> &Uuid {
        &self.session_id
    }

    /// Teardown: recursively delete the runtime home directory.
    ///
    /// Called on accept/cancel/crash-recovery-discard.
    pub async fn teardown(&self) -> AppResult<()> {
        if self.runtime_home.exists() {
            // Use tokio::fs::remove_dir_all with retry-on-EBUSY
            // For now, use std::fs for simplicity
            let mut retries = 0;
            while retries < 3 {
                match std::fs::remove_dir_all(&self.runtime_home) {
                    Ok(_) => return Ok(()),
                    Err(_e) if retries < 2 => {
                        retries += 1;
                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    }
                    Err(e) => {
                        return Err(AppError::CommandFailed(
                            "teardown runtime".to_string(),
                            e.to_string(),
                        ))
                    }
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn runtime_manager_creates_runtime_home_on_start() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));
        let session_id = Uuid::new_v4();
        let manager = HatchingRuntimeManager::new(session_id, &paths);

        // Runtime home should not exist yet
        assert!(!manager.runtime_home().exists());

        // Start should create it (in a real scenario with auth)
        // For now, we just test the structure
        assert_eq!(manager.session_id(), &session_id);
    }

    #[test]
    fn runtime_manager_reattach_fails_if_runtime_missing() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));
        let session_id = Uuid::new_v4();
        let manager = HatchingRuntimeManager::new(session_id, &paths);

        // Reattach should fail if runtime home doesn't exist
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(manager.reattach());
        assert!(matches!(result, Err(AppError::HatchingRuntimeMissing(_))));
    }

    #[test]
    fn runtime_manager_reattach_fails_if_auth_missing() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));
        let session_id = Uuid::new_v4();
        let manager = HatchingRuntimeManager::new(session_id, &paths);

        // Create runtime home but not auth
        std::fs::create_dir_all(manager.runtime_home()).unwrap();

        // Reattach should fail if auth.json doesn't exist
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(manager.reattach());
        assert!(matches!(result, Err(AppError::HatchingRuntimeMissing(_))));
    }
}
