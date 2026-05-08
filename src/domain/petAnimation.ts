export type PetAnimationState =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

export type PetAnimationFrame = {
  rowIndex: number;
  columnIndex: number;
  frameDurationMs: number;
};

export type PetAnimationSequence = {
  frames: PetAnimationFrame[];
  loopStartIndex: number | null;
};

export type PetWindowAnimationInput = {
  tucked: boolean;
  isStreaming: boolean;
  awaitingReply: boolean;
  hasVisibleReply: boolean;
  hasUnreadReply: boolean;
  hasApproval: boolean;
  hasError: boolean;
};

export type PetDragAnimationState = Extract<PetAnimationState, "running-left" | "running-right">;

export const IDLE_SLOWDOWN = 6;
export const TRANSIENT_REPETITIONS = 3;
export const DRAG_ANIMATION_THRESHOLD_PX = 4;
export const DRAG_DIRECTION_FLIP_THRESHOLD_PX = DRAG_ANIMATION_THRESHOLD_PX * 6;
export const PET_WINDOW_BASE_ANIMATION_PRIORITY = [
  "waiting",
  "failed",
  "review",
  "running",
  "idle",
] as const satisfies readonly PetAnimationState[];

const IDLE_FRAMES: PetAnimationFrame[] = [
  { rowIndex: 0, columnIndex: 0, frameDurationMs: 280 },
  { rowIndex: 0, columnIndex: 1, frameDurationMs: 110 },
  { rowIndex: 0, columnIndex: 2, frameDurationMs: 110 },
  { rowIndex: 0, columnIndex: 3, frameDurationMs: 140 },
  { rowIndex: 0, columnIndex: 4, frameDurationMs: 140 },
  { rowIndex: 0, columnIndex: 5, frameDurationMs: 320 },
];

function rowFrames(
  rowIndex: number,
  frameCount: number,
  frameDurationMs: number,
  finalFrameDurationMs: number,
): PetAnimationFrame[] {
  return Array.from({ length: frameCount }, (_, columnIndex) => ({
    rowIndex,
    columnIndex,
    frameDurationMs: columnIndex === frameCount - 1 ? finalFrameDurationMs : frameDurationMs,
  }));
}

export const PET_ANIMATION_FRAMES = {
  failed: rowFrames(5, 8, 140, 240),
  idle: IDLE_FRAMES,
  jumping: rowFrames(4, 5, 140, 280),
  review: rowFrames(8, 6, 150, 280),
  running: rowFrames(7, 6, 120, 220),
  "running-left": rowFrames(2, 8, 120, 220),
  "running-right": rowFrames(1, 8, 120, 220),
  waving: rowFrames(3, 4, 140, 280),
  waiting: rowFrames(6, 6, 150, 260),
} satisfies Record<PetAnimationState, PetAnimationFrame[]>;

const SLOWED_IDLE_FRAMES = IDLE_FRAMES.map((frame) => ({
  ...frame,
  frameDurationMs: frame.frameDurationMs * IDLE_SLOWDOWN,
}));

function loopsUntilStateChanges(state: PetAnimationState): boolean {
  return state === "running-left" || state === "running-right";
}

export function resolvePetAnimationSequence(
  state: PetAnimationState,
  reducedMotion: boolean,
): PetAnimationSequence {
  const frames = PET_ANIMATION_FRAMES[state];
  if (reducedMotion) return { frames: [frames[0]], loopStartIndex: null };
  if (state === "idle") return { frames: SLOWED_IDLE_FRAMES, loopStartIndex: 0 };
  if (loopsUntilStateChanges(state)) return { frames, loopStartIndex: 0 };

  const transientFrames = Array.from({ length: TRANSIENT_REPETITIONS }, () => frames).flat();
  return {
    frames: [...transientFrames, ...SLOWED_IDLE_FRAMES],
    loopStartIndex: transientFrames.length,
  };
}

export function petFrameBackgroundPosition(frame: PetAnimationFrame): string {
  return `${(frame.columnIndex / 7) * 100}% ${(frame.rowIndex / 8) * 100}%`;
}

// The order of checks below must agree with PET_WINDOW_BASE_ANIMATION_PRIORITY.
// `petAnimation.test.ts` asserts that agreement so the constant (consumed by
// the parity verifier and tests) cannot drift from the runtime resolution.
export function resolvePetWindowAnimation(input: PetWindowAnimationInput): PetAnimationState {
  if (input.hasApproval || input.tucked) return "waiting";
  if (input.hasError) return "failed";
  if (input.hasVisibleReply || input.hasUnreadReply) return "review";
  if (input.awaitingReply || input.isStreaming) return "running";
  return "idle";
}

export function shouldUpdateDragAnimationSample(deltaX: number, deltaY: number): boolean {
  return (
    Math.abs(deltaX) >= DRAG_ANIMATION_THRESHOLD_PX ||
    Math.abs(deltaY) >= DRAG_ANIMATION_THRESHOLD_PX
  );
}

export function resolveDragAnimation(
  currentState: PetDragAnimationState | undefined,
  deltaX: number,
): PetDragAnimationState | undefined {
  if (deltaX >= DRAG_ANIMATION_THRESHOLD_PX) return "running-right";
  if (deltaX <= -DRAG_ANIMATION_THRESHOLD_PX) return "running-left";
  return currentState;
}
