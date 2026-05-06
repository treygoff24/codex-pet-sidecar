import { useEffect, useState } from "react";
import {
  petFrameBackgroundPosition,
  resolvePetAnimationSequence,
  type PetAnimationState,
} from "../domain/petAnimation";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reducedMotion;
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
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sequence = resolvePetAnimationSequence(state, reducedMotion);
    const { frames } = sequence;

    if (frames.length === 1) {
      el.style.backgroundPosition = petFrameBackgroundPosition(frames[0]);
      return;
    }

    let index = 0;
    let timeout: number | null = null;

    function schedule() {
      const node = ref.current;
      if (!node) return;
      const frame = frames[index];
      node.style.backgroundPosition = petFrameBackgroundPosition(frame);
      timeout = window.setTimeout(() => {
        index += 1;
        if (index >= frames.length) {
          if (sequence.loopStartIndex == null) return;
          index = sequence.loopStartIndex;
        }
        schedule();
      }, frame.frameDurationMs);
    }

    schedule();

    return () => {
      if (timeout != null) window.clearTimeout(timeout);
    };
  }, [ref, state, reducedMotion]);
}
