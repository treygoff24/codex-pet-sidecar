import { describe, expect, it } from "vitest";
import {
  DRAG_ANIMATION_THRESHOLD_PX,
  PET_ANIMATION_FRAMES,
  PET_WINDOW_BASE_ANIMATION_PRIORITY,
  IDLE_SLOWDOWN,
  TRANSIENT_REPETITIONS,
  petFrameBackgroundPosition,
  resolveDragAnimation,
  resolvePetAnimationSequence,
  resolvePetWindowAnimation,
  shouldUpdateDragAnimationSample,
  type PetDragAnimationState,
  type PetAnimationState,
} from "../petAnimation";

describe("Codex pet animation contract", () => {
  it("matches the Codex Mac app row and frame counts", () => {
    const expectedCounts = {
      idle: 6,
      "running-right": 8,
      "running-left": 8,
      waving: 4,
      jumping: 5,
      failed: 8,
      waiting: 6,
      running: 6,
      review: 6,
    } satisfies Record<PetAnimationState, number>;

    for (const [state, count] of Object.entries(expectedCounts)) {
      expect(PET_ANIMATION_FRAMES[state as PetAnimationState]).toHaveLength(count);
    }

    expect(PET_ANIMATION_FRAMES.idle.map((frame) => frame.frameDurationMs)).toEqual([
      280, 110, 110, 140, 140, 320,
    ]);
    const runningRightFrames = PET_ANIMATION_FRAMES["running-right"];
    const failedFrames = PET_ANIMATION_FRAMES.failed;
    expect(runningRightFrames[runningRightFrames.length - 1].frameDurationMs).toBe(220);
    expect(failedFrames[failedFrames.length - 1].frameDurationMs).toBe(240);
    expect(IDLE_SLOWDOWN).toBe(6);
    expect(TRANSIENT_REPETITIONS).toBe(3);
    expect(DRAG_ANIMATION_THRESHOLD_PX).toBe(4);
  });

  it("uses Codex-style idle settling after transient animations", () => {
    const running = resolvePetAnimationSequence("running", false);

    expect(running.frames).toHaveLength(24);
    expect(running.loopStartIndex).toBe(18);
    expect(running.frames.slice(0, 6)).toEqual(PET_ANIMATION_FRAMES.running);
    expect(running.frames.slice(6, 12)).toEqual(PET_ANIMATION_FRAMES.running);
    expect(running.frames.slice(12, 18)).toEqual(PET_ANIMATION_FRAMES.running);
    expect(running.frames.slice(18).map((frame) => frame.frameDurationMs)).toEqual([
      1680, 660, 660, 840, 840, 1920,
    ]);
  });

  it("freezes on the first state frame for reduced motion", () => {
    expect(resolvePetAnimationSequence("review", true)).toEqual({
      frames: [PET_ANIMATION_FRAMES.review[0]],
      loopStartIndex: null,
    });
  });

  it("computes background percentages for the fixed 8 by 9 atlas", () => {
    expect(petFrameBackgroundPosition({ rowIndex: 8, columnIndex: 7, frameDurationMs: 1 })).toBe(
      "100% 100%",
    );
    expect(petFrameBackgroundPosition({ rowIndex: 4, columnIndex: 0, frameDurationMs: 1 })).toBe(
      "0% 50%",
    );
  });
});

describe("Codex drag animation sampling", () => {
  it("updates the drag sample when either axis reaches Codex's 4px movement threshold", () => {
    expect(shouldUpdateDragAnimationSample(3, 3)).toBe(false);
    expect(shouldUpdateDragAnimationSample(4, 0)).toBe(true);
    expect(shouldUpdateDragAnimationSample(0, 4)).toBe(true);
    expect(shouldUpdateDragAnimationSample(-4, 0)).toBe(true);
  });

  it("changes directional drag animation only when horizontal movement reaches threshold", () => {
    expect(resolveDragAnimation(undefined, 4)).toBe("running-right");
    expect(resolveDragAnimation(undefined, -4)).toBe("running-left");

    const currentState = "running-right" satisfies PetDragAnimationState;
    expect(resolveDragAnimation(currentState, 3)).toBe("running-right");
    expect(resolveDragAnimation(undefined, 3)).toBeUndefined();
  });
});

