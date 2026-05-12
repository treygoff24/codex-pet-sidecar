import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HatchingSession, RowKey, RowState } from "../../../domain/hatching";
import type { UseHatchingSession } from "../../../hooks/useHatchingSession";

const useHatchingSessionMock = vi.hoisted(() => vi.fn());
const runtimeBridgeMock = vi.hoisted(() => ({
  hideHatchingWizardWindow: vi.fn(),
  loadPetLibrary: vi.fn(),
  setActivePet: vi.fn(),
}));
const hatchingBridgeMock = vi.hoisted(() => ({
  listOrphanHatchingSessions: vi.fn(),
  pickReferenceImage: vi.fn(),
}));

vi.mock("../../../hooks/useHatchingSession", () => ({
  useHatchingSession: useHatchingSessionMock,
}));

vi.mock("../../../runtimeBridge", () => ({
  runtimeBridge: runtimeBridgeMock,
}));

vi.mock("../../../hatchingBridge", () => ({
  hatchingBridge: hatchingBridgeMock,
}));

import { HatchingWizardApp } from "../HatchingWizardApp";

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

function sessionWithBrief(phase: HatchingSession["phase"]): HatchingSession {
  return {
    ...session(phase),
    brief: {
      displayName: "Moose",
      petId: "moose",
      description: "A good dog",
      personality: ["loyal"],
      palette: null,
      backstory: null,
      speechStyle: null,
      behavioralQuirks: null,
      visualNotes: null,
    },
  };
}

function hook(overrides: Partial<UseHatchingSession> = {}): UseHatchingSession {
  return {
    session: null,
    progress: null,
    isLoading: false,
    error: null,
    isInspiration: false,
    isBrief: false,
    isPrompts: false,
    isPrototype: false,
    isGenerating: false,
    isReview: false,
    isImporting: false,
    isDone: false,
    startNew: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    uploadReferenceImage: vi.fn(),
    submitBrief: vi.fn(),
    confirmBriefChange: vi.fn(),
    draftPromptReview: vi.fn(),
    savePromptDrafts: vi.fn(),
    generatePrototype: vi.fn(),
    revertToIteration: vi.fn(),
    acceptPrototype: vi.fn(),
    regenerateRow: vi.fn(),
    importHatchedPet: vi.fn(),
    ...overrides,
  };
}

function onePetLibrary(count = 1) {
  return {
    activePetId: "olive",
    pets: Array.from({ length: count }, (_, index) => ({
      petId: index === 0 ? "olive" : `pet-${index}`,
      displayName: index === 0 ? "Olive" : `Pet ${index}`,
      source: { type: "imported" as const },
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    })),
  };
}

describe("HatchingWizardApp", () => {
  beforeEach(() => {
    useHatchingSessionMock.mockReset();
    runtimeBridgeMock.hideHatchingWizardWindow.mockReset();
    runtimeBridgeMock.loadPetLibrary.mockReset();
    runtimeBridgeMock.setActivePet.mockReset();
    hatchingBridgeMock.listOrphanHatchingSessions.mockReset();
    hatchingBridgeMock.pickReferenceImage.mockReset();
    runtimeBridgeMock.loadPetLibrary.mockResolvedValue(onePetLibrary());
    runtimeBridgeMock.hideHatchingWizardWindow.mockResolvedValue(undefined);
    runtimeBridgeMock.setActivePet.mockResolvedValue(onePetLibrary());
    hatchingBridgeMock.listOrphanHatchingSessions.mockResolvedValue([]);
  });

  it("starts at the inspiration gallery when there is no session", async () => {
    useHatchingSessionMock.mockReturnValue(hook());

    render(<HatchingWizardApp />);

    expect(await screen.findByText(/Where should we/)).toBeInTheDocument();
    expect(screen.queryByText("Create Your Pet")).not.toBeInTheDocument();
  });

  it("renders the screen for the current phase", async () => {
    useHatchingSessionMock.mockReturnValue(
      hook({ session: session("prototype"), isPrototype: true }),
    );

    render(<HatchingWizardApp />);

    expect(screen.getByText("Prototype Your Pet")).toBeInTheDocument();
    await waitFor(() => expect(hatchingBridgeMock.listOrphanHatchingSessions).toHaveBeenCalled());
  });

  it("drafts prompts when entering Step 3", async () => {
    const draftPromptReview = vi.fn().mockResolvedValue([]);
    useHatchingSessionMock.mockReturnValue(
      hook({
        session: sessionWithBrief("prompts"),
        isPrompts: true,
        draftPromptReview,
      }),
    );

    render(<HatchingWizardApp />);

    expect(screen.getByText(/Codex drafted your/)).toBeInTheDocument();
    await waitFor(() => expect(draftPromptReview).toHaveBeenCalledTimes(1));
  });

  it("auto-starts the first prototype generation when entering Step 4", async () => {
    const generatePrototype = vi.fn().mockResolvedValue(undefined);
    useHatchingSessionMock.mockReturnValue(
      hook({
        session: sessionWithBrief("prototype"),
        isPrototype: true,
        generatePrototype,
      }),
    );

    render(<HatchingWizardApp />);

    expect(screen.getByText(/Making Moose's first/)).toBeInTheDocument();
    expect(screen.queryByText("Prototype Your Pet")).not.toBeInTheDocument();
    await waitFor(() => expect(generatePrototype).toHaveBeenCalledWith(null));
  });

  it("confirms cancel, cancels the session, and closes the window", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    useHatchingSessionMock.mockReturnValue(hook({ session: session("prototype"), cancel }));

    render(<HatchingWizardApp />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(window.confirm).toHaveBeenCalledWith("This will discard the in-progress hatch.");
    expect(cancel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(runtimeBridgeMock.hideHatchingWizardWindow).toHaveBeenCalled());
    vi.mocked(window.confirm).mockRestore();
  });

  it("shows the library-full banner instead of an enabled start button", async () => {
    runtimeBridgeMock.loadPetLibrary.mockResolvedValue(onePetLibrary(20));
    useHatchingSessionMock.mockReturnValue(hook());

    render(<HatchingWizardApp />);

    expect(await screen.findByText("Pet Library is Full")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a starting point" })).toBeDisabled();
  });
});
