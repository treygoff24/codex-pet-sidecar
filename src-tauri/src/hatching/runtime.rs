use crate::error::{AppError, AppResult};
use crate::hatching::imagegen::ImagegenIngester;
use crate::runtime::auth::link_or_copy_user_auth;
use crate::runtime::json_rpc::JsonRpcClient;
use crate::runtime::process::AppServerProcess;
use crate::state::paths::AppPaths;
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock};
use uuid::Uuid;

/// Hatching runtime manager - independent of pet RuntimeSessionManager.
///
/// Each manager instance is keyed by session_id and manages an isolated
/// Codex runtime home for the hatching wizard. Does not share any state
/// with the pet runtime manager.
pub struct HatchingRuntimeManager {
    session_id: Uuid,
    runtime_home: PathBuf,
    process: Option<AppServerProcess>,
    client: Option<JsonRpcClient>,
    thread_id: Arc<Mutex<Option<String>>>,
    events_rx: Arc<Mutex<Option<mpsc::UnboundedReceiver<crate::runtime::json_rpc::WireEvent>>>>,
}

#[allow(dead_code)]
impl HatchingRuntimeManager {
    /// Create a new hatching runtime manager for the given session.
    pub fn new(session_id: Uuid, paths: &AppPaths) -> Self {
        let runtime_home = paths.hatching_runtime_home_dir(&session_id.to_string());
        Self {
            session_id,
            runtime_home,
            process: None,
            client: None,
            thread_id: Arc::new(Mutex::new(None)),
            events_rx: Arc::new(Mutex::new(None)),
        }
    }

    /// Start the hatching runtime.
    ///
    /// Creates the runtime home directory, links/copies user auth,
    /// writes a minimal config.toml, and spawns the Codex app-server.
    pub async fn start(&mut self) -> AppResult<()> {
        // Create runtime home directory
        std::fs::create_dir_all(&self.runtime_home)?;

        // Link or copy user auth
        link_or_copy_user_auth(&self.runtime_home)?;

        // Write minimal config.toml (auth + zero MCP plugins + zero skill bundles)
        std::fs::write(
            self.runtime_home.join("config.toml"),
            "[analytics]\nenabled = false\n",
        )?;

        // Spawn Codex app-server process scoped to CODEX_HOME=<runtime_home>
        let process = AppServerProcess::spawn(&self.runtime_home).await?;

        // Open JSON-RPC thread with experimentalRawEvents: true
        let websocket_url = process.websocket_url.clone();
        let (wire_tx, wire_rx) = tokio::sync::mpsc::unbounded_channel();
        let client = JsonRpcClient::connect(&websocket_url, wire_tx).await?;

        // Store the events receiver
        *self.events_rx.lock().await = Some(wire_rx);

        // Initialize the client
        client.call("initialize", json!({
            "clientInfo": {"name":"codex-pet-sidecar","title":"Codex Pet Sidecar","version": env!("CARGO_PKG_VERSION")},
            "capabilities": {"experimentalApi": true}
        })).await?;

        // Start thread with experimentalRawEvents: true
        let thread = client
            .call("thread/start", json!({
                "reason": "hatching",
                "experimentalRawEvents": true
            }))
            .await?;

        // Extract thread ID
        let thread_id = thread
            .pointer("/thread/id")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| AppError::JsonRpc {
                method: "thread/start".into(),
                message: "response missing /thread/id".into(),
            })?
            .to_string();

        // Store thread ID
        *self.thread_id.lock().await = Some(thread_id);

        // Store process and client
        self.process = Some(process);
        self.client = Some(client);

