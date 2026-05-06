---
name: pet-hatching
description: Hatch or validate Codex Pet Sidecar pets using this repository's bundled deterministic hatching scripts, 8x9 atlas contract, image generation workflow, QA assets, and package/import rules.
---

# Pet Hatching for Codex Pet Sidecar

Use this skill when creating, repairing, validating, or packaging a pet for this app.

## Rules

- Use `$imagegen` for all visual generation. Do not fake sprites with local drawing code.
- Use repo-local scripts under `tools/pet-hatching/scripts/`; do not depend on a developer-global hatch-pet skill install.
- Produce an 8x9 atlas at `1536x1872` with `192x208` cells and transparent unused cells.
- Output a package with `pet.json`, `spritesheet.webp`, optional `personality.md`, and QA artifacts.
- Stage output in an explicit `--output-dir` or import folder; never silently write to a developer's global Codex state.
- Do not spend image-generation credits unless the user clearly asked to hatch/generate imagery.

## Workflow

1. Prepare a run:

```bash
python tools/pet-hatching/scripts/prepare_pet_run.py --pet-name "<Name>" --description "<description>" --output-dir hatch-runs/<slug> --force
```

2. Check jobs:

```bash
python tools/pet-hatching/scripts/pet_job_status.py --run-dir hatch-runs/<slug>
```

3. Generate each ready visual job with `$imagegen`, then record the selected image:

```bash
python tools/pet-hatching/scripts/record_imagegen_result.py --run-dir hatch-runs/<slug> --job-id <job-id> --source /absolute/path/to/generated.png
```

4. Finalize and validate:

```bash
python tools/pet-hatching/scripts/finalize_pet_run.py --run-dir hatch-runs/<slug>
python tools/pet-hatching/scripts/validate_atlas.py --atlas hatch-runs/<slug>/final/spritesheet.webp
```

5. Import through the app or `scripts/smoke-skill-workflows.mjs` only after validation passes.
