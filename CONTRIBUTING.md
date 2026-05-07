# Contributing

## Repo gate

Before opening a PR, run:

```bash
npm run check
npm run audit:public
npm run audit:artifacts
```

`npm run check` runs the full pipeline: oxlint, oxfmt, the TypeScript build, Vitest, clippy, and cargo test. The two `audit:*` scripts catch private paths, leaked identity terms, and stray local artifacts (generated images, screenshot caches, IDE settings). Both must be green for a PR to merge.

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
