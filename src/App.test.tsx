import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PetLibrary } from "./domain/petLibrary";
import type { InstalledPet, PetConfig } from "./domain/petConfig";
import type { ApprovalRequest, PetAgentEvent } from "./domain/runtimeEvents";

const runtimeBridgeMock = vi.hoisted(() => ({
  importPet: vi.fn(),
  listInstalledPets: vi.fn(),
  loadPetConfig: vi.fn(),
  loadPetLibrary: vi.fn(),
  onPetEvent: vi.fn(),
  petAssetUrl: vi.fn((path: string) => path),
  pickPetFolder: vi.fn(),
  respondToApproval: vi.fn(),
  savePetConfig: vi.fn(),
  sendUserMessage: vi.fn(),
  setActivePet: vi.fn(),
  setMuteUntil: vi.fn(),
  startHatchingFlow: vi.fn(),
  startPersonalityFlow: vi.fn(),
  startPetRuntime: vi.fn(),
  startWindowDrag: vi.fn(),
  tuckWindowToTab: vi.fn(),
  tuckPet: vi.fn(),
  restorePetWindowFromTab: vi.fn(),
  wakePet: vi.fn(),
}));

vi.mock("./runtimeBridge", () => ({
  runtimeBridge: runtimeBridgeMock,
}));
vi.mock("./hooks/useOfficialUpdater", () => ({
  useOfficialUpdater: () => ({
    state: { enabled: false, status: "disabled", downloadedBytes: 0 },
    checkForUpdates: vi.fn(),
    installUpdate: vi.fn(),
  }),
}));

import App from "./App";

const baseConfig: PetConfig = {
  petId: "olive",
  displayName: "Olive",
  spritesheetPath: "/tmp/olive.webp",
  persona: "friendly",
  mute: {},
  tuck: { tucked: false },
  observers: { activeApp: true, windowTitle: true, workspace: true, idle: true },
  ambient: {
    enabled: false,
    intervalMinutes: 15,
    includeScreenshot: false,
    retainScreenshots: false,
  },
  runtime: { sessionPersistence: "ephemeral", safetyMode: "safe" },
};

const olivePet: InstalledPet = {
  id: "olive",
  displayName: "Olive",
  spritesheetPath: "/tmp/olive.webp",
  metadataPath: "/tmp/pet.json",
  diagnostics: [],
};

const deweyPet: InstalledPet = {
  id: "dewey",
  displayName: "Dewey",
  spritesheetPath: "/tmp/dewey.webp",
  metadataPath: "/tmp/dewey-pet.json",
  diagnostics: [],
};

const library: PetLibrary = {
  activePetId: "olive",
  pets: [
    {
      petId: "olive",
      displayName: "Olive",
      source: { type: "bundled", bundledId: "olive" },
      createdAt: "2026-05-05T00:00:00.000Z",
      updatedAt: "2026-05-05T00:00:00.000Z",
    },
    {
      petId: "dewey",
      displayName: "Dewey",
      source: { type: "imported", originalPath: "/tmp/dewey" },
      createdAt: "2026-05-05T00:00:00.000Z",
      updatedAt: "2026-05-05T00:00:00.000Z",
    },
  ],
};

const approval: ApprovalRequest = {
  requestId: "approval-1",
  toolName: "exec",
  detail: "run command",
  risk: "execute",
  allowForSession: true,
};

