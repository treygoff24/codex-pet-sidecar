use crate::error::{AppError, AppResult};
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub codex_home: PathBuf,
    pub app_support: PathBuf,
    pub launch_cwd: PathBuf,
}

impl AppPaths {
    pub fn discover() -> AppResult<Self> {
        let configured_codex_home = std::env::var_os("CODEX_HOME")
            .map(PathBuf::from)
            .or_else(|| dirs::home_dir().map(|home| home.join(".codex")))
            .ok_or(AppError::MissingAppSupportDir)?;
        let default_codex_home = dirs::home_dir().map(|home| home.join(".codex"));
        let codex_home = match default_codex_home {
            Some(default_home)
                if !configured_codex_home.join("pets").exists()
                    && default_home.join("pets").exists() =>
            {
                default_home
            }
            _ => configured_codex_home,
        };
        let app_support = dirs::data_dir()
            .map(|dir| dir.join("Codex Pet Sidecar"))
            .ok_or(AppError::MissingAppSupportDir)?;
        let launch_cwd = std::env::current_dir()?;
        Ok(Self {
            codex_home,
            app_support,
            launch_cwd,
        })
    }

    #[cfg(test)]
    pub fn with_roots(codex_home: PathBuf, app_support: PathBuf, launch_cwd: PathBuf) -> Self {
        Self {
            codex_home,
            app_support,
            launch_cwd,
        }
    }

    pub fn pet_support_dir(&self, pet_id: &str) -> PathBuf {
        self.app_support.join("pets").join(pet_id)
    }

    pub fn pet_config_path(&self, pet_id: &str) -> PathBuf {
        self.pet_support_dir(pet_id).join("pet.config.json")
    }

    pub fn pet_memory_path(&self, pet_id: &str) -> PathBuf {
        self.pet_support_dir(pet_id).join("memory.md")
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
