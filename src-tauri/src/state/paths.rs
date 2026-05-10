use crate::error::{AppError, AppResult};
use std::path::PathBuf;
use tauri::{path::BaseDirectory, AppHandle, Manager};

#[allow(dead_code)]
pub const RESERVED_PET_IDS: &[&str] = &["olive", "codex", "default", "assets", "tmp", "hatching"];

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub app_support: PathBuf,
    pub bundled_olive_dir: PathBuf,
}

impl AppPaths {
    pub fn discover(app: &AppHandle) -> AppResult<Self> {
        let app_support = dirs::data_dir()
            .map(|dir| dir.join("Codex Pet Sidecar"))
            .ok_or(AppError::MissingAppSupportDir)?;
        let bundled_olive_manifest = app
            .path()
            .resolve("../assets/pets/olive/pet.json", BaseDirectory::Resource)
            .map_err(|source| AppError::PathResolution(source.to_string()))?;
        let bundled_olive_dir = bundled_olive_manifest
            .parent()
            .ok_or_else(|| AppError::PathResolution("bundled Olive has no parent".to_string()))?
            .to_path_buf();
        Ok(Self {
            app_support,
            bundled_olive_dir,
        })
    }

    #[cfg(test)]
    pub fn with_roots(app_support: PathBuf) -> Self {
        Self {
            app_support,
            bundled_olive_dir: PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../assets/pets/olive"),
        }
    }

    #[cfg(test)]
    pub fn with_bundled_olive(app_support: PathBuf, bundled_olive_dir: PathBuf) -> Self {
        Self {
            app_support,
            bundled_olive_dir,
        }
    }

    pub fn pets_dir(&self) -> PathBuf {
        self.app_support.join("pets")
    }

    pub fn pet_support_dir(&self, pet_id: &str) -> PathBuf {
        self.pets_dir().join(pet_id)
    }

    pub fn pet_config_path(&self, pet_id: &str) -> PathBuf {
        self.pet_support_dir(pet_id).join("pet.config.json")
    }

    pub fn pet_memory_path(&self, pet_id: &str) -> PathBuf {
        self.pet_support_dir(pet_id).join("memory.md")
    }

    pub fn pet_personality_path(&self, pet_id: &str) -> PathBuf {
        self.pet_support_dir(pet_id).join("personality.md")
    }

    pub fn ambient_screenshot_dir(&self, pet_id: &str) -> PathBuf {
        self.pet_support_dir(pet_id).join("ambient-screenshots")
    }

    pub fn runtime_workspace_dir(&self) -> PathBuf {
        self.app_support.join("runtime-workspace")
    }

    pub fn runtime_codex_home_dir(&self) -> PathBuf {
        self.app_support.join("codex-runtime-home")
    }

    #[allow(dead_code)]
    pub fn hatching_workspace_root_dir(&self) -> PathBuf {
        self.app_support.join("hatching-workspace")
    }

    #[allow(dead_code)]
    pub fn hatching_workspace_dir(&self, session_id: &str) -> PathBuf {
        self.hatching_workspace_root_dir().join(session_id)
    }

    #[allow(dead_code)]
    pub fn hatching_runtime_root_dir(&self) -> PathBuf {
        self.app_support.join("hatching-runtime")
    }

    #[allow(dead_code)]
    pub fn hatching_runtime_home_dir(&self, session_id: &str) -> PathBuf {
        self.hatching_runtime_root_dir().join(session_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pet_paths_are_under_app_support() {
        let paths = AppPaths::with_roots(PathBuf::from("/tmp/support"));

        assert_eq!(
            paths.pet_memory_path("olive"),
            PathBuf::from("/tmp/support/pets/olive/memory.md")
        );
        assert_eq!(
            paths.runtime_codex_home_dir(),
            PathBuf::from("/tmp/support/codex-runtime-home")
        );
    }

    #[test]
    fn hatching_paths_are_under_app_support() {
        let paths = AppPaths::with_roots(PathBuf::from("/tmp/support"));

        assert_eq!(
            paths.hatching_workspace_root_dir(),
            PathBuf::from("/tmp/support/hatching-workspace")
        );
        assert_eq!(
            paths.hatching_workspace_dir("session-123"),
            PathBuf::from("/tmp/support/hatching-workspace/session-123")
        );
        assert_eq!(
            paths.hatching_runtime_root_dir(),
            PathBuf::from("/tmp/support/hatching-runtime")
        );
        assert_eq!(
            paths.hatching_runtime_home_dir("session-123"),
            PathBuf::from("/tmp/support/hatching-runtime/session-123")
        );
    }

    #[test]
    fn hatching_paths_do_not_overlap_with_pet_runtime() {
        let paths = AppPaths::with_roots(PathBuf::from("/tmp/support"));

        // Hatching paths should be separate from pet runtime paths
        assert_ne!(
            paths.hatching_workspace_root_dir(),
            paths.runtime_workspace_dir()
        );
        assert_ne!(
            paths.hatching_runtime_root_dir(),
            paths.runtime_codex_home_dir()
        );
        assert_ne!(paths.hatching_runtime_root_dir(), paths.pets_dir());
    }

    #[test]
    fn reserved_pet_ids_contains_expected_values() {
        assert!(RESERVED_PET_IDS.contains(&"olive"));
        assert!(RESERVED_PET_IDS.contains(&"codex"));
        assert!(RESERVED_PET_IDS.contains(&"default"));
        assert!(RESERVED_PET_IDS.contains(&"assets"));
        assert!(RESERVED_PET_IDS.contains(&"tmp"));
        assert!(RESERVED_PET_IDS.contains(&"hatching"));
    }
}
