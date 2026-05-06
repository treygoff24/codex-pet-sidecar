use crate::error::{read_to_string, AppResult};
use crate::pets::validate_pet_id;
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
    #[serde(default)]
    pub tuck: TuckConfig,
    pub workspace_cwd: Option<PathBuf>,
    pub observers: ObserverConfig,
    #[serde(default = "default_ambient_config")]
    pub ambient: AmbientConfig,
    pub proactive: ProactiveConfig,
    #[serde(default)]
    pub runtime: RuntimeConfig,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MuteConfig {
    pub until: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TuckConfig {
    pub tucked: bool,
    pub tucked_until: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeConfig {
    pub session_persistence: SessionPersistence,
    pub safety_mode: RuntimeSafetyMode,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            session_persistence: SessionPersistence::Ephemeral,
            safety_mode: RuntimeSafetyMode::Safe,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SessionPersistence {
    Ephemeral,
    SavedHistory,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeSafetyMode {
    Safe,
    Power,
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
        enabled: false,
        interval_minutes: 15,
        include_screenshot: false,
        retain_screenshots: false,
    }
}

pub fn default_pet_config(
    pet_id: String,
    display_name: String,
    spritesheet_path: PathBuf,
    persona: String,
) -> PetConfig {
    PetConfig {
        pet_id,
        display_name,
        spritesheet_path,
        persona,
        mute: MuteConfig::default(),
        tuck: TuckConfig::default(),
        workspace_cwd: None,
        observers: ObserverConfig {
            active_app: false,
            window_title: false,
            workspace: false,
            idle: false,
        },
        ambient: default_ambient_config(),
        proactive: ProactiveConfig {
            enabled: true,
            min_minutes_between_messages: 10,
        },
        runtime: RuntimeConfig::default(),
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
        let mut config = default_pet_config(
            pet_id,
            display_name,
            spritesheet_path,
            "You are my little buddy in my computer with me.".to_string(),
        );
        config.workspace_cwd = Some(workspace_cwd);
        config.observers.window_title = true;
        config
    }
}

pub fn save_config(paths: &AppPaths, config: &PetConfig) -> AppResult<()> {
    save_pet_config(paths, &config.pet_id, config)
}

pub fn save_pet_config(paths: &AppPaths, pet_id: &str, config: &PetConfig) -> AppResult<()> {
    validate_pet_id(pet_id)?;
    validate_pet_id(&config.pet_id)?;
    let dir = paths.pet_support_dir(pet_id);
    std::fs::create_dir_all(&dir)?;
    let payload = serde_json::to_string_pretty(config)?;
    std::fs::write(paths.pet_config_path(pet_id), payload)?;
    Ok(())
}

pub fn load_pet_config(paths: &AppPaths, pet_id: &str) -> AppResult<Option<PetConfig>> {
    validate_pet_id(pet_id)?;
    let path = paths.pet_config_path(pet_id);
    if !path.exists() {
        return Ok(None);
    }
    let config: PetConfig = serde_json::from_str(&read_to_string(&path)?)?;
    validate_pet_id(&config.pet_id)?;
    Ok(Some(config))
}

pub fn load_config(paths: &AppPaths) -> AppResult<Option<PetConfig>> {
    if let Some(library) = crate::state::library::load_library(paths)? {
        if let Some(active_id) = library.active_pet_id {
            return load_pet_config(paths, &active_id);
        }
    }
    let pets_dir = paths.pets_dir();
    if !pets_dir.exists() {
        return Ok(None);
    }
    for entry in std::fs::read_dir(pets_dir)? {
        let entry = entry?;
        let path = entry.path().join("pet.config.json");
        if path.exists() {
            let config: PetConfig = serde_json::from_str(&read_to_string(&path)?)?;
            validate_pet_id(&config.pet_id)?;
            return Ok(Some(config));
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
        let loaded = load_pet_config(&paths, "olive")
            .expect("load")
            .expect("config");
        assert_eq!(loaded.workspace_cwd, Some(root.path().join("repo")));
        assert_eq!(loaded.ambient.interval_minutes, 15);
        assert!(!loaded.ambient.include_screenshot);
        assert_eq!(
            loaded.runtime.session_persistence,
            SessionPersistence::Ephemeral
        );
        assert_eq!(loaded.runtime.safety_mode, RuntimeSafetyMode::Safe);
    }

    #[test]
    fn old_config_loads_with_default_ambient_runtime_and_tuck_settings() {
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
        assert!(!loaded.ambient.enabled);
        assert_eq!(loaded.ambient.effective_interval_minutes(), 15);
        assert!(!loaded.tuck.tucked);
        assert_eq!(loaded.runtime.safety_mode, RuntimeSafetyMode::Safe);
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

    #[test]
    fn legacy_fallback_rejects_invalid_pet_id() {
        let root = tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(
            root.path().join("codex"),
            root.path().join("support"),
            root.path().join("repo"),
        );
        let pet_dir = paths.pet_support_dir("legacy");
        std::fs::create_dir_all(&pet_dir).expect("pet dir");
        std::fs::write(
            pet_dir.join("pet.config.json"),
            serde_json::json!({
                "petId": "../escape",
                "displayName": "Bad",
                "spritesheetPath": "/tmp/sprite.webp",
                "persona": "bad",
                "mute": {},
                "observers": {
                    "activeApp": false,
                    "windowTitle": false,
                    "workspace": false,
                    "idle": false
                },
                "ambient": {
                    "enabled": false,
                    "intervalMinutes": 15,
                    "includeScreenshot": false,
                    "retainScreenshots": false
                },
                "proactive": {
                    "enabled": true,
                    "minMinutesBetweenMessages": 10
                }
            })
            .to_string(),
        )
        .expect("legacy config");
        let error = load_config(&paths).expect_err("invalid legacy id");
        assert!(matches!(
            error,
            crate::error::AppError::InvalidPetMetadata { .. }
        ));
    }
}
