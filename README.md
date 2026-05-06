# Codex Pet Sidecar

Codex Pet Sidecar is an open-source local desktop pet for macOS. It runs as a Tauri 2 app with a React/Vite frontend, keeps pet assets and settings in the app's support directory, and talks to a sidecar-owned `codex app-server` process for optional pet conversation.

Olive, a fictional imperial dog, ships as the bundled sample pet so a fresh launch has something delightful without requiring a private global pet folder.

## Requirements

- macOS.
- Node.js and npm.
- Rust and Cargo.
- A working Codex CLI on `PATH` for chat/runtime features.
- Codex authentication configured by the user.
- Optional image-generation access if you want Codex to hatch new pets.

This is not an official Codex Mac app feature and does not patch or inspect the Codex Mac app bundle.

## Quick start from source

```bash
npm install
npm run check
npm run tauri:dev
```

For frontend-only iteration:

```bash
npm run dev
```

## Safety model

Public defaults use ephemeral pet sessions and a safer workspace-write runtime mode. Saved pet sessions and Power mode are explicit opt-ins. Power mode can grant broad filesystem access to Codex and should only be enabled for trusted workspaces.

## Privacy model

The app stores pet profiles, personality files, and memory files locally under the platform app-support directory. Observers for active app, window title, workspace status, idle state, and screenshots are controlled from settings. Screenshots are opt-in and may require macOS Screen Recording permission. The project does not include telemetry.

## Pet library and hatching

The app supports one active pet and up to 20 installed pets. Bundled Olive is copied into the app-owned pet library on first launch. New pets can be staged with the repo-local `.codex/skills/pet-hatching` workflow and imported after validation. Personality files can be edited manually or drafted with `.codex/skills/pet-personality`.

## Useful commands

```bash
npm run check
npm run audit:public
npm run audit:artifacts
node scripts/doctor.mjs
npm run smoke:runtime
node scripts/smoke-skill-workflows.mjs
```

## Troubleshooting

- `codex binary was not found on PATH`: install or expose the Codex CLI before starting the runtime.
- Safe runtime unavailable: update Codex CLI or explicitly enable Power mode only if you accept the risk.
- No pet appears: run `npm run audit:artifacts` and confirm `assets/pets/olive` is present in source builds.
- Screenshot awareness is text-only: grant Screen Recording permission or leave screenshot context disabled.
