pub mod installed_pet;

use crate::error::{read_to_string, AppError, AppResult};
pub use installed_pet::{InstalledPet, PetManifest};
use std::path::{Component, Path, PathBuf};

#[cfg(unix)]
use std::os::unix::fs::MetadataExt;

const SPRITESHEET_WIDTH: u32 = 1536;
const SPRITESHEET_HEIGHT: u32 = 1872;
const MAX_PET_ID_LEN: usize = 64;

pub fn validate_pet_id(id: &str) -> AppResult<()> {
    let valid = !id.is_empty()
        && id.len() <= MAX_PET_ID_LEN
        && id.chars().all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
        })
        && id
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_lowercase() || character.is_ascii_digit());
    if valid {
        return Ok(());
    }
    Err(AppError::InvalidPetMetadata {
        path: PathBuf::from(id),
        reason: "pet id must match ^[a-z0-9][a-z0-9-]{0,63}$".to_string(),
    })
}

#[cfg(test)]
pub fn discover_installed_pets(codex_home: &Path) -> AppResult<Vec<InstalledPet>> {
    let pets_dir = codex_home.join("pets");
    discover_pets_in_dir(&pets_dir)
}

#[cfg(test)]
fn discover_pets_in_dir(pets_dir: &Path) -> AppResult<Vec<InstalledPet>> {
    if !pets_dir.exists() {
        return Ok(Vec::new());
    }

    let mut pets = Vec::new();
    for entry in std::fs::read_dir(pets_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        match read_pet_dir(&entry.path()) {
            Ok(Some(pet)) => pets.push(pet),
            Ok(None) => {}
            Err(AppError::InvalidPetAsset { .. } | AppError::InvalidPetMetadata { .. }) => {}
            Err(error) => return Err(error),
        }
    }
    pets.sort_by(|left, right| left.display_name.cmp(&right.display_name));
    Ok(pets)
}

pub fn read_pet_dir(dir: &Path) -> AppResult<Option<InstalledPet>> {
    let manifest_path = dir.join("pet.json");
    if !manifest_path.exists() {
        return Ok(None);
    }
    validate_manifest_file(dir, &manifest_path)?;
    let manifest = read_manifest(&manifest_path)?;
    let id = manifest.id.unwrap_or_else(|| {
        dir.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("pet")
            .to_string()
    });
    validate_pet_id(&id)?;
    let display_name = manifest.display_name.unwrap_or_else(|| id.clone());
    let spritesheet_path = secure_package_path(
        dir,
        manifest
            .spritesheet_path
            .as_deref()
            .unwrap_or("spritesheet.webp"),
    )?;
    validate_regular_private_file(&spritesheet_path)?;
    validate_spritesheet_dimensions(&spritesheet_path)?;

    Ok(Some(InstalledPet {
        id,
        display_name,
        description: manifest.description,
        spritesheet_path,
        metadata_path: manifest_path,
        diagnostics: Vec::new(),
    }))
}

pub fn validate_pet_package(dir: &Path) -> AppResult<InstalledPet> {
    read_pet_dir(dir)?.ok_or_else(|| AppError::InvalidPetMetadata {
        path: dir.join("pet.json"),
        reason: "pet.json is missing".to_string(),
    })
}

fn read_manifest(path: &Path) -> AppResult<PetManifest> {
    serde_json::from_str(&read_to_string(path)?).map_err(|error| AppError::InvalidPetMetadata {
        path: path.to_path_buf(),
        reason: error.to_string(),
    })
}

fn validate_manifest_file(dir: &Path, manifest_path: &Path) -> AppResult<()> {
    let canonical_dir = dir.canonicalize()?;
    let canonical_manifest = manifest_path.canonicalize()?;
    if !canonical_manifest.starts_with(&canonical_dir) {
        return Err(AppError::InvalidPetMetadata {
            path: manifest_path.to_path_buf(),
            reason: "manifest resolves outside its pet directory".to_string(),
        });
    }
    validate_regular_private_file(manifest_path)
}

fn secure_package_path(dir: &Path, manifest_path: &str) -> AppResult<PathBuf> {
    let raw = Path::new(manifest_path);
    if raw.is_absolute() {
        return Err(AppError::InvalidPetAsset {
            path: raw.to_path_buf(),
            reason: "asset paths must be package-relative".to_string(),
        });
    }
    if raw.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(AppError::InvalidPetAsset {
            path: raw.to_path_buf(),
            reason: "asset path traversal is not allowed".to_string(),
        });
    }
    let candidate = dir.join(raw);
    let canonical_dir = dir.canonicalize()?;
    let canonical_candidate = candidate.canonicalize().map_err(|source| {
        if source.kind() == std::io::ErrorKind::NotFound {
            AppError::InvalidPetAsset {
                path: candidate.clone(),
                reason: "spritesheet.webp is missing".to_string(),
            }
        } else {
            AppError::IoWithPath {
                path: candidate.clone(),
                source,
            }
        }
    })?;
    if !canonical_candidate.starts_with(canonical_dir) {
        return Err(AppError::InvalidPetAsset {
            path: candidate,
            reason: "asset resolves outside its pet directory".to_string(),
        });
    }
    Ok(canonical_candidate)
}

pub(crate) fn validate_regular_private_file(path: &Path) -> AppResult<()> {
    let metadata = std::fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(AppError::InvalidPetAsset {
            path: path.to_path_buf(),
            reason: "expected a regular file".to_string(),
        });
    }
    #[cfg(unix)]
    if metadata.nlink() > 1 {
        return Err(AppError::InvalidPetAsset {
            path: path.to_path_buf(),
            reason: "hard-linked pet assets are not allowed".to_string(),
        });
    }
    Ok(())
}

