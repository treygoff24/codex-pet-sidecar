use crate::error::{AppError, AppResult};
use regex::Regex;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::time::{timeout, Duration};
use which::which;

const APP_SERVER_ARGS: [&str; 3] = ["app-server", "--listen", "ws://127.0.0.1:0"];
const STABLE_PATH: &str = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

pub struct AppServerProcess {
    pub websocket_url: String,
    child: Child,
}

impl AppServerProcess {
    pub async fn spawn(runtime_codex_home: &Path) -> AppResult<Self> {
        prepare_runtime_codex_home(runtime_codex_home)?;
        let spec = app_server_launch_spec(runtime_codex_home);
        let child = spawn_app_server_command(&spec)?;
        Self::from_child(child).await
    }

    async fn from_child(mut child: Child) -> AppResult<Self> {
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

#[derive(Debug, Clone, PartialEq, Eq)]
struct AppServerLaunchSpec {
    program: PathBuf,
    args: Vec<String>,
    env: Vec<(String, String)>,
}

fn app_server_launch_spec(runtime_codex_home: &Path) -> AppServerLaunchSpec {
    app_server_launch_spec_with_discovered(runtime_codex_home, which("codex").ok())
}

fn app_server_launch_spec_with_discovered(
    runtime_codex_home: &Path,
    discovered_codex: Option<PathBuf>,
) -> AppServerLaunchSpec {
    let fixed_candidates = [
        "/opt/homebrew/bin/codex",
        "/usr/local/bin/codex",
        "/Applications/Codex.app/Contents/Resources/codex",
    ];
    let program = discovered_codex
        .or_else(|| {
            fixed_candidates
                .iter()
                .map(PathBuf::from)
                .find(|path| path.exists())
        })
        .unwrap_or_else(|| PathBuf::from("codex"));

    AppServerLaunchSpec {
        program,
        args: APP_SERVER_ARGS.iter().map(ToString::to_string).collect(),
        env: isolated_env(runtime_codex_home),
    }
}

fn isolated_env(runtime_codex_home: &Path) -> Vec<(String, String)> {
    let mut env = vec![
        (
            "CODEX_HOME".to_string(),
            runtime_codex_home.display().to_string(),
        ),
        ("PATH".to_string(), STABLE_PATH.to_string()),
        ("TERM".to_string(), "xterm-256color".to_string()),
        ("SHELL".to_string(), "/bin/zsh".to_string()),
    ];
    if let Some(home) = dirs::home_dir() {
        env.push(("HOME".to_string(), home.display().to_string()));
    }
    if let Ok(user) = std::env::var("USER") {
        env.push(("USER".to_string(), user));
    }
    env
}

fn prepare_runtime_codex_home(runtime_codex_home: &Path) -> AppResult<()> {
    std::fs::create_dir_all(runtime_codex_home)?;
    std::fs::write(
        runtime_codex_home.join("config.toml"),
        "[analytics]\nenabled = false\n",
    )?;
    link_or_copy_user_auth(runtime_codex_home)?;
    Ok(())
}

fn link_or_copy_user_auth(runtime_codex_home: &Path) -> AppResult<()> {
    let Some(home) = dirs::home_dir() else {
        return Ok(());
    };
    let source = home.join(".codex").join("auth.json");
    if !source.exists() {
        return Ok(());
    }
    let target = runtime_codex_home.join("auth.json");
    if target.exists() {
        std::fs::remove_file(&target)?;
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(&source, &target).or_else(|_| {
            std::fs::copy(&source, &target)?;
            Ok::<(), std::io::Error>(())
        })?;
    }
    #[cfg(not(unix))]
    {
        std::fs::copy(&source, &target)?;
    }
    Ok(())
}

fn spawn_app_server_command(spec: &AppServerLaunchSpec) -> std::io::Result<Child> {
    let mut command = Command::new(&spec.program);
    command.args(&spec.args);
    command
        .env_clear()
        .envs(spec.env.iter().map(|(key, value)| (key, value)))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
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

    #[test]
    fn app_server_launch_uses_sidecar_config_home_not_user_codex_home() {
        let runtime_home = PathBuf::from("/tmp/sidecar-support/codex-runtime-home");
        let spec = app_server_launch_spec(&runtime_home);

        assert_eq!(spec.args, APP_SERVER_ARGS);
        assert!(spec.env.contains(&(
            "CODEX_HOME".to_string(),
            "/tmp/sidecar-support/codex-runtime-home".to_string()
        )));
        assert!(spec
            .env
            .contains(&("TERM".to_string(), "xterm-256color".to_string())));
        assert!(!spec
            .env
            .iter()
            .any(|(key, value)| { key == "CODEX_HOME" && value.ends_with("/.codex") }));
    }

    #[test]
    fn app_server_launch_preserves_discovered_codex_outside_stable_path() {
        let runtime_home = PathBuf::from("/tmp/sidecar-support/codex-runtime-home");
        let discovered = PathBuf::from("/tmp/custom-bin/codex");
        let spec = app_server_launch_spec_with_discovered(&runtime_home, Some(discovered.clone()));

        assert_eq!(spec.program, discovered);
        assert_eq!(spec.args, APP_SERVER_ARGS);
    }
}
