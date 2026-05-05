# Local MVP proof - 2026-05-05

## Static gates

- `npm run check`: passed. Frontend build passed, Vitest passed 11 tests, and Rust tests passed 17 tests.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`: passed with `-D warnings`.
- `node scripts/probe-codex-app-server.mjs`: passed. Verified sidecar-owned app-server startup, `initialize`, and `model/list`.
- `node scripts/smoke-codex-runtime.mjs`: passed. Verified bad Codex path failure, sidecar-owned app-server startup, `initialize`, and ephemeral `thread/start` with `on-request` approvals and `workspace-write` sandbox.

## Implemented MVP evidence

- Pet discovery validates `pet.json` plus exact `1536x1872` WebP spritesheet dimensions.
- App support paths create `pet.config.json` and `memory.md` under `~/Library/Application Support/Codex Pet Sidecar/pets/<pet-id>/`.
- Runtime starts its own `codex app-server --listen ws://127.0.0.1:0` child and parses the loopback WebSocket URL from stderr.
- Runtime composes `baseInstructions` from pet name, persona, and full `memory.md` contents.
- Runtime composes `developerInstructions` with behavior rules and the absolute `memory.md` path.
- UI has first-launch picker, pet sprite, speech bubble, chat drawer, settings, mute controls, approval prompt, recoverable error display, and native drag handle.
- Observer digests are metadata-only and routed through the same frontend event stream as runtime events.
- Proactive engine is wired to observer digests and injects only returned-from-idle and repo-changed prompts after mute/rate-limit checks.

## Bounded Tauri dev launch

`npm run tauri:dev` was launched for a bounded local smoke. Evidence:

- Vite served on `http://localhost:1420/`.
- Cargo built and ran `target/debug/codex-pet-sidecar`.
- The earlier macOS transparent-window warning was fixed by enabling `app.macOSPrivateApi`.
- Debug Tauri app process was observed at about 144 MB RSS. This is over the rough 80 MB target, but it is a dev/debug run; release/dogfood RSS still needs measurement.
- No sidecar-owned app-server child was expected in this bounded run because no pet was selected and no runtime thread was started.
- Cleanup required killing the dev app/Vite processes from the shell harness; after cleanup, no `target/debug/codex-pet-sidecar`, Vite, or sidecar-owned `codex app-server --listen ws://127.0.0.1:0` process remained.

## Manual/rendered checks not completed in this run

These still need a live desktop pass before the MVP should be called dogfood-complete:

- Screenshot evidence for pet, bubble, drawer, approval/error state.
- First-launch picker with real installed pets.
- Chat sends a paid/live turn and receives streamed text.
- Ask the pet to remember a harmless fact, verify `memory.md` changes through Codex filesystem tools, restart a thread, and verify injected memory.
- Verify the `memory.md` write approval/grant path, because the file lives outside the workspace-write sandbox root.
- Close Codex Mac app and rerun the app-server probe. Skipped here to avoid disrupting the live user session.
- Trigger and approve a real destructive/write approval prompt.
- Returned-from-idle and repo-changed proactive behavior in the running desktop app.
- Release/dogfood RSS measurement under the approximate 80 MB target.
- App-server child cleanup after quitting the Tauri app after a real runtime session.

## One-week dogfood checkpoint

After one week of use, record:

- Do I still want the pet on my desktop?
- Which messages felt charming vs annoying?
- Did mute/rate limiting keep interruptions acceptable?
- Did memory updates help, or did they feel risky/noisy?
- Did the approval path feel trustworthy enough for normal Codex tool use?
