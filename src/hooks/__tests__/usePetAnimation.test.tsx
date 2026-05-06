import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import type { PetAnimationState } from "../../domain/petAnimation";
import { usePetAnimation } from "../usePetAnimation";

function AnimatedSprite({ state }: { state: PetAnimationState }) {
  const ref = useRef<HTMLDivElement>(null);
  usePetAnimation(ref, state);
  return <div ref={ref} data-testid="sprite" />;
}

describe("usePetAnimation", () => {
  let reducedMotion = false;
  let mediaListeners: Set<() => void>;

  beforeEach(() => {
    reducedMotion = false;
    mediaListeners = new Set();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        get matches() {
          return reducedMotion;
        },
        addEventListener: (_type: "change", listener: () => void) => {
          mediaListeners.add(listener);
        },
        removeEventListener: (_type: "change", listener: () => void) => {
          mediaListeners.delete(listener);
        },
      })),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("reacts when reduced-motion preference changes while an animation is running", async () => {
    render(<AnimatedSprite state="running" />);

    const sprite = screen.getByTestId("sprite");
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 87.5%"));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 130));
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("14.285714285714285% 87.5%"));

    act(() => {
      reducedMotion = true;
      for (const listener of mediaListeners) listener();
    });

    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 87.5%"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 160));
    });
    expect(sprite.style.backgroundPosition).toBe("0% 87.5%");
  });

  it("restarts from the first frame when the requested state changes", async () => {
    const { rerender } = render(<AnimatedSprite state="running" />);

    const sprite = screen.getByTestId("sprite");
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 87.5%"));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 130));
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("14.285714285714285% 87.5%"));

    rerender(<AnimatedSprite state="review" />);

    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 100%"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 160));
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("14.285714285714285% 100%"));
  });
});
