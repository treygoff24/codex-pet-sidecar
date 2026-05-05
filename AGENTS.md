# Repository Guidelines

## Project structure and module organization

This repo is a Tauri 2 desktop app with a React/Vite frontend. Frontend code lives in `src/`: shared domain models are in `src/domain`, reusable hooks in `src/hooks`, UI components in `src/ui`, and the Tauri command bridge in `src/runtimeBridge.ts`. Rust backend code lives in `src-tauri/src`, split by responsibility: `runtime` for Codex process/session plumbing, `observers` for local activity signals, `pets` for installed pet discovery, `state` and `memory` for persisted configuration, and `commands.rs` for Tauri invoke handlers. Protocol snapshots and generated TypeScript live under `protocol/app-server`. Specs and implementation plans belong in `docs/specs` and `docs/plans`. Built artifacts go to `dist` and should not be edited by hand.

## Build, test, and development commands

Use `npm run dev` for the Vite frontend only, usually on port `1420`. Use `npm run tauri:dev` for the full desktop app. `npm run build` runs TypeScript checking and creates the web bundle. `npm test` runs Vitest once; `npm run test:watch` keeps Vitest open during UI/domain work. `cargo test --manifest-path src-tauri/Cargo.toml` runs Rust tests. `npm run check` is the repo gate: frontend build, frontend tests, then Rust tests.

## Coding style and naming conventions

Use TypeScript, React function components, and explicit exported types for cross-module contracts. Match the existing two-space indentation and double-quoted imports in TS/TSX. Component files use PascalCase, hooks start with `use`, domain helpers use camelCase, and tests sit next to the code in `__tests__` or use `*.test.ts(x)`. Rust modules use snake_case files, small focused structs, `thiserror` for typed errors, and `Result<T, AppError>` across command/runtime boundaries.

## Testing guidelines

Vitest runs in `jsdom` with `src/testSetup.ts`. Prefer behavior tests around domain logic, hooks, and the `runtimeBridge` contract rather than snapshot-heavy UI tests. Rust tests should cover parsing, rate limits, config persistence, and process/runtime edge cases. Add or update tests with every behavior change, then run the narrow test first and `npm run check` before handoff.

## Commit and pull request guidelines

History currently has only `Initial scaffold`, so use concise imperative commits such as `Add runtime approval bridge` or `Fix pet mute persistence`. PRs should include a short summary, test evidence, linked issue or plan when applicable, and screenshots or screen recordings for visible pet/UI changes.

## Agent-specific instructions

Respect dirty worktrees. Do not rewrite generated protocol files unless the protocol source changed. Avoid committing secrets, local paths beyond documented defaults, or personal Codex state.
