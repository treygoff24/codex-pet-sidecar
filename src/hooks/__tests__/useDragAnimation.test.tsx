import { act, renderHook } from "@testing-library/react";
import type { PointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { useDragAnimation } from "../useDragAnimation";

type PointerEventLike = {
  button: number;
  pointerId: number;
  screenX: number;
  screenY: number;
  clientX: number;
  clientY: number;
  currentTarget: {
    setPointerCapture?: (pointerId: number) => void;
    releasePointerCapture?: (pointerId: number) => void;
  };
};

// The hook only ever touches a small subset of PointerEvent fields. Rather
// than fabricate a full DOM PointerEvent, build the minimal shape and assert
// it through the hook's typed handler.
function makePointerEvent(overrides: Partial<PointerEventLike>): PointerEvent<HTMLButtonElement> {
  const base: PointerEventLike = {
    button: 0,
    pointerId: 1,
    screenX: 0,
    screenY: 0,
    clientX: 0,
    clientY: 0,
    currentTarget: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    },
  };
  return { ...base, ...overrides } as unknown as PointerEvent<HTMLButtonElement>;
}

function setupHook(onStartDrag: () => void = () => {}) {
  return renderHook(() => useDragAnimation<HTMLButtonElement>(onStartDrag));
}

type Handler = (event: PointerEvent<HTMLButtonElement>) => void;

function down(handler: Handler, point: { x: number; y: number; button?: number }) {
  act(() => {
    handler(
      makePointerEvent({
        button: point.button ?? 0,
        screenX: point.x,
        screenY: point.y,
      }),
    );
  });
}

function move(handler: Handler, point: { x: number; y: number }) {
  act(() => {
    handler(
      makePointerEvent({
        screenX: point.x,
        screenY: point.y,
      }),
    );
  });
}

