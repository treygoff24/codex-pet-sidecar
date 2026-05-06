# Codex Pet Sidecar Open Source Launch Implementation Plan

**Goal:** Convert Codex Pet Sidecar from a personal Olive/private-user toy into a public-safe open-source desktop pet app that still ships with Olive installed by default as a delightful out-of-the-box pet.

**Architecture:** Keep the current Tauri 2 + React/Vite frontend and Rust broker, but move from a single personal pet config to a public pet library with one active pet, up to 20 installed pets, per-pet personality/memory/state, safer Codex runtime defaults, and a repo-local Codex skill workflow for hatching sprites and creating personalities. The sidecar must own its own Codex CLI `app-server` child process and must never patch, inspect, or depend on the Codex Mac app bundle.

**Tech Stack:** Tauri 2, Rust, React, TypeScript, Vite, Codex CLI app-server JSON-RPC, repo-local Codex skills, vendored deterministic pet hatching scripts, Vitest, Rust unit tests, `npm run check`, and manual Tauri smoke verification on macOS.

---

## Non-negotiable product decisions

1. **Olive ships by default as a fictionalized sample pet.** Public builds include Olive's current look and the same broad personality/lore experience, but the publishable persona is a privacy-reviewed fictionalization, not a raw private biography with names swapped:
   - `PRIVATE_USER_NAME` -> `Riley`
   - `PRIVATE_PARTNER_NAME` -> `Morgan`
   - Keep Olive, Oliveous, imperial-dog lore, food/squeaker/door personality, and the dry register.
   - Remove or generalize any non-consented real-person facts, private household facts, private events, private repo references, addresses, paths, or identifying details beyond the fictional sample names.
   - Require explicit publisher signoff for both sprite provenance and persona privacy before the asset is treated as public-ready.
2. **Ephemeral Codex sessions are the default.** Pet turns must not pollute a user's normal Codex app history unless the user explicitly opts into saved pet sessions.
3. **Safer runtime defaults are public defaults.** Public builds start in `workspace-write` + approval-on-request style behavior if supported by the current app-server protocol. `danger-full-access` / YOLO is an explicit "Power mode" setting with strong copy.
4. **Multi-pet library, one active pet.** The app stores up to 20 pets, each with its own sprites, personality, memory, mute/tuck state, observer settings, and optional saved-session preference.
5. **Tuck means hidden and silent.** A tucked pet hides from the desktop and suppresses proactive/ambient turns until woken from a tray/menu recovery surface.
6. **Hatching is local to this repo.** The public repo vendors/adapts the `hatch-pet` workflow and deterministic scripts rather than depending on a developer-global hatch-pet skill install.
7. **No personal paths or secrets.** Public source cannot include `/Users/<private-user>/...`, real family names, private Codex state, generated run artifacts with unknown provenance, or token-like placeholders.
8. **Open-source docs must be honest.** The README must say this requires a working Codex CLI and user-provided model/image-generation access; it is not an official OpenAI/Codex Mac app feature unless that becomes true.

## Acceptance criteria

- Fresh clone can run `npm install` and `npm run check`.
- Fresh app launch shows Olive as an installed bundled pet without requiring a developer-global Olive pet folder.
- Olive's bundled personality contains no current private first names, `/Users/<private-user>`, or private repo references.
- Starting a public-default pet runtime sends `thread/start` with `ephemeral: true`.
- Saved Codex pet sessions are off by default and covered by an explicit opt-in setting.
- Runtime default is safer than `approvalPolicy: "never"` + `sandbox: "danger-full-access"`; Power mode remains available only behind an explicit setting.
- User can hatch/import up to 20 pets and switch the active pet.
- User can edit personality manually or launch a Codex personality-creation flow.
- User can tuck and wake the pet through a reliable tray/menu/menu-bar recovery surface.
- Public docs include install, setup, privacy, security, contribution, and troubleshooting guidance.
- Vendored hatching code includes license/provenance notices.
- Final execution concludes with security, public-scrub, and clean-code review/fix loops until no blocking or high-confidence findings remain.

## Subagent orchestration model

The parent orchestrator owns sequencing, conflict resolution, final verification, and review acceptance. Subagents work in isolated forks/workspaces when available. Parallel implementation lanes must have disjoint write sets. The orchestrator must not let two write agents edit the same owned files in the same phase.

Use these skills by lane:

| Skill                    | Used by                               | Purpose                                                                  |
| ------------------------ | ------------------------------------- | ------------------------------------------------------------------------ |
| `writing-plans`          | orchestrator                          | Keep this plan concrete and executable.                                  |
| `hatch-pet`              | hatching lane, asset lane             | Preserve 8x9 atlas, QA, validation, `pet.json` contract.                 |
| `skill-creator`          | skills lane                           | Create repo-local Codex skills for hatching and personality.             |
| `clean-code`             | every implementer and final reviewers | Small modules, meaningful names, testable boundaries, low comment noise. |
| `rust-engineer`          | Rust lanes                            | App state, runtime, paths, tray, filesystem correctness.                 |
| `frontend-delight`       | UI lanes                              | Onboarding, pet switcher, tuck/wake, settings polish.                    |
| `webapp-testing`         | UI QA lane                            | Rendered interaction checks and screenshots where possible.              |
| `receiving-code-review`  | review-fix lanes                      | Triage findings into targeted fixes without thrash.                      |
| `slop-cleaner`           | final cleanup                         | Remove personal residue, AI cruft, placeholder docs, redundant comments. |
| `spec-quality-checklist` | plan/spec/docs reviewers              | Catch ambiguity and acceptance gaps.                                     |

Subagent roster:

