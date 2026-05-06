pub mod rate_limit;
pub mod triggers;

use crate::observers::ObservationDigest;
use crate::state::AmbientConfig;
use rate_limit::can_send;
use time::OffsetDateTime;
use triggers::{detect_repo_changed, detect_returned_from_idle, ProactiveTrigger};

#[derive(Debug, Default)]
pub struct AmbientEngine {
    latest_active_app: Option<ObservationDigest>,
    latest_workspace: Option<ObservationDigest>,
    latest_idle: Option<ObservationDigest>,
    last_repo_name: Option<String>,
    last_sent_at: Option<OffsetDateTime>,
    pending_trigger: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AmbientTurnRequest {
    pub prompt: String,
    pub include_screenshot: bool,
    pub retain_screenshot: bool,
}

impl AmbientEngine {
    pub fn record_observations(&mut self, digests: &[ObservationDigest]) {
        for digest in digests {
            self.record_trigger(digest);
            self.record_digest(digest);
            self.record_repo_name(digest);
        }
    }

    pub fn next_request(
        &self,
        config: &AmbientConfig,
        mute_until: Option<&str>,
    ) -> Option<AmbientTurnRequest> {
        if !config.enabled {
            return None;
        }
        let now = OffsetDateTime::now_utc();
        if !can_send(
            now,
            self.last_sent_at,
            config.effective_interval_minutes(),
            mute_until,
        ) {
            return None;
        }

        let trigger = self
            .pending_trigger
            .clone()
            .unwrap_or_else(|| "periodic ambient check".to_string());
        Some(AmbientTurnRequest {
            prompt: self.compose_prompt(&trigger),
            include_screenshot: config.include_screenshot,
            retain_screenshot: config.retain_screenshots,
        })
    }

    pub fn mark_request_started(&mut self) {
        self.last_sent_at = Some(OffsetDateTime::now_utc());
        self.pending_trigger = None;
    }

    fn record_digest(&mut self, digest: &ObservationDigest) {
        match digest {
            ObservationDigest::ActiveApp { .. } => self.latest_active_app = Some(digest.clone()),
            ObservationDigest::Workspace { .. } => self.latest_workspace = Some(digest.clone()),
            ObservationDigest::IdleState { .. } => self.latest_idle = Some(digest.clone()),
        }
    }

    fn record_trigger(&mut self, digest: &ObservationDigest) {
        if let Some(trigger) = detect_returned_from_idle(digest)
            .or_else(|| detect_repo_changed(self.last_repo_name.as_deref(), digest))
        {
            self.pending_trigger = Some(trigger.describe());
        }
    }

    fn record_repo_name(&mut self, digest: &ObservationDigest) {
        if let ObservationDigest::Workspace {
            repo_name: Some(repo),
            ..
        } = digest
        {
            self.last_repo_name = Some(repo.clone());
        }
    }

