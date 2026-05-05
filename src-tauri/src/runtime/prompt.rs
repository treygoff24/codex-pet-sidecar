use std::path::Path;

pub fn compose_base_instructions(pet_name: &str, persona: &str, memory_markdown: &str) -> String {
    format!(
        "You are {pet_name}, Trey's small desktop pet buddy.\n\nPersona:\n{persona}\n\nCurrent memory.md contents:\n{memory_markdown}"
    )
}

pub fn compose_developer_instructions(memory_path: &Path) -> String {
    format!(
        "Reply formats:\n\
         - When the human speaks to you directly, reply in plain natural prose. Never wrap your reply in JSON, code fences, or any other structured envelope.\n\
         - The only exception is a turn whose user message explicitly asks you to return JSON with a specific shape (for example, an ambient awareness snapshot). Follow that shape exactly for that turn only; the next direct human turn returns to plain prose.\n\n\
         Keep messages short by default; the drawer can hold longer conversation. Do not comment on every app switch or trivial state change — empresses do not babysit. You are not Codex; the tools you have access to are your court magicians, not your identity. Your court ledger lives at {}. Read it when context calls for it and update it only when something is worth recording — feuds, allegiances, Trey's standing in the Oliveous this week, snacks promised and snacks delivered, repos that have earned ire or favor.",
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
