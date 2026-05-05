# Codex Pet Sidecar MVP Implementation Plan

**Goal:** Build a personal desktop pet sidecar that launches its own `codex app-server`, renders a Codex pet on the desktop, chats through a pet-owned Codex thread, maintains `memory.md`, and says a small number of proactive things from local computer context.

**Architecture:** The orchestrator coordinates subagents, keeps the spec authoritative, merges accepted subagent outputs, and runs final verification. Implementation work is split across disjoint subagent lanes: protocol spike, Tauri scaffold, Rust foundation, runtime broker, local state, observers, React UI, integration, tests, and review hardening. The sidecar owns a local Codex app-server child process and never depends on the Codex Mac app runtime.

**Tech Stack:** Tauri v2, Rust, React, TypeScript, Vite, Codex CLI app-server over localhost WebSocket JSON-RPC, filesystem-backed `memory.md`, macOS observer commands, Vitest, Rust unit tests, and Playwright-style rendered QA where practical.

---

## Orchestration model

The orchestrator does not implement feature slices directly. It creates project skills, assigns subagents, enforces file ownership, reviews returned diffs, requests fixes, merges accepted subagent outputs, and runs gates. Subagents implement, fix, refactor, and review every code slice. If a merge conflict requires code edits, the orchestrator delegates that conflict to the owning implementation lane or to the serial integration/refactor subagent.

Execution happens in dependency phases:

1. Project skill activation and protocol spike.
2. App scaffold, generated protocol artifacts, and R1 fix lane.
3. Rust foundation and parallel implementation lanes with phase-disjoint files.
4. Integration lane.
5. Clean-code, security, UI, test, and performance reviews, each followed by explicit subagent fix lanes.
6. Final local proof on Trey's machine.

For parallel work, use one worktree per implementation lane unless the active Codex Desktop subagent workflow already provides isolated forked workspaces. Never run two write subagents on the same owned file set within the same phase. Serial phases may transfer ownership of a file, but the handoff must be explicit in the phase ownership table below.

## Project skills to install

Run this from `/Users/treygoff/Code/codex-pet-sidecar` before implementation:

```bash
codex-skill add clean-code rust-engineer frontend-delight webapp-testing refactor receiving-code-review slop-cleaner spec-quality-checklist
```

Expected result: `.codex/skills/` contains project links for those skills, and `codex-skill installed` reports them as project-active.

Skill assignments:

