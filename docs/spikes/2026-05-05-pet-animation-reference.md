# Pet animation reference - 2026-05-05

## Asset contract

Public sidecar pet packages are discovered from bundled resources and the app-owned sidecar pet library. Each pet must have:

- `pet.json`
- `spritesheet.webp`
- spritesheet dimensions exactly `1536x1872`
- 8 columns x 9 rows
- frame cell size `192x208`

The Rust pet discovery code validates dimensions and skips malformed pets with diagnostics instead of panicking.

## CSS math

Frame index to background position:

```ts
column = frame.columnIndex
row = frame.rowIndex
background-position = `${(column / 7) * 100}% ${(row / 8) * 100}%`
background-size = `800% 900%`
```

Implemented in `src/hooks/usePetAnimation.ts` and `src/ui/PetSprite.tsx`.

## Codex Mac app frame map

The animation map in `src/domain/petAnimation.ts` is grounded in the local Codex Mac app
avatar bundle (`/Applications/Codex.app/Contents/Resources/app.asar`, extracted asset
`webview/assets/codex-avatar-*.js` on 2026-05-05).

Recheck the copied constants against an extracted Codex app bundle with:

```bash
npx --yes @electron/asar extract \
  /Applications/Codex.app/Contents/Resources/app.asar \
  /tmp/codex-asar-pet
npm run verify:codex-animation
```

| Row | State         | Used columns | Durations                       |
| --- | ------------- | -----------: | ------------------------------- |
| 0   | idle          |          0-5 | 280, 110, 110, 140, 140, 320 ms |
| 1   | running-right |          0-7 | 120 ms each, final 220 ms       |
| 2   | running-left  |          0-7 | 120 ms each, final 220 ms       |
| 3   | waving        |          0-3 | 140 ms each, final 280 ms       |
| 4   | jumping       |          0-4 | 140 ms each, final 280 ms       |
| 5   | failed        |          0-7 | 140 ms each, final 240 ms       |
| 6   | waiting       |          0-5 | 150 ms each, final 260 ms       |
| 7   | running       |          0-5 | 120 ms each, final 220 ms       |
| 8   | review        |          0-5 | 150 ms each, final 280 ms       |

Codex slows the idle loop by 6x. Non-idle states play three passes of their state row,
then settle into the slowed idle loop unless the state changes again. Reduced-motion mode
shows only the first frame of the requested state.

## Sidecar activation map

- `waiting`: approval prompt is pending, or the pet is tucked. As in the Codex
  overlay, needs-input status takes priority over failed/error status.
- `failed`: setup/runtime error is visible and no higher-priority approval prompt is pending.
- `review`: completed output is visible or still unread in the transcript. This
  mirrors Codex's unread-turn status more closely than tying review only to the
  speech bubble's auto-hide window. Generic transcript entries such as status
  lines or observations do not activate review by themselves.
- `running`: the sidecar has an in-progress runtime turn, including both waiting for
  the first token and actively streaming reply text. Despite the state name, Codex's
  visual row reads as active work/thinking, not literal locomotion. Codex's
  notification sorter gives unread review output higher base-state priority than
  running output.
- `waving`: available in the Codex spritesheet, but not selected by the overlay
  status reducer for normal in-progress, waiting, failed, or review notifications.
- `jumping`: pointer hover over the pet, matching the Codex avatar hover behavior.
- `running-right` / `running-left`: drag motion over the pet, selected from horizontal
  screen-coordinate delta once movement reaches Codex's 4px threshold. The drag
  sample baseline updates when either X or Y reaches that threshold, but the
  directional animation changes only when X reaches it. Non-primary pointer starts
  are ignored.
- `idle`: default.

Codex base notification priority is `waiting > failed > review > running > idle`.
Hover and drag are separate transient mascot states and override the selected base state.

## Feel targets

- Idle: Codex's 6-frame row at 6x duration.
- Transient states: three row passes, then slowed idle.
- Typewriter speed: about 50 chars/sec, with a small pause after sentence punctuation
- Bubble overflow: open the drawer and preserve streamed characters
- Window drag: native Tauri window drag from the pet sprite handle

## Final visual checks

Before dogfooding, manually verify:

- selected pet renders from a real spritesheet, not the fallback face
- streaming text and awaiting reply both activate running; approval activates waiting; errors activate failed
- completed visible or unread reply activates review
- hover activates jumping
- horizontal drag activates running-left and running-right
- bubble overflow opens the drawer without text loss
- native window drag works and does not make the pet unreachable under the menu bar or Dock
- cadence feels alive but not busy
