pub mod rate_limit;
pub mod triggers;

use crate::observers::ObservationDigest;
use rate_limit::can_send;
use time::OffsetDateTime;
use triggers::{detect_repo_changed, detect_returned_from_idle, ProactiveTrigger};

#[derive(Debug, Default)]
pub struct ProactiveEngine {
    last_repo_name: Option<String>,
    last_sent_at: Option<OffsetDateTime>,
}

impl ProactiveEngine {
    pub fn evaluate(
        &mut self,
        digest: &ObservationDigest,
        min_minutes: u64,
        mute_until: Option<&str>,
    ) -> Option<String> {
        let now = OffsetDateTime::now_utc();
        let trigger = detect_returned_from_idle(digest)
            .or_else(|| detect_repo_changed(self.last_repo_name.as_deref(), digest));
        if let ObservationDigest::Workspace {
            repo_name: Some(repo),
            ..
        } = digest
        {
            self.last_repo_name = Some(repo.clone());
        }
        if !can_send(now, self.last_sent_at, min_minutes, mute_until) {
            return None;
        }
        let prompt = match trigger? {
            ProactiveTrigger::ReturnedFromIdle => "Observation digest: Trey returned after being idle for more than five minutes. Send at most one short welcome-back sentence if useful.".to_string(),
            ProactiveTrigger::RepoChanged { current, .. } => format!("Observation digest: Trey switched to the {current} repo. Send at most one short, friendly observation if useful."),
        };
        self.last_sent_at = Some(now);
        Some(prompt)
    }
}
