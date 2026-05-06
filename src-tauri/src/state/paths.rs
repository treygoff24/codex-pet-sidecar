use crate::error::{AppError, AppResult};
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub app_support: PathBuf,
}

impl AppPaths {
    pub fn discover() -> AppResult<Self> {
        let app_support = dirs::data_dir()
            .map(|dir| dir.join("Codex Pet Sidecar"))
            .ok_or(AppError::MissingAppSupportDir)?;
        Ok(Self { app_support })
    }

    #[cfg(test)]
    pub fn with_roots(_codex_home: PathBuf, app_support: PathBuf, _launch_cwd: PathBuf) -> Self {
        Self { app_support }
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pet_paths_are_under_app_support() {
        let paths = AppPaths::with_roots(
            PathBuf::from("/tmp/codex"),
            PathBuf::from("/tmp/support"),
            PathBuf::from("/tmp/repo"),
        );

        assert_eq!(
            paths.pet_memory_path("olive"),
            PathBuf::from("/tmp/support/pets/olive/memory.md")
        );
    }
}
