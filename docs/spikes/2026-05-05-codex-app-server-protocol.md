# Codex app-server protocol spike - 2026-05-05

## Environment

- `codex -V`: `codex-cli 0.128.0`
- Launch command used by the sidecar and probes: `codex app-server --listen ws://127.0.0.1:0`
- Probe command: `node scripts/probe-codex-app-server.mjs`
- Runtime smoke command: `node scripts/smoke-codex-runtime.mjs`
- Confirmed loopback URL format: stderr contains `listening on: ws://127.0.0.1:<port>`.

## Verified live behavior

`node scripts/probe-codex-app-server.mjs` passed on this machine with the Codex Mac app already running. It verified:

- app-server starts as a sidecar-owned child process from the CLI
- `initialize` succeeds with `capabilities.experimentalApi: true`
- `model/list` succeeds
- child process exits cleanly after the probe script closes the WebSocket and kills the child

`node scripts/smoke-codex-runtime.mjs` passed and additionally verified:

- a missing Codex path produces an `ENOENT` setup failure instead of a crash
- `thread/start` succeeds with `ephemeral: true`
- `approvalPolicy: "on-request"` is echoed back
- `approvalsReviewer: "user"` is echoed back
- `sandbox: "workspace-write"` is accepted and returned as a `workspaceWrite` sandbox policy
- response thread has `path: null`, confirming the thread is ephemeral and not materialized on disk

Skipped: I did not close `/Applications/Codex.app` from this implementation run because that could disrupt the live user session. The CLI-owned child was still distinct from the Mac app app-server; process checks showed both the Mac app server and the probe/smoke child while the probes were running.

## Request and response shapes used

Generated protocol artifacts are under `protocol/app-server/` and are treated as generated snapshots, not hand-edited source.

Important generated references:

- `protocol/app-server/ts/ClientRequest.ts` includes `initialize`, `thread/start`, `turn/start`, `turn/interrupt`, and `model/list` client request methods.
- `protocol/app-server/ts/ServerRequest.ts` includes approval callbacks: `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval`, plus legacy `execCommandApproval` and `applyPatchApproval`.
- `protocol/app-server/ts/ServerNotification.ts` includes `thread/started`, `thread/status/changed`, `turn/started`, `turn/completed`, `item/agentMessage/delta`, `error`, and approval review status notifications.
- `protocol/app-server/ts/v2/ThreadStartParams.ts` proves the thread start fields used by the sidecar: `cwd`, `approvalPolicy`, `approvalsReviewer`, `sandbox`, `baseInstructions`, `developerInstructions`, `ephemeral`, `experimentalRawEvents`, and `persistExtendedHistory`.
- `protocol/app-server/ts/v2/TurnStartParams.ts` proves `turn/start` takes `{ threadId, input }`.
- `protocol/app-server/ts/v2/UserInput.ts` proves text input shape: `{ type: "text", text, text_elements: [] }`.
- `protocol/app-server/ts/v2/AskForApproval.ts` lists approval policy values: `untrusted`, `on-failure`, `on-request`, `never`, and granular policy objects.
- `protocol/app-server/ts/v2/SandboxMode.ts` lists sandbox request values: `read-only`, `workspace-write`, `danger-full-access`.
- `protocol/app-server/ts/v2/SandboxPolicy.ts` lists returned sandbox policies: `dangerFullAccess`, `readOnly`, `externalSandbox`, `workspaceWrite`.

## Thread start payload used by the MVP

```json
{
  "cwd": "/absolute/workspace/path",
  "approvalPolicy": "on-request",
  "approvalsReviewer": "user",
  "sandbox": "workspace-write",
  "baseInstructions": "pet name + persona + full memory.md contents",
  "developerInstructions": "behavior rules + absolute memory.md path",
  "ephemeral": true,
  "experimentalRawEvents": false,
  "persistExtendedHistory": false
}
```

The smoke response confirmed `ephemeral: true`, `approvalPolicy: "on-request"`, `approvalsReviewer: "user"`, and a returned `workspaceWrite` sandbox.

## Approval routing

The generated server request union proves these approval request methods are possible:

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/permissions/requestApproval`
- legacy `execCommandApproval`
- legacy `applyPatchApproval`

The MVP maps these to a pet UI approval request with `allow once`, `allow for session`, and `deny`. This mapping is implemented in `src-tauri/src/runtime/approvals.rs`. A live destructive approval was not triggered during this run, so the approval UI path remains the highest-risk unproven area.

## Hard blocklists

No separate hard command/tool blocklist was found in generated request types or `codex app-server --help`. The observed control surface is approval policy, sandbox/permissions profile, and the app-server's own managed permission behavior.

## Known unknowns / spec notes

- The current smoke only starts an ephemeral thread; it does not run a paid model turn.
- `workspace-write` may require an approval prompt before the agent can edit `memory.md` under the app support directory, because that path is outside the active workspace. The generated protocol exposes approval requests and additional writable-root grants, but a live memory-write approval still needs dogfood verification.
- The Mac-app-closed check remains to be run manually before calling the dogfood proof complete.
- Approval prompt response shapes are derived from generated types and local mapping tests, but still need one live approval prompt test.
