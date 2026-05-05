use crate::observers::ObservationDigest;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProactiveTrigger {
    ReturnedFromIdle,
    RepoChanged { previous: String, current: String },
}

pub fn detect_returned_from_idle(digest: &ObservationDigest) -> Option<ProactiveTrigger> {
    match digest {
        ObservationDigest::IdleState {
            returned_at: Some(_),
            ..
        } => Some(ProactiveTrigger::ReturnedFromIdle),
        _ => None,
    }
}

pub fn detect_repo_changed(
    previous_repo: Option<&str>,
    digest: &ObservationDigest,
) -> Option<ProactiveTrigger> {
    match (previous_repo, digest) {
        (
            Some(previous),
            ObservationDigest::Workspace {
                repo_name: Some(current),
                ..
            },
        ) if previous != current => Some(ProactiveTrigger::RepoChanged {
            previous: previous.to_string(),
            current: current.clone(),
        }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_only_repo_name_changes() {
        let digest = ObservationDigest::Workspace {
            cwd: "/x".into(),
            repo_name: Some("next".into()),
            branch: None,
            dirty_summary: None,
            observed_at: "now".into(),
            degraded: None,
        };
        assert!(detect_repo_changed(Some("prev"), &digest).is_some());
        assert!(detect_repo_changed(Some("next"), &digest).is_none());
    }

    #[test]
    fn detects_idle_return() {
        let digest = ObservationDigest::IdleState {
            idle_since: None,
            returned_at: Some("now".into()),
            observed_at: "now".into(),
        };
        assert_eq!(
            detect_returned_from_idle(&digest),
            Some(ProactiveTrigger::ReturnedFromIdle)
        );
    }
}
