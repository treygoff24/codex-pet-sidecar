# Olive row 7 repair brief - 2026-05-05

## Purpose

Repair only Olive's row 7 `running` animation so the bundled sample pet matches
the Codex Mac app's visual semantics: row 7 means "Codex is actively
working/thinking," not literal locomotion.

Trey explicitly authorized image generation on 2026-05-06 and the repair pass was
executed in `output/hatch-pet/olive-row7-repair-live/`.

## Current issue

- Current bundled asset: `assets/pets/olive/spritesheet.webp`.
- Previous row 7 visual: Olive ran like a dog.
- Repaired row 7 visual: Olive works in place with a small terminal/laptop prop.
- Codex Mac app row 7 visual: the mascot is actively working with a small
  computer-like prop.
- Engine/timing/state activation parity is already implemented. This brief is
  only for the remaining bundled art semantic gap.

## Input references

Use these during the repair pass:

- Olive atlas: `assets/pets/olive/spritesheet.webp`
- Olive contact sheet with semantic row labels:
  `/tmp/codex-pet-sidecar-olive-contact-v2.png`
- Codex reference contact sheet: `/tmp/codex-pet-sidecar-codex-contact.png`
- Codex reference videos: `/tmp/codex-pet-sidecar-codex-videos/running.mp4`
- Olive current videos: `/tmp/codex-pet-sidecar-olive-videos/running.mp4`

If the `/tmp` artifacts are missing, regenerate them:

```bash
python tools/pet-hatching/scripts/make_contact_sheet.py \
  assets/pets/olive/spritesheet.webp \
  --output /tmp/codex-pet-sidecar-olive-contact-v2.png \
  --scale 1

python tools/pet-hatching/scripts/make_contact_sheet.py \
  /tmp/codex-asar-pet/codex-spritesheet-v4-Bl6P89d_.webp \
  --output /tmp/codex-pet-sidecar-codex-contact.png \
  --scale 1

python tools/pet-hatching/scripts/render_animation_videos.py \
  assets/pets/olive/spritesheet.webp \
  --output-dir /tmp/codex-pet-sidecar-olive-videos \
  --loops 2 \
  --scale 1

python tools/pet-hatching/scripts/render_animation_videos.py \
  /tmp/codex-asar-pet/codex-spritesheet-v4-Bl6P89d_.webp \
  --output-dir /tmp/codex-pet-sidecar-codex-videos \
  --loops 2 \
  --scale 1
```

## Repair prompt

Use the scoped repo-local repair workflow and `$imagegen`. Keep the change scoped
to row 7 only.

Stage the repair run:

```bash
python tools/pet-hatching/scripts/prepare_olive_row7_repair.py
python tools/pet-hatching/scripts/pet_job_status.py --run-dir <printed-run-dir>
```

Then run `$imagegen` with `<printed-run-dir>/prompts/rows/running.md` and the
input images listed by `pet_job_status.py`. Record the selected generated image:

```bash
python tools/pet-hatching/scripts/record_imagegen_result.py \
  --run-dir <printed-run-dir> \
  --job-id running \
  --source "$CODEX_HOME/generated_images/.../ig_*.png"
```

```text
Create a replacement row 7 `running` strip for Olive, the bundled Codex Pet
Sidecar sample pet.

Use the current Olive atlas/contact sheet as the identity reference. Preserve
Olive exactly: golden dog, same face, ears, scarf, body proportions, palette,
thick dark pixel-style outline, limited flat cel shading, compact chibi pet
sprite readability.

The row is named `running` because Codex is running, not because Olive should
literally sprint. Replace the current dog-locomotion row with an active
work/thinking loop like the Codex Mac app row 7.

Make exactly 6 complete 192x208-style frames in one horizontal strip. Each frame
must show Olive doing focused work: tiny typing/tapping motion, focused eyes,
small head/ear movement, and optionally a tiny laptop, terminal tile, notebook,
or tablet physically attached to or overlapping Olive's pose. The prop must be
small, inside each frame slot, unreadable, and consistent across all frames.

Do not add readable code, text, UI panels, floating icons, speech bubbles,
thought bubbles, speed lines, dust, shadows, detached effects, scenery, or
background. Do not redesign Olive. Do not crop any part of Olive or the prop.
Keep a flat chroma-key background suitable for extraction.

The final animation should read at pet size as "Olive is actively working while
Codex is running" and should settle cleanly into idle when the state finishes.
```

## Acceptance criteria

- Row 7 has exactly 6 frames.
- Row 7 no longer reads as locomotion/sprinting.
- Row 7 reads as active work/thinking at 192x208 pet size.
- Olive identity is preserved.
- The atlas remains exactly `1536x1872`, WebP/PNG with alpha, 8 columns by 9
  rows, and unused cells transparent.
- No other rows regress.

## Verification after repair

Executed repair artifact:

- Selected generated source:
  `$CODEX_HOME/generated_images/019dfb57-47ce-7ad0-9627-2472f3d1960e/ig_098abea0f3cc38060169fb4da865308191bb71b6da4f1752fb.png`
- Normalized strip applied to the atlas:
  `output/hatch-pet/olive-row7-repair-live/generated/running-candidate-2-normalized.png`
- Final repaired atlas candidate:
  `output/hatch-pet/olive-row7-repair-live/final/spritesheet.webp`
- Visual QA contact sheet:
  `output/hatch-pet/olive-row7-repair-live/qa/contact-sheet.png`

The bundled `assets/pets/olive/spritesheet.webp` was replaced with the repaired
atlas after validation. A pixel-level row comparison against the pre-repair
`HEAD` asset confirmed only row 7 changed.

Reference commands:

Run:

```bash
python tools/pet-hatching/scripts/apply_repaired_row.py \
  --source-atlas assets/pets/olive/spritesheet.webp \
  --row-strip <printed-run-dir>/decoded/running.png \
  --state running \
  --run-dir <printed-run-dir> \
  --output <printed-run-dir>/final/spritesheet.png

python tools/pet-hatching/scripts/validate_atlas.py <printed-run-dir>/final/spritesheet.png

python tools/pet-hatching/scripts/validate_atlas.py assets/pets/olive/spritesheet.webp
python tools/pet-hatching/scripts/make_contact_sheet.py assets/pets/olive/spritesheet.webp --output /tmp/codex-pet-sidecar-olive-contact-repaired.png --scale 1
python tools/pet-hatching/scripts/render_animation_videos.py assets/pets/olive/spritesheet.webp --output-dir /tmp/codex-pet-sidecar-olive-videos-repaired --loops 2 --scale 1
npm run check
```

Use PNG for the first candidate review because it preserves all non-repaired rows
pixel-exactly. After visual acceptance, convert/save the accepted atlas to WebP
for the bundled asset path, then rerun the validation/contact-sheet/video commands
against `assets/pets/olive/spritesheet.webp`.

Then compare:

- `/tmp/codex-pet-sidecar-olive-contact-repaired.png`
- `/tmp/codex-pet-sidecar-olive-videos-repaired/running.mp4`
- `/tmp/codex-pet-sidecar-codex-videos/running.mp4`
