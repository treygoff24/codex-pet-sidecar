use crate::error::AppResult;
use crate::state::{load_active_pet_config, AppPaths};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPrompt {
    pub skill: String,
    pub prompt: String,
}

pub fn hatching_prompt() -> SkillPrompt {
    SkillPrompt {
        skill: "pet-hatching".to_string(),
        prompt: "Use the repo-local .codex/skills/pet-hatching skill to hatch a new Codex Pet Sidecar pet. Stage the run under hatch-runs/<pet-slug>, validate the 1536x1872 atlas, and stop for user review before importing.".to_string(),
    }
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
