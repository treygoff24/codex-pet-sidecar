# Repository Guidelines

## Project structure and module organization

This repo is a Tauri 2 desktop app with a React/Vite frontend. Frontend code lives in `src/`: shared domain models are in `src/domain`, reusable hooks in `src/hooks`, UI components in `src/ui`, and the Tauri command bridge in `src/runtimeBridge.ts`. Rust backend code lives in `src-tauri/src`, split by responsibility: `runtime` for Codex process/session plumbing, `observers` for local activity signals, `pets` for installed pet discovery, `state` and `memory` for persisted configuration, and `commands.rs` for Tauri invoke handlers. Protocol snapshots and generated TypeScript live under `protocol/app-server`. Specs and implementation plans belong in `docs/specs` and `docs/plans`. Built artifacts go to `dist` and should not be edited by hand.

## Build, test, and development commands

Use `npm run dev` for the Vite frontend only, usually on port `1420`. Use `npm run tauri:dev` for the full desktop app. `npm run build` runs TypeScript checking and creates the web bundle. `npm test` runs the full Vitest suite once; `npm run test:watch` keeps Vitest open during UI/domain work. `cargo test --manifest-path src-tauri/Cargo.toml` runs Rust tests.

Local validation is tiered:

- `npm run check:fast` is the cheap inner-loop gate: oxlint, TypeScript no-emit checking, and `cargo check`.
- `npm run check:local` is the local confidence gate before claiming a task, plan step, or milestone complete: fast checks, format checks, capped Vitest, clippy, and Rust lib tests.
- `npm run check:full` is the full deterministic gate: format/lint, production web build, full Vitest, clippy, and all Rust tests. `npm run check` is kept as an alias for this full gate.
- `npm run check:ci` adds `audit:public` and `audit:artifacts` for CI/pre-merge/public-release readiness.

Do not run full gates repeatedly during normal implementation. Use targeted tests and `check:fast` while editing; run `check:local` before handoff or milestone completion; reserve `check:full`, `check:ci`, Tauri builds, smoke drivers, and release audits for final verification, CI/pre-merge, or changes that directly require them.

## Coding style and naming conventions

Use TypeScript, React function components, and explicit exported types for cross-module contracts. Match the existing two-space indentation and double-quoted imports in TS/TSX. Component files use PascalCase, hooks start with `use`, domain helpers use camelCase, and tests sit next to the code in `__tests__` or use `*.test.ts(x)`. Rust modules use snake_case files, small focused structs, `thiserror` for typed errors, and `Result<T, AppError>` across command/runtime boundaries.

## Testing guidelines

Vitest runs in `jsdom` with `src/testSetup.ts`. Prefer behavior tests around domain logic, hooks, and the `runtimeBridge` contract rather than snapshot-heavy UI tests. Rust tests should cover parsing, rate limits, config persistence, and process/runtime edge cases. Add or update tests with every behavior change, run the narrow failing or related test first, and rerun the narrow gate after a fix before escalating. If a gate fails, fix the issue and rerun the narrow failing gate first instead of rerunning every gate. Multiple agents may be active in different worktrees, so avoid unnecessary CPU saturation and report which gates you ran plus any skipped stronger gates with the reason.

## Commit and pull request guidelines

History currently has only `Initial scaffold`, so use concise imperative commits such as `Add runtime approval bridge` or `Fix pet mute persistence`. PRs should include a short summary, test evidence, linked issue or plan when applicable, and screenshots or screen recordings for visible pet/UI changes.

## Agent-specific instructions

Respect dirty worktrees. Do not rewrite generated protocol files unless the protocol source changed. Avoid committing secrets, local paths beyond documented defaults, or personal Codex state.
