# In-App Hatching Wizard

**Status:** draft v3 · 2026-05-08
**Replaces:** `2026-05-07-hatching-wizard-design.md` (v0.1)
**Companion:** `2026-05-07-hatching-wizard-mocks-v0.2.html`

## Why this exists

The shipping app has no in-product way for users to hatch a custom pet. The current "Hatch my own pet with Codex" button surfaces a skill prompt the user is supposed to paste into a Codex CLI session. That is not a feature; it is a punt. This spec replaces that punt with a guided in-app wizard, framed as part of onboarding.

The architectural enabler: the app already runs a Codex app-server session under the user's Codex auth. Image generation (`$imagegen`) and text turns are both available without the user leaving the app. The wizard owns orchestration; Codex acts as a prompt-rewriter and a pixel-producer.

## User personas

The wizard absorbs four distinct users through one flow.

1. **Tester.** Just installed the app, wants to see what it does. Picks the bundled pet (Olive) at the choice gate and never enters the wizard.
2. **Vibe-haver.** Wants a custom pet but hasn't thought hard. "Something funny and sarcastic." Picks an archetype, edits one or two fields, accepts the first acceptable prototype.
3. **Lore-rich.** Has paragraphs of backstory and personality detail. Skips archetypes, opens the "Go deeper" disclosure on the brief, dumps prose. May iterate hard on the prototype.
4. **Reference-image.** Has a visual reference (sketch, photo, mood image). Drops the file in the inspiration step; reference is used as `input_images` grounding on the base imagegen call.

Personas 2/3/4 share the same wizard flow with different input affordances. No persona pre-classification.

## The flow

```
01. Choice gate          — Olive (default) or hatch your own
02. Inspiration          — archetype gallery + reference image upload
03. Brief                — identity form with progressive disclosure
04. Prototype gate       — single base sprite, iterate with text feedback, accept
    ── pipeline runs ──    no user-facing surface; internal retries; produces atlas
05. Atlas review         — validation, optional per-row regen
    ── package & import ──
06. Welcome              — activate or save for later
```

Four core wizard steps (02–05) are book-ended by the choice gate (01) and the welcome (06). The pipeline runs as a background phase between Steps 4 and 5; users see a simple progress indicator, not a job dashboard.

## Surface

The wizard is **its own window**, not the pet's always-on-top bubble. At first-launch onboarding (no pet exists yet) the wizard window _is_ the app. When a user opens the wizard later from the pet library, the wizard window opens alongside the pet window for the duration of the run.

Implementation decision: add a second Tauri window labeled `hatching-wizard` with a normal desktop-window shape (decorated, resizable, not transparent, not always-on-top, not skip-taskbar). Initial dimensions: 960 × 720 logical px, min 800 × 600. Add `hatching-wizard` to `src-tauri/capabilities/default.json` (or a dedicated capability file if command permissions split later). The existing `main` window remains the 288 × 368 transparent pet bubble; do not resize or repurpose it for hatching.

**No chat surface during hatching.** Codex output is never rendered as chat messages. The wizard reads `image_generation_call` events from the Codex app-server protocol and translates them into structured UI: progress bars, sprite previews, validation chips. Chat-shaped UI is reserved for the running pet, not the hatching flow.

## Runtime isolation

Hatching runs in **its own ephemeral Codex runtime home**, separate from any pet runtime. This must be implemented as a separate runtime owner, not by reusing the existing pet `RuntimeSessionManager`: the live manager currently calls `shutdown()` before starting a pet session, so sharing it would kill whichever runtime started first. The wizard's runtime home:

- Is created at `start_hatching_run` under `AppPaths::hatching_runtime_home_dir(session_id)`, not under the existing `runtime_codex_home_dir()`.
- Uses a dedicated backend manager, `HatchingRuntimeManager`, stored separately from `AppState.runtime`. Starting or canceling a hatching run must not call `RuntimeSessionManager::shutdown()` and must not interrupt the active pet session.
- Is populated with minimal Codex config (auth-only, no MCP plugins, no skill bundles other than what the wizard explicitly needs).
- Hosts a single Codex thread for the prototype iteration loop and the row-generation phase.
- Is torn down on accept, cancel, or app crash recovery.
- Is **not** the user's global `~/.codex` and **not** any pet runtime.

The user's Codex auth is shared via the same link/copy mechanism the pet runtime uses (`link_or_copy_user_auth` in `state::library`).

Add path methods before runtime work starts:

```rust
impl AppPaths {
    pub fn hatching_workspace_root_dir(&self) -> PathBuf {
        self.app_support.join("hatching-workspaces")
    }

    pub fn hatching_workspace_dir(&self, session_id: &str) -> PathBuf {
        self.hatching_workspace_root_dir().join(session_id)
    }

    pub fn hatching_runtime_root_dir(&self) -> PathBuf {
        self.app_support.join("hatching-runtime-homes")
    }

    pub fn hatching_runtime_home_dir(&self, session_id: &str) -> PathBuf {
        self.hatching_runtime_root_dir().join(session_id)
    }
}
```

Runtime protocol note: hatching may reuse the app-server process and JSON-RPC client plumbing, but it should not reuse the pet event mapper as-is. The pet mapper intentionally ignores raw response-item completion notifications; hatching needs lower-level access to `image_generation_call` notifications plus file-system watcher events.

