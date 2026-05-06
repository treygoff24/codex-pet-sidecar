# Pet animation parity audit - 2026-05-05

## Objective

Improve Codex Pet Sidecar sprite animations until they are at total parity with the
Codex Mac app animations: quality, number of animations, activation of animations,
and animation cadence.

## Evidence used

- Local Codex app bundle: `/Applications/Codex.app/Contents/Resources/app.asar`.
- Extracted Codex avatar implementation: `/tmp/codex-asar-pet/codex-avatar-BpKnWN_W.js`.
- Extracted Codex avatar overlay implementation:
  `/tmp/codex-asar-pet/avatar-overlay-page-Dj9Zinq_.js`.
- Extracted Codex reference spritesheet:
  `/tmp/codex-asar-pet/codex-spritesheet-v4-Bl6P89d_.webp`.
- Bundled Olive spritesheet: `assets/pets/olive/spritesheet.webp`.
- Olive row-7 repair run:
  `output/hatch-pet/olive-row7-repair-live/`.
- Rendered contact sheets:
  - `/tmp/codex-pet-sidecar-codex-contact.png`
  - `/tmp/codex-pet-sidecar-olive-contact.png`
  - `/tmp/codex-pet-sidecar-olive-contact-v2.png` after adding semantic row labels
  - `output/hatch-pet/olive-row7-repair-live/qa/contact-sheet.png` after the
    row-7 repair
- Rendered videos:
  - `/tmp/codex-pet-sidecar-codex-videos/*.mp4`
  - `/tmp/codex-pet-sidecar-olive-videos/*.mp4`

## Prompt-to-artifact checklist

