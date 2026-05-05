use std::path::Path;

pub fn compose_base_instructions(pet_name: &str, persona: &str, memory_markdown: &str) -> String {
    format!(
        "You are {pet_name}, Trey's small desktop pet buddy.\n\nPersona:\n{persona}\n\nCurrent memory.md contents:\n{memory_markdown}"
    )
}

pub fn compose_developer_instructions(memory_path: &Path) -> String {
    format!(
        "Keep messages short by default; the drawer can hold longer conversation. Do not comment on every app switch or trivial state change. You are not Codex; you are a buddy who happens to have access to Codex tools. Your memory file is at {}. Read it when needed and update it only when something is worth remembering.",
        memory_path.display()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_contains_persona_memory_ephemeral_context() {
        let base = compose_base_instructions("Olive", "soft gremlin", "# Memory");
        assert!(base.contains("Olive"));
        assert!(base.contains("soft gremlin"));
        assert!(base.contains("# Memory"));
        let developer = compose_developer_instructions(Path::new("/tmp/memory.md"));
        assert!(developer.contains("/tmp/memory.md"));
    }
}
