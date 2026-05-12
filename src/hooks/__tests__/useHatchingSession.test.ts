import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GenerationProgress,
  HatchingSession,
  PetBrief,
  RowKey,
  RowState,
} from "../../domain/hatching";

const hatchingBridgeMock = vi.hoisted(() => ({
  acceptPrototype: vi.fn(),
  cancelHatchingRun: vi.fn(),
  confirmBriefChange: vi.fn(),
  generatePrototype: vi.fn(),
  getHatchingState: vi.fn(),
  importHatchedPet: vi.fn(),
  draftPromptReview: vi.fn(),
  savePromptDrafts: vi.fn(),
  regenerateRow: vi.fn(),
  resumeHatchingRun: vi.fn(),
  revertToIteration: vi.fn(),
  startHatchingRun: vi.fn(),
  submitBrief: vi.fn(),
  uploadReferenceImage: vi.fn(),
}));

const eventMock = vi.hoisted(() => ({
  listen: vi.fn(),
}));

vi.mock("../../hatchingBridge", () => ({
  hatchingBridge: hatchingBridgeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: eventMock.listen,
}));

import { useHatchingSession } from "../useHatchingSession";

const brief: PetBrief = {
  displayName: "Moss",
  petId: "moss",
  description: "A small mossy watcher",
  personality: ["quiet"],
  palette: null,
  backstory: null,
  speechStyle: null,
  behavioralQuirks: null,
  visualNotes: null,
};

function session(phase: HatchingSession["phase"]): HatchingSession {
  return {
    id: "session-1",
    runtimeHome: "/tmp/runtime",
    workspace: "/tmp/workspace",
    codexThreadId: null,
    brief: null,
    archetype: null,
    referenceImage: null,
    prototype: null,
    rows: {} as Record<RowKey, RowState>,
    promptDrafts: [],
    runtimeFeed: [],
    atlasReview: null,
    phase,
    createdAt: "2026-05-10T00:00:00.000Z",
  };
}

describe("useHatchingSession", () => {
  beforeEach(() => {
    vi.useRealTimers();
    for (const mock of Object.values(hatchingBridgeMock)) mock.mockReset();
    eventMock.listen.mockReset();
    eventMock.listen.mockResolvedValue(vi.fn());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts empty with false phase predicates", () => {
    const { result } = renderHook(() => useHatchingSession());

    expect(result.current.session).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isInspiration).toBe(false);
    expect(result.current.isBrief).toBe(false);
    expect(result.current.isPrompts).toBe(false);
    expect(result.current.isPrototype).toBe(false);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.isReview).toBe(false);
    expect(result.current.isImporting).toBe(false);
    expect(result.current.isDone).toBe(false);
  });

  it("startNew creates a run then loads session state", async () => {
    hatchingBridgeMock.startHatchingRun.mockResolvedValue("session-1");
    hatchingBridgeMock.getHatchingState.mockResolvedValue(session("inspiration"));

    const { result } = renderHook(() => useHatchingSession());

    await act(async () => {
      await result.current.startNew();
    });

    expect(hatchingBridgeMock.startHatchingRun).toHaveBeenCalledTimes(1);
    expect(hatchingBridgeMock.getHatchingState).toHaveBeenCalledWith("session-1");
    expect(result.current.session?.id).toBe("session-1");
    expect(result.current.isInspiration).toBe(true);
  });

  it("mutators refresh state and update phase predicates", async () => {
    hatchingBridgeMock.startHatchingRun.mockResolvedValue("session-1");
    hatchingBridgeMock.getHatchingState
      .mockResolvedValueOnce(session("inspiration"))
      .mockResolvedValueOnce(session("prompts"));
    hatchingBridgeMock.submitBrief.mockResolvedValue({
      invalidatesIterations: false,
      requiresConfirmation: false,
    });

    const { result } = renderHook(() => useHatchingSession());
    await act(async () => {
      await result.current.startNew();
      await result.current.submitBrief(brief, "cozy-sleeper", null);
    });

    expect(hatchingBridgeMock.submitBrief).toHaveBeenCalledWith(
      "session-1",
      brief,
      "cozy-sleeper",
      null,
    );
    expect(result.current.isPrompts).toBe(true);
  });

  it("drafts and saves prompt review state", async () => {
    const drafts = [
      {
        rowKey: "idle" as const,
        label: "base · idle",
        prompt: "base prompt",
        derivedFrom: null,
        editable: true,
      },
    ];
    hatchingBridgeMock.startHatchingRun.mockResolvedValue("session-1");
    hatchingBridgeMock.getHatchingState
      .mockResolvedValueOnce(session("prompts"))
      .mockResolvedValueOnce({ ...session("prompts"), promptDrafts: drafts })
      .mockResolvedValueOnce(session("prototype"));
    hatchingBridgeMock.draftPromptReview.mockResolvedValue(drafts);
    hatchingBridgeMock.savePromptDrafts.mockResolvedValue(undefined);

    const { result } = renderHook(() => useHatchingSession());
    await act(async () => {
      await result.current.startNew();
      await result.current.draftPromptReview();
      await result.current.savePromptDrafts(drafts);
    });

    expect(hatchingBridgeMock.draftPromptReview).toHaveBeenCalledWith("session-1");
    expect(hatchingBridgeMock.savePromptDrafts).toHaveBeenCalledWith("session-1", drafts);
    expect(result.current.isPrototype).toBe(true);
  });

  it("reconstructs generating phase from progress events", async () => {
    let progressHandler: ((event: { payload: GenerationProgress }) => void) | null = null;
    eventMock.listen.mockImplementation((_eventName: string, handler) => {
      progressHandler = handler;
      return Promise.resolve(vi.fn());
    });
    hatchingBridgeMock.startHatchingRun.mockResolvedValue("session-1");
    hatchingBridgeMock.getHatchingState.mockResolvedValue(session("prototype"));

    const { result } = renderHook(() => useHatchingSession());
    await act(async () => {
      await result.current.startNew();
    });
    await waitFor(() =>
      expect(eventMock.listen).toHaveBeenCalledWith(
        "hatching://progress/session-1",
        expect.any(Function),
      ),
    );

    act(() => {
      progressHandler?.({
        payload: {
          rowsCompleted: 2,
          rowsTotal: 7,
          estimatedRemaining: 180000,
          totalImagegenCalls: 3,
        },
      });
    });

    expect(result.current.isGenerating).toBe(true);
    expect(result.current.progress?.rowsCompleted).toBe(2);
  });

  it("unsubscribes progress listener on unmount", async () => {
    const unlisten = vi.fn();
    eventMock.listen.mockResolvedValue(unlisten);
    hatchingBridgeMock.getHatchingState.mockResolvedValue(session("inspiration"));

    const { unmount } = renderHook(() => useHatchingSession("session-1"));
    await waitFor(() => expect(eventMock.listen).toHaveBeenCalled());

    unmount();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