| Requirement                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Status |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Same number of animation states as Codex Mac app | `src/domain/petAnimation.ts` defines all 9 states: `idle`, `running-right`, `running-left`, `waving`, `jumping`, `failed`, `waiting`, `running`, `review`; `src/domain/__tests__/petAnimation.test.ts` checks frame counts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Pass   |
| Same frame counts and timings                    | `src/domain/petAnimation.ts` matches extracted Codex constants: idle 6 frames, directional running 8 each, waving 4, jumping 5, failed 8, waiting/running/review 6; final-frame durations, 6x idle slowdown, and 3 transient repetitions are covered in tests; `npm run verify:codex-animation -- /tmp/codex-asar-pet` compares the local table and cadence constants against the extracted Codex bundle.                                                                                                                                                                                                                                                                                                                                                                | Pass   |
| Same transient playback behavior                 | `resolvePetAnimationSequence` plays non-idle states three times, then settles into slowed idle; tests cover `running` sequence length, loop start, and restarting from frame 0 when the requested state changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Pass   |
| Reduced-motion behavior                          | `resolvePetAnimationSequence(state, true)` returns first frame only; `usePetAnimation` listens for live reduced-motion preference changes and snaps a running animation back to the first frame; tests cover both.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Pass   |
| Same background-position math and atlas sizing   | `petFrameBackgroundPosition` uses Codex 8-column/9-row percentage math; `.pet-sprite` uses `background-size: 800% 900%`, `background-repeat: no-repeat`, `image-rendering: pixelated`, and 192/208 aspect; tests cover bottom-right and midpoint math; `npm run verify:codex-animation -- /tmp/codex-asar-pet` checks CSS atlas-rendering properties against extracted Codex CSS.                                                                                                                                                                                                                                                                                                                                                                                        | Pass   |
| No extra CSS sprite motion                       | `src/styles.css` no longer adds a synthetic breathing transform or animated shadow on top of atlas playback; visible sprite motion now comes from the frame scheduler and atlas states.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Pass   |
| Runtime/UI activation parity                     | `resolvePetWindowAnimation` and `PetWindow` map approval/tucked to `waiting`, error to `failed`, completed visible or unread output to `review`, awaiting reply and streaming text to `running`, hover to `jumping`, drag delta to `running-right`/`running-left`; base priority is now Codex's notification order `waiting > failed > review > running > idle`; completed-output unread state is tracked separately from generic transcript unread state so status/observation lines do not activate `review`; tests cover these activations plus waiting-over-error, review-over-running, tucked-over-runtime, and unread-review persistence; `npm run verify:codex-animation -- /tmp/codex-asar-pet` checks local base priority against the extracted overlay bundle. | Pass   |
| Hover/drag transient priority                    | `PetWindow` keeps hover jumping separate from drag-direction state, so `running-right`/`running-left` survives pointer leave during a drag and clears on local or window-level pointer up/cancel, matching Codex's `transientState ?? hoverJumping ?? baseState` precedence and global pointer-end handling.                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Pass   |
| Drag coordinate parity                           | `PetWindow` now uses finite `screenX`/`screenY` directly, including valid zero values, for drag sampling; it uses the extracted Codex 4px movement threshold, updates the drag sample baseline when either axis reaches that threshold, changes directional animation only when X reaches it, ignores non-primary pointer starts, and avoids falling back to `clientX` at screen edges. `npm run verify:codex-animation -- /tmp/codex-asar-pet` checks the local threshold against the extracted overlay bundle; UI tests cover X threshold, vertical baseline updates, non-primary pointer starts, and valid zero `screenX`.                                                                                                                                            | Pass   |
| Runtime event wiring                             | `src/App.tsx` clears stale errors and interrupted stream text when a new user turn starts or runtime progress arrives, clears stale approval prompts when a runtime error, turn completion, or ambient message arrives, and clears stale errors around approval request/response, preventing old failures from being masked by `waiting`, stale approvals from masking `review`, or stale errors from blocking resumed `running`; text deltas update the streaming ref synchronously so rapid completion still produces review output; switching pets clears in-flight animation state so the next pet starts from idle. `src/App.test.tsx` covers these paths.                                                                                                          | Pass   |
| Atlas contract parity                            | `python tools/pet-hatching/scripts/validate_atlas.py assets/pets/olive/spritesheet.webp` returned ok for dimensions, WebP/RGBA, transparency, and used/unused cells.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Pass   |
| Future hatching prompt parity                    | `tools/pet-hatching/scripts/prepare_pet_run.py` now describes row 7 `running` as active work/thinking while Codex is running, not literal sprinting; smoke run at `/tmp/codex-pet-sidecar-prompt-smoke` confirmed the generated prompt contains that language.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Pass   |
| Manual semantic QA coverage                      | `tools/pet-hatching/references/qa-rubric.md` now requires row 7 to read as active work/thinking, and `tools/pet-hatching/scripts/make_contact_sheet.py` labels row 7 as `active work` in contact sheets.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Pass   |
| Repair pass readiness                            | `docs/spikes/2026-05-05-olive-row7-repair-brief.md` captures the exact row-7 repair prompt, input references, acceptance criteria, and post-repair verification commands. `tools/pet-hatching/scripts/prepare_olive_row7_repair.py` stages a scoped one-job repair run with Olive/Codex row references, and `tools/pet-hatching/scripts/apply_repaired_row.py` applies a completed `running` strip to a candidate atlas. `npm run verify:olive-row7-repair` proves the staged job is ready, applying the current row as a stand-in produces a valid PNG candidate atlas, and non-repaired rows stay pixel-identical without spending imagegen credits.                                                                                                                   | Pass   |
| Bundled Olive art semantic parity                | Trey authorized image generation on 2026-05-06. A scoped `$imagegen` pass produced an Olive row-7 active-work strip with a small terminal/laptop prop, then the selected generated pixels were normalized into six exact 192x208 cells and applied to `assets/pets/olive/spritesheet.webp`. The repaired contact sheet at `output/hatch-pet/olive-row7-repair-live/qa/contact-sheet.png` now shows row 7 as in-place active work rather than dog locomotion.                                                                                                                                                                                                                                                                                                             | Pass   |
| Overall subjective art-quality parity            | Manual contact-sheet inspection after repair shows all nine Olive rows are present, coherent, polished, and semantically aligned with Codex Mac app states. Row 7 now visually rhymes with the Codex active-working laptop row while preserving Olive as the bundled golden-dog pet. No other rows changed during the repair pass.                                                                                                                                                                                                                                                                                                                                                                                                                                       | Pass   |

## Completion decision

