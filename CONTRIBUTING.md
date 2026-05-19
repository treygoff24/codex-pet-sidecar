# Contributing

## Gate tiers

Use the lightest gate that matches the risk while you are developing:

```bash
npm run check:fast     # inner loop: oxlint, TypeScript no-emit, cargo check
npm run check:local    # before task/milestone handoff: fast + format + gentle Vitest + clippy + Rust lib tests
npm run check:full     # final deterministic validation: build + full Vitest + clippy + all Rust tests
npm run check:ci       # pre-merge/CI: full validation + public/artifact audits
```

`npm run check` remains an alias for `npm run check:full` for older docs and muscle memory.

During normal implementation, prefer targeted tests and `check:fast`. Before opening a PR or marking a branch ready for review/merge, run:

```bash
npm run check:ci
```

`check:full` runs the full deterministic pipeline: oxlint, oxfmt, the TypeScript/Vite build, Vitest, clippy, and cargo test. The two `audit:*` scripts in `check:ci` catch private paths, leaked identity terms, and stray local artifacts (generated images, screenshot caches, IDE settings). `check:ci` must be green for a PR to merge, unless the remaining validation is explicitly left to CI and called out in the PR.

If a check fails, fix the issue and rerun the narrow failing gate first. Do not rerun `check:full` or `check:ci` after every small edit; save those for final confidence, CI/pre-merge, and changes that directly require full validation.

If you want to iterate on just the frontend, `npm run dev` runs Vite alone on port 1420.
The public dev channel is the source tree on `main`: update it with `git pull &&
npm ci`, then run `npm run tauri:dev`. Dev builds do not use the official
auto-updater.

For deeper diagnostics, the project includes:

```bash
npm run setup:python             # needed for pet-hatching checks
node scripts/doctor.mjs           # preflight: Node, Cargo, Codex CLI, image-gen
npm run smoke:runtime             # exercise the Codex app-server handshake
node scripts/smoke-skill-workflows.mjs   # check pet-hatching/personality skills
```

## What goes where

`docs/specs` and `docs/skills` are reference material, kept in the public tree.
`docs/plans`, `docs/verification`, and `docs/reviews` are private working notes and are gitignored. If you've drafted a plan, keep it locally; don't commit.

## What not to commit

Generated run artifacts, local screenshots and videos, `dist/`, `node_modules/`, secrets, private local paths, and symlinks pointing outside the repository. The `.gitignore` covers most of it; the audit scripts catch the rest.

## PR conventions

For visible pet or UI changes, include a screenshot or short screen recording when practical. The pet is a visual product; reviewers want to see it.

Commits should be concise and imperative ("Add X", "Fix Y"). The history is short by design; squash if your branch has churn.

## Releases

Official user builds are signed and notarized DMGs published through GitHub
Releases. They include an in-app updater that reads the release manifest attached
to the latest GitHub Release. See [docs/release.md](docs/release.md) for the
maintainer checklist. Packaged release builds need the updater signing key; use
`npm run tauri:dev` for normal dev-channel work.
