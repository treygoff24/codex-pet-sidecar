use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("I/O error at {path:?}: {source}")]
    IoWithPath {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("codex app-server did not report a websocket URL within {0} seconds")]
    AppServerTimeout(u64),
    #[error("codex app-server exited before it was ready: {0}")]
    AppServerExited(String),
    #[error("websocket error: {0}")]
    WebSocket(String),
    #[error("JSON-RPC error from {method}: {message}")]
    JsonRpc { method: String, message: String },
    #[error("runtime has not been started")]
    RuntimeNotStarted,
    #[error("no active turn is available to interrupt")]
    NoActiveTurn,
    #[error("another turn is already running")]
    TurnAlreadyActive,
    #[error("approval request {0} is no longer pending")]
    ApprovalNotPending(String),
    #[error("invalid pet asset {path:?}: {reason}")]
    InvalidPetAsset { path: PathBuf, reason: String },
    #[error("invalid pet metadata {path:?}: {reason}")]
    InvalidPetMetadata { path: PathBuf, reason: String },
    #[error("app support directory could not be resolved")]
    MissingAppSupportDir,
    #[error("application path could not be resolved: {0}")]
    PathResolution(String),
    #[error("command `{0}` failed: {1}")]
    CommandFailed(String, String),
    #[error("pet {0} was not found in the library")]
    PetNotFound(String),
    #[error("pet {0} already exists in the library")]
    PetAlreadyExists(String),
    #[error("pet library is full; maximum installed pets is {0}")]
    PetLimitReached(usize),
    #[error("invalid workspace {path:?}: {reason}")]
    InvalidWorkspace { path: PathBuf, reason: String },
    #[error("Codex authentication not found. Install Codex CLI and run `codex` to sign in with ChatGPT.")]
    CodexAuthNotFound,
    #[error("hatching runtime for session {0} is missing or corrupt")]
    #[allow(dead_code)]
    HatchingRuntimeMissing(String),
    #[error("command '{command}' is not yet implemented")]
    NotImplemented { command: String },
}

pub type AppResult<T> = Result<T, AppError>;

pub fn read_to_string(path: &std::path::Path) -> AppResult<String> {
    std::fs::read_to_string(path).map_err(|source| AppError::IoWithPath {
        path: path.to_path_buf(),
        source,
    })
}
