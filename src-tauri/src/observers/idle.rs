use crate::observers::digest::{now_timestamp, ObservationDigest};
use std::process::Command;

const RETURNED_THRESHOLD_SECONDS: u64 = 300;

pub fn observe_idle_state_with_current(
    previous_idle_seconds: Option<u64>,
) -> (ObservationDigest, Option<u64>) {
    let idle_seconds = current_idle_seconds().ok();
    let returned_at = match (previous_idle_seconds, idle_seconds) {
        (Some(previous), Some(current))
            if previous >= RETURNED_THRESHOLD_SECONDS && current < 30 =>
        {
            Some(now_timestamp())
        }
        _ => None,
    };
    let idle_since = idle_seconds
        .filter(|seconds| *seconds >= RETURNED_THRESHOLD_SECONDS)
        .map(|seconds| format!("{seconds}s"));
    (
        ObservationDigest::IdleState {
            idle_since,
            returned_at,
            observed_at: now_timestamp(),
        },
        idle_seconds,
    )
}

fn current_idle_seconds() -> Result<u64, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("ioreg")
            .args(["-c", "IOHIDSystem"])
            .output()
            .map_err(|error| error.to_string())?;
        let text = String::from_utf8_lossy(&output.stdout);
        parse_idle_nanoseconds(&text)
            .map(|ns| ns / 1_000_000_000)
            .ok_or_else(|| "HIDIdleTime not found".to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("idle observer is macOS-only".into())
    }
}

pub fn parse_idle_nanoseconds(output: &str) -> Option<u64> {
    output.lines().find_map(|line| {
        line.split("HIDIdleTime")
            .nth(1)?
            .split('=')
            .nth(1)?
            .trim()
            .parse::<u64>()
            .ok()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_idle_time() {
        assert_eq!(
            parse_idle_nanoseconds("  \"HIDIdleTime\" = 600000000000\n"),
            Some(600_000_000_000)
        );
    }
}