| Skill                    | Used by                                     | Purpose                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clean-code`             | all implementers and all reviewers          | Keep modules small, names precise, tests useful, comments scarce.                                                                                                                                                                           |
| `rust-engineer`          | runtime, observers, integration, test lanes | Idiomatic Rust, async process handling, errors, Cargo gates.                                                                                                                                                                                |
| `frontend-delight`       | UI lane and UI review                       | Make the pet feel alive instead of like a generic widget.                                                                                                                                                                                   |
| `webapp-testing`         | UI QA and final smoke lane                  | Rendered verification, screenshots, interaction checks.                                                                                                                                                                                     |
| `refactor`               | refactor pilot and clean-code review lanes  | Behavior-preserving simplification after features work.                                                                                                                                                                                     |
| `receiving-code-review`  | orchestrator after each review packet       | Triage findings into fixes without thrash.                                                                                                                                                                                                  |
| `slop-cleaner`           | final cleanup and clean-code reviewers      | Remove AI residue, redundant comments, dead variables, placeholder cruft.                                                                                                                                                                   |
| `spec-quality-checklist` | protocol spike and plan/spec reviewers      | Keep spec deltas precise when app-server facts force changes.                                                                                                                                                                               |
| `hatch-pet`              | pet asset validation lane                   | Validate Codex pet package assumptions, `pet.json`, and 8x9 spritesheet semantics. This skill is available globally in the session but is not installable through `codex-skill add` on this machine, so load it directly by path if needed. |

## Subagent roster

| Lane                | Subagent type                | Required project skills                               | Output                                                                                   |
| ------------------- | ---------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Protocol spike      | `docs_researcher`            | `spec-quality-checklist`, `clean-code`                | `docs/spikes/2026-05-05-codex-app-server-protocol.md` plus generated protocol artifacts. |
| Scaffold            | `worker`                     | `clean-code`                                          | Tauri React TypeScript app skeleton and baseline gates.                                  |
| R1 fix lane         | `worker`                     | `receiving-code-review`, `clean-code`, `slop-cleaner` | Subagent-applied fixes from scaffold/protocol review.                                    |
| Rust foundation     | `worker`                     | `rust-engineer`, `clean-code`                         | Shared Rust dependencies, module shell, and error type ownership.                        |
| Runtime broker      | `heavy_worker`               | `rust-engineer`, `clean-code`                         | Rust process supervisor, WebSocket JSON-RPC client, event mapper, prompt composition.    |
| Local state         | `worker`                     | `rust-engineer`, `clean-code`, `hatch-pet`            | Pet discovery, config, Codex pet asset validation, and `memory.md` lifecycle.            |
| Observers           | `worker`                     | `rust-engineer`, `clean-code`                         | Active app/window, workspace/git, idle state, rate-limit inputs.                         |
| UI shell            | `ui_fix_worker`              | `frontend-delight`, `clean-code`                      | Transparent pet UI, animation, bubble, drawer, settings.                                 |
| Integration         | `heavy_worker`               | `rust-engineer`, `clean-code`                         | Tauri commands/events connecting UI to broker/runtime/state.                             |
| Tests               | `test_hardener`              | `webapp-testing`, `rust-engineer`, `clean-code`       | Unit, integration, and smoke tests.                                                      |
| Clean-code review 1 | `reviewer`                   | `clean-code`, `slop-cleaner`                          | Findings after scaffold/runtime/state land.                                              |
| Review fix lanes    | `worker` or `refactor_pilot` | `receiving-code-review`, `clean-code`, `slop-cleaner` | Subagent-owned application of accepted review findings.                                  |
| Clean-code review 2 | `reviewer`                   | `clean-code`, `frontend-delight`, `slop-cleaner`      | Findings after UI/integration land.                                                      |
| Security review     | `security_auditor`           | `clean-code`                                          | Approval, shell, filesystem, and privacy risk findings.                                  |
| Performance review  | `performance_engineer`       | `clean-code`                                          | Idle CPU/RSS and event loop findings.                                                    |
| Final refactor      | `refactor_pilot`             | `refactor`, `clean-code`, `slop-cleaner`              | Behavior-preserving simplifications after review fixes.                                  |
| Final plan check    | `plan_reviewer`              | `spec-quality-checklist`                              | Read-only check that implementation matches the plan and spec.                           |

## Phase ownership table

This table, not a grep parser, is the ownership gate. Overlap is allowed only when the earlier phase has completed and the orchestrator has accepted that subagent output.

| Phase                     | Parallel lanes allowed                                   | Write ownership rule                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A: skills and protocol    | Task 0, then Task 1 serial                               | Only `.codex/skills/**`, `docs/spikes/**`, `protocol/app-server/**`, and `scripts/probe-codex-app-server.mjs`. No package files.                                                                 |
| B: scaffold               | Task 2 serial                                            | Scaffold owns broad `src/**` and `src-tauri/**` only long enough to create the app. Ownership transfers after R1 fixes.                                                                          |
| C: R1 fixes               | Task 2b serial                                           | Fix subagent owns only accepted R1 findings.                                                                                                                                                     |
| D: foundation             | Task 3 and Task 3a serial or parallel if no file overlap | Task 3 owns frontend domain files. Task 3a owns `src-tauri/Cargo.toml`, `src-tauri/src/error.rs`, and module shells.                                                                             |
| E: feature lanes          | Tasks 4, 5, 6, 6a, 7 may run in parallel after D         | Runtime, state, observers, animation reference, and UI own disjoint directories. No lane edits `Cargo.toml`, `src/App.tsx`, or `src-tauri/src/lib.rs` unless named.                              |
| F: integration            | Tasks 8, 9, 10 serial                                    | Integration may wire across earlier directories. No other write lane runs concurrently.                                                                                                          |
| G: review fixes and tests | Reviews then explicit fix lanes, then Task 11            | Reviewers are read-only. Fixes are delegated to the owning lane or `refactor_pilot`; test hardener changes test files and scripts unless the orchestrator explicitly delegates production fixes. |
| H: final proof            | Task 13 and final plan review serial                     | Verification docs only unless a blocker sends work back to a fix lane.                                                                                                                           |

---

## Task 0: Project skill activation

**Parallel:** no  
**Blocked by:** none  
**Subagent:** `worker`  
**Skills:** `clean-code`  
**Owned files:** `.codex/skills/clean-code`, `.codex/skills/rust-engineer`, `.codex/skills/frontend-delight`, `.codex/skills/webapp-testing`, `.codex/skills/refactor`, `.codex/skills/receiving-code-review`, `.codex/skills/slop-cleaner`, `.codex/skills/spec-quality-checklist`  
**Invariants:** Do not modify the spec. Do not add app code yet.  
**Out of scope:** Tauri scaffold, package files, generated protocol artifacts.

**Files:**

- Create: `.codex/skills/*` project skill links

**Step 1: Install project skills**
Run:

```bash
codex-skill add clean-code rust-engineer frontend-delight webapp-testing refactor receiving-code-review slop-cleaner spec-quality-checklist
```

Expected: command exits 0 and reports added project skills.

**Step 2: Verify project skills**
Run:

```bash
codex-skill installed clean-code && codex-skill installed rust-engineer && codex-skill installed frontend-delight && codex-skill installed webapp-testing && codex-skill installed refactor && codex-skill installed receiving-code-review && codex-skill installed slop-cleaner && codex-skill installed spec-quality-checklist
```

Expected: each skill reports `Project: active` or equivalent project-active status.

**Verification plan:**

- Primary command: `codex-skill validate`
- Secondary command: `codex-skill active`

---

## Task 1: Codex app-server protocol spike

**Parallel:** no  
**Blocked by:** Task 0  
**Subagent:** `docs_researcher`  
**Skills:** `spec-quality-checklist`, `clean-code`  
**Owned files:** `docs/spikes/2026-05-05-codex-app-server-protocol.md`, `protocol/app-server/ts/**`, `protocol/app-server/schema/**`, `scripts/probe-codex-app-server.mjs`  
**Invariants:** The sidecar owns its own app-server process. Do not depend on `/Applications/Codex.app` being open.  
**Out of scope:** UI code, Tauri scaffold, production broker code.

**Files:**

- Create: `docs/spikes/2026-05-05-codex-app-server-protocol.md`
- Create: `protocol/app-server/ts/**`
- Create: `protocol/app-server/schema/**`
- Create: `scripts/probe-codex-app-server.mjs`

**Step 1: Generate protocol artifacts**
Run:

```bash
mkdir -p protocol/app-server/ts protocol/app-server/schema
codex app-server generate-ts --experimental --out protocol/app-server/ts
codex app-server generate-json-schema --experimental --out protocol/app-server/schema
```

Expected: generated TypeScript bindings and JSON Schema files appear under `protocol/app-server/`.

**Step 2: Write a probe script**
Create `scripts/probe-codex-app-server.mjs` that:

```js
import { spawn } from "node:child_process";

if (typeof WebSocket === "undefined") {
  throw new Error("This probe requires a Node.js version with a global WebSocket implementation.");
}

const child = spawn("codex", ["app-server", "--listen", "ws://127.0.0.1:0"], {
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
const url = await new Promise((resolve, reject) => {
  const timeout = setTimeout(
    () => reject(new Error("timed out waiting for app-server URL")),
    10_000,
  );
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
    const match = stderr.match(/listening on:\s+(ws:\/\/127\.0\.0\.1:\d+)/);
    if (match) {
      clearTimeout(timeout);
      resolve(match[1]);
    }
  });
  child.on("exit", (code) => reject(new Error(`app-server exited early with ${code}: ${stderr}`)));
});

const ws = new WebSocket(url);
let nextId = 1;
const pending = new Map();

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data.toString());
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id).resolve(msg);
    pending.delete(msg.id);
  }
});

ws.addEventListener("error", (event) => {
  for (const { reject, timeout } of pending.values()) {
    clearTimeout(timeout);
    reject(new Error(`websocket error: ${event.message ?? "unknown"}`));
  }
  pending.clear();
});

function call(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timed out waiting for ${method}`));
    }, 10_000);
    pending.set(id, {
      resolve: (msg) => {
        clearTimeout(timeout);
        resolve(msg);
      },
      reject,
      timeout,
    });
  });
}

try {
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  console.log(await call("initialize", {}));
  console.log(await call("model/list", {}));
} finally {
  ws.close();
  child.kill();
}
```

If the exact JSON-RPC envelope differs, update the script and document the real shape.

**Step 3: Run the probe**
Run:

```bash
node -e "console.log(typeof WebSocket)"
node scripts/probe-codex-app-server.mjs
```

Expected: the first command prints `function`, and `initialize` plus `model/list` return successful JSON-RPC responses. Do not create or mutate `package.json` in this task.

**Step 4: Verify Mac app independence**
Run the probe once with Codex Mac app open and once with Codex Mac app closed.

Expected: both runs pass. If closing the Mac app is inconvenient during implementation, document the skipped state and run it before final acceptance.

**Step 5: Document protocol facts**
Write `docs/spikes/2026-05-05-codex-app-server-protocol.md` with:

- exact installed `codex -V`
- app-server launch command
- `initialize`, `thread/start`, `turn/start`, `turn/interrupt`, streaming delta, completion, and approval shapes
- confirmed `thread/start` payload for `ephemeral: true`, `baseInstructions`, `developerInstructions`, sandbox, model, and approval policy
- supported `approvalPolicy` values
- supported `sandbox` values
- whether hard tool or command blocklists exist
- references to the generated `ClientRequest`, `ServerRequest`, and `ServerNotification` TypeScript artifacts that prove the request and notification names used by the app
- known unknowns and required spec changes

**Verification plan:**

- Primary command: `node scripts/probe-codex-app-server.mjs`
- Secondary command: `codex app-server --help`

---

## Task 2: Tauri React scaffold

**Parallel:** no  
**Blocked by:** Task 1  
**Subagent:** `worker`  
**Skills:** `clean-code`  
**Owned files:** `package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `src/**`, `src-tauri/**`, `.gitignore`  
**Invariants:** Preserve `docs/specs/**`, `docs/plans/**`, `docs/spikes/**`, `.codex/skills/**`, and `protocol/app-server/**`.  
**Out of scope:** Runtime broker, observers, finished UI.

**Files:**

- Create: `package.json`
- Create: `package-lock.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`

**Step 1: Scaffold the app**
Run:

```bash
tmpdir="$(mktemp -d /tmp/codex-pet-sidecar-scaffold.XXXXXX)"
npm create tauri-app@latest "$tmpdir/app" -- --template react-ts --manager npm --identifier com.treygoff.codex-pet-sidecar --tauri-version 2 --yes
cp -R "$tmpdir/app/package.json" \
      "$tmpdir/app/package-lock.json" \
      "$tmpdir/app/index.html" \
      "$tmpdir/app/vite.config.ts" \
      "$tmpdir/app/tsconfig.json" \
      "$tmpdir/app/tsconfig.node.json" \
      "$tmpdir/app/src" \
      "$tmpdir/app/src-tauri" \
      .
```

Expected: Tauri v2 React TypeScript scaffold files are copied into the current repo without deleting existing `docs/**`, `.codex/skills/**`, or `protocol/**`.

Do not run `npm create tauri-app ... . --force` in the repo root. That command can delete existing planning and spec files.

**Step 2: Install dependencies**
Run:

```bash
npm install
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom
```

Expected: `package-lock.json` exists and npm exits 0.

**Step 2b: Verify scaffold preserved repo artifacts**
Run:

```bash
test -f docs/specs/2026-05-05-codex-pet-sidecar.md
test -f docs/plans/2026-05-05-codex-pet-sidecar-mvp.md
test -d protocol/app-server
test -d .codex/skills
```

Expected: all commands exit 0.

**Step 3: Add baseline scripts**
Modify `package.json` scripts to include:

```json
{
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "tauri": "tauri",
  "tauri:dev": "tauri dev",
  "tauri:build": "tauri build",
  "check": "npm run build && npm test && cargo test --manifest-path src-tauri/Cargo.toml"
}
```

Keep any scaffold-required scripts if names differ.

**Step 4: Configure transparent window**
In `src-tauri/tauri.conf.json`, configure the main window with transparent decorations appropriate for Tauri v2:

```json
{
  "app": {
    "windows": [
      {
        "title": "Codex Pet Sidecar",
        "width": 320,
        "height": 360,
        "transparent": true,
        "decorations": false,
        "alwaysOnTop": true,
        "resizable": false
      }
    ]
  }
}
```

If Tauri v2 field names differ in the scaffold, use the generated schema and document the actual names in the task handoff.

**Step 5: Run scaffold gates**
Run:

```bash
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: build passes, Vitest has either scaffold tests or exits cleanly after adding one trivial smoke test, Cargo tests pass.

**Verification plan:**

- Primary command: `npm run check`
- Secondary command: `npm run tauri:build`

---

## Review R1: Scaffold and protocol clean-code review

**Parallel:** no  
**Blocked by:** Task 2  
**Subagent:** `reviewer`  
**Skills:** `clean-code`, `slop-cleaner`, `spec-quality-checklist`  
**Owned files:** none  
**Mode:** read-only  
**Invariants:** Do not edit files in this pass.  
**Out of scope:** Feature requests beyond the spec.

**Review scope:**

- `docs/spikes/2026-05-05-codex-app-server-protocol.md`
- `protocol/app-server/**`
- scaffold config files
- `.codex/skills/**`

**Required findings:**

- Any mismatch between spec and discovered app-server facts.
- Any scaffold config likely to break transparent always-on-top behavior.
- Any generated artifact that should be ignored or regenerated instead of manually edited.
- Any AI-slop comments or placeholder code.

**Verification plan:**

- Primary command: read-only review report
- Secondary command: orchestrator delegates accepted findings to the next explicit fix lane using `receiving-code-review`

---

## Task 2b: R1 findings fix lane

**Parallel:** no  
**Blocked by:** Review R1  
**Subagent:** `worker`  
**Skills:** `receiving-code-review`, `clean-code`, `slop-cleaner`, `spec-quality-checklist`  
**Owned files:** accepted R1 finding files only, assigned by orchestrator before this lane starts  
**Invariants:** Apply review fixes only. Do not add product features. Do not proceed to feature lanes until accepted R1 blockers are fixed or explicitly deferred.  
**Out of scope:** Runtime broker, observers, finished UI.

**Files:**

- Modify: only files named in accepted R1 findings

**Step 1: Triage R1 findings**
Use `receiving-code-review` to split findings into:

- blocker, must fix before feature work
- non-blocking, fix now if small
- defer with reason

**Step 2: Delegate and apply fixes**
The fix subagent edits the files for accepted findings. If a finding requires code edits outside its assigned files, stop and ask the orchestrator to assign the correct owning lane.

**Step 3: Re-run R1 gates**
Run:

```bash
node scripts/probe-codex-app-server.mjs
npm run check
```

Expected: protocol probe and scaffold checks pass.

**Verification plan:**

- Primary command: `node scripts/probe-codex-app-server.mjs`
- Secondary command: `npm run check`

---

## Task 3: Shared TypeScript domain model

**Parallel:** yes  
**Blocked by:** Task 2b  
**Subagent:** `worker`  
**Skills:** `clean-code`  
**Owned files:** `src/domain/petConfig.ts`, `src/domain/runtimeEvents.ts`, `src/domain/observations.ts`, `src/domain/memory.ts`, `src/domain/rateLimit.ts`, `src/domain/__tests__/**`  
**Invariants:** Types mirror the spec. No Tauri imports in domain files.  
**Out of scope:** Rust code, UI components, actual observers.

**Files:**

- Create: `src/domain/petConfig.ts`
- Create: `src/domain/runtimeEvents.ts`
- Create: `src/domain/observations.ts`
- Create: `src/domain/memory.ts`
- Create: `src/domain/rateLimit.ts`
- Create: `src/domain/__tests__/rateLimit.test.ts`

**Step 1: Define types**
Create plain TypeScript types for `PetConfig`, `RuntimeSession`, `PetUserInput`, `PetAgentEvent`, `ObservationDigest`, `ProactiveTrigger`, and `MuteState`. `PetConfig` includes `workspaceCwd?: string`, which defaults later to the repo root where the sidecar is launched and can be edited in settings.

**Step 2: Add pure helpers**
Implement helpers:

```ts
export function isMuted(now: Date, muteUntil?: string): boolean;
export function canSendProactiveMessage(params: {
  now: Date;
  lastSentAt?: string;
  minMinutes: number;
  muteUntil?: string;
}): boolean;
export function formatMemoryForBaseInstructions(memoryMarkdown: string): string;
export function muteUntilForChoice(choice: "30m" | "2h" | "tomorrow", now: Date): string;
```

**Step 3: Test rate limits**
Add tests for muted state, the exact 30 minute / 2 hour / until tomorrow choices, 10-minute proactive limit, malformed mute timestamps, and memory formatting.

**Step 4: Run tests**
Run:

```bash
npm test -- src/domain/__tests__/rateLimit.test.ts
```

Expected: all tests pass.

**Verification plan:**

- Primary command: `npm test -- src/domain/__tests__/rateLimit.test.ts`
- Secondary command: `npm run build`

---

## Task 3a: Rust foundation and dependency ownership

**Parallel:** yes  
**Blocked by:** Task 2b  
**Subagent:** `worker`  
**Skills:** `rust-engineer`, `clean-code`  
**Owned files:** `src-tauri/Cargo.toml`, `src-tauri/src/error.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/runtime/mod.rs`, `src-tauri/src/state/mod.rs`, `src-tauri/src/pets/mod.rs`, `src-tauri/src/memory/mod.rs`, `src-tauri/src/observers/mod.rs`, `src-tauri/src/proactive/mod.rs`  
**Invariants:** This is the only feature-phase lane that edits `src-tauri/Cargo.toml`. It creates module shells only, not feature implementations.  
**Out of scope:** Runtime logic, state logic, observer logic, UI.

**Files:**

- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: module shell files listed above

**Step 1: Add shared Rust dependencies**
In `src-tauri/Cargo.toml`, add dependencies as needed:

```toml
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
tokio = { version = "1", features = ["process", "macros", "rt-multi-thread", "time", "io-util", "sync"] }
tokio-tungstenite = "0.27"
futures-util = "0.3"
which = "8"
regex = "1"
dirs = "6"
time = { version = "0.3", features = ["formatting", "macros"] }
```

If current compatible versions differ, use Cargo's resolver and document the exact versions in the handoff.

**Step 2: Add shared error type**
Create `src-tauri/src/error.rs` with a project error enum using `thiserror`. Keep UI-facing command errors separate for Task 8.

**Step 3: Add module shells**
Declare modules in `src-tauri/src/lib.rs` and create empty module shells so later lanes can edit their own directories without touching `lib.rs`.

**Step 4: Run Cargo foundation gates**
Run:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all pass.

**Verification plan:**

- Primary command: `cargo check --manifest-path src-tauri/Cargo.toml`
- Secondary command: `cargo test --manifest-path src-tauri/Cargo.toml`

---

## Task 4: Rust runtime broker

**Parallel:** yes  
**Blocked by:** Task 3a and Task 1  
**Subagent:** `heavy_worker`  
**Skills:** `rust-engineer`, `clean-code`  
**Owned files:** `src-tauri/src/runtime/**`  
**Invariants:** Runtime launches a pet-owned `codex app-server` process. Never proxy to the Mac app's app-server.  
**Out of scope:** UI, observers, pet discovery, `Cargo.toml`, `src-tauri/src/lib.rs`.

**Files:**

- Modify: `src-tauri/src/runtime/mod.rs`
- Create: `src-tauri/src/runtime/process.rs`
- Create: `src-tauri/src/runtime/json_rpc.rs`
- Create: `src-tauri/src/runtime/session.rs`
- Create: `src-tauri/src/runtime/events.rs`
- Create: `src-tauri/src/runtime/prompt.rs`
- Create: `src-tauri/src/runtime/__tests__/prompt.rs`

**Step 1: Implement process supervisor**
Implement:

```rust
pub struct AppServerProcess {
    pub websocket_url: String,
    child: tokio::process::Child,
}

impl AppServerProcess {
    pub async fn spawn_from_path(codex_path: &std::path::Path) -> Result<Self, RuntimeError>;
    pub async fn shutdown(&mut self) -> Result<(), RuntimeError>;
}
```

It must parse `listening on: ws://127.0.0.1:<port>` from stderr and time out after 10 seconds.

**Step 2: Implement JSON-RPC client**
Implement request id generation, pending response routing, notification stream, and graceful close. Keep the app-server wire protocol isolated in `json_rpc.rs`.

**Step 3: Implement runtime session and prompt composition**
Implement:

```rust
pub struct RuntimeSessionManager;

impl RuntimeSessionManager {
    pub async fn start_pet_session(&self, request: StartPetSessionRequest) -> Result<RuntimeSession, RuntimeError>;
    pub async fn send_user_turn(&self, input: PetUserInput) -> Result<(), RuntimeError>;
    pub async fn interrupt_turn(&self) -> Result<(), RuntimeError>;
    pub async fn shutdown(&self) -> Result<(), RuntimeError>;
}
```

Use protocol facts from Task 1 for exact method names and payloads. This lane owns final `thread/start` prompt composition: pet name, persona, full `memory.md` contents in `baseInstructions`, behavioral rules in `developerInstructions`, absolute memory path, and `ephemeral: true`.

**Step 4: Unit test process parsing, JSON-RPC routing, and prompts**
Add tests for stderr URL parsing, timeout behavior, response routing, notification mapping, `ephemeral: true`, persona injection, memory injection, and absolute memory path in developer instructions.

**Step 5: Run Rust gates**
Run:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all pass.

**Verification plan:**

- Primary command: `cargo test --manifest-path src-tauri/Cargo.toml runtime`
- Secondary command: full Cargo fmt, clippy, test commands above

---

## Task 5: Pet config, pet discovery, and memory file lifecycle

**Parallel:** yes  
**Blocked by:** Task 3a  
**Subagent:** `worker`  
**Skills:** `rust-engineer`, `clean-code`, `hatch-pet`  
**Owned files:** `src-tauri/src/state/**`, `src-tauri/src/pets/**`, `src-tauri/src/memory/**`  
**Invariants:** Memory is a plain `memory.md` edited directly by the pet through Codex tools. Broker creates and injects it, but does not mediate later writes.  
**Out of scope:** Runtime JSON-RPC, UI components, observers, `Cargo.toml`, `src-tauri/src/lib.rs`.

**Files:**

- Modify: `src-tauri/src/state/mod.rs`
- Create: `src-tauri/src/state/paths.rs`
- Create: `src-tauri/src/state/config.rs`
- Modify: `src-tauri/src/pets/mod.rs`
- Create: `src-tauri/src/pets/installed_pet.rs`
- Modify: `src-tauri/src/memory/mod.rs`
- Create: `src-tauri/src/memory/file.rs`

**Step 1: Implement app paths**
Resolve:

```text
${CODEX_HOME:-$HOME/.codex}/pets/
~/Library/Application Support/Codex Pet Sidecar/pets/<pet-id>/pet.config.json
~/Library/Application Support/Codex Pet Sidecar/pets/<pet-id>/memory.md
```

Use Tauri app path APIs where possible for application support paths.

**Step 2: Implement pet discovery**
Read each `pet.json`, require `spritesheet.webp`, validate the 8x9 `1536x1872` spritesheet contract from the `hatch-pet` skill, and return display data to the frontend. Dimension validation is required, not best effort. Skip malformed pets with a diagnostic error value, not a panic.

**Step 3: Implement config lifecycle**
Read and write `pet.config.json` with first-launch defaults:

```json
{
  "petId": "",
  "displayName": "",
  "spritesheetPath": "",
  "persona": "You are my little buddy in my computer with me.",
  "mute": {},
  "workspaceCwd": "/Users/treygoff/Code/codex-pet-sidecar",
  "observers": { "activeApp": true, "windowTitle": true, "workspace": true, "idle": true },
  "proactive": { "enabled": true, "minMinutesBetweenMessages": 10 }
}
```

**Step 4: Implement memory creation**
Create `memory.md` on first run with:

```md
# Memory for <pet name>

## About Trey

-

## Project context

-

## Things to remember

-
```

**Step 5: Unit test filesystem behavior**
Use temp directories to test missing config, malformed pet metadata, missing spritesheet, invalid spritesheet dimensions, first memory creation, workspace cwd defaulting, and hand-edited memory preservation.

**Verification plan:**

- Primary command: `cargo test --manifest-path src-tauri/Cargo.toml state pets memory`
- Secondary command: `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`

---

## Task 6: Local observer bus

**Parallel:** yes  
**Blocked by:** Task 3a  
**Subagent:** `worker`  
**Skills:** `rust-engineer`, `clean-code`  
**Owned files:** `src-tauri/src/observers/**`  
**Invariants:** Observers are passive and only emit digests. They do not stream raw screen content, terminal content, file contents, diffs, or secrets.  
**Out of scope:** UI, app-server runtime, memory.

**Files:**

- Create: `src-tauri/src/observers/mod.rs`
- Create: `src-tauri/src/observers/active_app.rs`
- Create: `src-tauri/src/observers/workspace.rs`
- Create: `src-tauri/src/observers/idle.rs`
- Create: `src-tauri/src/observers/digest.rs`

**Step 1: Define Rust observation types**
Mirror the spec's digest contract:

```rust
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ObservationDigest {
    ActiveApp { app_name: String, window_title: Option<String>, observed_at: String },
    Workspace { cwd: String, repo_name: Option<String>, branch: Option<String>, dirty_summary: Option<String>, observed_at: String },
    IdleState { idle_since: Option<String>, returned_at: Option<String>, observed_at: String },
}
```

**Step 2: Implement active app observer**
On macOS, use a small `osascript` or native call to obtain active app name. If window title permission fails, return app name only and include a typed degraded status.

**Step 3: Implement workspace observer**
Use `git` commands against `PetConfig.workspaceCwd`. For MVP, default this to the repo root where the sidecar was launched, and allow Task 7 settings UI to edit it later:

```bash
git rev-parse --show-toplevel
git branch --show-current
git status --short
```

Dirty summary should be counts only, for example `3 modified, 1 untracked`.

**Step 4: Implement idle observer**
Use macOS idle time APIs or a command wrapper. Emit returned-from-idle only after idle time exceeds 5 minutes.

**Step 5: Unit test digest aggregation**
Mock command outputs. Test permission-denied active window, missing workspace cwd, non-git workspace, clean repo, dirty repo, and idle-return threshold.

**Verification plan:**

- Primary command: `cargo test --manifest-path src-tauri/Cargo.toml observers`
- Secondary command: manual active app probe on macOS during final QA

---

## Task 6a: Animation reference spike

**Parallel:** yes  
**Blocked by:** Task 2b  
**Subagent:** `ui_qa_driver`  
**Skills:** `frontend-delight`, `hatch-pet`, `clean-code`  
**Owned files:** `docs/spikes/2026-05-05-pet-animation-reference.md`  
**Invariants:** Read or observe the Codex Mac app pet only as a reference. Do not make runtime code depend on `/Applications/Codex.app`.  
**Out of scope:** UI implementation.

**Files:**

- Create: `docs/spikes/2026-05-05-pet-animation-reference.md`

**Step 1: Inspect available pet assets**
Use the `hatch-pet` skill contract and local `${CODEX_HOME:-$HOME/.codex}/pets/` examples to record spritesheet geometry, common frame names if present, and `pet.json` fields.

**Step 2: Observe animation feel**
If the Codex Mac app pet is available, observe idle, blink, talk, and sleep cadence. If direct internals are hard to read, record observed timing targets instead of depending on private implementation.

**Step 3: Write the reference doc**
Document:

- frame geometry and CSS background-position math
- initial frame map assumptions
- blink frequency range
- talk animation frame cycle
- drag and idle feel targets
- what must be visually checked in Task 13

**Verification plan:**

- Primary command: read-only spike document exists
- Secondary command: UI lane cites the spike in its handoff

---

## Task 7: React pet UI and animation shell

**Parallel:** yes  
**Blocked by:** Task 3, Task 5 interfaces, and Task 6a  
**Subagent:** `ui_fix_worker`  
**Skills:** `frontend-delight`, `clean-code`  
**Owned files:** `src/App.tsx`, `src/styles.css`, `src/ui/**`, `src/hooks/**`, `src/assets/**`  
**Invariants:** UI should work with mocked runtime events before real runtime integration. Do not call Tauri commands directly from leaf components.  
**Out of scope:** Rust runtime implementation, observer implementation.

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/ui/PetWindow.tsx`
- Create: `src/ui/PetSprite.tsx`
- Create: `src/ui/SpeechBubble.tsx`
- Create: `src/ui/ChatDrawer.tsx`
- Create: `src/ui/PetPicker.tsx`
- Create: `src/ui/SettingsPanel.tsx`
- Create: `src/ui/MuteControl.tsx`
- Create: `src/hooks/useTypewriter.ts`
- Create: `src/hooks/usePetAnimation.ts`
- Create: `src/hooks/useDraggablePet.ts`
- Create: `src/ui/__tests__/useTypewriter.test.tsx`

**Step 1: Write visual thesis**
Add a short comment at the top of `src/ui/PetWindow.tsx` or a note in the task handoff:

```text
Visual thesis: a tiny creature living at the edge of the desktop, soft and low-friction, with letter-from-a-friend chat rather than productivity chrome.
```

Do not add decorative comments elsewhere.

**Step 2: Implement sprite renderer**
Render the selected `spritesheet.webp` using CSS background positioning for 8 columns and 9 rows of `192x208` cells. Support states: idle, blink, talk, sleep.

**Step 3: Implement animation hook**
`usePetAnimation` should choose frames from a small frame map and support jittered blinks, talk cycling during streaming, and sleep after prolonged idle. Use `docs/spikes/2026-05-05-pet-animation-reference.md` for timing targets.

**Step 4: Implement typewriter bubble**
`useTypewriter` should stream at about 50 chars/sec with a small pause after sentence punctuation. Bubble overflow opens the drawer and continues text there.

**Step 5: Implement drawer, settings, picker, workspace cwd, and mute**
Use clear component boundaries. Keep all runtime calls behind a thin adapter prop. Mute choices must be exactly 30 minutes, 2 hours, and until tomorrow. Settings must expose the workspace cwd used by repo observer digests.

**Step 6: Add unit tests for typewriter and drawer overflow**
Run:

```bash
npm test -- src/ui/__tests__/useTypewriter.test.tsx
```

Expected: text reveals in order, preserves characters during overflow, handles empty text, renders exact mute choices, and keeps workspace cwd editable through settings.

**Verification plan:**

- Primary command: `npm test -- src/ui/__tests__/useTypewriter.test.tsx`
- Secondary command: `npm run build`
- Rendered QA command later: `npm run tauri:dev`, then visual inspection or agent-browser if accessible

---

## Task 8: Tauri command and event integration

**Parallel:** no  
**Blocked by:** Tasks 3, 4, 5, 6, 7  
**Subagent:** `heavy_worker`  
**Skills:** `rust-engineer`, `clean-code`  
**Owned files:** `src-tauri/src/commands.rs`, `src-tauri/src/app_state.rs`, `src-tauri/src/lib.rs`, `src/runtimeBridge.ts`, `src/App.tsx`, `src/ui/**`  
**Invariants:** UI leaf components remain mostly presentational. Runtime errors surface as recoverable UI states.  
**Out of scope:** Major redesign, new observers, new memory backend.

**Files:**

- Create: `src-tauri/src/commands.rs`
- Create: `src-tauri/src/app_state.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/runtimeBridge.ts`
- Modify: `src/App.tsx`
- Modify: selected `src/ui/**` files for wiring only

**Step 1: Define Tauri commands**
Expose commands:

```rust
#[tauri::command]
async fn list_installed_pets(state: tauri::State<'_, AppState>) -> Result<Vec<InstalledPet>, CommandError>;

#[tauri::command]
async fn save_pet_config(state: tauri::State<'_, AppState>, config: PetConfig) -> Result<(), CommandError>;

#[tauri::command]
async fn start_pet_runtime(state: tauri::State<'_, AppState>) -> Result<RuntimeSession, CommandError>;

#[tauri::command]
async fn send_user_message(state: tauri::State<'_, AppState>, text: String) -> Result<(), CommandError>;

#[tauri::command]
async fn set_mute_until(state: tauri::State<'_, AppState>, until: Option<String>) -> Result<(), CommandError>;
```

Adjust exact types for Tauri serialization.

**Step 2: Emit runtime events**
Emit frontend events for `text_delta`, `turn_completed`, `approval_request`, observer digests, and recoverable errors.

**Step 3: Wire frontend bridge**
Create `src/runtimeBridge.ts` as the only direct user of `@tauri-apps/api` in the frontend.

**Step 4: Connect UI state**
In `App.tsx`, load pets, show picker if needed, start runtime after config, subscribe to events, and route chat messages.

**Step 5: Integration test bridge with mocks**
Use Vitest mocks for `@tauri-apps/api/core` and event listeners.

**Verification plan:**

- Primary command: `npm test -- src/runtimeBridge.test.ts`
- Secondary command: `cargo test --manifest-path src-tauri/Cargo.toml commands`
- Full command: `npm run check`

---

## Task 9: Approval prompt path

**Parallel:** no  
**Blocked by:** Task 8 and protocol facts from Task 1  
**Subagent:** `heavy_worker`  
**Skills:** `rust-engineer`, `clean-code`  
**Owned files:** `src-tauri/src/runtime/approvals.rs`, `src-tauri/src/runtime/events.rs`, `src-tauri/src/commands.rs`, `src/ui/ApprovalPrompt.tsx`, `src/runtimeBridge.ts`  
**Invariants:** Never auto-approve destructive actions. If the protocol cannot route approvals, disable risky tool use or document the blocking spec change before proceeding.  
**Out of scope:** Tool allowlist UI.

**Files:**

- Create: `src-tauri/src/runtime/approvals.rs`
- Modify: `src-tauri/src/runtime/events.rs`
- Modify: `src-tauri/src/commands.rs`
- Create: `src/ui/ApprovalPrompt.tsx`
- Modify: `src/runtimeBridge.ts`

**Step 1: Map approval notification shape**
Use Task 1 protocol facts to parse app-server approval notifications into:

```ts
type ApprovalRequest = {
  requestId: string;
  toolName: string;
  detail: string;
  risk: "read" | "write" | "execute" | "unknown";
};
```

**Step 2: Add approval UI**
Render actions: allow once, allow for this session, deny. Disable allow-for-session if the app-server protocol does not support it.

**Step 3: Send approval response**
Route the selected action back over JSON-RPC using the exact protocol method from Task 1.

**Step 4: Add fallback behavior**
If approval prompts are tied to Codex's own UI and cannot be routed, update the spec and force the MVP to use a safer `approvalPolicy` plus visible limitation. Do not fake it.

**Verification plan:**

- Primary command: unit test approval event mapping
- Secondary command: manual test with a write command that should prompt

---

## Task 10: Proactive trigger engine

**Parallel:** no  
**Blocked by:** Tasks 3, 6, 8  
**Subagent:** `worker`  
**Skills:** `rust-engineer`, `clean-code`  
**Owned files:** `src-tauri/src/proactive/**`, `src-tauri/src/app_state.rs`, `src/domain/rateLimit.ts`, `src/domain/__tests__/rateLimit.test.ts`  
**Invariants:** At most one proactive message per 10 minutes. Mute always wins. Observers aggregate state before injection.  
**Out of scope:** New triggers beyond idle-return and repo-changed.

**Files:**

- Create: `src-tauri/src/proactive/mod.rs`
- Create: `src-tauri/src/proactive/rate_limit.rs`
- Create: `src-tauri/src/proactive/triggers.rs`
- Modify: `src-tauri/src/app_state.rs`
- Modify: `src/domain/rateLimit.ts`
- Modify: `src/domain/__tests__/rateLimit.test.ts`

**Step 1: Implement trigger detection**
Detect only:

- returned-from-idle after >5 minutes
- repo changed from last observed repo name

**Step 2: Implement rate limiter**
Persist or hold in app state `lastProactiveMessageAt`. Respect `mute.until` and `minMinutesBetweenMessages`.

**Step 3: Inject digest turns**
Use runtime session to inject a concise context message only when a trigger passes rate limits. The injected message must say it is an observation digest, not user speech.

**Step 4: Test trigger behavior**
Unit test idle threshold, repo-change detection, mute override, and 10-minute limit.

**Verification plan:**

- Primary command: `cargo test --manifest-path src-tauri/Cargo.toml proactive`
- Secondary command: `npm test -- src/domain/__tests__/rateLimit.test.ts`

---

## Review R2: Runtime, state, observers, and proactive clean-code review

**Parallel:** no  
**Blocked by:** Tasks 4, 5, 6, 10  
**Subagent:** `reviewer`  
**Skills:** `clean-code`, `rust-engineer`, `slop-cleaner`  
**Owned files:** none  
**Mode:** read-only  
**Invariants:** Findings only. No edits.  
**Out of scope:** UI taste review.

**Review scope:**

- `src-tauri/src/runtime/**`
- `src-tauri/src/state/**`
- `src-tauri/src/pets/**`
- `src-tauri/src/memory/**`
- `src-tauri/src/observers/**`
- `src-tauri/src/proactive/**`

**Required findings:**

- Unclear ownership, lifecycle, or shutdown behavior.
- Over-broad functions or modules doing more than one job.
- `unwrap`, panic, hidden global state, ignored errors, or silent fallbacks.
- Observer privacy leaks beyond the digest contract.
- Any comments that explain bad code instead of making code clearer.

**Verification plan:**

- Primary command: read-only review report
- Secondary command: orchestrator delegates accepted findings to the next explicit fix lane using `receiving-code-review`

---

## Review R3: UI delight and clean-code review

**Parallel:** no  
**Blocked by:** Tasks 7, 8, 9  
**Subagent:** `ui_review_guard`  
**Skills:** `frontend-delight`, `clean-code`, `slop-cleaner`  
**Owned files:** none  
**Mode:** read-only  
**Invariants:** Findings only. No edits.  
**Out of scope:** Runtime protocol review.

**Review scope:**

- `src/ui/**`
- `src/hooks/**`
- `src/App.tsx`
- `src/styles.css`
- `src/runtimeBridge.ts`

**Required findings:**

- UI feels generic, noisy, too app-like, or not pet-like.
- Component boundaries leak runtime concerns into leaf components.
- Animation timing is jittery, too busy, or not state-driven.
- Chat drawer or speech bubble can lose streamed text.
- Accessibility basics missing for chat input, settings, and approval prompts.

**Verification plan:**

- Primary command: read-only review report
- Secondary command: rendered QA after fixes

---

## Task 10b: R2 and R3 findings fix lane

**Parallel:** no  
**Blocked by:** Reviews R2 and R3  
**Subagent:** `refactor_pilot`  
**Skills:** `receiving-code-review`, `refactor`, `clean-code`, `slop-cleaner`, `frontend-delight`, `rust-engineer`  
**Owned files:** accepted R2/R3 finding files only, assigned by orchestrator before this lane starts  
**Invariants:** Apply accepted review findings only. Preserve behavior unless the finding is a real bug. Keep UI fixes consistent with the animation reference spike.  
**Out of scope:** Security/performance findings from R4/R5, new features.

**Files:**

- Modify: only files named in accepted R2/R3 findings

**Step 1: Triage R2 and R3 findings**
Use `receiving-code-review` to group findings by owning lane: runtime/state/observer/proactive, UI, or integration.

**Step 2: Apply fixes through the owning lane**
The fix subagent may edit only assigned files. If a finding crosses lane boundaries, split it into serial patches and run focused tests after each patch.

**Step 3: Run focused gates**
Run the checks named by the finding plus:

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all pass.

**Verification plan:**

- Primary command: `npm test && cargo test --manifest-path src-tauri/Cargo.toml`
- Secondary command: `npm run build`

---

## Task 11: Automated and manual test hardening

**Parallel:** no  
**Blocked by:** Task 10b  
**Subagent:** `test_hardener`  
**Skills:** `webapp-testing`, `rust-engineer`, `clean-code`  
**Owned files:** `src/**/*.test.ts`, `src/**/*.test.tsx`, `src-tauri/tests/**`, `tests/**`, `scripts/smoke-*.mjs`, `package.json` test scripts only  
**Invariants:** Tests should verify behavior, not implementation trivia. Do not add brittle sleeps where event synchronization is available. Do not edit production modules unless the orchestrator explicitly delegates a failing-test fix to the original owning lane.  
**Out of scope:** New product features.

**Files:**

- Create: `scripts/smoke-codex-runtime.mjs`
- Create: `tests/rendered-pet-smoke.spec.ts` if Playwright is adopted
- Modify: existing test files
- Modify: `package.json` scripts if needed

**Step 1: Add runtime smoke**
Create `scripts/smoke-codex-runtime.mjs` that starts the built app-server probe path or calls the Rust command through a narrow test harness. It should prove:

- `codex` is found
- sidecar-owned app-server starts
- `initialize` succeeds
- app-server child exits cleanly
- a bad or missing `codex` path produces a recoverable setup/retry error instead of a crash

**Step 2: Add UI smoke**
Use Vitest or Playwright to prove:

- picker renders with mocked pets
- chat input sends a message through `runtimeBridge`
- streamed deltas append without loss
- mute control suppresses proactive render state
- app-server startup failure renders a recoverable setup/retry state

**Step 3: Add Rust integration tests**
Add tests for command serialization, app paths, shutdown idempotence, app-server startup failure, and prompt payload assertions for `ephemeral: true`, persona injection, and memory injection.

**Step 4: Run focused gates**
Run:

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml
node scripts/probe-codex-app-server.mjs
```

Expected: all pass.

**Verification plan:**

- Primary command: `npm test && cargo test --manifest-path src-tauri/Cargo.toml`
- Secondary command: `node scripts/probe-codex-app-server.mjs`

---

## Review R4: Security and privacy review

**Parallel:** yes  
**Blocked by:** Task 11  
**Subagent:** `security_auditor`  
**Skills:** `clean-code`  
**Owned files:** none  
**Mode:** read-only  
**Invariants:** The pet is trusted for Trey's toy MVP, but destructive actions still require real approval gates.  
**Out of scope:** Enterprise hardening and distributable signing.

**Review scope:**

- Process launching
- Shell command usage
- App-server approval flow
- Filesystem paths
- Observer digests
- Memory file injection

**Required findings:**

- Command injection paths.
- Accidental dependency on the Codex Mac app server.
- Observer leakage beyond metadata digest.
- Auto-approval or approval bypass.
- Memory path traversal or writing outside app support directory during setup.

**Verification plan:**

- Primary command: read-only security findings
- Secondary command: orchestrator delegates accepted findings to the next explicit fix lane using `receiving-code-review`

---

## Review R5: Performance and desktop-behavior review

**Parallel:** yes  
**Blocked by:** Task 11  
**Subagent:** `performance_engineer`  
**Skills:** `clean-code`  
**Owned files:** none  
**Mode:** read-only  
**Invariants:** Idle app should stay quiet. No busy animation loops that burn CPU.  
**Out of scope:** Deep profiling beyond MVP needs.

**Review scope:**

- Animation loop
- Observer polling cadence
- WebSocket event handling
- App-server child lifecycle
- Memory and config reads

**Required findings:**

- Polling too often.
- Animation work not tied to frame state.
- Unbounded event buffers.
- App-server child leaks.
- Idle RSS risk above the spec's ~80MB target for the Tauri app process.

**Verification plan:**

- Primary command: read-only performance findings
- Secondary command: manual Activity Monitor or `ps` check during final proof

---

## Task 11b: R4 and R5 findings fix lane

**Parallel:** no  
**Blocked by:** Reviews R4 and R5  
**Subagent:** `refactor_pilot`  
**Skills:** `receiving-code-review`, `refactor`, `clean-code`, `slop-cleaner`, `rust-engineer`, `frontend-delight`  
**Owned files:** accepted R4/R5 finding files only, assigned by orchestrator before this lane starts  
**Invariants:** Security findings beat convenience. Performance fixes must preserve pet feel.  
**Out of scope:** New product features, packaging, signing.

**Files:**

- Modify: only files named in accepted R4/R5 findings

**Step 1: Triage security and performance findings**
Use `receiving-code-review` to label each finding as must-fix, defer-for-toy-MVP, or false positive with evidence.

**Step 2: Apply fixes through subagent-owned patches**
No orchestrator code edits. If a security fix crosses files, assign a serial fix scope to this subagent and run the exact checks below.

**Step 3: Run gates**
Run:

```bash
npm run check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
node scripts/probe-codex-app-server.mjs
```

Expected: all pass.

**Verification plan:**

- Primary command: `npm run check`
- Secondary command: Cargo clippy plus app-server probe above

---

## Task 12: Final refactor and slop cleanup

**Parallel:** no  
**Blocked by:** Task 11b  
**Subagent:** `refactor_pilot`  
**Skills:** `refactor`, `clean-code`, `slop-cleaner`  
**Owned files:** Any implementation file touched by accepted review findings, coordinated by orchestrator before task start  
**Invariants:** Behavior-preserving unless a review finding identifies a real bug. Run tests after each small cluster.  
**Out of scope:** New features, visual redesign, speculative abstraction.

**Files:**

- Modify: review-directed files only

**Step 1: Triage findings**
Use `receiving-code-review` to group findings into:

- must fix before local run
- should fix now
- defer with explicit note

**Step 2: Apply smallest fixes**
Refactor one cluster at a time. Prefer extracting modules only when call sites get simpler.

**Step 3: Run focused checks after each cluster**
Run the smallest relevant command, for example:

```bash
cargo test --manifest-path src-tauri/Cargo.toml runtime
npm test -- src/ui/__tests__/useTypewriter.test.tsx
```

**Step 4: Run broad checks**
Run:

```bash
npm run check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

Expected: all pass.

**Verification plan:**

- Primary command: `npm run check`
- Secondary command: Cargo clippy command above

---

## Task 13: Local end-to-end proof

**Parallel:** no  
**Blocked by:** Task 12  
**Subagent:** `test_hardener`  
**Skills:** `webapp-testing`, `frontend-delight`, `clean-code`  
**Owned files:** `docs/verification/2026-05-05-local-mvp-proof.md`, optional test scripts under `scripts/**`  
**Invariants:** Do not claim success without a real local run. Record skipped manual checks honestly.  
**Out of scope:** Packaging, code signing, distribution.

**Files:**

- Create: `docs/verification/2026-05-05-local-mvp-proof.md`

**Step 1: Run static gates**
Run:

```bash
npm run check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
node scripts/probe-codex-app-server.mjs
```

Expected: all pass.

**Step 2: Run Tauri app locally**
Run:

```bash
npm run tauri:dev
```

Expected: transparent always-on-top window opens, no immediate frontend console errors, no app crash.

**Step 3: Manual MVP checklist**
Verify and record:

- first-launch pet picker lists installed Codex pets
- selected pet renders from its spritesheet
- chat sends a message and receives streamed text
- runtime starts a pet-owned ephemeral thread with persona-specific `baseInstructions`
- `memory.md` is created at the app support path
- ask the pet to remember a harmless fact, verify `memory.md` changes through Codex filesystem tools, restart a new thread, and verify the fact is available from injected memory
- app-server child is separate from the Codex Mac app's app-server
- app still starts when Codex Mac app is closed
- a deliberately bad `codex` path or startup failure shows a recoverable setup/retry UI instead of crashing
- returned-from-idle and repo-changed triggers respect mute and rate limit
- exact mute choices work: 30 minutes, 2 hours, until tomorrow
- speech bubble overflow opens the drawer without dropping streamed characters
- drag-to-move has momentum and does not trap the pet under the menu bar or dock
- idle, blink, talk, and sleep cadence match the animation reference spike closely enough for toy MVP
- Tauri app process idle RSS is recorded and is under roughly 80MB, or the overage is explained honestly
- app-server child exits when app quits
- the verification doc includes a one-week dogfood checkpoint section that Trey can fill in after living with it

**Step 4: Record evidence**
Write `docs/verification/2026-05-05-local-mvp-proof.md` with commands, pass/fail status, `ps` or Activity Monitor RSS evidence, app-server process evidence, memory write evidence, and any remaining risks.

Rendered evidence is mandatory. Include at least one screenshot or short capture for each state:

- pet rendered from spritesheet
- speech bubble during streamed text
- drawer open after bubble overflow
- approval or recoverable-error state if reachable during the run

**Verification plan:**

- Primary command: `npm run tauri:dev`
- Secondary command: `ps -ax -o pid=,command= | rg '[c]odex app-server|Codex Pet Sidecar|tauri'` while app is running and after quit

---

## Final plan review

**Parallel:** no  
**Blocked by:** Task 13  
**Subagent:** `plan_reviewer`  
**Skills:** `spec-quality-checklist`  
**Owned files:** none  
**Mode:** read-only  
**Invariants:** Compare implementation to the spec and this plan. Do not expand scope.  
**Out of scope:** New product ideas.

**Review questions:**

1. Does the implementation satisfy every v1 acceptance criterion in `docs/specs/2026-05-05-codex-pet-sidecar.md`?
2. Did any parallel lanes write overlapping files without orchestration?
3. Are all app-server protocol assumptions verified in `docs/spikes/2026-05-05-codex-app-server-protocol.md`?
4. Did clean-code, UI, security, performance, and test reviews run and get triaged?
5. Are skipped checks named in `docs/verification/2026-05-05-local-mvp-proof.md`?
6. Is there a post-MVP dogfood note for the one-week criterion: "after a week of personal use, I still want it on my desktop"?

Expected output: final read-only signoff or a short blocker list.

---

## Phase-aware ownership check

Before each parallel tranche, the orchestrator checks the phase ownership table manually and records the active write lanes in the run notes. Do not use a naive text parser for this plan, because serial ownership transfers and broad scaffold globs are intentional.

Required checks:

1. No two active write subagents in the same phase own the same concrete file or directory glob.
2. If a task needs a file outside its owned set, pause and reassign the task or make it serial.
3. Reviewers never edit files.
4. Review fixes happen only in explicit fix lanes.
5. `src-tauri/Cargo.toml` is owned only by Task 3a during feature work. Later dependency changes require a serial fix lane.
6. `src/App.tsx`, `src/runtimeBridge.ts`, `src-tauri/src/lib.rs`, and `src-tauri/src/app_state.rs` are integration-phase files unless a task explicitly owns them.

Expected: the orchestrator can name the active phase, active write lanes, and non-overlap rationale before spawning parallel subagents.

## Final gate

Run from `/Users/treygoff/Code/codex-pet-sidecar`:

```bash
codex-skill validate
npm run check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
node scripts/probe-codex-app-server.mjs
```

Expected: all pass.

Then run the manual Tauri proof in Task 13. Do not call the MVP done until the sidecar has launched its own app-server, started an ephemeral pet thread, chatted once, created and updated `memory.md` through the pet, rendered a pet, survived app-server startup failure, recorded RSS, and cleaned up its child process on quit.
