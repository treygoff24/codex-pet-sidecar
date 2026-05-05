---
name: check
description: Run the repo gate (`npm run check` — TypeScript build, Vitest, cargo test) and report pass/fail concisely. Use this before handoff, after a substantive change, or whenever the user asks "is it green?"
---

# /check — repo gate

The gate is `npm run check`. It runs three things in sequence:

1. `npm run build` — `tsc` typecheck + Vite production bundle
2. `npm test` — Vitest run-once (jsdom)
3. `cargo test --manifest-path src-tauri/Cargo.toml` — Rust tests

## How to run

```bash
npm run check
```

Run from the repo root. The first failure stops the chain (npm scripts use `&&`).

## How to report

- If everything passes: one line — "✅ gate green" plus rough timings if you noticed them.
- If a step fails: name the failing step, paste the actual error (not paraphrased), and surface the file:line that broke. Don't summarize past the failure.
- If `cargo test` fails because `codex` isn't on `PATH` (`AppError::CodexNotFound`), call that out specifically — it's an environment issue, not a code regression. The runtime smoke (`npm run smoke:runtime`) and a couple of `runtime::session` tests need the binary.

## Don't

- Don't run `tauri:dev` as part of the gate. It launches the full app and won't terminate cleanly.
- Don't run individual sub-steps in parallel here — the user wants the full sequential gate via this skill. If you want a narrow loop (just Vitest, just one Rust test), use the underlying commands directly without invoking this skill.
- Don't paraphrase compiler errors. Paste them.
