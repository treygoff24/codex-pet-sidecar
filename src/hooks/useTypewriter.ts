import { useEffect, useRef, useState } from "react";

export function nextTypewriterDelay(char: string, charsPerSecond = 50): number {
  const base = 1000 / charsPerSecond;
  return /[.!?]/.test(char) ? base + 120 : base;
}

/**
 * Reveals `text` character-by-character. Streaming-aware: when `text` grows
 * (e.g. via appended `text_delta` events), the typewriter continues from where
 * it left off. It only restarts when the new text is not a prefix-extension of
 * the previous text — i.e. a brand-new turn or a truncation.
 */
export function useTypewriter(text: string, charsPerSecond = 50): string {
  const [visibleLength, setVisibleLength] = useState(0);
  const previousTextRef = useRef("");

  useEffect(() => {
    const prev = previousTextRef.current;
    previousTextRef.current = text;
    // Streaming-append case: keep the current visibleLength so typing continues smoothly.
    if (text.startsWith(prev)) return;
    // New turn or truncation: restart from the beginning.
    setVisibleLength(0);
  }, [text]);

  useEffect(() => {
    if (visibleLength >= text.length) return;
    const nextChar = text[visibleLength] ?? "";
    const timeout = window.setTimeout(
      () => setVisibleLength((value) => Math.min(value + 1, text.length)),
      nextTypewriterDelay(nextChar, charsPerSecond),
    );
    return () => window.clearTimeout(timeout);
  }, [charsPerSecond, text, visibleLength]);

  return text.slice(0, visibleLength);
}