Hatching thread-start params must be defined independently from the pet thread params. Do not copy the live pet default of `experimentalRawEvents: false`; Wave 0 must start the hatching thread with `experimentalRawEvents: true` and prove that raw `image_generation_call` notifications arrive. If the app-server ignores or rejects that flag, Wave 0 must pin the observed alternative event path before imagegen ingestion work proceeds.

## The atlas contract

Pinned canonical values, sourced from existing code (`pets/mod.rs`, `tools/pet-hatching/references/animation-rows.md`, `prepare_pet_run.py`).

```
Atlas:        1536 × 1872 pixels, WebP with alpha
Grid:         8 columns × 9 rows
Cell:         192 × 208 pixels each
Encoding:     WebP, transparent unused cells (RGBA 0,0,0,0)
```

The nine rows, in order:

| #   | Row name        | Source                           | Used columns | Frames |
| --- | --------------- | -------------------------------- | ------------ | ------ |
| 1   | `idle`          | grounded on accepted prototype   | 0–5          | 6      |
| 2   | `running-right` | grounded on accepted prototype   | 0–7          | 8      |
| 3   | `running-left`  | **derived** from `running-right` | 0–7          | 8      |
| 4   | `waving`        | grounded on accepted prototype   | 0–3          | 4      |
| 5   | `jumping`       | grounded on accepted prototype   | 0–4          | 5      |
| 6   | `failed`        | grounded on accepted prototype   | 0–7          | 8      |
| 7   | `waiting`       | grounded on accepted prototype   | 0–5          | 6      |
| 8   | `running`       | grounded on accepted prototype   | 0–5          | 6      |
| 9   | `review`        | grounded on accepted prototype   | 0–5          | 6      |

Eight row-strip imagegen calls minimum after prototype acceptance: `idle`, `running-right`, `waving`, `jumping`, `failed`, `waiting`, `running`, `review`. Row 3 is generated by mirroring row 2 horizontally — no separate generation. This matches `derive_running_left_from_running_right.py`.

The accepted prototype is **not** itself row `idle`; it becomes `canonical_identity_reference`, equivalent to the existing toolchain's `base` job / `decoded/base.png`. After acceptance, the wizard still generates a real 6-frame `idle` row strip grounded on that prototype. This preserves the current `compose_atlas.py`, `extract_strip_frames.py`, and `validate_atlas.py` contracts.

## Step-by-step

### Step 1 — Choice gate

Already exists in shape; rewire to the new wizard. Two options: "Continue with Olive" or "Hatch your own." Cost framing on the custom path: **"~10–15 min · usually 9–12 image gens."** No persona pre-classification, no advanced/expert toggle.

Cost copy rule: never promise a fixed count. The minimum successful path is one accepted prototype plus eight generated row strips; each prototype retry and each row retry adds one imagegen call. The welcome screen reports the actual count.

### Step 2 — Inspiration _(NEW)_

Three input modes, composable:

- **Archetype gallery.** Six hand-curated archetypes, each with a static concept thumbnail (bundled, not generated), one-line vibe descriptor, and a preset chip-set. Picking one pre-fills Step 3.
- **Reference image upload.** Optional. Click to browse via Tauri's dialog plugin. The frontend sends the selected local path to Rust; Rust copies the file into the run workspace, validates MIME/extension/dimensions/size, and returns a `ReferenceImage`. On upload, the wizard starts a one-shot Codex vision call to produce a 2–3 sentence textual description of the reference; the description is stored alongside the file. Used in subsequent prompt rewrites.
- **Start blank.** Small text link. Skips both, lands on an empty Step 3.

Modes compose: a user can pick an archetype _and_ upload a reference. They are not mutually exclusive paths.

**Archetypes (v1 set):**

- The Cozy Sleeper _(warm · soft · half-asleep)_
- The Grumpy Sage _(wise · sarcastic · cranky)_
- The Eager Helper _(bouncy · earnest · excited)_
- The Aloof Critic _(cool · dry · judgmental)_
- The Mischievous Imp _(chaotic · playful · rude)_
- The Stoic Watcher _(quiet · focused · observant)_

Each archetype is defined by a static record: name, descriptor, chip-tag set, palette suggestion, a default brief paragraph that pre-fills the description field, and a bundled thumbnail PNG. Archetype thumbnails are committed to the repo, not generated at runtime.

### Step 3 — Brief

One form, progressive disclosure.

**Default fields (always visible):**

- `display_name` — required, shown to the user; not directly used as an ID
- `pet_id` — auto-generated slug from `display_name`, editable only through an advanced "ID" disclosure if needed
- `description` — required, multi-paragraph textarea (min 100px, auto-grow)
- `personality` — chip selection (multi-select) with optional free-text addition
- `palette` — swatch picker, optional ("let Codex decide" if blank)

**"Go deeper" expander (collapsed by default):**

- `backstory` — long textarea
- `speech_style` — short text
- `behavioral_quirks` — short text
- `visual_notes` — short text

If the user picked an archetype on Step 2, all default fields are pre-filled from the archetype record; the user edits in place.

If the user uploaded a reference image on Step 2, a compact reference banner is shown at the top of the form ("Visual reference attached · `<filename>` · Swap").

Validation:

