use crate::error::{AppError, AppResult};
use crate::observers::digest::{now_timestamp, ObservationDigest};
use std::path::Path;
use std::process::Command;

pub fn observe_workspace(cwd: &Path) -> ObservationDigest {
    match workspace_digest(cwd) {
        Ok(digest) => digest,
        Err(error) => ObservationDigest::Workspace {
            cwd: cwd.display().to_string(),
            repo_name: None,
            branch: None,
            dirty_summary: None,
            observed_at: now_timestamp(),
            degraded: Some(error.to_string()),
        },
    }
}

fn workspace_digest(cwd: &Path) -> AppResult<ObservationDigest> {
    if !cwd.exists() {
        return Err(AppError::CommandFailed(
            "workspace".into(),
            "workspace cwd does not exist".into(),
        ));
    }
    let root = run_git(cwd, &["rev-parse", "--show-toplevel"])?;
    let branch = run_git(cwd, &["branch", "--show-current"])
        .ok()
        .filter(|value| !value.is_empty());
    let status = run_git(cwd, &["status", "--short"]).unwrap_or_default();
    let repo_name = Path::new(root.trim())
        .file_name()
        .and_then(|value| value.to_str())
        .map(ToOwned::to_owned);
    Ok(ObservationDigest::Workspace {
        cwd: cwd.display().to_string(),
        repo_name,
        branch,
        dirty_summary: dirty_summary(&status),
        observed_at: now_timestamp(),
        degraded: None,
    })
}

fn run_git(cwd: &Path, args: &[&str]) -> AppResult<String> {
    let output = Command::new("git").args(args).current_dir(cwd).output()?;
    if !output.status.success() {
        return Err(AppError::CommandFailed(
            format!("git {}", args.join(" ")),
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn dirty_summary(status: &str) -> Option<String> {
    let mut modified = 0;
    let mut untracked = 0;
    let mut deleted = 0;
    for line in status.lines().filter(|line| !line.trim().is_empty()) {
        if line.starts_with("??") {
            untracked += 1;
        } else if line.contains('D') {
            deleted += 1;
        } else {
            modified += 1;
        }
    }
    let mut parts = Vec::new();
    if modified > 0 {
        parts.push(format!("{modified} modified"));
    }
    if untracked > 0 {
        parts.push(format!("{untracked} untracked"));
    }
    if deleted > 0 {
        parts.push(format!("{deleted} deleted"));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(", "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summarizes_dirty_status_counts_only() {
        assert_eq!(
            dirty_summary(" M src/main.rs\n?? x\n D gone\n"),
            Some("1 modified, 1 untracked, 1 deleted".into())
        );
        assert_eq!(dirty_summary(""), None);
    }
}
