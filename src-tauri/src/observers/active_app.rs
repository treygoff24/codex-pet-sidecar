use crate::observers::digest::{now_timestamp, ObservationDigest};
use std::process::Command;

pub fn observe_active_app(include_window_title: bool) -> ObservationDigest {
    #[cfg(target_os = "macos")]
    {
        let script = if include_window_title {
            r#"tell application "System Events"
  set frontApp to name of first application process whose frontmost is true
  try
    set winTitle to name of front window of first application process whose frontmost is true
  on error
    set winTitle to ""
  end try
  return frontApp & "\n" & winTitle
end tell"#
        } else {
            r#"tell application "System Events" to return name of first application process whose frontmost is true"#
        };
        match Command::new("osascript").arg("-e").arg(script).output() {
            Ok(output) if output.status.success() => {
                let text = String::from_utf8_lossy(&output.stdout);
                let mut lines = text.lines();
                let app_name = lines.next().unwrap_or("Unknown").trim().to_string();
                let title = lines
                    .next()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToOwned::to_owned);
                ObservationDigest::ActiveApp {
                    app_name,
                    window_title: title,
                    observed_at: now_timestamp(),
                    degraded: None,
                }
            }
            Ok(output) => ObservationDigest::ActiveApp {
                app_name: "Unknown".into(),
                window_title: None,
                observed_at: now_timestamp(),
                degraded: Some(String::from_utf8_lossy(&output.stderr).trim().to_string()),
            },
            Err(error) => ObservationDigest::ActiveApp {
                app_name: "Unknown".into(),
                window_title: None,
                observed_at: now_timestamp(),
                degraded: Some(error.to_string()),
            },
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        ObservationDigest::ActiveApp {
            app_name: "Unsupported OS".into(),
            window_title: None,
            observed_at: now_timestamp(),
            degraded: Some("active app observer is macOS-only".into()),
        }
    }
}
