use crate::error::AppResult;
use crate::state::{load_active_pet_config, AppPaths};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPrompt {
    pub skill: String,
    pub prompt: String,
}

pub fn personality_prompt(paths: &AppPaths) -> AppResult<SkillPrompt> {
    let target = load_active_pet_config(paths)?
        .map(|config| paths.pet_personality_path(&config.pet_id))
        .map(|path| path.display().to_string())
        .unwrap_or_else(|| "the selected pet's personality.md".to_string());
    Ok(SkillPrompt {
        skill: "pet-personality".to_string(),
        prompt: format!(
            "Use the repo-local .codex/skills/pet-personality skill to improve {target}. Interview briefly if needed, preserve privacy boundaries, and write the updated personality markdown only after the user approves the direction."
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::config::{default_pet_config, save_config};

    #[test]
    fn personality_prompt_targets_selected_pet_personality_file_when_config_exists() {
        let root = tempfile::tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));
        let config = default_pet_config(
            "olive".into(),
            "Olive".into(),
            root.path().join("sprite.webp"),
            "warm".into(),
        );
        save_config(&paths, &config).expect("save config");

        let prompt = personality_prompt(&paths).expect("prompt");

        assert_eq!(prompt.skill, "pet-personality");
        assert!(prompt.prompt.contains(
            paths
                .pet_personality_path("olive")
                .to_string_lossy()
                .as_ref()
        ));
        assert!(prompt.prompt.contains("preserve privacy boundaries"));
        assert!(prompt.prompt.contains("only after the user approves"));
    }

    #[test]
    fn personality_prompt_repairs_empty_library_to_bundled_olive_before_prompting() {
        let root = tempfile::tempdir().expect("tempdir");
        let paths = AppPaths::with_roots(root.path().join("support"));
        crate::state::library::save_library(
            &paths,
            &crate::state::library::PetLibrary {
                active_pet_id: None,
                pets: Vec::new(),
            },
        )
        .expect("empty library");

        let prompt = personality_prompt(&paths).expect("prompt");

        assert_eq!(prompt.skill, "pet-personality");
        assert!(prompt.prompt.contains(
            paths
                .pet_personality_path("olive")
                .to_string_lossy()
                .as_ref()
        ));
    }
}