describe("pet window animation activation", () => {
  const idleInput = {
    tucked: false,
    isStreaming: false,
    awaitingReply: false,
    hasVisibleReply: false,
    hasUnreadReply: false,
    hasApproval: false,
    hasError: false,
  };

  it("maps sidecar runtime states onto Codex mascot states by priority", () => {
    expect(PET_WINDOW_BASE_ANIMATION_PRIORITY).toEqual([
      "waiting",
      "failed",
      "review",
      "running",
      "idle",
    ]);
    expect(resolvePetWindowAnimation({ ...idleInput, hasError: true })).toBe("failed");
    expect(resolvePetWindowAnimation({ ...idleInput, hasApproval: true })).toBe("waiting");
    expect(resolvePetWindowAnimation({ ...idleInput, awaitingReply: true })).toBe("running");
    expect(resolvePetWindowAnimation({ ...idleInput, isStreaming: true })).toBe("running");
    expect(resolvePetWindowAnimation({ ...idleInput, hasVisibleReply: true })).toBe("review");
    expect(resolvePetWindowAnimation({ ...idleInput, hasUnreadReply: true })).toBe("review");
    expect(resolvePetWindowAnimation({ ...idleInput, tucked: true })).toBe("waiting");
    expect(resolvePetWindowAnimation(idleInput)).toBe("idle");
  });

  it("prioritizes waiting for input over runtime errors like the Codex overlay", () => {
    expect(resolvePetWindowAnimation({ ...idleInput, hasApproval: true, hasError: true })).toBe(
      "waiting",
    );
  });

  it("prioritizes unread review output over running like the Codex notification sorter", () => {
    expect(
      resolvePetWindowAnimation({
        ...idleInput,
        awaitingReply: true,
        hasUnreadReply: true,
      }),
    ).toBe("review");
    expect(
      resolvePetWindowAnimation({
        ...idleInput,
        isStreaming: true,
        hasVisibleReply: true,
      }),
    ).toBe("review");
  });

  it("keeps tucked pets in waiting even when runtime state is also present", () => {
    expect(resolvePetWindowAnimation({ ...idleInput, tucked: true, awaitingReply: true })).toBe(
      "waiting",
    );
    expect(resolvePetWindowAnimation({ ...idleInput, tucked: true, hasError: true })).toBe(
      "waiting",
    );
    expect(resolvePetWindowAnimation({ ...idleInput, tucked: true, hasUnreadReply: true })).toBe(
      "waiting",
    );
  });

  // Guards against drift between PET_WINDOW_BASE_ANIMATION_PRIORITY (consumed by
  // tests/parity verifier) and the if-stair inside resolvePetWindowAnimation
  // (the runtime path). For every higher/lower priority pair we set both
  // states' input flags and assert the higher-priority state wins.
  it("resolves in the order declared by PET_WINDOW_BASE_ANIMATION_PRIORITY", () => {
    const inputForState: Record<
      (typeof PET_WINDOW_BASE_ANIMATION_PRIORITY)[number],
      Partial<typeof idleInput>
    > = {
      waiting: { hasApproval: true },
      failed: { hasError: true },
      review: { hasUnreadReply: true },
      running: { awaitingReply: true },
      idle: {},
    };

    for (const [highIndex, highState] of PET_WINDOW_BASE_ANIMATION_PRIORITY.entries()) {
      // Each state in isolation resolves to itself.
      expect(resolvePetWindowAnimation({ ...idleInput, ...inputForState[highState] })).toBe(
        highState,
      );

      for (const lowState of PET_WINDOW_BASE_ANIMATION_PRIORITY.slice(highIndex + 1)) {
        expect(
          resolvePetWindowAnimation({
            ...idleInput,
            ...inputForState[highState],
            ...inputForState[lowState],
          }),
        ).toBe(highState);
      }
    }
  });
});
