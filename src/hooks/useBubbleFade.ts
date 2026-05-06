import { useEffect, useState } from "react";

export type BubbleFadeState = "visible" | "fading" | "hidden";

export const BUBBLE_LINGER_MS = 12_000;
export const BUBBLE_FADE_MS = 600;

/**
 * Coordinates the three-phase lifecycle of Olive's lingering speech bubble:
 *
 * 1. `visible`  — bubble is fully shown.
 * 2. `fading`   — content has been settled for {@link BUBBLE_LINGER_MS}; CSS
 *                 transitions opacity to 0 over {@link BUBBLE_FADE_MS}.
 * 3. `hidden`   — fade complete; component should stop rendering the bubble.
 *
 * Any change in source/streaming/awaiting state snaps back to `visible` and
 * restarts the linger timer.
 */
export function useBubbleFade(input: {
  source: string;
  isStreaming: boolean;
  awaitingReply: boolean;
}): BubbleFadeState {
  const { source, isStreaming, awaitingReply } = input;
  const [state, setState] = useState<BubbleFadeState>("visible");

  // Reset to visible whenever the bubble's situation changes — new content,
  // start/stop of streaming, or start/stop of waiting.
  useEffect(() => {
    setState("visible");
  }, [source, isStreaming, awaitingReply]);

  // Linger phase: only run while content is settled (not streaming, not
  // awaiting) and we're still in `visible`. Cleanup cancels the timer if any
  // input changes mid-linger.
  useEffect(() => {
    if (!source || isStreaming || awaitingReply) return;
    if (state !== "visible") return;
    const linger = setTimeout(() => setState("fading"), BUBBLE_LINGER_MS);
    return () => clearTimeout(linger);
  }, [source, isStreaming, awaitingReply, state]);

  // Fade phase: schedule the transition to hidden once fading begins.
  useEffect(() => {
    if (state !== "fading") return;
    const finish = setTimeout(() => setState("hidden"), BUBBLE_FADE_MS);
    return () => clearTimeout(finish);
  }, [state]);

  return state;
}