describe("App pet animation state wiring", () => {
  let petEventHandler: ((event: PetAgentEvent) => void) | undefined;

  beforeEach(() => {
    petEventHandler = undefined;
    runtimeBridgeMock.importPet.mockResolvedValue(library);
    runtimeBridgeMock.listInstalledPets.mockResolvedValue([olivePet, deweyPet]);
    runtimeBridgeMock.loadPetConfig.mockResolvedValue(baseConfig);
    runtimeBridgeMock.loadPetLibrary.mockResolvedValue(library);
    runtimeBridgeMock.onPetEvent.mockImplementation(
      async (handler: (event: PetAgentEvent) => void) => {
        petEventHandler = handler;
        return vi.fn();
      },
    );
    runtimeBridgeMock.pickPetFolder.mockResolvedValue(null);
    runtimeBridgeMock.respondToApproval.mockResolvedValue(undefined);
    runtimeBridgeMock.savePetConfig.mockResolvedValue(undefined);
    runtimeBridgeMock.sendUserMessage.mockResolvedValue(undefined);
    runtimeBridgeMock.setActivePet.mockResolvedValue(library);
    runtimeBridgeMock.setMuteUntil.mockResolvedValue(undefined);
    runtimeBridgeMock.startHatchingFlow.mockResolvedValue({
      skill: "pet-hatching",
      prompt: "hatch",
    });
    runtimeBridgeMock.startPersonalityFlow.mockResolvedValue({
      skill: "pet-personality",
      prompt: "personality",
    });
    runtimeBridgeMock.startPetRuntime.mockResolvedValue({ sessionId: "session-1" });
    runtimeBridgeMock.startWindowDrag.mockResolvedValue(undefined);
    runtimeBridgeMock.tuckWindowToTab.mockResolvedValue(undefined);
    runtimeBridgeMock.tuckPet.mockResolvedValue({ tucked: true, visible: false });
    runtimeBridgeMock.restorePetWindowFromTab.mockResolvedValue(undefined);
    runtimeBridgeMock.wakePet.mockResolvedValue({ tucked: false, visible: true });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("clears stale errors when a new user turn starts so the sprite returns to running", async () => {
    render(<App />);

    const sprite = await screen.findByLabelText("Olive pet sprite");
    await waitFor(() => expect(petEventHandler).toBeDefined());

    act(() => {
      petEventHandler?.({ type: "error", message: "previous runtime failure" });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 62.5%"));

    fireEvent.change(screen.getByLabelText("Message your pet"), {
      target: { value: "try again" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 87.5%"));
    expect(runtimeBridgeMock.sendUserMessage).toHaveBeenCalledWith("try again");
  });

  it("clears interrupted streaming text before the next turn", async () => {
    render(<App />);

    const sprite = await screen.findByLabelText("Olive pet sprite");
    await waitFor(() => expect(petEventHandler).toBeDefined());

    act(() => {
      petEventHandler?.({ type: "text_delta", text: "partial" });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 87.5%"));

    act(() => {
      petEventHandler?.({ type: "error", message: "stream failed" });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 62.5%"));

    fireEvent.change(screen.getByLabelText("Message your pet"), {
      target: { value: "try again" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    act(() => {
      petEventHandler?.({ type: "text_delta", text: "fresh" });
      petEventHandler?.({ type: "turn_completed" });
    });

    await screen.findByText("fresh");
    expect(screen.queryByText("partialfresh")).not.toBeInTheDocument();
  });

  it("clears stale approval prompts when a runtime error arrives", async () => {
    render(<App />);

    const sprite = await screen.findByLabelText("Olive pet sprite");
    await waitFor(() => expect(petEventHandler).toBeDefined());

    act(() => {
      petEventHandler?.({ type: "approval_request", request: approval });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 75%"));

    act(() => {
      petEventHandler?.({ type: "error", message: "runtime failed" });
    });

    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 62.5%"));
    expect(screen.queryByText("Allow once")).not.toBeInTheDocument();
  });

  it("returns to running after an approval response resumes the turn", async () => {
    render(<App />);

    const sprite = await screen.findByLabelText("Olive pet sprite");
    await waitFor(() => expect(petEventHandler).toBeDefined());

    act(() => {
      petEventHandler?.({ type: "approval_request", request: approval });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 75%"));

    fireEvent.click(screen.getByText("Allow once"));

    await waitFor(() =>
      expect(runtimeBridgeMock.respondToApproval).toHaveBeenCalledWith("approval-1", "allow_once"),
    );
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 87.5%"));
  });

  it("clears stale approvals when a turn completes so review is visible", async () => {
    render(<App />);

    const sprite = await screen.findByLabelText("Olive pet sprite");
    await waitFor(() => expect(petEventHandler).toBeDefined());

    act(() => {
      petEventHandler?.({ type: "approval_request", request: approval });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 75%"));

    act(() => {
      petEventHandler?.({ type: "turn_completed", finalText: "done" });
    });

    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 100%"));
    expect(screen.queryByText("Allow once")).not.toBeInTheDocument();
  });

  it("clears stale runtime state when an ambient message arrives so review is visible", async () => {
    render(<App />);

    const sprite = await screen.findByLabelText("Olive pet sprite");
    await waitFor(() => expect(petEventHandler).toBeDefined());

    act(() => {
      petEventHandler?.({ type: "text_delta", text: "partial" });
      petEventHandler?.({ type: "approval_request", request: approval });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 75%"));

    act(() => {
      petEventHandler?.({ type: "ambient_message", text: "ambient done" });
    });

    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 100%"));
    await screen.findByText("ambient done");
    expect(screen.queryByText("partialambient done")).not.toBeInTheDocument();
    expect(screen.queryByText("Allow once")).not.toBeInTheDocument();
  });

  it("records backend ambient status and workspace observations in the transcript", async () => {
    render(<App />);

    await screen.findByLabelText("Olive pet sprite");
    await waitFor(() => expect(petEventHandler).toBeDefined());

    act(() => {
      petEventHandler?.({
        type: "ambient_status",
        message: "Screenshot awareness is text-only right now: permission denied",
      });
      petEventHandler?.({
        type: "observation",
        digest: {
          type: "workspace",
          cwd: "/repo",
          repoName: "codex-pet-sidecar",
          dirtySummary: "2 modified",
          observedAt: "2026-05-07T00:00:00Z",
        },
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Open transcript" }));

    await screen.findByText("Screenshot awareness is text-only right now: permission denied");
    await screen.findByText("Workspace: codex-pet-sidecar has 2 modified.");
  });

  it("clears stale errors around approval requests and responses", async () => {
    render(<App />);

    const sprite = await screen.findByLabelText("Olive pet sprite");
    await waitFor(() => expect(petEventHandler).toBeDefined());

    act(() => {
      petEventHandler?.({ type: "error", message: "previous failure" });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 62.5%"));

    act(() => {
      petEventHandler?.({ type: "approval_request", request: approval });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 75%"));

    fireEvent.click(screen.getByText("Allow once"));

    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 87.5%"));
  });

  it("keeps pet management chrome off the default pet window", async () => {
    render(<App />);

    await screen.findByLabelText("Olive pet sprite");

    expect(screen.queryByRole("button", { name: "Pets" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tuck" })).not.toBeInTheDocument();
    expect(screen.queryByText("Pet library")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hatch pet" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import pet" })).not.toBeInTheDocument();
  });

  it("tucks into an edge wake tab and wakes from it", async () => {
    render(<App />);

    await screen.findByLabelText("Olive pet sprite");
    fireEvent.click(screen.getByRole("button", { name: "Tuck pet away" }));

    await waitFor(() => expect(runtimeBridgeMock.tuckPet).toHaveBeenCalledWith(null));
    await waitFor(() => expect(runtimeBridgeMock.tuckWindowToTab).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("Olive pet sprite")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Wake pet" }));

    await waitFor(() => expect(runtimeBridgeMock.wakePet).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(runtimeBridgeMock.restorePetWindowFromTab).toHaveBeenCalledTimes(1));
    await screen.findByLabelText("Olive pet sprite");
  });

  it("shows the hatching skill prompt from the onboarding journey", async () => {
    runtimeBridgeMock.loadPetConfig.mockResolvedValue(null);
    runtimeBridgeMock.listInstalledPets.mockResolvedValue([]);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Hatch my own pet with Codex" }));

    await screen.findByText("hatch");
    expect(runtimeBridgeMock.startHatchingFlow).toHaveBeenCalledTimes(1);
  });

  it("imports a staged pet from onboarding and refreshes into the pet window", async () => {
    runtimeBridgeMock.loadPetConfig.mockResolvedValueOnce(null).mockResolvedValue(baseConfig);
    runtimeBridgeMock.listInstalledPets
      .mockResolvedValueOnce([])
      .mockResolvedValue([olivePet, deweyPet]);
    runtimeBridgeMock.pickPetFolder.mockResolvedValue("/tmp/staged-dewey");

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Import existing Codex pet" }));

    await waitFor(() => expect(runtimeBridgeMock.pickPetFolder).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(runtimeBridgeMock.importPet).toHaveBeenCalledWith("/tmp/staged-dewey"),
    );
    await screen.findByLabelText("Olive pet sprite");
  });

  it("lets the user choose an installed pet when no active config is present", async () => {
    const deweyConfig = { ...baseConfig, petId: "dewey", displayName: "Dewey" };
    runtimeBridgeMock.loadPetConfig.mockResolvedValueOnce(null).mockResolvedValue(deweyConfig);
    runtimeBridgeMock.listInstalledPets.mockResolvedValue([olivePet, deweyPet]);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Dewey" }));

    await waitFor(() => expect(runtimeBridgeMock.setActivePet).toHaveBeenCalledWith("dewey"));
    await screen.findByLabelText("Dewey pet sprite");
  });
});
