# Open Source Launch Proof

## Commit and branch

- Branch: `main`
- Implementation commit: `b051436` (`Prepare public open source launch`)
- Proof/documentation commit: `Document public launch proof` at final `HEAD`.
- Tracking state during final proof: local branch ahead of `origin/main`; no push was performed in this pass.
- Release state: source-ready local commit; no notarized binary release was produced in this pass.

## Objective checklist

- Public docs: `README.md`, `LICENSE`, `NOTICE`, `PRIVACY.md`, `SECURITY.md`, `CONTRIBUTING.md`, and CI workflow added.
- Public scrub: private local-agent symlinks/settings and private Olive/MVP docs removed; `audit:public` and `audit:artifacts` added.
- Bundled Olive: `assets/pets/olive` includes `pet.json`, `spritesheet.webp`, `personality.md`, and provenance/signoff README.
- Pet library: app-support library model added with max 20 pets, active pet switching, first-run Olive import, legacy migration, and import validation.
- Runtime safety: default runtime is ephemeral safe mode (`approvalPolicy: on-request`, `sandbox: workspace-write`); Power mode is explicit and confirmed in UI.
- Privacy defaults: ambient observers default off; screenshots/window titles remain opt-in.
- Tuck/wake: backend commands and tray/menu recovery added; timed tuck uses effective expiry state and scheduled wake.
- Repo-local skills: `.codex/skills/pet-hatching`, `.codex/skills/pet-personality`, `tools/pet-hatching`, and docs added.
- Review loops: security/privacy and clean-code review findings were triaged, fixed, and recorded in `docs/reviews/2026-05-05-open-source-clean-code-review.md`.

## Automated gates run

### `npm run check`

Status: passed.

Coverage in this gate:

- `npm run lint`
- `npm run format:check`
- `npm run build`
- `rm -rf dist`
- `npm test`: 6 frontend/domain test files, 27 tests passed.
- `npm run lint:rust`
- `cargo test --manifest-path src-tauri/Cargo.toml`: 52 Rust tests passed plus main/doc test harnesses.

### `npm run audit:public`

Status: passed; 959 files inspected after final proof.

### `npm run audit:artifacts`

Status: passed; 959 files inspected after final proof.

### `node scripts/doctor.mjs`

Status: passed required checks.

Observed:

- Node, npm, Cargo, Rust, and Codex CLI detected.
- Codex CLI responded without a model call.
- pet hatching validator help was runnable.
- Optional image-generation detection was not detected; this is a setup warning, not a required gate failure.

### `npm run smoke:runtime`

Status: passed.

Observed:

- Bad Codex path produced a recoverable ENOENT setup failure.
- Codex OAuth account check passed.
- `thread/start` returned `ephemeral: true`, `path: null`, `approvalPolicy: "on-request"`, and `sandbox.type: "workspaceWrite"`.

### `node scripts/smoke-skill-workflows.mjs`

Status: passed.

Observed:

- Repo-local hatching/personality skills and hatching scripts exist.
- `validate_atlas.py --help` and `prepare_pet_run.py --help` are runnable.
- Offline prompt generation works.

## Manual/bounded app proof

Command run in a bounded non-interactive smoke:

```bash
npm run tauri:dev
```

Observed from `/tmp/codex-pet-sidecar-tauri-dev.log`:

- Vite dev server became ready at `http://localhost:1420/`.
- Tauri compiled the Rust app successfully.
- `target/debug/codex-pet-sidecar` launched.
- The process was terminated after the bounded smoke window to avoid leaving a GUI app running from the API session.

Not fully observed in this non-interactive environment:

- Visual Olive animation.
- Tray click behavior by hand.
- Personality editor manual save.
- Switching with a second real pet package.

These are partially covered by automated Rust/TS tests and command smoke, but a human desktop QA pass is still useful before distributing a binary.

## Remaining release risks

- No signed/notarized macOS binary was built.
- Optional image-generation availability was not detected by `doctor`; users may need to configure image-generation access before hatching pets.
- Tauri CSP remains permissive (`csp: null`) as a residual defense-in-depth improvement.
- Power mode can still be represented by a saved config; UI confirmation is implemented, but backend transition policy could be stronger in a future hardening pass.
