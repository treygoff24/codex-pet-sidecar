import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import {
  DRAG_DIRECTION_FLIP_THRESHOLD_PX,
  resolveDragAnimation,
  shouldUpdateDragAnimationSample,
  type PetDragAnimationState,
} from "../domain/petAnimation";

type PointerScreenPoint = { x: number; y: number };

// Codex's overlay samples drag motion in screen coordinates, falling back to
// client coordinates only when screen* is non-finite. clientX/Y at screen
// edges can pin to 0 or the viewport bound and confuse the direction sampler.
function pointerScreenPoint(event: PointerEvent<HTMLElement>): PointerScreenPoint {
  return {
    x: Number.isFinite(event.screenX) ? event.screenX : event.clientX,
    y: Number.isFinite(event.screenY) ? event.screenY : event.clientY,
  };
}

function oppositeDirection(direction: PetDragAnimationState): PetDragAnimationState {
  return direction === "running-right" ? "running-left" : "running-right";
}

export type DragAnimationHandlers<T extends HTMLElement> = {
  onPointerDown: (event: PointerEvent<T>) => void;
  onPointerMove: (event: PointerEvent<T>) => void;
  onPointerUp: (event: PointerEvent<T>) => void;
  onPointerCancel: (event: PointerEvent<T>) => void;
};

export type UseDragAnimationResult<T extends HTMLElement> = {
  dragAnimation: PetDragAnimationState | undefined;
  handlers: DragAnimationHandlers<T>;
};

/**
 * Tracks drag direction (`running-left` / `running-right`) for the pet window
 * by sampling pointer screen coordinates against Codex's 4px movement
 * threshold. Returns the current drag-driven animation state plus the four
 * pointer handlers to attach to the drag surface.
 *
 * The hook also installs a window-level `pointerup` listener so that releasing
 * the pointer outside the drag handle still clears the direction state.
 * Native window dragging can emit `pointercancel` while the drag is still in
 * progress, so cancel is intentionally not treated as a drag end.
 *
 * `onStartDrag` is invoked on primary-button pointerdown so the host can
 * begin OS-level window dragging (e.g. Tauri's `start_drag`) without the
 * hook needing to know about that side effect.
 */
export function useDragAnimation<T extends HTMLElement = HTMLElement>(
  onStartDrag: () => Promise<void> | void,
): UseDragAnimationResult<T> {
  const [dragAnimation, setDragAnimation] = useState<PetDragAnimationState>();
  const dragScreenPointRef = useRef<PointerScreenPoint | null>(null);
  const dragAnimationRef = useRef<PetDragAnimationState | undefined>(undefined);
  const oppositeTravelRef = useRef(0);

  const setDragDirection = useCallback((direction: PetDragAnimationState | undefined) => {
    dragAnimationRef.current = direction;
    setDragAnimation(direction);
  }, []);

  const clearDragAnimation = useCallback(() => {
    dragScreenPointRef.current = null;
    oppositeTravelRef.current = 0;
    setDragDirection(undefined);
  }, [setDragDirection]);

  useEffect(() => {
    window.addEventListener("pointerup", clearDragAnimation);
    return () => {
      window.removeEventListener("pointerup", clearDragAnimation);
    };
  }, [clearDragAnimation]);

  const onPointerDown = useCallback(
    (event: PointerEvent<T>) => {
      // Ignore non-primary buttons — right-click and middle-click should not
      // start a drag (matches Codex's `event.button === 0` guard).
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragScreenPointRef.current = pointerScreenPoint(event);
      oppositeTravelRef.current = 0;
      setDragDirection(undefined);
      void onStartDrag();
    },
    [onStartDrag, setDragDirection],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<T>) => {
      const previousPoint = dragScreenPointRef.current;
      if (previousPoint == null) return;
      const nextPoint = pointerScreenPoint(event);
      const deltaX = nextPoint.x - previousPoint.x;
      const deltaY = nextPoint.y - previousPoint.y;
      // Either-axis threshold updates the sample baseline, but only horizontal
      // motion at threshold affects facing direction (vertical-only motion
      // still resets the baseline so the next horizontal probe is fresh).
      if (!shouldUpdateDragAnimationSample(deltaX, deltaY)) return;
      dragScreenPointRef.current = nextPoint;

      const sampledDirection = resolveDragAnimation(undefined, deltaX);
      if (sampledDirection == null) {
        oppositeTravelRef.current = 0;
        return;
      }

      const currentDirection = dragAnimationRef.current;
      if (currentDirection == null) {
        oppositeTravelRef.current = 0;
        setDragDirection(sampledDirection);
        return;
      }

      if (sampledDirection === currentDirection) {
        oppositeTravelRef.current = 0;
        return;
      }

      oppositeTravelRef.current += Math.abs(deltaX);
      if (oppositeTravelRef.current >= DRAG_DIRECTION_FLIP_THRESHOLD_PX) {
        oppositeTravelRef.current = 0;
        setDragDirection(oppositeDirection(currentDirection));
      }
    },
    [setDragDirection],
  );

  const onPointerEnd = useCallback(
    (event: PointerEvent<T>) => {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      clearDragAnimation();
    },
    [clearDragAnimation],
  );

  return {
    dragAnimation,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: () => {},
    },
  };
}