| Lane                             | Subagent type                           | Write scope                                                            | Output                                                  |
| -------------------------------- | --------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| Public spec                      | `product_analyst`                       | `docs/specs/**`, this plan if delegated                                | Updated public product spec.                            |
| Protocol safety                  | `docs_researcher`                       | `docs/spikes/**`, `scripts/probe-codex-app-server.mjs`                 | Verified runtime knobs for ephemeral/sandbox/approval.  |
| Repo hygiene                     | `worker`                                | root docs/config only                                                  | License/docs/package hygiene.                           |
| Olive asset                      | `worker`                                | `assets/pets/olive/**`, bundled resource config                        | Bundled Olive package with public persona.              |
| Skill workflow                   | `mcp_developer` or `worker`             | `.codex/skills/**`, `tools/pet-hatching/**`, `docs/skills/**`          | Repo-local hatching and personality skills.             |
| Pet library backend              | `heavy_worker`                          | `src-tauri/src/state/**`, `src-tauri/src/pets/**`, tests               | Multi-pet model and persistence.                        |
| Runtime safety                   | `heavy_worker`                          | `src-tauri/src/runtime/**`, tests                                      | Ephemeral default and runtime mode selection.           |
| Tray/tuck backend                | `worker`                                | `src-tauri/src/commands.rs`, `src-tauri/src/app_state.rs`, tray module | Tuck/wake state and recovery surface.                   |
| Frontend onboarding              | `ui_fix_worker`                         | `src/App.tsx`, `src/ui/Onboarding*`, `src/ui/PetLibrary*`, CSS, tests  | First-run and pet library UI.                           |
| Frontend settings                | `ui_fix_worker`                         | `src/ui/SettingsPanel.tsx`, settings tests                             | Personality/runtime/observer controls.                  |
| Integration tests                | `test_hardener`                         | `src/**/__tests__`, Rust tests, smoke scripts                          | Coverage for new flows.                                 |
| Security/privacy review          | `security_auditor`                      | read-only                                                              | Risk findings for tool/screenshot/permissions defaults. |
| Clean-code review                | `reviewer` with clean-code instructions | read-only                                                              | Maintainability findings and blocking cleanup list.     |
| Review fixes                     | `refactor_pilot` / owning worker        | only accepted findings                                                 | Clean-code/security/UI fixes.                           |
| Final plan/implementation review | `plan_reviewer`, then `reviewer`        | read-only                                                              | Confirms dependency order, gates, and completion.       |

## Phase ownership table

| Phase                                | Parallel lanes allowed                                                      | Write ownership rule                                                                                                                                                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Plan/spec/protocol                | Public spec and protocol safety may run in parallel                         | No app implementation edits except probe script.                                                                                                                                                                                                                                                |
| B: Hygiene/assets/skills             | Repo hygiene first, then Olive asset and skill workflow may run in parallel | Repo hygiene owns root docs, package metadata, `.gitignore`, audits, and local-agent artifact cleanup. Olive asset owns bundled pet assets, `src-tauri/tauri.conf.json`, and Rust asset-discovery code. Skill workflow owns only real repo-local skill directories, `tools/**`, and skill docs. |
| C: Backend models                    | Pet library first, then runtime safety                                      | Pet library owns shared state/config. Runtime safety consumes the new config contract and owns runtime code.                                                                                                                                                                                    |
| D: UI implementation                 | Onboarding first, then settings                                             | Onboarding owns shared app shell/style structure. Settings consumes those components and owns settings-specific UI.                                                                                                                                                                             |
| E: Integration                       | Serial                                                                      | May edit across frontend/backend to wire flows. No other write agents.                                                                                                                                                                                                                          |
| F: Public scrub and review/fix loops | Reviews read-only; fix lanes serial or disjoint by owner                    | Public scrub is a hard gate before security and clean-code final review. Each accepted finding assigned to one owning fixer.                                                                                                                                                                    |
| G: Final proof                       | Serial                                                                      | Verification docs and release checklist only unless a blocker sends work back.                                                                                                                                                                                                                  |

## Task 1: Public spec refresh

**Parallel:** yes, with Task 2  
**Blocked by:** none  
**Owned files:** `docs/specs/2026-05-05-codex-pet-sidecar.md`, `docs/plans/2026-05-05-open-source-public-launch.md` only if plan drift is discovered  
**Invariants:** Preserve sidecar-owned Codex app-server. Do not depend on `/Applications/Codex.app`. Olive remains bundled by default.  
**Out of scope:** Code changes.

**Files:**

- Modify: `docs/specs/2026-05-05-codex-pet-sidecar.md`

**Step 1: Update the product thesis**
Revise the spec from "personal toy" to "open-source local desktop pet sidecar." Keep a note that the project began as a personal toy but public defaults now optimize for safety and onboarding.

**Step 2: Replace v1 in/out list**
Make these public v1 items "in":

- bundled Olive sample pet
- ephemeral default sessions
- safer runtime default with opt-in Power mode
- multi-pet library up to 20 pets
- pet switching
- tuck/wake
- repo-local hatching skill
- repo-local personality skill
- install/onboarding/docs

Move or delete now-stale "out" items:

- multiple pets at once stays out
- saved pet threads become opt-in, not default
- YOLO by default is removed

**Step 3: Record acceptance decisions**
Add exact defaults:

- `maxPets: 20`
- `defaultThreadPersistence: ephemeral`
- `defaultRuntimeMode: safe`
- `bundledDefaultPetId: olive`
- fictional public human names: Riley and Morgan

**Verification plan:**

- Primary command: `rg -n "personal toy|ephemeral: false|danger-full-access, by design|<private-user-name>|<private-partner-name>|/Users/<private-user>" docs/specs/2026-05-05-codex-pet-sidecar.md`
- Expected: no stale personal-toy defaults remain except a historical note if deliberately retained.

## Task 2: Protocol safety refresh

**Parallel:** yes, with Task 1  
**Blocked by:** none  
**Owned files:** `docs/spikes/2026-05-05-codex-app-server-protocol.md`, `scripts/probe-codex-app-server.mjs`, optional `scripts/smoke-codex-runtime.mjs` assertions  
**Invariants:** Do not create persistent user-visible threads during probes unless the probe archives them immediately.  
**Out of scope:** Production runtime code.

**Files:**

- Modify: `scripts/probe-codex-app-server.mjs`
- Modify: `scripts/smoke-codex-runtime.mjs`
- Modify: `docs/spikes/2026-05-05-codex-app-server-protocol.md`

**Step 1: Probe supported safe runtime fields**
Run a probe that verifies `thread/start` accepts:

- `ephemeral: true`
- safe approval policy value from generated protocol (`on-request`, `untrusted`, or the current equivalent)
- `sandbox: "workspace-write"`
- existing `baseInstructions` / `developerInstructions`

**Step 2: Probe opt-in Power mode**
Verify existing power payload remains supported:

- `approvalPolicy: "never"`
- `sandbox: "danger-full-access"`

**Step 3: Update smoke expectations**
Change smoke assertions that currently expect saved history to expect `ephemeral: true` for public default. Add a separate opt-in saved-session smoke if needed.

**Step 4: Define fail-closed behavior**
If the current app-server protocol does not support the desired safe default (`workspace-write` plus approval-on-request or equivalent), document the safest supported combination and update the implementation plan before coding runtime constants.

Forbidden fallback: do not silently choose Power mode (`approvalPolicy: "never"` + `danger-full-access`) when safe mode is unavailable.

Required behavior if no safe mode is available:

- disable automatic runtime start
- show a recoverable setup/error message explaining that this Codex version cannot provide the public safe default
- allow Power mode only after the user explicitly enables it in settings

**Verification plan:**