- `display_name` must be non-empty.
- `pet_id` must be generated by the same rules as the live package path: lowercase, replace non-`[a-z0-9]` runs with `-`, collapse repeated dashes, trim leading/trailing dashes.
- `pet_id` must pass Rust `validate_pet_id`: `^[a-z0-9][a-z0-9-]{0,63}$`.
- `pet_id` uniqueness checked case-insensitively against the existing pet library entries and on-disk package directories. If the generated ID collides, suggest `pet-id-2`, `pet-id-3`, etc.
- Reserved IDs for v1: `olive`, `codex`, `default`, `assets`, `tmp`, `hatching`.
- Description must be non-empty.
- Reference image (if attached) must be a valid PNG/JPG ≤ 4 MB, max 4096 px on either side, and max 8 megapixels after decode.

### Step 4 — Prototype gate _(NEW)_

The single most important UX decision in this design. Generate one base sprite, gate on it, iterate cheap.

**On entering the step**, the wizard:

1. Internally drafts an imagegen prompt for the base identity prototype from the brief + archetype + reference description. Drafting is a single Codex text turn — not user-facing.
2. Fires `$imagegen` with that prompt and the reference image (if any) as `input_images`.
3. Watches `<runtime_home>/generated_images/**/ig_*.png` for the resulting image, while also recording any correlated `image_generation_call` event payload.
4. Copies it into the run workspace, hashes it, and renders it as the prototype.

**On the prototype screen:**

- Big preview of the current prototype (192×208 actual size).
- History strip below: thumbnails of all prior prototype attempts, click to revert.
- Always-visible feedback textarea, placeholder examples ("less cute, more menacing · change the moss to brown · smaller spectacles").
- "Try again" button: regenerates with feedback (if textarea has text) or rerolls (if blank).
- "Accept · generate the rest →" button.
- Optional "see revised prompt" expander showing the rewritten prompt and Codex's one-line summary of changes. Prompt directly editable for power users.
- Soft fatigue nudge after iteration 4: "the brief might need a tweak →" links back to Step 3.

**Iteration mechanism — two-turn architecture:**

Each "Try again with feedback" click runs two model turns on the wizard's Codex thread:

1. **Rewrite turn (text-only).** Send a structured prompt to Codex: brief + original imagegen prompt + previous image description (or previous prompt if no description) + user feedback. Ask for JSON: `{revised_prompt, summary_of_changes}`. Parse response.
2. **Imagegen turn.** Send a turn that invokes `$imagegen` with the revised prompt + reference image. Watch for `ig_*.png` to land. Copy into workspace, hash, display.

The rewrite turn is cheap (~tenths of a cent). The imagegen turn is expensive (~$0.04). Splitting them lets us retry the rewrite if it returns malformed JSON without burning an imagegen, and surface the revised prompt for inspection before firing.

**On "Try again" with empty feedback:** skip the rewrite turn; just re-fire `$imagegen` with the original prompt for a plain reroll.

**On accept:** the current prototype's image becomes `canonical_identity_reference` and is copied to the workspace as `decoded/base.png`. The wizard transitions to the generation phase. No atlas row is complete yet.

### Generation phase _(BACKGROUND, NO USER SURFACE)_

After the user accepts the prototype, the wizard fires the eight required row-strip imagegen jobs. This is a background phase — users see a single progress indicator, not a job dashboard.

**For each generated row in [idle, running-right, waving, jumping, failed, waiting, running, review]:**

1. Wizard internally drafts the row prompt from the brief + row template.
2. Fire `$imagegen` with the row prompt + `canonical_identity_reference` as grounding `input_images`.
3. On result land, copy into workspace, hash, save.
4. **On imagegen failure:** retry up to 3 times with exponential backoff. If all retries fail, mark the row as failed and continue.

Rows are generated **sequentially** on the wizard's single Codex thread. Sequential rather than parallel because:

- Single thread means prompt caching kicks in across rows (system prompt + brief stay constant).
- Rate-limit pressure is bounded.
- Failures don't cascade or interleave.

**After all rows complete (or fail):**

- Mirror row 2 horizontally to produce row 3 (`running-left`) and record `source_provenance = "deterministic-mirror"`, `derived_from = "running-right"`, an approved mirror decision, and source/output hashes. **Caveat:** horizontal mirroring is only correct for visually symmetric pets. Asymmetric details — an item held in one flipper, lopsided markings, text or logos on the body — will swap sides in `running-left`. `animation-rows.md` notes this with "do not simply reuse right-facing frames unless the design is symmetric." For v1 we accept the limitation and rely on the user to catch wrong-handed mirroring at atlas review (Step 5) and regenerate `running-right` (which re-derives `running-left`) or manually flag the issue. A redrawn `running-left` is out of scope for v1.
- Compose the atlas: stitch all row strips into the 1536×1872 spritesheet, slicing strips into per-cell frames as needed (matches `extract_strip_frames.py` + `compose_atlas.py` behavior).
- Validate the atlas against the pinned contract.

**If the pipeline succeeds**, advance to Step 5 (Atlas review). If 1–2 rows failed, surface them at Step 5 with a clear "regenerate this row" affordance. If 3+ rows failed, surface a soft error with the option to retry the whole generation phase.