The engine, timing, activation, contract, future hatching prompts, and bundled
Olive row-7 art now match the Codex Mac app animation semantics. No known parity
blocker remains after the 2026-05-06 repair pass and verification below.

## Latest verification

- `npx vitest run src/hooks/__tests__/usePetAnimation.test.tsx src/App.test.tsx src/domain/__tests__/petAnimation.test.ts src/ui/__tests__/PetWindowAnimation.test.tsx`
  - 4 files passed, 16 tests passed.
- `npx vitest run src/domain/__tests__/petAnimation.test.ts src/ui/__tests__/PetWindowAnimation.test.tsx`
  - 2 files passed, 15 tests passed after unread-review activation was added.
- `npx vitest run src/ui/__tests__/PetWindowAnimation.test.tsx`
  - 1 file passed, 10 tests passed after hover/drag transient priority was split.
- `npx vitest run src/ui/__tests__/PetWindowAnimation.test.tsx`
  - 1 file passed, 11 tests passed after window-level pointer release clearing was added.
- `npx vitest run src/ui/__tests__/PetWindowAnimation.test.tsx`
  - 1 file passed, 12 tests passed after screen-coordinate drag parity was tightened.
- `npx vitest run src/App.test.tsx`
  - 1 file passed, 2 tests passed after approval-response resume animation was added.
- `npx vitest run src/App.test.tsx`
  - 1 file passed, 3 tests passed after pet-switch animation reset was added.
- `npx vitest run src/App.test.tsx`
  - 1 file passed, 4 tests passed after interrupted-stream reset and synchronous text-delta ref updates.
- `npx vitest run src/App.test.tsx`
  - 1 file passed, 5 tests passed after runtime errors clear stale approval prompts.
- `npx vitest run src/App.test.tsx`
  - 1 file passed, 6 tests passed after approval request/response started clearing stale errors.
- `npx vitest run src/App.test.tsx`
  - 1 file passed, 7 tests passed after turn completion started clearing stale approvals.
- `npx vitest run src/App.test.tsx`
  - 1 file passed, 8 tests passed after ambient messages started clearing stale runtime state.
- `npx vitest run src/ui/__tests__/PetWindowAnimation.test.tsx src/App.test.tsx`
  - 2 files passed, 22 tests passed after completed-output unread state was split from generic transcript unread state.
- `npx vitest run src/domain/__tests__/petAnimation.test.ts src/ui/__tests__/PetWindowAnimation.test.tsx`
  - 2 files passed, 20 tests passed after tucked waiting priority was made consistent.
- `npm run verify:codex-animation -- /tmp/codex-asar-pet && npx vitest run src/domain/__tests__/petAnimation.test.ts src/ui/__tests__/PetWindowAnimation.test.tsx`
  - verified 9 states, CSS atlas rendering, extracted overlay activation priority, and extracted 4px drag threshold; 2 test files passed, 28 tests, after drag sampling was aligned to update on either axis while only X changes directional animation.
- `npm run verify:codex-animation -- /tmp/codex-asar-pet && npx vitest run src/domain/__tests__/petAnimation.test.ts src/hooks/__tests__/usePetAnimation.test.tsx src/ui/__tests__/PetWindowAnimation.test.tsx`
  - verified Codex constants and overlay details; 3 test files passed, 30 tests, after hook coverage was added for state-change animation restart from frame 0.
- `npm run verify:codex-animation -- /tmp/codex-asar-pet && npx vitest run src/domain/__tests__/petAnimation.test.ts`
  - verified 9 states plus idle slowdown 6x and 3 transient repetitions; 1 test file passed, 7 tests.
- `npm run verify:codex-animation -- /tmp/codex-asar-pet`
  - verified 9 states against `/tmp/codex-asar-pet/codex-avatar-BpKnWN_W.js`, CSS atlas rendering against `/tmp/codex-asar-pet/codex-avatar-D82knaKt.css`, activation priority against `/tmp/codex-asar-pet/avatar-overlay-page-Dj9Zinq_.js`, and Codex's 4px drag threshold.
- `npm run verify:olive-row7-repair`
  - staged a temporary one-job Olive row-7 repair run, confirmed one ready `$imagegen` job and zero blocked jobs, applied the current row as a stand-in strip, validated the PNG candidate atlas, and verified all non-repaired rows stayed pixel-identical.
