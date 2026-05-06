# Codex Pet Sidecar Public v1 Spec

Codex Pet Sidecar is an open-source local desktop pet sidecar for macOS. It began as a personal toy, but public v1 optimizes for safe defaults, clear onboarding, repo-local pet creation workflows, and no dependency on private Codex app state.

## Product thesis

A user should be able to clone the repository, install dependencies, run the app, and meet Olive immediately. Olive is a fictional bundled sample pet. Users can later hatch or import their own pets, switch the active pet, edit personality and memory, and choose how much local context the pet may observe.

The app owns its own Codex CLI `app-server` child process. It does not patch, inspect, or depend on the Codex Mac app bundle.

## Public v1 in scope

- Bundled Olive sample pet.
- Ephemeral default Codex sessions.
- Safer runtime default with opt-in Power mode.
- Multi-pet library up to 20 pets.
- One active pet with pet switching.
- Tuck/wake, including a tray/menu recovery surface.
- Repo-local pet hatching skill and deterministic scripts.
- Repo-local personality skill.
- Install, privacy, security, contribution, and troubleshooting docs.

## Out of scope

- Multiple simultaneous desktop pets.
- Saved pet threads as the default.
- YOLO or broad filesystem access as the default.
- Official Codex Mac app integration claims.
- Silent image-generation spending.

## Acceptance defaults

- `maxPets: 20`
- `defaultThreadPersistence: ephemeral`
- `defaultRuntimeMode: safe`
- `bundledDefaultPetId: olive`
- Public fictional sample human names: Riley and Morgan

## Runtime safety

Safe mode starts pet sessions with ephemeral history, no extended history persistence, workspace-write sandboxing, and approval-on-request behavior when supported by the installed app-server protocol. If safe mode is not supported, the app must fail closed and explain the setup issue. Power mode is available only after an explicit user setting.

## Privacy and observers

Observers are local and configurable. Active app, window title, workspace status, idle state, and screenshots must be disclosed in settings. Screenshots are opt-in and can be configured not to persist after a turn.

## Pet package contract

A pet package contains `pet.json`, `spritesheet.webp`, `personality.md`, `memory.md`, `pet.config.json`, and optional QA files. The spritesheet must be package-relative, regular, non-hard-linked, non-symlink-escaping, and exactly `1536x1872`.
