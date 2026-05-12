//! Atlas operations: mirroring, composition, validation, and packaging.
//!
//! This module ports the Python toolchain for atlas operations to Rust:
//! - `derive_running_left_from_running_right.py` → `mirror_horizontally`
//! - `compose_atlas.py` → `compose_atlas`
//! - `validate_atlas.py` → `validate_atlas`
//! - packaging is delegated to the Python/PyInstaller sidecar

use crate::error::{AppError, AppResult};
use crate::hatching::session::{ImageArtifact, ImageMetadata, MirrorDecision};
use image::{GenericImageView, RgbaImage};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use time::OffsetDateTime;

// Atlas constants from spec
pub const COLUMNS: u32 = 8;
pub const ROWS: u32 = 9;
pub const CELL_WIDTH: u32 = 192;
pub const CELL_HEIGHT: u32 = 208;
pub const ATLAS_WIDTH: u32 = COLUMNS * CELL_WIDTH;
pub const ATLAS_HEIGHT: u32 = ROWS * CELL_HEIGHT;

/// Row specifications: (name, row_index, frame_count)
pub const ROW_SPECS: [(&str, u32, u32); 9] = [
    ("idle", 0, 6),
    ("running-right", 1, 8),
    ("running-left", 2, 8),
    ("waving", 3, 4),
    ("jumping", 4, 5),
    ("failed", 5, 8),
    ("waiting", 6, 6),
    ("running", 7, 6),
    ("review", 8, 6),
];

/// Compute SHA-256 hash of a file.
pub fn file_sha256(path: &Path) -> AppResult<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];

    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

/// Get image metadata (width, height, mode, format).
pub fn image_metadata(path: &Path) -> AppResult<ImageMetadata> {
    let img = image::open(path)?;
    Ok(ImageMetadata {
        width: img.width(),
        height: img.height(),
        mode: "RGBA".to_string(),
        format: path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("unknown")
            .to_uppercase(),
    })
}

/// Mirror an image horizontally.
///
pub fn mirror_horizontally(source_path: &Path, output_path: &Path) -> AppResult<()> {
    let img = image::open(source_path)?;
    let rgba = img.to_rgba8();
    let mirrored = image::imageops::flip_horizontal(&rgba);
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    mirrored.save(output_path)?;
    Ok(())
}

/// Derive running-left from running-right with provenance tracking.
pub fn derive_running_left(
    source_path: &Path,
    output_path: &Path,
    decision_note: &str,
) -> AppResult<(ImageArtifact, MirrorDecision)> {
    if !source_path.exists() {
        return Err(AppError::IoWithPath {
            path: source_path.to_path_buf(),
            source: std::io::Error::new(std::io::ErrorKind::NotFound, "source image not found"),
        });
    }

    if output_path.exists() {
        return Err(AppError::IoWithPath {
            path: output_path.to_path_buf(),
            source: std::io::Error::new(std::io::ErrorKind::AlreadyExists, "output already exists"),
        });
    }

    mirror_horizontally(source_path, output_path)?;
    let source_sha256 = Some(file_sha256(source_path)?);
    let output_sha256 = file_sha256(output_path)?;
    let metadata = image_metadata(output_path)?;
    let mirror_decision = MirrorDecision {
        approved: true,
        reason: decision_note.to_string(),
        decided_at: OffsetDateTime::now_utc(),
    };
    let artifact = ImageArtifact {
        source_path: source_path.to_path_buf(),
        output_path: output_path.to_path_buf(),
        source_provenance: crate::hatching::session::SourceProvenance::DeterministicMirror,
        source_sha256,
        output_sha256,
        metadata,
    };

    Ok((artifact, mirror_decision))
}

/// Validation result for atlas.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtlasValidationResult {
    pub ok: bool,
    pub file: String,
    pub format: String,
    pub mode: String,
    pub width: u32,
    pub height: u32,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub cells: Vec<CellInfo>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CellInfo {
    pub state: String,
    pub row: u32,
    pub column: u32,
    pub used: bool,
    pub nontransparent_pixels: u32,
}

