# Hatching Imagegen Empirical Fixtures

This directory will contain the empirical fixtures captured in Wave 0 Task 0.2.

## Required Fixtures

After running the empirical spike (tools/pet-hatching/scripts/imagegen-pin-spike.mjs), place:

1. `raw-notification.json` - Redacted `RawResponseItemCompletedNotification` payload showing the `image_generation_call` shape
2. `observed-path.txt` - Relative path under `generated_images/` (e.g., `generated_images/<thread-or-flat>/ig_abc123.png`)

## Capture Instructions

See Wave 0 Task 0.2 in docs/plans/2026-05-08-hatching-wizard.md for the full capture procedure.

## Branch Decision

After the fixture is captured, update the plan with:

- "Wave 0 observed Branch A; Wave 2 implements path-first resolution" (if result carries a path)
- "Wave 0 observed Branch B; Wave 2 implements watcher-first resolution" (if result is empty/opaque)
