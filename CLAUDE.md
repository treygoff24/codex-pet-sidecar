# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The repository's general conventions live in `AGENTS.md` — read it before working here.

@AGENTS.md

## Claude-specific notes

- **Tiered gates:** use `npm run check:fast` for inner-loop validation, targeted `npm test -- <pattern>` / `cargo test --manifest-path src-tauri/Cargo.toml <pattern>` for touched areas, and `npm run check:local` before claiming a task or milestone complete. `npm run check` remains an alias for `npm run check:full`; reserve it for final verification, pre-merge, CI, or changes that truly need the full build/test/clippy/Rust-test pass.
- **`codex` binary on `PATH` is required** for runtime tests (`npm run smoke:runtime` and the Rust `runtime::session` tests). If absent, sessions fail with `AppError::CodexNotFound`. Surface this clearly rather than chasing the symptom.
- **Do not edit `protocol/app-server/`** unless the upstream Codex protocol source has changed. These are generated snapshots — hand-edits drift the contract silently.
- **CI exists, but local gates still matter.** Pull requests and `main` run `npm run check:ci` (full gate plus public/artifact audits). Run relevant local checks before handoff, but do not cook the machine with repeated full gates. If a gate fails, fix it and rerun the narrow failing gate first. Report gates run and stronger gates intentionally skipped.
- **Format-on-edit hook is wired.** TS/TSX/JS/JSX run through `oxfmt`, Rust through `rustfmt`. If a hook fails, fix the underlying issue — don't bypass it.
- **macOS-specific quirks:** `macOSPrivateApi: true` is required for the transparent always-on-top window. The Tauri asset protocol is scoped to bundled sample assets and the app-owned pet library — pet sprites should live in sidecar-managed pet packages.
- Pet imports should go through the app-owned sidecar library; do not rely on a developer-local global pet folder.
- **Pet runtime isolation:** pet Codex threads run through an app-owned runtime home with minimal config, not the developer's global Codex MCP/plugin config. Keep this isolation intact unless there is a deliberate compatibility plan.
