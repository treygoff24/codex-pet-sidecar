import { useEffect, useMemo, useState } from "react";

export function nextTypewriterDelay(char: string, charsPerSecond = 50): number {
  const base = 1000 / charsPerSecond;
  return /[.!?]/.test(char) ? base + 120 : base;
}

export function useTypewriter(text: string, charsPerSecond = 50): string {
  const [visibleLength, setVisibleLength] = useState(0);

  useEffect(() => {
    setVisibleLength(0);
  }, [text]);

  useEffect(() => {
    if (visibleLength >= text.length) return;
    const nextChar = text[visibleLength] ?? "";
    const timeout = window.setTimeout(() => setVisibleLength((value) => Math.min(value + 1, text.length)), nextTypewriterDelay(nextChar, charsPerSecond));
    return () => window.clearTimeout(timeout);
  }, [charsPerSecond, text, visibleLength]);

  return useMemo(() => text.slice(0, visibleLength), [text, visibleLength]);
}
