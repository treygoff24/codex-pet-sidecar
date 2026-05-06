use crate::error::{read_to_string, AppError, AppResult};
use crate::pets::{
    read_pet_dir, validate_pet_id, validate_pet_package, validate_regular_private_file,
    InstalledPet,
};
use crate::state::config::{default_pet_config, load_pet_config, save_pet_config, PetConfig};
use crate::state::paths::AppPaths;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

pub const MAX_PETS: usize = 20;
pub const BUNDLED_DEFAULT_PET_ID: &str = "olive";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PetLibrary {
    pub active_pet_id: Option<String>,
    pub pets: Vec<PetLibraryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PetLibraryEntry {
    pub pet_id: String,
    pub display_name: String,
    pub source: PetSource,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PetSource {
    Bundled { bundled_id: String },
    UserCreated { created_by: String },
    Imported { original_path: Option<String> },
    Migrated { migration_id: String },
}

pub fn library_path(paths: &AppPaths) -> PathBuf {
    paths.app_support.join("library.json")
}

pub fn load_library(paths: &AppPaths) -> AppResult<Option<PetLibrary>> {
    let path = library_path(paths);
    if !path.exists() {
        return Ok(None);
    }
    let library: PetLibrary = serde_json::from_str(&read_to_string(&path)?)?;
    validate_library(&library)?;
    Ok(Some(library))
}

pub fn save_library(paths: &AppPaths, library: &PetLibrary) -> AppResult<()> {
    validate_library(library)?;
    std::fs::create_dir_all(&paths.app_support)?;
    std::fs::write(library_path(paths), serde_json::to_string_pretty(library)?)?;
    Ok(())
}

pub fn load_active_pet_config(paths: &AppPaths) -> AppResult<Option<PetConfig>> {
    let Some(library) = load_library(paths)? else {
        return Ok(None);
    };
    let Some(active_id) = library.active_pet_id else {
        return Ok(None);
    };
    load_pet_config(paths, &active_id)
}

pub fn set_active_pet(paths: &AppPaths, pet_id: &str) -> AppResult<PetLibrary> {
    validate_pet_id(pet_id)?;
    let mut library = ensure_library(paths)?;
    if !library.pets.iter().any(|pet| pet.pet_id == pet_id) {
        return Err(AppError::PetNotFound(pet_id.to_string()));
    }
    library.active_pet_id = Some(pet_id.to_string());
    save_library(paths, &library)?;
    Ok(library)
}

pub fn ensure_library(paths: &AppPaths) -> AppResult<PetLibrary> {
    if let Some(library) = load_library(paths)? {
        return Ok(library);
    }
    let legacy = migrate_legacy_if_present(paths)?;
    if let Some(library) = legacy {
        return Ok(library);
    }
    import_bundled_olive(paths)
}

pub fn discover_library_pets(paths: &AppPaths) -> AppResult<Vec<InstalledPet>> {
    let library = ensure_library(paths)?;
    let mut pets = Vec::new();
    for entry in library.pets {
        validate_pet_id(&entry.pet_id)?;
        if let Some(pet) = read_pet_dir(&paths.pet_support_dir(&entry.pet_id))? {
            pets.push(pet);
        }
    }
    pets.sort_by(|left, right| left.display_name.cmp(&right.display_name));
    Ok(pets)
}

pub fn import_staged_pet(paths: &AppPaths, source_dir: &Path) -> AppResult<PetLibrary> {
    let mut library = ensure_library(paths)?;
    if library.pets.len() >= MAX_PETS {
        return Err(AppError::PetLimitReached(MAX_PETS));
    }
    let staged = validate_pet_package(source_dir)?;
    validate_pet_id(&staged.id)?;
    if library.pets.iter().any(|pet| pet.pet_id == staged.id) {
        return Err(AppError::PetAlreadyExists(staged.id));
    }
    let target = copy_pet_package(source_dir, paths, &staged.id)?;
    let persona = read_optional_string(&target.join("personality.md"))?
        .unwrap_or_else(default_generic_persona);
    let config = default_pet_config(
        staged.id.clone(),
        staged.display_name.clone(),
        target.join("spritesheet.webp"),
        persona,
    );
    save_pet_config(paths, &staged.id, &config)?;
    let now = now_string()?;
    library.pets.push(PetLibraryEntry {
        pet_id: staged.id,
        display_name: staged.display_name,
        source: PetSource::Imported {
            original_path: Some(source_dir.display().to_string()),
        },
        created_at: now.clone(),
        updated_at: now,
    });
    save_library(paths, &library)?;
    Ok(library)
}

fn import_bundled_olive(paths: &AppPaths) -> AppResult<PetLibrary> {
    let source = bundled_olive_dir();
    let pet = validate_pet_package(&source)?;
    let target = copy_pet_package(&source, paths, BUNDLED_DEFAULT_PET_ID)?;
    let persona = read_to_string(&target.join("personality.md"))?;
    let config = default_pet_config(
        BUNDLED_DEFAULT_PET_ID.to_string(),
        pet.display_name.clone(),
        target.join("spritesheet.webp"),
        persona,
    );
    save_pet_config(paths, BUNDLED_DEFAULT_PET_ID, &config)?;
    let now = now_string()?;
    let library = PetLibrary {
        active_pet_id: Some(BUNDLED_DEFAULT_PET_ID.to_string()),
        pets: vec![PetLibraryEntry {
            pet_id: BUNDLED_DEFAULT_PET_ID.to_string(),
            display_name: pet.display_name,
            source: PetSource::Bundled {
                bundled_id: BUNDLED_DEFAULT_PET_ID.to_string(),
            },
            created_at: now.clone(),
            updated_at: now,
        }],
    };
    save_library(paths, &library)?;
    Ok(library)
}

fn migrate_legacy_if_present(paths: &AppPaths) -> AppResult<Option<PetLibrary>> {
    let pets_dir = paths.pets_dir();
    if !pets_dir.exists() {
        return Ok(None);
    }
    let mut configs = Vec::new();
    for entry in std::fs::read_dir(&pets_dir)? {
        let entry = entry?;
        let config_path = entry.path().join("pet.config.json");
        if config_path.exists() {
            let metadata = std::fs::metadata(&config_path)?;
            let modified = metadata.modified().ok();
            let config: PetConfig = serde_json::from_str(&read_to_string(&config_path)?)?;
            if validate_pet_id(&config.pet_id).is_ok() {
                configs.push((config, modified));
            }
        }
    }
    if configs.is_empty() {
        return Ok(None);
    }
    configs.sort_by_key(|entry| std::cmp::Reverse(entry.1));
    let mut entries = Vec::new();
    let now = now_string()?;
    for (config, _) in configs.iter().take(MAX_PETS) {
        entries.push(PetLibraryEntry {
            pet_id: config.pet_id.clone(),
            display_name: config.display_name.clone(),
            source: PetSource::Migrated {
                migration_id: "library-v1".to_string(),
            },
            created_at: now.clone(),
            updated_at: now.clone(),
        });
    }
    let active_pet_id = entries.first().map(|entry| entry.pet_id.clone());
    let mut library = PetLibrary {
        active_pet_id,
        pets: entries,
    };
    if !library
        .pets
        .iter()
        .any(|pet| pet.pet_id == BUNDLED_DEFAULT_PET_ID)
        && library.pets.len() < MAX_PETS
    {
        let olive = validate_pet_package(&bundled_olive_dir())?;
        copy_pet_package(&bundled_olive_dir(), paths, BUNDLED_DEFAULT_PET_ID)?;
        let persona = read_to_string(
            &paths
                .pet_support_dir(BUNDLED_DEFAULT_PET_ID)
                .join("personality.md"),
        )?;
        let config = default_pet_config(
            BUNDLED_DEFAULT_PET_ID.to_string(),
            olive.display_name.clone(),
            paths
                .pet_support_dir(BUNDLED_DEFAULT_PET_ID)
                .join("spritesheet.webp"),
            persona,
        );
        save_pet_config(paths, BUNDLED_DEFAULT_PET_ID, &config)?;
        library.pets.push(PetLibraryEntry {
            pet_id: BUNDLED_DEFAULT_PET_ID.to_string(),
            display_name: olive.display_name,
            source: PetSource::Bundled {
                bundled_id: BUNDLED_DEFAULT_PET_ID.to_string(),
            },
            created_at: now.clone(),
            updated_at: now,
        });
    }
    save_library(paths, &library)?;
    std::fs::write(
        paths.app_support.join("migration.json"),
        serde_json::to_string_pretty(&serde_json::json!({
            "migrationId": "library-v1",
            "activePetId": library.active_pet_id,
            "legacyConfigsFound": library.pets.len(),
        }))?,
    )?;
    Ok(Some(library))
}

fn copy_pet_package(source: &Path, paths: &AppPaths, pet_id: &str) -> AppResult<PathBuf> {
    let pet = validate_pet_package(source)?;
    validate_pet_id(pet_id)?;
    let target = paths.pet_support_dir(pet_id);
    ensure_target_under_pets_dir(paths, &target)?;
    if target.exists() {
        std::fs::remove_dir_all(&target)?;
    }
    std::fs::create_dir_all(&target)?;
    std::fs::copy(source.join("pet.json"), target.join("pet.json"))?;
    std::fs::copy(pet.spritesheet_path, target.join("spritesheet.webp"))?;
    for optional in ["personality.md", "README.md"] {
        let path = source.join(optional);
        if path.exists() {
            validate_optional_package_file(source, &path)?;
            std::fs::copy(path, target.join(optional))?;
        }
    }
    Ok(target)
}

fn validate_optional_package_file(package_dir: &Path, path: &Path) -> AppResult<()> {
    let canonical_package_dir = package_dir.canonicalize()?;
    let canonical_path = path.canonicalize()?;
    if !canonical_path.starts_with(&canonical_package_dir) {
        return Err(AppError::InvalidPetAsset {
            path: path.to_path_buf(),
            reason: "optional file resolves outside its pet directory".to_string(),
        });
    }
    validate_regular_private_file(path)
}

fn ensure_target_under_pets_dir(paths: &AppPaths, target: &Path) -> AppResult<()> {
    std::fs::create_dir_all(paths.pets_dir())?;
    let canonical_pets = paths.pets_dir().canonicalize()?;
    let parent = target
        .parent()
        .ok_or_else(|| AppError::InvalidPetMetadata {
            path: target.to_path_buf(),
            reason: "pet target has no parent".to_string(),
        })?;
    std::fs::create_dir_all(parent)?;
    let canonical_parent = parent.canonicalize()?;
    if canonical_parent != canonical_pets {
        return Err(AppError::InvalidPetMetadata {
            path: target.to_path_buf(),
            reason: "pet target escapes app-support pet library".to_string(),
        });
    }
    Ok(())
}

fn read_optional_string(path: &Path) -> AppResult<Option<String>> {
    if path.exists() {
        Ok(Some(read_to_string(path)?))
    } else {
        Ok(None)
    }
}

fn validate_library(library: &PetLibrary) -> AppResult<()> {
    if let Some(active_id) = &library.active_pet_id {
        validate_pet_id(active_id)?;
    }
    for pet in &library.pets {
        validate_pet_id(&pet.pet_id)?;
    }
    Ok(())
}

fn default_generic_persona() -> String {
    "You are a small desktop pet. Be warm, brief, playful, and respectful of the user's privacy."
        .to_string()
}

fn bundled_olive_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/pets/olive")
}

fn now_string() -> AppResult<String> {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map_err(|error| AppError::CommandFailed("format timestamp".to_string(), error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};
    use tempfile::tempdir;

    fn write_webp(path: &Path) {
        let image: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_pixel(1536, 1872, Rgba([0, 0, 0, 0]));
        image.save(path).expect("webp writes");
    }

    fn write_pet(dir: &Path, id: &str) {
        std::fs::create_dir_all(dir).expect("pet dir");
        write_webp(&dir.join("spritesheet.webp"));
        std::fs::write(
            dir.join("pet.json"),
            format!(r#"{{"id":"{id}","displayName":"{id}","spritesheetPath":"spritesheet.webp"}}"#),
        )
        .expect("manifest");
    }

    #[test]
    fn first_launch_imports_bundled_olive() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(
            root.path().join("codex"),
            root.path().join("support"),
            root.path().join("repo"),
        );
        let library = ensure_library(&paths).expect("library");
        assert_eq!(library.active_pet_id.as_deref(), Some("olive"));
        assert!(paths
            .pet_support_dir("olive")
            .join("spritesheet.webp")
            .exists());
        let config = load_active_pet_config(&paths)
            .expect("load")
            .expect("config");
        assert_eq!(config.pet_id, "olive");
        assert_eq!(
            config.runtime.safety_mode,
            crate::state::RuntimeSafetyMode::Safe
        );
    }

    #[test]
    fn import_rejects_twenty_first_pet() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(
            root.path().join("codex"),
            root.path().join("support"),
            root.path().join("repo"),
        );
        let now = now_string().unwrap();
        let pets = (0..MAX_PETS)
            .map(|index| PetLibraryEntry {
                pet_id: format!("pet-{index}"),
                display_name: format!("Pet {index}"),
                source: PetSource::Imported {
                    original_path: None,
                },
                created_at: now.clone(),
                updated_at: now.clone(),
            })
            .collect();
        save_library(
            &paths,
            &PetLibrary {
                active_pet_id: Some("pet-0".into()),
                pets,
            },
        )
        .unwrap();
        let staged = root.path().join("staged");
        write_pet(&staged, "extra");
        let error = import_staged_pet(&paths, &staged).expect_err("limit error");
        assert!(matches!(error, AppError::PetLimitReached(MAX_PETS)));
    }

    #[test]
    fn import_rejects_invalid_pet_id() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(
            root.path().join("codex"),
            root.path().join("support"),
            root.path().join("repo"),
        );
        let staged = root.path().join("staged");
        write_pet(&staged, "../escape");
        let error = import_staged_pet(&paths, &staged).expect_err("invalid pet id");
        assert!(matches!(error, AppError::InvalidPetMetadata { .. }));
    }

    #[cfg(unix)]
    #[test]
    fn import_rejects_optional_symlink_escape() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(
            root.path().join("codex"),
            root.path().join("support"),
            root.path().join("repo"),
        );
        let staged = root.path().join("staged");
        write_pet(&staged, "symlink-pet");
        let secret = root.path().join("secret.txt");
        std::fs::write(&secret, "secret").expect("secret");
        std::os::unix::fs::symlink(secret, staged.join("personality.md")).expect("symlink");
        let error = import_staged_pet(&paths, &staged).expect_err("symlink rejected");
        assert!(matches!(error, AppError::InvalidPetAsset { .. }));
    }

    #[test]
    fn load_library_rejects_invalid_persisted_pet_id() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(
            root.path().join("codex"),
            root.path().join("support"),
            root.path().join("repo"),
        );
        std::fs::create_dir_all(&paths.app_support).expect("support");
        std::fs::write(
            library_path(&paths),
            r#"{"activePetId":"../escape","pets":[]}"#,
        )
        .expect("library");
        let error = load_library(&paths).expect_err("invalid library");
        assert!(matches!(error, AppError::InvalidPetMetadata { .. }));
    }

    #[test]
    fn migrated_twenty_pets_does_not_add_olive() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(
            root.path().join("codex"),
            root.path().join("support"),
            root.path().join("repo"),
        );
        for index in 0..MAX_PETS {
            let id = format!("legacy-{index}");
            let dir = paths.pet_support_dir(&id);
            write_pet(&dir, &id);
            let config = default_pet_config(
                id.clone(),
                id.clone(),
                dir.join("spritesheet.webp"),
                "persona".into(),
            );
            save_pet_config(&paths, &id, &config).unwrap();
        }
        let library = ensure_library(&paths).unwrap();
        assert_eq!(library.pets.len(), MAX_PETS);
        assert!(!library.pets.iter().any(|pet| pet.pet_id == "olive"));
    }
}
