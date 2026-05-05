use crate::error::{AppError, AppResult};
use crate::state::AppPaths;
use std::path::PathBuf;
use std::process::Command;
use time::OffsetDateTime;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScreenshotCapture {
    pub path: Option<PathBuf>,
    pub cleanup_after_turn: bool,
    pub degraded: Option<String>,
}

pub fn capture_ambient_screenshot(
    paths: &AppPaths,
    pet_id: &str,
    retain_screenshot: bool,
) -> ScreenshotCapture {
    match capture_screen(paths, pet_id) {
        Ok(path) => ScreenshotCapture {
            path: Some(path),
            cleanup_after_turn: !retain_screenshot,
            degraded: None,
        },
        Err(error) => ScreenshotCapture {
            path: None,
            cleanup_after_turn: false,
            degraded: Some(error.to_string()),
        },
    }
}

fn capture_screen(paths: &AppPaths, pet_id: &str) -> AppResult<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let dir = paths.ambient_screenshot_dir(pet_id);
        std::fs::create_dir_all(&dir)?;
        let stamp = OffsetDateTime::now_utc().unix_timestamp();
        let png_path = dir.join(format!("ambient-{stamp}.png"));
        let jpg_path = dir.join(format!("ambient-{stamp}.jpg"));

        run_screencapture(&png_path)?;
        match compress_screenshot(&png_path, &jpg_path) {
            Ok(()) => {
                let _ = std::fs::remove_file(&png_path);
                Ok(jpg_path)
            }
            Err(_) => Ok(png_path),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (paths, pet_id);
        Err(AppError::CommandFailed(
            "screencapture".into(),
            "screen capture is macOS-only".into(),
        ))
    }
}

#[cfg(target_os = "macos")]
fn run_screencapture(path: &std::path::Path) -> AppResult<()> {
    let output = Command::new("screencapture")
        .args(["-x", path.to_string_lossy().as_ref()])
        .output()?;
    if output.status.success() && path.exists() {
        return Ok(());
    }
    Err(AppError::CommandFailed(
        "screencapture".into(),
        String::from_utf8_lossy(&output.stderr).trim().to_string(),
    ))
}

#[cfg(target_os = "macos")]
fn compress_screenshot(png_path: &std::path::Path, jpg_path: &std::path::Path) -> AppResult<()> {
    let output = Command::new("sips")
        .args([
            "-Z",
            "1200",
            "-s",
            "format",
            "jpeg",
            png_path.to_string_lossy().as_ref(),
            "--out",
            jpg_path.to_string_lossy().as_ref(),
        ])
        .output()?;
    if output.status.success() && jpg_path.exists() {
        return Ok(());
    }
    Err(AppError::CommandFailed(
        "sips".into(),
        String::from_utf8_lossy(&output.stderr).trim().to_string(),
    ))
}