/// Count non-transparent pixels in an RGBA image.
fn alpha_nonzero_count(img: &RgbaImage) -> u32 {
    img.pixels().filter(|p| p[3] != 0).count() as u32
}

/// Validate an atlas against the Codex pet specification.
///
pub fn validate_atlas(
    atlas_path: &Path,
    min_used_pixels: u32,
    near_opaque_threshold: f32,
    allow_opaque: bool,
    allow_near_opaque_used_cells: bool,
) -> AppResult<AtlasValidationResult> {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut cells = Vec::new();
    let mut near_opaque_used_cells: HashMap<String, Vec<u32>> = HashMap::new();
    let img = image::open(atlas_path)?;
    let rgba = img.to_rgba8();
    let source_format = atlas_path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("unknown")
        .to_uppercase();
    if rgba.width() != ATLAS_WIDTH || rgba.height() != ATLAS_HEIGHT {
        errors.push(format!(
            "expected {}x{}, got {}x{}",
            ATLAS_WIDTH,
            ATLAS_HEIGHT,
            rgba.width(),
            rgba.height()
        ));
        // Return early if dimensions don't match to avoid out-of-bounds access
        return Ok(AtlasValidationResult {
            ok: false,
            file: atlas_path.display().to_string(),
            format: source_format,
            mode: "RGBA".to_string(),
            width: rgba.width(),
            height: rgba.height(),
            errors,
            warnings,
            cells: vec![],
        });
    }
    if source_format != "PNG" && source_format != "WEBP" {
        errors.push(format!("expected PNG or WebP, got {}", source_format));
    }
    if !allow_opaque {
        let alpha_count = alpha_nonzero_count(&rgba);
        if alpha_count == ATLAS_WIDTH * ATLAS_HEIGHT {
            warnings.push(
                "atlas is fully opaque; custom pets require a transparent sprite background"
                    .to_string(),
            );
        }
    }
    let near_opaque_limit =
        ((CELL_WIDTH * CELL_HEIGHT) as f32 * near_opaque_threshold).round() as u32;
    for (state, row_index, frame_count) in ROW_SPECS {
        for column_index in 0..COLUMNS {
            let left = column_index * CELL_WIDTH;
            let top = row_index * CELL_HEIGHT;

            let cell = rgba.view(left, top, CELL_WIDTH, CELL_HEIGHT).to_image();
            let nontransparent = alpha_nonzero_count(&cell);
            let used = column_index < frame_count;

            cells.push(CellInfo {
                state: state.to_string(),
                row: row_index,
                column: column_index,
                used,
                nontransparent_pixels: nontransparent,
            });
            if used && nontransparent < min_used_pixels {
                errors.push(format!(
                    "{} row {} column {} is empty or too sparse ({} pixels)",
                    state, row_index, column_index, nontransparent
                ));
            }
            if used && nontransparent > near_opaque_limit {
                near_opaque_used_cells
                    .entry(format!("{} row {}", state, row_index))
                    .or_default()
                    .push(column_index);
            }
            if !used && nontransparent != 0 {
                errors.push(format!(
                    "{} row {} unused column {} is not transparent ({} pixels)",
                    state, row_index, column_index, nontransparent
                ));
            }
        }
    }
    for (row_label, columns) in near_opaque_used_cells {
        let message = format!(
            "{} has {} nearly opaque used cells; this usually means the sprite has a non-transparent background",
            row_label,
            columns.len()
        );
        if allow_near_opaque_used_cells {
            warnings.push(message);
        } else {
            errors.push(message);
        }
    }

    Ok(AtlasValidationResult {
        ok: errors.is_empty(),
        file: atlas_path.display().to_string(),
        format: source_format,
        mode: "RGBA".to_string(),
        width: rgba.width(),
        height: rgba.height(),
        errors,
        warnings,
        cells,
    })
}