- `npm run verify:animation-parity`
  - combined the Codex animation verifier and Olive row-7 repair workflow verifier into one non-art parity check.
- `npm run format && npm run verify:animation-parity && npm run check`
  - Codex animation verifier passed.
  - Olive row-7 repair workflow verifier passed.
  - oxlint passed with 0 warnings/errors.
  - format check passed.
  - production build passed.
  - Vitest passed: 11 files, 76 tests.
  - Rust clippy passed.
  - Rust tests passed: 52 tests.
- `npm run format && npm run verify:codex-animation -- /tmp/codex-asar-pet && npm run check`
  - oxlint passed with 0 warnings/errors.
  - format check passed.
  - production build passed.
  - Vitest passed: 11 files, 76 tests.
  - Rust clippy passed.
  - Rust tests passed: 52 tests.
- `python tools/pet-hatching/scripts/validate_atlas.py assets/pets/olive/spritesheet.webp`
  - Olive atlas remains valid WebP/RGBA, 1536x1872, no errors or warnings.
- `python tools/pet-hatching/scripts/prepare_olive_row7_repair.py --output-dir /tmp/codex-pet-sidecar-olive-row7-repair-smoke`
  - created a one-job `running` repair run with Olive atlas/current-row references, a layout guide, and a Codex row-7 semantic reference.
- `python tools/pet-hatching/scripts/apply_repaired_row.py --source-atlas assets/pets/olive/spritesheet.webp --row-strip /tmp/codex-pet-sidecar-olive-row7-repair-smoke/references/olive-row7-current.png --state running --run-dir /tmp/codex-pet-sidecar-olive-row7-repair-smoke --output /tmp/codex-pet-sidecar-olive-row7-repair-smoke/final/spritesheet.webp`
  - smoke-applied the current row as a stand-in repaired strip.
- `python tools/pet-hatching/scripts/validate_atlas.py /tmp/codex-pet-sidecar-olive-row7-repair-smoke/final/spritesheet.webp`
  - candidate atlas validation passed with no errors or warnings.
- `python tools/pet-hatching/scripts/pet_job_status.py --run-dir /tmp/codex-pet-sidecar-olive-row7-repair-smoke`
  - confirmed one ready `$imagegen` repair job and no blocked jobs.
- `$imagegen` built-in tool
  - generated the selected row-7 source image at
    `$CODEX_HOME/generated_images/019dfb57-47ce-7ad0-9627-2472f3d1960e/ig_098abea0f3cc38060169fb4da865308191bb71b6da4f1752fb.png`.
- `python tools/pet-hatching/scripts/apply_repaired_row.py --source-atlas assets/pets/olive/spritesheet.webp --row-strip output/hatch-pet/olive-row7-repair-live/generated/running-candidate-2-normalized.png --state running --run-dir output/hatch-pet/olive-row7-repair-live --output output/hatch-pet/olive-row7-repair-live/final/spritesheet.webp`
  - applied the selected generated active-work row to a final candidate atlas.
- `python tools/pet-hatching/scripts/validate_atlas.py output/hatch-pet/olive-row7-repair-live/final/spritesheet.webp --json-out output/hatch-pet/olive-row7-repair-live/final/validation.json`
  - repaired final atlas remained valid WebP/RGBA, 1536x1872, no errors or warnings.
- `python tools/pet-hatching/scripts/make_contact_sheet.py output/hatch-pet/olive-row7-repair-live/final/spritesheet.webp --output output/hatch-pet/olive-row7-repair-live/qa/contact-sheet.png`
  - generated the visual QA contact sheet used for repaired-row inspection.
- `python tools/pet-hatching/scripts/validate_atlas.py assets/pets/olive/spritesheet.webp`
  - bundled Olive atlas remained valid after replacement.
- Pixel-level row-diff check against `HEAD:assets/pets/olive/spritesheet.webp`
  - confirmed only row 7 changed; rows 0, 1, 2, 3, 4, 5, 6, and 8 stayed pixel-identical.

## Next required action

Run the repo gate after the asset replacement:

```bash
npm run format && npm run verify:animation-parity && npm run check
```
