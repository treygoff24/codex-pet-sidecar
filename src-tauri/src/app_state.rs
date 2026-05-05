use crate::proactive::AmbientEngine;
use crate::runtime::{RuntimeEvent, RuntimeSessionManager};
use crate::state::AppPaths;
use std::sync::atomic::AtomicBool;
use tokio::sync::{mpsc, Mutex};

pub struct AppState {
    pub paths: AppPaths,
    pub runtime: RuntimeSessionManager,
    pub event_tx: mpsc::UnboundedSender<RuntimeEvent>,
    pub ambient: Mutex<AmbientEngine>,
    pub observer_started: AtomicBool,
}

impl AppState {
    pub fn new(paths: AppPaths, event_tx: mpsc::UnboundedSender<RuntimeEvent>) -> Self {
        Self {
            paths,
            runtime: RuntimeSessionManager::default(),
            event_tx,
            ambient: Mutex::new(AmbientEngine::default()),
            observer_started: AtomicBool::new(false),
        }
    }
}
