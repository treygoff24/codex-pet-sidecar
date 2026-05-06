# Open Source Launch Review Loop

## Scope

Review/fix loop for `docs/plans/2026-05-05-open-source-public-launch.md`, covering public hygiene, bundled Olive, pet library, runtime safety, tuck/wake, repo-local skills, audits, and launch proof.

## Loop 1: clean-code review

Reviewer result: changes requested.

Findings accepted and fixed:

1. Timed tuck used raw persisted state on the frontend instead of effective expiry-aware state.
   - Fix: added `isTuckActive` in TypeScript, used effective state in runtime startup and `TuckWakeControl`, and scheduled backend wake for timed tucks.
   - Tests: `src/domain/__tests__/petConfig.test.ts`, Rust tuck tests.
2. Olive reset button rendered with no handler.
   - Fix: render reset button only when `onResetPersonality` is provided.
   - Tests: `SettingsPanel` absent/present handler tests.
3. Placeholder repository metadata passed audit.
   - Fix: removed placeholder package metadata and extended public audit for placeholder URLs.
   - Tests: `npm run audit:public`.
4. Unused frontend default config duplicated backend defaults.
   - Fix: removed `src/domain/defaultPet.ts` and kept backend defaults authoritative.

## Loop 1: security/privacy review

Reviewer result: public launch blocked by P1/P2 findings.

Findings accepted and fixed:

1. Pet IDs were not strict slugs and could escape app-support paths.
   - Fix: added strict `^[a-z0-9][a-z0-9-]{0,63}$` validation across manifests, library load/save, config load/save, imports, and active-pet selection.
   - Tests: invalid manifest/import/library/legacy config tests.
2. Default ambient observers sent local context without opt-in.
   - Fix: default ambient and observers off; window title and screenshots remain opt-in.
   - Tests: config default tests.
3. Safe workspace fallback could be broad.
   - Fix: runtime defaults to app-owned scratch workspace; user workspaces are canonicalized and root/home/app-support/symlink/non-directory paths are rejected.
   - Tests: workspace validation tests.
4. Optional imported files bypassed symlink/hardlink checks.
   - Fix: optional `personality.md` and `README.md` now validate regular, package-contained, non-hard-linked files before copy.
   - Tests: optional symlink rejection test.
5. Power mode was one click.
   - Fix: UI requires explicit confirmation after arming Power mode.
   - Tests: settings Power-mode confirmation test.
6. Hatching fallback exposed API key in process argv.
   - Fix: replaced curl subprocess calls with in-process `urllib.request` multipart requests.
   - Tests/audit: public audit rejects secret-bearing command patterns.
7. Olive README had local/private provenance residue.
   - Fix: rewrote provenance to public sample language; public audit rejects local Codex provenance residue.
8. Audits could pass while deleted tracked sensitive files remained in HEAD.
   - Fix: committed the scrub and added a deleted-tracked-file guard to `audit:public`.

## Loop 2: clean-code review

Reviewer result: prior findings fixed; one release maintainability finding remained.

Finding accepted and fixed:

- Rust lockfile must be retained for reproducible Tauri app builds.
  - Fix: regenerated and committed `src-tauri/Cargo.lock` after dependency changes.

## Loop 2: security/privacy review

Reviewer result: prior blockers fixed except HEAD residue and persisted-state pet ID validation.

Findings accepted and fixed:

1. HEAD/origin residue: committed public scrub at `b051436` and added deleted-tracked-file audit guard.
2. Persisted-state pet ID validation gap: `load_library` and legacy `load_config` fallback now validate loaded IDs before path use.

## Final reviewer disposition

No unresolved P0/P1/P2 security findings remain in the live committed tree after the accepted fixes. No unresolved high-confidence clean-code findings remain after restoring the Rust lockfile and committing the scrub.

## Final verification

- `npm run check` passed after final fixes.
- `npm run audit:public` passed on committed tree.
- `npm run audit:artifacts` passed on committed tree.
- `node scripts/doctor.mjs` passed required checks; image-generation detection is optional and reported not detected.
- `npm run smoke:runtime` passed and confirmed ephemeral safe runtime defaults.
- `node scripts/smoke-skill-workflows.mjs` passed.
- Bounded `npm run tauri:dev` launched Vite, compiled Tauri, and ran `target/debug/codex-pet-sidecar`; process was then terminated for the non-interactive proof run.