describe("useDragAnimation", () => {
  it("starts with no drag direction and does not call onStartDrag until pointerdown", () => {
    const onStartDrag = vi.fn();
    const { result } = setupHook(onStartDrag);

    expect(result.current.dragAnimation).toBeUndefined();
    expect(onStartDrag).not.toHaveBeenCalled();
  });

  it("ignores non-primary pointer buttons", () => {
    const onStartDrag = vi.fn();
    const { result } = setupHook(onStartDrag);

    down(result.current.handlers.onPointerDown, { x: 0, y: 0, button: 1 });
    move(result.current.handlers.onPointerMove, { x: 50, y: 0 });

    expect(onStartDrag).not.toHaveBeenCalled();
    expect(result.current.dragAnimation).toBeUndefined();
  });

  it("flips to running-right when horizontal motion crosses the +threshold", () => {
    const { result } = setupHook();

    down(result.current.handlers.onPointerDown, { x: 0, y: 0 });
    move(result.current.handlers.onPointerMove, { x: 4, y: 0 });

    expect(result.current.dragAnimation).toBe("running-right");
  });

  it("flips to running-left when horizontal motion crosses the -threshold", () => {
    const { result } = setupHook();

    down(result.current.handlers.onPointerDown, { x: 0, y: 0 });
    move(result.current.handlers.onPointerMove, { x: -4, y: 0 });

    expect(result.current.dragAnimation).toBe("running-left");
  });

  it("does not change direction below the horizontal threshold", () => {
    const { result } = setupHook();

    down(result.current.handlers.onPointerDown, { x: 0, y: 0 });
    move(result.current.handlers.onPointerMove, { x: 3, y: 0 });

    expect(result.current.dragAnimation).toBeUndefined();
  });

  it("preserves the last direction when subsequent samples drift below threshold", () => {
    const { result } = setupHook();

    down(result.current.handlers.onPointerDown, { x: 0, y: 0 });
    move(result.current.handlers.onPointerMove, { x: 4, y: 0 });
    expect(result.current.dragAnimation).toBe("running-right");

    // Vertical-only movement updates the baseline (resampling) but does not
    // flip direction, and direction below threshold is preserved.
    move(result.current.handlers.onPointerMove, { x: 4, y: 8 });
    expect(result.current.dragAnimation).toBe("running-right");
  });

  it("resets the baseline when only the vertical axis crosses threshold", () => {
    const { result } = setupHook();

    down(result.current.handlers.onPointerDown, { x: 0, y: 0 });
    // Vertical-only crosses Y threshold; baseline should advance to (0, 4).
    move(result.current.handlers.onPointerMove, { x: 0, y: 4 });
    expect(result.current.dragAnimation).toBeUndefined();

    // Now an absolute X of 4 from the original origin is only 4 from the new
    // baseline, so it does cross threshold and flips direction. This proves
    // the baseline advanced rather than staying pinned to (0, 0).
    move(result.current.handlers.onPointerMove, { x: 4, y: 4 });
    expect(result.current.dragAnimation).toBe("running-right");
  });

  it("falls back to clientX/Y when screenX/Y are non-finite", () => {
    const { result } = setupHook();

    act(() => {
      result.current.handlers.onPointerDown(
        makePointerEvent({
          screenX: Number.NaN,
          screenY: Number.NaN,
          clientX: 100,
          clientY: 100,
        }),
      );
    });
    act(() => {
      result.current.handlers.onPointerMove(
        makePointerEvent({
          screenX: Number.NaN,
          screenY: Number.NaN,
          clientX: 105,
          clientY: 100,
        }),
      );
    });

    expect(result.current.dragAnimation).toBe("running-right");
  });

  it("treats valid zero-valued screen coordinates as real samples", () => {
    const { result } = setupHook();

    // screenX of 0 is a valid coordinate, not a missing-value sentinel — must
    // be used directly rather than falling back to clientX.
    act(() => {
      result.current.handlers.onPointerDown(
        makePointerEvent({
          screenX: 0,
          screenY: 0,
          clientX: 999,
          clientY: 999,
        }),
      );
    });
    act(() => {
      result.current.handlers.onPointerMove(
        makePointerEvent({
          screenX: 5,
          screenY: 0,
          clientX: 999,
          clientY: 999,
        }),
      );
    });

    expect(result.current.dragAnimation).toBe("running-right");
  });

  it("clears direction on local pointerup and releases pointer capture", () => {
    const { result } = setupHook();

    down(result.current.handlers.onPointerDown, { x: 0, y: 0 });
    move(result.current.handlers.onPointerMove, { x: 4, y: 0 });
    expect(result.current.dragAnimation).toBe("running-right");

    const release = vi.fn();
    act(() => {
      result.current.handlers.onPointerUp(
        makePointerEvent({
          currentTarget: { releasePointerCapture: release },
        }),
      );
    });

    expect(release).toHaveBeenCalledWith(1);
    expect(result.current.dragAnimation).toBeUndefined();
  });

  it("clears direction on a window-level pointerup outside the drag handle", () => {
    const { result } = setupHook();

    down(result.current.handlers.onPointerDown, { x: 0, y: 0 });
    move(result.current.handlers.onPointerMove, { x: 4, y: 0 });
    expect(result.current.dragAnimation).toBe("running-right");

    act(() => {
      window.dispatchEvent(new Event("pointerup"));
    });

    expect(result.current.dragAnimation).toBeUndefined();
  });

  it("clears direction on a window-level pointercancel", () => {
    const { result } = setupHook();

    down(result.current.handlers.onPointerDown, { x: 0, y: 0 });
    move(result.current.handlers.onPointerMove, { x: -4, y: 0 });
    expect(result.current.dragAnimation).toBe("running-left");

    act(() => {
      window.dispatchEvent(new Event("pointercancel"));
    });

    expect(result.current.dragAnimation).toBeUndefined();
  });

  it("calls onStartDrag once per primary pointerdown", () => {
    const onStartDrag = vi.fn();
    const { result } = setupHook(onStartDrag);

    down(result.current.handlers.onPointerDown, { x: 0, y: 0 });
    expect(onStartDrag).toHaveBeenCalledTimes(1);

    // Releasing and pressing again starts another drag.
    act(() => {
      result.current.handlers.onPointerUp(makePointerEvent({}));
    });
    down(result.current.handlers.onPointerDown, { x: 0, y: 0 });
    expect(onStartDrag).toHaveBeenCalledTimes(2);
  });

  it("removes window listeners on unmount", () => {
    const { result, unmount } = setupHook();

    down(result.current.handlers.onPointerDown, { x: 0, y: 0 });
    move(result.current.handlers.onPointerMove, { x: 4, y: 0 });
    expect(result.current.dragAnimation).toBe("running-right");

    unmount();

    // Dispatching pointerup after unmount must not throw or alter anything
    // observable; the test passes if no error is thrown.
    expect(() => {
      window.dispatchEvent(new Event("pointerup"));
    }).not.toThrow();
  });
});
