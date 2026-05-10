use crate::error::{AppError, AppResult};
use crate::hatching::provenance::validate_image_artifact;
use crate::hatching::session::{ImageArtifact, ImageMetadata, SourceProvenance};
use image::GenericImageView;
use image::ImageReader;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::sleep;

/// Imagegen artifact ingester using file watching.
///
/// Watches `<runtime_home>/generated_images/` for new `ig_*.png` files,
/// validates provenance, hashes, and copies to workspace.
#[allow(dead_code)]
pub struct ImagegenIngester {
    runtime_home: PathBuf,
    workspace_dir: PathBuf,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum ImagegenEvent {
    ArtifactIngested(ImageArtifact),
    IngestionFailed { path: PathBuf, reason: String },
}

#[allow(dead_code)]
impl ImagegenIngester {
    /// Create a new imagegen ingester for the given session.
    pub fn new(runtime_home: PathBuf, workspace_dir: PathBuf) -> Self {
        Self {
            runtime_home,
            workspace_dir,
        }
    }

    /// Start watching for imagegen artifacts.
    ///
    /// Returns a receiver for ingestion events.
    pub fn start_watching(&mut self) -> AppResult<mpsc::UnboundedReceiver<ImagegenEvent>> {
        let generated_images_dir = self.runtime_home.join("generated_images");
        std::fs::create_dir_all(&generated_images_dir).map_err(|e| AppError::IoWithPath {
            path: generated_images_dir.clone(),
            source: e,
        })?;

        let (event_tx, event_rx) = mpsc::unbounded_channel();

        let watch_dir = generated_images_dir.clone();
        let workspace_dir = self.workspace_dir.clone();
        let runtime_home = self.runtime_home.clone();

        tokio::spawn(async move {
            if let Err(e) =
                Self::watch_directory(watch_dir, runtime_home, workspace_dir, event_tx).await
            {
                eprintln!("imagegen watcher error: {}", e);
            }
        });

        Ok(event_rx)
    }

    /// Watch directory for new imagegen files.
    async fn watch_directory(
        watch_dir: PathBuf,
        runtime_home: PathBuf,
        workspace_dir: PathBuf,
        public_event_tx: mpsc::UnboundedSender<ImagegenEvent>,
    ) -> AppResult<()> {
        use notify::{EventKind, RecursiveMode, Watcher};

        let (internal_tx, mut internal_rx) = mpsc::unbounded_channel::<PathBuf>();

        let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, _>| {
            if let Ok(event) = res {
                if event.kind == EventKind::Create(notify::event::CreateKind::Any) {
                    if let Some(path) = event.paths.first() {
                        let _ = internal_tx.send(path.clone());
                    }
                }
            }
        })
        .map_err(|e| AppError::InvalidPetAsset {
            path: watch_dir.clone(),
            reason: format!("failed to create watcher: {}", e),
        })?;

        watcher
            .watch(&watch_dir, RecursiveMode::Recursive)
            .map_err(|e| AppError::InvalidPetAsset {
                path: watch_dir.clone(),
                reason: format!("failed to watch directory: {}", e),
            })?;

        let mut pending_files: std::collections::HashMap<PathBuf, tokio::time::Instant> =
            std::collections::HashMap::new();
        let mut processed_files = HashSet::<PathBuf>::new();

