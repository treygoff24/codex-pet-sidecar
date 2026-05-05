use crate::error::{AppError, AppResult};
use regex::Regex;
use std::path::Path;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::time::{timeout, Duration};

pub struct AppServerProcess {
    pub websocket_url: String,
    child: Child,
}

impl AppServerProcess {
    pub async fn spawn_from_path(codex_path: &Path) -> AppResult<Self> {
        let mut child = Command::new(codex_path)
            .args(["app-server", "--listen", "ws://127.0.0.1:0"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| AppError::AppServerExited("missing stderr".into()))?;
        let mut lines = BufReader::new(stderr).lines();
        let read_url = async {
            let mut collected = String::new();
            while let Some(line) = lines.next_line().await? {
                collected.push_str(&line);
                collected.push('\n');
                if let Some(url) = parse_app_server_url(&collected) {
                    return Ok(url);
                }
            }
            Err(AppError::AppServerExited(collected))
        };
        let websocket_url = timeout(Duration::from_secs(10), read_url)
            .await
            .map_err(|_| AppError::AppServerTimeout(10))??;
        Ok(Self {
            websocket_url,
            child,
        })
    }

    pub async fn shutdown(&mut self) -> AppResult<()> {
        if self.child.id().is_some() {
            self.child.kill().await?;
        }
        Ok(())
    }
}

impl Drop for AppServerProcess {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}

pub fn parse_app_server_url(stderr: &str) -> Option<String> {
    let regex = Regex::new(r"listening on:\s+(ws://127\.0\.0\.1:\d+)").expect("valid regex");
    regex
        .captures(stderr)
        .and_then(|capture| capture.get(1).map(|value| value.as_str().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_app_server_url() {
        assert_eq!(
            parse_app_server_url("x listening on: ws://127.0.0.1:4567\n"),
            Some("ws://127.0.0.1:4567".into())
        );
    }
}
