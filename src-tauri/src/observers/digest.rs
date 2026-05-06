use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ObservationDigest {
    ActiveApp {
        #[serde(rename = "appName")]
        app_name: String,
        #[serde(rename = "windowTitle")]
        window_title: Option<String>,
        #[serde(rename = "observedAt")]
        observed_at: String,
        degraded: Option<String>,
    },
    Workspace {
        cwd: String,
        #[serde(rename = "repoName")]
        repo_name: Option<String>,
        branch: Option<String>,
        #[serde(rename = "dirtySummary")]
        dirty_summary: Option<String>,
        #[serde(rename = "observedAt")]
        observed_at: String,
        degraded: Option<String>,
    },
    IdleState {
        #[serde(rename = "idleSince")]
        idle_since: Option<String>,
        #[serde(rename = "returnedAt")]
        returned_at: Option<String>,
        #[serde(rename = "observedAt")]
        observed_at: String,
    },
}

pub fn now_timestamp() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .expect("formatting current UTC timestamp as RFC3339 should not fail")
}