**Progress UI during this phase:** simple horizontal progress bar, percentage, count ("3 of 8 row imagegens · running-left mirrors automatically · ~5 min remaining"), and a "Cancel" button. No per-row dashboard, no runtime feed, no job graph. The UI invariant is aggregate progress only: no row prompt editor, no raw Codex transcript, no job graph.

### Step 5 — Atlas review

The wizard renders the composed atlas with a grid overlay. Validation results displayed inline:

- ✓ 1536×1872 dimensions
- ✓ 192×208 cell geometry
- ✓ All 9 rows present
- ✓ Transparency clean on unused cells
- ✓ WebP encoding valid

Per-row chips below the atlas. If any generated row failed during generation or fails validation, its chip shows in terracotta with a "Regenerate" action. Regenerating a generated row fires one imagegen call and re-validates. `running-left` is not directly regenerable because it is derived; if its chip fails, the action label is "Regenerate running-right and re-mirror", which fires one imagegen call for `running-right`, derives `running-left` again, then re-validates both rows.

**Actions:**

- "Looks good — save pet →" advances to Step 6.
- "← Regenerate a row" enters per-row regen flow (small modal: pick a generated row; `running-left` routes to `running-right` regeneration + mirror derivation).

### Step 6 — Welcome

Final confirmation. Shows:

- Pet name (large)
- Brief summary (description, personality)
- Hatching stats (time, total imagegen calls, accepted/derived counts)
- Toggle: "Make `<name>` your active pet" (default on)
- Footnote with the pet package path

**Actions:**

- "Save and stay here" — adds pet to library, doesn't activate.
- "Start with `<name>` →" — activates and closes wizard window.

## Data contracts

```rust
// Hatching session — owned by Rust backend, mutable across wizard steps.
struct HatchingSession {
    id: Uuid,
    runtime_home: PathBuf,           // ephemeral, isolated
    workspace: PathBuf,              // run dir for this session
    codex_thread_id: Option<String>, // single thread for the entire run; lazily created on the first model call (None between start_hatching_run and the first prototype-prompt-draft turn)
    brief: Option<PetBrief>,
    archetype: Option<ArchetypeId>,
    reference_image: Option<ReferenceImage>,
    prototype: Option<PrototypeState>,
    rows: HashMap<RowKey, RowState>,
    phase: HatchingPhase,
    created_at: DateTime<Utc>,
}

enum HatchingPhase {
    Inspiration,
    Brief,
    Prototype,
    Generating { progress: GenerationProgress },
    Review,
    Importing,
    Done { pet_id: PetId },
}

struct PetBrief {
    display_name: String,
    pet_id: String,
    description: String,
    personality: Vec<String>,        // chip selections + free-text additions
    palette: Option<PaletteSpec>,
    backstory: Option<String>,
    speech_style: Option<String>,
    behavioral_quirks: Option<String>,
    visual_notes: Option<String>,
}

struct ReferenceImage {
    id: ReferenceImageId,
    path: PathBuf,                   // copied into workspace
    sha256: String,
    description: Option<String>,     // from one-shot vision call; None if pending/failed
    description_status: ReferenceDescriptionStatus,
    described_at: Option<DateTime<Utc>>,
}

enum ReferenceDescriptionStatus { Pending, Ready, Failed }

struct PrototypeState {
    iterations: Vec<PrototypeIteration>,
    current: usize,                  // index into iterations[]
}

struct PrototypeIteration {
    n: u32,
    revised_prompt: String,
    summary_of_changes: String,
    user_feedback: Option<String>,   // None for n=1
    image: ImageArtifact,
    generated_at: DateTime<Utc>,
}

enum RowKey {
    Idle, RunningRight, RunningLeft,
    Waving, Jumping, Failed, Waiting, Running, Review,
}

enum GeneratedRowKey {
    Idle, RunningRight,
    Waving, Jumping, Failed, Waiting, Running, Review,
}

struct RowState {
    prompt: String,
    image: Option<ImageArtifact>,
    derived_from: Option<RowKey>,    // Some(RunningRight) for RunningLeft
    mirror_decision: Option<MirrorDecision>,
    attempts: u32,
    last_error: Option<String>,
    status: RowStatus,
}

enum RowStatus { Pending, Generating, Ready, Failed }

struct ImageArtifact {
    source_path: PathBuf,
    output_path: PathBuf,
    source_provenance: SourceProvenance,
    source_sha256: String,
    output_sha256: String,
    metadata: ImageMetadata,
}

enum SourceProvenance {
    BuiltInImagegen,
    DeterministicMirror,
    SyntheticTest,
}

struct ImageMetadata {
    width: u32,
    height: u32,
    mode: String,
    format: String,
}

struct MirrorDecision {
    approved: bool,
    reason: String,
    decided_at: DateTime<Utc>,
}

struct GenerationProgress {
    rows_completed: u32,
    rows_total: u32,                 // always 8 (excludes derived running-left)
    estimated_remaining: Duration,
    total_imagegen_calls: u32,       // includes prototype iterations + retries
}
```

The session is persisted to disk on every state mutation so app crashes don't lose progress.

## Tauri command surface

Eleven commands across lifecycle, state, step transitions, prototype iteration, per-row regen, and finalize. Several were collapsed from the v0.1 spec's per-phase decomposition; the remaining count reflects honest distinct operations rather than artificial collapse.

