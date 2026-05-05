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
- `thread/start` succeeds with `ephemeral: false`
- `approvalPolicy: "never"` is echoed back for YOLO mode
- `approvalsReviewer: "user"` is accepted, though it is not normally used when approval policy is `never`
- `sandbox: "danger-full-access"` is accepted and returned as a `dangerFullAccess` sandbox policy
- `config.model_reasoning_effort: "medium"` is accepted and returned as `reasoningEffort: "medium"`
- response thread has a non-null `path`, confirming the thread is saved on disk

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
- `protocol/app-server/ts/v2/ThreadStartParams.ts` exposes a thread-scoped `config` object used for `model_reasoning_effort` and `mcp_servers.<name>.enabled` overrides.
- `protocol/app-server/ts/v2/SandboxPolicy.ts` lists returned sandbox policies: `dangerFullAccess`, `readOnly`, `externalSandbox`, `workspaceWrite`.

## Thread start payload used by the MVP

```json
{
  "cwd": "/absolute/workspace/path",
  "approvalPolicy": "never",
  "approvalsReviewer": "user",
  "sandbox": "danger-full-access",
  "config": {
    "model_reasoning_effort": "medium",
    "mcp_servers": {
      "pencil": { "enabled": false },
      "porkbun": { "enabled": false },
      "resend": { "enabled": false },
      "serena": { "enabled": false }
    }
  },
  "baseInstructions": "pet name + persona + full memory.md contents",
  "developerInstructions": "behavior rules + absolute memory.md path",
  "ephemeral": false,
  "experimentalRawEvents": false,
  "persistExtendedHistory": true
}
```

The smoke response confirmed `ephemeral: false`, a non-null thread path, `approvalPolicy: "never"`, `approvalsReviewer: "user"`, `reasoningEffort: "medium"`, and a returned `dangerFullAccess` sandbox.

## Approval routing

The generated server request union proves these approval request methods are possible:

- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`
- `item/permissions/requestApproval`
- legacy `execCommandApproval`
- legacy `applyPatchApproval`

The MVP maps these to a pet UI approval request with `allow once`, `allow for session`, and `deny`. This mapping is implemented in `src-tauri/src/runtime/approvals.rs`. Default pet threads run with `approvalPolicy: "never"`, so this UI is currently a fallback path rather than the expected default path.

## Hard blocklists

No separate hard command/tool blocklist was found in generated request types or `codex app-server --help`. The observed control surface is approval policy, sandbox/permissions profile, and the app-server's own managed permission behavior.

## Known unknowns / spec notes

- The current smoke starts and archives a saved thread, but it still does not run a paid model turn.
- Saved pet threads persist under Codex's normal thread history until the user archives/deletes them; this is intentional, but may create clutter if the pet starts many sessions.
- The Mac-app-closed check remains to be run manually before calling the dogfood proof complete.
- The smoke verifies thread-scoped config overrides are accepted for reasoning effort. MCP disablement is sent via the same thread-scoped config object, but the app-server response does not echo an MCP inventory for that thread.
