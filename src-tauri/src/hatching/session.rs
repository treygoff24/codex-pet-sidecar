use crate::error::{AppError, AppResult};
use crate::state::paths::AppPaths;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::sync::RwLock;
use uuid::Uuid;

// Data contracts from spec

/// Hatching session — owned by Rust backend, mutable across wizard steps.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HatchingSession {
    pub id: Uuid,
    pub runtime_home: PathBuf,
    pub workspace: PathBuf,
    pub codex_thread_id: Option<String>,
    pub brief: Option<PetBrief>,
    pub archetype: Option<String>,
    pub reference_image: Option<ReferenceImage>,
    pub prototype: Option<PrototypeState>,
    pub rows: HashMap<RowKey, RowState>,
    pub phase: HatchingPhase,
    #[serde(with = "time::serde::iso8601")]
    pub created_at: time::OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum HatchingPhase {
    Inspiration,
    Brief,
    Prototype,
    Generating { progress: GenerationProgress },
    Review,
    Importing,
    Done { pet_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PetBrief {
    pub display_name: String,
    pub pet_id: String,
    pub description: String,
    pub personality: Vec<String>,
    pub palette: Option<PaletteSpec>,
    pub backstory: Option<String>,
    pub speech_style: Option<String>,
    pub behavioral_quirks: Option<String>,
    pub visual_notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PaletteSpec {
    pub primary: String,
    pub secondary: String,
    pub accent: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceImage {
    pub id: Uuid,
    pub path: PathBuf,
    pub sha256: String,
    pub description: Option<String>,
    pub description_status: ReferenceDescriptionStatus,
    #[serde(with = "time::serde::iso8601::option")]
    pub described_at: Option<time::OffsetDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum ReferenceDescriptionStatus {
    Pending,
    Ready,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PrototypeState {
    pub iterations: Vec<PrototypeIteration>,
    pub current: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PrototypeIteration {
    pub n: u32,
    pub revised_prompt: String,
    pub summary_of_changes: String,
    pub user_feedback: Option<String>,
    pub image: ImageArtifact,
    #[serde(with = "time::serde::iso8601")]
    pub generated_at: time::OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum RowKey {
    Idle,
    RunningRight,
    RunningLeft,
    Waving,
    Jumping,
    Failed,
    Waiting,
    Running,
    Review,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
#[allow(dead_code)]
pub enum GeneratedRowKey {
    Idle,
    RunningRight,
    Waving,
    Jumping,
    Failed,
    Waiting,
    Running,
    Review,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RowState {
    pub prompt: String,
    pub image: Option<ImageArtifact>,
    pub derived_from: Option<RowKey>,
    pub mirror_decision: Option<MirrorDecision>,
    pub attempts: u32,
    pub last_error: Option<String>,
    pub status: RowStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum RowStatus {
    Pending,
    Generating,
    Ready,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImageArtifact {
    pub source_path: PathBuf,
    pub output_path: PathBuf,
    pub source_provenance: SourceProvenance,
    pub source_sha256: String,
    pub output_sha256: String,
    pub metadata: ImageMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum SourceProvenance {
    BuiltInImagegen,
    DeterministicMirror,
    SyntheticTest,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImageMetadata {
    pub width: u32,
    pub height: u32,
    pub mode: String,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MirrorDecision {
    pub approved: bool,
    pub reason: String,
    #[serde(with = "time::serde::iso8601")]
    pub decided_at: time::OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GenerationProgress {
    pub rows_completed: u32,
    pub rows_total: u32,
    pub estimated_remaining: Duration,
    pub total_imagegen_calls: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OrphanSummary {
    pub session_id: Uuid,
    pub display_name: Option<String>,
    pub phase: HatchingPhase,
    #[serde(with = "time::serde::iso8601")]
    pub created_at: time::OffsetDateTime,
}

// HatchingSessionRegistry

#[allow(dead_code)]
pub struct HatchingSessionRegistry {
    sessions: RwLock<HashMap<Uuid, HatchingSession>>,
    paths: AppPaths,
}

impl HatchingSessionRegistry {
    pub fn new(paths: AppPaths) -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            paths,
        }
    }

    #[allow(dead_code)]
    pub async fn get(&self, id: Uuid) -> AppResult<HatchingSession> {
        let sessions = self.sessions.read().await;
        sessions
            .get(&id)
            .cloned()
            .ok_or_else(|| AppError::HatchingSessionNotFound(id.to_string()))
    }

    #[allow(dead_code)]
    pub async fn insert(&self, session: HatchingSession) -> AppResult<()> {
        self.persist_session(&session).await?;
        let mut sessions = self.sessions.write().await;
        sessions.insert(session.id, session);
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn update(&self, session: HatchingSession) -> AppResult<()> {
        self.persist_session(&session).await?;
        let mut sessions = self.sessions.write().await;
        sessions.insert(session.id, session);
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn remove(&self, id: Uuid) -> AppResult<()> {
        let mut sessions = self.sessions.write().await;
        sessions.remove(&id);
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn list_all(&self) -> Vec<HatchingSession> {
        let sessions = self.sessions.read().await;
        sessions.values().cloned().collect()
    }

    #[allow(dead_code)]
    async fn persist_session(&self, session: &HatchingSession) -> AppResult<()> {
        let session_path = self
            .paths
            .hatching_workspace_dir(&session.id.to_string())
            .join("session.json");
        tokio::fs::create_dir_all(session_path.parent().unwrap()).await?;
        tokio::fs::write(&session_path, serde_json::to_string_pretty(session)?).await?;
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn recover_from_disk(&self) -> AppResult<Vec<HatchingSession>> {
        let workspace_root = self.paths.hatching_workspace_root_dir();
        if !workspace_root.exists() {
            return Ok(Vec::new());
        }

        let mut recovered = Vec::new();
        for entry in std::fs::read_dir(&workspace_root)? {
            let entry = entry?;
            let session_path = entry.path().join("session.json");
            if session_path.exists() {
                match self.load_session_from_disk(&session_path) {
                    Ok(session) => {
                        // Only recover sessions that are not done
                        if !matches!(session.phase, HatchingPhase::Done { .. }) {
                            recovered.push(session);
                        }
                    }
                    Err(e) => {
                        eprintln!(
                            "hatching: failed to load session from {:?}: {}",
                            session_path, e
                        );
                    }
                }
            }
        }

        let mut sessions = self.sessions.write().await;
        for session in &recovered {
            sessions.insert(session.id, session.clone());
        }

        Ok(recovered)
    }

    #[allow(dead_code)]
    fn load_session_from_disk(&self, path: &Path) -> AppResult<HatchingSession> {
        let content = std::fs::read_to_string(path)?;
        let session: HatchingSession = serde_json::from_str(&content)?;
        Ok(session)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn create_test_session(id: Uuid) -> HatchingSession {
        HatchingSession {
            id,
            runtime_home: PathBuf::from("/tmp/runtime"),
            workspace: PathBuf::from("/tmp/workspace"),
            codex_thread_id: None,
            brief: None,
            archetype: None,
            reference_image: None,
            prototype: None,
            rows: HashMap::new(),
            phase: HatchingPhase::Inspiration,
            created_at: time::OffsetDateTime::now_utc(),
        }
    }

    #[test]
    fn hatching_phase_serialize_round_trip() {
        let phases = vec![
            HatchingPhase::Inspiration,
            HatchingPhase::Brief,
            HatchingPhase::Prototype,
            HatchingPhase::Generating {
                progress: GenerationProgress {
                    rows_completed: 4,
                    rows_total: 8,
                    estimated_remaining: Duration::from_secs(120),
                    total_imagegen_calls: 5,
                },
            },
            HatchingPhase::Review,
            HatchingPhase::Importing,
            HatchingPhase::Done {
                pet_id: "test-pet".to_string(),
            },
        ];

        for phase in phases {
            let serialized = serde_json::to_string(&phase).unwrap();
            let deserialized: HatchingPhase = serde_json::from_str(&serialized).unwrap();
            assert_eq!(phase, deserialized);
        }
    }

    #[test]
    fn row_status_serialize_round_trip() {
        let statuses = vec![
            RowStatus::Pending,
            RowStatus::Generating,
            RowStatus::Ready,
            RowStatus::Failed,
        ];

        for status in statuses {
            let serialized = serde_json::to_string(&status).unwrap();
            let deserialized: RowStatus = serde_json::from_str(&serialized).unwrap();
            assert_eq!(status, deserialized);
        }
    }

    #[test]
    fn source_provenance_serialize_round_trip() {
        let provenances = vec![
            SourceProvenance::BuiltInImagegen,
            SourceProvenance::DeterministicMirror,
            SourceProvenance::SyntheticTest,
        ];

        for provenance in provenances {
            let serialized = serde_json::to_string(&provenance).unwrap();
            let deserialized: SourceProvenance = serde_json::from_str(&serialized).unwrap();
            assert_eq!(provenance, deserialized);
        }
    }

    #[tokio::test]
    async fn session_persistence_round_trip() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));
        let registry = HatchingSessionRegistry::new(paths);

        let id = Uuid::new_v4();
        let session = create_test_session(id);

        registry.insert(session.clone()).await.unwrap();
        let loaded = registry.get(id).await.unwrap();
        assert_eq!(session, loaded);
    }

    #[tokio::test]
    async fn crash_recovery_ignores_done_sessions() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));
        let registry = HatchingSessionRegistry::new(paths.clone());

        let id1 = Uuid::new_v4();
        let id2 = Uuid::new_v4();

        let mut session1 = create_test_session(id1);
        session1.phase = HatchingPhase::Prototype;

        let mut session2 = create_test_session(id2);
        session2.phase = HatchingPhase::Done {
            pet_id: "done-pet".to_string(),
        };

        // Manually write sessions to disk
        let session1_path = paths
            .hatching_workspace_dir(&id1.to_string())
            .join("session.json");
        let session2_path = paths
            .hatching_workspace_dir(&id2.to_string())
            .join("session.json");

        std::fs::create_dir_all(session1_path.parent().unwrap()).unwrap();
        std::fs::create_dir_all(session2_path.parent().unwrap()).unwrap();

        std::fs::write(&session1_path, serde_json::to_string(&session1).unwrap()).unwrap();
        std::fs::write(&session2_path, serde_json::to_string(&session2).unwrap()).unwrap();

        let recovered = registry.recover_from_disk().await.unwrap();
        assert_eq!(recovered.len(), 1);
        assert_eq!(recovered[0].id, id1);
    }

    #[tokio::test]
    async fn crash_recovery_handles_malformed_sessions() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));
        let registry = HatchingSessionRegistry::new(paths.clone());

        let id = Uuid::new_v4();
        let session_path = paths
            .hatching_workspace_dir(&id.to_string())
            .join("session.json");

        std::fs::create_dir_all(session_path.parent().unwrap()).unwrap();
        std::fs::write(&session_path, "invalid json").unwrap();

        // Should not panic, just log warning
        let recovered = registry.recover_from_disk().await.unwrap();
        assert_eq!(recovered.len(), 0);
    }

    #[tokio::test]
    async fn concurrent_mutations_no_deadlock() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));
        let registry = std::sync::Arc::new(HatchingSessionRegistry::new(paths));

        let id1 = Uuid::new_v4();
        let id2 = Uuid::new_v4();

        let session1 = create_test_session(id1);
        let session2 = create_test_session(id2);

        registry.insert(session1.clone()).await.unwrap();
        registry.insert(session2.clone()).await.unwrap();

        // Concurrent mutations to different sessions
        let registry1 = registry.clone();
        let registry2 = registry.clone();

        let handle1 = tokio::spawn(async move {
            let mut s = registry1.get(id1).await.unwrap();
            s.phase = HatchingPhase::Brief;
            registry1.update(s).await.unwrap();
        });

        let handle2 = tokio::spawn(async move {
            let mut s = registry2.get(id2).await.unwrap();
            s.phase = HatchingPhase::Brief;
            registry2.update(s).await.unwrap();
        });

        handle1.await.unwrap();
        handle2.await.unwrap();

        let loaded1 = registry.get(id1).await.unwrap();
        let loaded2 = registry.get(id2).await.unwrap();

        assert!(matches!(loaded1.phase, HatchingPhase::Brief));
        assert!(matches!(loaded2.phase, HatchingPhase::Brief));
    }
}