/// Compose atlas from individual row strips.
#[allow(dead_code)]
pub fn compose_atlas_from_frames(frames_root: &Path) -> AppResult<RgbaImage> {
    let mut atlas = RgbaImage::new(ATLAS_WIDTH, ATLAS_HEIGHT);

    for (state, row_index, frame_count) in ROW_SPECS {
        let frame_paths = find_row_frames(frames_root, state, row_index);

        if frame_paths.len() < frame_count as usize {
            return Err(AppError::IoWithPath {
                path: frames_root.to_path_buf(),
                source: std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    format!(
                        "{} row needs {} frames, found {} under {:?}",
                        state,
                        frame_count,
                        frame_paths.len(),
                        frames_root
                    ),
                ),
            });
        }

        for (column_index, frame_path) in frame_paths.iter().take(frame_count as usize).enumerate()
        {
            let column_index = column_index as u32;
            let frame = image::open(frame_path)?.to_rgba8();
            paste_centered(&mut atlas, &frame, row_index, column_index)?;
        }
    }

    Ok(atlas)
}

/// Find frame files for a row in various locations.
#[allow(dead_code)]
fn find_row_frames(root: &Path, state: &str, row_index: u32) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let dir_candidates = vec![
        root.join(state),
        root.join(format!("row-{}", row_index)),
        root.join(format!("row{}", row_index)),
        root.join(format!("{}-{}", row_index, state)),
    ];

    for candidate in dir_candidates {
        if candidate.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&candidate) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if is_image_file(&path) {
                        candidates.push(path);
                    }
                }
            }
            if !candidates.is_empty() {
                candidates.sort();
                return candidates;
            }
        }
    }
    let patterns = vec![
        format!("{}_*", state),
        format!("{}-*", state),
        format!("row{}_*", row_index),
        format!("row-{}-*", row_index),
    ];

    for pattern in patterns {
        if let Ok(glob_results) = glob::glob(&root.join(pattern).to_string_lossy()) {
            for entry in glob_results.flatten() {
                if is_image_file(&entry) {
                    candidates.push(entry);
                }
            }
        }
    }

    candidates.sort();
    candidates.dedup();
    candidates
}

/// Check if a file is an image based on extension.
#[allow(dead_code)]
fn is_image_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext.to_lowercase().as_str(), "png" | "webp" | "jpg" | "jpeg"))
        .unwrap_or(false)
}

/// Paste a frame centered in a cell.
#[allow(dead_code)]
fn paste_centered(
    atlas: &mut RgbaImage,
    frame: &RgbaImage,
    row: u32,
    column: u32,
) -> AppResult<()> {
    let mut frame = frame.clone();
    if frame.width() != CELL_WIDTH || frame.height() != CELL_HEIGHT {
        frame = image::imageops::resize(
            &frame,
            CELL_WIDTH,
            CELL_HEIGHT,
            image::imageops::FilterType::Lanczos3,
        );
    }

    let left = column * CELL_WIDTH;
    let top = row * CELL_HEIGHT;
    for y in 0..CELL_HEIGHT {
        for x in 0..CELL_WIDTH {
            let atlas_x = left + x;
            let atlas_y = top + y;
            if atlas_x < atlas.width() && atlas_y < atlas.height() {
                let frame_pixel = frame.get_pixel(x, y);
                if frame_pixel[3] > 0 {
                    atlas.put_pixel(atlas_x, atlas_y, *frame_pixel);
                }
            }
        }
    }

    Ok(())
}

/// Save atlas as PNG.
#[allow(dead_code)]
pub fn save_atlas_outputs(
    atlas: &RgbaImage,
    output_path: &Path,
    _webp_output_path: Option<&Path>,
) -> AppResult<()> {
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    atlas.save(output_path)?;

    Ok(())
}