```rust
// Lifecycle
start_hatching_run() -> SessionId
cancel_hatching_run(SessionId) -> ()

// State queries (called frequently by frontend)
get_hatching_state(SessionId) -> HatchingSession

// Step transitions
submit_brief(SessionId, PetBrief, Option<ArchetypeId>, Option<ReferenceImageId>) -> ()
upload_reference_image(SessionId, local_path: String) -> ReferenceImage
describe_reference_image(SessionId, reference_id: ReferenceImageId) -> ReferenceImage

// Prototype iteration
generate_prototype(SessionId, feedback: Option<String>) -> PrototypeIteration
revert_to_iteration(SessionId, iteration_n: u32) -> ()
accept_prototype(SessionId) -> ()

// Generation phase (kicked off automatically after accept_prototype; this just polls)
// (covered by get_hatching_state)

// Per-row regen during atlas review
regenerate_row(SessionId, GeneratedRowKey) -> ()

// Finalize
import_pet(SessionId, activate: bool) -> PetId
```

The frontend polls `get_hatching_state` for progress updates. The backend pushes events via Tauri's emit API when long-running operations (generation phase, prototype generation) make progress.

`running-left` derivation is internal pipeline behavior, not a public command. Initial generation derives it after `running-right` completes. Review-time `running-left` failures route to `regenerate_row(SessionId, RunningRight)`, then the backend automatically re-derives `running-left` from the new `running-right` strip before re-validating.

Adjacent library command required for the library-full recovery path:

```rust
archive_pet(pet_id: PetId) -> PetLibrary
```

`archive_pet` is not hatching-specific, but Wave 3 must include it before the "library full" copy ships.

Reference upload command shape: v1 is path-based, not file-byte based. The frontend obtains a local path from Tauri's dialog plugin, then Rust copies the file into `<workspace>/references/<sha256>.<ext>`. Rust rejects files that are not PNG/JPEG, exceed 4 MB, exceed 4096 px width/height, exceed 8 decoded megapixels, cannot be decoded as an image, or resolve outside a regular file. The reference description runs async-prefetch: upload returns as soon as the file is safely copied, `describe_reference_image` starts automatically in the background, and Step 4 soft-blocks only if the description is still pending when the prototype prompt is drafted.

## Imagegen integration

The Codex app-server protocol defines an `image_generation_call` response item with a `result: string` field (`protocol/app-server/schema/v2/RawResponseItemCompletedNotification.json`, `definitions.ResponseItem`). The semantics of `result` are not pinned by this spec — it may be a file path, a base64 payload, an opaque reference, or empty. The existing Python toolchain ignores the protocol field entirely and reads from disk: every accepted `$imagegen` invocation writes `ig_*.png` files under `$CODEX_HOME/generated_images/`, and `record_imagegen_result.py:79-104` validates source paths against that root.

**v1 implementation strategy** is to follow the proven Python path (file-on-disk as canonical artifact) and treat the protocol `result` field as advisory:

1. Set `CODEX_HOME` to the wizard's ephemeral runtime home before starting the Codex thread.
2. Watch `<runtime_home>/generated_images/` **recursively** for new files matching `ig_*.png` via the `notify` crate. The actual subdirectory layout (thread-keyed, flat, or otherwise) is determined empirically — `record_imagegen_result.py`'s validator only enforces "somewhere under `generated_images/`, name starts with `ig_`," so the watcher must too.
3. Cross-reference detected files with `image_generation_call` events from the protocol where possible (call_id correlation) but treat the file as the source of truth.
4. On detection, copy the file into `<workspace>/<job_id>/<filename>.png`, compute SHA-256, mark the corresponding job as ready.
5. Validate source provenance matches existing toolchain rules: file must be in the runtime's `generated_images/`, must start with `ig_`, must not be inside the workspace itself. See `record_imagegen_result.py:79-104` for the canonical check.

**Implementation prerequisite:** before writing the watcher, run a real `$imagegen` invocation against the wizard's runtime home and record (a) the actual on-disk path of the resulting file, and (b) the contents of the corresponding `image_generation_call.result` field. Pin both into a runtime-integration test fixture. If `result` carries the path directly, simplify the watcher to a path-resolver. If `result` is empty or opaque, keep the file-watcher as the canonical mechanism.

This preserves the existing provenance discipline without bolting it on later, and does not over-claim about protocol semantics the spec author has not verified.

## Reference image grounding

If the user uploaded a reference image on Step 2:

