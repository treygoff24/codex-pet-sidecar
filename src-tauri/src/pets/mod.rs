pub mod installed_pet;

use crate::error::{read_to_string, AppError, AppResult};
pub use installed_pet::{InstalledPet, PetManifest};
use std::path::{Path, PathBuf};

const SPRITESHEET_WIDTH: u32 = 1536;
const SPRITESHEET_HEIGHT: u32 = 1872;

pub fn discover_installed_pets(codex_home: &Path) -> AppResult<Vec<InstalledPet>> {
    let pets_dir = codex_home.join("pets");
    if !pets_dir.exists() {
        return Ok(Vec::new());
    }

    let mut pets = Vec::new();
    for entry in std::fs::read_dir(&pets_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        if let Some(pet) = read_pet_dir(&entry.path())? {
            pets.push(pet);
        }
    }
    pets.sort_by(|left, right| left.display_name.cmp(&right.display_name));
    Ok(pets)
}

fn read_pet_dir(dir: &Path) -> AppResult<Option<InstalledPet>> {
    let metadata_path = dir.join("pet.json");
    if !metadata_path.exists() {
        return Ok(None);
    }

    let content = read_to_string(&metadata_path)?;
    let manifest: PetManifest =
        serde_json::from_str(&content).map_err(|error| AppError::InvalidPetMetadata {
            path: metadata_path.clone(),
            reason: error.to_string(),
        })?;
    let id = manifest.id.unwrap_or_else(|| {
        dir.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("pet")
            .to_string()
    });
    let display_name = manifest.display_name.unwrap_or_else(|| id.clone());
    let spritesheet_path = resolve_spritesheet_path(dir, manifest.spritesheet_path.as_deref());
    let mut diagnostics = Vec::new();

    if let Err(error) = validate_spritesheet_dimensions(&spritesheet_path) {
        diagnostics.push(error.to_string());
        return Ok(None);
    }

    Ok(Some(InstalledPet {
        id,
        display_name,
        description: manifest.description,
        spritesheet_path,
        metadata_path,
        diagnostics,
    }))
}

fn resolve_spritesheet_path(dir: &Path, manifest_path: Option<&str>) -> PathBuf {
    let path = manifest_path.unwrap_or("spritesheet.webp");
    let candidate = PathBuf::from(path);
    if candidate.is_absolute() {
        candidate
    } else {
        dir.join(candidate)
    }
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

    #[test]
    fn skips_missing_spritesheet() {
        let dir = tempdir().expect("tempdir");
        let pet_dir = dir.path().join("pets").join("bad");
        std::fs::create_dir_all(&pet_dir).expect("pet dir");
        std::fs::write(
            pet_dir.join("pet.json"),
            r#"{"id":"bad","displayName":"Bad"}"#,
        )
        .expect("manifest");
        let pets = discover_installed_pets(dir.path()).expect("discover");
        assert!(pets.is_empty());
    }

    #[test]
    fn requires_exact_spritesheet_dimensions() {
        let dir = tempdir().expect("tempdir");
        let pet_dir = dir.path().join("pets").join("bad-size");
        std::fs::create_dir_all(&pet_dir).expect("pet dir");
        write_webp(&pet_dir.join("spritesheet.webp"), 64, 64);
        std::fs::write(
            pet_dir.join("pet.json"),
            r#"{"id":"bad-size","displayName":"Bad Size"}"#,
        )
        .expect("manifest");
        let pets = discover_installed_pets(dir.path()).expect("discover");
        assert!(pets.is_empty());
    }

    #[test]
    fn discovers_valid_pet() {
        let dir = tempdir().expect("tempdir");
        let pet_dir = dir.path().join("pets").join("olive");
        std::fs::create_dir_all(&pet_dir).expect("pet dir");
        write_webp(&pet_dir.join("spritesheet.webp"), 1536, 1872);
        std::fs::write(
            pet_dir.join("pet.json"),
            r#"{"id":"olive","displayName":"Olive","description":"tiny"}"#,
        )
        .expect("manifest");
        let pets = discover_installed_pets(dir.path()).expect("discover");
        assert_eq!(pets[0].display_name, "Olive");
    }
}