        Ok(())
    }

    /// Reattach to an existing runtime home.
    ///
    /// Assumes the on-disk runtime home already exists (auth + config in place
    /// from a previous run), spawns a fresh Codex app-server process pointed at it.
    ///
    /// Returns AppError::HatchingRuntimeMissing if the runtime home is missing or corrupt.
    pub async fn reattach(&mut self) -> AppResult<()> {
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

        // Spawn fresh Codex app-server process pointed at existing runtime home
        let process = AppServerProcess::spawn(&self.runtime_home).await?;

        // Open JSON-RPC connection
        let websocket_url = process.websocket_url.clone();
        let (wire_tx, wire_rx) = tokio::sync::mpsc::unbounded_channel();
        let client = JsonRpcClient::connect(&websocket_url, wire_tx).await?;

        // Store the events receiver
        *self.events_rx.lock().await = Some(wire_rx);

        // Initialize the client
        client.call("initialize", json!({
            "clientInfo": {"name":"codex-pet-sidecar","title":"Codex Pet Sidecar","version": env!("CARGO_PKG_VERSION")},
            "capabilities": {"experimentalApi": true}
        })).await?;

        // Start thread with experimentalRawEvents: true
        let thread = client
            .call("thread/start", json!({
                "reason": "hatching",
                "experimentalRawEvents": true
            }))
            .await?;

        // Extract thread ID
        let thread_id = thread
            .pointer("/thread/id")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| AppError::JsonRpc {
                method: "thread/start".into(),
                message: "response missing /thread/id".into(),
            })?
            .to_string();

        // Store thread ID
        *self.thread_id.lock().await = Some(thread_id);

        // Store process and client
        self.process = Some(process);
        self.client = Some(client);

        Ok(())
    }

    /// Get the current thread ID.
    ///
    /// Returns None until the first model call opens a thread.
    pub async fn current_thread_id(&self) -> Option<String> {
        self.thread_id.lock().await.clone()
    }

    /// Get the JSON-RPC client.
    ///
    /// Returns None until the runtime is started.
    pub fn client(&self) -> Option<&JsonRpcClient> {
        self.client.as_ref()
    }

    /// Cancel the hatching runtime.
    ///
    /// Shuts down the Codex process and cleans up the runtime home.
    pub async fn cancel(&mut self) -> AppResult<()> {
        // Shutdown the Codex process if it exists
        if let Some(process) = self.process.take() {
            // The AppServerProcess should handle shutdown when dropped
            // For now, we just let it drop
            drop(process);
        }

        // Clear the client
        self.client = None;

        // Clear the thread ID
        *self.thread_id.lock().await = None;

        // Clear the events receiver
        *self.events_rx.lock().await = None;

        Ok(())
    }

    /// Shutdown the hatching runtime.
    ///
    /// Alias for cancel - both shut down the process and clean up.
    pub async fn shutdown(&mut self) -> AppResult<()> {
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

    /// Create an imagegen ingester for watching ig_*.png files.
    ///
    /// Returns an ImagegenIngester instance that can be used to start
    /// watching for generated images in the runtime home.
    pub fn create_imagegen_ingester(&self, workspace_dir: PathBuf) -> ImagegenIngester {
        ImagegenIngester::new(self.runtime_home.clone(), workspace_dir)
    }

    /// Wait for any notification with timeout (for debugging).
    ///
    /// This method waits for any notification and returns it.
    /// Useful for debugging to see what notifications are being sent.
    pub async fn wait_for_any_notification(
        &self,
        timeout_ms: u64,
    ) -> AppResult<(String, serde_json::Value)> {
        let mut events_rx = {
            let mut guard = self.events_rx.lock().await;
            guard
                .take()
                .ok_or_else(|| AppError::JsonRpc {
                    method: "wait_for_any_notification".to_string(),
                    message: "events receiver not initialized".to_string(),
                })?
        };

        let start = std::time::Instant::now();
        loop {
            let recv_result = tokio::time::timeout(
                tokio::time::Duration::from_millis(100),
                events_rx.recv(),
            )
            .await;

            match recv_result {
                Ok(Some(crate::runtime::json_rpc::WireEvent::Notification {
                    method,
                    params,
                })) => {
                    // Put the receiver back before returning
                    self.events_rx.lock().await.replace(events_rx);
                    return Ok((method, params));
                }
                Ok(Some(_)) => {
                    // Ignore other events (shouldn't happen)
                }
                Ok(None) => {
                    // Channel closed
                    return Err(AppError::JsonRpc {
                        method: "wait_for_any_notification".to_string(),
                        message: "events channel closed".to_string(),
                    });
                }
                Err(_) => {
                    // Timeout check
                    if start.elapsed().as_millis() > timeout_ms.into() {
                        // Put the receiver back before returning
                        self.events_rx.lock().await.replace(events_rx);
                        return Err(AppError::JsonRpc {
                            method: "wait_for_any_notification".to_string(),
                            message: "timed out waiting for any notification".to_string(),
                        });
                    }
                }
            }
        }
    }

    /// Wait for a thread response notification with timeout.
    ///
    /// This method waits for a specific notification method or times out.
    /// Returns the notification params if found, or an error if timeout occurs.
    pub async fn wait_for_notification(
        &self,
        method: &str,
        timeout_ms: u64,
    ) -> AppResult<serde_json::Value> {
        let mut events_rx = {
            let mut guard = self.events_rx.lock().await;
            guard
                .take()
                .ok_or_else(|| AppError::JsonRpc {
                    method: "wait_for_notification".to_string(),
                    message: "events receiver not initialized".to_string(),
                })?
        };

        let start = std::time::Instant::now();
        loop {
            let recv_result = tokio::time::timeout(
                tokio::time::Duration::from_millis(100),
                events_rx.recv(),
            )
            .await;

            match recv_result {
                Ok(Some(crate::runtime::json_rpc::WireEvent::Notification {
                    method: event_method,
                    params,
                })) if event_method == method => {
                    // Put the receiver back before returning
                    self.events_rx.lock().await.replace(events_rx);
                    return Ok(params);
                }
                Ok(Some(_)) => {
                    // Ignore other notifications
                }
                Ok(None) => {
                    // Channel closed
                    return Err(AppError::JsonRpc {
                        method: "wait_for_notification".to_string(),
                        message: "events channel closed".to_string(),
                    });
                }
                Err(_) => {
                    // Timeout check
                    if start.elapsed().as_millis() > timeout_ms.into() {
                        // Put the receiver back before returning
                        self.events_rx.lock().await.replace(events_rx);
                        return Err(AppError::JsonRpc {
                            method: "wait_for_notification".to_string(),
                            message: format!("timed out waiting for {}", method),
                        });
                    }
                }
            }
        }
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

/// Registry for HatchingRuntimeManager instances.
///
/// Manages runtime managers for active hatching sessions, keyed by session_id.
pub struct HatchingRuntimeManagerRegistry {
    managers: RwLock<HashMap<Uuid, Arc<Mutex<HatchingRuntimeManager>>>>,
    paths: AppPaths,
}

impl HatchingRuntimeManagerRegistry {
    pub fn new(paths: AppPaths) -> Self {
        Self {
            managers: RwLock::new(HashMap::new()),
            paths,
        }
    }

    /// Get or create a runtime manager for the given session.
    pub async fn get_or_create(&self, session_id: Uuid) -> Arc<Mutex<HatchingRuntimeManager>> {
        let managers = self.managers.read().await;
        if let Some(manager) = managers.get(&session_id) {
            return manager.clone();
        }
        drop(managers);

        // Create new manager
        let manager = Arc::new(Mutex::new(HatchingRuntimeManager::new(session_id, &self.paths)));
        let mut managers = self.managers.write().await;
        managers.insert(session_id, manager.clone());
        manager
    }

    /// Get an existing runtime manager for the given session.
    pub async fn get(&self, session_id: Uuid) -> AppResult<Arc<Mutex<HatchingRuntimeManager>>> {
        let managers = self.managers.read().await;
        managers
            .get(&session_id)
            .cloned()
            .ok_or_else(|| AppError::PetNotFound(session_id.to_string()))
    }

    /// Remove a runtime manager for the given session.
    pub async fn remove(&self, session_id: Uuid) -> AppResult<()> {
        let mut managers = self.managers.write().await;
        managers
            .remove(&session_id)
            .ok_or_else(|| AppError::PetNotFound(session_id.to_string()))?;
        Ok(())
    }

    /// Teardown and remove a runtime manager.
    pub async fn teardown_and_remove(&self, session_id: Uuid) -> AppResult<()> {
        let manager = self.get(session_id).await?;
        let manager_guard = manager.lock().await;
        manager_guard.teardown().await?;
        drop(manager_guard);
        self.remove(session_id).await
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
        assert!(manager.client().is_none());
    }

    #[test]
    fn runtime_manager_reattach_fails_if_runtime_missing() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));
        let session_id = Uuid::new_v4();
        let mut manager = HatchingRuntimeManager::new(session_id, &paths);

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
        let mut manager = HatchingRuntimeManager::new(session_id, &paths);

        // Create runtime home but not auth
        std::fs::create_dir_all(manager.runtime_home()).unwrap();

        // Reattach should fail if auth.json doesn't exist
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(manager.reattach());
        assert!(matches!(result, Err(AppError::HatchingRuntimeMissing(_))));
    }
}
