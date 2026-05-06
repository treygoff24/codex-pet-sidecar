import { useEffect } from "react";

const SHEET_COLS = 8;
const SHEET_ROWS = 9;

type Frame = { row: number; col: number; durationMs: number };
type PetAnimationState = "idle" | "blink" | "talk" | "sleep";

// Idle: long open-eyed dwell punctuated by a soft blink, the way pets actually rest.
const IDLE_FRAMES: Frame[] = [
  { row: 0, col: 0, durationMs: 2200 },
  { row: 0, col: 1, durationMs: 90 },
  { row: 0, col: 2, durationMs: 110 },
  { row: 0, col: 1, durationMs: 90 },
  { row: 0, col: 0, durationMs: 3400 },
  { row: 0, col: 1, durationMs: 90 },
  { row: 0, col: 2, durationMs: 110 },
  { row: 0, col: 1, durationMs: 90 },
];

const TALK_FRAMES: Frame[] = [
  { row: 2, col: 0, durationMs: 130 },
  { row: 2, col: 1, durationMs: 130 },
  { row: 2, col: 2, durationMs: 130 },
  { row: 2, col: 1, durationMs: 130 },
];

const SLEEP_FRAMES: Frame[] = [
  { row: 3, col: 0, durationMs: 700 },
  { row: 3, col: 1, durationMs: 700 },
  { row: 3, col: 2, durationMs: 700 },
  { row: 3, col: 1, durationMs: 700 },
];

const BLINK_FRAMES: Frame[] = [
  { row: 1, col: 0, durationMs: 90 },
  { row: 1, col: 1, durationMs: 110 },
  { row: 1, col: 0, durationMs: 90 },
  { row: 0, col: 0, durationMs: 800 },
];

const FRAME_TABLE = {
  idle: IDLE_FRAMES,
  blink: BLINK_FRAMES,
  talk: TALK_FRAMES,
  sleep: SLEEP_FRAMES,
} satisfies Record<PetAnimationState, Frame[]>;

function bgPosition(frame: Frame): string {
  // Percentage positioning works because background-size matches the full
  // spritesheet and the element matches a single cell.
  return `${(frame.col / (SHEET_COLS - 1)) * 100}% ${(frame.row / (SHEET_ROWS - 1)) * 100}%`;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Drives a sprite element's `background-position` directly via a ref, with
 * per-frame durations. No React re-renders per tick — the element style is
 * mutated imperatively, the way Codex's avatar does it.
 */
export function usePetAnimation(
  ref: React.RefObject<HTMLElement | null>,
  state: PetAnimationState,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const frames = FRAME_TABLE[state];

    if (prefersReducedMotion()) {
      el.style.backgroundPosition = bgPosition(frames[0]);
      return;
    }

    let index = 0;
    let timeout: number | null = null;

    function schedule() {
      const node = ref.current;
      if (!node) return;
      const frame = frames[index];
      node.style.backgroundPosition = bgPosition(frame);
      timeout = window.setTimeout(() => {
        index = (index + 1) % frames.length;
        schedule();
      }, frame.durationMs);
    }

    schedule();

    return () => {
      if (timeout != null) window.clearTimeout(timeout);
    };
  }, [ref, state]);
}
