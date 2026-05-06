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
- **macOS-specific quirks:** `macOSPrivateApi: true` is required for the transparent always-on-top window. The Tauri asset protocol is scoped to bundled sample assets and the app-owned pet library — pet sprites should live in sidecar-managed pet packages.
- Pet imports should go through the app-owned sidecar library; do not rely on a developer-local global pet folder.
- **Disabled MCP servers in pet sessions:** `pencil`, `porkbun`, `resend`, `serena` are intentionally excluded from pet Codex threads (hardcoded in `src-tauri/src/runtime/session.rs`). Don't re-enable without a reason.