1. The file is copied into `<workspace>/references/<sha256>.<ext>` immediately on upload, preserving `png`, `jpg`, or `jpeg`.
2. A one-shot Codex text turn is fired with the image attached: _"Describe this reference image in 2–3 sentences for use as visual inspiration."_ Result stored in `ReferenceImage.description` if it succeeds.
3. Subsequent prompt rewrites include the description in their context when available.
4. The reference path is included as `input_images` on the **base prototype** imagegen call only. Generated row strips ground on the accepted base image, not the reference directly. (The base carries the reference's visual identity through.)

## Provenance & integrity

Every accepted image must satisfy the existing toolchain's provenance discipline. Source-path validation for generated images matches `record_imagegen_result.py:79-104` (path must be under `<runtime>/generated_images/`, name must start with `ig_`, must not be inside the run workspace). Hash consistency matches `finalize_pet_run.py:validate_hash`, and deterministic mirror validation matches `finalize_pet_run.py:validate_mirror_hash`. The wizard records one `ImageArtifact` for each accepted prototype and row:

- `source_path` — full path to the original `ig_*.png` for generated images; for `deterministic-mirror`, the workspace path to `decoded/running-right.png`
- `source_provenance` — one of `built-in-imagegen` | `deterministic-mirror` | `synthetic-test`
- `source_sha256` — hash of the original file
- `output_sha256` — hash of the file copied into the workspace
- `metadata` — width, height, mode, format

The wizard refuses to package a pet unless every accepted prototype and required row has all fields. Synthetic test source is allowed only via a hidden flag for automated tests. `deterministic-mirror` is allowed only for `running-left`, must derive from `running-right`, and must include an approved mirror decision plus source/output hashes.

## Crash recovery

The wizard session is persisted to `<workspace>/session.json` on every mutation. On app launch:

1. Scan the hatching workspaces directory for sessions whose `phase != Done`.
2. For each orphan, surface a banner in the app: _"You have a hatching run in progress for `<pet_name>` — resume or discard?"_
3. **Resume** loads the session, reattaches the runtime home, and reopens the wizard at the appropriate step.
4. **Discard** deletes the workspace and the runtime home.

If the wizard is closed mid-iteration on the prototype gate, the most recent prototype iteration is preserved and the user re-enters at the prototype screen with the iteration history intact.

## Error handling

**Reference vision call fails:** non-fatal; reference is attached without a description. Subsequent prompt rewrites work without it (slightly worse quality).

**Rewrite turn returns malformed JSON:** retry up to 3 times. After that, surface "Couldn't draft a revision — try simpler feedback or hit Try again to regenerate." Don't burn imagegen.

**Imagegen fails (rate-limit, network, model error):** retry up to 3 times with exponential backoff. After that:

- During prototype iteration: surface error to user with retry option.
- During generation phase: mark row as failed, continue with other rows. Surface at atlas review.

**Atlas validation fails:** surface failed rows at atlas review with per-row regenerate. Block import until validation passes.

**Codex auth missing:** the wizard refuses to start. Surface the same `CodexAuthNotFound` error used elsewhere in the app, with a link to setup instructions.

**Library full (20 pets):** Step 1 disables the "Hatch your own" option and surfaces "Pet library is full. Archive a pet before hatching another." v1 includes a minimal archive action in the library: update the existing `library.json` through the library module, move the pet package directory to `<app_support>/archived-pets/<pet_id>-<timestamp>/`, and block archiving the active pet unless the user first switches pets. Existing in-progress runs are still allowed to finish.

**App crash:** session resumed from disk per crash recovery section.

## Out of scope for v1

Explicitly deferred to keep v1 shippable:

- **Repair flows.** No `apply_repaired_row` UX, no `queue_pet_repairs` UX. If atlas review reveals issues, the user regenerates the offending row whole.
- **Animation video previews.** Atlas review shows static frames, not animated playback.
- **Contact sheet generation.** Internal QA tool, not user-facing.
- **Multi-prototype selection.** Single prototype + iterate, not "show 3 picks one."
- **Custom row prompts.** Users edit the brief and the prototype feedback; they do not see or edit per-row prompts. This was Step 3 in v0.1; cut.
- **Per-row dashboard during generation.** Pipeline runs as a background phase with simple progress; was Step 5 in v0.1; cut.
- **Sharing / community gallery.** First-hatch experience ends in _using your pet_, not in another social action.

## Wave 0 prerequisites — first implementation work

These are not open questions and not optional research. They are the first implementation wave. No user-facing wizard code starts until both Wave 0 artifacts exist.

**Gate policy for all implementation waves:** run targeted checks and `npm run check:fast` during normal implementation. Do not run full gates after every small task. Before marking a wave complete, run `npm run check:local` plus the wave-specific targeted gates below. Reserve `npm run check:full`, `npm run check:ci`, no-sign Tauri builds, smoke drivers, and real-imagegen/manual QA for final validation, CI/pre-merge, or waves that directly change those surfaces. If a check fails, fix it and rerun the narrow failing command first.

### Python bundling and macOS code-signing

Decision: v1 targets a bundled PyInstaller executable for the existing Python toolchain, called from Rust via `Command::new`. Wave 0 proves this decision before broader implementation. The fallback is a Rust port of only the deterministic packaging/composition path, not an embedded CPython framework.

Why this is first:

- The Tauri bundling config in `src-tauri/tauri.conf.json` will need new resource entries.
- macOS notarization currently passes for the existing app surface; adding Python may break it without entitlement updates.
- Cross-platform builds (we currently ship macOS only, but Windows/Linux are on the roadmap) have different Python bundling stories.

Wave 0 acceptance:

- Build a PyInstaller proof binary that can run `compose_atlas.py`, `validate_atlas.py`, `derive_running_left_from_running_right.py`, and `package_custom_pet.py` against synthetic fixtures.
- Add the binary/resource wiring needed for a Tauri `tauri build --no-sign` smoke.
- Run a real signing/notarization proof on macOS before release work proceeds.
- Measure installed app size delta. If delta is > 50 MB or notarization fails for reasons that are not straightforward entitlement/resource fixes, stop and write a Rust-port plan for the deterministic scripts instead.

### Imagegen integration empirical pin

Per the imagegen integration section: before writing the file-watcher, run a real `$imagegen` invocation against the wizard's runtime home and pin (a) the on-disk path, and (b) the `image_generation_call.result` field contents. This is a one-day spike; it informs the watcher implementation directly.

Wave 0 acceptance:

- Add a checked-in fixture under `src-tauri/fixtures/hatching-imagegen/` that captures a redacted raw notification containing `image_generation_call.result` and the observed generated-image path shape.
- Add a Rust test that validates the hatching thread-start params set `experimentalRawEvents: true` and validates the watcher/path resolver against that fixture.
- If `result` carries a usable file path, implement path-first resolution with watcher fallback. If `result` is empty or opaque, implement recursive watcher-first resolution and treat protocol correlation as advisory.

## Implementation waves

Each wave has disjoint ownership where possible. If a wave touches the same file as another wave, finish and verify the earlier wave first.

### Wave 0 — integration proof gates

Owned files likely touched:

- `tools/pet-hatching/scripts/**` only for wrapper compatibility if needed
- `src-tauri/tauri.conf.json`
- `src-tauri/fixtures/hatching-imagegen/**`
- `src-tauri/src/hatching/imagegen.rs` or equivalent fixture parser
- `package.json` scripts for smoke gates

Required gates:

- PyInstaller proof command on synthetic fixtures
- `npm run tauri:build -- --no-sign` or the repo's equivalent no-sign Tauri build command
- Rust fixture test for imagegen path/result semantics
- `npm run check:local` before closing the wave

Exit criterion: Python packaging and imagegen output semantics are pinned. If either fails, stop; do not proceed to wizard UI.

### Wave 1 — backend state, paths, names, and runtime isolation

Owned files likely touched:

- `src-tauri/src/app_state.rs`
- `src-tauri/src/state/paths.rs`
- new `src-tauri/src/hatching/**`
- `src-tauri/src/commands.rs`
- `src-tauri/capabilities/default.json`
- `src-tauri/tauri.conf.json`

Work:

- Add hatching workspace/runtime-home path methods.
- Add `HatchingSession` persistence and crash-recovery scan.
- Add `HatchingRuntimeManager` separate from pet `RuntimeSessionManager`.
- Add `display_name` / `pet_id` normalization, collision detection, reserved IDs.
- Add reference image validation for PNG/JPEG, ≤ 4 MB, ≤ 4096 px per side, and ≤ 8 decoded megapixels.
- Add `hatching-wizard` Tauri window and permissions.

Required gates:

- Rust tests for path isolation, session persistence, crash recovery, pet ID normalization/collisions, reference upload validation boundaries, and "starting hatching does not shut down pet runtime" via mocked managers.
- `cargo test --manifest-path src-tauri/Cargo.toml hatching`
- `npm run check:local` before closing the wave

### Wave 2 — imagegen orchestration and atlas pipeline

Owned files likely touched:

- `src-tauri/src/hatching/imagegen.rs`
- `src-tauri/src/hatching/pipeline.rs`
- `src-tauri/src/hatching/provenance.rs`
- wrapper commands/scripts for bundled pet-hatching tools
- `scripts/smoke-hatching-runtime.mjs`
- `package.json`

Work:

- Implement path-first/watcher fallback imagegen artifact ingestion per Wave 0.
- Generate prototype as base identity, then generate all eight required row strips.
- Derive `running-left` via deterministic mirror with first-class provenance.
- Compose, validate, package, and import only after all provenance fields are present.
- Add `npm run smoke:hatching-runtime`.

Required gates:

- Rust tests for watcher behavior, provenance validators, mirror provenance, row-count contract, and no half-import after failure.
- `npm run smoke:hatching-runtime` with synthetic imagegen results.
- `npm run check:local` before closing the wave

### Wave 3 — frontend wizard

Owned files likely touched:

- `src/runtimeBridge.ts`
- `src/domain/hatching*.ts`
- `src/hooks/useHatching*.ts`
- `src/ui/hatching/**`
- `src/App.tsx`
- `src/ui/PetLibraryPanel.tsx`

Work:

- Add wizard shell and six surfaces.
- Add path-based reference upload with async reference description status.
- Add brief validation and pet ID collision UI.
- Add prototype iteration history, accept flow, aggregate generation progress, atlas review, row regen, and welcome/import actions.
- Add minimal pet archive UI/command so the library-full recovery path exists.

Required gates:

- Vitest coverage for each wizard step, validation, archetype pre-fill, reference attach/swap/status, prototype history, aggregate progress, atlas review, and library-full behavior.
- Rust archive test covering active-pet rejection, `library.json` update through the library module, and package-directory move to `archived-pets`.
- `npm test -- hatching` or the closest narrowed Vitest pattern.
- `npm run check:local` before closing the wave

### Wave 4 — full verification and release impact

Required gates:

- `npm run smoke:hatching-runtime`
- `npm run check:ci`
- no-sign Tauri build
- manual QA with real Codex auth + real imagegen for vibe-haver, lore-rich, and reference-image personas

Release stop rule: signed official release work cannot proceed until the Python bundle notarization proof from Wave 0 has been repeated on the final app bundle.

## Product phasing

**v1 (this spec) — ship the wizard.**

- New TS/React frontend for the 6 surfaces + shared wizard shell.
- New Rust backend modules for: session management, runtime isolation, prompt drafting, prototype iteration, generation orchestration, imagegen file-watcher/path resolver, provenance, package assembly.
- Reuse the existing Python toolchain for atlas composition + validation + mirror derivation **as bundled subprocess scripts**, called from Rust via `Command::new`, only after Wave 0 proves packaging/signing viability.

**v2 — port the deterministic bits to Rust.**

- Port `compose_atlas.py`, `validate_atlas.py`, `derive_running_left_from_running_right.py`, `package_custom_pet.py`, the manifest-shape parts of `prepare_pet_run.py`. Roughly 600–800 lines of Rust using the `image` crate.
- Behavior-locked by golden parity tests (run both implementations on the same inputs, compare hashes).
- No user-visible change.

**v3 — remove Python dependency.**

- Delete `tools/pet-hatching/scripts/`, drop the bundled Python runtime.
- Update build/CI accordingly.

The product phasing means **v1 ships with Python bundled if Wave 0 proves it safe.** This is a real cost (binary size, packaging complexity) but the alternative is delaying user-facing hatching by however long the Rust port takes. Trade-off favors shipping unless signing/notarization or size data says otherwise.

## Testing

**Unit tests (Rust):**

- Session state transitions, persistence round-trips, crash recovery from session.json.
- AppPaths hatching workspace/runtime-home methods stay separate from pet runtime paths.
- Hatching runtime manager does not share or shut down the pet `RuntimeSessionManager`.
- Pet `display_name` → `pet_id` normalization, reserved IDs, duplicate/collision suffixing.
- Imagegen file-watcher: detects `ig_*.png`, ignores other files, handles partial writes.
- Provenance validators: accept/reject per the existing rules.
- Mirror derivation parity test against `derive_running_left_from_running_right.py`.
- Import atomicity: failed package/import leaves no half-imported pet directory or library entry.

**Unit tests (TS):**

- Each wizard step component with mocked backend responses.
- Form validation, archetype pre-fill, reference image attach/swap.
- Pet ID preview/collision UX and library-full UX.
- Prototype iteration history navigation.
- Atlas grid rendering with various row states.
- Aggregate generation progress copy uses variable counts, not a fixed promise.

**Integration tests:**

- Full Tauri command flow with a mocked Codex app-server (no real imagegen).
- Reference image vision call mocked.
- Crash recovery: kill the process mid-prototype, restart, verify resume.
- Runtime isolation: run a mocked pet session and hatching session concurrently; assert canceling one does not cancel the other.
- Synthetic pipeline: accepted prototype + eight row strips + deterministic mirror produces valid atlas and package.

**End-to-end smoke (CI):**

- `npm run smoke:hatching-runtime` — synthetic imagegen results (test PNGs), runs the full pipeline, asserts a valid atlas + valid pet package come out the other side. This script must be added in Wave 2; until it exists, Wave 2 is not complete.
- `npm run tauri:build -- --no-sign` — required after Python-bundling/resource changes and before release handoff.

**Manual QA:**

- Real Codex auth + real imagegen for at least three personas (vibe-haver, lore-rich, reference-image).
- Failure-mode coverage: pull network mid-run, kill app mid-iteration, exhaust quota, malformed JSON from rewrite.

## Success criteria

- A new user can hatch a coherent custom pet without leaving the app or touching a terminal.
- Median custom-pet hatch completes in **10–15 minutes** (minimum 9 imagegens: 1 accepted prototype + 8 generated row strips; typical 2–4 prototype iterations; retries add time/cost).
- Prototype gate catches visual-direction failures cheaply: median user accepts within 3 iterations.
- Atlas validation passes for ≥ 95% of completed runs (i.e., the generation phase rarely produces broken atlases that reach Step 5).
- Resume-from-crash works for ≥ 99% of crash scenarios (workspace + session.json sufficient to reconstruct).
- Library state stays consistent: no orphan runtime homes, no half-imported pets after cancel.
- Running pet sessions and hatching sessions can overlap without one shutting down the other's Codex runtime.
- Every imported pet has complete provenance for prototype/base, eight generated rows, and the deterministic mirror.

## Closed decisions from v2 open questions

1. **Reference vision call timing.** Decision: async-prefetch with a soft block. If the user reaches Step 4 before description is ready, show a 1–3s spinner before drafting the prototype prompt. If the vision call fails, continue without the description.

2. **Iteration cap.** Decision: no hard cap. The fatigue nudge appears at iteration 4 and re-asserts every 3 iterations after. UI copy must remind the user that every retry costs one imagegen.

3. **Brief change after prototype iteration.** Decision: clear the iteration history on material brief changes. Surface a confirmation: "Changing the brief discards your 3 prototype attempts. Continue?" Non-material changes (whitespace only) do not invalidate.

4. **Generation phase parallelism.** Decision: start sequential, measure, parallelize in v1.1 if median latency is unacceptable. Avoids debugging concurrent imagegen failures in v1.

5. **Archetype thumbnail authoring.** Decision: v1 ships with six committed thumbnail PNGs under `src/ui/hatching/archetypes/` or `assets/hatching/archetypes/`. They are product assets, not runtime generations. Missing thumbnails block Wave 3 completion.
