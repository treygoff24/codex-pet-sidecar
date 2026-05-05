import { useEffect, useMemo, useState } from "react";

export type PetAnimationState = "idle" | "blink" | "talk" | "sleep";

const frames: Record<PetAnimationState, number[]> = {
  idle: [0, 1, 2, 1],
  blink: [8, 9, 8, 0],
  talk: [16, 17, 18, 17],
  sleep: [24, 25, 26, 25],
};

export function frameToPosition(frame: number): { column: number; row: number } {
  return { column: frame % 8, row: Math.floor(frame / 8) };
}

export function usePetAnimation(state: PetAnimationState): number {
  const [index, setIndex] = useState(0);
  const sequence = frames[state];
  const intervalMs = state === "talk" ? 130 : state === "sleep" ? 700 : 420;

  useEffect(() => {
    setIndex(0);
    const interval = window.setInterval(() => setIndex((value) => value + 1), intervalMs);
    return () => window.clearInterval(interval);
  }, [intervalMs, state]);

  return useMemo(() => sequence[index % sequence.length], [index, sequence]);
}