- Primary command: `node scripts/probe-codex-app-server.mjs`
- Secondary command: `npm run smoke:runtime`
- Expected: probe documents the exact safe approval value and smoke confirms public default is ephemeral.

## Task 3: Repo open-source hygiene

**Parallel:** no  
**Blocked by:** Task 1 decisions  
**Owned files:** `README.md`, `LICENSE`, `NOTICE`, `PRIVACY.md`, `SECURITY.md`, `CONTRIBUTING.md`, `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `.gitignore`, `.github/workflows/**`, `scripts/audit-public.mjs`, `scripts/audit-artifacts.mjs`, `.claude/**`, `.agents/**`, `.codex/hooks.json`, existing `.codex/skills/*` project-skill symlinks  
**Invariants:** Do not remove project agent instructions unless they are private or unsafe to publish. Do not commit generated `dist/`, `node_modules/`, local screenshots, or pet hatch run artifacts.  
**Out of scope:** App behavior.

**Files:**

- Create: `README.md`
- Create: `LICENSE`
- Create: `NOTICE`
- Create: `PRIVACY.md`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `.github/workflows/check.yml`
- Create: `scripts/audit-public.mjs`
- Create: `scripts/audit-artifacts.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `.gitignore`
- Delete or replace: `.claude/settings.json`
- Delete or replace: `.claude/skills/check/SKILL.md`
- Delete or replace: untracked `.claude/skills/*` symlinks/local tooling files
- Delete or replace: `.agents/**`
- Delete or replace: `.codex/hooks.json`
- Delete or replace: existing tracked `.codex/skills/*` symlinks that point outside the repo

**Step 1: Add public docs**
Write concise docs covering:

- what the app does
- requirements: macOS, Codex CLI, Codex auth, optional image generation
- quick start from source
- how hatching works
- privacy model: local app support files, optional observers, optional screenshots, no project telemetry
- safety model: safe default vs Power mode

**Step 2: Add license and notice**
Use a permissive license for this repo. If vendoring Apache-2.0 hatching scripts, include their license/provenance in `NOTICE`.

**Step 3: Normalize package metadata**
Update `package.json`:

- keep or remove `"private": true` intentionally; public GitHub repo does not require npm publishing
- add `description`, `repository`, `license`, `bugs`, `homepage`
- add `doctor` script after Task 5 creates it
- add `audit:public` for `node scripts/audit-public.mjs`
- add `audit:artifacts` for `node scripts/audit-artifacts.mjs`
- preserve/update `package-lock.json`; CI uses `npm ci`, so the lockfile is canonical

Update `src-tauri/Cargo.toml`:

- neutralize `authors = ["private author name"]` for public launch, or remove the field if preferred
- keep package name/version consistent with Tauri config

**Step 4: Clean tracked and untracked local-agent artifacts**
Public launch must not track or leave easy-to-stage private local agent runtime settings or symlinks into a developer's home directory.

Handle current tracked and untracked artifacts as follows:

- remove `.claude/settings.json` unless it is rewritten as public-safe repo tooling
- remove `.claude/skills/check/SKILL.md` unless it is rewritten as a real public repo skill
- remove existing `.codex/skills/*` symlinks to external skill-library paths
- remove `.codex/hooks.json` unless rewritten as public-safe repo tooling
- remove `.agents/**` unless rewritten as public-safe repo tooling
- remove untracked `.claude/skills/*` symlinks/local tooling files unless they are converted into intentional public repo skills
- keep only real files/directories under `.codex/skills/pet-hatching/**` and `.codex/skills/pet-personality/**` once Task 5 creates them

**Step 5: Add public audit scripts**
Create `scripts/audit-public.mjs` as a hard gate that scans tracked public source and suspicious untracked local-agent surfaces for:

- real personal names: the current private first names
- private paths: `/Users/<private-user>`
- stale unsafe-default claims: `danger-full-access, by design`, `approvalPolicy: "never"` as default, `ephemeral: false` as default
- token-looking placeholders
- tracked symlinks whose target is absolute, outside the repo, or contains `/Users/`
- unexpected `.claude/**` or `.codex/**` files outside explicitly public allowlisted repo-local skills
- any `.agents/**` content unless explicitly public and committed intentionally
- any `.codex/hooks.json`
- any untracked `.claude/skills/*` symlink or local tooling file

The unsafe-default matcher must distinguish stale product claims from generated protocol schemas/enums. Protocol snapshots may legitimately contain strings like `danger-full-access`; docs or runtime defaults must not claim they are the public default.

The script should have an explicit allowlist. Initial target: no allowlisted files. If a historical exception is absolutely required, name the exact file and exact accepted phrase in the script with a comment explaining why public launch permits it.

Create `scripts/audit-artifacts.mjs` as a hard gate that inspects both tracked files and `git ls-files -o --exclude-standard` untracked files, then fails if either set includes:

- `dist/`
- `node_modules/`
- `.DS_Store`
- `hatch-runs/`
- `generated_images/`
- `ambient-screenshots/`
- temporary QA videos outside deliberate fixtures
- external symlinks or symlinked directories under tracked paths
- `.agents/**`
- `.codex/hooks.json`
- `.claude/skills/*` untracked local skill symlinks/tooling

Update `.gitignore` in the same task so normal local runs do not accidentally stage:

- `hatch-runs/`
- `generated_images/`
- `ambient-screenshots/`
- temporary QA videos outside deliberate fixtures
- local Tauri/build/cache artifacts not already ignored

**Step 6: Add CI gate**
Create `.github/workflows/check.yml` running:

- `npm ci`
- `npm run check`
- `npm run audit:public`
- `npm run audit:artifacts`

**Verification plan:**

- Primary command: `npm run check`
- Secondary command: `npm run audit:public && npm run audit:artifacts`
- Expected: check passes, public scrub has no unexpected matches, and no public-unfriendly generated artifacts are tracked.

## Task 4: Bundled Olive sample pet

**Parallel:** yes, with Task 5  
**Blocked by:** Tasks 1, 3  
**Owned files:** `assets/pets/olive/**`, `src-tauri/tauri.conf.json`, `src-tauri/src/pets/**` only if asset discovery needs bundle support, `src/domain/defaultPet.ts`, `src/domain/petConfig.ts` default persona removal  
**Invariants:** Olive ships by default. No real private household names. No private paths. Preserve the existing Olive personality tone.  
**Out of scope:** Multi-pet persistence beyond discovery hooks.

**Files:**

- Create: `assets/pets/olive/pet.json`
- Create: `assets/pets/olive/spritesheet.webp`
- Create: `assets/pets/olive/personality.md`
- Create: `assets/pets/olive/README.md`
- Create: `src/domain/defaultPet.ts`
- Modify: `src/domain/petConfig.ts`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/pets/mod.rs`

**Step 1: Establish asset provenance**
Locate the current Olive spritesheet and `pet.json`. Confirm it is generated/owned in a way that can be included publicly. If provenance is unclear, run a fresh `hatch-pet` pass for Olive and use that output instead.

**Step 2: Add bundled pet files**
Add Olive under `assets/pets/olive/` with:

- `pet.json` using `id: "olive"`, `displayName: "Olive"`, and relative `spritesheetPath`
- `spritesheet.webp` matching `1536x1872`
- `personality.md` based on the current Olive persona but rewritten as a fictional bundled sample:
  - replace the current private user name with `Riley`
  - replace the current private partner name with `Morgan`
  - preserve the fun Oliveous/imperial-dog voice
  - remove or generalize real household relationships, private biographical details, private events, private repo references, addresses, local paths, and non-consented personal facts
- `README.md` documenting it as a bundled sample pet

**Step 2b: Add required public signoff artifact**
Add `assets/pets/olive/README.md` sections:

- Sprite provenance: source path or generation run, license/rights basis, signoff status.
- Persona provenance: source, fictionalization checklist, signoff status.
- Privacy checklist: no real people, no real private household details, no private paths, no private repos, no non-consented facts.

The implementation cannot proceed to final public gate until this README says the sprite and persona are publishable.

**Step 3: Remove personal default persona from TypeScript**
Replace `defaultPersona` in `src/domain/petConfig.ts` with a generic short default or import the bundled pet personality through backend setup. Public app defaults should not embed the full Olive text in compiled domain code unless intentionally mirrored from `assets/pets/olive/personality.md`.

**Step 4: Add bundle resource access and public asset scope**
Configure Tauri bundle resources so `assets/pets/olive/**` ships in production.

Update `src-tauri/tauri.conf.json` in this task:

- change the current personal bundle identifier to a neutral identifier such as `dev.codexpet.sidecar` unless a final domain is chosen
- remove old asset protocol scopes that require global/private Codex pet paths
- scope asset access to bundled Olive resources and sidecar app-support pet library paths only

Add Rust path resolution for bundled pets plus sidecar app-support pets. Fresh launch must not require `$HOME/.codex/pets/**` or any private runtime profile path.

**Step 4b: Harden shared pet manifest path resolution**
Before exposing any pet asset URL, ensure the shared pet resolver rejects:

- absolute `spritesheetPath` values in `pet.json`
- `..` traversal
- symlink escapes from the owning pet directory
- hard links or non-regular files where normal files are required
- manifest paths resolving outside bundled resource roots or sidecar app-support pet roots

These checks belong in the shared resolver used by bundled discovery, app-support loading, legacy migration, and Task 12 imports.

**Step 5: Add tests**
Test that bundled Olive:

- is discovered on first launch
- has exact spritesheet dimensions
- has no real personal names
- has a provenance/signoff README
- can be copied/imported into app support as a normal pet profile
- does not require old global/private Codex pet paths
- rejects absolute/traversal/symlink-escape/non-regular spritesheet paths before producing a Tauri asset URL

**Verification plan:**

- Primary command: `cargo test --manifest-path src-tauri/Cargo.toml`
- Secondary command: `npm run audit:public`
- Expected: Rust tests pass and public audit has no private-name/path matches in bundled Olive or default persona code.

## Task 5: Repo-local hatching and personality skills

**Parallel:** yes, with Task 4  
**Blocked by:** Tasks 1, 3  
**Owned files:** `.codex/skills/pet-hatching/**`, `.codex/skills/pet-personality/**`, `tools/pet-hatching/**`, `docs/skills/**`, `scripts/doctor.mjs`  
**Invariants:** Do not depend on a developer-global hatch-pet skill install. Do not patch the Codex Mac app. Preserve hatching validation semantics.  
**Out of scope:** App UI integration.

**Files:**

- Create: `.codex/skills/pet-hatching/SKILL.md`
- Create: `.codex/skills/pet-personality/SKILL.md`
- Create: `tools/pet-hatching/scripts/**`
- Create: `tools/pet-hatching/references/**`
- Create: `tools/pet-hatching/LICENSE.txt`
- Create: `docs/skills/pet-hatching.md`
- Create: `docs/skills/pet-personality.md`
- Create: `scripts/doctor.mjs`

**Step 1: Vendor deterministic hatching workflow**
Copy/adapt from the existing `hatch-pet` skill:

- prompt/run preparation
- imagegen job manifest
- record result
- frame extraction
- atlas composition
- validation
- contact sheet
- QA videos if dependencies are available
- package output

Change default output from any developer-global pet folder to the sidecar pet library import folder or an explicit `--output-dir`.

**Step 2: Rewrite skill instructions for this app**
`pet-hatching/SKILL.md` must instruct Codex to:

- create a base image
- generate row strips using `$imagegen`
- validate 8x9 `1536x1872`, `192x208` cells
- produce `pet.json`, `spritesheet.webp`, QA files
- import or stage the result for sidecar
- never fabricate visual assets with local code as a substitute for image generation

**Step 3: Create personality skill**
`pet-personality/SKILL.md` must:

- interview the user briefly
- produce structured `personality.md`
- include voice, lore, boundaries, proactive style, memory style
- allow adjustment commands like "make calmer", "make weirder", "less chatty"
- support writing directly to a selected pet's `personality.md`

**Step 4: Add doctor script**
`scripts/doctor.mjs` checks:

- Node/npm
- Rust/cargo
- Codex CLI on PATH
- Codex auth smoke if possible without spending money
- image generation availability if detectable
- pet hatching scripts import/run basic `--help`

**Step 5: Verify hatching run artifacts are ignored**
Do not edit `.gitignore` in this task; Task 3 owns it. Verify Task 3's ignore/audit policy covers:

- `hatch-runs/`
- `generated_images/`
- `*.mp4` under temporary QA unless explicitly under a tracked fixture folder

**Verification plan:**

- Primary command: `node scripts/doctor.mjs`
- Secondary command: `python3 tools/pet-hatching/scripts/validate_atlas.py --help`
- Expected: doctor reports actionable status without secrets; scripts can be invoked from repo paths.

## Task 6: Pet library backend

**Parallel:** no  
**Blocked by:** Tasks 1, 4  
**Owned files:** `src-tauri/src/state/**`, `src-tauri/src/pets/**`, `src-tauri/src/memory/**`, Rust tests for those modules  
**Invariants:** Existing valid user pets under Codex home may still be importable, but app-owned pets live under sidecar app support. Max installed pets is 20.  
**Out of scope:** Runtime session payloads.

**Files:**

- Modify: `src-tauri/src/state/config.rs`
- Modify: `src-tauri/src/state/paths.rs`
- Modify: `src-tauri/src/state/mod.rs`
- Modify: `src-tauri/src/pets/mod.rs`
- Modify: `src-tauri/src/pets/installed_pet.rs`
- Modify: `src-tauri/src/memory/file.rs`
- Create: `src-tauri/src/state/library.rs`

**Step 1: Introduce library model**
Create Rust structs:

```rust
pub const MAX_PETS: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PetLibrary {
    pub active_pet_id: Option<String>,
    pub pets: Vec<PetLibraryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PetLibraryEntry {
    pub pet_id: String,
    pub display_name: String,
    pub source: PetSource,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PetSource {
    Bundled {
        bundled_id: String,
    },
    UserCreated {
        created_by: String, // e.g. "pet-hatching-skill" or "manual-import"
    },
    Imported {
        original_path: Option<String>,
    },
    Migrated {
        migration_id: String,
    },
}
```

**Step 2: Move config to per-pet profile**
Replace single arbitrary `load_config` behavior with:

- `load_library`
- `save_library`
- `load_active_pet_config`
- `load_pet_config(pet_id)`
- `save_pet_config(pet_id, config)`
- `set_active_pet(pet_id)`

Add public-default runtime settings to `PetConfig` in this same task so Task 7 can consume them without touching shared state files:

```rust
pub struct RuntimeConfig {
    pub session_persistence: SessionPersistence,
    pub safety_mode: RuntimeSafetyMode,
}

pub enum SessionPersistence {
    Ephemeral,
    SavedHistory,
}

pub enum RuntimeSafetyMode {
    Safe,
    Power,
}
```

Defaults must be `SessionPersistence::Ephemeral` and `RuntimeSafetyMode::Safe`.

**Step 3: Add per-pet files**
For each pet:

- `pet.config.json`
- `personality.md`
- `memory.md`
- `pet.json`
- `spritesheet.webp`
- optional `qa/`

**Step 3b: Use the shared secure pet resolver everywhere**
All app-support pet loading and legacy migration must use the shared resolver introduced in Task 4. Do not duplicate path normalization in migration/import code.

Required tests:

- app-support discovery rejects absolute `spritesheetPath`
- app-support discovery rejects `..` traversal
- app-support discovery rejects symlink escapes
- app-support discovery rejects hard links/non-regular files where a normal file is required
- legacy migration does not copy or expose invalid asset paths

**Step 4: Add bundled Olive first-run import**
On first launch:

- ensure app support directory exists
- copy bundled Olive into app support if no library exists
- set `activePetId: "olive"`
- preserve bundled assets as read-only source of truth; user profile copy is editable

**Step 5: Add legacy single-pet migration**
Detect existing pre-library app-support layouts where `~/Library/Application Support/Codex Pet Sidecar/pets/<pet-id>/pet.config.json` exists but `library.json` does not.

Migration behavior:

- scan existing `pets/*/pet.config.json`
- choose active pet deterministically:
  1. if exactly one config exists, use it
  2. if multiple configs exist, prefer the most recently modified config and record the decision in migration metadata
- create `library.json`
- preserve each existing `pet.config.json`, `memory.md`, `personality.md` if present, `pet.json`, and `spritesheet.webp`
- import bundled Olive only if no existing pet has `pet_id == "olive"` and total pets would remain `<= 20`
- write `migration.json` with timestamp, legacy configs found, active pet chosen, and backup path
- create a backup copy of legacy library metadata before writing new files

Tests must cover:

- no existing config -> first-run Olive import
- one legacy config -> preserve active pet and memory
- multiple legacy configs -> deterministic active pet choice
- legacy 20 pets -> do not add bundled Olive beyond max
- corrupted legacy config -> recoverable error with no partial migration

**Step 6: Enforce max 20**
Reject hatching/import when library already has 20 pets with a recoverable command error. Keep delete/archive for a later task unless needed for usability.

**Verification plan:**

- Primary command: `cargo test --manifest-path src-tauri/Cargo.toml`
- Expected: first launch creates Olive, active config loads deterministically, max 20 is enforced, per-pet memory/personality paths are isolated.

## Task 7: Runtime safety and session persistence settings

**Parallel:** no  
**Blocked by:** Tasks 2, 6  
**Owned files:** `src-tauri/src/runtime/**`, Rust runtime tests  
**Invariants:** Runtime still launches a sidecar-owned Codex CLI app-server. Power mode remains available for users who explicitly enable it.  
**Out of scope:** Pet library discovery and UI.

**Files:**

- Modify: `src-tauri/src/runtime/session.rs`
- Modify: `src-tauri/src/runtime/prompt.rs`
- Modify: `src-tauri/src/runtime/events.rs`

**Step 1: Consume runtime settings from pet config**
Task 6 adds these config fields to the shared pet config model:

```rust
pub struct RuntimeConfig {
    pub session_persistence: SessionPersistence,
    pub safety_mode: RuntimeSafetyMode,
}

pub enum SessionPersistence {
    Ephemeral,
    SavedHistory,
}

pub enum RuntimeSafetyMode {
    Safe,
    Power,
}
```

This task must not edit `src-tauri/src/state/config.rs` unless Task 6 failed to add the contract. Default:

- `Ephemeral`
- `Safe`

**Step 2: Compose thread/start from settings**
For default safe mode:

- `ephemeral: true`
- `persistExtendedHistory: false`
- safe approval policy from Task 2
- `sandbox: "workspace-write"`
- if Task 2 found no safe supported combination, return a recoverable `SafeRuntimeUnavailable` error instead of starting a thread

For Power mode:

- `ephemeral` follows `session_persistence`
- `approvalPolicy: "never"`
- `sandbox: "danger-full-access"`
- show in UI as explicit high-risk mode

**Step 3: Remove Olive-specific developer text**
Replace prompt text like "empresses do not babysit" with pet-neutral rules. The Olive personality itself can still contain empress lore through `personality.md`.

**Step 4: Add tests**
Test payload generation for:

- default ephemeral safe mode
- saved safe mode
- ephemeral Power mode
- saved Power mode
- safe-mode unavailable fail-closed behavior
- memory/personality injection

**Verification plan:**

- Primary command: `cargo test --manifest-path src-tauri/Cargo.toml`
- Secondary command: `npm run smoke:runtime`
- Expected: default smoke starts ephemeral safe session; opt-in smoke covers Power mode without changing default.

## Task 8: Tuck/wake backend and app recovery surface

**Parallel:** no  
**Blocked by:** Tasks 6, 7  
**Owned files:** `src-tauri/src/app_state.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/state/config.rs`, `src-tauri/src/tray.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml` if a Tauri tray feature/plugin is needed  
**Invariants:** A tucked pet must always be recoverable. Tucked suppresses proactive and ambient turns. Direct user-opened chat after wake is allowed.  
**Out of scope:** UI panels beyond command/event hooks.

**Files:**

- Create: `src-tauri/src/tray.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/state/config.rs`

**Step 1: Add tuck state**
Add to per-pet config:

```rust
pub struct TuckConfig {
    pub tucked: bool,
    pub tucked_until: Option<String>,
}
```

**Step 2: Add commands**
Implement:

- `tuck_pet(until: Option<String>)`
- `wake_pet()`
- `get_pet_visibility_state()`

**Step 3: Suppress proactive/ambient**
In observer/ambient loops, return early when active pet is tucked or muted.

**Step 4: Add falsifiable tuck/silence tests**
Add Rust tests proving:

- tucked active pet causes observer/proactive handling to early-return
- tucked active pet does not capture ambient screenshots
- tucked active pet does not call `send_ambient_turn`
- `tucked_until` in the future keeps the pet silent
- expired `tucked_until` automatically restores eligibility
- `wake_pet` clears tucked state and restores proactive/ambient eligibility

These tests should exercise pure decision functions where possible so they do not wait on the 60-second observer loop.

**Step 5: Add tray/menu recovery**
Add a tray or menu-bar item with:

- Wake Pet
- Tuck Pet
- Quit

**Verification plan:**

- Primary command: `cargo test --manifest-path src-tauri/Cargo.toml`
- Manual check: `npm run tauri:dev`, tuck pet, verify window hides, wake from tray/menu, verify window returns.

## Task 9: Frontend domain types and runtime bridge

**Parallel:** no  
**Blocked by:** Tasks 6-8  
**Owned files:** `src/domain/**`, `src/runtimeBridge.ts`, `src/runtimeBridge.test.ts`  
**Invariants:** TypeScript contracts mirror Rust command payloads. No hardcoded `/Users/<private-user>` fallback.  
**Out of scope:** Visual layout.

**Files:**

- Modify: `src/domain/petConfig.ts`
- Create: `src/domain/petLibrary.ts`
- Create: `src/domain/runtimeSettings.ts`
- Modify: `src/runtimeBridge.ts`
- Modify: `src/runtimeBridge.test.ts`

**Step 1: Add library TypeScript types**
Mirror Rust:

- `PetLibrary`
- `PetLibraryEntry`
- `RuntimeConfig`
- `SessionPersistence`
- `RuntimeSafetyMode`
- `TuckState`

**Step 2: Update bridge commands**
Expose:

- `loadPetLibrary`
- `setActivePet`
- `importPet`
- `startHatchingFlow`
- `startPersonalityFlow`
- `tuckPet`
- `wakePet`

**Step 3: Remove hardcoded fallback workspace**
Use backend launch cwd or empty workspace until user selects one.

**Verification plan:**

- Primary command: `npm test -- src/runtimeBridge.test.ts`
- Secondary command: `npm run build`
- Expected: bridge types compile and tests cover command names/payload shapes.

## Task 10: Onboarding and pet library UI

**Parallel:** no  
**Blocked by:** Task 9  
**Owned files:** `src/App.tsx`, `src/ui/OnboardingFlow.tsx`, `src/ui/PetLibraryPanel.tsx`, `src/ui/PetPicker.tsx`, `src/ui/PetWindow.tsx` only for library entry points, `src/styles.css`, related UI tests  
**Invariants:** Fresh launch must be fun immediately with Olive. Hatching must be discoverable but not required.  
**Out of scope:** Detailed settings controls owned by Task 11.

**Files:**

- Create: `src/ui/OnboardingFlow.tsx`
- Create: `src/ui/PetLibraryPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/ui/PetPicker.tsx`
- Modify: `src/ui/PetWindow.tsx`
- Modify: `src/styles.css`
- Create/modify: `src/ui/__tests__/PetLibraryPanel.test.tsx`

**Step 1: Fresh launch behavior**
If the library is missing, show a brief onboarding screen:

- "Meet Olive"
- "Use Olive now"
- "Hatch my own pet with Codex"
- "Import existing Codex pet"

Default action should take the user directly into Olive.

**Step 2: Add pet switcher**
Add a library panel showing:

- active pet
- installed pets count `N / 20`
- switch buttons
- hatch/import actions disabled at 20 pets

**Step 3: Wire active pet switch**
Switching pet:

- saves current config
- calls `setActivePet`
- restarts runtime
- updates sprite/personality/memory paths

**Verification plan:**

- Primary command: `npm test -- src/ui/__tests__/PetLibraryPanel.test.tsx`
- Secondary command: `npm run build`
- Expected: UI renders Olive default, disables hatch at 20, calls switch handler.

## Task 11: Settings UI for personality, safety, persistence, observers, and tuck/wake

**Parallel:** no  
**Blocked by:** Task 10  
**Owned files:** `src/ui/SettingsPanel.tsx`, `src/ui/MuteControl.tsx`, `src/ui/PetToolbar.tsx`, `src/ui/TuckWakeControl.tsx`, related tests, `src/styles.css` settings sections only  
**Invariants:** Risky modes must be explicit. Screenshot/window-title observers must be opt-in or clearly disclosed.  
**Out of scope:** Pet library list UI.

**Files:**

- Modify: `src/ui/SettingsPanel.tsx`
- Modify: `src/ui/MuteControl.tsx`
- Modify: `src/ui/PetToolbar.tsx`
- Create: `src/ui/TuckWakeControl.tsx`
- Modify: `src/ui/__tests__/SettingsPanel.test.tsx`

**Step 1: Add personality editor actions**
Settings includes:

- personality textarea
- "Improve with Codex" button
- "Reset to bundled Olive" only for Olive
- save state feedback

**Step 2: Add runtime safety controls**
Settings includes:

- "Ephemeral sessions (recommended)" default on
- "Save pet sessions in Codex history" opt-in
- "Safe mode (recommended)" default
- "Power mode" with warning copy

**Step 3: Add tuck/wake controls**
Toolbar includes:

- Tuck
- Tuck for 30 minutes / 2 hours / until tomorrow
- Wake appears when tucked through tray/menu and, if visible, in UI

**Step 4: Clarify observer controls**
Settings copy names what each observer sees:

- active app name
- window title
- workspace/git status
- idle state
- screenshot opt-in

**Verification plan:**

- Primary command: `npm test -- src/ui/__tests__/SettingsPanel.test.tsx`
- Secondary command: `npm run build`
- Expected: settings change persistence payloads and risky controls require explicit click.

## Task 12: Skill flow integration commands

**Parallel:** no  
**Blocked by:** Tasks 5, 6, 9  
**Owned files:** `src-tauri/src/commands.rs`, `src-tauri/src/skills.rs`, `src-tauri/src/lib.rs`, `src/runtimeBridge.ts`, hatching/personality smoke tests  
**Invariants:** The app launches Codex skill sessions; it does not silently spend image-generation credits without user action. Hatching output is staged for review/import.  
**Out of scope:** Rewriting hatching scripts.

**Files:**

- Create: `src-tauri/src/skills.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/runtimeBridge.ts`
- Create: `scripts/smoke-skill-workflows.mjs`

**Step 1: Add command to reveal skill prompt**
Implement a command that creates a ready-to-copy Codex prompt for:

- hatching a new pet
- improving selected pet personality

This is the safe v1 integration if programmatic Codex thread creation for imagegen is not reliable.

**Step 2: Add optional launch command**
If protocol supports creating the right Codex session and exposing imagegen, add `launch_codex_skill_session(skill, pet_id)` that starts a Codex session with repo-local skill instructions.

**Step 3: Import staged pet**
Add import command that validates hatching output and copies:

- `pet.json`
- `spritesheet.webp`
- `personality.md` if present
- selected QA files

Validation must reject:

- missing `pet.json`
- missing or wrong-dimension `spritesheet.webp`
- absolute paths in manifest fields that should be package-relative
- `..` path traversal
- symlink escapes from the staged pet directory
- hard links or non-regular files where a normal file is required
- package IDs that would overwrite an existing pet without explicit replace flow
- imports when the library already has 20 pets

Use the same shared secure pet manifest resolver from Tasks 4 and 6 for staged imports. Do not create a second path sanitizer with different behavior.

**Verification plan:**

- Primary command: `node scripts/smoke-skill-workflows.mjs`
- Secondary command: `cargo test --manifest-path src-tauri/Cargo.toml`
- Expected: prompt generation works offline; import rejects invalid spritesheets and accepts valid staged output.

## Task 13: Integration pass

**Parallel:** no  
**Blocked by:** Tasks 6-12  
**Owned files:** shared integration files across `src/**`, `src-tauri/src/**`, `docs/verification/**`  
**Invariants:** Do not weaken safety defaults to make tests pass. Do not reintroduce personal strings.  
**Out of scope:** New features beyond wiring.

**Files:**

- Modify: `src/App.tsx`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `docs/verification/2026-05-05-local-mvp-proof.md` or create new public launch proof

**Step 1: Wire complete startup**
Fresh app:

- initializes library
- imports bundled Olive if needed
- displays Olive
- starts runtime only after active config is ready
- uses ephemeral safe session default

**Step 2: Wire switch/restart**
Pet switch:

- cancels/shuts down current runtime
- starts active pet runtime
- resets current transcript/streaming state

**Step 3: Wire tuck/wake**
Tuck:

- hides/silences
- runtime remains idle or shuts down depending implementation decision
  Wake:
- shows window
- resumes runtime or starts fresh ephemeral session

**Verification plan:**

- Primary command: `npm run check`
- Manual command: `npm run tauri:dev`
- Expected: green gate and manual startup/switch/tuck flow works.

## Task 14: Repo-wide public scrub hard gate

**Parallel:** no  
**Blocked by:** Task 13  
**Owned files:** `docs/**`, `src/**`, `src-tauri/**`, `assets/**`, root metadata files as needed for public scrub fixes  
**Invariants:** Public repo must not include private names, private paths, stale unsafe-default claims, or local/generated artifacts. This is a hard gate, not a best-effort proof step.  
**Out of scope:** Feature changes unrelated to public readiness.

**Files:**

- Modify: any file flagged by `npm run audit:public` or `npm run audit:artifacts`

**Step 1: Run public audits**
Run:

```bash
npm run audit:public
npm run audit:artifacts
```

Expected: both fail before this scrub if stale personal/private content remains.

**Step 2: Remove, rewrite, or archive private docs**
For each flagged file, choose one:

- rewrite it into public-safe language
- delete it if it is obsolete/private planning history
- move private-only material out of the public repo entirely

Do not use a broad allowlist. If an allowlist is unavoidable, it must name the exact file and exact acceptable phrase with a comment explaining why public launch permits it.

Likely files to scrub from the current tree:

- `.claude/settings.json`
- `.claude/skills/check/SKILL.md`
- `.claude/skills/*` untracked symlinks/local tooling files
- `.agents/**`
- `.codex/hooks.json`
- existing `.codex/skills/*` symlinks to private/global skill-library paths
- `docs/olive-persona.md`
- `docs/specs/2026-05-05-codex-pet-sidecar.md`
- previous MVP plans/proofs that mention private defaults or local paths
- `src/App.tsx`
- `src/domain/petConfig.ts`
- `src-tauri/src/runtime/prompt.rs`
- `src-tauri/src/proactive/mod.rs`
- `src-tauri/Cargo.toml`

**Step 3: Re-run audits until green**
Repeat scrub and audit until:

- no real personal names remain
- no `/Users/<private-user>` paths remain
- no stale default-history or YOLO-default claims remain
- no local/generated artifacts are tracked
- no tracked symlink points outside the repo or into any `/Users/` path
- no `.agents/**` content remains unless intentionally public
- no `.codex/hooks.json` remains unless intentionally public
- no `.claude/**` or `.codex/**` content remains except public, real repo-local skill files created by Task 5
- `git status --short` shows no accidental untracked local-agent/runtime artifacts; any remaining dirty files are intentional implementation outputs

**Verification plan:**

- Primary command: `npm run audit:public && npm run audit:artifacts`
- Secondary command: `npm run check`
- Expected: public audits pass without broad exceptions and behavior gate remains green.

## Task 15: Privacy and security review/fix loop

**Parallel:** no  
**Blocked by:** Task 14  
**Owned files:** read-only for review; fixes assigned after triage  
**Invariants:** Public defaults remain safe.  
**Out of scope:** Cosmetic UI polish unless it affects comprehension of risk.

**Files:**

- Review: all changed files
- Modify after triage: only files needed for accepted findings

**Step 1: Spawn security reviewer**
Ask `security_auditor` to review:

- default runtime permissions
- Power mode copy and gating
- screenshot/window-title observers
- hatching scripts and shell execution
- asset import path traversal
- user-controlled paths

**Step 2: Triage findings**
Use `receiving-code-review` approach:

- P0/P1/P2 security/privacy findings are blocking
- P3 copy improvements accepted if cheap

**Step 3: Assign fix lanes**
Send findings to owning implementation agents. Verify each fix with a narrow test first, then `npm run check`.

**Verification plan:**

- Primary command: `npm run check`
- Secondary command: targeted tests named in each finding
- Expected: no unresolved P0/P1/P2 security/privacy findings.

## Task 16: Clean-code review and iteration loop to no unresolved blockers

**Parallel:** no  
**Blocked by:** Task 15  
**Owned files:** read-only for review; fixes assigned after triage; review artifact at `docs/reviews/2026-05-05-open-source-clean-code-review.md`  
**Invariants:** Behavior must not regress. Keep public safety defaults.  
**Out of scope:** Feature expansion.

**Files:**

- Review: all changed production/test/docs files
- Modify after triage: accepted finding files only
- Create: `docs/reviews/2026-05-05-open-source-clean-code-review.md`

**Step 1: Spawn clean-code reviewer**
Ask a `reviewer` subagent explicitly armed with the `clean-code` checklist to review:

- naming and module boundaries
- oversized functions/components
- duplicated state/config conversion
- unclear error handling
- test quality and brittleness
- comments that narrate code
- personal residue or placeholder slop

**Step 2: Fix all blocking maintainability findings**
Blocking means:

- high-confidence correctness issue
- code smell likely to make the next change risky
- untested public contract
- confusing module boundary
- personal/private residue

Use `refactor_pilot` or owning lane workers. Fixes must be behavior-preserving unless the finding is a bug.

**Step 3: Record review artifact**
Maintain `docs/reviews/2026-05-05-open-source-clean-code-review.md` with:

- reviewer run number
- findings
- accepted fixes
- waived items with rationale, if any
- files changed for each fix
- targeted tests run for each fix
- final reviewer response showing no blocking/high-confidence findings

**Step 4: Re-run clean-code review**
Repeat:

1. reviewer reviews current tree
2. orchestrator triages
3. fix accepted findings
4. update the review artifact
5. run targeted checks, `npm run check`, `npm run audit:public`, and `npm run audit:artifacts`

Stop only when the reviewer reports no blocking findings and the orchestrator agrees no remaining issue blocks open-source launch.

**Verification plan:**

- Primary command after every loop: `npm run check && npm run audit:public && npm run audit:artifacts`
- Secondary commands: targeted tests from each fix
- Expected: final reviewer says no blocking findings; no ignored high-confidence maintainability defects remain; review artifact records the loop.

## Task 17: Final public launch proof

**Parallel:** no  
**Blocked by:** Task 16  
**Owned files:** `docs/verification/2026-05-05-open-source-launch-proof.md`, optional screenshots under `docs/verification/assets/**`  
**Invariants:** Report what actually ran and what did not. Do not overclaim notarization/release state.  
**Out of scope:** Code changes unless a blocker sends work back to Task 14, 15, or 16.

**Files:**

- Create: `docs/verification/2026-05-05-open-source-launch-proof.md`

**Step 1: Run automated gates**
Run:

```bash
npm run check
npm run audit:public
npm run audit:artifacts
git status --short
node scripts/doctor.mjs
npm run smoke:runtime
node scripts/smoke-skill-workflows.mjs
```

**Step 2: Run manual app proof**
Run:

```bash
npm run tauri:dev
```

Verify:

- fresh support directory gets Olive
- Olive appears and animates
- runtime starts default ephemeral safe session
- personality editor saves
- switcher works with a second test pet if available
- hatching prompt/flow launches or produces copyable instructions
- tuck hides/silences
- tray/menu wake restores
- quitting kills app-server child process

**Step 3: Confirm public audits are still green**
Run:

```bash
npm run audit:public
npm run audit:artifacts
git status --short
```

Expected:

- no private-name/path matches
- no generated/local artifact tracking
- no stale unsafe-default docs
- no accidental local-agent/runtime artifacts are tracked or waiting untracked; any dirty files are intentional launch changes and listed in the proof

**Step 4: Write proof doc**
Record:

- exact commit/branch
- `git status --short` output and explanation of any intentional dirty files
- commands run
- pass/fail status
- manual observations
- remaining release risks, if any
- whether notarized binary release exists or source-only release is the current state

**Verification plan:**

- Primary command: `npm run check && npm run audit:public && npm run audit:artifacts`
- Acceptance: proof doc exists and names every skipped manual or release step.

## Task 18: Plan reviewer and implementation-readiness gate

**Parallel:** no  
**Blocked by:** this plan draft  
**Owned files:** `docs/plans/2026-05-05-open-source-public-launch.md`  
**Invariants:** Do not begin implementation until plan reviewer and orchestrator agree the plan is ready.  
**Out of scope:** App code changes.

**Files:**

- Modify: `docs/plans/2026-05-05-open-source-public-launch.md`

**Step 1: Spawn plan reviewer**
Ask `plan_reviewer` to check:

- dependency order
- file ownership collisions
- gate-command coverage
- invariant-to-test mapping
- plan/spec completeness
- whether Olive-default exception is properly handled
- whether final clean-code loop is strong enough

**Step 2: Apply plan fixes**
If reviewer finds blockers, update this plan and send the revised version back for another review.

**Step 3: Stop condition**
Implementation may begin only after:

- `plan_reviewer` reports no blocking findings
- orchestrator agrees the plan covers the launch target
- this file includes the reviewer disposition below

Important distinction: implementation-readiness does not require the live repository to already be public-clean. Current local-agent artifacts are expected inputs to Task 3. The repo is not public-launch-ready until Task 3, Task 14, and Task 17 gates pass, but their current existence is not a blocker to starting execution of this plan.

## Reviewer disposition

Status: reviewer found no remaining plan-structure blocker after four rounds. The only remaining concern was live local-agent artifacts still present in the working tree; this plan now explicitly assigns those artifacts to Task 3, audits them in Task 3/Task 14, and verifies final `git status --short` in Task 17. Orchestrator agrees the plan is implementation-ready, but the repository is not public-clean until those tasks execute and pass.

## Final gate command set

Use this exact final command set unless implementation changes add a more specific canonical gate:

```bash
npm run check
npm run audit:public
npm run audit:artifacts
node scripts/doctor.mjs
npm run smoke:runtime
node scripts/smoke-skill-workflows.mjs
```

Manual:

```bash
npm run tauri:dev
```

## Known risks to resolve during implementation

- **Olive sprite provenance:** Must confirm the current Olive spritesheet is publishable or regenerate it through the repo-local hatching workflow.
- **Codex app-server protocol drift:** Safe approval policy names may change; Task 2 must verify current generated protocol before implementation locks constants.
- **Image generation spend:** Hatching flow must require clear user initiation before spending image-generation credits.
- **Tauri tray/menu details:** Exact API may require current Tauri docs during implementation. Fetch docs with `ctx7` before coding tray changes.
- **macOS permissions:** Active window title and screenshots need clear degradation and settings copy.
- **Release signing/notarization:** Source-open can land before signed binary release, but README must not imply a notarized installer exists until it does.