        loop {
            tokio::select! {
                event = internal_rx.recv() => {
                    if let Some(path) = event {
                        if Self::is_imagegen_file(&path)
                            && !processed_files.contains(&path)
                        {
                            pending_files.insert(path.clone(), tokio::time::Instant::now());
                        }
                    }
                }
                _ = sleep(Duration::from_millis(100)) => {
                    let now = tokio::time::Instant::now();
                    let mut to_process = Vec::new();
                    pending_files.retain(|path, timestamp| {
                        if now.duration_since(*timestamp) >= Duration::from_millis(500) {
                            to_process.push(path.clone());
                            false
                        } else {
                            true
                        }
                    });

                    for path in to_process {
                        if !processed_files.insert(path.clone()) {
                            continue;
                        }
                        match Self::ingest_single_file(&path, &runtime_home, &workspace_dir) {
                            Ok(artifact) => {
                                let _ = public_event_tx.send(ImagegenEvent::ArtifactIngested(artifact));
                            }
                            Err(e) => {
                                let _ = public_event_tx.send(ImagegenEvent::IngestionFailed {
                                    path: path.clone(),
                                    reason: e.to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    /// Check if a file is an imagegen artifact (starts with "ig_" and is .png).
    fn is_imagegen_file(path: &Path) -> bool {
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        file_name.starts_with("ig_") && file_name.ends_with(".png")
    }

    /// Validate and ingest a single imagegen file.
    pub fn ingest_single_file(
        source_path: &Path,
        runtime_home: &Path,
        workspace_dir: &Path,
    ) -> AppResult<ImageArtifact> {
        if !Self::is_imagegen_file(source_path) {
            return Err(AppError::InvalidPetAsset {
                path: source_path.to_path_buf(),
                reason: "file name must match ig_*.png".to_string(),
            });
        }

        let file_bytes = std::fs::read(source_path)?;
        let source_sha256 = Some(format!("{:x}", Sha256::digest(&file_bytes)));

        let image =
            ImageReader::open(source_path)?
                .decode()
                .map_err(|e| AppError::InvalidPetAsset {
                    path: source_path.to_path_buf(),
                    reason: format!("failed to decode image: {e}"),
                })?;
        let dimensions = image.dimensions();

        let file_name = source_path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| AppError::InvalidPetAsset {
                path: source_path.to_path_buf(),
                reason: "invalid file name".to_string(),
            })?;
        let output_dir = workspace_dir.join("artifacts");
        std::fs::create_dir_all(&output_dir)?;
        let output_path = output_dir.join(file_name);

        std::fs::write(&output_path, &file_bytes)?;
        let output_sha256 = source_sha256
            .clone()
            .expect("source_sha256 is always Some here");

        let artifact = ImageArtifact {
            source_path: source_path.to_path_buf(),
            output_path,
            source_provenance: SourceProvenance::BuiltInImagegen,
            source_sha256,
            output_sha256,
            metadata: ImageMetadata {
                width: dimensions.0,
                height: dimensions.1,
                mode: "RGBA".to_string(),
                format: "PNG".to_string(),
            },
        };
        validate_image_artifact(&artifact, runtime_home, workspace_dir)?;
        Ok(artifact)
    }
}

pub async fn ingest_next_imagegen_artifact(
    runtime_home: &Path,
    workspace_dir: &Path,
    timeout_ms: u64,
) -> AppResult<ImageArtifact> {
    // Baseline existing files so we don't reingest a previous row's artifact.
    let baseline: HashSet<PathBuf> = collect_all_imagegen_files(runtime_home)?;

    let started = tokio::time::Instant::now();
    let timeout = tokio::time::Duration::from_millis(timeout_ms);
    loop {
        if let Some(path) = newest_imagegen_file_excluding(runtime_home, &baseline)? {
            return ImagegenIngester::ingest_single_file(&path, runtime_home, workspace_dir);
        }
        if started.elapsed() >= timeout {
            return Err(AppError::CommandFailed(
                "ingest imagegen artifact".to_string(),
                "timed out waiting for ig_*.png under generated_images".to_string(),
            ));
        }
        sleep(Duration::from_millis(250)).await;
    }
}

/// Collect all currently-present imagegen file paths under `generated_images/`.
fn collect_all_imagegen_files(runtime_home: &Path) -> AppResult<HashSet<PathBuf>> {
    let generated_images = runtime_home.join("generated_images");
    if !generated_images.exists() {
        return Ok(HashSet::new());
    }
    let mut result = HashSet::new();
    let mut stack = vec![generated_images];
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            let metadata = entry.metadata()?;
            if metadata.is_dir() {
                stack.push(path);
            } else if ImagegenIngester::is_imagegen_file(&path) {
                result.insert(path);
            }
        }
    }
    Ok(result)
}

/// Newest imagegen file under `runtime_home/generated_images/`, skipping
/// paths in `exclude` so we don't re-ingest a previous row's artifact.
fn newest_imagegen_file_excluding(
    runtime_home: &Path,
    exclude: &HashSet<PathBuf>,
) -> AppResult<Option<PathBuf>> {
    let generated_images = runtime_home.join("generated_images");
    if !generated_images.exists() {
        return Ok(None);
    }

    let mut newest: Option<(std::time::SystemTime, PathBuf)> = None;
    let mut stack = vec![generated_images];
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            let metadata = entry.metadata()?;
            if metadata.is_dir() {
                stack.push(path);
            } else if ImagegenIngester::is_imagegen_file(&path) && !exclude.contains(&path) {
                let modified = metadata
                    .modified()
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                if newest
                    .as_ref()
                    .is_none_or(|(previous, _)| modified > *previous)
                {
                    newest = Some((modified, path));
                }
            }
        }
    }
    Ok(newest.map(|(_, path)| path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::ImageBuffer;
    use image::Rgba;
    use tempfile::tempdir;

    #[test]
    fn is_imagegen_file_accepts_valid_pattern() {
        let path = PathBuf::from("/tmp/generated_images/ig_001.png");
        assert!(ImagegenIngester::is_imagegen_file(&path));
    }

    #[test]
    fn is_imagegen_file_rejects_non_ig_prefix() {
        let path = PathBuf::from("/tmp/generated_images/other.png");
        assert!(!ImagegenIngester::is_imagegen_file(&path));
    }

    #[test]
    fn is_imagegen_file_rejects_non_png() {
        let path = PathBuf::from("/tmp/generated_images/ig_001.jpg");
        assert!(!ImagegenIngester::is_imagegen_file(&path));
    }

    #[test]
    fn ingest_single_file_rejects_workspace_source() {
        let root = tempdir().expect("tempdir");
        let runtime_home = root.path().join("runtime_home");
        let workspace = root.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("create workspace");

        let source_path = workspace.join("ig_001.png");
        std::fs::write(&source_path, b"fake png").expect("write");

        let result = ImagegenIngester::ingest_single_file(&source_path, &runtime_home, &workspace);
        assert!(matches!(result, Err(AppError::InvalidPetAsset { .. })));
    }

    #[test]
    fn ingest_single_file_successfully_ingests_valid_imagegen_file() {
        let root = tempdir().expect("tempdir");
        let runtime_home = root.path().join("runtime_home");
        let generated_images = runtime_home.join("generated_images");
        std::fs::create_dir_all(&generated_images).expect("create dir");

        let workspace = root.path().join("workspace");
        std::fs::create_dir_all(&workspace).expect("create workspace");

        let source_path = generated_images.join("ig_001.png");
        let image: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_pixel(64, 64, Rgba([255, 255, 255, 255]));
        image.save(&source_path).expect("save png");

        let result = ImagegenIngester::ingest_single_file(&source_path, &runtime_home, &workspace);
        assert!(result.is_ok());

        let artifact = result.unwrap();
        assert_eq!(artifact.source_path, source_path);
        assert!(artifact.output_path.starts_with(&workspace));
        assert!(artifact
            .output_path
            .starts_with(workspace.join("artifacts")));
        assert_eq!(artifact.metadata.width, 64);
        assert_eq!(artifact.metadata.height, 64);
        assert_eq!(
            artifact.source_provenance,
            SourceProvenance::BuiltInImagegen
        );
    }
}