    fn compose_prompt(&self, trigger: &str) -> String {
        let mut lines = vec![
            "Ambient awareness snapshot. Decide whether the desktop pet should speak.".to_string(),
            "For THIS turn only, return only JSON with this shape: {\"shouldSpeak\": boolean, \"message\": string}. Do not use this JSON format on any subsequent direct turns from the human — those return to plain prose."
                .to_string(),
            "Speak only if the comment is timely, useful, and not annoying. Keep message under 140 characters.".to_string(),
            format!("Trigger: {trigger}."),
        ];
        if let Some(digest) = &self.latest_active_app {
            lines.push(format!("Active app: {}", prompt_line(digest)));
        }
        if let Some(digest) = &self.latest_workspace {
            lines.push(format!("Workspace: {}", prompt_line(digest)));
        }
        if let Some(digest) = &self.latest_idle {
            lines.push(format!("Idle state: {}", prompt_line(digest)));
        }
        lines.join("\n")
    }
}

fn prompt_line(digest: &ObservationDigest) -> String {
    match digest {
        ObservationDigest::ActiveApp {
            app_name,
            window_title,
            observed_at,
            degraded,
        } => format!(
            "app={app_name}; window={}; observedAt={observed_at}; degraded={}",
            window_title.as_deref().unwrap_or("unknown"),
            degraded.as_deref().unwrap_or("none")
        ),
        ObservationDigest::Workspace {
            cwd,
            repo_name,
            branch,
            dirty_summary,
            observed_at,
            degraded,
        } => format!(
            "cwd={cwd}; repo={}; branch={}; dirty={}; observedAt={observed_at}; degraded={}",
            repo_name.as_deref().unwrap_or("unknown"),
            branch.as_deref().unwrap_or("unknown"),
            dirty_summary.as_deref().unwrap_or("clean"),
            degraded.as_deref().unwrap_or("none")
        ),
        ObservationDigest::IdleState {
            idle_since,
            returned_at,
            observed_at,
        } => format!(
            "idleSince={}; returnedAt={}; observedAt={observed_at}",
            idle_since.as_deref().unwrap_or("not idle"),
            returned_at.as_deref().unwrap_or("none")
        ),
    }
}

impl ProactiveTrigger {
    fn describe(&self) -> String {
        match self {
            ProactiveTrigger::ReturnedFromIdle => {
                "The user returned after being idle for more than five minutes".to_string()
            }
            ProactiveTrigger::RepoChanged { current, .. } => {
                format!("The user switched to the {current} repo")
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AmbientConfig;

    fn ambient_config() -> AmbientConfig {
        AmbientConfig {
            enabled: true,
            interval_minutes: 15,
            include_screenshot: true,
            retain_screenshots: false,
        }
    }

    #[test]
    fn periodic_snapshot_requests_structured_json() {
        let mut engine = AmbientEngine::default();
        let digests = vec![ObservationDigest::ActiveApp {
            app_name: "Cursor".into(),
            window_title: Some("main.rs".into()),
            observed_at: "now".into(),
            degraded: None,
        }];
        engine.record_observations(&digests);
        let request = engine
            .next_request(&ambient_config(), None)
            .expect("first ambient snapshot should send");
        assert!(request.prompt.contains("return only JSON"));
        assert!(request
            .prompt
            .contains("subsequent direct turns from the human"));
        assert!(request.prompt.contains("Cursor"));
        assert!(request.include_screenshot);
        assert!(!request.retain_screenshot);
    }

    #[test]
    fn disabled_ambient_does_not_send() {
        let mut engine = AmbientEngine::default();
        let mut config = ambient_config();
        config.enabled = false;
        let digests = vec![ObservationDigest::ActiveApp {
            app_name: "Cursor".into(),
            window_title: None,
            observed_at: "now".into(),
            degraded: None,
        }];
        engine.record_observations(&digests);
        assert!(engine.next_request(&config, None).is_none());
    }

    #[test]
    fn request_is_rate_limited_only_after_mark_started() {
        let mut engine = AmbientEngine::default();
        let digests = vec![ObservationDigest::ActiveApp {
            app_name: "Cursor".into(),
            window_title: None,
            observed_at: "now".into(),
            degraded: None,
        }];
        engine.record_observations(&digests);
        assert!(engine.next_request(&ambient_config(), None).is_some());
        assert!(engine.next_request(&ambient_config(), None).is_some());
        engine.mark_request_started();
        assert!(engine.next_request(&ambient_config(), None).is_none());
    }

    #[test]
    fn snapshot_prompt_includes_all_observation_types() {
        let mut engine = AmbientEngine::default();
        let digests = vec![
            ObservationDigest::ActiveApp {
                app_name: "Cursor".into(),
                window_title: Some("main.rs".into()),
                observed_at: "now".into(),
                degraded: None,
            },
            ObservationDigest::Workspace {
                cwd: "/repo".into(),
                repo_name: Some("codex-pet-sidecar".into()),
                branch: Some("codex/ambient".into()),
                dirty_summary: Some("2 modified".into()),
                observed_at: "now".into(),
                degraded: None,
            },
            ObservationDigest::IdleState {
                idle_since: None,
                returned_at: None,
                observed_at: "now".into(),
            },
        ];
        engine.record_observations(&digests);
        let prompt = engine.next_request(&ambient_config(), None).unwrap().prompt;
        assert!(prompt.contains("Cursor"));
        assert!(prompt.contains("codex-pet-sidecar"));
        assert!(prompt.contains("Idle state"));
    }
}
