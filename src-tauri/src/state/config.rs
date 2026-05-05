use crate::error::{read_to_string, AppResult};
use crate::state::paths::AppPaths;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PetConfig {
    pub pet_id: String,
    pub display_name: String,
    pub spritesheet_path: PathBuf,
    pub persona: String,
    pub mute: MuteConfig,
    pub workspace_cwd: Option<PathBuf>,
    pub observers: ObserverConfig,
    pub proactive: ProactiveConfig,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MuteConfig {
    pub until: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ObserverConfig {
    pub active_app: bool,
    pub window_title: bool,
    pub workspace: bool,
    pub idle: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProactiveConfig {
    pub enabled: bool,
    pub min_minutes_between_messages: u64,
}

impl PetConfig {
    #[cfg(test)]
    pub fn first_launch(
        pet_id: String,
        display_name: String,
        spritesheet_path: PathBuf,
        workspace_cwd: PathBuf,
    ) -> Self {
        Self {
            pet_id,
            display_name,
            spritesheet_path,
            persona: "You are my little buddy in my computer with me.".to_string(),
            mute: MuteConfig::default(),
            workspace_cwd: Some(workspace_cwd),
            observers: ObserverConfig {
                active_app: true,
                window_title: true,
                workspace: true,
                idle: true,
            },
            proactive: ProactiveConfig {
                enabled: true,
                min_minutes_between_messages: 10,
            },
        }
    }
}

pub fn save_config(paths: &AppPaths, config: &PetConfig) -> AppResult<()> {
    let dir = paths.pet_support_dir(&config.pet_id);
    std::fs::create_dir_all(&dir)?;
    let payload = serde_json::to_string_pretty(config)?;
    std::fs::write(paths.pet_config_path(&config.pet_id), payload)?;
    Ok(())
}

pub fn load_config(paths: &AppPaths) -> AppResult<Option<PetConfig>> {
    let pets_dir = paths.app_support.join("pets");
    if !pets_dir.exists() {
        return Ok(None);
    }
    for entry in std::fs::read_dir(pets_dir)? {
        let entry = entry?;
        let path = entry.path().join("pet.config.json");
        if path.exists() {
            return Ok(Some(serde_json::from_str(&read_to_string(&path)?)?));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn missing_config_loads_none_and_round_trip_preserves_workspace() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(
            root.path().join("codex"),
            root.path().join("support"),
            root.path().to_path_buf(),
        );
        assert!(load_config(&paths).expect("load").is_none());
        let config = PetConfig::first_launch(
            "olive".into(),
            "Olive".into(),
            root.path().join("sprite.webp"),
            root.path().join("repo"),
        );
        save_config(&paths, &config).expect("save");
        let loaded = load_config(&paths).expect("load").expect("config");
        assert_eq!(loaded.workspace_cwd, Some(root.path().join("repo")));
    }
}