pub fn validate_spritesheet_dimensions(path: &Path) -> AppResult<()> {
    if !path.exists() {
        return Err(AppError::InvalidPetAsset {
            path: path.to_path_buf(),
            reason: "spritesheet.webp is missing".to_string(),
        });
    }
    let dimensions = image::image_dimensions(path).map_err(|error| AppError::InvalidPetAsset {
        path: path.to_path_buf(),
        reason: error.to_string(),
    })?;
    if dimensions != (SPRITESHEET_WIDTH, SPRITESHEET_HEIGHT) {
        return Err(AppError::InvalidPetAsset {
            path: path.to_path_buf(),
            reason: format!(
                "expected {SPRITESHEET_WIDTH}x{SPRITESHEET_HEIGHT}, got {}x{}",
                dimensions.0, dimensions.1
            ),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};
    use tempfile::tempdir;

    fn write_webp(path: &Path, width: u32, height: u32) {
        let image: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_pixel(width, height, Rgba([0, 0, 0, 0]));
        image.save(path).expect("webp writes");
    }

    fn write_manifest(dir: &Path, manifest: &str) {
        std::fs::create_dir_all(dir).expect("pet dir");
        std::fs::write(dir.join("pet.json"), manifest).expect("manifest");
    }

    #[test]
    fn skips_missing_spritesheet() {
        let dir = tempdir().expect("tempdir");
        let pet_dir = dir.path().join("pets").join("bad");
        write_manifest(&pet_dir, r#"{"id":"bad","displayName":"Bad"}"#);
        let pets = discover_installed_pets(dir.path()).expect("discover");
        assert!(pets.is_empty());
    }

    #[test]
    fn requires_exact_spritesheet_dimensions() {
        let dir = tempdir().expect("tempdir");
        let pet_dir = dir.path().join("pets").join("bad-size");
        std::fs::create_dir_all(&pet_dir).expect("pet dir");
        write_webp(&pet_dir.join("spritesheet.webp"), 64, 64);
        write_manifest(&pet_dir, r#"{"id":"bad-size","displayName":"Bad Size"}"#);
        let pets = discover_installed_pets(dir.path()).expect("discover");
        assert!(pets.is_empty());
    }

    #[test]
    fn discovers_valid_pet() {
        let dir = tempdir().expect("tempdir");
        let pet_dir = dir.path().join("pets").join("olive");
        std::fs::create_dir_all(&pet_dir).expect("pet dir");
        write_webp(&pet_dir.join("spritesheet.webp"), 1536, 1872);
        write_manifest(
            &pet_dir,
            r#"{"id":"olive","displayName":"Olive","description":"tiny"}"#,
        );
        let pets = discover_installed_pets(dir.path()).expect("discover");
        assert_eq!(pets[0].display_name, "Olive");
    }

    #[test]
    fn rejects_absolute_spritesheet_path() {
        let dir = tempdir().expect("tempdir");
        let pet_dir = dir.path().join("pet");
        write_manifest(
            &pet_dir,
            r#"{"id":"bad","spritesheetPath":"/tmp/spritesheet.webp"}"#,
        );
        let error = validate_pet_package(&pet_dir).expect_err("reject absolute");
        assert!(matches!(error, AppError::InvalidPetAsset { .. }));
    }

    #[test]
    fn rejects_traversal_spritesheet_path() {
        let dir = tempdir().expect("tempdir");
        let pet_dir = dir.path().join("pet");
        write_manifest(
            &pet_dir,
            r#"{"id":"bad","spritesheetPath":"../spritesheet.webp"}"#,
        );
        let error = validate_pet_package(&pet_dir).expect_err("reject traversal");
        assert!(matches!(error, AppError::InvalidPetAsset { .. }));
    }

    #[test]
    fn rejects_invalid_pet_ids() {
        for id in ["..", "../escape", "BadName", "-bad", "bad/name"] {
            assert!(validate_pet_id(id).is_err(), "{id} should be rejected");
        }
        assert!(validate_pet_id("olive-2").is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        let dir = tempdir().expect("tempdir");
        let outside = dir.path().join("outside.webp");
        write_webp(&outside, 1536, 1872);
        let pet_dir = dir.path().join("pet");
        std::fs::create_dir_all(&pet_dir).expect("pet dir");
        std::os::unix::fs::symlink(&outside, pet_dir.join("spritesheet.webp")).expect("symlink");
        write_manifest(
            &pet_dir,
            r#"{"id":"bad","spritesheetPath":"spritesheet.webp"}"#,
        );
        let error = validate_pet_package(&pet_dir).expect_err("reject symlink escape");
        assert!(matches!(error, AppError::InvalidPetAsset { .. }));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_hard_linked_spritesheet() {
        let dir = tempdir().expect("tempdir");
        let original = dir.path().join("original.webp");
        write_webp(&original, 1536, 1872);
        let pet_dir = dir.path().join("pet");
        std::fs::create_dir_all(&pet_dir).expect("pet dir");
        std::fs::hard_link(&original, pet_dir.join("spritesheet.webp")).expect("hard link");
        write_manifest(
            &pet_dir,
            r#"{"id":"bad","spritesheetPath":"spritesheet.webp"}"#,
        );
        let error = validate_pet_package(&pet_dir).expect_err("reject hard link");
        assert!(matches!(error, AppError::InvalidPetAsset { .. }));
    }
}
