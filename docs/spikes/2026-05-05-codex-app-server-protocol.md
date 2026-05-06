# Codex App Server Protocol Safety Notes

Protocol snapshot inspection confirms current `thread/start` params include:

- `ephemeral: boolean | null`
- `persistExtendedHistory: boolean`
- `approvalPolicy`: `untrusted`, `on-failure`, `on-request`, granular object, or `never`
- `sandbox`: `read-only`, `workspace-write`, or `danger-full-access`
- `baseInstructions` and `developerInstructions`

Public default should use:

```json
{
  "ephemeral": true,
  "persistExtendedHistory": false,
  "approvalPolicy": "on-request",
  "approvalsReviewer": "user",
  "sandbox": "workspace-write"
}
```

Power mode remains an explicit opt-in path:

```json
{
  "approvalPolicy": "never",
  "sandbox": "danger-full-access"
}
```

If a future Codex CLI rejects the safe combination, the app must fail closed rather than silently starting in Power mode.
