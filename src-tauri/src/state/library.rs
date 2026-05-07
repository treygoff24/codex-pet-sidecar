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
    let library = ensure_library(paths)?;
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
        return repair_library(paths, library);
    }
    let legacy = migrate_legacy_if_present(paths)?;
    if let Some(library) = legacy {
        return repair_library(paths, library);
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
    let entry = install_bundled_olive(paths, &now_string()?)?;
    let library = PetLibrary {
        active_pet_id: Some(BUNDLED_DEFAULT_PET_ID.to_string()),
        pets: vec![entry],
    };
    save_library(paths, &library)?;
    Ok(library)
}

/// Copy the bundled Olive package into app support, write its config, and
/// return a library entry. Shared by first-launch import, library repair, and
/// legacy migration — every code path that surfaces Olive goes through here.
fn install_bundled_olive(paths: &AppPaths, now: &str) -> AppResult<PetLibraryEntry> {
    let source = &paths.bundled_olive_dir;
    let pet = validate_pet_package(source)?;
    let target = copy_pet_package(source, paths, BUNDLED_DEFAULT_PET_ID)?;
    let persona = read_to_string(&target.join("personality.md"))?;
    let config = default_pet_config(
        BUNDLED_DEFAULT_PET_ID.to_string(),
        pet.display_name.clone(),
        target.join("spritesheet.webp"),
        persona,
    );
    save_pet_config(paths, BUNDLED_DEFAULT_PET_ID, &config)?;
    Ok(PetLibraryEntry {
        pet_id: BUNDLED_DEFAULT_PET_ID.to_string(),
        display_name: pet.display_name,
        source: PetSource::Bundled {
            bundled_id: BUNDLED_DEFAULT_PET_ID.to_string(),
        },
        created_at: now.to_string(),
        updated_at: now.to_string(),
    })
}

fn repair_library(paths: &AppPaths, library: PetLibrary) -> AppResult<PetLibrary> {
    let original = library.clone();
    let mut repaired = PetLibrary {
        active_pet_id: library.active_pet_id,
        pets: Vec::new(),
    };

    for entry in library.pets {
        validate_pet_id(&entry.pet_id)?;
        let pet_dir = paths.pet_support_dir(&entry.pet_id);
        match read_pet_dir(&pet_dir) {
            Ok(Some(pet)) => {
                ensure_pet_config(paths, &pet)?;
                repaired.pets.push(PetLibraryEntry {
                    display_name: pet.display_name,
                    ..entry
                });
            }
            Ok(None) => {
                eprintln!(
                    "library: pruning {} — package directory missing at {}",
                    entry.pet_id,
                    pet_dir.display(),
                );
            }
            Err(
                error @ (AppError::InvalidPetAsset { .. } | AppError::InvalidPetMetadata { .. }),
            ) => {
                eprintln!("library: pruning {} — {}", entry.pet_id, error);
            }
            Err(error) => return Err(error),
        }
    }

    if !repaired
        .pets
        .iter()
        .any(|pet| pet.pet_id == BUNDLED_DEFAULT_PET_ID)
        && repaired.pets.len() < MAX_PETS
    {
        repaired
            .pets
            .push(install_bundled_olive(paths, &now_string()?)?);
    }

    let active_is_valid = repaired
        .active_pet_id
        .as_ref()
        .is_some_and(|active| repaired.pets.iter().any(|pet| &pet.pet_id == active));
    if !active_is_valid {
        repaired.active_pet_id = repaired
            .pets
            .iter()
            .find(|pet| pet.pet_id == BUNDLED_DEFAULT_PET_ID)
            .or_else(|| repaired.pets.first())
            .map(|pet| pet.pet_id.clone());
    }

    if repaired != original {
        save_library(paths, &repaired)?;
    }
    Ok(repaired)
}

