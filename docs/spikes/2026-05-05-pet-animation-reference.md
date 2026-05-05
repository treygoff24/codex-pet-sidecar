# Pet animation reference - 2026-05-05

## Asset contract

Codex pet packages are discovered from `${CODEX_HOME:-$HOME/.codex}/pets/`, with a pragmatic fallback to `~/.codex/pets` when the session-level `CODEX_HOME` has no pet folder. Each pet must have:

- `pet.json`
- `spritesheet.webp`
- spritesheet dimensions exactly `1536x1872`
- 8 columns x 9 rows
- frame cell size `192x208`

The Rust pet discovery code validates dimensions and skips malformed pets with diagnostics instead of panicking.

## CSS math

Frame index to background position:

```ts
column = frame % 8
row = Math.floor(frame / 8)
background-position = `${-column * 192}px ${-row * 208}px`
background-size = `1536px 1872px`
```

Implemented in `src/hooks/usePetAnimation.ts` and `src/ui/PetSprite.tsx`.

## MVP frame assumptions

Until a more detailed Codex Mac app frame map is copied over, the MVP uses simple row bands:

- idle: frames `[0, 1, 2, 1]`
- blink: frames `[8, 9, 8, 0]`
- talk: frames `[16, 17, 18, 17]`
- sleep: frames `[24, 25, 26, 25]`

The UI currently selects `talk` while text is streaming and `idle` otherwise. Sleep/blink-specific state exists in the hook but is not yet driven by a full idle timer.

## Feel targets

- Idle frame interval: about 420 ms
- Talk frame interval: about 130 ms while streaming text
- Sleep frame interval: about 700 ms
- Typewriter speed: about 50 chars/sec, with a small pause after sentence punctuation
- Bubble overflow: open the drawer and preserve streamed characters
- Window drag: native Tauri window drag from the pet sprite handle

## Final visual checks

Before dogfooding, manually verify:

- selected pet renders from a real spritesheet, not the fallback face
- talking animation is visibly tied to streaming
- bubble overflow opens the drawer without text loss
- native window drag works and does not make the pet unreachable under the menu bar or Dock
- cadence feels alive but not busy
