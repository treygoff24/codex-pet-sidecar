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
    #[serde(default = "default_ambient_config")]
    pub ambient: AmbientConfig,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AmbientConfig {
    pub enabled: bool,
    pub interval_minutes: u64,
    pub include_screenshot: bool,
    pub retain_screenshots: bool,
}

impl AmbientConfig {
    pub fn effective_interval_minutes(&self) -> u64 {
        self.interval_minutes.max(10)
    }
}

fn default_ambient_config() -> AmbientConfig {
    AmbientConfig {
        enabled: true,
        interval_minutes: 15,
        include_screenshot: false,
        retain_screenshots: false,
    }
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
            ambient: default_ambient_config(),
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
        assert_eq!(loaded.ambient.interval_minutes, 15);
        assert!(!loaded.ambient.include_screenshot);
    }

    #[test]
    fn old_config_loads_with_default_ambient_settings() {
        let payload = serde_json::json!({
            "petId": "olive",
            "displayName": "Olive",
            "spritesheetPath": "/tmp/sprite.webp",
            "persona": "warm",
            "mute": {},
            "workspaceCwd": "/tmp/repo",
            "observers": {
                "activeApp": true,
                "windowTitle": true,
                "workspace": true,
                "idle": true
            },
            "proactive": {
                "enabled": true,
                "minMinutesBetweenMessages": 10
            }
        });
        let loaded: PetConfig = serde_json::from_value(payload).expect("old config loads");
        assert!(loaded.ambient.enabled);
        assert_eq!(loaded.ambient.effective_interval_minutes(), 15);
    }

    #[test]
    fn ambient_config_preserves_explicit_values_and_clamps_effective_interval() {
        let payload = serde_json::json!({
            "petId": "olive",
            "displayName": "Olive",
            "spritesheetPath": "/tmp/sprite.webp",
            "persona": "warm",
            "mute": {},
            "observers": {
                "activeApp": true,
                "windowTitle": true,
                "workspace": true,
                "idle": true
            },
            "ambient": {
                "enabled": false,
                "intervalMinutes": 4,
                "includeScreenshot": true,
                "retainScreenshots": true
            },
            "proactive": {
                "enabled": true,
                "minMinutesBetweenMessages": 10
            }
        });
        let loaded: PetConfig = serde_json::from_value(payload).expect("config loads");
        assert!(!loaded.ambient.enabled);
        assert_eq!(loaded.ambient.interval_minutes, 4);
        assert_eq!(loaded.ambient.effective_interval_minutes(), 10);
        assert!(loaded.ambient.include_screenshot);
        assert!(loaded.ambient.retain_screenshots);
    }
}
