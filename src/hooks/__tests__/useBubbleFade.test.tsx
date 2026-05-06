import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUBBLE_FADE_MS, BUBBLE_LINGER_MS, useBubbleFade } from "../useBubbleFade";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useBubbleFade", () => {
  it("starts visible and stays there as long as inputs are unchanged", () => {
    const { result } = renderHook(() =>
      useBubbleFade({ source: "hello", isStreaming: false, awaitingReply: false }),
    );

    expect(result.current).toBe("visible");
    act(() => {
      vi.advanceTimersByTime(BUBBLE_LINGER_MS - 1);
    });
    expect(result.current).toBe("visible");
  });

  it("does not start the fade timer while streaming", () => {
    const { result } = renderHook(() =>
      useBubbleFade({ source: "partial", isStreaming: true, awaitingReply: false }),
    );

    act(() => {
      vi.advanceTimersByTime(BUBBLE_LINGER_MS * 2);
    });
    expect(result.current).toBe("visible");
  });

  it("does not start the fade timer while awaiting reply", () => {
    const { result } = renderHook(() =>
      useBubbleFade({ source: "settled", isStreaming: false, awaitingReply: true }),
    );

    act(() => {
      vi.advanceTimersByTime(BUBBLE_LINGER_MS * 2);
    });
    expect(result.current).toBe("visible");
  });

  it("does not start the fade timer when source is empty", () => {
    const { result } = renderHook(() =>
      useBubbleFade({ source: "", isStreaming: false, awaitingReply: false }),
    );

    act(() => {
      vi.advanceTimersByTime(BUBBLE_LINGER_MS * 2);
    });
    expect(result.current).toBe("visible");
  });

  it("transitions visible -> fading -> hidden when settled", () => {
    const { result } = renderHook(() =>
      useBubbleFade({ source: "done", isStreaming: false, awaitingReply: false }),
    );

    act(() => {
      vi.advanceTimersByTime(BUBBLE_LINGER_MS);
    });
    expect(result.current).toBe("fading");

    act(() => {
      vi.advanceTimersByTime(BUBBLE_FADE_MS);
    });
    expect(result.current).toBe("hidden");
  });

  it("resets to visible when new source content arrives mid-fade", () => {
    const { result, rerender } = renderHook(
      (props: { source: string; isStreaming: boolean; awaitingReply: boolean }) =>
        useBubbleFade(props),
      { initialProps: { source: "first", isStreaming: false, awaitingReply: false } },
    );

    act(() => {
      vi.advanceTimersByTime(BUBBLE_LINGER_MS);
    });
    expect(result.current).toBe("fading");

    rerender({ source: "second", isStreaming: false, awaitingReply: false });
    expect(result.current).toBe("visible");
  });

  it("resets to visible when new source content arrives after hide", () => {
    const { result, rerender } = renderHook(
      (props: { source: string; isStreaming: boolean; awaitingReply: boolean }) =>
        useBubbleFade(props),
      { initialProps: { source: "first", isStreaming: false, awaitingReply: false } },
    );

    // Advance through linger + fade in two stages so each effect's cleanup +
    // next state's effect can both run between the two timers firing.
    act(() => {
      vi.advanceTimersByTime(BUBBLE_LINGER_MS);
    });
    act(() => {
      vi.advanceTimersByTime(BUBBLE_FADE_MS);
    });
    expect(result.current).toBe("hidden");

    rerender({ source: "second", isStreaming: false, awaitingReply: false });
    expect(result.current).toBe("visible");
  });

  it("resets to visible when streaming starts again", () => {
    const { result, rerender } = renderHook(
      (props: { source: string; isStreaming: boolean; awaitingReply: boolean }) =>
        useBubbleFade(props),
      { initialProps: { source: "done", isStreaming: false, awaitingReply: false } },
    );

    act(() => {
      vi.advanceTimersByTime(BUBBLE_LINGER_MS);
    });
    expect(result.current).toBe("fading");

    rerender({ source: "done partial", isStreaming: true, awaitingReply: false });
    expect(result.current).toBe("visible");

    act(() => {
      vi.advanceTimersByTime(BUBBLE_LINGER_MS * 2);
    });
    // Stays visible while streaming.
    expect(result.current).toBe("visible");
  });

  it("cancels the linger timer if the user starts awaiting before it fires", () => {
    const { result, rerender } = renderHook(
      (props: { source: string; isStreaming: boolean; awaitingReply: boolean }) =>
        useBubbleFade(props),
      { initialProps: { source: "done", isStreaming: false, awaitingReply: false } },
    );

    act(() => {
      vi.advanceTimersByTime(BUBBLE_LINGER_MS - 100);
    });
    rerender({ source: "done", isStreaming: false, awaitingReply: true });

    act(() => {
      vi.advanceTimersByTime(BUBBLE_LINGER_MS * 2);
    });
    expect(result.current).toBe("visible");
  });
});