fn ensure_pet_config(paths: &AppPaths, pet: &InstalledPet) -> AppResult<()> {
    let expected_spritesheet = paths.pet_support_dir(&pet.id).join("spritesheet.webp");
    let mut config = match load_pet_config(paths, &pet.id)? {
        Some(config) => config,
        None => {
            let persona =
                read_optional_string(&paths.pet_support_dir(&pet.id).join("personality.md"))?
                    .unwrap_or_else(default_generic_persona);
            default_pet_config(
                pet.id.clone(),
                pet.display_name.clone(),
                expected_spritesheet.clone(),
                persona,
            )
        }
    };

    let mut changed = false;
    if config.pet_id != pet.id {
        config.pet_id = pet.id.clone();
        changed = true;
    }
    if config.display_name != pet.display_name {
        config.display_name = pet.display_name.clone();
        changed = true;
    }
    if config.spritesheet_path != expected_spritesheet {
        config.spritesheet_path = expected_spritesheet;
        changed = true;
    }
    if changed || !paths.pet_config_path(&pet.id).exists() {
        save_pet_config(paths, &pet.id, &config)?;
    }
    Ok(())
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
        library.pets.push(install_bundled_olive(paths, &now)?);
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

    fn write_bundled_olive(dir: &Path) {
        write_pet(dir, BUNDLED_DEFAULT_PET_ID);
        std::fs::write(dir.join("personality.md"), "bundled persona").expect("personality");
        std::fs::write(dir.join("README.md"), "bundled readme").expect("readme");
    }

    #[test]
    fn first_launch_imports_bundled_olive() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));
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
    fn first_launch_imports_bundled_olive_from_installed_resource_dir() {
        let root = tempdir().expect("tempdir");
        let resource_olive = root.path().join("Resources/_up_/assets/pets/olive");
        write_bundled_olive(&resource_olive);
        let paths =
            AppPaths::with_bundled_olive(root.path().join("support"), resource_olive.clone());

        let library = ensure_library(&paths).expect("library");
        let config = load_active_pet_config(&paths)
            .expect("load")
            .expect("config");

        assert_eq!(
            library.active_pet_id.as_deref(),
            Some(BUNDLED_DEFAULT_PET_ID)
        );
        assert_eq!(config.pet_id, BUNDLED_DEFAULT_PET_ID);
        assert_eq!(
            config.spritesheet_path,
            paths
                .pet_support_dir(BUNDLED_DEFAULT_PET_ID)
                .join("spritesheet.webp")
        );
        assert_ne!(
            config.spritesheet_path,
            resource_olive.join("spritesheet.webp")
        );
        assert!(paths
            .pet_support_dir(BUNDLED_DEFAULT_PET_ID)
            .join("personality.md")
            .exists());
    }

    #[test]
    fn migration_does_not_activate_stale_legacy_pet_without_package_assets() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));
        let stale_dir = paths.pet_support_dir("stale");
        std::fs::create_dir_all(&stale_dir).expect("stale dir");
        let stale_config = default_pet_config(
            "stale".into(),
            "Stale".into(),
            root.path().join("missing.webp"),
            "stale persona".into(),
        );
        save_pet_config(&paths, "stale", &stale_config).expect("stale config");

        let library = ensure_library(&paths).expect("library");
        let active = load_active_pet_config(&paths)
            .expect("active")
            .expect("active config");

        assert_eq!(
            library.active_pet_id.as_deref(),
            Some(BUNDLED_DEFAULT_PET_ID)
        );
        assert!(!library.pets.iter().any(|pet| pet.pet_id == "stale"));
        assert_eq!(active.pet_id, BUNDLED_DEFAULT_PET_ID);
    }

    #[test]
    fn existing_library_rehomes_missing_active_pet_to_olive() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));
        write_bundled_olive(&paths.pet_support_dir(BUNDLED_DEFAULT_PET_ID));
        let olive_config = default_pet_config(
            BUNDLED_DEFAULT_PET_ID.into(),
            "Olive".into(),
            paths
                .pet_support_dir(BUNDLED_DEFAULT_PET_ID)
                .join("spritesheet.webp"),
            "persona".into(),
        );
        save_pet_config(&paths, BUNDLED_DEFAULT_PET_ID, &olive_config).expect("olive config");
        let now = now_string().expect("now");
        save_library(
            &paths,
            &PetLibrary {
                active_pet_id: Some("stale".into()),
                pets: vec![
                    PetLibraryEntry {
                        pet_id: "stale".into(),
                        display_name: "Stale".into(),
                        source: PetSource::Migrated {
                            migration_id: "library-v1".into(),
                        },
                        created_at: now.clone(),
                        updated_at: now.clone(),
                    },
                    PetLibraryEntry {
                        pet_id: BUNDLED_DEFAULT_PET_ID.into(),
                        display_name: "Olive".into(),
                        source: PetSource::Bundled {
                            bundled_id: BUNDLED_DEFAULT_PET_ID.into(),
                        },
                        created_at: now.clone(),
                        updated_at: now,
                    },
                ],
            },
        )
        .expect("library");

        let library = ensure_library(&paths).expect("repair");
        let active = load_active_pet_config(&paths)
            .expect("active")
            .expect("active config");

        assert_eq!(
            library.active_pet_id.as_deref(),
            Some(BUNDLED_DEFAULT_PET_ID)
        );
        assert_eq!(library.pets.len(), 1);
        assert_eq!(active.pet_id, BUNDLED_DEFAULT_PET_ID);
    }

    #[test]
    fn repair_rehomes_valid_pet_config_spritesheet_under_app_support() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));
        let pet_dir = paths.pet_support_dir("manny");
        write_pet(&pet_dir, "manny");
        let mut config = default_pet_config(
            "manny".into(),
            "Manny".into(),
            root.path().join("external/spritesheet.webp"),
            "persona".into(),
        );
        config.workspace_cwd = Some(root.path().join("repo"));
        save_pet_config(&paths, "manny", &config).expect("config");
        let now = now_string().expect("now");
        save_library(
            &paths,
            &PetLibrary {
                active_pet_id: Some("manny".into()),
                pets: vec![PetLibraryEntry {
                    pet_id: "manny".into(),
                    display_name: "Manny".into(),
                    source: PetSource::Imported {
                        original_path: None,
                    },
                    created_at: now.clone(),
                    updated_at: now,
                }],
            },
        )
        .expect("library");

        ensure_library(&paths).expect("repair");
        let repaired = load_pet_config(&paths, "manny")
            .expect("load")
            .expect("config");

        assert_eq!(repaired.spritesheet_path, pet_dir.join("spritesheet.webp"));
        assert_eq!(repaired.workspace_cwd, config.workspace_cwd);
    }

    #[test]
    fn import_rejects_twenty_first_pet() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));
        let now = now_string().unwrap();
        let pets = (0..MAX_PETS)
            .map(|index| {
                let id = format!("pet-{index}");
                let dir = paths.pet_support_dir(&id);
                write_pet(&dir, &id);
                let config = default_pet_config(
                    id.clone(),
                    format!("Pet {index}"),
                    dir.join("spritesheet.webp"),
                    "persona".into(),
                );
                save_pet_config(&paths, &id, &config).unwrap();
                PetLibraryEntry {
                    pet_id: id,
                    display_name: format!("Pet {index}"),
                    source: PetSource::Imported {
                        original_path: None,
                    },
                    created_at: now.clone(),
                    updated_at: now.clone(),
                }
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
        let paths = AppPaths::with_roots(root.path().join("support"));
        let staged = root.path().join("staged");
        write_pet(&staged, "../escape");
        let error = import_staged_pet(&paths, &staged).expect_err("invalid pet id");
        assert!(matches!(error, AppError::InvalidPetMetadata { .. }));
    }

    #[cfg(unix)]
    #[test]
    fn import_rejects_optional_symlink_escape() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));
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
        let paths = AppPaths::with_roots(root.path().join("support"));
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
        let paths = AppPaths::with_roots(root.path().join("support"));
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