/// Package a validated atlas as a pet.
///
#[allow(dead_code)]
pub fn package_pet(
    _pet_id: &str,
    _display_name: &str,
    _description: &str,
    spritesheet_path: &Path,
    output_dir: &Path,
    force: bool,
) -> AppResult<PathBuf> {
    let img = image::open(spritesheet_path)?;
    if img.width() != ATLAS_WIDTH || img.height() != ATLAS_HEIGHT {
        return Err(AppError::InvalidPetMetadata {
            path: spritesheet_path.to_path_buf(),
            reason: format!(
                "expected {}x{}, got {}x{}",
                ATLAS_WIDTH,
                ATLAS_HEIGHT,
                img.width(),
                img.height()
            ),
        });
    }

    let format = spritesheet_path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("unknown")
        .to_uppercase();

    if format != "PNG" && format != "WEBP" {
        return Err(AppError::InvalidPetMetadata {
            path: spritesheet_path.to_path_buf(),
            reason: format!("expected PNG or WebP, got {}", format),
        });
    }

    std::fs::create_dir_all(output_dir)?;

    let target_sheet = output_dir.join("spritesheet.webp");
    let manifest_path = output_dir.join("pet.json");

    if !force && (target_sheet.exists() || manifest_path.exists()) {
        return Err(AppError::IoWithPath {
            path: output_dir.to_path_buf(),
            source: std::io::Error::new(
                std::io::ErrorKind::AlreadyExists,
                "output directory already contains pet files",
            ),
        });
    }

    Err(AppError::CommandFailed(
        "package_pet".to_string(),
        "Rust packaging no longer writes WebP; use the pet-hatching sidecar".to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;
    use tempfile::tempdir;

    #[test]
    fn test_atlas_constants() {
        assert_eq!(COLUMNS, 8);
        assert_eq!(ROWS, 9);
        assert_eq!(CELL_WIDTH, 192);
        assert_eq!(CELL_HEIGHT, 208);
        assert_eq!(ATLAS_WIDTH, 1536);
        assert_eq!(ATLAS_HEIGHT, 1872);
    }

    #[test]
    fn test_file_sha256() {
        let temp_dir = tempdir().unwrap();
        let test_file = temp_dir.path().join("test.png");

        let img = RgbaImage::new(10, 10);
        img.save(&test_file).unwrap();

        let hash = file_sha256(&test_file).unwrap();
        assert_eq!(hash.len(), 64); // SHA-256 hex string
    }

    #[test]
    fn test_mirror_horizontally() {
        let temp_dir = tempdir().unwrap();
        let source = temp_dir.path().join("source.png");
        let output = temp_dir.path().join("output.png");

        let mut img = RgbaImage::new(10, 10);
        for x in 0..5 {
            img.put_pixel(x, 0, Rgba([255, 0, 0, 255]));
        }
        img.save(&source).unwrap();

        mirror_horizontally(&source, &output).unwrap();
        assert!(output.exists());

        let mirrored = image::open(&output).unwrap();
        assert_eq!(mirrored.width(), 10);
        assert_eq!(mirrored.height(), 10);
    }

    #[test]
    fn test_derive_running_left() {
        let temp_dir = tempdir().unwrap();
        let source = temp_dir.path().join("running-right.png");
        let output = temp_dir.path().join("running-left.png");

        let img = RgbaImage::new(192, 208);
        img.save(&source).unwrap();

        let (artifact, decision) = derive_running_left(&source, &output, "test decision").unwrap();

        assert_eq!(artifact.source_path, source);
        assert_eq!(artifact.output_path, output);
        assert!(matches!(
            artifact.source_provenance,
            crate::hatching::session::SourceProvenance::DeterministicMirror
        ));
        assert!(decision.approved);
        assert_eq!(decision.reason, "test decision");
    }

    #[test]
    fn test_validate_atlas_dimensions() {
        let temp_dir = tempdir().unwrap();
        let atlas_path = temp_dir.path().join("atlas.png");

        let img = RgbaImage::new(100, 100);
        img.save(&atlas_path).unwrap();

        let result = validate_atlas(&atlas_path, 50, 0.95, false, false).unwrap();
        assert!(!result.ok);
        assert!(!result.errors.is_empty());
    }

    #[test]
    fn test_validate_atlas_correct_dimensions() {
        let temp_dir = tempdir().unwrap();
        let atlas_path = temp_dir.path().join("atlas.png");

        let img = RgbaImage::new(ATLAS_WIDTH, ATLAS_HEIGHT);
        img.save(&atlas_path).unwrap();

        let result = validate_atlas(&atlas_path, 50, 0.95, false, false).unwrap();
        assert!(!result.ok);
    }

    fn write_validation_atlas(path: &Path, opaque_first_cell: bool) {
        let mut atlas = RgbaImage::new(ATLAS_WIDTH, ATLAS_HEIGHT);
        for (_state, row_index, frame_count) in ROW_SPECS {
            for column_index in 0..frame_count {
                let left = column_index * CELL_WIDTH;
                let top = row_index * CELL_HEIGHT;
                if opaque_first_cell && row_index == 0 && column_index == 0 {
                    for y in top..top + CELL_HEIGHT {
                        for x in left..left + CELL_WIDTH {
                            atlas.put_pixel(x, y, Rgba([40, 80, 120, 255]));
                        }
                    }
                } else {
                    for i in 0..80 {
                        atlas.put_pixel(
                            left + 8 + (i % 10),
                            top + 8 + (i / 10),
                            Rgba([40, 80, 120, 255]),
                        );
                    }
                }
            }
        }
        atlas.save(path).unwrap();
    }

    #[test]
    fn atlas_near_opaque_sparse_used_cells_pass() {
        let temp_dir = tempdir().unwrap();
        let atlas_path = temp_dir.path().join("atlas.png");
        write_validation_atlas(&atlas_path, false);

        let result = validate_atlas(&atlas_path, 50, 0.95, false, false).unwrap();

        assert!(result.ok, "{:?}", result.errors);
    }

    #[test]
    fn atlas_near_opaque_full_used_cell_fails_without_allowance() {
        let temp_dir = tempdir().unwrap();
        let atlas_path = temp_dir.path().join("atlas.png");
        write_validation_atlas(&atlas_path, true);

        let result = validate_atlas(&atlas_path, 50, 0.95, false, false).unwrap();

        assert!(!result.ok);
        assert!(result
            .errors
            .iter()
            .any(|error| error.contains("nearly opaque")));
    }

    #[test]
    fn atlas_near_opaque_full_used_cell_warns_when_allowed() {
        let temp_dir = tempdir().unwrap();
        let atlas_path = temp_dir.path().join("atlas.png");
        write_validation_atlas(&atlas_path, true);

        let result = validate_atlas(&atlas_path, 50, 0.95, false, true).unwrap();

        assert!(result.ok, "{:?}", result.errors);
        assert!(result
            .warnings
            .iter()
            .any(|warning| warning.contains("nearly opaque")));
    }

    #[test]
    fn test_is_image_file() {
        assert!(is_image_file(Path::new("test.png")));
        assert!(is_image_file(Path::new("test.webp")));
        assert!(is_image_file(Path::new("test.jpg")));
        assert!(is_image_file(Path::new("test.jpeg")));
        assert!(!is_image_file(Path::new("test.txt")));
        assert!(!is_image_file(Path::new("test")));
    }

    #[test]
    fn test_save_atlas_outputs() {
        let temp_dir = tempdir().unwrap();
        let output = temp_dir.path().join("atlas.png");
        let webp_output = temp_dir.path().join("atlas.webp");

        let atlas = RgbaImage::new(ATLAS_WIDTH, ATLAS_HEIGHT);

        save_atlas_outputs(&atlas, &output, Some(&webp_output)).unwrap();

        assert!(output.exists());
        assert!(!webp_output.exists());
    }
}
