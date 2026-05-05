# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The repository's general conventions live in `AGENTS.md` — read it before working here.

@AGENTS.md

## Claude-specific notes

- **Repo gate:** `npm run check` (TypeScript build + Vitest + `cargo test --manifest-path src-tauri/Cargo.toml`). Run before handoff. Use the `/check` skill if you want it routed cleanly.
- **`codex` binary on `PATH` is required** for runtime tests (`npm run smoke:runtime` and the Rust `runtime::session` tests). If absent, sessions fail with `AppError::CodexNotFound`. Surface this clearly rather than chasing the symptom.
- **Do not edit `protocol/app-server/`** unless the upstream Codex protocol source has changed. These are generated snapshots — hand-edits drift the contract silently.
- **No CI, single contributor.** The gate command is the only checkpoint. Don't assume a pipeline will catch what you skip.
- **Format-on-edit hook is wired.** TS/TSX/JS/JSX run through `oxfmt`, Rust through `rustfmt`. If a hook fails, fix the underlying issue — don't bypass it.
- **macOS-specific quirks:** `macOSPrivateApi: true` is required for the transparent always-on-top window. The Tauri asset protocol is scoped to `~/.codex/pets/**` and `~/.ai-profiles/runtime/codex/personal/pets/**` — pet sprites must live there.
- **`CODEX_HOME` env var** optionally overrides the Codex home dir (default `~/.codex`). The pet directory resolver in `src-tauri/src/state/paths.rs` falls back to `~/.codex` if `$CODEX_HOME/pets` doesn't exist.
- **Disabled MCP servers in pet sessions:** `pencil`, `porkbun`, `resend`, `serena` are intentionally excluded from pet Codex threads (hardcoded in `src-tauri/src/runtime/session.rs`). Don't re-enable without a reason.
